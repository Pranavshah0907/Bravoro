"""
setup_v4_phase3a.py — Phase 3a: Add Picker sheet tab + Pick column to Main_Data
Sheet: 1uldSi7FoRVG7JibkbjJ0RY7nEK_kK9gTiRe5tKtbr6Y

What this does:
  * Adds column L ("Pick") to Main_Data — narrow checkbox column (30px)
    - Checkbox data validation on L3:L102
    - Teal header merged L1:L2 like other columns
  * Creates visible "Picker" sheet tab with:
    - Target Row input (B2), APPLY checkbox (D2)
    - PERSON TITLES section: checkboxes A5:A30 + labels B5:B30 (26 items)
    - PERSON SENIORITIES section: checkboxes A33:A47 + labels B33:B47 (15 items)
    - JOB SENIORITY section: checkboxes A50:A55 + labels B50:B55 (6 items)
    - Teal section headers, formatting, column widths

Run AFTER setup_v4_phase1.py + setup_v4_phase2.py
Uses service account (no OAuth needed).
"""

import sys
try:
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build
except ImportError as e:
    print(f"Missing dependency: {e}"); sys.exit(1)

KEY_FILE = 'c:/Pranav/SiddhaAI/02_Bravoro/01_WebsiteRepo/leapleadsai/InputFiles/leap-project-480114-b965559fa9ff.json'
SHEET_ID = '1uldSi7FoRVG7JibkbjJ0RY7nEK_kK9gTiRe5tKtbr6Y'

# ── Colors ────────────────────────────────────────────────────────────────────
TEAL      = {'red': 0.878, 'green': 0.969, 'blue': 0.961}   # #E0F7F4
TEAL_DARK = {'red': 0.776, 'green': 0.929, 'blue': 0.914}   # slightly darker for section headers
WHITE     = {'red': 1.0,   'green': 1.0,   'blue': 1.0}
GREY_LT   = {'red': 0.95, 'green': 0.95, 'blue': 0.95}
BLACK     = {'red': 0.0,   'green': 0.0,   'blue': 0.0}
SOLID     = {'style': 'SOLID',        'color': BLACK}
MEDUM     = {'style': 'SOLID_MEDIUM', 'color': BLACK}
NONE_B    = {'style': 'NONE'}

# ── Preset lists (same as phase 1) ───────────────────────────────────────────
TITLES = [
    'Accounting', 'Administrative', 'Arts and Design', 'Business Development',
    'Community & Social Svc', 'Consulting', 'Education', 'Engineering',
    'Entrepreneurship', 'Finance', 'Healthcare Services', 'Human Resources',
    'Information Technology', 'Legal', 'Marketing', 'Media & Comm',
    'Military & Protective', 'Operations', 'Product Management',
    'Program & Project', 'Purchasing', 'Quality Assurance', 'Real Estate',
    'Research', 'Support', 'Sales',
]

SENIORITIES = [
    'Owner', 'Partner', 'C-Suite (CXO)', 'VP', 'SVP', 'EVP', 'Director',
    'Senior Manager', 'Manager', 'Team Lead', 'Senior', 'Mid-Level',
    'Entry Level', 'Intern', 'Training',
]

JOB_SENIORITIES = [
    'Internship', 'Entry level', 'Associate',
    'Mid-Senior level', 'Director', 'Executive',
]

# ── Build Sheets API client ──────────────────────────────────────────────────
creds  = Credentials.from_service_account_file(
    KEY_FILE, scopes=['https://www.googleapis.com/auth/spreadsheets'])
sheets = build('sheets', 'v4', credentials=creds)

# ── Get existing sheet IDs ───────────────────────────────────────────────────
resp = sheets.spreadsheets().get(spreadsheetId=SHEET_ID).execute()
main_data_id = None
for s in resp['sheets']:
    if s['properties']['title'] == 'Main_Data':
        main_data_id = s['properties']['sheetId']
        break

if main_data_id is None:
    print("ERROR: Main_Data sheet not found!"); sys.exit(1)
print(f"Main_Data sheetId: {main_data_id}")

# ═══════════════════════════════════════════════════════════════════════════════
# BATCH 1 — Add Picker sheet
# ═══════════════════════════════════════════════════════════════════════════════

b1 = [
    {
        'addSheet': {
            'properties': {
                'title': 'Picker',
                'hidden': False,
                'gridProperties': {'rowCount': 60, 'columnCount': 5}
            }
        }
    },
]

print("Batch 1: adding Picker sheet...")
r1 = sheets.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': b1}
).execute()
picker_id = r1['replies'][0]['addSheet']['properties']['sheetId']
print(f"Picker sheetId: {picker_id}")

# ═══════════════════════════════════════════════════════════════════════════════
# BATCH 2 — Pick column on Main_Data + full Picker sheet setup
# ═══════════════════════════════════════════════════════════════════════════════

b2 = []

# ── PART A: Add "Pick" column L to Main_Data ─────────────────────────────────

# L1 header value
b2.append({
    'updateCells': {
        'range': {
            'sheetId': main_data_id,
            'startRowIndex': 0, 'endRowIndex': 1,
            'startColumnIndex': 11, 'endColumnIndex': 12  # L
        },
        'rows': [{'values': [{'userEnteredValue': {'stringValue': 'Pick'}}]}],
        'fields': 'userEnteredValue'
    }
})

# L1:L2 teal header formatting
b2.append({
    'repeatCell': {
        'range': {
            'sheetId': main_data_id,
            'startRowIndex': 0, 'endRowIndex': 2,
            'startColumnIndex': 11, 'endColumnIndex': 12
        },
        'cell': {'userEnteredFormat': {
            'backgroundColor': TEAL,
            'textFormat': {'foregroundColor': BLACK, 'bold': True, 'fontSize': 10},
            'horizontalAlignment': 'CENTER',
            'verticalAlignment': 'MIDDLE',
            'wrapStrategy': 'WRAP',
        }},
        'fields': 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
    }
})

# Merge L1:L2
b2.append({
    'mergeCells': {
        'range': {
            'sheetId': main_data_id,
            'startRowIndex': 0, 'endRowIndex': 2,
            'startColumnIndex': 11, 'endColumnIndex': 12
        },
        'mergeType': 'MERGE_ALL'
    }
})

# L column width = 40px
b2.append({
    'updateDimensionProperties': {
        'range': {'sheetId': main_data_id, 'dimension': 'COLUMNS', 'startIndex': 11, 'endIndex': 12},
        'properties': {'pixelSize': 40}, 'fields': 'pixelSize'
    }
})

# Checkbox validation on L3:L102
b2.append({
    'setDataValidation': {
        'range': {
            'sheetId': main_data_id,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 11, 'endColumnIndex': 12
        },
        'rule': {
            'condition': {'type': 'BOOLEAN'},
            'showCustomUi': True,
            'strict': True
        }
    }
})

# White bg for L3:L102
b2.append({
    'repeatCell': {
        'range': {
            'sheetId': main_data_id,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 11, 'endColumnIndex': 12
        },
        'cell': {'userEnteredFormat': {'backgroundColor': WHITE}},
        'fields': 'userEnteredFormat.backgroundColor'
    }
})

# Border on L header
b2.append({
    'updateBorders': {
        'range': {
            'sheetId': main_data_id,
            'startRowIndex': 0, 'endRowIndex': 2,
            'startColumnIndex': 11, 'endColumnIndex': 12
        },
        'top': MEDUM, 'bottom': MEDUM, 'left': SOLID, 'right': MEDUM
    }
})

# Bottom border on L102
b2.append({
    'updateBorders': {
        'range': {
            'sheetId': main_data_id,
            'startRowIndex': 101, 'endRowIndex': 102,
            'startColumnIndex': 11, 'endColumnIndex': 12
        },
        'bottom': MEDUM
    }
})

# Update the protection on "Columns L+" — remove old one would be complex,
# so we just add protection on M+ instead (L is user-interactive now)
b2.append({
    'addProtectedRange': {
        'protectedRange': {
            'range': {'sheetId': main_data_id, 'startColumnIndex': 12},  # M+
            'description': 'Columns M+ -- do not edit',
            'warningOnly': True
        }
    }
})

# ── PART B: Full Picker sheet setup ──────────────────────────────────────────

# Column widths: A=30, B=250, C=20, D=100, E=20
picker_col_widths = [30, 250, 20, 100, 20]
for i, w in enumerate(picker_col_widths):
    b2.append({
        'updateDimensionProperties': {
            'range': {'sheetId': picker_id, 'dimension': 'COLUMNS', 'startIndex': i, 'endIndex': i + 1},
            'properties': {'pixelSize': w}, 'fields': 'pixelSize'
        }
    })

# ── Row 1: OPTION PICKER header (merged A1:E1, teal) ────────────────────────
b2.append({
    'updateCells': {
        'range': {
            'sheetId': picker_id,
            'startRowIndex': 0, 'endRowIndex': 1,
            'startColumnIndex': 0, 'endColumnIndex': 1
        },
        'rows': [{'values': [{'userEnteredValue': {'stringValue': 'OPTION PICKER'}}]}],
        'fields': 'userEnteredValue'
    }
})
b2.append({
    'mergeCells': {
        'range': {
            'sheetId': picker_id,
            'startRowIndex': 0, 'endRowIndex': 1,
            'startColumnIndex': 0, 'endColumnIndex': 5
        },
        'mergeType': 'MERGE_ALL'
    }
})
b2.append({
    'repeatCell': {
        'range': {
            'sheetId': picker_id,
            'startRowIndex': 0, 'endRowIndex': 1,
            'startColumnIndex': 0, 'endColumnIndex': 5
        },
        'cell': {'userEnteredFormat': {
            'backgroundColor': TEAL,
            'textFormat': {'foregroundColor': BLACK, 'bold': True, 'fontSize': 14},
            'horizontalAlignment': 'CENTER',
            'verticalAlignment': 'MIDDLE',
        }},
        'fields': 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
    }
})

# Row 1 height = 40px
b2.append({
    'updateDimensionProperties': {
        'range': {'sheetId': picker_id, 'dimension': 'ROWS', 'startIndex': 0, 'endIndex': 1},
        'properties': {'pixelSize': 40}, 'fields': 'pixelSize'
    }
})

# ── Row 2: Target Row + APPLY ────────────────────────────────────────────────
# A2 = "Target Row:"
b2.append({
    'updateCells': {
        'range': {
            'sheetId': picker_id,
            'startRowIndex': 1, 'endRowIndex': 2,
            'startColumnIndex': 0, 'endColumnIndex': 5
        },
        'rows': [{'values': [
            {'userEnteredValue': {'stringValue': 'Target Row:'},
             'userEnteredFormat': {'textFormat': {'bold': True}, 'horizontalAlignment': 'RIGHT', 'verticalAlignment': 'MIDDLE'}},
            {'userEnteredFormat': {
                'backgroundColor': WHITE,
                'borders': {'top': SOLID, 'bottom': SOLID, 'left': SOLID, 'right': SOLID},
                'horizontalAlignment': 'CENTER', 'verticalAlignment': 'MIDDLE',
                'textFormat': {'bold': True, 'fontSize': 12}
            }},
            {},  # C2 spacer
            {'userEnteredValue': {'stringValue': 'APPLY'},
             'userEnteredFormat': {
                'textFormat': {'bold': True, 'fontSize': 11},
                'horizontalAlignment': 'CENTER', 'verticalAlignment': 'MIDDLE',
                'backgroundColor': TEAL,
            }},
            {},  # E2
        ]}],
        'fields': 'userEnteredValue,userEnteredFormat'
    }
})

# B2 number validation (3-102)
b2.append({
    'setDataValidation': {
        'range': {
            'sheetId': picker_id,
            'startRowIndex': 1, 'endRowIndex': 2,
            'startColumnIndex': 1, 'endColumnIndex': 2  # B2
        },
        'rule': {
            'condition': {
                'type': 'NUMBER_BETWEEN',
                'values': [
                    {'userEnteredValue': '3'},
                    {'userEnteredValue': '102'},
                ]
            },
            'showCustomUi': False,
            'strict': True
        }
    }
})

# D2 checkbox (APPLY button)
b2.append({
    'setDataValidation': {
        'range': {
            'sheetId': picker_id,
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

# Row 2 height = 35px
b2.append({
    'updateDimensionProperties': {
        'range': {'sheetId': picker_id, 'dimension': 'ROWS', 'startIndex': 1, 'endIndex': 2},
        'properties': {'pixelSize': 35}, 'fields': 'pixelSize'
    }
})

# ── Row 3: separator ────────────────────────────────────────────────────────
b2.append({
    'updateDimensionProperties': {
        'range': {'sheetId': picker_id, 'dimension': 'ROWS', 'startIndex': 2, 'endIndex': 3},
        'properties': {'pixelSize': 8}, 'fields': 'pixelSize'
    }
})

# ── Helper to build a section (header row + checkbox+label rows) ─────────────
def build_section(sheet_id, header_text, header_row_idx, items, start_row_idx, reqs):
    """
    header_row_idx: 0-based row index for section header
    start_row_idx: 0-based row index for first item
    items: list of label strings
    """
    # Section header (merged A:B, darker teal)
    reqs.append({
        'updateCells': {
            'range': {
                'sheetId': sheet_id,
                'startRowIndex': header_row_idx, 'endRowIndex': header_row_idx + 1,
                'startColumnIndex': 0, 'endColumnIndex': 3  # A:C
            },
            'rows': [{'values': [
                {'userEnteredValue': {'stringValue': header_text},
                 'userEnteredFormat': {
                    'backgroundColor': TEAL_DARK,
                    'textFormat': {'bold': True, 'fontSize': 11, 'foregroundColor': BLACK},
                    'horizontalAlignment': 'LEFT',
                    'verticalAlignment': 'MIDDLE',
                 }},
                {'userEnteredFormat': {'backgroundColor': TEAL_DARK}},
                {'userEnteredFormat': {'backgroundColor': TEAL_DARK}},
            ]}],
            'fields': 'userEnteredValue,userEnteredFormat'
        }
    })

    # Merge header A:B
    reqs.append({
        'mergeCells': {
            'range': {
                'sheetId': sheet_id,
                'startRowIndex': header_row_idx, 'endRowIndex': header_row_idx + 1,
                'startColumnIndex': 0, 'endColumnIndex': 3
            },
            'mergeType': 'MERGE_ALL'
        }
    })

    # Header row height = 30px
    reqs.append({
        'updateDimensionProperties': {
            'range': {'sheetId': sheet_id, 'dimension': 'ROWS',
                      'startIndex': header_row_idx, 'endIndex': header_row_idx + 1},
            'properties': {'pixelSize': 30}, 'fields': 'pixelSize'
        }
    })

    end_row_idx = start_row_idx + len(items)

    # Labels in column B
    label_rows = []
    for item in items:
        label_rows.append({'values': [
            {},  # A — checkbox (set via validation below)
            {'userEnteredValue': {'stringValue': item},
             'userEnteredFormat': {
                'textFormat': {'fontSize': 10},
                'verticalAlignment': 'MIDDLE',
             }},
        ]})

    reqs.append({
        'updateCells': {
            'range': {
                'sheetId': sheet_id,
                'startRowIndex': start_row_idx, 'endRowIndex': end_row_idx,
                'startColumnIndex': 0, 'endColumnIndex': 2
            },
            'rows': label_rows,
            'fields': 'userEnteredValue,userEnteredFormat'
        }
    })

    # Checkbox validation on column A for this section
    reqs.append({
        'setDataValidation': {
            'range': {
                'sheetId': sheet_id,
                'startRowIndex': start_row_idx, 'endRowIndex': end_row_idx,
                'startColumnIndex': 0, 'endColumnIndex': 1  # A
            },
            'rule': {
                'condition': {'type': 'BOOLEAN'},
                'showCustomUi': True,
                'strict': True
            }
        }
    })

    # Set all checkboxes to FALSE initially
    false_rows = []
    for _ in items:
        false_rows.append({'values': [
            {'userEnteredValue': {'boolValue': False}},
        ]})
    reqs.append({
        'updateCells': {
            'range': {
                'sheetId': sheet_id,
                'startRowIndex': start_row_idx, 'endRowIndex': end_row_idx,
                'startColumnIndex': 0, 'endColumnIndex': 1
            },
            'rows': false_rows,
            'fields': 'userEnteredValue'
        }
    })

    # Light alternating row backgrounds for readability
    for i in range(len(items)):
        row_idx = start_row_idx + i
        bg = GREY_LT if i % 2 == 1 else WHITE
        reqs.append({
            'repeatCell': {
                'range': {
                    'sheetId': sheet_id,
                    'startRowIndex': row_idx, 'endRowIndex': row_idx + 1,
                    'startColumnIndex': 0, 'endColumnIndex': 3
                },
                'cell': {'userEnteredFormat': {'backgroundColor': bg}},
                'fields': 'userEnteredFormat.backgroundColor'
            }
        })

    return end_row_idx


# ── PERSON TITLES section (row 4 header, rows 5-30 items) ───────────────────
# Row indices are 0-based: row 4 = index 3, row 5 = index 4
end_titles = build_section(picker_id, 'PERSON TITLES (Col E)', 3, TITLES, 4, b2)
# end_titles = 4 + 26 = 30 (0-based), meaning last title is row 30

# Separator row after titles
sep1_idx = end_titles  # row 31 (0-based 30)
b2.append({
    'updateDimensionProperties': {
        'range': {'sheetId': picker_id, 'dimension': 'ROWS', 'startIndex': sep1_idx, 'endIndex': sep1_idx + 1},
        'properties': {'pixelSize': 8}, 'fields': 'pixelSize'
    }
})

# ── PERSON SENIORITIES section ───────────────────────────────────────────────
sen_header_idx = sep1_idx + 1   # row 32 (0-based 31)
sen_start_idx = sen_header_idx + 1  # row 33 (0-based 32)
end_sen = build_section(picker_id, 'PERSON SENIORITIES (Col F)', sen_header_idx, SENIORITIES, sen_start_idx, b2)

# Separator
sep2_idx = end_sen
b2.append({
    'updateDimensionProperties': {
        'range': {'sheetId': picker_id, 'dimension': 'ROWS', 'startIndex': sep2_idx, 'endIndex': sep2_idx + 1},
        'properties': {'pixelSize': 8}, 'fields': 'pixelSize'
    }
})

# ── JOB SENIORITY section ───────────────────────────────────────────────────
job_header_idx = sep2_idx + 1
job_start_idx = job_header_idx + 1
end_job = build_section(picker_id, 'JOB SENIORITY (Col J)', job_header_idx, JOB_SENIORITIES, job_start_idx, b2)

# ── Freeze row 1 on Picker ──────────────────────────────────────────────────
b2.append({
    'updateSheetProperties': {
        'properties': {
            'sheetId': picker_id,
            'gridProperties': {'frozenRowCount': 1}
        },
        'fields': 'gridProperties.frozenRowCount'
    }
})

# ── Protection on Picker labels (column B — read-only) ──────────────────────
b2.append({
    'addProtectedRange': {
        'protectedRange': {
            'range': {
                'sheetId': picker_id,
                'startColumnIndex': 1, 'endColumnIndex': 2  # B
            },
            'description': 'Picker labels -- do not edit',
            'warningOnly': True
        }
    }
})

# ── Send batch 2 ─────────────────────────────────────────────────────────────
print(f"Batch 2: sending {len(b2)} requests...")
r2 = sheets.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': b2}
).execute()
print(f"Done -- {len(r2.get('replies', []))} replies")

print()
print("Phase 3a complete:")
print(f"  - Picker sheet added (sheetId: {picker_id})")
print("  - OPTION PICKER header (row 1, teal, merged)")
print("  - Target Row input (B2) + APPLY checkbox (D2)")
print("  - PERSON TITLES section: 26 checkboxes + labels (rows 5-30)")
print("  - PERSON SENIORITIES section: 15 checkboxes + labels (rows 33-47)")
print("  - JOB SENIORITY section: 6 checkboxes + labels (rows 50-55)")
print("  - Pick column L added to Main_Data (checkbox, 40px)")
print("  - Column widths, alternating row colors, protections")
print()
print(f"PICKER SHEET ID: {picker_id}")
print()
print("Next: run setup_v4_phase3b.py to update Apps Script with Picker logic")
