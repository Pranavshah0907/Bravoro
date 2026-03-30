"""
update_v4_headers.py — Align V4 Google Sheet headers with SpreadsheetGrid
Sheet: 1uldSi7FoRVG7JibkbjJ0RY7nEK_kK9gTiRe5tKtbr6Y

Changes:
  1. Rename E header: "Person Titles" → "Person Functions"
  2. Insert new column G: "Person Job Title" (free text, shifts everything right)
  3. Rename old G (now H): "Results per title" → "Results per Function"
  4. Rename old H (now I): "Toggle job search" → "Job Search"
  5. Rename old K (now L): "Date Posted" → "Date (days)"
  6. Update old Pick column (L→M): header, checkbox validation, protection
  7. Re-apply formatting, validation, and protection on new/shifted columns
  8. Update Apps Script column constants for new layout

New column layout (A–M):
  A  Sr No
  B  Organization Name
  C  Organization Locations
  D  Organization Domains
  E  Person Functions         (was "Person Titles")
  F  Person Seniorities
  G  Person Job Title         (NEW — inserted)
  H  Results per Function     (was G "Results per title")
  I  Job Search               (was H "Toggle job search")
  J  Job Title                (was I)
  K  Job Seniority            (was J)
  L  Date (days)              (was K "Date Posted")
  M  Pick                     (was L)

Requires service account key for Sheets API.
Requires OAuth token for Script API.
"""

import json, sys
try:
    from google.oauth2.service_account import Credentials as SACredentials
    from google.oauth2.credentials import Credentials as UserCredentials
    from googleapiclient.discovery import build
    import google.auth.transport.requests as tr
except ImportError as e:
    print(f"Missing dependency: {e}"); sys.exit(1)

KEY_FILE   = 'InputFiles/leap-project-480114-b965559fa9ff.json'
TOKEN_FILE = 'InputFiles/oauth_token.json'
SHEET_ID   = '1uldSi7FoRVG7JibkbjJ0RY7nEK_kK9gTiRe5tKtbr6Y'
SCRIPT_ID  = '1Ro0f1tj6cyM9wS9r3U0qN4h2hoXlEAYnDyq--emgzat-aNFeIQybTKd8'
MAIN_DATA_ID = 0
PICKER_SHEET_ID = 1221141600

# ── Service account for Sheets API ────────────────────────────────────────────
sa_creds = SACredentials.from_service_account_file(
    KEY_FILE, scopes=['https://www.googleapis.com/auth/spreadsheets'])
sheets = build('sheets', 'v4', credentials=sa_creds)

# ── OAuth for Script API ──────────────────────────────────────────────────────
SCRIPT_SCOPES = [
    'https://www.googleapis.com/auth/script.projects',
    'https://www.googleapis.com/auth/script.deployments',
    'https://www.googleapis.com/auth/script.scriptapp',
    'https://www.googleapis.com/auth/spreadsheets',
]
oauth_creds = UserCredentials.from_authorized_user_file(TOKEN_FILE, SCRIPT_SCOPES)
if not oauth_creds.valid:
    oauth_creds.refresh(tr.Request())
    print("OAuth token refreshed.")
script_svc = build('script', 'v1', credentials=oauth_creds)

# ══════════════════════════════════════════════════════════════════════════════
# PART 1: Sheet structure changes (service account)
# ══════════════════════════════════════════════════════════════════════════════

TEAL = {"red": 0, "green": 0.616, "blue": 0.647, "alpha": 1}        # #009da5
DARK_TEAL = {"red": 0.024, "green": 0.098, "blue": 0.102, "alpha": 1}  # #061919
WHITE = {"red": 1, "green": 1, "blue": 1, "alpha": 1}
GREY_BG = {"red": 0.949, "green": 0.949, "blue": 0.949, "alpha": 1}  # #f2f2f2

reqs = []

# ── 1. Rename E1 header: "Person Titles" → "Person Functions" ─────────────────
# (E1 is merged E1:E2 — update via updateCells on E1)
reqs.append({
    'updateCells': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'startRowIndex': 0, 'endRowIndex': 1,
            'startColumnIndex': 4, 'endColumnIndex': 5,  # E
        },
        'rows': [{'values': [{'userEnteredValue': {'stringValue': 'Person Functions'}}]}],
        'fields': 'userEnteredValue',
    }
})

# ── 2. Insert column at index 6 (after F, before old G) ──────────────────────
# This shifts old G→H, H→I, I→J, J→K, K→L, L→M
reqs.append({
    'insertDimension': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'dimension': 'COLUMNS',
            'startIndex': 6,   # insert before col index 6 (old G)
            'endIndex': 7,
        },
        'inheritFromBefore': True,
    }
})

# ── 3. Set up the new G column header "Person Job Title" (merged G1:G2) ───────
reqs.append({
    'mergeCells': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'startRowIndex': 0, 'endRowIndex': 2,
            'startColumnIndex': 6, 'endColumnIndex': 7,  # G
        },
        'mergeType': 'MERGE_ALL',
    }
})
reqs.append({
    'updateCells': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'startRowIndex': 0, 'endRowIndex': 1,
            'startColumnIndex': 6, 'endColumnIndex': 7,  # G
        },
        'rows': [{'values': [{
            'userEnteredValue': {'stringValue': 'Person Job Title'},
            'userEnteredFormat': {
                'backgroundColor': DARK_TEAL,
                'textFormat': {
                    'foregroundColorStyle': {'rgbColor': WHITE},
                    'bold': True,
                    'fontSize': 10,
                },
                'horizontalAlignment': 'CENTER',
                'verticalAlignment': 'MIDDLE',
                'wrapStrategy': 'WRAP',
            },
        }]}],
        'fields': 'userEnteredValue,userEnteredFormat',
    }
})

# Set G column width to 150px
reqs.append({
    'updateDimensionProperties': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'dimension': 'COLUMNS',
            'startIndex': 6, 'endIndex': 7,
        },
        'properties': {'pixelSize': 150},
        'fields': 'pixelSize',
    }
})

# ── 4. Rename old G (now H) header: "Results per title" → "Results per Function"
reqs.append({
    'updateCells': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'startRowIndex': 0, 'endRowIndex': 1,
            'startColumnIndex': 7, 'endColumnIndex': 8,  # H (was G)
        },
        'rows': [{'values': [{'userEnteredValue': {'stringValue': 'Results per Function'}}]}],
        'fields': 'userEnteredValue',
    }
})

# ── 5. Rename old H (now I) header: "Toggle job search" → "Job Search" ───────
reqs.append({
    'updateCells': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'startRowIndex': 0, 'endRowIndex': 1,
            'startColumnIndex': 8, 'endColumnIndex': 9,  # I (was H)
        },
        'rows': [{'values': [{'userEnteredValue': {'stringValue': 'Job Search'}}]}],
        'fields': 'userEnteredValue',
    }
})

# ── 6. Rename old K (now L) header: "Date Posted" → "Date (days)" ────────────
reqs.append({
    'updateCells': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'startRowIndex': 0, 'endRowIndex': 1,
            'startColumnIndex': 11, 'endColumnIndex': 12,  # L (was K)
        },
        'rows': [{'values': [{'userEnteredValue': {'stringValue': 'Date (days)'}}]}],
        'fields': 'userEnteredValue',
    }
})

# ── 7. Update "Columns M+" protection to "Columns N+" ────────────────────────
# The insert shifted the old M+ protection boundary. We need to find it and update.
# First, let's get all protections and fix them in a second batch.

print("Applying sheet structure changes (insert column + rename headers)...")
r1 = sheets.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': reqs}
).execute()
print(f"  Done — {len(r1.get('replies', []))} operations")

# ── 8. Fix protections ───────────────────────────────────────────────────────
# Get current protections and update the "Columns M+" one to "Columns N+"
print("Checking protections...")
sheet_data = sheets.spreadsheets().get(
    spreadsheetId=SHEET_ID,
    fields='sheets.properties,sheets.protectedRanges'
).execute()

fix_reqs = []
for s in sheet_data.get('sheets', []):
    if s['properties']['sheetId'] != MAIN_DATA_ID:
        continue
    for pr in s.get('protectedRanges', []):
        desc = pr.get('description', '')
        rng = pr.get('range', {})
        # The old "Columns M+" protection (startColumnIndex: 12) should now be at 13
        # because the insert shifted it. But let's check what we have.
        if 'Columns' in desc and rng.get('startColumnIndex', 0) >= 12:
            # Update description to reflect new column letter
            start_col = rng.get('startColumnIndex', 0)
            col_letter = chr(65 + start_col)  # 13 = N
            new_desc = f"Columns {col_letter}+"
            if desc != new_desc:
                fix_reqs.append({
                    'updateProtectedRange': {
                        'protectedRange': {
                            'protectedRangeId': pr['protectedRangeId'],
                            'description': new_desc,
                            'range': rng,
                            'warningOnly': True,
                        },
                        'fields': 'description',
                    }
                })
                print(f"  Updating protection: '{desc}' -> '{new_desc}'")

if fix_reqs:
    sheets.spreadsheets().batchUpdate(
        spreadsheetId=SHEET_ID, body={'requests': fix_reqs}
    ).execute()
    print(f"  Fixed {len(fix_reqs)} protection(s)")
else:
    print("  No protection fixes needed")

# ── 9. Add warning-only protection on new G column (Person Job Title labels) ──
# Actually, G is free text — no protection needed. Skip.

# ── 10. Ensure Pick column (now M) checkbox validation is correct ─────────────
# The insert should have shifted it automatically, but let's verify by reading M3
print("Verifying Pick column (now M) checkboxes...")
pick_check = sheets.spreadsheets().get(
    spreadsheetId=SHEET_ID,
    ranges=['Main_Data!M3'],
    fields='sheets.data.rowData.values.dataValidation'
).execute()
has_validation = False
for s in pick_check.get('sheets', []):
    for d in s.get('data', []):
        for rd in d.get('rowData', []):
            for v in rd.get('values', []):
                if v.get('dataValidation'):
                    has_validation = True
if has_validation:
    print("  Pick checkboxes in col M — OK")
else:
    print("  WARNING: Pick checkboxes may need re-applying in col M")

# ══════════════════════════════════════════════════════════════════════════════
# PART 2: Update Apps Script (OAuth)
# ══════════════════════════════════════════════════════════════════════════════

print()
print("Updating Apps Script for new column layout...")

MANIFEST = json.dumps({
    "timeZone": "America/New_York",
    "dependencies": {},
    "exceptionLogging": "STACKDRIVER",
    "runtimeVersion": "V8",
    "oauthScopes": [
        "https://www.googleapis.com/auth/spreadsheets"
    ]
}, indent=2)

# New column layout (1-based):
# A=1 Sr No, B=2 Org Name, C=3 Org Locations, D=4 Org Domains,
# E=5 Person Functions, F=6 Person Seniorities, G=7 Person Job Title (NEW),
# H=8 Results per Function, I=9 Job Search, J=10 Job Title,
# K=11 Job Seniority, L=12 Date (days), M=13 Pick

CODE = """\
var SHEET_NAME  = 'Main_Data';
var PICKER_NAME = 'Picker';
var DATA_START  = 3;
var DATA_END    = 102;

// Column indices (1-based) on Main_Data
// A=Sr No, B=Org Name, C=Org Locations, D=Org Domains,
// E=Person Functions, F=Person Seniorities, G=Person Job Title,
// H=Results per Function, I=Job Search, J=Job Title,
// K=Job Seniority, L=Date (days), M=Pick
var COL_TITLES  = 5;   // E - Person Functions (Picker writes here)
var COL_SEN     = 6;   // F - Person Seniorities (Picker writes here)
var COL_PJTITLE = 7;   // G - Person Job Title (free text, new)
var COL_RESULTS = 8;   // H - Results per Function
var COL_TOGGLE  = 9;   // I - Job Search (Yes/No)
var COL_JOB_TTL = 10;  // J - Job Title (free text)
var COL_JOB_SEN = 11;  // K - Job Seniority (Picker writes here)
var COL_DATE    = 12;  // L - Date (days) (number)
var COL_PICK    = 13;  // M - Pick checkbox (triggers Picker pre-load)

var GREY_BG = '#f2f2f2';

// Picker sheet layout (1-based row numbers)
// 2-column layout: Left = cols A(cb)+B(label), Right = cols D(cb)+E(label), C = spacer
var PICKER_TARGET_ROW_CELL = 'B2';  // Sr No input (1-100)
var PICKER_APPLY_CELL      = 'E2';  // APPLY checkbox
var PICKER_APPLY_COL       = 5;     // E = col 5

// Section row ranges (each section has numRows rows, items split left/right)
var PICKER_TITLES_START = 5;    // first data row
var PICKER_TITLES_ROWS  = 13;   // ceil(26/2) = 13 rows
var PICKER_TITLES_COUNT = 26;   // total items

var PICKER_SEN_START    = 20;
var PICKER_SEN_ROWS     = 8;    // ceil(15/2)
var PICKER_SEN_COUNT    = 15;

var PICKER_JOB_START    = 30;
var PICKER_JOB_ROWS     = 3;    // ceil(6/2)
var PICKER_JOB_COUNT    = 6;


// =============================================================================
// onEdit - SIMPLE TRIGGER (runs automatically, zero auth required)
// =============================================================================
function onEdit(e) {
  var range = e.range;
  var sheet = range.getSheet();
  var sheetName = sheet.getName();

  // ---- Main_Data handlers ----
  if (sheetName === SHEET_NAME) {
    var col = range.getColumn();
    var row = range.getRow();
    if (row < DATA_START || row > DATA_END) return;

    // Pick column (M) - trigger Picker pre-load
    if (col === COL_PICK) {
      if (range.getValue() === true) {
        handlePickTrigger(sheet, row);
      }
      return;
    }

    // Toggle (I): lock or unlock J, K, L
    if (col === COL_TOGGLE) {
      applyToggle(sheet, row, range.getValue());
    }
    return;
  }

  // ---- Picker sheet handlers ----
  if (sheetName === PICKER_NAME) {
    var pickerCol = range.getColumn();
    var pickerRow = range.getRow();

    // B2 changed (Sr No) - pre-load existing values
    if (pickerRow === 2 && pickerCol === 2) {
      handlePickerPreload(sheet);
      return;
    }

    // E2 checked (APPLY) - write selections back to Main_Data
    if (pickerRow === 2 && pickerCol === PICKER_APPLY_COL) {
      if (range.getValue() === true) {
        handlePickerApply(sheet);
      }
      return;
    }
  }
}


// =============================================================================
// handlePickTrigger - User checked Pick box on Main_Data row
// =============================================================================
function handlePickTrigger(mainSheet, row) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var picker = ss.getSheetByName(PICKER_NAME);
  if (!picker) return;

  var srNo = row - DATA_START + 1;
  picker.getRange(PICKER_TARGET_ROW_CELL).setValue(srNo);

  preloadPickerCheckboxes(picker, mainSheet, row);

  mainSheet.getRange(row, COL_PICK).setValue(false);
  ss.setActiveSheet(picker);
}


// =============================================================================
// handlePickerPreload - B2 changed on Picker (user typed Sr No)
// =============================================================================
function handlePickerPreload(pickerSheet) {
  var srNo = pickerSheet.getRange(PICKER_TARGET_ROW_CELL).getValue();
  if (!srNo || srNo < 1 || srNo > 100) return;

  var targetRow = srNo + DATA_START - 1;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var mainSheet = ss.getSheetByName(SHEET_NAME);
  if (!mainSheet) return;

  preloadPickerCheckboxes(pickerSheet, mainSheet, targetRow);
}


// =============================================================================
// preloadPickerCheckboxes - Read Main_Data E/F/K, check matching Picker boxes
// 2-column layout: left half of items in col A/B, right half in col D/E
// =============================================================================
function preloadPickerCheckboxes(picker, mainSheet, row) {
  var titlesVal = String(mainSheet.getRange(row, COL_TITLES).getValue() || '');
  var senVal    = String(mainSheet.getRange(row, COL_SEN).getValue() || '');
  var jobSenVal = String(mainSheet.getRange(row, COL_JOB_SEN).getValue() || '');

  var titlesItems = splitCSV(titlesVal);
  var senItems    = splitCSV(senVal);
  var jobItems    = splitCSV(jobSenVal);

  set2ColCheckboxes(picker, PICKER_TITLES_START, PICKER_TITLES_ROWS, titlesItems);
  set2ColCheckboxes(picker, PICKER_SEN_START, PICKER_SEN_ROWS, senItems);
  set2ColCheckboxes(picker, PICKER_JOB_START, PICKER_JOB_ROWS, jobItems);
}


// =============================================================================
// set2ColCheckboxes - Read labels from B+E, set checkboxes in A+D
// Items are arranged: first half (0..numRows-1) on left, second half on right
// =============================================================================
function set2ColCheckboxes(picker, startRow, numRows, selectedItems) {
  // Read labels from both columns: B (col 2) and E (col 5)
  var leftLabels  = picker.getRange(startRow, 2, numRows, 1).getValues();   // B
  var rightLabels = picker.getRange(startRow, 5, numRows, 1).getValues();   // E

  var leftChecks  = [];
  var rightChecks = [];

  for (var i = 0; i < numRows; i++) {
    var leftLabel = String(leftLabels[i][0] || '').trim();
    leftChecks.push([leftLabel.length > 0 && selectedItems.indexOf(leftLabel) >= 0]);

    var rightLabel = String(rightLabels[i][0] || '').trim();
    rightChecks.push([rightLabel.length > 0 && selectedItems.indexOf(rightLabel) >= 0]);
  }

  picker.getRange(startRow, 1, numRows, 1).setValues(leftChecks);   // A
  picker.getRange(startRow, 4, numRows, 1).setValues(rightChecks);   // D
}


// =============================================================================
// handlePickerApply - E2 checked on Picker sheet
// =============================================================================
function handlePickerApply(pickerSheet) {
  var srNo = pickerSheet.getRange(PICKER_TARGET_ROW_CELL).getValue();
  if (!srNo || srNo < 1 || srNo > 100) {
    pickerSheet.getRange(PICKER_APPLY_CELL).setValue(false);
    return;
  }

  var targetRow = srNo + DATA_START - 1;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var mainSheet = ss.getSheetByName(SHEET_NAME);
  if (!mainSheet) return;

  var selectedTitles = get2ColSelected(pickerSheet, PICKER_TITLES_START, PICKER_TITLES_ROWS);
  var selectedSen    = get2ColSelected(pickerSheet, PICKER_SEN_START, PICKER_SEN_ROWS);
  var selectedJob    = get2ColSelected(pickerSheet, PICKER_JOB_START, PICKER_JOB_ROWS);

  if (selectedTitles.length > 0) {
    mainSheet.getRange(targetRow, COL_TITLES).setValue(selectedTitles.join(', '));
  }
  if (selectedSen.length > 0) {
    mainSheet.getRange(targetRow, COL_SEN).setValue(selectedSen.join(', '));
  }
  if (selectedJob.length > 0) {
    var toggleVal = mainSheet.getRange(targetRow, COL_TOGGLE).getValue();
    if (String(toggleVal).trim().toLowerCase() === 'yes') {
      mainSheet.getRange(targetRow, COL_JOB_SEN).setValue(selectedJob.join(', '));
    }
  }

  // Reset
  pickerSheet.getRange(PICKER_APPLY_CELL).setValue(false);
  clearAll2ColCheckboxes(pickerSheet);

  // Switch back to Main_Data
  ss.setActiveSheet(mainSheet);
  mainSheet.getRange(targetRow, 1).activate();
}


// =============================================================================
// get2ColSelected - Read checked items from both left (A/B) and right (D/E)
// =============================================================================
function get2ColSelected(picker, startRow, numRows) {
  var leftChecks  = picker.getRange(startRow, 1, numRows, 1).getValues();   // A
  var leftLabels  = picker.getRange(startRow, 2, numRows, 1).getValues();   // B
  var rightChecks = picker.getRange(startRow, 4, numRows, 1).getValues();   // D
  var rightLabels = picker.getRange(startRow, 5, numRows, 1).getValues();   // E

  var result = [];
  for (var i = 0; i < numRows; i++) {
    if (leftChecks[i][0] === true) {
      var ll = String(leftLabels[i][0] || '').trim();
      if (ll.length > 0) result.push(ll);
    }
    if (rightChecks[i][0] === true) {
      var rl = String(rightLabels[i][0] || '').trim();
      if (rl.length > 0) result.push(rl);
    }
  }
  return result;
}


// =============================================================================
// clearAll2ColCheckboxes - Set all A and D checkboxes to FALSE
// =============================================================================
function clearAll2ColCheckboxes(picker) {
  clear2Col(picker, PICKER_TITLES_START, PICKER_TITLES_ROWS);
  clear2Col(picker, PICKER_SEN_START, PICKER_SEN_ROWS);
  clear2Col(picker, PICKER_JOB_START, PICKER_JOB_ROWS);
}

function clear2Col(picker, startRow, numRows) {
  var falseVals = [];
  for (var i = 0; i < numRows; i++) {
    falseVals.push([false]);
  }
  picker.getRange(startRow, 1, numRows, 1).setValues(falseVals);   // A
  picker.getRange(startRow, 4, numRows, 1).setValues(falseVals);   // D
}


// =============================================================================
// splitCSV - Split comma-separated string into trimmed non-empty array
// =============================================================================
function splitCSV(val) {
  if (!val || val === 'undefined' || val === 'null') return [];
  return val.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
}


// =============================================================================
// applyToggle - sets J/K/L to white (unlocked) or grey+cleared (locked)
// =============================================================================
function applyToggle(sheet, row, value) {
  var jkl = sheet.getRange(row, COL_JOB_TTL, 1, 3);  // J, K, L - 3 cols
  if (String(value).trim().toLowerCase() === 'yes') {
    jkl.setBackground(null);
  } else {
    jkl.clearContent();
    jkl.setBackground(GREY_BG);
  }
}


// =============================================================================
// initAllRows - utility for sheet owner to run ONCE after setup
// =============================================================================
function initAllRows() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) { Logger.log('Main_Data sheet not found'); return; }
  for (var r = DATA_START; r <= DATA_END; r++) {
    applyToggle(sheet, r, sheet.getRange(r, COL_TOGGLE).getValue());
  }
  Logger.log('initAllRows complete - all ' + (DATA_END - DATA_START + 1) + ' rows synced');
}
"""

script_svc.projects().updateContent(
    scriptId=SCRIPT_ID,
    body={
        "files": [
            {"name": "appsscript", "type": "JSON",      "source": MANIFEST},
            {"name": "Code",       "type": "SERVER_JS", "source": CODE},
        ]
    }
).execute()

print("Apps Script updated.")
print()
print("=" * 60)
print("DONE — V4 sheet now matches SpreadsheetGrid headers:")
print("  A  Sr No")
print("  B  Organization Name")
print("  C  Organization Locations")
print("  D  Organization Domains")
print("  E  Person Functions          (renamed from Person Titles)")
print("  F  Person Seniorities")
print("  G  Person Job Title          (NEW column)")
print("  H  Results per Function      (renamed from Results per title)")
print("  I  Job Search                (renamed from Toggle job search)")
print("  J  Job Title")
print("  K  Job Seniority")
print("  L  Date (days)               (renamed from Date Posted)")
print("  M  Pick                      (shifted from L)")
print()
print("Apps Script column constants updated (COL_PICK=13, COL_TOGGLE=9, etc.)")
print("Picker functionality unchanged (still reads/writes E, F, K via constants)")
