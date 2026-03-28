"""
Phase 2 - BulkSearch_Template_V2
Insert button row at row 2:
- Insert blank row at index 1 (data shifts to row 3+)
- Teal bg matching headers
- 44px height
- Merge A2:M2
- Clear borders on row 2
"""

import sys
try:
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build
except ImportError as e:
    print(f"Missing: {e}"); sys.exit(1)

KEY_FILE = 'c:/Pranav/SiddhaAI/02_Bravoro/01_WebsiteRepo/leapleadsai/InputFiles/leap-project-480114-b965559fa9ff.json'
SHEET_ID = '1Z4p1HJf5sMGgnNy_wGI04D-Jd0YNjSYq5A-PcEt-mbs'
WS_ID    = 852813243

creds = Credentials.from_service_account_file(
    KEY_FILE, scopes=['https://www.googleapis.com/auth/spreadsheets'])
svc = build('sheets', 'v4', credentials=creds)

TEAL = {'red': 0.878, 'green': 0.969, 'blue': 0.961}

requests = [

    # 1 - Insert blank row at index 1 (row 2), data shifts to row 3+
    {
        'insertDimension': {
            'range': {
                'sheetId': WS_ID,
                'dimension': 'ROWS',
                'startIndex': 1,
                'endIndex': 2
            },
            'inheritFromBefore': False
        }
    },

    # 2 - Set row 2 height to 44px
    {
        'updateDimensionProperties': {
            'range': {
                'sheetId': WS_ID,
                'dimension': 'ROWS',
                'startIndex': 1,
                'endIndex': 2
            },
            'properties': {'pixelSize': 44},
            'fields': 'pixelSize'
        }
    },

    # 3 - Teal bg on A2:M2
    {
        'repeatCell': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': 1, 'endRowIndex': 2,
                'startColumnIndex': 0, 'endColumnIndex': 13
            },
            'cell': {'userEnteredFormat': {'backgroundColor': TEAL}},
            'fields': 'userEnteredFormat.backgroundColor'
        }
    },

    # 4 - Merge A2:M2
    {
        'mergeCells': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': 1, 'endRowIndex': 2,
                'startColumnIndex': 0, 'endColumnIndex': 13
            },
            'mergeType': 'MERGE_ALL'
        }
    },

    # 5 - Clear borders on row 2
    {
        'updateBorders': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': 1, 'endRowIndex': 2,
                'startColumnIndex': 0, 'endColumnIndex': 13
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
print(f"Done - {len(result.get('replies', []))} replies")
print()
print("Phase 2 complete:")
print("  Row 2 inserted with teal bg, 44px height, merged A2:M2")
print("  Data rows now start at row 3")
print()
print("Next: add the 'Job Seniority Picker' button manually in row 2:")
print("  Insert > Drawing, rounded rectangle, assign script: openSidebarPanel")
