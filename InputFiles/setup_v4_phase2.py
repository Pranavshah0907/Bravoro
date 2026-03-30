"""
setup_v4_phase2.py — Phase 2: Create Apps Script project + push onEdit code
New sheet: 1uldSi7FoRVG7JibkbjJ0RY7nEK_kK9gTiRe5tKtbr6Y

What this does:
  • Creates a new Apps Script project bound to the new sheet (via OAuth)
  • Pushes the manifest (spreadsheets scope only — no UI scope)
  • Pushes onEdit code that handles:
      - Multi-select for cols E (Titles), F (Seniorities), J (Job Seniority)
      - Toggle (col H) locking/unlocking cols I, J, K
  • NO sidebars, NO getUi(), NO auth popup for any user ever

Run AFTER setup_v4_phase1.py
"""

import json, sys
try:
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    import google.auth.transport.requests as tr
except ImportError as e:
    print(f"Missing dependency: {e}"); sys.exit(1)

TOKEN_FILE = 'InputFiles/oauth_token.json'
SHEET_ID   = '1uldSi7FoRVG7JibkbjJ0RY7nEK_kK9gTiRe5tKtbr6Y'

SCOPES = [
    'https://www.googleapis.com/auth/script.projects',
    'https://www.googleapis.com/auth/script.deployments',
    'https://www.googleapis.com/auth/script.scriptapp',
    'https://www.googleapis.com/auth/spreadsheets',
]

# ── Load OAuth credentials ────────────────────────────────────────────────────
creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
if not creds.valid:
    creds.refresh(tr.Request())
    print("Token refreshed.")

svc = build('script', 'v1', credentials=creds)

# ── Create new Apps Script project bound to new sheet ─────────────────────────
print("Creating Apps Script project...")
project = svc.projects().create(body={
    'title': 'BulkSearch_V4_onEdit',
    'parentId': SHEET_ID
}).execute()

script_id = project['scriptId']
print(f"Script ID: {script_id}")

# ── Manifest — spreadsheets scope only, no UI scope ──────────────────────────
# Key: removing script.container.ui scope means NO auth popup for users.
# onEdit is a simple trigger — it runs without any authorization at all.
MANIFEST = json.dumps({
    "timeZone": "America/New_York",
    "dependencies": {},
    "exceptionLogging": "STACKDRIVER",
    "runtimeVersion": "V8",
    "oauthScopes": [
        "https://www.googleapis.com/auth/spreadsheets"
    ]
}, indent=2)

# ── Apps Script code ──────────────────────────────────────────────────────────
CODE = """\
var SHEET_NAME = 'Main_Data';
var DATA_START = 3;
var DATA_END   = 102;

// Column indices (1-based, for Apps Script)
var COL_TITLES  = 5;   // E — Person Titles
var COL_SEN     = 6;   // F — Person Seniorities
// G = Results per title (plain number, no special handling)
var COL_TOGGLE  = 8;   // H — Toggle job search (Yes/No)
var COL_JOB_TTL = 9;   // I — Job Title (free text)
var COL_JOB_SEN = 10;  // J — Job Seniority
var COL_DATE    = 11;  // K — Date Posted (number)

var GREY_BG = '#f2f2f2';

// ─────────────────────────────────────────────────────────────────────────────
// onEdit — SIMPLE TRIGGER (runs automatically, zero auth required for users)
// Handles two things:
//   1. Multi-select accumulation for cols E, F, J
//   2. Toggle (H) locking/unlocking cols I, J, K
// ─────────────────────────────────────────────────────────────────────────────
function onEdit(e) {
  var range = e.range;
  var sheet = range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;

  var col = range.getColumn();
  var row = range.getRow();
  if (row < DATA_START || row > DATA_END) return;

  // ── Multi-select: E (Titles), F (Seniorities), J (Job Seniority) ──────────
  if (col === COL_TITLES || col === COL_SEN || col === COL_JOB_SEN) {

    // Job Seniority (J) only works when Toggle (H) is Yes
    if (col === COL_JOB_SEN) {
      var toggleVal = sheet.getRange(row, COL_TOGGLE).getValue();
      if (String(toggleVal).trim().toLowerCase() !== 'yes') return;
    }

    var newVal = e.value;
    if (!newVal) return;  // cell cleared — leave as-is

    // Split existing value into array for exact-match deselect
    // (avoids "Manager" accidentally removing "Senior Manager")
    var oldVal = e.oldValue || '';
    var oldItems = oldVal
      ? oldVal.split(', ').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; })
      : [];

    var idx = oldItems.indexOf(newVal.trim());
    if (idx >= 0) {
      oldItems.splice(idx, 1);        // already in list — remove (deselect)
    } else {
      oldItems.push(newVal.trim());   // not in list — add (select)
    }

    range.setValue(oldItems.join(', '));
    return;
  }

  // ── Toggle (H): lock or unlock I, J, K ────────────────────────────────────
  if (col === COL_TOGGLE) {
    applyToggle(sheet, row, range.getValue());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// applyToggle — sets I/J/K to white (unlocked) or grey+cleared (locked)
// ─────────────────────────────────────────────────────────────────────────────
function applyToggle(sheet, row, value) {
  var ijk = sheet.getRange(row, COL_JOB_TTL, 1, 3);  // I, J, K — 3 cols
  if (String(value).trim().toLowerCase() === 'yes') {
    ijk.setBackground(null);          // white — editable
  } else {
    ijk.clearContent();               // clear any existing values
    ijk.setBackground(GREY_BG);      // grey — locked visually
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// initAllRows — utility for sheet owner to run ONCE after setup
// Syncs all 100 rows' I/J/K backgrounds to match their H toggle values.
// This only needs to run if toggle states get out of sync.
// ─────────────────────────────────────────────────────────────────────────────
function initAllRows() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) { Logger.log('Main_Data sheet not found'); return; }
  for (var r = DATA_START; r <= DATA_END; r++) {
    applyToggle(sheet, r, sheet.getRange(r, COL_TOGGLE).getValue());
  }
  Logger.log('initAllRows complete — all ' + (DATA_END - DATA_START + 1) + ' rows synced');
}
"""

# ── Push manifest + code ───────────────────────────────────────────────────────
print("Pushing Apps Script code...")
svc.projects().updateContent(
    scriptId=script_id,
    body={
        "files": [
            {"name": "appsscript", "type": "JSON",      "source": MANIFEST},
            {"name": "Code",       "type": "SERVER_JS", "source": CODE},
        ]
    }
).execute()

print()
print("Phase 2 complete:")
print(f"  ✓ Script ID: {script_id}")
print("  ✓ Manifest: spreadsheets scope only (no UI scope — no auth popup)")
print("  ✓ onEdit: multi-select for E, F, J + toggle lock for H→I,J,K")
print("  ✓ initAllRows() available for owner to run once if needed")
print()
print("SAVE THIS SCRIPT ID:", script_id)
print()
print("How users interact with the sheet:")
print("  • Col E (Person Titles): click cell → pick from dropdown → click again to add more")
print("  • Col F (Person Seniorities): same")
print("  • Col H (Toggle): pick Yes → cols I, J, K turn white and become editable")
print("  • Col J (Job Seniority): click cell → pick from dropdown → multi-select like E/F")
print("  • Col I (Job Title): free text, comma-separate multiple titles manually")
print("  • Picking the same item again REMOVES it (deselect)")
print()
print("NO authorization popup. Ever. For any user.")
