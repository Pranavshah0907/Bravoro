"""
push_updated_script.py — Push updated Apps Script with new column indices
after inserting Person Job Title column (G) into V4 sheet.

New layout: A=Sr No, B-D=Org, E=Person Functions, F=Person Seniorities,
G=Person Job Title (NEW), H=Results per Function, I=Job Search,
J=Job Title, K=Job Seniority, L=Date (days), M=Pick
"""

import json, sys
sys.stdout.reconfigure(encoding='utf-8')
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import google.auth.transport.requests as tr

TOKEN_FILE = 'InputFiles/oauth_token.json'
SCRIPT_ID  = '1Ro0f1tj6cyM9wS9r3U0qN4h2hoXlEAYnDyq--emgzat-aNFeIQybTKd8'

SCOPES = [
    'https://www.googleapis.com/auth/script.projects',
    'https://www.googleapis.com/auth/script.deployments',
    'https://www.googleapis.com/auth/script.scriptapp',
    'https://www.googleapis.com/auth/spreadsheets',
]

creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
if not creds.valid:
    creds.refresh(tr.Request())
    print("Token refreshed.")

svc = build('script', 'v1', credentials=creds)

MANIFEST = json.dumps({
    "timeZone": "America/New_York",
    "dependencies": {},
    "exceptionLogging": "STACKDRIVER",
    "runtimeVersion": "V8",
    "oauthScopes": [
        "https://www.googleapis.com/auth/spreadsheets"
    ]
}, indent=2)

CODE = r"""
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
""".strip()

print(f"Pushing updated Apps Script: {SCRIPT_ID}")

svc.projects().updateContent(
    scriptId=SCRIPT_ID,
    body={
        "files": [
            {"name": "appsscript", "type": "JSON",      "source": MANIFEST},
            {"name": "Code",       "type": "SERVER_JS", "source": CODE},
        ]
    }
).execute()

print("Apps Script updated successfully.")
print()
print("New column constants:")
print("  COL_TITLES  = 5   (E - Person Functions)")
print("  COL_SEN     = 6   (F - Person Seniorities)")
print("  COL_PJTITLE = 7   (G - Person Job Title) NEW")
print("  COL_RESULTS = 8   (H - Results per Function)")
print("  COL_TOGGLE  = 9   (I - Job Search)")
print("  COL_JOB_TTL = 10  (J - Job Title)")
print("  COL_JOB_SEN = 11  (K - Job Seniority)")
print("  COL_DATE    = 12  (L - Date (days))")
print("  COL_PICK    = 13  (M - Pick)")
