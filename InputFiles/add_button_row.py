"""
Insert a dedicated button row at row 2:
- Inserts a new empty row 2 (data shifts to row 3+)
- Styles row 2 with a clean teal-tinted background, taller height
- Merges A2:J2 so it looks like one banner area
- Existing formatting/validation on data rows shifts down automatically
"""

import sys
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

# Get Main_Data sheet id
resp = svc.spreadsheets().get(spreadsheetId=SHEET_ID).execute()
ws_id = next(s['properties']['sheetId'] for s in resp['sheets']
             if s['properties']['title'] == 'Main_Data')
print(f"Main_Data sheetId: {ws_id}")

TEAL_LIGHT = {'red': 0.878, 'green': 0.969, 'blue': 0.961}  # matches header family
WHITE      = {'red': 1.0,   'green': 1.0,   'blue': 1.0}

requests = [

    # 1 — Insert a new blank row at index 1 (row 2)
    {
        'insertDimension': {
            'range': {
                'sheetId': ws_id,
                'dimension': 'ROWS',
                'startIndex': 1,
                'endIndex': 2
            },
            'inheritFromBefore': False
        }
    },

    # 2 — Set row 2 height to 44px (room for a button drawing)
    {
        'updateDimensionProperties': {
            'range': {
                'sheetId': ws_id,
                'dimension': 'ROWS',
                'startIndex': 1,
                'endIndex': 2
            },
            'properties': {'pixelSize': 44},
            'fields': 'pixelSize'
        }
    },

    # 3 — Background on A2:J2
    {
        'repeatCell': {
            'range': {
                'sheetId': ws_id,
                'startRowIndex': 1, 'endRowIndex': 2,
                'startColumnIndex': 0, 'endColumnIndex': 10
            },
            'cell': {'userEnteredFormat': {'backgroundColor': TEAL_LIGHT}},
            'fields': 'userEnteredFormat.backgroundColor'
        }
    },

    # 4 — Merge A2:J2 into one banner cell
    {
        'mergeCells': {
            'range': {
                'sheetId': ws_id,
                'startRowIndex': 1, 'endRowIndex': 2,
                'startColumnIndex': 0, 'endColumnIndex': 10
            },
            'mergeType': 'MERGE_ALL'
        }
    },

    # 5 — Clear all borders on row 2
    {
        'updateBorders': {
            'range': {
                'sheetId': ws_id,
                'startRowIndex': 1, 'endRowIndex': 2,
                'startColumnIndex': 0, 'endColumnIndex': 10
            },
            'top':    {'style': 'NONE'},
            'bottom': {'style': 'NONE'},
            'left':   {'style': 'NONE'},
            'right':  {'style': 'NONE'}
        }
    },
]

print(f"Sending {len(requests)} requests...")
result = svc.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': requests}
).execute()
print(f"Done — {len(result.get('replies', []))} replies")
print()
print("Row 2 is ready. Now add the button manually:")
print("  1. In the sheet, click Insert > Drawing")
print("  2. Draw a rounded rectangle, type 'Job Seniority Picker', style it")
print("  3. Click Save and Close — drag the drawing into row 2")
print("  4. Click the 3-dot menu on the drawing > Assign script")
print("  5. Type:  openSidebarPanel  then click OK")
