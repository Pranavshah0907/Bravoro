"""
fix_apply_swap.py — Swap APPLY checkbox to D2, label to E2 as "<-- Apply"
Sheet: 1uldSi7FoRVG7JibkbjJ0RY7nEK_kK9gTiRe5tKtbr6Y
Picker sheetId: 1221141600

Before: D2 = "APPLY" label, E2 = checkbox
After:  D2 = checkbox,      E2 = "<-- Apply" label

Also updates Apps Script: PICKER_APPLY_CELL = 'D2', PICKER_APPLY_COL = 4
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
PICKER_SHEET_ID = 1221141600

# Colors
TEAL  = {'red': 0.878, 'green': 0.969, 'blue': 0.961}
WHITE = {'red': 1.0,   'green': 1.0,   'blue': 1.0}
BLACK = {'red': 0.0,   'green': 0.0,   'blue': 0.0}
SOLID = {'style': 'SOLID', 'color': BLACK}

# ── Service account for Sheets ────────────────────────────────────────────────
sa_creds = SACredentials.from_service_account_file(
    KEY_FILE, scopes=['https://www.googleapis.com/auth/spreadsheets'])
sheets = build('sheets', 'v4', credentials=sa_creds)

# ── Part 1: Update D2 and E2 on Picker ───────────────────────────────────────
reqs = [{
    'updateCells': {
        'range': {
            'sheetId': PICKER_SHEET_ID,
            'startRowIndex': 1, 'endRowIndex': 2,
            'startColumnIndex': 3, 'endColumnIndex': 5,  # D2:E2
        },
        'rows': [{'values': [
            # D2: checkbox (APPLY)
            {'userEnteredValue': {'boolValue': False},
             'dataValidation': {
                 'condition': {'type': 'BOOLEAN'},
                 'strict': True,
             },
             'userEnteredFormat': {
                'backgroundColor': WHITE,
                'borders': {'top': SOLID, 'bottom': SOLID, 'left': SOLID, 'right': SOLID},
                'horizontalAlignment': 'CENTER', 'verticalAlignment': 'MIDDLE',
            }},
            # E2: "<-- Apply" label
            {'userEnteredValue': {'stringValue': '\u2190 Apply'},
             'userEnteredFormat': {
                'textFormat': {'bold': True, 'fontSize': 11},
                'horizontalAlignment': 'LEFT', 'verticalAlignment': 'MIDDLE',
                'backgroundColor': TEAL,
            }},
        ]}],
        'fields': 'userEnteredValue,userEnteredFormat,dataValidation'
    }
}]

print("Updating Picker D2 (checkbox) and E2 (<-- Apply label)...")
r = sheets.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': reqs}
).execute()
print(f"  Done -- {len(r.get('replies', []))} operations")

# ── Part 2: Update Apps Script ────────────────────────────────────────────────
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

# Get current script
content = script_svc.projects().getContent(scriptId=SCRIPT_ID).execute()
code_file = None
manifest_file = None
for f in content.get('files', []):
    if f['name'] == 'Code':
        code_file = f
    elif f['name'] == 'appsscript':
        manifest_file = f

code = code_file['source']

# Replace PICKER_APPLY_CELL and PICKER_APPLY_COL
code = code.replace(
    "var PICKER_APPLY_CELL      = 'E2';  // APPLY checkbox",
    "var PICKER_APPLY_CELL      = 'D2';  // APPLY checkbox"
)
code = code.replace(
    "var PICKER_APPLY_COL       = 5;     // E = col 5",
    "var PICKER_APPLY_COL       = 4;     // D = col 4"
)

print("Pushing updated Apps Script (APPLY -> D2, col 4)...")
script_svc.projects().updateContent(
    scriptId=SCRIPT_ID,
    body={
        "files": [
            {"name": "appsscript", "type": "JSON", "source": manifest_file['source']},
            {"name": "Code", "type": "SERVER_JS", "source": code},
        ]
    }
).execute()

print("Done!")
print()
print("Picker Row 2 layout:")
print("  A2: 'Sr No:' label")
print("  B2: number input (1-100)")
print("  C2: spacer")
print("  D2: APPLY checkbox")
print("  E2: '<-- Apply' label")
print("  F2: spacer")
print()
print("Apps Script: PICKER_APPLY_CELL = 'D2', PICKER_APPLY_COL = 4")
