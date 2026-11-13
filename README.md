# Google Sheets Project and Payment Tracker

An Apps Script that turns a normal Google Sheet into a project and payment tracker. You enter data in one tab, and it builds a portfolio summary and a per-project view from it.

The data here is dummy data. I built a similar tracker at work; I can't share that, so I rebuilt the idea with made-up data.

## Why I made this

Small teams often track projects in a shared sheet that gets messy over time. Status is typed in different ways, dates are in different formats, nobody notices overdue tasks, and payments that are due are not followed up. Then someone spends hours every week making a status update by hand.

## What it does

`Code.gs` sets up and maintains the tracker inside Google Sheets. No other software is needed.

- One data tab, "Projects". Each row is a Deliverable, a Blocker or a Payment, with client, owner, start and due dates, status, amount and paid-on date.
- Dropdowns for type, status and owner, date checks on date columns, and fixed number and date formats.
- Overdue items (past due date and not done or not paid) turn red automatically.
- A "Portfolio Summary" tab with:
  - counts of active projects, open items, overdue items, open blockers, payments pending and amount pending
  - item counts by status and type
  - progress for each project (deliverables done, % complete, open blockers, overdue, payments pending, next due date)
  - all overdue items with days late
  - payments not yet received
- A "Project View" tab. Pick a project from the dropdown and see its deliverables, blockers and payments.
- A "Tracker" menu with Rebuild summary, Rebuild project view, Add sample data and an optional daily auto-refresh.

The weekly status update becomes one click, or runs by itself every morning.

## How to run

1. Create a blank Google Sheet.
2. Go to Extensions > Apps Script.
3. Delete the existing code, paste everything from `Code.gs` and save.
4. Choose `setupTracker` in the function dropdown and click Run. Allow access to the sheet when Google asks.
5. Go back to the sheet. You will see the Projects, Portfolio Summary and Project View tabs with sample rows, and a Tracker menu (refresh the page if the menu doesn't show).
6. Replace the sample rows with your own data and use Tracker > Rebuild summary.

## Notes

- Tracker > Refresh summary every morning rebuilds the summary daily.
- To start from the CSV instead: run `setupTracker`, clear the sample rows, then File > Import `sample_data/projects_sample.csv` into the Projects tab ("Replace data at selected cell" on A1) and rebuild the summary.
- Uses FILTER, SORT, COUNTIFS and SUMIFS formulas, conditional formatting and time-driven triggers.
