"""
Google Sheets — BulkSearch Job Columns Setup
Steps 1, 2, 3, 4 (number validation), 5 (borders) — all via Sheets API + gspread
Step 3: reads existing data-cell background first, prints it for reference
"""

import sys
import json

try:
    import gspread
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build
except ImportError as e:
    print(f"Missing package: {e}")
    print("Run: python -m pip install gspread google-api-python-client google-auth-httplib2")
    sys.exit(1)

KEY_FILE = 'c:/Pranav/SiddhaAI/02_Bravoro/01_WebsiteRepo/leapleadsai/InputFiles/leap-project-480114-b965559fa9ff.json'
SHEET_ID = '180mh2AlShUPxQ0jFpR87hcpMHUeB0-II_3cPaCKirGE'

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]

print("Connecting to Google Sheets...")
creds = Credentials.from_service_account_file(KEY_FILE, scopes=SCOPES)
gc = gspread.authorize(creds)
sh = gc.open_by_key(SHEET_ID)

ws = next((w for w in sh.worksheets() if w.title == 'Main_Data'), None)
if not ws:
    print("ERROR: Main_Data tab not found")
    sys.exit(1)

print(f"Connected: '{sh.title}' > tab '{ws.title}' (sheetId={ws.id})")
sheet_id = ws.id

service = build('sheets', 'v4', credentials=creds)

# ─── Read existing formatting to match ────────────────────────────────────────
print("\nReading existing cell formatting...")
resp = service.spreadsheets().get(
    spreadsheetId=SHEET_ID,
    ranges=['Main_Data!A1:F3'],
    includeGridData=True
).execute()

rows = resp['sheets'][0]['data'][0]['rowData']

def get_fmt(rows, row_i, col_i):
    try:
        return rows[row_i]['values'][col_i].get('userEnteredFormat', {})
    except (IndexError, KeyError):
        return {}

a1_fmt = get_fmt(rows, 0, 0)
a2_fmt = get_fmt(rows, 1, 0)

header_bg = a1_fmt.get('backgroundColor', {'red': 0.2, 'green': 0.5, 'blue': 0.5})
header_text_color = a1_fmt.get('textFormat', {}).get('foregroundColor', {'red': 1, 'green': 1, 'blue': 1})
data_bg = a2_fmt.get('backgroundColor', {'red': 1, 'green': 1, 'blue': 1})

print(f"  Header bg: r={header_bg.get('red',0):.3f} g={header_bg.get('green',0):.3f} b={header_bg.get('blue',0):.3f}")
print(f"  Data row bg: r={data_bg.get('red',1):.3f} g={data_bg.get('green',1):.3f} b={data_bg.get('blue',1):.3f}")

# Grey for locked H:J cells — same as Excel RGB(242,242,242)
GREY = {'red': 0.9490196, 'green': 0.9490196, 'blue': 0.9490196}
BLACK = {'red': 0, 'green': 0, 'blue': 0}

# ─── Step 1: Write header values ──────────────────────────────────────────────
print("\nStep 1: Writing header text...")
ws.update(
    'G1:J1',
    [['Toggle job search', 'Job Title\n(comma separated)', 'Job Seniority', 'Date Posted\n(max age days)']],
    value_input_option='RAW'
)
print("  Headers written to G1:J1")

# ─── Build batchUpdate requests ───────────────────────────────────────────────
requests = []

# Step 1a: Column widths G, H, I, J
for col_idx, px in [(6, 160), (7, 175), (8, 130), (9, 175)]:
    requests.append({
        'updateDimensionProperties': {
            'range': {
                'sheetId': sheet_id,
                'dimension': 'COLUMNS',
                'startIndex': col_idx,
                'endIndex': col_idx + 1
            },
            'properties': {'pixelSize': px},
            'fields': 'pixelSize'
        }
    })

# Step 1b: Header cell formatting G1:J1
requests.append({
    'repeatCell': {
        'range': {
            'sheetId': sheet_id,
            'startRowIndex': 0, 'endRowIndex': 1,
            'startColumnIndex': 6, 'endColumnIndex': 10
        },
        'cell': {
            'userEnteredFormat': {
                'backgroundColor': header_bg,
                'textFormat': {
                    'bold': True,
                    'foregroundColor': header_text_color
                },
                'horizontalAlignment': 'CENTER',
                'verticalAlignment': 'MIDDLE',
                'wrapStrategy': 'WRAP'
            }
        },
        'fields': 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
    }
})

# Step 2: Yes/No dropdown on G2:G101
requests.append({
    'setDataValidation': {
        'range': {
            'sheetId': sheet_id,
            'startRowIndex': 1, 'endRowIndex': 101,
            'startColumnIndex': 6, 'endColumnIndex': 7
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

# Step 3: Grey background on H2:J101
requests.append({
    'repeatCell': {
        'range': {
            'sheetId': sheet_id,
            'startRowIndex': 1, 'endRowIndex': 101,
            'startColumnIndex': 7, 'endColumnIndex': 10
        },
        'cell': {
            'userEnteredFormat': {'backgroundColor': GREY}
        },
        'fields': 'userEnteredFormat.backgroundColor'
    }
})

# Step 4 (exec order): Number validation on J2:J101 — whole number ≥ 1
requests.append({
    'setDataValidation': {
        'range': {
            'sheetId': sheet_id,
            'startRowIndex': 1, 'endRowIndex': 101,
            'startColumnIndex': 9, 'endColumnIndex': 10
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

# Step 5 (exec order): Borders
# Bottom border of row 101, cols A:J (index 0–9)
requests.append({
    'updateBorders': {
        'range': {
            'sheetId': sheet_id,
            'startRowIndex': 100, 'endRowIndex': 101,
            'startColumnIndex': 0, 'endColumnIndex': 10
        },
        'bottom': {'style': 'SOLID_MEDIUM', 'color': BLACK}
    }
})

# Right border col J (index 9), rows 1–101 (index 0–101)
requests.append({
    'updateBorders': {
        'range': {
            'sheetId': sheet_id,
            'startRowIndex': 0, 'endRowIndex': 101,
            'startColumnIndex': 9, 'endColumnIndex': 10
        },
        'right': {'style': 'SOLID', 'color': BLACK}
    }
})

# Header borders G1:J1 — all edges + inner verticals
requests.append({
    'updateBorders': {
        'range': {
            'sheetId': sheet_id,
            'startRowIndex': 0, 'endRowIndex': 1,
            'startColumnIndex': 6, 'endColumnIndex': 10
        },
        'top':           {'style': 'SOLID_MEDIUM', 'color': BLACK},
        'bottom':        {'style': 'SOLID',        'color': BLACK},
        'left':          {'style': 'SOLID',        'color': BLACK},
        'right':         {'style': 'SOLID',        'color': BLACK},
        'innerVertical': {'style': 'SOLID',        'color': BLACK}
    }
})

# ─── Execute ──────────────────────────────────────────────────────────────────
print(f"\nSending {len(requests)} batchUpdate requests...")
result = service.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID,
    body={'requests': requests}
).execute()
print(f"Done — {len(result.get('replies', []))} replies received")
print("\nSteps 1 (headers + widths), 2 (Yes/No dropdown), 3 (grey background),")
print("  4 (number validation on J), 5 (borders) -- ALL COMPLETE")
print("\nNext: Steps 6 (onEdit trigger) + 7 (multi-select modal) -> Apps Script")
