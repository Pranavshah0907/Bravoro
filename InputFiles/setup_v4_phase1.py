"""
setup_v4_phase1.py — Phase 1: Full sheet structure for BulkSearch Template V4
New sheet: 1uldSi7FoRVG7JibkbjJ0RY7nEK_kK9gTiRe5tKtbr6Y

Approach: onEdit multi-select dropdowns — NO sidebars, NO auth popup for users.

What this does:
  • Renames Sheet1 → Main_Data
  • Creates hidden Lists sheet (Titles col A, Seniorities col B, Job Seniorities col C)
  • Writes all 11 column headers, vertically merges rows 1-2 per column (tall teal header)
  • Sets column widths, row heights, data row backgrounds
  • Data validation: E (Titles), F (Seniorities), J (Job Seniority) → from Lists
  •   All three use strict=False so comma-separated multi-values are accepted
  • Data validation: H → Yes/No strict, G/K → number >= 1
  • Grey bg on I3:K102 (job cols locked until Toggle=Yes)
  • Sr No values 1-100 in A3:A102
  • Freeze row 2, borders, warning-only protections

BEFORE RUNNING: Share the new sheet with the service account:
  bravoro-sheets@leap-project-480114.iam.gserviceaccount.com  (Editor role)
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
TEAL  = {'red': 0.878, 'green': 0.969, 'blue': 0.961}   # #E0F7F4
WHITE = {'red': 1.0,   'green': 1.0,   'blue': 1.0}
GREY  = {'red': 0.9490196, 'green': 0.9490196, 'blue': 0.9490196}
BLACK = {'red': 0.0,   'green': 0.0,   'blue': 0.0}
NONE  = {'style': 'NONE'}
SOLID = {'style': 'SOLID',        'color': BLACK}
MEDUM = {'style': 'SOLID_MEDIUM', 'color': BLACK}

HEADER_FMT = {
    'backgroundColor': TEAL,
    'textFormat': {
        'foregroundColor': BLACK,
        'bold': True,
        'fontSize': 10,
    },
    'horizontalAlignment': 'CENTER',
    'verticalAlignment': 'MIDDLE',
    'wrapStrategy': 'WRAP',
}

# ── Preset lists (written to hidden Lists sheet) ───────────────────────────────
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

# ── Column headers (A–K) ──────────────────────────────────────────────────────
HEADERS = [
    'Sr No',
    'Organization Name',
    'Organization\nLocations',
    'Organization\nDomains',
    'Person Titles',
    'Person\nSeniorities',
    'Results\nper title',
    'Toggle\njob search',
    'Job Title\n(comma separated)',
    'Job Seniority',
    'Date Posted\n(max age days)',
]

# ── Column widths (pixels, A–K) ───────────────────────────────────────────────
COL_WIDTHS = [60, 220, 180, 180, 200, 180, 130, 160, 200, 160, 175]

# ── Build Sheets API client ────────────────────────────────────────────────────
creds  = Credentials.from_service_account_file(
    KEY_FILE, scopes=['https://www.googleapis.com/auth/spreadsheets'])
sheets = build('sheets', 'v4', credentials=creds)

# ═════════════════════════════════════════════════════════════════════════════
# BATCH 1 — Rename Sheet1 + add Lists sheet
# ═════════════════════════════════════════════════════════════════════════════

# Get the sheetId of the first tab (Sheet1)
resp = sheets.spreadsheets().get(spreadsheetId=SHEET_ID).execute()
ws_id = resp['sheets'][0]['properties']['sheetId']
print(f"Sheet1 sheetId: {ws_id}")

b1 = [
    # Rename Sheet1 → Main_Data
    {
        'updateSheetProperties': {
            'properties': {'sheetId': ws_id, 'title': 'Main_Data'},
            'fields': 'title'
        }
    },
    # Add hidden Lists sheet
    {
        'addSheet': {
            'properties': {
                'title': 'Lists',
                'hidden': True,
                'gridProperties': {'rowCount': 50, 'columnCount': 5}
            }
        }
    },
]

print("Batch 1: rename + add Lists...")
r1 = sheets.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': b1}
).execute()
lists_id = r1['replies'][1]['addSheet']['properties']['sheetId']
print(f"Lists sheetId: {lists_id}")

# ═════════════════════════════════════════════════════════════════════════════
# BATCH 2 — All formatting, validation, data
# ═════════════════════════════════════════════════════════════════════════════

b2 = []

# ── Lists sheet data (Titles=A, Seniorities=B, Job Seniorities=C) ─────────────
max_rows = max(len(TITLES), len(SENIORITIES), len(JOB_SENIORITIES))
list_rows = []
for i in range(max_rows):
    list_rows.append({'values': [
        {'userEnteredValue': {'stringValue': TITLES[i]}}         if i < len(TITLES)          else {},
        {'userEnteredValue': {'stringValue': SENIORITIES[i]}}    if i < len(SENIORITIES)     else {},
        {'userEnteredValue': {'stringValue': JOB_SENIORITIES[i]}}if i < len(JOB_SENIORITIES) else {},
    ]})

b2.append({
    'updateCells': {
        'range': {
            'sheetId': lists_id,
            'startRowIndex': 0, 'endRowIndex': max_rows,
            'startColumnIndex': 0, 'endColumnIndex': 3
        },
        'rows': list_rows,
        'fields': 'userEnteredValue'
    }
})

# ── Header values A1:K1 ────────────────────────────────────────────────────────
b2.append({
    'updateCells': {
        'range': {
            'sheetId': ws_id,
            'startRowIndex': 0, 'endRowIndex': 1,
            'startColumnIndex': 0, 'endColumnIndex': 11
        },
        'rows': [{'values': [
            {'userEnteredValue': {'stringValue': h}} for h in HEADERS
        ]}],
        'fields': 'userEnteredValue'
    }
})

# ── Teal formatting on A1:K2 (covers both header rows) ────────────────────────
b2.append({
    'repeatCell': {
        'range': {
            'sheetId': ws_id,
            'startRowIndex': 0, 'endRowIndex': 2,
            'startColumnIndex': 0, 'endColumnIndex': 11
        },
        'cell': {'userEnteredFormat': HEADER_FMT},
        'fields': 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
    }
})

# ── Merge each column vertically: A1:A2, B1:B2, … K1:K2 ──────────────────────
for col in range(11):
    b2.append({
        'mergeCells': {
            'range': {
                'sheetId': ws_id,
                'startRowIndex': 0, 'endRowIndex': 2,
                'startColumnIndex': col, 'endColumnIndex': col + 1
            },
            'mergeType': 'MERGE_ALL'
        }
    })

# ── Row heights: row 1 = 30px, row 2 = 35px (combined 65px tall header) ───────
b2.append({
    'updateDimensionProperties': {
        'range': {'sheetId': ws_id, 'dimension': 'ROWS', 'startIndex': 0, 'endIndex': 1},
        'properties': {'pixelSize': 30}, 'fields': 'pixelSize'
    }
})
b2.append({
    'updateDimensionProperties': {
        'range': {'sheetId': ws_id, 'dimension': 'ROWS', 'startIndex': 1, 'endIndex': 2},
        'properties': {'pixelSize': 35}, 'fields': 'pixelSize'
    }
})

# ── Column widths A–K ──────────────────────────────────────────────────────────
for i, w in enumerate(COL_WIDTHS):
    b2.append({
        'updateDimensionProperties': {
            'range': {'sheetId': ws_id, 'dimension': 'COLUMNS', 'startIndex': i, 'endIndex': i + 1},
            'properties': {'pixelSize': w}, 'fields': 'pixelSize'
        }
    })

# ── White bg for all data rows A3:K102 ────────────────────────────────────────
b2.append({
    'repeatCell': {
        'range': {
            'sheetId': ws_id,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 0, 'endColumnIndex': 11
        },
        'cell': {'userEnteredFormat': {'backgroundColor': WHITE}},
        'fields': 'userEnteredFormat.backgroundColor'
    }
})

# ── Grey bg for I3:K102 (job search cols, locked until Toggle = Yes) ──────────
b2.append({
    'repeatCell': {
        'range': {
            'sheetId': ws_id,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 8, 'endColumnIndex': 11   # I=8, J=9, K=10
        },
        'cell': {'userEnteredFormat': {'backgroundColor': GREY}},
        'fields': 'userEnteredFormat.backgroundColor'
    }
})

# ── Sr No values 1–100 in A3:A102 ─────────────────────────────────────────────
b2.append({
    'updateCells': {
        'range': {
            'sheetId': ws_id,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 0, 'endColumnIndex': 1
        },
        'rows': [
            {'values': [{'userEnteredValue': {'numberValue': i + 1}}]}
            for i in range(100)
        ],
        'fields': 'userEnteredValue'
    }
})

# ── Data validation ────────────────────────────────────────────────────────────

# H3:H102 — Yes/No dropdown (strict — only Yes/No allowed)
b2.append({
    'setDataValidation': {
        'range': {
            'sheetId': ws_id,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 7, 'endColumnIndex': 8   # H
        },
        'rule': {
            'condition': {
                'type': 'ONE_OF_LIST',
                'values': [
                    {'userEnteredValue': 'Yes'},
                    {'userEnteredValue': 'No'},
                ]
            },
            'showCustomUi': True,
            'strict': True
        }
    }
})

# E3:E102 — Person Titles from Lists!A (NOT strict — allows accumulated values)
b2.append({
    'setDataValidation': {
        'range': {
            'sheetId': ws_id,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 4, 'endColumnIndex': 5   # E
        },
        'rule': {
            'condition': {
                'type': 'ONE_OF_RANGE',
                'values': [{'userEnteredValue': f'=Lists!$A$1:$A${len(TITLES)}'}]
            },
            'showCustomUi': True,
            'strict': False   # must be False — multi-values like "Engineering, Marketing" are not in the list
        }
    }
})

# F3:F102 — Person Seniorities from Lists!B (NOT strict)
b2.append({
    'setDataValidation': {
        'range': {
            'sheetId': ws_id,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 5, 'endColumnIndex': 6   # F
        },
        'rule': {
            'condition': {
                'type': 'ONE_OF_RANGE',
                'values': [{'userEnteredValue': f'=Lists!$B$1:$B${len(SENIORITIES)}'}]
            },
            'showCustomUi': True,
            'strict': False
        }
    }
})

# J3:J102 — Job Seniority from Lists!C (NOT strict)
b2.append({
    'setDataValidation': {
        'range': {
            'sheetId': ws_id,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 9, 'endColumnIndex': 10  # J
        },
        'rule': {
            'condition': {
                'type': 'ONE_OF_RANGE',
                'values': [{'userEnteredValue': f'=Lists!$C$1:$C${len(JOB_SENIORITIES)}'}]
            },
            'showCustomUi': True,
            'strict': False
        }
    }
})

# G3:G102 — Results per title: whole number >= 1
b2.append({
    'setDataValidation': {
        'range': {
            'sheetId': ws_id,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 6, 'endColumnIndex': 7   # G
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

# K3:K102 — Date Posted: whole number >= 1
b2.append({
    'setDataValidation': {
        'range': {
            'sheetId': ws_id,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 10, 'endColumnIndex': 11  # K
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

# ── Freeze row 2 ───────────────────────────────────────────────────────────────
b2.append({
    'updateSheetProperties': {
        'properties': {
            'sheetId': ws_id,
            'gridProperties': {'frozenRowCount': 2}
        },
        'fields': 'gridProperties.frozenRowCount'
    }
})

# ── Borders ────────────────────────────────────────────────────────────────────

# Header A1:K2 — medium outer border, solid inner vertical dividers
b2.append({
    'updateBorders': {
        'range': {
            'sheetId': ws_id,
            'startRowIndex': 0, 'endRowIndex': 2,
            'startColumnIndex': 0, 'endColumnIndex': 11
        },
        'top': MEDUM, 'bottom': MEDUM, 'left': MEDUM, 'right': MEDUM,
        'innerVertical': SOLID, 'innerHorizontal': NONE
    }
})

# Data area: left border on col A
b2.append({
    'updateBorders': {
        'range': {
            'sheetId': ws_id,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 0, 'endColumnIndex': 1
        },
        'left': SOLID
    }
})

# Data area: right border on col K
b2.append({
    'updateBorders': {
        'range': {
            'sheetId': ws_id,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 10, 'endColumnIndex': 11
        },
        'right': SOLID
    }
})

# Data area: medium bottom border on row 102 (end of data)
b2.append({
    'updateBorders': {
        'range': {
            'sheetId': ws_id,
            'startRowIndex': 101, 'endRowIndex': 102,
            'startColumnIndex': 0, 'endColumnIndex': 11
        },
        'bottom': MEDUM
    }
})

# ── Protections (warning only — shows confirmation dialog, doesn't block) ──────

# Header rows 1-2
b2.append({
    'addProtectedRange': {
        'protectedRange': {
            'range': {'sheetId': ws_id, 'startRowIndex': 0, 'endRowIndex': 2},
            'description': 'Header rows — do not edit',
            'warningOnly': True
        }
    }
})

# Below data: rows 103+
b2.append({
    'addProtectedRange': {
        'protectedRange': {
            'range': {'sheetId': ws_id, 'startRowIndex': 102, 'endRowIndex': 1000},
            'description': 'Below data area — do not edit',
            'warningOnly': True
        }
    }
})

# Right of data: cols L+
b2.append({
    'addProtectedRange': {
        'protectedRange': {
            'range': {'sheetId': ws_id, 'startColumnIndex': 11},
            'description': 'Columns L+ — do not edit',
            'warningOnly': True
        }
    }
})

# Sr No column A (data rows) — auto-filled, don't touch
b2.append({
    'addProtectedRange': {
        'protectedRange': {
            'range': {
                'sheetId': ws_id,
                'startRowIndex': 2, 'endRowIndex': 102,
                'startColumnIndex': 0, 'endColumnIndex': 1
            },
            'description': 'Sr No — auto filled',
            'warningOnly': True
        }
    }
})

# ── Send batch 2 ───────────────────────────────────────────────────────────────
print(f"Batch 2: sending {len(b2)} requests (formatting, validation, data)...")
r2 = sheets.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': b2}
).execute()
print(f"Done — {len(r2.get('replies', []))} replies")
print()
print("Phase 1 complete:")
print("  ✓ Sheet1 renamed to Main_Data")
print("  ✓ Lists sheet added (hidden) — Titles col A, Seniorities col B, Job Seniorities col C")
print("  ✓ Headers A1:K1 written, teal formatted, vertically merged per column")
print("  ✓ Column widths set")
print("  ✓ White bg A3:K102, grey bg I3:K102 (job cols locked by default)")
print("  ✓ Sr No 1–100 in A3:A102")
print("  ✓ Data validation: E (Titles), F (Seniorities), J (Job Sen) — dropdown + non-strict")
print("  ✓ Data validation: H (Yes/No), G/K (number >= 1)")
print("  ✓ Freeze row 2")
print("  ✓ Borders + warning-only protections")
print()
print("Next: run setup_v4_phase2.py to create Apps Script + push onEdit code")
