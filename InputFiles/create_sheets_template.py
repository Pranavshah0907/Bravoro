"""
Create BulkSearch plain Google Sheet template (no Apps Script).
Uses service account to create sheet, set up headers + data validation,
then makes it publicly viewable so anyone can open and copy it.

Run once. Prints the template URL to save in memory.
"""

import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

TOKEN_FILE = 'InputFiles/oauth_token.json'
SCOPES     = ['https://www.googleapis.com/auth/spreadsheets']

creds  = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
sheets = build('sheets', 'v4', credentials=creds)

# ── 1. Create spreadsheet ────────────────────────────────────────────────────
print("Creating spreadsheet...")
ss = sheets.spreadsheets().create(body={
    'properties': {'title': 'BulkSearch Template — Bravoro'},
    'sheets': [{'properties': {'title': 'Main_Data'}}]
}).execute()

sid     = ss['spreadsheetId']
grid_id = ss['sheets'][0]['properties']['sheetId']
print(f"Sheet ID: {sid}")

# ── 2. Headers + styling ─────────────────────────────────────────────────────
HEADERS = [
    'Sr No', 'Organization Name', 'Organization Locations',
    'Organization Domains', 'Person Titles', 'Person Seniorities',
    'Results per title', 'Toggle job search', 'Job Title',
    'Job Seniority', 'Date Posted'
]

TEAL = {'red': 0.055, 'green': 0.098, 'blue': 0.098}  # #0e1919 dark teal
WHITE = {'red': 1, 'green': 1, 'blue': 1}

# Column widths (px): A=60, B=200, C=160, D=160, E=180, F=180, G=120, H=130, I=160, J=160, K=110
COL_WIDTHS = [60, 200, 160, 160, 180, 180, 120, 130, 160, 160, 110]

width_requests = [
    {
        'updateDimensionProperties': {
            'range': {'sheetId': grid_id, 'dimension': 'COLUMNS', 'startIndex': i, 'endIndex': i+1},
            'properties': {'pixelSize': w},
            'fields': 'pixelSize'
        }
    }
    for i, w in enumerate(COL_WIDTHS)
]

# ── Data validation helpers ───────────────────────────────────────────────────
def dropdown(grid_id, start_row, end_row, col, options, strict=True):
    return {
        'setDataValidation': {
            'range': {
                'sheetId': grid_id,
                'startRowIndex': start_row, 'endRowIndex': end_row,
                'startColumnIndex': col, 'endColumnIndex': col + 1
            },
            'rule': {
                'condition': {
                    'type': 'ONE_OF_LIST',
                    'values': [{'userEnteredValue': o} for o in options]
                },
                'showCustomUi': True,
                'strict': strict
            }
        }
    }

def number_validation(grid_id, start_row, end_row, col):
    return {
        'setDataValidation': {
            'range': {
                'sheetId': grid_id,
                'startRowIndex': start_row, 'endRowIndex': end_row,
                'startColumnIndex': col, 'endColumnIndex': col + 1
            },
            'rule': {
                'condition': {'type': 'NUMBER_GREATER', 'values': [{'userEnteredValue': '0'}]},
                'showCustomUi': False,
                'strict': True
            }
        }
    }

SENIORITIES_F = [
    'Owner', 'Partner', 'C-Suite (CXO)', 'VP', 'SVP', 'EVP',
    'Director', 'Senior Manager', 'Manager', 'Team Lead',
    'Senior', 'Mid-Level', 'Entry Level', 'Intern', 'Training'
]
JOB_SENIORITY_J = [
    'Internship', 'Entry level', 'Associate',
    'Mid-Senior level', 'Director', 'Executive'
]

requests = [
    # Write headers
    {
        'updateCells': {
            'range': {'sheetId': grid_id, 'startRowIndex': 0, 'endRowIndex': 1,
                      'startColumnIndex': 0, 'endColumnIndex': 11},
            'rows': [{'values': [
                {
                    'userEnteredValue': {'stringValue': h},
                    'userEnteredFormat': {
                        'backgroundColor': TEAL,
                        'textFormat': {'bold': True, 'foregroundColor': WHITE, 'fontSize': 10},
                        'horizontalAlignment': 'CENTER',
                        'verticalAlignment': 'MIDDLE',
                        'wrapStrategy': 'WRAP'
                    }
                }
                for h in HEADERS
            ]}],
            'fields': 'userEnteredValue,userEnteredFormat'
        }
    },
    # Row height: header = 40px
    {
        'updateDimensionProperties': {
            'range': {'sheetId': grid_id, 'dimension': 'ROWS', 'startIndex': 0, 'endIndex': 1},
            'properties': {'pixelSize': 40},
            'fields': 'pixelSize'
        }
    },
    # Freeze row 1
    {
        'updateSheetProperties': {
            'properties': {'sheetId': grid_id, 'gridProperties': {'frozenRowCount': 1}},
            'fields': 'gridProperties.frozenRowCount'
        }
    },
    # Data validation — col F (5): Person Seniorities — suggestions, not strict
    dropdown(grid_id, 1, 101, 5, SENIORITIES_F, strict=False),
    # Data validation — col H (7): Yes / No — strict
    dropdown(grid_id, 1, 101, 7, ['Yes', 'No'], strict=True),
    # Data validation — col J (9): Job Seniority — strict
    dropdown(grid_id, 1, 101, 9, JOB_SENIORITY_J, strict=True),
    # Data validation — col G (6): Results per title — number > 0
    number_validation(grid_id, 1, 101, 6),
    # Data validation — col K (10): Date Posted — number > 0
    number_validation(grid_id, 1, 101, 10),
    # Light grey alternating rows for readability
    {
        'addConditionalFormatRule': {
            'rule': {
                'ranges': [{'sheetId': grid_id, 'startRowIndex': 1, 'endRowIndex': 101,
                            'startColumnIndex': 0, 'endColumnIndex': 11}],
                'booleanRule': {
                    'condition': {'type': 'CUSTOM_FORMULA',
                                  'values': [{'userEnteredValue': '=MOD(ROW(),2)=0'}]},
                    'format': {'backgroundColor': {'red': 0.97, 'green': 0.97, 'blue': 0.97}}
                }
            },
            'index': 0
        }
    },
] + width_requests

sheets.spreadsheets().batchUpdate(spreadsheetId=sid, body={'requests': requests}).execute()
print("Headers, validation, and styling applied.")

# ── 3. Add note to col E header explaining comma-separated format ─────────────
sheets.spreadsheets().values().update(
    spreadsheetId=sid,
    range='Main_Data!E1',
    valueInputOption='RAW',
    body={'values': [['Person Titles']]}
).execute()

# ── 4. Print URL ─────────────────────────────────────────────────────────────
url = f"https://docs.google.com/spreadsheets/d/{sid}/edit"
print()
print("=" * 60)
print("TEMPLATE CREATED")
print("=" * 60)
print(f"Sheet ID : {sid}")
print(f"URL      : {url}")
print()
print()
print("MANUAL STEP — make it public (one time only):")
print("  1. Open the URL above")
print("  2. Click Share (top right)")
print("  3. Change 'Restricted' to 'Anyone with the link' → Viewer")
print("  4. Copy the share link and save it as the TEMPLATE_URL in ExcelUpload.tsx")
