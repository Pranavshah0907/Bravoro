"""
Phase 3 - BulkSearch_Template_V2
After button row insert (data now rows 3-103):
1. Re-apply Yes/No dropdown to J3:J103
2. White bg on J3:J103 (toggle col)
3. Grey bg on K3:M103
4. Number validation on M3:M103
5. Remove inner borders from J3:M103
6. Right border on col M
7. Bottom border on row 103
8. Warning protections: row 1, row 2, rows 104+, cols N+
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

GREY  = {'red': 0.9490196, 'green': 0.9490196, 'blue': 0.9490196}
WHITE = {'red': 1.0, 'green': 1.0, 'blue': 1.0}
BLACK = {'red': 0.0, 'green': 0.0, 'blue': 0.0}
NONE  = {'style': 'NONE'}
SOLID = {'style': 'SOLID',        'color': BLACK}
MEDUM = {'style': 'SOLID_MEDIUM', 'color': BLACK}

DATA_S = 2    # row 3 (0-indexed, inclusive)
DATA_E = 103  # row 103 (0-indexed, exclusive = row 103 inclusive)

requests = [

    # 1. Yes/No dropdown J3:J103 (col index 9)
    {
        'setDataValidation': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': DATA_S, 'endRowIndex': DATA_E,
                'startColumnIndex': 9, 'endColumnIndex': 10
            },
            'rule': {
                'condition': {
                    'type': 'ONE_OF_LIST',
                    'values': [
                        {'userEnteredValue': 'Yes'},
                        {'userEnteredValue': 'No'}
                    ]
                },
                'showCustomUi': True,
                'strict': False
            }
        }
    },

    # 2. White bg on J3:J103
    {
        'repeatCell': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': DATA_S, 'endRowIndex': DATA_E,
                'startColumnIndex': 9, 'endColumnIndex': 10
            },
            'cell': {'userEnteredFormat': {'backgroundColor': WHITE}},
            'fields': 'userEnteredFormat.backgroundColor'
        }
    },

    # 3. Grey bg on K3:M103
    {
        'repeatCell': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': DATA_S, 'endRowIndex': DATA_E,
                'startColumnIndex': 10, 'endColumnIndex': 13
            },
            'cell': {'userEnteredFormat': {'backgroundColor': GREY}},
            'fields': 'userEnteredFormat.backgroundColor'
        }
    },

    # 4. Number validation M3:M103
    {
        'setDataValidation': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': DATA_S, 'endRowIndex': DATA_E,
                'startColumnIndex': 12, 'endColumnIndex': 13
            },
            'rule': {
                'condition': {
                    'type': 'NUMBER_GREATER_THAN_EQ',
                    'values': [{'userEnteredValue': '1'}]
                },
                'showCustomUi': False,
                'strict': True
            }
        }
    },

    # 5. Remove inner borders from J3:M103
    {
        'updateBorders': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': DATA_S, 'endRowIndex': DATA_E,
                'startColumnIndex': 9, 'endColumnIndex': 13
            },
            'top': NONE, 'bottom': NONE, 'left': NONE, 'right': NONE,
            'innerHorizontal': NONE, 'innerVertical': NONE
        }
    },

    # 6. Right border on col M (end of block)
    {
        'updateBorders': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': DATA_S, 'endRowIndex': DATA_E,
                'startColumnIndex': 12, 'endColumnIndex': 13
            },
            'right': SOLID
        }
    },

    # 7. Bottom border on row 103
    {
        'updateBorders': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': 102, 'endRowIndex': 103,
                'startColumnIndex': 0, 'endColumnIndex': 13
            },
            'bottom': MEDUM
        }
    },

    # 8a. Warning protection: header row (row 1)
    {
        'addProtectedRange': {
            'protectedRange': {
                'range': {
                    'sheetId': WS_ID,
                    'startRowIndex': 0, 'endRowIndex': 1
                },
                'description': 'Header row - do not edit',
                'warningOnly': True
            }
        }
    },

    # 8b. Warning protection: button row (row 2)
    {
        'addProtectedRange': {
            'protectedRange': {
                'range': {
                    'sheetId': WS_ID,
                    'startRowIndex': 1, 'endRowIndex': 2
                },
                'description': 'Button row - do not edit',
                'warningOnly': True
            }
        }
    },

    # 8c. Warning protection: rows 104+ (below data)
    {
        'addProtectedRange': {
            'protectedRange': {
                'range': {
                    'sheetId': WS_ID,
                    'startRowIndex': 103, 'endRowIndex': 1000
                },
                'description': 'Below data area - do not edit',
                'warningOnly': True
            }
        }
    },

    # 8d. Warning protection: cols N+ (index 13+)
    {
        'addProtectedRange': {
            'protectedRange': {
                'range': {
                    'sheetId': WS_ID,
                    'startColumnIndex': 13
                },
                'description': 'Columns N+ - do not edit',
                'warningOnly': True
            }
        }
    },
]

print(f"Sending {len(requests)} requests...")
result = svc.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': requests}
).execute()
print(f"Done - {len(result.get('replies', []))} replies")
print()
print("Phase 3 complete:")
print("  Yes/No dropdown, white/grey bg, number validation on rows 3-103")
print("  Borders applied")
print("  Warning protections: rows 1, 2, 104+, cols N+")
