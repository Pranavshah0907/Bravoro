"""
1. Extend Yes/No dropdown, grey BG, number validation, borders to row 103
2. Add warning-only protection on header row, button row, and below-data rows
NOTE: Google Sheets does not support password-based protection.
      Protection here is warning-only (shows a warning before editing protected cells).
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

resp = svc.spreadsheets().get(spreadsheetId=SHEET_ID).execute()
ws_id = next(s['properties']['sheetId'] for s in resp['sheets']
             if s['properties']['title'] == 'Main_Data')
print(f"Main_Data sheetId: {ws_id}")

# Data range: rows 3-103  →  indices startRowIndex=2, endRowIndex=103
GREY  = {'red': 0.9490196, 'green': 0.9490196, 'blue': 0.9490196}
WHITE = {'red': 1.0, 'green': 1.0, 'blue': 1.0}
BLACK = {'red': 0.0, 'green': 0.0, 'blue': 0.0}
NONE  = {'style': 'NONE'}
SOLID = {'style': 'SOLID',        'color': BLACK}
MEDUM = {'style': 'SOLID_MEDIUM', 'color': BLACK}

DATA_S = 2    # row 3 (0-indexed start, inclusive)
DATA_E = 103  # row 103 (0-indexed end, exclusive = row 103 inclusive)

requests = [

    # ── Extend Yes/No dropdown to G3:G103 ─────────────────────────────────────
    {
        'setDataValidation': {
            'range': {
                'sheetId': ws_id,
                'startRowIndex': DATA_S, 'endRowIndex': DATA_E,
                'startColumnIndex': 6,   'endColumnIndex': 7
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

    # ── White background on G3:G103 (toggle col) ──────────────────────────────
    {
        'repeatCell': {
            'range': {
                'sheetId': ws_id,
                'startRowIndex': DATA_S, 'endRowIndex': DATA_E,
                'startColumnIndex': 6,   'endColumnIndex': 7
            },
            'cell': {'userEnteredFormat': {'backgroundColor': WHITE}},
            'fields': 'userEnteredFormat.backgroundColor'
        }
    },

    # ── Grey background on H3:J103 (locked when toggle=No) ───────────────────
    {
        'repeatCell': {
            'range': {
                'sheetId': ws_id,
                'startRowIndex': DATA_S, 'endRowIndex': DATA_E,
                'startColumnIndex': 7,   'endColumnIndex': 10
            },
            'cell': {'userEnteredFormat': {'backgroundColor': GREY}},
            'fields': 'userEnteredFormat.backgroundColor'
        }
    },

    # ── Number validation on J3:J103 (whole number >= 1) ─────────────────────
    {
        'setDataValidation': {
            'range': {
                'sheetId': ws_id,
                'startRowIndex': DATA_S, 'endRowIndex': DATA_E,
                'startColumnIndex': 9,   'endColumnIndex': 10
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

    # ── Remove borders from G3:J103 (no inner cell borders) ──────────────────
    {
        'updateBorders': {
            'range': {
                'sheetId': ws_id,
                'startRowIndex': DATA_S, 'endRowIndex': DATA_E,
                'startColumnIndex': 6,   'endColumnIndex': 10
            },
            'top': NONE, 'bottom': NONE, 'left': NONE, 'right': NONE,
            'innerHorizontal': NONE, 'innerVertical': NONE
        }
    },

    # ── Right border on col J3:J103 ────────────────────────────────────────────
    {
        'updateBorders': {
            'range': {
                'sheetId': ws_id,
                'startRowIndex': DATA_S, 'endRowIndex': DATA_E,
                'startColumnIndex': 9,   'endColumnIndex': 10
            },
            'right': SOLID
        }
    },

    # ── Remove old bottom border on row 102 ────────────────────────────────────
    {
        'updateBorders': {
            'range': {
                'sheetId': ws_id,
                'startRowIndex': 101, 'endRowIndex': 102,
                'startColumnIndex': 0, 'endColumnIndex': 10
            },
            'bottom': NONE
        }
    },

    # ── Bottom border on row 103 (end of data area) ────────────────────────────
    {
        'updateBorders': {
            'range': {
                'sheetId': ws_id,
                'startRowIndex': 102, 'endRowIndex': 103,
                'startColumnIndex': 0, 'endColumnIndex': 10
            },
            'bottom': MEDUM
        }
    },

    # ── Protect header row (row 1) — warning only ──────────────────────────────
    {
        'addProtectedRange': {
            'protectedRange': {
                'range': {
                    'sheetId': ws_id,
                    'startRowIndex': 0, 'endRowIndex': 1
                },
                'description': 'Header row — do not edit',
                'warningOnly': True
            }
        }
    },

    # ── Protect button row (row 2) — warning only ──────────────────────────────
    {
        'addProtectedRange': {
            'protectedRange': {
                'range': {
                    'sheetId': ws_id,
                    'startRowIndex': 1, 'endRowIndex': 2
                },
                'description': 'Button row — do not edit',
                'warningOnly': True
            }
        }
    },

    # ── Protect rows below data (row 104+) — warning only ─────────────────────
    {
        'addProtectedRange': {
            'protectedRange': {
                'range': {
                    'sheetId': ws_id,
                    'startRowIndex': 103, 'endRowIndex': 1000
                },
                'description': 'Below data area — do not edit',
                'warningOnly': True
            }
        }
    },
]

print(f"Sending {len(requests)} requests...")
result = svc.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': requests}
).execute()
print(f"Done — {len(result.get('replies', []))} replies")
print()
print("NOTE: Google Sheets does not support password-based protection.")
print("Protection applied: header row, button row, and rows below 103")
print("are warning-only — users see a warning before editing those cells.")
