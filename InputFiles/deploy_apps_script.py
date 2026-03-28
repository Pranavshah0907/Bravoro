"""
Deploy Apps Script to Google Sheets — BulkSearch Job Columns
Steps 6 (onEdit bg toggle) + 7 (multi-select seniority modal)

Requires: http://localhost:8765 added to OAuth2 client's Authorized redirect URIs
"""

import os, sys, json

CLIENT_ID     = os.environ.get('GOOGLE_CLIENT_ID', '')     # set via env or replace inline locally
CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '') # set via env or replace inline locally
SHEET_ID      = '180mh2AlShUPxQ0jFpR87hcpMHUeB0-II_3cPaCKirGE'
TOKEN_FILE    = 'InputFiles/oauth_token.json'
AUTH_PORT     = 8765

SCOPES = [
    'https://www.googleapis.com/auth/script.projects',
    'https://www.googleapis.com/auth/script.deployments',
    'https://www.googleapis.com/auth/script.scriptapp',
    'https://www.googleapis.com/auth/spreadsheets',
]

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
except ImportError as e:
    print(f"Missing package: {e}")
    print("Run: python -m pip install google-auth-oauthlib")
    sys.exit(1)

# ─── Auth ──────────────────────────────────────────────────────────────────────
creds = None
if os.path.exists(TOKEN_FILE):
    creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

if not creds or not creds.valid:
    if creds and creds.expired and creds.refresh_token:
        print("Refreshing token...")
        creds.refresh(Request())
    else:
        print(f"Opening browser for Google authorization on port {AUTH_PORT}...")
        client_config = {
            "web": {
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [f"http://localhost:{AUTH_PORT}"]
            }
        }
        flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
        creds = flow.run_local_server(port=AUTH_PORT, prompt='select_account consent', access_type='offline')

    with open(TOKEN_FILE, 'w') as f:
        f.write(creds.to_json())
    print(f"Token saved -> {TOKEN_FILE}")

print("Authenticated OK")

# ─── Build service ─────────────────────────────────────────────────────────────
script_svc = build('script', 'v1', credentials=creds)

# ─── Apps Script source ────────────────────────────────────────────────────────
MANIFEST = json.dumps({
    "timeZone": "America/New_York",
    "dependencies": {},
    "exceptionLogging": "STACKDRIVER",
    "runtimeVersion": "V8",
    "oauthScopes": [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/script.scriptapp"
    ],
    "executionApi": {
        "access": "MYSELF"
    }
}, indent=2)

CODE = r"""
var SHEET_NAME = 'Main_Data';
var DATA_START = 2;
var DATA_END   = 101;
var COL_TOGGLE = 7;  // G
var COL_TITLE  = 8;  // H
var COL_SEN    = 9;  // I
var COL_DATE   = 10; // J
var GREY_BG    = '#f2f2f2';

var SENIORITY_OPTIONS = [
  'Internship', 'Entry level', 'Associate',
  'Mid-Senior level', 'Director', 'Executive'
];

// ── Step 6: onEdit (simple trigger — runs automatically, no setup needed) ──────
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
  var hij = sheet.getRange(row, COL_TITLE, 1, 3);
  if (String(value).trim().toLowerCase() === 'yes') {
    hij.setBackground(null);
  } else {
    hij.setBackground(GREY_BG);
  }
}

// ── Step 7: onSelectionChange (installable trigger — created by createTriggers_) ─
function onSelectionChange(e) {
  var range = e.range;
  var sheet = range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  if (range.getNumRows() !== 1 || range.getNumColumns() !== 1) return;
  if (range.getColumn() !== COL_SEN) return;
  var row = range.getRow();
  if (row < DATA_START || row > DATA_END) return;
  var gVal = sheet.getRange(row, COL_TOGGLE).getValue();
  if (String(gVal).trim().toLowerCase() !== 'yes') return;
  showSeniorityModal_(row);
}

function showSeniorityModal_(row) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var currentVal = sheet.getRange(row, COL_SEN).getValue();
  var html = HtmlService.createHtmlOutput(buildModalHtml_(currentVal, row))
    .setWidth(300).setHeight(295);
  SpreadsheetApp.getUi().showModalDialog(html, 'Job Seniority');
}

function buildModalHtml_(currentVal, row) {
  var selected = currentVal
    ? currentVal.split(',').map(function(s) { return s.trim(); })
    : [];
  var checkboxes = SENIORITY_OPTIONS.map(function(opt) {
    var chk = selected.indexOf(opt) >= 0 ? ' checked' : '';
    return '<label style="display:block;margin:8px 0;cursor:pointer;font-size:13px;">'
         + '<input type="checkbox" value="' + opt + '"' + chk + '> ' + opt + '</label>';
  }).join('');
  return '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:16px 20px;">'
       + '<div id="opts">' + checkboxes + '</div>'
       + '<div style="margin-top:18px;text-align:right;">'
       + '<button onclick="confirm_(' + row + ')" style="background:#1a7f5a;color:#fff;border:none;'
       +   'padding:8px 20px;cursor:pointer;border-radius:4px;font-size:13px;">Confirm</button>'
       + '<button onclick="google.script.host.close()" style="margin-left:8px;padding:8px 14px;'
       +   'cursor:pointer;border-radius:4px;font-size:13px;">Cancel</button>'
       + '</div>'
       + '<script>'
       + 'function confirm_(row){'
       + '  var boxes=document.querySelectorAll("#opts input");'
       + '  var sel=[];'
       + '  boxes.forEach(function(b){if(b.checked)sel.push(b.value);});'
       + '  google.script.run.withSuccessHandler(function(){google.script.host.close();}).setSeniorityValue(row,sel.join(", "));'
       + '}'
       + '<\/script></body></html>';
}

function setSeniorityValue(row, value) {
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAME).getRange(row, COL_SEN).setValue(value);
}

// ── Trigger installer — called via API after upload ───────────────────────────
function createTriggers_() {
  var ss = SpreadsheetApp.openById('""" + SHEET_ID + r"""');
  var triggers = ScriptApp.getUserTriggers(ss);
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'onSelectionChange') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onSelectionChange')
    .forSpreadsheet(ss)
    .onSelectionChange()
    .create();
  Logger.log('onSelectionChange trigger installed');
}

// ── Init all rows (sync background colors) — called via API ───────────────────
function initAllRows() {
  var ss    = SpreadsheetApp.openById('""" + SHEET_ID + r"""');
  var sheet = ss.getSheetByName(SHEET_NAME);
  for (var r = DATA_START; r <= DATA_END; r++) {
    applyJobSearchState(sheet, r, sheet.getRange(r, COL_TOGGLE).getValue());
  }
  Logger.log('All rows initialized');
}

// ── Custom menu ───────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BulkSearch')
    .addItem('Initialize all rows', 'initAllRows')
    .addToUi();
}
"""

# ─── Create project ────────────────────────────────────────────────────────────
print("\nCreating Apps Script project bound to sheet...")
try:
    project = script_svc.projects().create(body={
        "title": "BulkSearch Job Columns",
        "parentId": SHEET_ID
    }).execute()
except Exception as e:
    print(f"ERROR creating project: {e}")
    print("\nMake sure 'Apps Script API' is enabled in your Google Cloud project:")
    print("  https://console.cloud.google.com/apis/library/script.googleapis.com")
    sys.exit(1)

script_id = project['scriptId']
print(f"Project ID: {script_id}")

# ─── Upload code ───────────────────────────────────────────────────────────────
print("Uploading script code...")
script_svc.projects().updateContent(
    scriptId=script_id,
    body={
        "files": [
            {"name": "appsscript", "type": "JSON",      "source": MANIFEST},
            {"name": "Code",       "type": "SERVER_JS", "source": CODE}
        ]
    }
).execute()
print("Code uploaded OK")

# ─── Create version + API executable deployment ────────────────────────────────
print("Creating version...")
version = script_svc.projects().versions().create(
    scriptId=script_id,
    body={"description": "v1"}
).execute()
version_num = version['versionNumber']
print(f"Version {version_num} created")

print("Creating API executable deployment...")
deployment = script_svc.projects().deployments().create(
    scriptId=script_id,
    body={
        "versionNumber": version_num,
        "manifestFileName": "appsscript",
        "description": "API executable"
    }
).execute()
print(f"Deployment ID: {deployment['deploymentId']}")

# ─── Run createTriggers_ ───────────────────────────────────────────────────────
print("\nInstalling onSelectionChange trigger...")
try:
    resp = script_svc.scripts().run(
        scriptId=script_id,
        body={"function": "createTriggers_", "devMode": True}
    ).execute()
    if 'error' in resp:
        err = resp['error']
        print(f"Script error: {err}")
        trigger_ok = False
    else:
        print("onSelectionChange trigger installed!")
        trigger_ok = True
except Exception as e:
    print(f"scripts.run call failed: {e}")
    trigger_ok = False

# ─── Run initAllRows ───────────────────────────────────────────────────────────
print("\nInitializing all row backgrounds...")
try:
    resp2 = script_svc.scripts().run(
        scriptId=script_id,
        body={"function": "initAllRows", "devMode": True}
    ).execute()
    if 'error' in resp2:
        print(f"initAllRows error: {resp2['error']}")
    else:
        print("All rows initialized!")
except Exception as e:
    print(f"initAllRows call failed: {e}")

# ─── Summary ───────────────────────────────────────────────────────────────────
print("\n" + "="*60)
print("DONE")
print("="*60)
print(f"Script ID: {script_id}")
print("\nStep 6 (onEdit bg toggle): LIVE — works automatically as a simple trigger")
if trigger_ok:
    print("Step 7 (seniority modal): LIVE — onSelectionChange trigger installed")
else:
    print("Step 7 (seniority modal): Code uploaded. One manual step needed:")
    print(f"  Open the sheet -> Extensions -> Apps Script")
    print(f"  Find 'createTriggers_' function -> Run it once")
    print(f"  (Or: Triggers menu -> Add Trigger -> onSelectionChange)")
print("="*60)
