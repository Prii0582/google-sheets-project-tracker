/**
 * Project & Payment Tracker for Google Sheets
 * --------------------------------------------
 * Turns one simple data tab ("Projects") into:
 *   - "Portfolio Summary" : counts by status, per-project progress,
 *                           overdue items and payments still pending
 *   - "Project View"      : pick a project from a dropdown and see its
 *                           deliverables, blockers and payments
 *
 * Set-up (one time):
 *   1. Create a new Google Sheet.
 *   2. Extensions -> Apps Script, delete the sample code, paste this file, Save.
 *   3. Choose the function "setupTracker" and press Run (approve permissions).
 *   4. Back in the sheet use the new menu:  Tracker -> Rebuild summary
 *
 * All sample rows are fictional.
 */

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const SHEETS = {
  DATA: 'Projects',
  SUMMARY: 'Portfolio Summary',
  VIEW: 'Project View',
  LISTS: '_Lists',               // hidden helper tab for dropdown values
};

const HEADERS = ['Project', 'Client', 'Owner', 'Type', 'Item', 'Start', 'Due',
                 'Status', 'Amount', 'Paid On', 'Notes'];
const COL = {};                  // COL.Project = 1, COL.Client = 2, ...
HEADERS.forEach((h, i) => { COL[h.replace(/\s/g, '')] = i + 1; });

const TYPES = ['Deliverable', 'Blocker', 'Payment'];
const STATUSES = ['Not Started', 'In Progress', 'Blocked', 'Done'];
const OWNERS = ['Owner 1', 'Owner 2', 'Owner 3'];

const COLOURS = {
  navy: '#1B2A49', teal: '#0F9D8F', tealSoft: '#E3F4F2', grey: '#F5F7FA',
  line: '#D9DEE7', red: '#C0392B', redSoft: '#FDECEA', amberSoft: '#FFF4D6',
  greenSoft: '#E3F4F2', muted: '#6B7280',
};

const DATE_FMT = 'dd-mmm-yyyy';
const NUM_FMT = '#,##0';

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Tracker')
    .addItem('Rebuild summary', 'rebuildSummary')
    .addItem('Rebuild project view', 'rebuildProjectView')
    .addSeparator()
    .addItem('Set up tracker (first time)', 'setupTracker')
    .addItem('Add sample data', 'addSampleData')
    .addItem('Refresh summary every morning', 'installDailyRefresh')
    .addToUi();
}

// ---------------------------------------------------------------------------
// One-time set-up
// ---------------------------------------------------------------------------
function setupTracker() {
  const ss = SpreadsheetApp.getActive();
  const data = getOrCreate_(ss, SHEETS.DATA);

  // Header row
  data.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  styleHeader_(data.getRange(1, 1, 1, HEADERS.length));
  data.setFrozenRows(1);
  setWidths_(data, [170, 110, 95, 105, 260, 100, 100, 105, 95, 100, 240]);

  if (data.getLastRow() < 2) addSampleData();

  applyDataRules_(data);
  rebuildLists_();
  rebuildSummary();
  rebuildProjectView();
  onOpen();

  ss.setActiveSheet(ss.getSheetByName(SHEETS.SUMMARY));
  toast_('Tracker is ready. Add or edit rows in "' + SHEETS.DATA + '", then use Tracker -> Rebuild summary.');
}

/** Dropdowns, number formats and conditional formatting on the data tab. */
function applyDataRules_(sh) {
  const rows = Math.max(sh.getMaxRows() - 1, 500);
  if (sh.getMaxRows() < rows + 1) sh.insertRowsAfter(sh.getMaxRows(), rows + 1 - sh.getMaxRows());
  const col = c => sh.getRange(2, c, rows, 1);

  const list = values => SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true).setAllowInvalid(false).build();
  const date = SpreadsheetApp.newDataValidation()
    .requireDate().setAllowInvalid(false).setHelpText('Enter a date, e.g. 15-Jan-2026').build();

  col(COL.Type).setDataValidation(list(TYPES));
  col(COL.Status).setDataValidation(list(STATUSES));
  col(COL.Owner).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(OWNERS, true).setAllowInvalid(true).build());   // other names allowed
  [COL.Start, COL.Due, COL.PaidOn].forEach(c => col(c).setDataValidation(date).setNumberFormat(DATE_FMT));
  col(COL.Amount).setNumberFormat(NUM_FMT);

  // Conditional formatting: overdue rows, blocked items, done items, paid payments
  const all = sh.getRange(2, 1, rows, HEADERS.length);
  const due = colLetter_(COL.Due), st = colLetter_(COL.Status),
        ty = colLetter_(COL.Type), paid = colLetter_(COL.PaidOn);
  const overdue = `=AND($${due}2<>"",$${due}2<TODAY(),$${st}2<>"Done",$${paid}2="")`;

  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(overdue)
      .setBackground(COLOURS.redSoft).setFontColor(COLOURS.red).setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=OR($${st}2="Done",AND($${ty}2="Payment",$${paid}2<>""))`)
      .setFontColor('#7A8494').setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Blocked')
      .setBackground(COLOURS.amberSoft).setBold(true).setRanges([col(COL.Status)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Blocker')
      .setFontColor(COLOURS.red).setBold(true).setRanges([col(COL.Type)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Payment')
      .setFontColor(COLOURS.teal).setBold(true).setRanges([col(COL.Type)]).build(),
  ]);
  sh.setTabColor(COLOURS.navy);
}

/** Fictional example rows so the tracker can be tried straight away. */
function addSampleData() {
  const sh = getOrCreate_(SpreadsheetApp.getActive(), SHEETS.DATA);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = days => new Date(t.getTime() + days * 86400000);

  const rows = [
    // Project,            Client,     Owner,    Type,          Item,                              Start,   Due,     Status,        Amount, Paid On, Notes
    ['Website Revamp',     'Client A', 'Owner 1', 'Deliverable', 'Design mock-ups',                d(-60),  d(-40),  'Done',        '',     '',      ''],
    ['Website Revamp',     'Client A', 'Owner 1', 'Deliverable', 'Build & test pages',             d(-40),  d(-5),   'In Progress', '',     '',      'Two pages left'],
    ['Website Revamp',     'Client A', 'Owner 1', 'Deliverable', 'Go-live',                        d(-5),   d(10),   'Not Started', '',     '',      ''],
    ['Website Revamp',     'Client A', 'Owner 1', 'Blocker',     'Waiting for final content',      d(-12),  d(-3),   'Blocked',     '',     '',      'Client to send copy'],
    ['Website Revamp',     'Client A', 'Owner 1', 'Payment',     'Milestone 1 - design sign-off',  d(-40),  d(-30),  'Done',        40000,  d(-28),  ''],
    ['Website Revamp',     'Client A', 'Owner 1', 'Payment',     'Milestone 2 - go-live',          d(10),   d(25),   'Not Started', 60000,  '',      ''],
    ['Data Migration',     'Client B', 'Owner 2', 'Deliverable', 'Source data audit',              d(-50),  d(-35),  'Done',        '',     '',      ''],
    ['Data Migration',     'Client B', 'Owner 2', 'Deliverable', 'Migrate master data',            d(-35),  d(-10),  'In Progress', '',     '',      ''],
    ['Data Migration',     'Client B', 'Owner 2', 'Deliverable', 'User acceptance testing',        d(-10),  d(14),   'Not Started', '',     '',      ''],
    ['Data Migration',     'Client B', 'Owner 2', 'Blocker',     'Access to legacy system',        d(-20),  d(-8),   'In Progress', '',     '',      'IT ticket raised'],
    ['Data Migration',     'Client B', 'Owner 2', 'Payment',     'Advance',                        d(-50),  d(-45),  'Done',        25000,  d(-44),  ''],
    ['Data Migration',     'Client B', 'Owner 2', 'Payment',     'On completion',                  d(-10),  d(-2),   'In Progress', 50000,  '',      'Invoice sent'],
    ['Reporting Dashboard','Client C', 'Owner 3', 'Deliverable', 'KPI definitions agreed',         d(-30),  d(-20),  'Done',        '',     '',      ''],
    ['Reporting Dashboard','Client C', 'Owner 3', 'Deliverable', 'Dashboard v1',                   d(-20),  d(5),    'In Progress', '',     '',      ''],
    ['Reporting Dashboard','Client C', 'Owner 3', 'Deliverable', 'Training session',               d(5),    d(20),   'Not Started', '',     '',      ''],
    ['Reporting Dashboard','Client C', 'Owner 3', 'Payment',     'Phase 1',                        d(-20),  d(-6),   'In Progress', 30000,  '',      'Follow up with accounts'],
    ['Mobile App Pilot',   'Client D', 'Owner 1', 'Deliverable', 'Requirements workshop',          d(-15),  d(-7),   'Done',        '',     '',      ''],
    ['Mobile App Pilot',   'Client D', 'Owner 1', 'Deliverable', 'Prototype',                      d(-7),   d(21),   'In Progress', '',     '',      ''],
    ['Mobile App Pilot',   'Client D', 'Owner 1', 'Blocker',     'Device list not confirmed',      d(-5),   d(3),    'Not Started', '',     '',      ''],
    ['Mobile App Pilot',   'Client D', 'Owner 1', 'Payment',     'Pilot fee',                      d(0),    d(30),   'Not Started', 20000,  '',      ''],
    ['Process Automation', 'Client E', 'Owner 2', 'Deliverable', 'Process mapping',                d(-90),  d(-70),  'Done',        '',     '',      ''],
    ['Process Automation', 'Client E', 'Owner 2', 'Deliverable', 'Automation scripts',             d(-70),  d(-30),  'Done',        '',     '',      ''],
    ['Process Automation', 'Client E', 'Owner 2', 'Deliverable', 'Handover & documentation',       d(-30),  d(-15),  'Done',        '',     '',      ''],
    ['Process Automation', 'Client E', 'Owner 2', 'Payment',     'Final payment',                  d(-15),  d(-5),   'Done',        35000,  d(-4),   ''],
  ];
  const start = Math.max(sh.getLastRow(), 1) + 1;
  sh.getRange(start, 1, rows.length, HEADERS.length).setValues(rows);
}

// ---------------------------------------------------------------------------
// Portfolio Summary (rebuilt from the data each time)
// ---------------------------------------------------------------------------
function rebuildSummary() {
  const ss = SpreadsheetApp.getActive();
  const items = readItems_();
  const today = startOfToday_();
  const sh = resetSheet_(ss, SHEETS.SUMMARY, 1);

  const projects = unique_(items.map(r => r.Project));
  const open = items.filter(r => !isClosed_(r));
  const overdue = open.filter(r => r.Due && r.Due < today)
                      .sort((a, b) => a.Due - b.Due);
  const pending = items.filter(r => r.Type === 'Payment' && !r.PaidOn)
                       .sort((a, b) => (a.Due || 0) - (b.Due || 0));
  const pendingAmt = pending.reduce((s, r) => s + (Number(r.Amount) || 0), 0);
  const blockers = open.filter(r => r.Type === 'Blocker');

  // Title
  sh.getRange('B2').setValue('Portfolio Summary').setFontSize(18).setFontWeight('bold').setFontColor(COLOURS.navy);
  sh.getRange('B3').setValue('Last rebuilt ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'dd MMM yyyy, HH:mm') +
    '  |  Tracker -> Rebuild summary to refresh').setFontColor(COLOURS.muted);

  // KPI tiles (label row 5, value row 6)
  const kpis = [
    ['Active projects', projects.length],
    ['Open items', open.filter(r => r.Type !== 'Payment').length],
    ['Overdue items', overdue.length],
    ['Open blockers', blockers.length],
    ['Payments pending', pending.length],
    ['Amount pending', pendingAmt],
  ];
  kpis.forEach(([label, value], i) => {
    const c = 2 + i;
    sh.getRange(5, c).setValue(label).setFontColor(COLOURS.muted).setFontSize(9).setFontWeight('bold');
    const v = sh.getRange(6, c).setValue(value).setFontSize(20).setFontWeight('bold')
      .setFontColor(label.indexOf('Overdue') === 0 && value ? COLOURS.red : COLOURS.navy);
    if (label === 'Amount pending') v.setNumberFormat(NUM_FMT);
    sh.getRange(5, c, 2, 1).setBackground(COLOURS.grey).setHorizontalAlignment('left')
      .setBorder(true, null, null, null, null, null, COLOURS.teal, SpreadsheetApp.BorderStyle.SOLID_THICK);
  });
  sh.setRowHeight(6, 38);

  // 1. Items by status
  let row = 8;
  row = section_(sh, row, 'Items by status');
  const statusHead = ['Status'].concat(TYPES, ['Total']);
  const statusRows = STATUSES.map(s => {
    const counts = TYPES.map(t => items.filter(r => r.Status === s && r.Type === t).length);
    return [s].concat(counts, [counts.reduce((a, b) => a + b, 0)]);
  });
  row = table_(sh, row, statusHead, statusRows, {});

  // 2. Project progress
  row = section_(sh, row, 'Project progress');
  const progHead = ['Project', 'Client', 'Owner', 'Deliverables done', 'Progress', 'Open blockers',
                    'Overdue', 'Payments pending', 'Next due'];
  const progRows = projects.map(p => {
    const its = items.filter(r => r.Project === p);
    const del = its.filter(r => r.Type === 'Deliverable');
    const done = del.filter(r => r.Status === 'Done').length;
    const next = its.filter(r => !isClosed_(r) && r.Due).sort((a, b) => a.Due - b.Due)[0];
    return [p, its[0].Client, its[0].Owner, done + ' of ' + del.length,
            del.length ? done / del.length : 0,
            its.filter(r => r.Type === 'Blocker' && !isClosed_(r)).length,
            overdue.filter(r => r.Project === p).length,
            its.filter(r => r.Type === 'Payment' && !r.PaidOn).reduce((s, r) => s + (Number(r.Amount) || 0), 0),
            next ? next.Due : ''];
  });
  const progStart = row + 1;
  row = table_(sh, row, progHead, progRows, { 5: '0%', 8: NUM_FMT, 9: DATE_FMT });
  if (progRows.length) {
    sh.setConditionalFormatRules(sh.getConditionalFormatRules().concat([
      SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0)
        .setFontColor(COLOURS.red).setBold(true)
        .setRanges([sh.getRange(progStart, 7, progRows.length, 2)]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenNumberEqualTo(1)
        .setBackground(COLOURS.greenSoft).setRanges([sh.getRange(progStart, 6, progRows.length, 1)]).build(),
    ]));
  }

  // 3. Overdue items
  row = section_(sh, row, 'Overdue items');
  row = table_(sh, row, ['Project', 'Client', 'Type', 'Item', 'Due', 'Days late', 'Status', 'Owner'],
    overdue.map(r => [r.Project, r.Client, r.Type, r.Item, r.Due,
                      Math.round((today - r.Due) / 86400000), r.Status, r.Owner]),
    { 5: DATE_FMT }, 'Nothing overdue - well done.', COLOURS.redSoft);

  // 4. Payments pending
  row = section_(sh, row, 'Payments pending');
  table_(sh, row, ['Project', 'Client', 'Milestone', 'Amount', 'Due', 'Status', 'Owner'],
    pending.map(r => [r.Project, r.Client, r.Item, Number(r.Amount) || 0, r.Due, r.Status, r.Owner]),
    { 4: NUM_FMT, 5: DATE_FMT }, 'No payments pending.');

  setWidths_(sh, [24, 170, 100, 160, 180, 100, 105, 90, 130, 100]);
  sh.setTabColor(COLOURS.teal);
}

// ---------------------------------------------------------------------------
// Project View (live formulas driven by a dropdown)
// ---------------------------------------------------------------------------
function rebuildProjectView() {
  const ss = SpreadsheetApp.getActive();
  rebuildLists_();
  const old = ss.getSheetByName(SHEETS.VIEW);
  const keep = old ? old.getRange('C4').getValue() : '';
  const sh = resetSheet_(ss, SHEETS.VIEW, 2);
  const D = `'${SHEETS.DATA}'!`;
  const c = h => D + colLetter_(COL[h]) + '2:' + colLetter_(COL[h]);

  sh.getRange('B2').setValue('Project View').setFontSize(18).setFontWeight('bold').setFontColor(COLOURS.navy);
  sh.getRange('B4').setValue('Choose a project').setFontWeight('bold');
  const pick = sh.getRange('C4');
  pick.setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInRange(ss.getSheetByName(SHEETS.LISTS).getRange('A2:A'), true).setAllowInvalid(false).build())
    .setBackground(COLOURS.tealSoft).setFontWeight('bold').setFontSize(12)
    .setBorder(true, true, true, true, null, null, COLOURS.teal, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  SpreadsheetApp.flush();
  const first = ss.getSheetByName(SHEETS.LISTS).getRange('A2').getValue();
  pick.setValue(keep || first || '');

  const match = `${c('Project')}=$C$4`;
  sh.getRange('B5').setValue('Client / Owner').setFontColor(COLOURS.muted);
  sh.getRange('C5').setFormula(`=IFERROR(INDEX(FILTER(${c('Client')}&"  /  "&${c('Owner')},${match}),1),"")`);
  sh.getRange('B6').setValue('Deliverables done').setFontColor(COLOURS.muted);
  sh.getRange('C6').setFormula(
    `=COUNTIFS(${c('Project')},$C$4,${c('Type')},"Deliverable",${c('Status')},"Done")&" of "&` +
    `COUNTIFS(${c('Project')},$C$4,${c('Type')},"Deliverable")`);
  sh.getRange('B7').setValue('Amount pending').setFontColor(COLOURS.muted);
  sh.getRange('C7').setFormula(`=SUMIFS(${c('Amount')},${c('Project')},$C$4,${c('Type')},"Payment",${c('PaidOn')},"")`)
    .setNumberFormat(NUM_FMT);

  // Three blocks, each a live FILTER of the data tab
  const blocks = [
    ['Deliverables', 'Deliverable', ['Item', 'Start', 'Due', 'Status', 'Notes']],
    ['Blockers', 'Blocker', ['Item', 'Start', 'Due', 'Status', 'Notes']],
    ['Payments', 'Payment', ['Item', 'Amount', 'Due', 'Status', 'Paid On']],
  ];
  let row = 9;
  blocks.forEach(([title, type, cols]) => {
    row = section_(sh, row, title);
    sh.getRange(row, 2, 1, cols.length).setValues([cols]);
    styleHeader_(sh.getRange(row, 2, 1, cols.length));
    const arr = '{' + cols.map(h => c(h.replace(/\s/g, ''))).join(',') + '}';
    sh.getRange(row + 1, 2).setFormula(
      `=IFERROR(SORT(FILTER(${arr},${match},${c('Type')}="${type}"),3,TRUE),"None")`);
    cols.forEach((h, i) => {
      const r = sh.getRange(row + 1, 2 + i, 12, 1);
      if (['Start', 'Due', 'Paid On'].indexOf(h) >= 0) r.setNumberFormat(DATE_FMT);
      if (h === 'Amount') r.setNumberFormat(NUM_FMT);
    });
    // Overdue highlight inside the block (Due is always the 3rd column)
    const body = sh.getRange(row + 1, 2, 12, cols.length);
    sh.setConditionalFormatRules(sh.getConditionalFormatRules().concat([
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(`=AND(ISNUMBER($D${row + 1}),$D${row + 1}<TODAY(),$E${row + 1}<>"Done",` +
                              `NOT(ISNUMBER($F${row + 1})))`)
        .setBackground(COLOURS.redSoft).setFontColor(COLOURS.red).setRanges([body]).build(),
    ]));
    row += 14;
  });

  setWidths_(sh, [24, 260, 110, 110, 110, 240]);
  sh.setTabColor(COLOURS.teal);
}

/** Keeps the hidden list of project names used by the Project View dropdown. */
function rebuildLists_() {
  const ss = SpreadsheetApp.getActive();
  const sh = getOrCreate_(ss, SHEETS.LISTS);
  sh.clear();
  sh.getRange('A1').setValue('Projects');
  const p = `'${SHEETS.DATA}'!A2:A`;
  sh.getRange('A2').setFormula(`=IFERROR(SORT(UNIQUE(FILTER(${p},${p}<>""))),"")`);
  sh.hideSheet();
}

// ---------------------------------------------------------------------------
// Optional: refresh the summary automatically every morning
// ---------------------------------------------------------------------------
function installDailyRefresh() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'rebuildSummary')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('rebuildSummary').timeBased().everyDays(1).atHour(7).create();
  toast_('The Portfolio Summary will now rebuild every morning around 7 am.');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readItems_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.DATA);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
  return values
    .filter(v => String(v[0]).trim() !== '')
    .map(v => {
      const o = {};
      HEADERS.forEach((h, i) => { o[h.replace(/\s/g, '')] = v[i]; });
      o.Project = String(o.Project).trim();
      ['Start', 'Due', 'PaidOn'].forEach(k => { o[k] = o[k] instanceof Date ? o[k] : null; });
      return o;
    });
}

/** Done items and paid payments count as closed. */
function isClosed_(r) {
  return r.Status === 'Done' || (r.Type === 'Payment' && !!r.PaidOn);
}

function section_(sh, row, title) {
  sh.getRange(row, 2).setValue(title).setFontSize(12).setFontWeight('bold').setFontColor(COLOURS.navy);
  sh.getRange(row, 2, 1, 9).setBorder(null, null, true, null, null, null, COLOURS.teal,
                                      SpreadsheetApp.BorderStyle.SOLID);
  return row + 1;
}

/** Writes a header + rows block starting at column B; returns the next free row (+1 gap). */
function table_(sh, row, head, rows, formats, emptyText, fill) {
  sh.getRange(row, 2, 1, head.length).setValues([head]);
  styleHeader_(sh.getRange(row, 2, 1, head.length));
  if (!rows.length) {
    sh.getRange(row + 1, 2).setValue(emptyText || 'None').setFontStyle('italic').setFontColor(COLOURS.muted);
    return row + 3;
  }
  const body = sh.getRange(row + 1, 2, rows.length, head.length);
  body.setValues(rows).setVerticalAlignment('middle')
      .setBorder(null, null, true, null, null, true, COLOURS.line, SpreadsheetApp.BorderStyle.SOLID);
  if (fill) body.setBackground(fill);
  Object.keys(formats || {}).forEach(k => {
    sh.getRange(row + 1, 1 + Number(k), rows.length, 1).setNumberFormat(formats[k]);
  });
  return row + rows.length + 2;
}

function styleHeader_(range) {
  range.setBackground(COLOURS.navy).setFontColor('#FFFFFF').setFontWeight('bold')
       .setVerticalAlignment('middle').setWrap(true);
}

function getOrCreate_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/** Clears a generated tab (keeps its position) so it can be rebuilt cleanly. */
function resetSheet_(ss, name, index) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name, Math.min(index, ss.getSheets().length));
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  sh.setHiddenGridlines(true);
  return sh;
}

function setWidths_(sh, widths) {
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
}

function colLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function unique_(arr) {
  return arr.filter((v, i) => v && arr.indexOf(v) === i);
}

function startOfToday_() {
  const t = new Date(); t.setHours(0, 0, 0, 0); return t;
}

function toast_(msg) {
  SpreadsheetApp.getActive().toast(msg, 'Tracker', 6);
}
