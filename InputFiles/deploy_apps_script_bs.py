"""
Phase 4a - Deploy new Apps Script project bound to BulkSearch_Template_V2
Uses OAuth2 (InstalledAppFlow) to create a new script project.
Prints the new SCRIPT_ID — save it for push_sidebar_bs.py
"""

import json, sys
try:
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
except ImportError as e:
    print(f"Missing: {e}"); sys.exit(1)

CLIENT_ID     = os.environ.get('GOOGLE_CLIENT_ID', '')     # set via env or replace inline locally
CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '') # set via env or replace inline locally
TOKEN_FILE    = 'InputFiles/oauth_token.json'
SHEET_ID      = '1Z4p1HJf5sMGgnNy_wGI04D-Jd0YNjSYq5A-PcEt-mbs'

SCOPES = [
    'https://www.googleapis.com/auth/script.projects',
    'https://www.googleapis.com/auth/script.deployments',
    'https://www.googleapis.com/auth/script.scriptapp',
    'https://www.googleapis.com/auth/spreadsheets',
]

# Load or refresh token
try:
    creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds.valid:
        import google.auth.transport.requests as tr
        creds.refresh(tr.Request())
except Exception:
    client_config = {
        "installed": {
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"]
        }
    }
    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    creds = flow.run_local_server(port=0)
    with open(TOKEN_FILE, 'w') as f:
        f.write(creds.to_json())

svc = build('script', 'v1', credentials=creds)

# Create new Apps Script project bound to the new sheet
project = svc.projects().create(body={
    'title': 'BulkSearch_JobToggle',
    'parentId': SHEET_ID
}).execute()

script_id = project['scriptId']
print(f"New SCRIPT_ID: {script_id}")
print()
print("Save this SCRIPT_ID and paste it into push_sidebar_bs.py as SCRIPT_ID")
