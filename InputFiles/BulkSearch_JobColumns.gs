// ════════════════════════════════════════════════════════════════════════════
// BulkSearch Job Columns — Apps Script
// Sheet: Copy of Bulk_PeopleEnrichment_Template → Main_Data
// Cols G–J (mirror of Excel H–K)
//   G: Toggle job search (Yes/No)
//   H: Job Title (comma separated)
//   I: Job Seniority (multi-select modal)
//   J: Date Posted (max age days)
// ════════════════════════════════════════════════════════════════════════════

var SHEET_NAME  = 'Main_Data';
var DATA_START  = 2;   // first data row
var DATA_END    = 101; // last data row
var COL_TOGGLE  = 7;   // G — Toggle job search
var COL_TITLE   = 8;   // H — Job Title
var COL_SEN     = 9;   // I — Job Seniority
var COL_DATE    = 10;  // J — Date Posted

var GREY_BG     = '#f2f2f2';
var CLEAR_BG    = null;  // null = remove background (inherit)

var SENIORITY_OPTIONS = [
  'Internship',
  'Entry level',
  'Associate',
  'Mid-Senior level',
  'Director',
  'Executive'
];

// ─── Step 6: onEdit trigger ───────────────────────────────────────────────────
// Named exactly "onEdit" → acts as a simple trigger automatically.
// No trigger setup required — just save the script.
// Changes background of H, I, J when G is toggled.
function onEdit(e) {
  var range = e.range;
  var sheet = range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  if (range.getColumn() !== COL_TOGGLE) return;
  var row = range.getRow();
  if (row < DATA_START || row > DATA_END) return;

  applyJobSearchState(sheet, row, range.getValue());
}

function applyJobSearchState(sheet, row, value) {
  var hij = sheet.getRange(row, COL_TITLE, 1, 3); // H, I, J
  if (String(value).trim().toLowerCase() === 'yes') {
    hij.setBackground(CLEAR_BG);
  } else {
    hij.setBackground(GREY_BG);
  }
}

// Run once to re-sync all rows after the script is added.
// Menu: BulkSearch > Initialize rows
function initAllRows() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  for (var r = DATA_START; r <= DATA_END; r++) {
    var val = sheet.getRange(r, COL_TOGGLE).getValue();
    applyJobSearchState(sheet, r, val);
  }
  SpreadsheetApp.getUi().alert('Done! All rows initialized.');
}

// ─── Step 7: onSelectionChange — multi-select seniority modal ────────────────
// Requires an installable trigger (see setup instructions below).
function onSelectionChange(e) {
  var range = e.range;
  var sheet = range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  if (range.getNumRows() !== 1 || range.getNumColumns() !== 1) return;
  if (range.getColumn() !== COL_SEN) return;
  var row = range.getRow();
  if (row < DATA_START || row > DATA_END) return;

  // Only open modal if G = Yes for this row
  var gVal = sheet.getRange(row, COL_TOGGLE).getValue();
  if (String(gVal).trim().toLowerCase() !== 'yes') return;

  showSeniorityModal_(row);
}

function showSeniorityModal_(row) {
  var sheet      = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var currentVal = sheet.getRange(row, COL_SEN).getValue();
  var html       = HtmlService.createHtmlOutput(buildModalHtml_(currentVal, row))
    .setWidth(300)
    .setHeight(290);
  SpreadsheetApp.getUi().showModalDialog(html, 'Job Seniority');
}

function buildModalHtml_(currentVal, row) {
  var selected = currentVal
    ? currentVal.split(',').map(function(s) { return s.trim(); })
    : [];

  var checkboxes = SENIORITY_OPTIONS.map(function(opt) {
    var chk = selected.indexOf(opt) >= 0 ? ' checked' : '';
    return '<label style="display:block;margin:8px 0;cursor:pointer;font-size:13px;">'
         + '<input type="checkbox" value="' + opt + '"' + chk + '> ' + opt
         + '</label>';
  }).join('');

  return '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:16px 20px;">'
       + '<div id="opts">' + checkboxes + '</div>'
       + '<div style="margin-top:18px;text-align:right;">'
       + '<button onclick="confirm_(' + row + ')" '
       +   'style="background:#1a7f5a;color:#fff;border:none;padding:8px 20px;'
       +          'cursor:pointer;border-radius:4px;font-size:13px;">Confirm</button>'
       + '<button onclick="google.script.host.close()" '
       +   'style="margin-left:8px;padding:8px 14px;cursor:pointer;border-radius:4px;font-size:13px;">Cancel</button>'
       + '</div>'
       + '<script>'
       + 'function confirm_(row) {'
       + '  var boxes = document.querySelectorAll("#opts input");'
       + '  var sel = [];'
       + '  boxes.forEach(function(b) { if (b.checked) sel.push(b.value); });'
       + '  google.script.run'
       + '    .withSuccessHandler(function() { google.script.host.close(); })'
       + '    .setSeniorityValue(row, sel.join(", "));'
       + '}'
       + '<\/script></body></html>';
}

// Called from the modal's Confirm button
function setSeniorityValue(row, value) {
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAME)
    .getRange(row, COL_SEN)
    .setValue(value);
}

// ─── Custom menu ──────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BulkSearch')
    .addItem('Initialize all rows', 'initAllRows')
    .addToUi();
}
