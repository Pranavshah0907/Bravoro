"""
move_picker_col.py — Move Pick column from M (last) to A (first), rename to "Picker"

Before: A=Sr No, B=Org Name, ... L=Date (days), M=Pick
After:  A=Picker, B=Sr No, C=Org Name, ... M=Date (days)

Steps:
  1. Insert new column at index 0 (shifts everything right by 1)
  2. Delete old Pick column (was M=12, now N=13 after insert)
  3. Set up new col A: "Picker" header, checkbox validation A3:A102, formatting
  4. Fix protections (Sr No now col B, columns boundary shifted)
  5. Update Apps Script with new column indices
"""

import json, sys
sys.stdout.reconfigure(encoding='utf-8')
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

# Colors (matching existing headers)
TEAL_BG = {'red': 0.875, 'green': 0.969, 'blue': 0.961}
BLACK   = {'red': 0, 'green': 0, 'blue': 0}
SOLID   = {'style': 'SOLID', 'color': BLACK}

# ── Service account for Sheets ────────────────────────────────────────────────
sa_creds = SACredentials.from_service_account_file(
    KEY_FILE, scopes=['https://www.googleapis.com/auth/spreadsheets'])
sheets = build('sheets', 'v4', credentials=sa_creds)

# ══════════════════════════════════════════════════════════════════════════════
# BATCH 1: Insert col at A, delete old Pick col (now N after shift)
# ══════════════════════════════════════════════════════════════════════════════
b1 = []

# Insert column at index 0 (before current A)
b1.append({
    'insertDimension': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'dimension': 'COLUMNS',
            'startIndex': 0,
            'endIndex': 1,
        },
        'inheritFromBefore': False,
    }
})

# Delete old Pick column: was index 12 (M), after insert it's index 13 (N)
b1.append({
    'deleteDimension': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'dimension': 'COLUMNS',
            'startIndex': 13,
            'endIndex': 14,
        }
    }
})

print("Batch 1: Insert col A + delete old Pick col N...")
r1 = sheets.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': b1}
).execute()
print(f"  Done -- {len(r1.get('replies', []))} ops")

# ══════════════════════════════════════════════════════════════════════════════
# BATCH 2: Set up new col A (Picker)
# ══════════════════════════════════════════════════════════════════════════════
b2 = []

# Merge A1:A2 for header
b2.append({
    'mergeCells': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'startRowIndex': 0, 'endRowIndex': 2,
            'startColumnIndex': 0, 'endColumnIndex': 1,
        },
        'mergeType': 'MERGE_ALL',
    }
})

# Write "Picker" header with matching format
b2.append({
    'updateCells': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'startRowIndex': 0, 'endRowIndex': 1,
            'startColumnIndex': 0, 'endColumnIndex': 1,
        },
        'rows': [{'values': [{
            'userEnteredValue': {'stringValue': 'Picker'},
            'userEnteredFormat': {
                'backgroundColor': TEAL_BG,
                'textFormat': {
                    'foregroundColor': BLACK,
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

# Set column width to 50px (narrow checkbox column)
b2.append({
    'updateDimensionProperties': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'dimension': 'COLUMNS',
            'startIndex': 0, 'endIndex': 1,
        },
        'properties': {'pixelSize': 50},
        'fields': 'pixelSize',
    }
})

# Add checkbox validation on A3:A102
b2.append({
    'setDataValidation': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 0, 'endColumnIndex': 1,
        },
        'rule': {
            'condition': {'type': 'BOOLEAN'},
            'strict': True,
            'showCustomUi': True,
        }
    }
})

# Set all checkboxes to FALSE
false_rows = [{'values': [{'userEnteredValue': {'boolValue': False}}]} for _ in range(100)]
b2.append({
    'updateCells': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 0, 'endColumnIndex': 1,
        },
        'rows': false_rows,
        'fields': 'userEnteredValue',
    }
})

# Format data cells A3:A102 to match header bg + centered
b2.append({
    'repeatCell': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 0, 'endColumnIndex': 1,
        },
        'cell': {'userEnteredFormat': {
            'horizontalAlignment': 'CENTER',
            'verticalAlignment': 'MIDDLE',
        }},
        'fields': 'userEnteredFormat(horizontalAlignment,verticalAlignment)',
    }
})

print("Batch 2: Set up Picker column A...")
r2 = sheets.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': b2}
).execute()
print(f"  Done -- {len(r2.get('replies', []))} ops")

# ══════════════════════════════════════════════════════════════════════════════
# BATCH 3: Fix protections
# ══════════════════════════════════════════════════════════════════════════════
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
        prid = pr['protectedRangeId']
        start_col = rng.get('startColumnIndex', -1)

        # "Sr No" protection: was col 0 (A), now col 1 (B) -- insert shifted it
        # Google should have auto-shifted it, let's verify
        if 'Sr No' in desc:
            print(f"  Sr No protection: startCol={start_col} (expected 1/B)")
            if start_col != 1:
                new_rng = dict(rng)
                new_rng['startColumnIndex'] = 1
                new_rng['endColumnIndex'] = 2
                fix_reqs.append({
                    'updateProtectedRange': {
                        'protectedRange': {
                            'protectedRangeId': prid,
                            'description': desc,
                            'range': new_rng,
                            'warningOnly': True,
                        },
                        'fields': 'range',
                    }
                })
                print(f"    -> Fixing to col B (index 1)")

        # "Columns N+" protection: should have shifted to col index 14 (O+)
        # But we deleted col 13, so it may need adjustment
        if 'Columns' in desc and start_col >= 12:
            col_letter = chr(65 + start_col)
            expected_desc = f"Columns {col_letter}+"
            print(f"  Column boundary protection: '{desc}' at startCol={start_col} ({col_letter})")
            # After insert+delete: should be at index 13 = N
            # We want it at index 13 (N+) since M is the last data col
            if start_col != 13:
                new_rng = dict(rng)
                new_rng['startColumnIndex'] = 13
                if 'endColumnIndex' in new_rng:
                    del new_rng['endColumnIndex']  # open-ended
                fix_reqs.append({
                    'updateProtectedRange': {
                        'protectedRange': {
                            'protectedRangeId': prid,
                            'description': 'Columns N+ -- do not edit',
                            'range': new_rng,
                            'warningOnly': True,
                        },
                        'fields': 'description,range',
                    }
                })
                print(f"    -> Fixing to Columns N+ (index 13)")
            elif desc != 'Columns N+ -- do not edit':
                fix_reqs.append({
                    'updateProtectedRange': {
                        'protectedRange': {
                            'protectedRangeId': prid,
                            'description': 'Columns N+ -- do not edit',
                            'warningOnly': True,
                        },
                        'fields': 'description',
                    }
                })

if fix_reqs:
    sheets.spreadsheets().batchUpdate(
        spreadsheetId=SHEET_ID, body={'requests': fix_reqs}
    ).execute()
    print(f"  Fixed {len(fix_reqs)} protection(s)")
else:
    print("  All protections look correct")

# ══════════════════════════════════════════════════════════════════════════════
# PART 2: Update Apps Script
# ══════════════════════════════════════════════════════════════════════════════
print()
print("Updating Apps Script...")

SCRIPT_SCOPES = [
    'https://www.googleapis.com/auth/script.projects',
    'https://www.googleapis.com/auth/script.deployments',
    'https://www.googleapis.com/auth/script.scriptapp',
    'https://www.googleapis.com/auth/spreadsheets',
]
oauth_creds = UserCredentials.from_authorized_user_file(TOKEN_FILE, SCRIPT_SCOPES)
if not oauth_creds.valid:
    oauth_creds.refresh(tr.Request())
script_svc = build('script', 'v1', credentials=oauth_creds)

# Get current manifest
content = script_svc.projects().getContent(scriptId=SCRIPT_ID).execute()
manifest_src = None
for f in content.get('files', []):
    if f['name'] == 'appsscript':
        manifest_src = f['source']

# New layout (1-based):
# A=1 Picker, B=2 Sr No, C=3 Org Name, D=4 Org Locations, E=5 Org Domains,
# F=6 Person Functions, G=7 Person Seniorities, H=8 Person Job Title,
# I=9 Results per Function, J=10 Job Search, K=11 Job Title,
# L=12 Job Seniority, M=13 Date (days)

CODE = r"""
var SHEET_NAME  = 'Main_Data';
var PICKER_NAME = 'Picker';
var DATA_START  = 3;
var DATA_END    = 102;

// Column indices (1-based) on Main_Data
// A=Picker, B=Sr No, C=Org Name, D=Org Locations, E=Org Domains,
// F=Person Functions, G=Person Seniorities, H=Person Job Title,
// I=Results per Function, J=Job Search, K=Job Title,
// L=Job Seniority, M=Date (days)
var COL_PICK    = 1;   // A - Picker checkbox (triggers Picker pre-load)
var COL_TITLES  = 6;   // F - Person Functions (Picker writes here)
var COL_SEN     = 7;   // G - Person Seniorities (Picker writes here)
var COL_PJTITLE = 8;   // H - Person Job Title (free text)
var COL_RESULTS = 9;   // I - Results per Function
var COL_TOGGLE  = 10;  // J - Job Search (Yes/No)
var COL_JOB_TTL = 11;  // K - Job Title (free text)
var COL_JOB_SEN = 12;  // L - Job Seniority (Picker writes here)
var COL_DATE    = 13;  // M - Date (days) (number)

var GREY_BG = '#f2f2f2';

// Picker sheet layout (1-based row numbers)
// 2-column layout: Left = cols A(cb)+B(label), Right = cols D(cb)+E(label), C = spacer
var PICKER_TARGET_ROW_CELL = 'B2';  // Sr No input (1-100)
var PICKER_APPLY_CELL      = 'D2';  // APPLY checkbox
var PICKER_APPLY_COL       = 4;     // D = col 4

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

    // Picker column (A) - trigger Picker pre-load
    if (col === COL_PICK) {
      if (range.getValue() === true) {
        handlePickTrigger(sheet, row);
      }
      return;
    }

    // Toggle (J): lock or unlock K, L, M
    if (col === COL_TOGGLE) {
      applyToggle(sheet, row, range.getValue());
      return;
    }

    // Person Job Title (H): warn and revert if 2+ Person Functions selected
    if (col === COL_PJTITLE) {
      var funcsVal = String(sheet.getRange(row, COL_TITLES).getValue() || '');
      var funcs = splitCSV(funcsVal);
      if (funcs.length >= 2) {
        range.clearContent();
        SpreadsheetApp.getActive().toast(
          'Person Job Title can only be used when 0 or 1 Person Function is selected. This row has ' + funcs.length + '.',
          'Too many Functions', 5);
      }
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

    // D2 checked (APPLY) - write selections back to Main_Data
    if (pickerRow === 2 && pickerCol === PICKER_APPLY_COL) {
      if (range.getValue() === true) {
        handlePickerApply(sheet);
      }
      return;
    }
  }
}


// =============================================================================
// handlePickTrigger - User checked Picker box on Main_Data row
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
// preloadPickerCheckboxes - Read Main_Data F/G/L, check matching Picker boxes
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
// handlePickerApply - D2 checked on Picker sheet
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
// applyToggle - sets K/L/M to white (unlocked) or grey+cleared (locked)
// =============================================================================
function applyToggle(sheet, row, value) {
  var klm = sheet.getRange(row, COL_JOB_TTL, 1, 3);  // K, L, M - 3 cols
  if (String(value).trim().toLowerCase() === 'yes') {
    klm.setBackground(null);
  } else {
    klm.clearContent();
    klm.setBackground(GREY_BG);
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
""".strip()

script_svc.projects().updateContent(
    scriptId=SCRIPT_ID,
    body={
        'files': [
            {'name': 'appsscript', 'type': 'JSON', 'source': manifest_src},
            {'name': 'Code', 'type': 'SERVER_JS', 'source': CODE},
        ]
    }
).execute()

print("Apps Script updated.")
print()
print("New column layout:")
print("  A(1)  Picker          (checkbox, was M)")
print("  B(2)  Sr No")
print("  C(3)  Organization Name")
print("  D(4)  Organization Locations")
print("  E(5)  Organization Domains")
print("  F(6)  Person Functions")
print("  G(7)  Person Seniorities")
print("  H(8)  Person Job Title")
print("  I(9)  Results per Function")
print("  J(10) Job Search")
print("  K(11) Job Title")
print("  L(12) Job Seniority")
print("  M(13) Date (days)")
