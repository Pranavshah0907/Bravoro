"""
fix_remove_dropdowns.py — Remove data validation dropdowns from cols E, F, J on Main_Data
Sheet: 1uldSi7FoRVG7JibkbjJ0RY7nEK_kK9gTiRe5tKtbr6Y

Users now use the Picker tab instead of dropdown multi-select.
"""

import sys
try:
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build
except ImportError as e:
    print(f"Missing dependency: {e}"); sys.exit(1)

KEY_FILE = 'c:/Pranav/SiddhaAI/02_Bravoro/01_WebsiteRepo/leapleadsai/InputFiles/leap-project-480114-b965559fa9ff.json'
SHEET_ID = '1uldSi7FoRVG7JibkbjJ0RY7nEK_kK9gTiRe5tKtbr6Y'
MAIN_DATA_ID = 0

creds = Credentials.from_service_account_file(
    KEY_FILE, scopes=['https://www.googleapis.com/auth/spreadsheets'])
sheets = build('sheets', 'v4', credentials=creds)

reqs = []

# Clear data validation on E3:E102 (Person Titles)
reqs.append({
    'setDataValidation': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 4, 'endColumnIndex': 5  # E
        },
        'rule': None  # removes validation
    }
})

# Clear data validation on F3:F102 (Person Seniorities)
reqs.append({
    'setDataValidation': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 5, 'endColumnIndex': 6  # F
        },
        'rule': None
    }
})

# Clear data validation on J3:J102 (Job Seniority)
reqs.append({
    'setDataValidation': {
        'range': {
            'sheetId': MAIN_DATA_ID,
            'startRowIndex': 2, 'endRowIndex': 102,
            'startColumnIndex': 9, 'endColumnIndex': 10  # J
        },
        'rule': None
    }
})

print(f"Removing dropdowns from E, F, J...")
r = sheets.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID, body={'requests': reqs}
).execute()
print(f"Done -- {len(r.get('replies', []))} replies")
print("Dropdowns removed from E3:E102, F3:F102, J3:J102")
