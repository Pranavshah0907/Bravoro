// ════════════════════════════════════════════════════════════════════════════
// BulkSearch Job Columns — Apps Script (reference copy)
// This is kept in sync with push_sidebar_bs_v3.py which deploys to the sheet.
//
// Sheet: BulkSearch_Template_V2 → Main_Data
// Col H: Toggle job search (Yes/No)
// Col I: Job Title (comma separated)
// Col J: Job Seniority (sidebar picker — button triggered)
// Col K: Date Posted (max age days)
//
// OAuth scopes: spreadsheets + script.container.ui only (no script.scriptapp)
// No installable triggers — all pickers are button/menu triggered.
// ════════════════════════════════════════════════════════════════════════════

var SHEET_NAME = 'Main_Data';
var DATA_START = 3;
var DATA_END   = 102;

var COL_TITLES_OUT = 5;   // E — Person Titles
var COL_SEN_OUT    = 6;   // F — Person Seniorities
var COL_RESULTS    = 7;   // G — Results per title
var COL_TOGGLE     = 8;   // H — Toggle job search
var COL_JOB_TITLE  = 9;   // I — Job Title
var COL_JOB_SEN    = 10;  // J — Job Seniority
var COL_DATE       = 11;  // K — Date Posted

var GREY_BG = '#f2f2f2';

// ── Menu ──────────────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BulkSearch')
    .addItem('Person Titles Picker',       'openTitlesSidebar')
    .addItem('Person Seniorities Picker',  'openSenioritiesSidebar')
    .addItem('Job Seniority Picker',       'openSidebarPanel')
    .addToUi();
}

// ── Job toggle onEdit (simple trigger — no auth required) ─────────────────────
function onEdit(e) {
  var range = e.range;
  var sheet = range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  if (range.getColumn() > COL_TOGGLE || range.getLastColumn() < COL_TOGGLE) return;
  var startRow = range.getRow();
  var numRows  = range.getNumRows();
  for (var i = 0; i < numRows; i++) {
    var row = startRow + i;
    if (row < DATA_START || row > DATA_END) continue;
    applyJobSearchState(sheet, row, sheet.getRange(row, COL_TOGGLE).getValue());
  }
}

function applyJobSearchState(sheet, row, value) {
  var ijk = sheet.getRange(row, COL_JOB_TITLE, 1, 3); // I, J, K
  if (String(value).trim().toLowerCase() === 'yes') {
    ijk.setBackground(null);
  } else {
    ijk.clearContent();
    ijk.setBackground(GREY_BG);
  }
}

function initAllRows() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  for (var r = DATA_START; r <= DATA_END; r++) {
    applyJobSearchState(sheet, r, sheet.getRange(r, COL_TOGGLE).getValue());
  }
  SpreadsheetApp.getUi().alert('Done!');
}

// ── Person Titles sidebar ─────────────────────────────────────────────────────
function getActiveCellInfoTitles() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var cell  = sheet.getActiveCell();
  var row   = cell.getRow();
  var col   = cell.getColumn();
  if (sheet.getName() !== SHEET_NAME)       return { valid: false, msg: 'Switch to Main_Data sheet' };
  if (col !== COL_TITLES_OUT)               return { valid: false, msg: 'Click a cell in col E' };
  if (row < DATA_START || row > DATA_END)   return { valid: false, msg: 'Row out of range' };
  return { valid: true, row: row, currentValue: String(cell.getValue()) };
}

function setTitlesValue(row, value) {
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAME).getRange(row, COL_TITLES_OUT).setValue(value);
}

function openTitlesSidebar() {
  var initialState = JSON.stringify(getActiveCellInfoTitles());
  var htmlStr = TITLES_HTML_.replace('{{INITIAL_STATE}}', initialState);
  SpreadsheetApp.getUi().showSidebar(
    HtmlService.createHtmlOutput(htmlStr).setTitle('Person Titles').setWidth(280)
  );
}

// ── Person Seniorities sidebar ────────────────────────────────────────────────
function getActiveCellInfoSeniorities() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var cell  = sheet.getActiveCell();
  var row   = cell.getRow();
  var col   = cell.getColumn();
  if (sheet.getName() !== SHEET_NAME)       return { valid: false, msg: 'Switch to Main_Data sheet' };
  if (col !== COL_SEN_OUT)                  return { valid: false, msg: 'Click a cell in col F' };
  if (row < DATA_START || row > DATA_END)   return { valid: false, msg: 'Row out of range' };
  return { valid: true, row: row, currentValue: String(cell.getValue()) };
}

function setPersonSenioritiesValue(row, value) {
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAME).getRange(row, COL_SEN_OUT).setValue(value);
}

function openSenioritiesSidebar() {
  var initialState = JSON.stringify(getActiveCellInfoSeniorities());
  var htmlStr = SEN_HTML_.replace('{{INITIAL_STATE}}', initialState);
  SpreadsheetApp.getUi().showSidebar(
    HtmlService.createHtmlOutput(htmlStr).setTitle('Person Seniorities').setWidth(280)
  );
}

// ── Job Seniority sidebar (button/menu triggered — no installable trigger) ────
function getActiveCellInfo() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var cell  = sheet.getActiveCell();
  var row   = cell.getRow();
  var col   = cell.getColumn();
  if (sheet.getName() !== SHEET_NAME)       return { valid: false, msg: 'Switch to Main_Data sheet' };
  if (col !== COL_JOB_SEN)                  return { valid: false, msg: 'Click a cell in col J' };
  if (row < DATA_START || row > DATA_END)   return { valid: false, msg: 'Row out of range' };
  var gVal = sheet.getRange(row, COL_TOGGLE).getValue();
  if (String(gVal).trim().toLowerCase() !== 'yes')
    return { valid: false, msg: 'Set col H = Yes for row ' + row };
  return { valid: true, row: row, currentValue: String(cell.getValue()) };
}

function setSeniorityValue(row, value) {
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAME).getRange(row, COL_JOB_SEN).setValue(value);
}

function openSidebarPanel() {
  var initialState = JSON.stringify(getActiveCellInfo());
  var htmlStr = JOB_SEN_HTML_.replace('{{INITIAL_STATE}}', initialState);
  SpreadsheetApp.getUi().showSidebar(
    HtmlService.createHtmlOutput(htmlStr).setTitle('Job Seniority').setWidth(280)
  );
}

// HTML strings for sidebars are injected by push_sidebar_bs_v3.py at deploy time.
// var TITLES_HTML_  = '...';
// var SEN_HTML_     = '...';
// var JOB_SEN_HTML_ = '...';
