"""
Phase 1 — BulkSearch_Template_V2 (correct sheet)
1. Reformat existing A1:I1 headers to teal (override dark purple)
2. Add J1:M1 headers with same teal style
3. Set col widths J=160, K=175, L=130, M=175
4. Yes/No dropdown J2:J101
5. Grey bg K2:M101
6. Number validation M2:M101
7. Borders: right on col M, bottom on row 101, header borders J1:M1
"""

import sys
try:
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build
except ImportError as e:
    print(f"Missing: {e}"); sys.exit(1)

KEY_FILE = 'c:/Pranav/SiddhaAI/02_Bravoro/01_WebsiteRepo/leapleadsai/InputFiles/leap-project-480114-b965559fa9ff.json'
SHEET_ID = '1Z4p1HJf5sMGgnNy_wGI04D-Jd0YNjSYq5A-PcEt-mbs'
WS_ID    = 852813243  # Main_Data sheetId

creds = Credentials.from_service_account_file(
    KEY_FILE, scopes=['https://www.googleapis.com/auth/spreadsheets'])
svc = build('sheets', 'v4', credentials=creds)

# ── Colors ──────────────────────────────────────────────────────────────────
TEAL  = {'red': 0.878, 'green': 0.969, 'blue': 0.961}   # #E0F7F4 (teal light)
WHITE = {'red': 1.0,   'green': 1.0,   'blue': 1.0}
GREY  = {'red': 0.9490196, 'green': 0.9490196, 'blue': 0.9490196}
BLACK = {'red': 0.0,   'green': 0.0,   'blue': 0.0}
NONE  = {'style': 'NONE'}
SOLID = {'style': 'SOLID',        'color': BLACK}
MEDUM = {'style': 'SOLID_MEDIUM', 'color': BLACK}

HEADER_FMT = {
    'backgroundColor': TEAL,
    'textFormat': {
        'foregroundColor': {'red': 0.0, 'green': 0.0, 'blue': 0.0},
        'bold': True,
        'fontSize': 10,
    },
    'horizontalAlignment': 'CENTER',
    'verticalAlignment': 'MIDDLE',
    'wrapStrategy': 'WRAP',
}

requests = [

    # ── 1. Reformat A1:I1 — override dark purple with teal ───────────────────
    {
        'repeatCell': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': 0, 'endRowIndex': 1,
                'startColumnIndex': 0, 'endColumnIndex': 9
            },
            'cell': {'userEnteredFormat': HEADER_FMT},
            'fields': 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
        }
    },

    # ── 2a. Write J1:M1 header values ────────────────────────────────────────
    {
        'updateCells': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': 0, 'endRowIndex': 1,
                'startColumnIndex': 9, 'endColumnIndex': 13
            },
            'rows': [{
                'values': [
                    {'userEnteredValue': {'stringValue': 'Toggle job search'}},
                    {'userEnteredValue': {'stringValue': 'Job Title\n(comma separated)'}},
                    {'userEnteredValue': {'stringValue': 'Job Seniority'}},
                    {'userEnteredValue': {'stringValue': 'Date Posted\n(max age days)'}},
                ]
            }],
            'fields': 'userEnteredValue'
        }
    },

    # ── 2b. Format J1:M1 to match headers ────────────────────────────────────
    {
        'repeatCell': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': 0, 'endRowIndex': 1,
                'startColumnIndex': 9, 'endColumnIndex': 13
            },
            'cell': {'userEnteredFormat': HEADER_FMT},
            'fields': 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
        }
    },

    # ── 3. Column widths: J=160, K=175, L=130, M=175 ─────────────────────────
    {
        'updateDimensionProperties': {
            'range': {'sheetId': WS_ID, 'dimension': 'COLUMNS', 'startIndex': 9,  'endIndex': 10},
            'properties': {'pixelSize': 160}, 'fields': 'pixelSize'
        }
    },
    {
        'updateDimensionProperties': {
            'range': {'sheetId': WS_ID, 'dimension': 'COLUMNS', 'startIndex': 10, 'endIndex': 11},
            'properties': {'pixelSize': 175}, 'fields': 'pixelSize'
        }
    },
    {
        'updateDimensionProperties': {
            'range': {'sheetId': WS_ID, 'dimension': 'COLUMNS', 'startIndex': 11, 'endIndex': 12},
            'properties': {'pixelSize': 130}, 'fields': 'pixelSize'
        }
    },
    {
        'updateDimensionProperties': {
            'range': {'sheetId': WS_ID, 'dimension': 'COLUMNS', 'startIndex': 12, 'endIndex': 13},
            'properties': {'pixelSize': 175}, 'fields': 'pixelSize'
        }
    },

    # ── 4. Yes/No dropdown J2:J101 ────────────────────────────────────────────
    {
        'setDataValidation': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': 1, 'endRowIndex': 101,
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

    # ── 5. Grey bg K2:M101 ───────────────────────────────────────────────────
    {
        'repeatCell': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': 1, 'endRowIndex': 101,
                'startColumnIndex': 10, 'endColumnIndex': 13
            },
            'cell': {'userEnteredFormat': {'backgroundColor': GREY}},
            'fields': 'userEnteredFormat.backgroundColor'
        }
    },

    # ── 6. Number validation M2:M101 (whole number >= 1) ─────────────────────
    {
        'setDataValidation': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': 1, 'endRowIndex': 101,
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

    # ── 7a. Remove inner borders from J2:M101 ────────────────────────────────
    {
        'updateBorders': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': 1, 'endRowIndex': 101,
                'startColumnIndex': 9, 'endColumnIndex': 13
            },
            'top': NONE, 'bottom': NONE, 'left': NONE, 'right': NONE,
            'innerHorizontal': NONE, 'innerVertical': NONE
        }
    },

    # ── 7b. Right border on col M (end of our block) ─────────────────────────
    {
        'updateBorders': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': 1, 'endRowIndex': 101,
                'startColumnIndex': 12, 'endColumnIndex': 13
            },
            'right': SOLID
        }
    },

    # ── 7c. Bottom border on row 101 ─────────────────────────────────────────
    {
        'updateBorders': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': 100, 'endRowIndex': 101,
                'startColumnIndex': 0, 'endColumnIndex': 13
            },
            'bottom': MEDUM
        }
    },

    # ── 7d. Header borders on J1:M1 ──────────────────────────────────────────
    {
        'updateBorders': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': 0, 'endRowIndex': 1,
                'startColumnIndex': 9, 'endColumnIndex': 13
            },
            'top': MEDUM, 'bottom': MEDUM, 'left': SOLID, 'right': MEDUM,
            'innerVertical': SOLID
        }
    },
]

print(f"Sending {len(requests)} requests to sheet {SHEET_ID}...")
result = svc.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': requests}
).execute()
print(f"Done — {len(result.get('replies', []))} replies")
print()
print("Phase 1 complete:")
print("  ✓ A1:I1 headers reformatted to teal")
print("  ✓ J1:M1 headers added with teal style")
print("  ✓ Column widths set (J=160, K=175, L=130, M=175)")
print("  ✓ Yes/No dropdown on J2:J101")
print("  ✓ Grey bg on K2:M101")
print("  ✓ Number validation on M2:M101")
print("  ✓ Borders applied")
