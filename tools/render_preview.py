"""
Builds docs/preview.png - an ILLUSTRATIVE mock-up of the "Portfolio Summary" tab.

Google Sheets screenshots can't be generated automatically, so this script
re-creates the same summary logic as Code.gs in Python, using
sample_data/projects_sample.csv, lays it out like a spreadsheet in HTML and
screenshots it with headless Chrome.

Run:  python tools/render_preview.py
"""
import csv
import datetime as dt
import html
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV = ROOT / "sample_data" / "projects_sample.csv"
OUT_HTML = ROOT / "docs" / "preview.html"
OUT_PNG = ROOT / "docs" / "preview.png"
TODAY = dt.date(2026, 11, 2)  # the sample data is dated relative to this day
STATUSES = ["Not Started", "In Progress", "Blocked", "Done"]
TYPES = ["Deliverable", "Blocker", "Payment"]
CHROME = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", "google-chrome", "chromium", "chrome"]


def load():
    rows = []
    with open(CSV, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            for k in ("Start", "Due", "Paid On"):
                r[k] = dt.date.fromisoformat(r[k]) if r[k] else None
            r["Amount"] = float(r["Amount"]) if r["Amount"] else 0
            rows.append(r)
    return rows


def closed(r):
    return r["Status"] == "Done" or (r["Type"] == "Payment" and r["Paid On"])


def fmt_d(d):
    return d.strftime("%d-%b-%Y") if d else ""


def fmt_n(n):
    return f"{n:,.0f}"


def build():
    items = load()
    projects = list(dict.fromkeys(r["Project"] for r in items))
    open_ = [r for r in items if not closed(r)]
    overdue = sorted([r for r in open_ if r["Due"] and r["Due"] < TODAY], key=lambda r: r["Due"])
    pending = sorted([r for r in items if r["Type"] == "Payment" and not r["Paid On"]], key=lambda r: r["Due"])
    blockers = [r for r in open_ if r["Type"] == "Blocker"]

    # Each grid row = list of (text, css class) for columns B..J (A is a narrow margin)
    grid = []
    E = ("", "")

    def row(cells=(), height=""):
        cells = list(cells) + [E] * (9 - len(cells))
        grid.append((cells, height))

    row([("Portfolio Summary", "title")], "tall")
    row([(f"Last rebuilt {TODAY.strftime('%d %b %Y')}, 08:00  |  Tracker &rarr; Rebuild summary to refresh", "muted")])
    row()
    kpis = [("Active projects", len(projects)), ("Open items", len([r for r in open_ if r["Type"] != "Payment"])),
            ("Overdue items", len(overdue)), ("Open blockers", len(blockers)),
            ("Payments pending", len(pending)), ("Amount pending", fmt_n(sum(r["Amount"] for r in pending)))]
    row([(k, "kpi-l") for k, _ in kpis])
    row([(str(v), "kpi-v red" if k == "Overdue items" else "kpi-v") for k, v in kpis], "kpi")
    row()

    def section(t):
        row([(t, "sec")] + [("", "sec")] * 8)

    def head(cols):
        row([(c, "hd") for c in cols])

    section("Items by status")
    head(["Status"] + TYPES + ["Total"])
    for s in STATUSES:
        c = [sum(1 for r in items if r["Status"] == s and r["Type"] == t) for t in TYPES]
        row([(s, "")] + [(str(x), "num") for x in c] + [(str(sum(c)), "num b")])
    row()

    section("Project progress")
    head(["Project", "Client", "Owner", "Deliverables done", "Progress", "Open blockers", "Overdue",
          "Payments pending", "Next due"])
    for p in projects:
        its = [r for r in items if r["Project"] == p]
        d = [r for r in its if r["Type"] == "Deliverable"]
        done = sum(1 for r in d if r["Status"] == "Done")
        nxt = min((r["Due"] for r in its if not closed(r) and r["Due"]), default=None)
        ob = sum(1 for r in its if r["Type"] == "Blocker" and not closed(r))
        od = sum(1 for r in overdue if r["Project"] == p)
        pa = sum(r["Amount"] for r in its if r["Type"] == "Payment" and not r["Paid On"])
        pct = done / len(d) if d else 0
        row([(p, "b"), (its[0]["Client"], ""), (its[0]["Owner"], ""), (f"{done} of {len(d)}", ""),
             (f"{pct:.0%}", "num green" if pct == 1 else "num"),
             (str(ob), "num red b" if ob else "num"), (str(od), "num red b" if od else "num"),
             (fmt_n(pa), "num red b" if pa else "num"), (fmt_d(nxt), "")])
    row()

    section("Overdue items")
    head(["Project", "Client", "Type", "Item", "Due", "Days late", "Status", "Owner"])
    for r in overdue:
        row([(r["Project"], "od"), (r["Client"], "od"), (r["Type"], "od"), (r["Item"], "od"),
             (fmt_d(r["Due"]), "od"), (str((TODAY - r["Due"]).days), "od num"), (r["Status"], "od"), (r["Owner"], "od")])
    row()

    section("Payments pending")
    head(["Project", "Client", "Milestone", "Amount", "Due", "Status", "Owner"])
    for r in pending:
        row([(r["Project"], ""), (r["Client"], ""), (r["Item"], ""), (fmt_n(r["Amount"]), "num"),
             (fmt_d(r["Due"]), "red" if r["Due"] < TODAY else ""), (r["Status"], ""), (r["Owner"], "")])
    return grid


def render(grid):
    letters = "ABCDEFGHIJ"
    widths = [24, 160, 88, 150, 170, 100, 100, 92, 120, 96]
    cols = "".join(f'<col style="width:{w}px">' for w in [44] + widths)
    hdr = "<tr><th class='corner'></th>" + "".join(
        f"<th class='{'sel' if L == 'B' else ''}'>{L}</th>" for L in letters) + "</tr>"
    body = []
    for i, (cells, h) in enumerate(grid, 1):
        tds = ["<td></td>"]
        for text, cls in cells:
            tds.append(f"<td class='{cls}'>{text if '&' in text else html.escape(text)}</td>")
        body.append(f"<tr class='{h}'><td class='rn'>{i}</td>{''.join(tds)}</tr>")
    filler = len(grid)
    for i in range(filler + 1, filler + 4):
        body.append(f"<tr><td class='rn'>{i}</td>" + "<td></td>" * 10 + "</tr>")

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tracker preview</title>
<style>
:root {{ --navy:#1B2A49; --teal:#0F9D8F; --line:#E2E3E3; --red:#C0392B; }}
* {{ box-sizing:border-box; margin:0; padding:0; }}
body {{ width:1240px; background:#fff; font-family:Arial, "Segoe UI", sans-serif; font-size:12.5px; color:#202124; }}
.caption {{ background:var(--navy); color:#fff; padding:10px 18px; font-size:13px; display:flex; justify-content:space-between; }}
.caption b {{ color:#7FD6CC; letter-spacing:.08em; text-transform:uppercase; font-size:12px; }}
.chrome {{ background:#F9FBFD; border-bottom:1px solid #DADCE0; padding:10px 16px 6px; }}
.doc {{ display:flex; align-items:center; gap:10px; }}
.logo {{ width:26px; height:34px; background:#1E8E3E; border-radius:3px; position:relative; }}
.logo::after {{ content:""; position:absolute; left:6px; right:6px; top:12px; height:12px; border:2px solid #fff; border-radius:1px; }}
.docname {{ font-size:17px; color:#202124; }}
.menus {{ display:flex; gap:16px; font-size:13.5px; color:#444; margin:4px 0 0 36px; }}
.menus .tracker {{ background:#E3F4F2; color:var(--navy); font-weight:bold; padding:0 8px; border-radius:4px; }}
.fbar {{ display:flex; align-items:center; border-bottom:1px solid #DADCE0; height:30px; font-size:12.5px; }}
.fbar .ref {{ width:90px; padding-left:12px; border-right:1px solid #DADCE0; height:100%; display:flex; align-items:center; }}
.fbar .fx {{ padding-left:12px; color:#5f6368; }}
table {{ border-collapse:collapse; table-layout:fixed; width:1240px; }}
th {{ background:#F8F9FA; color:#5f6368; font-weight:normal; height:22px; border:1px solid #DADCE0; font-size:11.5px; }}
th.sel {{ background:#D3E3FD; color:#0B57D0; font-weight:bold; }}
td {{ height:23px; border-right:1px solid #F1F1F1; border-bottom:1px solid #F1F1F1; padding:0 6px; white-space:nowrap; overflow:hidden; }}
td.rn {{ background:#F8F9FA; color:#5f6368; text-align:center; border:1px solid #DADCE0; font-size:11.5px; padding:0; }}
tr.tall td {{ height:36px; }}
tr.kpi td {{ height:40px; }}
.title {{ font-size:20px; font-weight:bold; color:var(--navy); overflow:visible; }}
.muted {{ color:#6B7280; overflow:visible; }}
.kpi-l {{ background:#F5F7FA; color:#6B7280; font-size:10.5px; font-weight:bold; border-top:3px solid var(--teal); }}
.kpi-v {{ background:#F5F7FA; color:var(--navy); font-size:21px; font-weight:bold; }}
.sec {{ color:var(--navy); font-weight:bold; font-size:14px; border-bottom:2px solid var(--teal) !important; overflow:visible; }}
.hd {{ background:var(--navy); color:#fff; font-weight:bold; font-size:11.5px; }}
.num {{ text-align:right; }}
.b {{ font-weight:bold; }}
.red {{ color:var(--red); }}
.green {{ background:#E3F4F2; color:#0B6E64; font-weight:bold; }}
.od {{ background:#FDECEA; color:var(--red); }}
.tabs {{ display:flex; align-items:center; gap:2px; background:#F8F9FA; border-top:1px solid #DADCE0; padding:0 12px; height:36px; font-size:13px; }}
.tabs span {{ padding:8px 16px; color:#444; }}
.tabs .plus {{ color:#5f6368; font-size:18px; padding:4px 10px; }}
.tabs .on {{ background:#E1F1EF; color:var(--teal); font-weight:bold; border-bottom:3px solid var(--teal); }}
.tabs .navy {{ border-bottom:3px solid var(--navy); }}
</style></head><body>
<div class="caption"><b>Illustrative preview</b><span>HTML mock-up of the &ldquo;Portfolio Summary&rdquo; tab built by Code.gs &middot; fictional sample data</span></div>
<div class="chrome">
  <div class="doc"><div class="logo"></div><div class="docname">Project &amp; Payment Tracker (sample)</div></div>
  <div class="menus"><span>File</span><span>Edit</span><span>View</span><span>Insert</span><span>Format</span><span>Data</span><span>Tools</span><span>Extensions</span><span>Help</span><span class="tracker">Tracker &#9662;</span></div>
</div>
<div class="fbar"><div class="ref">B2</div><div class="fx"><i>fx</i>&nbsp;&nbsp; Portfolio Summary</div></div>
<table><colgroup>{cols}</colgroup><thead>{hdr}</thead><tbody>{''.join(body)}</tbody></table>
<div class="tabs"><span class="plus">+</span><span class="navy">Projects</span><span class="on">Portfolio Summary</span><span>Project View</span></div>
</body></html>"""


def main():
    grid = build()
    OUT_HTML.parent.mkdir(exist_ok=True)
    OUT_HTML.write_text(render(grid), encoding="utf-8")
    chrome = next((c for c in CHROME if Path(c).exists() or shutil.which(c)), None)
    if not chrome:
        raise SystemExit("Chrome not found - open docs/preview.html in a browser instead.")
    height = 205 + 23 * (len(grid) + 3) + 40
    subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    f"--window-size=1240,{height}", f"--screenshot={OUT_PNG}", OUT_HTML.as_uri()],
                   check=True, capture_output=True, timeout=120)
    print("Wrote", OUT_PNG)


if __name__ == "__main__":
    main()
