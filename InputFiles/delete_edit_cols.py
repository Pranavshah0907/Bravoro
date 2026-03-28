"""
Delete cols E (Edit Titles) and G (Edit Seniorities) from Main_Data.
Delete G first so E index stays correct, then delete E.
Also clear old formula content from the new E3:F102 (were Person Titles / Person Seniorities formula cols).
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

requests = [
    # Delete col G (Edit Seniorities, 0-indexed = 6) FIRST
    {
        'deleteDimension': {
            'range': {
                'sheetId': WS_ID,
                'dimension': 'COLUMNS',
                'startIndex': 6,
                'endIndex': 7
            }
        }
    },
    # Delete col E (Edit Titles, 0-indexed = 4) SECOND
    {
        'deleteDimension': {
            'range': {
                'sheetId': WS_ID,
                'dimension': 'COLUMNS',
                'startIndex': 4,
                'endIndex': 5
            }
        }
    },
]

print("Deleting Edit Titles (col E) and Edit Seniorities (col G)...")
svc.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': requests}
).execute()
print("Columns deleted.")

# Now clear old formula content from new E3:F102
# (these were Person Titles formula col and Person Seniorities formula col)
svc.spreadsheets().values().clear(
    spreadsheetId=SHEET_ID,
    range='Main_Data!E3:F102'
).execute()
print("Cleared old formulas from E3:F102.")
print()
print("Column layout is now:")
print("  A: Sr No")
print("  B: Organization Name")
print("  C: Organization Locations")
print("  D: Organization Domains")
print("  E: Person Titles        <- sidebar writes here")
print("  F: Person Seniorities   <- sidebar writes here")
print("  G: Results per title")
print("  H: Toggle job search    <- Yes/No dropdown")
print("  I: Job Title")
print("  J: Job Seniority        <- sidebar writes here")
print("  K: Date Posted")
