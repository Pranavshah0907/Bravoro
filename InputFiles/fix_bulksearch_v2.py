"""
Fix BulkSearch_Template_V2:
1. Unmerge A2:M2, merge each column pair vertically (A1:A2, B1:B2, ... M1:M2), center+middle
2. Data range corrected to rows 3-102 (100 entries), clear row 103 formatting
3. Freeze row 2 (instead of row 1)
4. Fix protections: rows 103+ (was 104+), no protection on J3:M102 data cells
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

# ── Fetch existing protections to delete them all and re-add correctly ───────
resp = svc.spreadsheets().get(
    spreadsheetId=SHEET_ID,
    fields='sheets(properties(sheetId,title),protectedRanges)'
).execute()
main_data = next(s for s in resp['sheets'] if s['properties']['title'] == 'Main_Data')
existing_protections = main_data.get('protectedRanges', [])
print(f"Found {len(existing_protections)} existing protections — will delete and re-add correctly")

# ── Colors ───────────────────────────────────────────────────────────────────
GREY  = {'red': 0.9490196, 'green': 0.9490196, 'blue': 0.9490196}
WHITE = {'red': 1.0, 'green': 1.0, 'blue': 1.0}
BLACK = {'red': 0.0, 'green': 0.0, 'blue': 0.0}
NONE  = {'style': 'NONE'}
SOLID = {'style': 'SOLID',        'color': BLACK}
MEDUM = {'style': 'SOLID_MEDIUM', 'color': BLACK}

requests = []

# ── 0. Remove freeze first so we can merge frozen+non-frozen rows ────────────
requests.append({
    'updateSheetProperties': {
        'properties': {
            'sheetId': WS_ID,
            'gridProperties': {'frozenRowCount': 0}
        },
        'fields': 'gridProperties.frozenRowCount'
    }
})

# ── Delete all existing protections on Main_Data ─────────────────────────────
for p in existing_protections:
    requests.append({
        'deleteProtectedRange': {
            'protectedRangeId': p['protectedRangeId']
        }
    })

# ── 1a. Unmerge A2:M2 (remove the horizontal merge from Phase 2) ─────────────
requests.append({
    'unmergeCells': {
        'range': {
            'sheetId': WS_ID,
            'startRowIndex': 1, 'endRowIndex': 2,
            'startColumnIndex': 0, 'endColumnIndex': 13
        }
    }
})

# ── 1b. Merge each column pair vertically: col0 rows0-2, col1 rows0-2, ... ───
for col in range(13):
    requests.append({
        'mergeCells': {
            'range': {
                'sheetId': WS_ID,
                'startRowIndex': 0, 'endRowIndex': 2,
                'startColumnIndex': col, 'endColumnIndex': col + 1
            },
            'mergeType': 'MERGE_ALL'
        }
    })

# ── 1c. Center + Middle align on merged header range A1:M2 ───────────────────
requests.append({
    'repeatCell': {
        'range': {
            'sheetId': WS_ID,
            'startRowIndex': 0, 'endRowIndex': 2,
            'startColumnIndex': 0, 'endColumnIndex': 13
        },
        'cell': {
            'userEnteredFormat': {
                'horizontalAlignment': 'CENTER',
                'verticalAlignment': 'MIDDLE'
            }
        },
        'fields': 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
    }
})

# ── 2. Correct data range to rows 3-102 (was rows 3-103) ─────────────────────

# Yes/No dropdown J3:J102
requests.append({
    'setDataValidation': {
        'range': {
            'sheetId': WS_ID,
            'startRowIndex': 2, 'endRowIndex': 102,
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
})

# White bg J3:J102
requests.append({
    'repeatCell': {
        'range': {
            'sheetId': WS_ID,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 9, 'endColumnIndex': 10
        },
        'cell': {'userEnteredFormat': {'backgroundColor': WHITE}},
        'fields': 'userEnteredFormat.backgroundColor'
    }
})

# Grey bg K3:M102
requests.append({
    'repeatCell': {
        'range': {
            'sheetId': WS_ID,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 10, 'endColumnIndex': 13
        },
        'cell': {'userEnteredFormat': {'backgroundColor': GREY}},
        'fields': 'userEnteredFormat.backgroundColor'
    }
})

# Number validation M3:M102
requests.append({
    'setDataValidation': {
        'range': {
            'sheetId': WS_ID,
            'startRowIndex': 2, 'endRowIndex': 102,
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
})

# Remove inner borders J3:M102
requests.append({
    'updateBorders': {
        'range': {
            'sheetId': WS_ID,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 9, 'endColumnIndex': 13
        },
        'top': NONE, 'bottom': NONE, 'left': NONE, 'right': NONE,
        'innerHorizontal': NONE, 'innerVertical': NONE
    }
})

# Right border on col M (J3:M102 block end)
requests.append({
    'updateBorders': {
        'range': {
            'sheetId': WS_ID,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 12, 'endColumnIndex': 13
        },
        'right': SOLID
    }
})

# Bottom border on row 102 (end of data)
requests.append({
    'updateBorders': {
        'range': {
            'sheetId': WS_ID,
            'startRowIndex': 101, 'endRowIndex': 102,
            'startColumnIndex': 0, 'endColumnIndex': 13
        },
        'bottom': MEDUM
    }
})

# Clear row 103 of any leftover formatting from Phase 3 (J103:M103)
requests.append({
    'setDataValidation': {
        'range': {
            'sheetId': WS_ID,
            'startRowIndex': 102, 'endRowIndex': 103,
            'startColumnIndex': 9, 'endColumnIndex': 13
        },
        'rule': None  # Clears validation
    }
})
requests.append({
    'repeatCell': {
        'range': {
            'sheetId': WS_ID,
            'startRowIndex': 102, 'endRowIndex': 103,
            'startColumnIndex': 9, 'endColumnIndex': 13
        },
        'cell': {'userEnteredFormat': {'backgroundColor': WHITE}},
        'fields': 'userEnteredFormat.backgroundColor'
    }
})

# ── 3. Freeze row 2 ───────────────────────────────────────────────────────────
requests.append({
    'updateSheetProperties': {
        'properties': {
            'sheetId': WS_ID,
            'gridProperties': {
                'frozenRowCount': 2
            }
        },
        'fields': 'gridProperties.frozenRowCount'
    }
})

# ── 4. Re-add correct protections ────────────────────────────────────────────
# Row 1 (header)
requests.append({
    'addProtectedRange': {
        'protectedRange': {
            'range': {'sheetId': WS_ID, 'startRowIndex': 0, 'endRowIndex': 1},
            'description': 'Header row - do not edit',
            'warningOnly': True
        }
    }
})
# Row 2 (header continuation - merged with row 1)
requests.append({
    'addProtectedRange': {
        'protectedRange': {
            'range': {'sheetId': WS_ID, 'startRowIndex': 1, 'endRowIndex': 2},
            'description': 'Header row 2 - do not edit',
            'warningOnly': True
        }
    }
})
# Rows 103+ (below data — data ends at row 102)
requests.append({
    'addProtectedRange': {
        'protectedRange': {
            'range': {'sheetId': WS_ID, 'startRowIndex': 102, 'endRowIndex': 1000},
            'description': 'Below data area - do not edit',
            'warningOnly': True
        }
    }
})
# Cols N+ (index 13+)
requests.append({
    'addProtectedRange': {
        'protectedRange': {
            'range': {'sheetId': WS_ID, 'startColumnIndex': 13},
            'description': 'Columns N+ - do not edit',
            'warningOnly': True
        }
    }
})

print(f"Sending {len(requests)} requests...")
result = svc.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': requests}
).execute()
print(f"Done - {len(result.get('replies', []))} replies")
print()
print("Fixes applied:")
print("  A2:M2 unmerged, each column now merged vertically (A1:A2, B1:B2, ... M1:M2)")
print("  Headers centered horizontally and vertically")
print("  Data range corrected to rows 3-102 (100 entries)")
print("  Row 103 formatting cleared")
print("  Freeze set to row 2")
print("  Protections updated: rows 1-2 and 103+, cols N+")
