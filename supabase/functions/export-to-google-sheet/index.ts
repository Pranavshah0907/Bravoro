import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── JWT helpers ────────────────────────────────────────────────────────────────

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let b64 = "";
  for (const byte of bytes) b64 += String.fromCharCode(byte);
  return btoa(b64).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getAccessToken(keyJson: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header  = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify({
    iss:   keyJson.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
    aud:   "https://oauth2.googleapis.com/token",
    exp:   now + 3600,
    iat:   now,
  })));

  const signingInput = `${header}.${payload}`;

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(keyJson.private_key).buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${b64url(signature)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

// ── Sheets helpers ─────────────────────────────────────────────────────────────

const SHEET_HEADERS = [
  "Sr No", "Organization Name", "Organization Locations", "Organization Domains",
  "Person Functions", "Person Seniorities / Titles", "Results per title",
  "Toggle job search", "Job Title (comma separated)", "Job Seniority",
  "Date Posted (max age days)",
];

interface GridRow {
  orgName: string; orgLocations: string; orgDomains: string;
  personFunctions: string; personSeniorities: string; resultsPerTitle: string;
  toggleJobSearch: string; jobTitle: string; jobSeniority: string; datePosted: string;
}

function buildValues(rows: GridRow[]): (string | number)[][] {
  const data = rows.filter(r => r.orgName?.trim());
  return [
    SHEET_HEADERS,
    ...data.map((r, i) => [
      i + 1,
      r.orgName?.trim()           ?? "",
      r.orgLocations?.trim()      ?? "",
      r.orgDomains?.trim()        ?? "",
      r.personFunctions?.trim()   ?? "",
      r.personSeniorities?.trim() ?? "",
      parseInt(r.resultsPerTitle) || 3,
      r.toggleJobSearch           || "No",
      r.jobTitle?.trim()          ?? "",
      r.jobSeniority?.trim()      ?? "",
      parseInt(r.datePosted)      || 0,
    ]),
  ];
}

// ── Main handler ───────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerToken     = authHeader.replace("Bearer ", "");

    const authCheck = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${callerToken}`, apikey: supabaseAnonKey },
    });
    if (authCheck.status !== 200) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { sheetName, userEmail, rows } = await req.json() as {
      sheetName: string;
      userEmail: string;
      rows: GridRow[];
    };

    if (!rows?.length) {
      return new Response(JSON.stringify({ error: "No rows provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Google service account token ───────────────────────────────────────────
    const saJson = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!);
    const token  = await getAccessToken(saJson);

    // ── Create spreadsheet ────────────────────────────────────────────────────
    const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: { title: sheetName || "Bravoro Bulk Search" },
        sheets: [{ properties: { title: "Bulk Search" } }],
      }),
    });

    const spreadsheet = await createRes.json();
    if (!spreadsheet.spreadsheetId) {
      throw new Error(`Sheet creation failed: ${JSON.stringify(spreadsheet)}`);
    }
    const spreadsheetId = spreadsheet.spreadsheetId;
    const sheetId       = spreadsheet.sheets?.[0]?.properties?.sheetId ?? 0;

    // ── Populate data ─────────────────────────────────────────────────────────
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Bulk%20Search!A1:append?valueInputOption=RAW`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: buildValues(rows) }),
      },
    );

    // ── Format: bold header, teal background, freeze row 1 ───────────────────
    const tealColor = { red: 0, green: 0.616, blue: 0.647 }; // #009da5
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          // Freeze row 1
          {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: "gridProperties.frozenRowCount",
            },
          },
          // Bold header + teal background + white text
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: SHEET_HEADERS.length },
              cell: {
                userEnteredFormat: {
                  backgroundColor: tealColor,
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat)",
            },
          },
          // Auto-resize all columns
          {
            autoResizeDimensions: {
              dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: SHEET_HEADERS.length },
            },
          },
        ],
      }),
    });

    // ── Share with user email (editor) + make publicly readable for sync-back ──
    let shared = false;
    let shareError = "";

    try {
      // Share with specific user as writer
      if (userEmail) {
        const shareRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ type: "user", role: "writer", emailAddress: userEmail }),
          },
        );
        if (!shareRes.ok) {
          const err = await shareRes.json();
          shareError = err?.error?.message ?? "Sharing failed";
        }
      }

      // Make publicly viewable so sync-back (CSV export) works
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ type: "anyone", role: "reader" }),
        },
      );

      shared = true;
    } catch (e) {
      shareError = String(e);
      console.warn("Drive permissions failed (Drive API may not be enabled):", e);
    }

    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    return new Response(
      JSON.stringify({ url, spreadsheetId, shared, shareError: shareError || undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("export-to-google-sheet error:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
