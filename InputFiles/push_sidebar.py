import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

TOKEN_FILE = 'InputFiles/oauth_token.json'
SHEET_ID   = '180mh2AlShUPxQ0jFpR87hcpMHUeB0-II_3cPaCKirGE'
SCRIPT_ID  = '1f7BZ5Y9DpY1oElQ-d2i922XtmEXx123g1_DaWPm87e_x46TaCLWBEX9A'

SCOPES = [
    'https://www.googleapis.com/auth/script.projects',
    'https://www.googleapis.com/auth/script.deployments',
    'https://www.googleapis.com/auth/script.scriptapp',
    'https://www.googleapis.com/auth/spreadsheets',
]

creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
svc = build('script', 'v1', credentials=creds)

MANIFEST = json.dumps({
    "timeZone": "America/New_York",
    "dependencies": {},
    "exceptionLogging": "STACKDRIVER",
    "runtimeVersion": "V8",
    "oauthScopes": [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/script.scriptapp",
        "https://www.googleapis.com/auth/script.container.ui"
    ],
}, indent=2)

SIDEBAR_HTML = r"""<!DOCTYPE html>
<html><head>
<style>
*{box-sizing:border-box;}
body{font-family:Arial,sans-serif;padding:14px;margin:0;font-size:13px;}
#status{color:#999;font-style:italic;margin-bottom:10px;min-height:24px;}
#panel{display:none;}
label{display:block;margin:7px 0;cursor:pointer;}
input[type=checkbox]{margin-right:7px;}
#row-label{font-weight:bold;color:#1a3535;margin-bottom:10px;font-size:12px;}
.btn{padding:8px 18px;border:none;border-radius:4px;cursor:pointer;font-size:13px;margin-top:12px;}
#btn-confirm{background:#1a7f5a;color:#fff;}
#btn-clear{background:#eee;margin-left:8px;}
</style>
</head><body>
<div id="status">Click a cell in col I</div>
<div id="panel">
  <div id="row-label"></div>
  <div id="opts"></div>
  <div>
    <button class="btn" id="btn-confirm" onclick="confirmSel()">Confirm</button>
    <button class="btn" id="btn-clear" onclick="clearSel()">Clear</button>
  </div>
</div>
<script>
var OPTIONS = ['Internship','Entry level','Associate','Mid-Senior level','Director','Executive'];
var currentRow = null, lastRow = null, lastVal = null;
var INITIAL = {{INITIAL_STATE}};

function onInfo(info) {
  if (!info || !info.valid) {
    if (!currentRow) {
      document.getElementById('status').textContent = (info && info.msg) ? info.msg : 'Click a cell in col I';
      document.getElementById('panel').style.display = 'none';
    }
    return;
  }
  document.getElementById('status').textContent = '';
  document.getElementById('panel').style.display = 'block';
  currentRow = info.row;
  if (info.row !== lastRow || info.currentValue !== lastVal) {
    lastRow = info.row; lastVal = info.currentValue;
    document.getElementById('row-label').textContent = 'Row ' + info.row;
    var sel = info.currentValue ? info.currentValue.split(', ') : [];
    document.getElementById('opts').innerHTML = OPTIONS.map(function(o) {
      var chk = sel.indexOf(o) >= 0 ? ' checked' : '';
      return '<label><input type="checkbox" value="' + o + '"' + chk + '> ' + o + '</label>';
    }).join('');
  }
}

// 4 staggered chains — each takes ~1.5s, staggered 400ms apart
// gives ~400ms effective poll rate instead of 1.5s
function makeChain() {
  google.script.run
    .withSuccessHandler(function(info) { onInfo(info); makeChain(); })
    .withFailureHandler(function() { setTimeout(makeChain, 1000); })
    .getActiveCellInfo();
}

function confirmSel() {
  if (!currentRow) return;
  var sel = [];
  document.querySelectorAll('#opts input').forEach(function(b){ if(b.checked) sel.push(b.value); });
  var val = sel.join(', '); lastVal = val;
  var row = currentRow;
  document.getElementById('btn-confirm').textContent = 'Saving...';
  google.script.run
    .withSuccessHandler(function() { document.getElementById('btn-confirm').textContent = 'Confirm'; })
    .withFailureHandler(function() { document.getElementById('btn-confirm').textContent = 'Confirm'; })
    .setSeniorityValue(row, val);
}

function clearSel() {
  document.querySelectorAll('#opts input').forEach(function(b){ b.checked = false; });
}

// Show initial state instantly on open
if (INITIAL && INITIAL.valid) onInfo(INITIAL);

// Start 2 staggered chains (background convenience polling)
makeChain();
setTimeout(makeChain, 700);
</script>
</body></html>"""

sidebar_escaped = SIDEBAR_HTML.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n')

CODE = """
var SHEET_NAME = 'Main_Data';
var DATA_START = 3;   // row 2 reserved for button
var DATA_END   = 103;
var COL_TOGGLE = 7;
var COL_TITLE  = 8;
var COL_SEN    = 9;
var GREY_BG    = '#f2f2f2';
// Dynamic — works for any copy of this sheet
var SHEET_ID_  = SpreadsheetApp.getActiveSpreadsheet().getId();

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BulkSearch')
    .addItem('Job Seniority Picker', 'openSidebarPanel')
    .addToUi();
}

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
  var hij = sheet.getRange(row, COL_TITLE, 1, 3);
  if (String(value).trim().toLowerCase() === 'yes') {
    hij.setBackground(null);
  } else {
    hij.clearContent();
    hij.setBackground(GREY_BG);
  }
}

// onSelectionChange writes full JSON state to _State!A1 for fast REST polling
function onSelectionChange(e) {
  try {
    var stateSheet = e.source.getSheetByName('_State');
    if (!stateSheet) return;
    var r = e.range;
    var row = r.getRow();
    var col = r.getColumn();
    var sheet = r.getSheet();
    var sheetName = sheet.getName();
    var info;
    if (sheetName !== SHEET_NAME) {
      info = {valid: false, msg: 'Switch to Main_Data sheet'};
    } else if (col !== COL_SEN) {
      info = {valid: false, msg: 'Click a cell in col I'};
    } else if (row < DATA_START || row > DATA_END) {
      info = {valid: false, msg: 'Row out of range'};
    } else {
      var gVal = sheet.getRange(row, COL_TOGGLE).getValue();
      if (String(gVal).trim().toLowerCase() !== 'yes') {
        info = {valid: false, msg: 'Set col G = Yes for row ' + row};
      } else {
        info = {valid: true, row: row, currentValue: String(sheet.getRange(row, COL_SEN).getValue())};
      }
    }
    stateSheet.getRange('A1').setValue(JSON.stringify(info));
  } catch(err) {}
}

function getActiveCellInfo() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var cell  = sheet.getActiveCell();
  var row   = cell.getRow();
  var col   = cell.getColumn();
  if (sheet.getName() !== SHEET_NAME)     return { valid: false, msg: 'Switch to Main_Data sheet' };
  if (col !== COL_SEN)                    return { valid: false, msg: 'Click a cell in col I' };
  if (row < DATA_START || row > DATA_END) return { valid: false, msg: 'Row out of range' };
  var gVal = sheet.getRange(row, COL_TOGGLE).getValue();
  if (String(gVal).trim().toLowerCase() !== 'yes')
    return { valid: false, msg: 'Set col G = Yes for row ' + row };
  return { valid: true, row: row, currentValue: String(cell.getValue()) };
}

function getToken() {
  return ScriptApp.getOAuthToken();
}

function setSeniorityValue(row, value) {
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAME).getRange(row, COL_SEN).setValue(value);
}

function openSidebarPanel() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var stateSheet = ss.getSheetByName('_State');
  if (!stateSheet) {
    stateSheet = ss.insertSheet('_State');
    stateSheet.hideSheet();
  }
  var initialState = JSON.stringify(getActiveCellInfo());
  var htmlStr = SIDEBAR_HTML_.replace('{{INITIAL_STATE}}', initialState);
  SpreadsheetApp.getUi().showSidebar(
    HtmlService.createHtmlOutput(htmlStr).setTitle('Job Seniority').setWidth(260)
  );
}

function installSelectionTrigger() {
  SpreadsheetApp.getUi().alert('Sidebar is active and polling automatically.');
}

var SIDEBAR_HTML_ = '""" + sidebar_escaped + """';

function initAllRows() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  for (var r = DATA_START; r <= DATA_END; r++) {
    applyJobSearchState(sheet, r, sheet.getRange(r, COL_TOGGLE).getValue());
  }
  SpreadsheetApp.getUi().alert('Done!');
}
"""

svc.projects().updateContent(
    scriptId=SCRIPT_ID,
    body={
        "files": [
            {"name": "appsscript", "type": "JSON",      "source": MANIFEST},
            {"name": "Code",       "type": "SERVER_JS", "source": CODE}
        ]
    }
).execute()
print("Done")
