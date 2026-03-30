"""
fix_v4_picker.py — Fix Picker sheet issues:
  1. D2 has "APPLY" text + boolean validation = conflict. Move label to C2, make D2 pure checkbox.
  2. B2 validation should be 1-100 (Sr No), not 3-102 (row index). Script handles +2 offset.

Sheet: 1uldSi7FoRVG7JibkbjJ0RY7nEK_kK9gTiRe5tKtbr6Y
"""

import sys
try:
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build
except ImportError as e:
    print(f"Missing dependency: {e}"); sys.exit(1)

KEY_FILE = 'c:/Pranav/SiddhaAI/02_Bravoro/01_WebsiteRepo/leapleadsai/InputFiles/leap-project-480114-b965559fa9ff.json'
SHEET_ID = '1uldSi7FoRVG7JibkbjJ0RY7nEK_kK9gTiRe5tKtbr6Y'
PICKER_SHEET_ID = 774468219

TEAL  = {'red': 0.878, 'green': 0.969, 'blue': 0.961}
BLACK = {'red': 0.0,   'green': 0.0,   'blue': 0.0}
WHITE = {'red': 1.0,   'green': 1.0,   'blue': 1.0}
SOLID = {'style': 'SOLID', 'color': BLACK}

creds  = Credentials.from_service_account_file(
    KEY_FILE, scopes=['https://www.googleapis.com/auth/spreadsheets'])
sheets = build('sheets', 'v4', credentials=creds)

reqs = []

# ── Fix 1: Move "APPLY" label to C2, clear D2 text, set D2 as pure checkbox ──

# Write C2 = "APPLY" label, D2 = FALSE (checkbox value)
reqs.append({
    'updateCells': {
        'range': {
            'sheetId': PICKER_SHEET_ID,
            'startRowIndex': 1, 'endRowIndex': 2,
            'startColumnIndex': 2, 'endColumnIndex': 5  # C2:E2
        },
        'rows': [{'values': [
            # C2: "APPLY" label
            {'userEnteredValue': {'stringValue': 'APPLY'},
             'userEnteredFormat': {
                'textFormat': {'bold': True, 'fontSize': 11, 'foregroundColor': BLACK},
                'horizontalAlignment': 'RIGHT', 'verticalAlignment': 'MIDDLE',
                'backgroundColor': TEAL,
            }},
            # D2: checkbox (FALSE)
            {'userEnteredValue': {'boolValue': False},
             'userEnteredFormat': {
                'horizontalAlignment': 'CENTER', 'verticalAlignment': 'MIDDLE',
                'backgroundColor': WHITE,
                'borders': {'top': SOLID, 'bottom': SOLID, 'left': SOLID, 'right': SOLID},
            }},
            # E2: empty
            {},
        ]}],
        'fields': 'userEnteredValue,userEnteredFormat'
    }
})

# Widen C column to fit "APPLY" label (was 20px, make 70px)
reqs.append({
    'updateDimensionProperties': {
        'range': {'sheetId': PICKER_SHEET_ID, 'dimension': 'COLUMNS', 'startIndex': 2, 'endIndex': 3},
        'properties': {'pixelSize': 70}, 'fields': 'pixelSize'
    }
})

# D2 checkbox validation (re-apply on clean cell)
reqs.append({
    'setDataValidation': {
        'range': {
            'sheetId': PICKER_SHEET_ID,
            'startRowIndex': 1, 'endRowIndex': 2,
            'startColumnIndex': 3, 'endColumnIndex': 4  # D2
        },
        'rule': {
            'condition': {'type': 'BOOLEAN'},
            'showCustomUi': True,
            'strict': True
        }
    }
})

# ── Fix 2: B2 validation 1-100 instead of 3-102 ────────────────────────────

# Clear existing validation first
reqs.append({
    'setDataValidation': {
        'range': {
            'sheetId': PICKER_SHEET_ID,
            'startRowIndex': 1, 'endRowIndex': 2,
            'startColumnIndex': 1, 'endColumnIndex': 2  # B2
        },
        'rule': {
            'condition': {
                'type': 'NUMBER_BETWEEN',
                'values': [
                    {'userEnteredValue': '1'},
                    {'userEnteredValue': '100'},
                ]
            },
            'showCustomUi': False,
            'strict': True
        }
    }
})

# Also update A2 label to say "Sr No:" instead of "Target Row:" for clarity
reqs.append({
    'updateCells': {
        'range': {
            'sheetId': PICKER_SHEET_ID,
            'startRowIndex': 1, 'endRowIndex': 2,
            'startColumnIndex': 0, 'endColumnIndex': 1  # A2
        },
        'rows': [{'values': [
            {'userEnteredValue': {'stringValue': 'Sr No:'},
             'userEnteredFormat': {'textFormat': {'bold': True}, 'horizontalAlignment': 'RIGHT', 'verticalAlignment': 'MIDDLE'}},
        ]}],
        'fields': 'userEnteredValue,userEnteredFormat'
    }
})

print(f"Sending {len(reqs)} fix requests...")
r = sheets.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': reqs}
).execute()
print(f"Done -- {len(r.get('replies', []))} replies")
print()
print("Fixes applied:")
print("  - D2: pure checkbox (APPLY label moved to C2)")
print("  - B2: validation changed to 1-100 (Sr No, not row index)")
print("  - A2: label changed to 'Sr No:' for clarity")
