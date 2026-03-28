"""Protect columns K onwards (index 10+) — warning only"""

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

result = svc.spreadsheets().batchUpdate(
    spreadsheetId=SHEET_ID,
    body={'requests': [{
        'addProtectedRange': {
            'protectedRange': {
                'range': {
                    'sheetId': ws_id,
                    'startColumnIndex': 10  # col K onwards, all rows
                },
                'description': 'Columns K+ — do not edit',
                'warningOnly': True
            }
        }
    }]}
).execute()
print("Done — columns K+ protected with warning")
