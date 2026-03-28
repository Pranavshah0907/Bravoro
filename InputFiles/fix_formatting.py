"""
Fix Google Sheet formatting:
1. Match G1:J1 header style exactly to A1:F1
2. Remove all inner borders from G:J data area — only right border on col J
3. White background on G2:G101
"""

import sys, copy
try:
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build
except ImportError as e:
    print(f"Missing: {e}"); sys.exit(1)

KEY_FILE = 'c:/Pranav/SiddhaAI/02_Bravoro/01_WebsiteRepo/leapleadsai/InputFiles/leap-project-480114-b965559fa9ff.json'
SHEET_ID = '180mh2AlShUPxQ0jFpR87hcpMHUeB0-II_3cPaCKirGE'

creds = Credentials.from_service_account_file(
    KEY_FILE, scopes=['https://www.googleapis.com/auth/spreadsheets'])
svc = build('sheets', 'v4', credentials=creds)

# Read A1 format and get sheet id
print("Reading A1 format...")
resp = svc.spreadsheets().get(
    spreadsheetId=SHEET_ID,
    ranges=['Main_Data!A1:A1'],
    includeGridData=True
).execute()

sheet_props = resp['sheets'][0]['properties']
ws_id = sheet_props['sheetId']
a1_fmt = resp['sheets'][0]['data'][0]['rowData'][0]['values'][0].get('userEnteredFormat', {})

print(f"  Sheet id: {ws_id}")
print(f"  A1 bg: {a1_fmt.get('backgroundColor', 'not set')}")

WHITE  = {'red': 1, 'green': 1, 'blue': 1}
BLACK  = {'red': 0, 'green': 0, 'blue': 0}
NONE   = {'style': 'NONE'}
SOLID  = {'style': 'SOLID', 'color': BLACK}
MEDIUM = {'style': 'SOLID_MEDIUM', 'color': BLACK}

# Apply A1 format to G1:J1, plus force WRAP (header text has line breaks)
header_fmt = copy.deepcopy(a1_fmt)
header_fmt['wrapStrategy'] = 'WRAP'

requests = [

    # 1 — Match header format G1:J1 to A1
    {
        'repeatCell': {
            'range': {'sheetId': ws_id,
                      'startRowIndex': 0, 'endRowIndex': 1,
                      'startColumnIndex': 6, 'endColumnIndex': 10},
            'cell': {'userEnteredFormat': header_fmt},
            'fields': 'userEnteredFormat'
        }
    },

    # 2 — Clear ALL borders on G2:J101
    {
        'updateBorders': {
            'range': {'sheetId': ws_id,
                      'startRowIndex': 1, 'endRowIndex': 101,
                      'startColumnIndex': 6, 'endColumnIndex': 10},
            'top': NONE, 'bottom': NONE, 'left': NONE, 'right': NONE,
            'innerHorizontal': NONE, 'innerVertical': NONE
        }
    },

    # 3 — Right border on col J only (data rows)
    {
        'updateBorders': {
            'range': {'sheetId': ws_id,
                      'startRowIndex': 1, 'endRowIndex': 101,
                      'startColumnIndex': 9, 'endColumnIndex': 10},
            'right': SOLID
        }
    },

    # 4 — Bottom border on row 101 G:J
    {
        'updateBorders': {
            'range': {'sheetId': ws_id,
                      'startRowIndex': 100, 'endRowIndex': 101,
                      'startColumnIndex': 6, 'endColumnIndex': 10},
            'bottom': MEDIUM
        }
    },

    # 5 — White background on G2:G101
    {
        'repeatCell': {
            'range': {'sheetId': ws_id,
                      'startRowIndex': 1, 'endRowIndex': 101,
                      'startColumnIndex': 6, 'endColumnIndex': 7},
            'cell': {'userEnteredFormat': {'backgroundColor': WHITE}},
            'fields': 'userEnteredFormat.backgroundColor'
        }
    },

    # 6 — Also clear header borders on G1:J1, keep only outer right on J1
    {
        'updateBorders': {
            'range': {'sheetId': ws_id,
                      'startRowIndex': 0, 'endRowIndex': 1,
                      'startColumnIndex': 6, 'endColumnIndex': 10},
            'top': MEDIUM, 'bottom': SOLID, 'left': NONE,
            'right': NONE, 'innerVertical': NONE
        }
    },

    # 7 — Right border on J1 header
    {
        'updateBorders': {
            'range': {'sheetId': ws_id,
                      'startRowIndex': 0, 'endRowIndex': 1,
                      'startColumnIndex': 9, 'endColumnIndex': 10},
            'right': SOLID
        }
    },
]

print(f"Sending {len(requests)} requests...")
result = svc.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': requests}
).execute()
print(f"Done — {len(result.get('replies', []))} replies")
