"""
rebuild_picker_v2.py — Rebuild Picker sheet with 2-column layout + fix protections

Changes:
  1. Delete existing Picker sheet, create new one with 2-column checkbox layout
     Layout: [checkbox A] [label B] [spacer] [checkbox D] [label E]
     This halves the vertical size of each section.
  2. Remove old "Columns L+" protection from Main_Data (was blocking Pick column)
  3. Clean polished design: section headers span full width, alternating rows, borders

Sheet: 1uldSi7FoRVG7JibkbjJ0RY7nEK_kK9gTiRe5tKtbr6Y
"""

import math, sys
try:
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build
except ImportError as e:
    print(f"Missing dependency: {e}"); sys.exit(1)

KEY_FILE = 'c:/Pranav/SiddhaAI/02_Bravoro/01_WebsiteRepo/leapleadsai/InputFiles/leap-project-480114-b965559fa9ff.json'
SHEET_ID = '1uldSi7FoRVG7JibkbjJ0RY7nEK_kK9gTiRe5tKtbr6Y'

# ── Colors ────────────────────────────────────────────────────────────────────
TEAL      = {'red': 0.878, 'green': 0.969, 'blue': 0.961}   # #E0F7F4
TEAL_DARK = {'red': 0.776, 'green': 0.929, 'blue': 0.914}   # section headers
WHITE     = {'red': 1.0,   'green': 1.0,   'blue': 1.0}
GREY_LT  = {'red': 0.953, 'green': 0.957, 'blue': 0.961}    # subtle alt row
BLACK     = {'red': 0.0,   'green': 0.0,   'blue': 0.0}
SOLID     = {'style': 'SOLID',        'color': BLACK}
MEDUM     = {'style': 'SOLID_MEDIUM', 'color': BLACK}
THIN      = {'style': 'SOLID',        'color': {'red': 0.8, 'green': 0.8, 'blue': 0.8}}
NONE_B    = {'style': 'NONE'}

# ── Preset lists ─────────────────────────────────────────────────────────────
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

# ── Build client ─────────────────────────────────────────────────────────────
creds  = Credentials.from_service_account_file(
    KEY_FILE, scopes=['https://www.googleapis.com/auth/spreadsheets'])
sheets = build('sheets', 'v4', credentials=creds)

# ── Get sheet info ───────────────────────────────────────────────────────────
resp = sheets.spreadsheets().get(spreadsheetId=SHEET_ID).execute()
main_data_id = None
old_picker_id = None
for s in resp['sheets']:
    name = s['properties']['title']
    if name == 'Main_Data':
        main_data_id = s['properties']['sheetId']
    elif name == 'Picker':
        old_picker_id = s['properties']['sheetId']

print(f"Main_Data sheetId: {main_data_id}")
print(f"Old Picker sheetId: {old_picker_id}")

# ── Find and remove problematic protections ──────────────────────────────────
# Get all protections
prot_resp = sheets.spreadsheets().get(
    spreadsheetId=SHEET_ID,
    fields='sheets.properties.sheetId,sheets.protectedRanges'
).execute()

protections_to_remove = []
for s in prot_resp.get('sheets', []):
    sid = s['properties']['sheetId']
    for pr in s.get('protectedRanges', []):
        desc = pr.get('description', '')
        prid = pr['protectedRangeId']
        rng = pr.get('range', {})
        # Remove "Columns L+" (old, conflicts with Pick column)
        if 'Columns L+' in desc:
            protections_to_remove.append(prid)
            print(f"  Will remove protection: '{desc}' (id={prid})")
        # Remove protections from old Picker sheet (will be deleted anyway)
        if sid == old_picker_id:
            protections_to_remove.append(prid)
            print(f"  Will remove Picker protection: '{desc}' (id={prid})")

# ═══════════════════════════════════════════════════════════════════════════════
# BATCH 1 — Remove protections + delete old Picker + create new Picker
# ═══════════════════════════════════════════════════════════════════════════════
b1 = []

for prid in protections_to_remove:
    b1.append({'deleteProtectedRange': {'protectedRangeId': prid}})

if old_picker_id is not None:
    b1.append({'deleteSheet': {'sheetId': old_picker_id}})
    print("Deleting old Picker sheet...")

# 6 columns: A(cb) B(label) C(spacer) D(cb) E(label) F(spacer)
b1.append({
    'addSheet': {
        'properties': {
            'title': 'Picker',
            'hidden': False,
            'gridProperties': {'rowCount': 40, 'columnCount': 6}
        }
    }
})

print(f"Batch 1: sending {len(b1)} requests...")
r1 = sheets.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': b1}
).execute()

# Find the new Picker sheetId from replies
picker_id = None
for reply in r1.get('replies', []):
    if 'addSheet' in reply:
        picker_id = reply['addSheet']['properties']['sheetId']
        break

print(f"New Picker sheetId: {picker_id}")

# ═══════════════════════════════════════════════════════════════════════════════
# BATCH 2 — Full Picker setup (2-column layout) + Main_Data protection fix
# ═══════════════════════════════════════════════════════════════════════════════
b2 = []

# ── Column widths: A=30(cb), B=200(label), C=15(spacer), D=30(cb), E=200(label), F=10
picker_col_widths = [30, 200, 15, 30, 200, 10]
for i, w in enumerate(picker_col_widths):
    b2.append({
        'updateDimensionProperties': {
            'range': {'sheetId': picker_id, 'dimension': 'COLUMNS', 'startIndex': i, 'endIndex': i + 1},
            'properties': {'pixelSize': w}, 'fields': 'pixelSize'
        }
    })

# ── Row 1: OPTION PICKER header ──────────────────────────────────────────────
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
            'startColumnIndex': 0, 'endColumnIndex': 6
        },
        'mergeType': 'MERGE_ALL'
    }
})
b2.append({
    'repeatCell': {
        'range': {
            'sheetId': picker_id,
            'startRowIndex': 0, 'endRowIndex': 1,
            'startColumnIndex': 0, 'endColumnIndex': 6
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
b2.append({
    'updateDimensionProperties': {
        'range': {'sheetId': picker_id, 'dimension': 'ROWS', 'startIndex': 0, 'endIndex': 1},
        'properties': {'pixelSize': 40}, 'fields': 'pixelSize'
    }
})

# ── Row 2: Sr No + APPLY ─────────────────────────────────────────────────────
b2.append({
    'updateCells': {
        'range': {
            'sheetId': picker_id,
            'startRowIndex': 1, 'endRowIndex': 2,
            'startColumnIndex': 0, 'endColumnIndex': 6
        },
        'rows': [{'values': [
            # A2: "Sr No:" label
            {'userEnteredValue': {'stringValue': 'Sr No:'},
             'userEnteredFormat': {
                'textFormat': {'bold': True, 'fontSize': 11},
                'horizontalAlignment': 'RIGHT', 'verticalAlignment': 'MIDDLE',
                'backgroundColor': TEAL,
            }},
            # B2: number input (empty, user types Sr No 1-100)
            {'userEnteredFormat': {
                'backgroundColor': WHITE,
                'borders': {'top': SOLID, 'bottom': SOLID, 'left': SOLID, 'right': SOLID},
                'horizontalAlignment': 'CENTER', 'verticalAlignment': 'MIDDLE',
                'textFormat': {'bold': True, 'fontSize': 12},
            }},
            # C2: spacer
            {'userEnteredFormat': {'backgroundColor': TEAL}},
            # D2: "APPLY" label
            {'userEnteredValue': {'stringValue': 'APPLY'},
             'userEnteredFormat': {
                'textFormat': {'bold': True, 'fontSize': 11},
                'horizontalAlignment': 'RIGHT', 'verticalAlignment': 'MIDDLE',
                'backgroundColor': TEAL,
            }},
            # E2: checkbox
            {'userEnteredValue': {'boolValue': False},
             'userEnteredFormat': {
                'backgroundColor': WHITE,
                'borders': {'top': SOLID, 'bottom': SOLID, 'left': SOLID, 'right': SOLID},
                'horizontalAlignment': 'CENTER', 'verticalAlignment': 'MIDDLE',
            }},
            # F2: spacer
            {'userEnteredFormat': {'backgroundColor': TEAL}},
        ]}],
        'fields': 'userEnteredValue,userEnteredFormat'
    }
})

# B2 number validation (1-100, Sr No)
b2.append({
    'setDataValidation': {
        'range': {
            'sheetId': picker_id,
            'startRowIndex': 1, 'endRowIndex': 2,
            'startColumnIndex': 1, 'endColumnIndex': 2
        },
        'rule': {
            'condition': {
                'type': 'NUMBER_BETWEEN',
                'values': [
                    {'userEnteredValue': '1'},
                    {'userEnteredValue': '100'},
                ]
            },
            'showCustomUi': False,
            'strict': True
        }
    }
})

# E2 checkbox validation (APPLY)
b2.append({
    'setDataValidation': {
        'range': {
            'sheetId': picker_id,
            'startRowIndex': 1, 'endRowIndex': 2,
            'startColumnIndex': 4, 'endColumnIndex': 5  # E2
        },
        'rule': {
            'condition': {'type': 'BOOLEAN'},
            'showCustomUi': True,
            'strict': True
        }
    }
})

# Row 2 height
b2.append({
    'updateDimensionProperties': {
        'range': {'sheetId': picker_id, 'dimension': 'ROWS', 'startIndex': 1, 'endIndex': 2},
        'properties': {'pixelSize': 35}, 'fields': 'pixelSize'
    }
})

# ── Row 3: separator ─────────────────────────────────────────────────────────
b2.append({
    'updateDimensionProperties': {
        'range': {'sheetId': picker_id, 'dimension': 'ROWS', 'startIndex': 2, 'endIndex': 3},
        'properties': {'pixelSize': 6}, 'fields': 'pixelSize'
    }
})
b2.append({
    'repeatCell': {
        'range': {
            'sheetId': picker_id,
            'startRowIndex': 2, 'endRowIndex': 3,
            'startColumnIndex': 0, 'endColumnIndex': 6
        },
        'cell': {'userEnteredFormat': {'backgroundColor': TEAL}},
        'fields': 'userEnteredFormat.backgroundColor'
    }
})


# ═══════════════════════════════════════════════════════════════════════════════
# Helper: build a 2-column section
# ═══════════════════════════════════════════════════════════════════════════════
def build_2col_section(sheet_id, header_text, header_row_idx, items, start_row_idx, reqs):
    """
    Builds a section with 2-column checkbox+label layout.
    Left pair: cols A(cb) + B(label), Right pair: cols D(cb) + E(label)
    Col C is a visual spacer between the pairs.
    Returns end_row_idx (0-based, exclusive).
    """
    num_rows = math.ceil(len(items) / 2)

    # ── Section header (merged A:E, darker teal) ──────────────────────────────
    reqs.append({
        'updateCells': {
            'range': {
                'sheetId': sheet_id,
                'startRowIndex': header_row_idx, 'endRowIndex': header_row_idx + 1,
                'startColumnIndex': 0, 'endColumnIndex': 6
            },
            'rows': [{'values': [
                {'userEnteredValue': {'stringValue': header_text},
                 'userEnteredFormat': {
                    'backgroundColor': TEAL_DARK,
                    'textFormat': {'bold': True, 'fontSize': 11, 'foregroundColor': BLACK},
                    'horizontalAlignment': 'LEFT',
                    'verticalAlignment': 'MIDDLE',
                    'padding': {'left': 8},
                 }},
                {'userEnteredFormat': {'backgroundColor': TEAL_DARK}},
                {'userEnteredFormat': {'backgroundColor': TEAL_DARK}},
                {'userEnteredFormat': {'backgroundColor': TEAL_DARK}},
                {'userEnteredFormat': {'backgroundColor': TEAL_DARK}},
                {'userEnteredFormat': {'backgroundColor': TEAL_DARK}},
            ]}],
            'fields': 'userEnteredValue,userEnteredFormat'
        }
    })
    reqs.append({
        'mergeCells': {
            'range': {
                'sheetId': sheet_id,
                'startRowIndex': header_row_idx, 'endRowIndex': header_row_idx + 1,
                'startColumnIndex': 0, 'endColumnIndex': 6
            },
            'mergeType': 'MERGE_ALL'
        }
    })
    reqs.append({
        'updateDimensionProperties': {
            'range': {'sheetId': sheet_id, 'dimension': 'ROWS',
                      'startIndex': header_row_idx, 'endIndex': header_row_idx + 1},
            'properties': {'pixelSize': 30}, 'fields': 'pixelSize'
        }
    })

    # Bottom border on header
    reqs.append({
        'updateBorders': {
            'range': {
                'sheetId': sheet_id,
                'startRowIndex': header_row_idx, 'endRowIndex': header_row_idx + 1,
                'startColumnIndex': 0, 'endColumnIndex': 6
            },
            'bottom': SOLID
        }
    })

    end_row_idx = start_row_idx + num_rows

    # ── Data rows: 2 pairs per row ───────────────────────────────────────────
    data_rows = []
    for r in range(num_rows):
        left_idx = r
        right_idx = r + num_rows  # second half goes on the right

        row_bg = GREY_LT if r % 2 == 1 else WHITE

        left_label = items[left_idx] if left_idx < len(items) else ''
        right_label = items[right_idx] if right_idx < len(items) else ''

        row_cells = [
            # A: left checkbox
            {'userEnteredValue': {'boolValue': False},
             'userEnteredFormat': {'backgroundColor': row_bg, 'horizontalAlignment': 'CENTER', 'verticalAlignment': 'MIDDLE'}},
            # B: left label
            {'userEnteredValue': {'stringValue': left_label} if left_label else {},
             'userEnteredFormat': {'backgroundColor': row_bg, 'textFormat': {'fontSize': 10}, 'verticalAlignment': 'MIDDLE'}},
            # C: spacer
            {'userEnteredFormat': {'backgroundColor': WHITE}},
            # D: right checkbox (only if there's a right item)
            {'userEnteredValue': {'boolValue': False} if right_label else {},
             'userEnteredFormat': {'backgroundColor': row_bg, 'horizontalAlignment': 'CENTER', 'verticalAlignment': 'MIDDLE'}},
            # E: right label
            {'userEnteredValue': {'stringValue': right_label} if right_label else {},
             'userEnteredFormat': {'backgroundColor': row_bg, 'textFormat': {'fontSize': 10}, 'verticalAlignment': 'MIDDLE'}},
            # F: spacer
            {'userEnteredFormat': {'backgroundColor': WHITE}},
        ]
        data_rows.append({'values': row_cells})

    reqs.append({
        'updateCells': {
            'range': {
                'sheetId': sheet_id,
                'startRowIndex': start_row_idx, 'endRowIndex': end_row_idx,
                'startColumnIndex': 0, 'endColumnIndex': 6
            },
            'rows': data_rows,
            'fields': 'userEnteredValue,userEnteredFormat'
        }
    })

    # ── Checkbox validation on col A (all rows) ──────────────────────────────
    reqs.append({
        'setDataValidation': {
            'range': {
                'sheetId': sheet_id,
                'startRowIndex': start_row_idx, 'endRowIndex': end_row_idx,
                'startColumnIndex': 0, 'endColumnIndex': 1
            },
            'rule': {
                'condition': {'type': 'BOOLEAN'},
                'showCustomUi': True,
                'strict': True
            }
        }
    })

    # ── Checkbox validation on col D (rows that have right-side items) ───────
    # Right side has items from index num_rows to len(items)-1
    right_count = len(items) - num_rows  # how many right-side items
    if right_count > 0:
        reqs.append({
            'setDataValidation': {
                'range': {
                    'sheetId': sheet_id,
                    'startRowIndex': start_row_idx, 'endRowIndex': start_row_idx + right_count,
                    'startColumnIndex': 3, 'endColumnIndex': 4  # D
                },
                'rule': {
                    'condition': {'type': 'BOOLEAN'},
                    'showCustomUi': True,
                    'strict': True
                }
            }
        })

    # ── Row heights ──────────────────────────────────────────────────────────
    for r in range(num_rows):
        reqs.append({
            'updateDimensionProperties': {
                'range': {'sheetId': sheet_id, 'dimension': 'ROWS',
                          'startIndex': start_row_idx + r, 'endIndex': start_row_idx + r + 1},
                'properties': {'pixelSize': 24}, 'fields': 'pixelSize'
            }
        })

    # ── Light border between left and right sections (col C spacer) ──────────
    # Bottom border on last data row
    reqs.append({
        'updateBorders': {
            'range': {
                'sheetId': sheet_id,
                'startRowIndex': end_row_idx - 1, 'endRowIndex': end_row_idx,
                'startColumnIndex': 0, 'endColumnIndex': 6
            },
            'bottom': THIN
        }
    })

    return end_row_idx


# ═══════════════════════════════════════════════════════════════════════════════
# Build all 3 sections
# ═══════════════════════════════════════════════════════════════════════════════

# Row 4 (idx 3): Titles header
# Row 5-17 (idx 4-16): Titles data (26 items / 2 = 13 rows)
titles_header_idx = 3
titles_start_idx = 4
titles_end = build_2col_section(picker_id, 'PERSON TITLES (Col E)', titles_header_idx, TITLES, titles_start_idx, b2)
print(f"Titles: rows {titles_start_idx+1}-{titles_end} ({math.ceil(len(TITLES)/2)} rows)")

# Separator
sep1_idx = titles_end
b2.append({
    'updateDimensionProperties': {
        'range': {'sheetId': picker_id, 'dimension': 'ROWS', 'startIndex': sep1_idx, 'endIndex': sep1_idx + 1},
        'properties': {'pixelSize': 6}, 'fields': 'pixelSize'
    }
})
b2.append({
    'repeatCell': {
        'range': {
            'sheetId': picker_id,
            'startRowIndex': sep1_idx, 'endRowIndex': sep1_idx + 1,
            'startColumnIndex': 0, 'endColumnIndex': 6
        },
        'cell': {'userEnteredFormat': {'backgroundColor': TEAL}},
        'fields': 'userEnteredFormat.backgroundColor'
    }
})

# Seniorities
sen_header_idx = sep1_idx + 1
sen_start_idx = sen_header_idx + 1
sen_end = build_2col_section(picker_id, 'PERSON SENIORITIES (Col F)', sen_header_idx, SENIORITIES, sen_start_idx, b2)
print(f"Seniorities: rows {sen_start_idx+1}-{sen_end} ({math.ceil(len(SENIORITIES)/2)} rows)")

# Separator
sep2_idx = sen_end
b2.append({
    'updateDimensionProperties': {
        'range': {'sheetId': picker_id, 'dimension': 'ROWS', 'startIndex': sep2_idx, 'endIndex': sep2_idx + 1},
        'properties': {'pixelSize': 6}, 'fields': 'pixelSize'
    }
})
b2.append({
    'repeatCell': {
        'range': {
            'sheetId': picker_id,
            'startRowIndex': sep2_idx, 'endRowIndex': sep2_idx + 1,
            'startColumnIndex': 0, 'endColumnIndex': 6
        },
        'cell': {'userEnteredFormat': {'backgroundColor': TEAL}},
        'fields': 'userEnteredFormat.backgroundColor'
    }
})

# Job Seniorities
job_header_idx = sep2_idx + 1
job_start_idx = job_header_idx + 1
job_end = build_2col_section(picker_id, 'JOB SENIORITY (Col J)', job_header_idx, JOB_SENIORITIES, job_start_idx, b2)
print(f"Job Seniorities: rows {job_start_idx+1}-{job_end} ({math.ceil(len(JOB_SENIORITIES)/2)} rows)")

# ── Freeze row 2 on Picker ──────────────────────────────────────────────────
b2.append({
    'updateSheetProperties': {
        'properties': {
            'sheetId': picker_id,
            'gridProperties': {'frozenRowCount': 2}
        },
        'fields': 'gridProperties.frozenRowCount'
    }
})

# ── Protection on labels (B + E, warning only) ──────────────────────────────
b2.append({
    'addProtectedRange': {
        'protectedRange': {
            'range': {'sheetId': picker_id, 'startColumnIndex': 1, 'endColumnIndex': 2},
            'description': 'Picker left labels',
            'warningOnly': True
        }
    }
})
b2.append({
    'addProtectedRange': {
        'protectedRange': {
            'range': {'sheetId': picker_id, 'startColumnIndex': 4, 'endColumnIndex': 5},
            'description': 'Picker right labels',
            'warningOnly': True
        }
    }
})

# ── Outer border on entire Picker content area ──────────────────────────────
b2.append({
    'updateBorders': {
        'range': {
            'sheetId': picker_id,
            'startRowIndex': 0, 'endRowIndex': job_end,
            'startColumnIndex': 0, 'endColumnIndex': 6
        },
        'top': MEDUM, 'bottom': MEDUM, 'left': MEDUM, 'right': MEDUM
    }
})

# ── Print row mapping for script constants ───────────────────────────────────
print()
print(f"=== New Picker Layout (1-based rows for Apps Script) ===")
print(f"Titles:      rows {titles_start_idx+1}-{titles_end}  ({math.ceil(len(TITLES)/2)} rows, {len(TITLES)} items)")
print(f"Seniorities: rows {sen_start_idx+1}-{sen_end}  ({math.ceil(len(SENIORITIES)/2)} rows, {len(SENIORITIES)} items)")
print(f"Job Sen:     rows {job_start_idx+1}-{job_end}  ({math.ceil(len(JOB_SENIORITIES)/2)} rows, {len(JOB_SENIORITIES)} items)")
print(f"APPLY cell:  E2 (was D2)")
print(f"Sr No cell:  B2 (unchanged)")

# ── Send batch 2 ─────────────────────────────────────────────────────────────
print(f"\nBatch 2: sending {len(b2)} requests...")
r2 = sheets.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': b2}
).execute()
print(f"Done -- {len(r2.get('replies', []))} replies")

print()
print("Rebuild complete:")
print(f"  - Picker sheet recreated (sheetId: {picker_id})")
print("  - 2-column layout: left (A+B) + right (D+E) with spacer (C)")
print("  - Old 'Columns L+' protection removed from Main_Data")
print(f"  - APPLY checkbox moved to E2")
print()
print("IMPORTANT: Update Apps Script constants:")
print(f"  PICKER_APPLY_CELL = 'E2'  (was D2)")
print(f"  PICKER_TITLES_START = {titles_start_idx+1}")
print(f"  PICKER_TITLES_ROWS  = {math.ceil(len(TITLES)/2)}")
print(f"  PICKER_SEN_START    = {sen_start_idx+1}")
print(f"  PICKER_SEN_ROWS     = {math.ceil(len(SENIORITIES)/2)}")
print(f"  PICKER_JOB_START    = {job_start_idx+1}")
print(f"  PICKER_JOB_ROWS     = {math.ceil(len(JOB_SENIORITIES)/2)}")
