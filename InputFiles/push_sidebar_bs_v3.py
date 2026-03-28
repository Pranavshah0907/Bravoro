import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

TOKEN_FILE = 'InputFiles/oauth_token.json'
SHEET_ID   = '1Z4p1HJf5sMGgnNy_wGI04D-Jd0YNjSYq5A-PcEt-mbs'
SCRIPT_ID  = '19CBfOSf1yYgt-yx46KGRWne5244TNW-ieww2iidFguaqAmYSv7EmNtfh'

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
        "https://www.googleapis.com/auth/script.container.ui"
    ],
}, indent=2)

# ─── Shared sidebar CSS ────────────────────────────────────────────────────────
SIDEBAR_CSS = """
*{box-sizing:border-box;}
body{font-family:Arial,sans-serif;padding:10px;margin:0;font-size:12px;}
#status{color:#999;font-style:italic;margin-bottom:6px;min-height:16px;font-size:11px;}
#panel{display:none;}
#row-label{font-weight:bold;color:#1a3535;margin-bottom:8px;font-size:11px;}
.custom-row{display:flex;gap:4px;margin-bottom:5px;}
.custom-row input{flex:1;padding:5px 6px;border:1px solid #ccc;border-radius:3px;font-size:12px;}
.custom-row button{padding:5px 9px;background:#1a7f5a;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;}
#custom-chips{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:7px;min-height:4px;}
.chip{background:#e0f2f1;border:1px solid #80cbc4;border-radius:11px;padding:2px 7px 2px 8px;font-size:11px;display:flex;align-items:center;gap:3px;}
.chip .x{cursor:pointer;color:#555;font-size:13px;line-height:1;}
.action-row{display:flex;gap:6px;margin-bottom:9px;}
.btn{flex:1;padding:7px 0;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;}
#btn-confirm{background:#1a7f5a;color:#fff;}
#btn-clear{background:#eee;color:#333;}
hr.div{border:none;border-top:1px solid #ddd;margin:0 0 8px;}
#filter-input{width:100%;padding:5px 6px;border:1px solid #ccc;border-radius:3px;font-size:12px;margin-bottom:6px;}
#opts{max-height:260px;overflow-y:auto;}
label{display:flex;align-items:center;gap:6px;padding:3px 2px;cursor:pointer;font-size:12px;}
input[type=checkbox]{margin:0;flex-shrink:0;}
"""

# ─── Person Titles sidebar HTML ────────────────────────────────────────────────
TITLES_HTML = r"""<!DOCTYPE html>
<html><head><style>""" + SIDEBAR_CSS + r"""</style></head><body>
<div id="status">Click a cell in col E</div>
<div id="panel">
  <div id="row-label"></div>
  <div class="custom-row">
    <input type="text" id="custom-input" placeholder="Custom title..." />
    <button onclick="addCustom()">Add</button>
  </div>
  <div id="custom-chips"></div>
  <div class="action-row">
    <button class="btn" id="btn-confirm" onclick="confirmSel()">Confirm</button>
    <button class="btn" id="btn-clear" onclick="clearAll()">Clear All</button>
  </div>
  <hr class="div"/>
  <input type="text" id="filter-input" placeholder="Filter titles..." oninput="filterOpts()"/>
  <div id="opts"></div>
</div>
<script>
var PRESETS=['Accounting','Administrative','Arts and Design','Business Development','Community & Social Svc','Consulting','Education','Engineering','Entrepreneurship','Finance','Healthcare Services','Human Resources','Information Technology','Legal','Marketing','Media & Comm','Military & Protective','Operations','Product Management','Program & Project','Purchasing','Quality Assurance','Real Estate','Research','Support','Sales'];
var currentRow=null,lastRow=null,lastVal=null;
var selPresets=[],customItems=[];
var INITIAL={{INITIAL_STATE}};

function renderOpts(filter){
  var f=(filter||'').toLowerCase();
  document.getElementById('opts').innerHTML=PRESETS.filter(function(o){
    return !f||o.toLowerCase().indexOf(f)>=0;
  }).map(function(o){
    var chk=selPresets.indexOf(o)>=0?' checked':'';
    return '<label><input type="checkbox" value="'+o+'"'+chk+' onchange="togglePreset(this)"> '+o+'</label>';
  }).join('');
}
function togglePreset(cb){
  var idx=selPresets.indexOf(cb.value);
  if(cb.checked&&idx<0)selPresets.push(cb.value);
  else if(!cb.checked&&idx>=0)selPresets.splice(idx,1);
}
function renderChips(){
  document.getElementById('custom-chips').innerHTML=customItems.map(function(v,i){
    return '<span class="chip">'+v+' <span class="x" onclick="removeChip('+i+')">&#215;</span></span>';
  }).join('');
}
function removeChip(i){customItems.splice(i,1);renderChips();}
function addCustom(){
  var inp=document.getElementById('custom-input');
  var val=inp.value.trim();
  if(!val)return;
  if(PRESETS.indexOf(val)<0&&customItems.indexOf(val)<0){customItems.push(val);renderChips();}
  inp.value='';
}
document.addEventListener('DOMContentLoaded',function(){
  document.getElementById('custom-input').addEventListener('keydown',function(e){if(e.key==='Enter')addCustom();});
});
function filterOpts(){renderOpts(document.getElementById('filter-input').value);}
function getAllSelected(){return selPresets.concat(customItems);}
function confirmSel(){
  if(!currentRow)return;
  var val=getAllSelected().join(', ');lastVal=val;
  document.getElementById('btn-confirm').textContent='Saving...';
  google.script.run
    .withSuccessHandler(function(){document.getElementById('btn-confirm').textContent='Confirm';})
    .withFailureHandler(function(){document.getElementById('btn-confirm').textContent='Confirm';})
    .setTitlesValue(currentRow,val);
}
function clearAll(){
  selPresets=[];customItems=[];renderChips();
  document.querySelectorAll('#opts input').forEach(function(b){b.checked=false;});
  lastVal='';
}
function onInfo(info){
  if(!info||!info.valid){
    if(!currentRow){
      document.getElementById('status').textContent=(info&&info.msg)?info.msg:'Click a cell in col E';
      document.getElementById('panel').style.display='none';
    }
    return;
  }
  document.getElementById('status').textContent='';
  document.getElementById('panel').style.display='block';
  currentRow=info.row;
  if(info.row!==lastRow||info.currentValue!==lastVal){
    lastRow=info.row;lastVal=info.currentValue||'';
    document.getElementById('row-label').textContent='Row '+info.row+' — Person Titles';
    selPresets=[];customItems=[];
    if(lastVal){lastVal.split(', ').forEach(function(v){
      v=v.trim();if(!v)return;
      if(PRESETS.indexOf(v)>=0)selPresets.push(v);else customItems.push(v);
    });}
    renderChips();
    document.getElementById('filter-input').value='';
    renderOpts('');
  }
}
function makeChain(){
  google.script.run
    .withSuccessHandler(function(info){onInfo(info);makeChain();})
    .withFailureHandler(function(){setTimeout(makeChain,1000);})
    .getActiveCellInfoTitles();
}
if(INITIAL&&INITIAL.valid)onInfo(INITIAL);
makeChain();setTimeout(makeChain,700);
</script></body></html>"""

# ─── Person Seniorities sidebar HTML ──────────────────────────────────────────
SENIORITIES_HTML = r"""<!DOCTYPE html>
<html><head><style>""" + SIDEBAR_CSS + r"""</style></head><body>
<div id="status">Click a cell in col F</div>
<div id="panel">
  <div id="row-label"></div>
  <div class="custom-row">
    <input type="text" id="custom-input" placeholder="Custom seniority..." />
    <button onclick="addCustom()">Add</button>
  </div>
  <div id="custom-chips"></div>
  <div class="action-row">
    <button class="btn" id="btn-confirm" onclick="confirmSel()">Confirm</button>
    <button class="btn" id="btn-clear" onclick="clearAll()">Clear All</button>
  </div>
  <hr class="div"/>
  <input type="text" id="filter-input" placeholder="Filter seniorities..." oninput="filterOpts()"/>
  <div id="opts"></div>
</div>
<script>
var PRESETS=['Owner','Partner','C-Suite (CXO)','VP','SVP','EVP','Director','Senior Manager','Manager','Team Lead','Senior','Mid-Level','Entry Level','Intern','Training'];
var currentRow=null,lastRow=null,lastVal=null;
var selPresets=[],customItems=[];
var INITIAL={{INITIAL_STATE}};

function renderOpts(filter){
  var f=(filter||'').toLowerCase();
  document.getElementById('opts').innerHTML=PRESETS.filter(function(o){
    return !f||o.toLowerCase().indexOf(f)>=0;
  }).map(function(o){
    var chk=selPresets.indexOf(o)>=0?' checked':'';
    return '<label><input type="checkbox" value="'+o+'"'+chk+' onchange="togglePreset(this)"> '+o+'</label>';
  }).join('');
}
function togglePreset(cb){
  var idx=selPresets.indexOf(cb.value);
  if(cb.checked&&idx<0)selPresets.push(cb.value);
  else if(!cb.checked&&idx>=0)selPresets.splice(idx,1);
}
function renderChips(){
  document.getElementById('custom-chips').innerHTML=customItems.map(function(v,i){
    return '<span class="chip">'+v+' <span class="x" onclick="removeChip('+i+')">&#215;</span></span>';
  }).join('');
}
function removeChip(i){customItems.splice(i,1);renderChips();}
function addCustom(){
  var inp=document.getElementById('custom-input');
  var val=inp.value.trim();
  if(!val)return;
  if(PRESETS.indexOf(val)<0&&customItems.indexOf(val)<0){customItems.push(val);renderChips();}
  inp.value='';
}
document.addEventListener('DOMContentLoaded',function(){
  document.getElementById('custom-input').addEventListener('keydown',function(e){if(e.key==='Enter')addCustom();});
});
function filterOpts(){renderOpts(document.getElementById('filter-input').value);}
function getAllSelected(){return selPresets.concat(customItems);}
function confirmSel(){
  if(!currentRow)return;
  var val=getAllSelected().join(', ');lastVal=val;
  document.getElementById('btn-confirm').textContent='Saving...';
  google.script.run
    .withSuccessHandler(function(){document.getElementById('btn-confirm').textContent='Confirm';})
    .withFailureHandler(function(){document.getElementById('btn-confirm').textContent='Confirm';})
    .setPersonSenioritiesValue(currentRow,val);
}
function clearAll(){
  selPresets=[];customItems=[];renderChips();
  document.querySelectorAll('#opts input').forEach(function(b){b.checked=false;});
  lastVal='';
}
function onInfo(info){
  if(!info||!info.valid){
    if(!currentRow){
      document.getElementById('status').textContent=(info&&info.msg)?info.msg:'Click a cell in col F';
      document.getElementById('panel').style.display='none';
    }
    return;
  }
  document.getElementById('status').textContent='';
  document.getElementById('panel').style.display='block';
  currentRow=info.row;
  if(info.row!==lastRow||info.currentValue!==lastVal){
    lastRow=info.row;lastVal=info.currentValue||'';
    document.getElementById('row-label').textContent='Row '+info.row+' — Person Seniorities';
    selPresets=[];customItems=[];
    if(lastVal){lastVal.split(', ').forEach(function(v){
      v=v.trim();if(!v)return;
      if(PRESETS.indexOf(v)>=0)selPresets.push(v);else customItems.push(v);
    });}
    renderChips();
    document.getElementById('filter-input').value='';
    renderOpts('');
  }
}
function makeChain(){
  google.script.run
    .withSuccessHandler(function(info){onInfo(info);makeChain();})
    .withFailureHandler(function(){setTimeout(makeChain,1000);})
    .getActiveCellInfoSeniorities();
}
if(INITIAL&&INITIAL.valid)onInfo(INITIAL);
makeChain();setTimeout(makeChain,700);
</script></body></html>"""

# ─── Job Seniority sidebar HTML (unchanged logic, updated col reference) ──────
JOB_SEN_HTML = r"""<!DOCTYPE html>
<html><head><style>""" + SIDEBAR_CSS + r"""</style></head><body>
<div id="status">Click a cell in col J</div>
<div id="panel">
  <div id="row-label"></div>
  <div class="action-row">
    <button class="btn" id="btn-confirm" onclick="confirmSel()">Confirm</button>
    <button class="btn" id="btn-clear" onclick="clearSel()">Clear</button>
  </div>
  <hr class="div"/>
  <div id="opts"></div>
</div>
<script>
var OPTIONS=['Internship','Entry level','Associate','Mid-Senior level','Director','Executive'];
var currentRow=null,lastRow=null,lastVal=null;
var INITIAL={{INITIAL_STATE}};
function onInfo(info){
  if(!info||!info.valid){
    if(!currentRow){
      document.getElementById('status').textContent=(info&&info.msg)?info.msg:'Click a cell in col J';
      document.getElementById('panel').style.display='none';
    }
    return;
  }
  document.getElementById('status').textContent='';
  document.getElementById('panel').style.display='block';
  currentRow=info.row;
  if(info.row!==lastRow||info.currentValue!==lastVal){
    lastRow=info.row;lastVal=info.currentValue;
    document.getElementById('row-label').textContent='Row '+info.row+' — Job Seniority';
    var sel=info.currentValue?info.currentValue.split(', '):[];
    document.getElementById('opts').innerHTML=OPTIONS.map(function(o){
      var chk=sel.indexOf(o)>=0?' checked':'';
      return '<label><input type="checkbox" value="'+o+'"'+chk+'> '+o+'</label>';
    }).join('');
  }
}
function makeChain(){
  google.script.run
    .withSuccessHandler(function(info){onInfo(info);makeChain();})
    .withFailureHandler(function(){setTimeout(makeChain,1000);})
    .getActiveCellInfo();
}
function confirmSel(){
  if(!currentRow)return;
  var sel=[];
  document.querySelectorAll('#opts input:checked').forEach(function(b){sel.push(b.value);});
  var val=sel.join(', ');lastVal=val;
  document.getElementById('btn-confirm').textContent='Saving...';
  google.script.run
    .withSuccessHandler(function(){document.getElementById('btn-confirm').textContent='Confirm';})
    .withFailureHandler(function(){document.getElementById('btn-confirm').textContent='Confirm';})
    .setSeniorityValue(currentRow,val);
}
function clearSel(){
  document.querySelectorAll('#opts input').forEach(function(b){b.checked=false;});
}
if(INITIAL&&INITIAL.valid)onInfo(INITIAL);
makeChain();setTimeout(makeChain,700);
</script></body></html>"""


def esc(html):
    return html.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n')

titles_esc   = esc(TITLES_HTML)
sen_esc      = esc(SENIORITIES_HTML)
job_sen_esc  = esc(JOB_SEN_HTML)

CODE = """
var SHEET_NAME   = 'Main_Data';
var DATA_START   = 3;
var DATA_END     = 102;

// Column indices (1-based)
var COL_TITLES_OUT = 5;   // E — Person Titles
var COL_SEN_OUT    = 6;   // F — Person Seniorities
var COL_RESULTS    = 7;   // G — Results per title
var COL_TOGGLE     = 8;   // H — Toggle job search
var COL_JOB_TITLE  = 9;   // I — Job Title
var COL_JOB_SEN    = 10;  // J — Job Seniority
var COL_DATE       = 11;  // K — Date Posted

var GREY_BG = '#f2f2f2';
var SHEET_ID_ = SpreadsheetApp.getActiveSpreadsheet().getId();

// ── Menu ────────────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BulkSearch')
    .addItem('Person Titles Picker',       'openTitlesSidebar')
    .addItem('Person Seniorities Picker',  'openSenioritiesSidebar')
    .addItem('Job Seniority Picker',       'openSidebarPanel')
    .addToUi();
}

// ── Job toggle onEdit ────────────────────────────────────────────────────────
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

// ── Person Titles sidebar ────────────────────────────────────────────────────
function getActiveCellInfoTitles() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var cell  = sheet.getActiveCell();
  var row   = cell.getRow();
  var col   = cell.getColumn();
  if (sheet.getName() !== SHEET_NAME)        return { valid: false, msg: 'Switch to Main_Data sheet' };
  if (col !== COL_TITLES_OUT)                return { valid: false, msg: 'Click a cell in col E' };
  if (row < DATA_START || row > DATA_END)    return { valid: false, msg: 'Row out of range' };
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

// ── Person Seniorities sidebar ───────────────────────────────────────────────
function getActiveCellInfoSeniorities() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var cell  = sheet.getActiveCell();
  var row   = cell.getRow();
  var col   = cell.getColumn();
  if (sheet.getName() !== SHEET_NAME)        return { valid: false, msg: 'Switch to Main_Data sheet' };
  if (col !== COL_SEN_OUT)                   return { valid: false, msg: 'Click a cell in col F' };
  if (row < DATA_START || row > DATA_END)    return { valid: false, msg: 'Row out of range' };
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

// ── Job Seniority sidebar ────────────────────────────────────────────────────
function getActiveCellInfo() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var cell  = sheet.getActiveCell();
  var row   = cell.getRow();
  var col   = cell.getColumn();
  if (sheet.getName() !== SHEET_NAME)        return { valid: false, msg: 'Switch to Main_Data sheet' };
  if (col !== COL_JOB_SEN)                   return { valid: false, msg: 'Click a cell in col J' };
  if (row < DATA_START || row > DATA_END)    return { valid: false, msg: 'Row out of range' };
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


var TITLES_HTML_  = '""" + titles_esc + """';
var SEN_HTML_     = '""" + sen_esc + """';
var JOB_SEN_HTML_ = '""" + job_sen_esc + """';
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
print("Done - Apps Script v3 pushed with all 3 sidebars")
print()
print("Column constants updated:")
print("  COL_TITLES_OUT = 5 (E)  COL_SEN_OUT = 6 (F)")
print("  COL_TOGGLE = 8 (H)      COL_JOB_SEN = 10 (J)")
