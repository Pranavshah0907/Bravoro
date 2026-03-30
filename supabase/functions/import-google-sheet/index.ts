import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import * as jose from "https://deno.land/x/jose@v4.15.4/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// V4 Bulk Search headers (skip Picker checkbox column — it exports as TRUE/FALSE)
const BULK_SEARCH_HEADERS = [
  "sr no",
  "organization name",
  "organization locations",
  "organization domains",
  "person functions",
  "person seniorities",
  "person job title",
  "results per function",
  "job search",
  "job title",
  "job seniority",
  "date (days)",
];

// People Enrichment headers
const PEOPLE_ENRICHMENT_HEADERS = [
  "sr no",
  "record id",
  "first name",
  "last name",
  "organization domain",
  "linkedin url",
];

type TemplateType = "bulk_search" | "people_enrichment";

function getExpectedHeaders(templateType: TemplateType): string[] {
  return templateType === "people_enrichment" ? PEOPLE_ENRICHMENT_HEADERS : BULK_SEARCH_HEADERS;
}

// Maps a parsed row (keyed by raw header string) back to SpreadsheetGrid's GridRow shape
function rowToGridRow(
  row: Record<string, string>,
  headers: string[],
): Record<string, string> {
  const hLow = headers.map((h) => h.toLowerCase());
  // Flexible get: matches exact or prefix (e.g. "job title" matches "job title (comma separated)")
  const get = (key: string) => {
    let idx = hLow.indexOf(key);
    if (idx === -1) idx = hLow.findIndex(h => h.startsWith(key + " ") || h.startsWith(key + "("));
    return idx >= 0 ? (row[headers[idx]] ?? "") : "";
  };
  return {
    orgName:           get("organization name"),
    orgLocations:      get("organization locations"),
    orgDomains:        get("organization domains"),
    personFunctions:   get("person functions"),
    personSeniorities: get("person seniorities"),
    personJobTitle:    get("person job title"),
    resultsPerTitle:   get("results per function") || "3",
    toggleJobSearch:   get("job search") || "No",
    jobTitle:          get("job title"),
    jobSeniority:      get("job seniority"),
    datePosted:        get("date (days)") || "0",
  };
}

// Maps a parsed row to People Enrichment shape
function rowToPeopleEnrichmentRow(
  row: Record<string, string>,
  headers: string[],
): Record<string, string> {
  const hLow = headers.map((h) => h.toLowerCase());
  const get = (key: string) => {
    let idx = hLow.indexOf(key);
    if (idx === -1) idx = hLow.findIndex(h => h.startsWith(key + " ") || h.startsWith(key + "("));
    return idx >= 0 ? (row[headers[idx]] ?? "") : "";
  };
  return {
    "Record Id":           String(get("record id")),
    "First Name":          String(get("first name")),
    "Last Name":           String(get("last name")),
    "Organization Domain": String(get("organization domain")),
    "LinkedIn URL":        String(get("linkedin url")),
  };
}

// Validate People Enrichment rows: First Name, Last Name, Organization Domain required
function validatePeopleEnrichmentRows(
  data: Record<string, string>[],
  headers: string[],
): { errors: { row: number; message: string }[] } {
  const hLow = headers.map((h) => h.toLowerCase());
  const findIdx = (key: string) => {
    let idx = hLow.indexOf(key);
    if (idx === -1) idx = hLow.findIndex(h => h.startsWith(key + " ") || h.startsWith(key + "("));
    return idx;
  };
  const firstNameIdx = findIdx("first name");
  const lastNameIdx = findIdx("last name");
  const domainIdx = findIdx("organization domain");
  const srNoIdx = findIdx("sr no");
  const errors: { row: number; message: string }[] = [];

  data.forEach((row, i) => {
    const rowNum = i + 2;
    // Skip empty rows (only Sr No or nothing)
    const hasMeaningfulData = Object.entries(row).some(([key, v]) => {
      if (!v.trim()) return false;
      const kIdx = headers.indexOf(key);
      return kIdx !== srNoIdx;
    });
    if (!hasMeaningfulData) return;

    const firstName = firstNameIdx >= 0 ? (row[headers[firstNameIdx]] ?? "").trim() : "";
    const lastName = lastNameIdx >= 0 ? (row[headers[lastNameIdx]] ?? "").trim() : "";
    const domain = domainIdx >= 0 ? (row[headers[domainIdx]] ?? "").trim() : "";

    if (!firstName) {
      errors.push({ row: rowNum, message: `Row ${rowNum}: First Name is required` });
    } else if (/\d/.test(firstName)) {
      errors.push({ row: rowNum, message: `Row ${rowNum}: First Name must not contain numbers` });
    }
    if (!lastName) {
      errors.push({ row: rowNum, message: `Row ${rowNum}: Last Name is required` });
    } else if (/\d/.test(lastName)) {
      errors.push({ row: rowNum, message: `Row ${rowNum}: Last Name must not contain numbers` });
    }
    if (!domain) {
      errors.push({ row: rowNum, message: `Row ${rowNum}: Organization Domain is required` });
    }
  });

  return { errors };
}

// Validate rows for domain presence and Person Job Title guard
function validateRows(
  data: Record<string, string>[],
  headers: string[],
): { errors: { row: number; message: string }[] } {
  const hLow = headers.map((h) => h.toLowerCase());
  // Flexible index finder (prefix match)
  const findIdx = (key: string) => {
    let idx = hLow.indexOf(key);
    if (idx === -1) idx = hLow.findIndex(h => h.startsWith(key + " ") || h.startsWith(key + "("));
    return idx;
  };
  const domainIdx = findIdx("organization domains");
  const functionsIdx = findIdx("person functions");
  const jobTitleIdx = findIdx("person job title");
  const errors: { row: number; message: string }[] = [];

  // Headers to ignore when checking if a row has meaningful data
  const srNoIdx = findIdx("sr no");
  const pickerIdx = hLow.indexOf("picker");

  data.forEach((row, i) => {
    const rowNum = i + 2; // 1-based + header row
    // A row is meaningful if it has data beyond just Sr No and Picker columns
    const hasMeaningfulData = Object.entries(row).some(([key, v]) => {
      if (!v.trim()) return false;
      const kIdx = headers.indexOf(key);
      return kIdx !== srNoIdx && kIdx !== pickerIdx;
    });
    if (!hasMeaningfulData) return; // skip empty/Sr No-only rows

    // Check domain
    const domain = domainIdx >= 0 ? (row[headers[domainIdx]] ?? "").trim() : "";
    if (!domain) {
      errors.push({ row: rowNum, message: `Row ${rowNum}: Missing Organization Domain` });
    }

    // Check Person Job Title guard
    const functions = functionsIdx >= 0 ? (row[headers[functionsIdx]] ?? "").trim() : "";
    const personJobTitle = jobTitleIdx >= 0 ? (row[headers[jobTitleIdx]] ?? "").trim() : "";
    if (personJobTitle) {
      const fnCount = functions
        ? functions.split(",").map((s: string) => s.trim()).filter(Boolean).length
        : 0;
      if (fnCount >= 2) {
        errors.push({
          row: rowNum,
          message: `Row ${rowNum}: Person Job Title can only be used with 0 or 1 Person Function (found ${fnCount})`,
        });
      }
    }
  });

  return { errors };
}

// Extract sheet ID from any Google Sheets URL format
function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Fetch public sheet as CSV and parse into rows
async function fetchSheetCsv(sheetId: string, sheetName = "Main_Data"): Promise<{
  ok: boolean;
  rows?: string[][];
  error?: string;
}> {
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&sheet=${encodeURIComponent(sheetName)}`;

  let res: Response;
  try {
    res = await fetch(exportUrl, { redirect: "follow" });
  } catch (e) {
    return { ok: false, error: "Network error reaching Google Sheets" };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "not_public" };
  }
  if (!res.ok) {
    // Try default first sheet if named sheet not found
    if (sheetName !== "Sheet1") {
      return fetchSheetCsv(sheetId, "Sheet1");
    }
    return { ok: false, error: `Google returned ${res.status}` };
  }

  const text = await res.text();
  if (!text.trim()) return { ok: false, error: "Sheet is empty" };

  const rows = parseCsv(text);
  return { ok: true, rows };
}

// RFC 4180 CSV parser — handles multiline quoted fields (Alt+Enter in Sheets)
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cells: string[] = [];
  let cur = "";
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ",") {
        cells.push(cur.trim()); cur = "";
      } else if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        cells.push(cur.trim()); cur = "";
        if (cells.some(c => c)) rows.push(cells);
        cells = [];
      } else {
        cur += ch;
      }
    }
  }
  // flush last row
  cells.push(cur.trim());
  if (cells.some(c => c)) rows.push(cells);

  return rows;
}

// Normalize header: collapse whitespace/newlines to single space
function normalizeHeader(h: string): string {
  return h.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

// Check if an expected header is present in the actual headers list
// Uses startsWith matching so "job title (comma separated)" matches expected "job title"
function headerMatches(expected: string, actuals: string[]): boolean {
  return actuals.some(a => a === expected || a.startsWith(expected + " ") || a.startsWith(expected + "("));
}

// Find missing headers from expected list
function findMissingHeaders(expectedHeaders: string[], actualHeaders: string[]): string[] {
  const normalised = actualHeaders.map(h => h.toLowerCase()).filter(h => h !== "picker");
  return expectedHeaders.filter(e => !headerMatches(e, normalised));
}

// Convert parsed rows into the same JSON format the Excel parser produces
function rowsToJson(rows: string[][]): { headers: string[]; data: Record<string, string>[] } {
  if (rows.length === 0) return { headers: [], data: [] };
  const headers = rows[0].map(h => normalizeHeader(h));
  const data = rows.slice(1)
    .filter(row => row.some(cell => cell.trim()))  // skip blank rows
    .map(row => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = row[i]?.trim() ?? ""; });
      return obj;
    });
  return { headers, data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Cryptographically verify the JWT against Supabase's JWKS endpoint.
    // --no-verify-jwt at gateway because Supabase runtime only supports HS256, not ES256.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");

    try {
      const JWKS = jose.createRemoteJWKSet(
        new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
      );
      const { payload } = await jose.jwtVerify(token, JWKS, {
        issuer: `${supabaseUrl}/auth/v1`,
        audience: "authenticated",
      });
      if (!payload.sub) throw new Error("no sub");
    } catch {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action, sheetUrl, userId, templateType: rawTemplateType } = body;
    const templateType: TemplateType = rawTemplateType === "people_enrichment" ? "people_enrichment" : "bulk_search";
    const EXPECTED_HEADERS = getExpectedHeaders(templateType);

    const sheetId = extractSheetId(sheetUrl ?? "");
    if (!sheetId) {
      return new Response(JSON.stringify({ error: "Invalid Google Sheets URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: validate ───────────────────────────────────────────────────
    // Full validation: accessibility + headers + domain + Job Title guard + preview rows
    if (action === "validate") {
      // People Enrichment sheets use "Sheet1"; Bulk Search uses "Main_Data"
      const sheetName = templateType === "people_enrichment" ? "Sheet1" : "Main_Data";
      const result = await fetchSheetCsv(sheetId, sheetName);
      if (!result.ok) {
        return new Response(JSON.stringify({
          status: "error",
          reason: result.error === "not_public" ? "not_public" : "fetch_failed",
          message: result.error === "not_public"
            ? "not_public"
            : result.error ?? "Could not fetch the sheet",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { headers, data } = rowsToJson(result.rows!);
      const missingHeaders = findMissingHeaders(EXPECTED_HEADERS, headers);

      if (missingHeaders.length > 0) {
        return new Response(JSON.stringify({
          status: "error",
          reason: "headers_mismatch",
          missingHeaders,
          message: `Missing columns: ${missingHeaders.join(", ")}`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Row-level validation — use appropriate validator per template type
      const { errors } = templateType === "people_enrichment"
        ? validatePeopleEnrichmentRows(data, headers)
        : validateRows(data, headers);

      const mappedRows = data
        .filter(row => Object.values(row).some(v => v.trim()))
        .map(row => templateType === "people_enrichment"
          ? rowToPeopleEnrichmentRow(row, headers)
          : rowToGridRow(row, headers));

      // Count filled rows based on template type
      let filledRows: Record<string, string>[];
      let jobSearchRows = 0;
      if (templateType === "people_enrichment") {
        filledRows = mappedRows.filter(r =>
          r["First Name"]?.trim() || r["Last Name"]?.trim() || r["Organization Domain"]?.trim()
        );
      } else {
        filledRows = mappedRows.filter(r =>
          r.orgName?.trim() || r.orgDomains?.trim() || r.personFunctions?.trim()
        );
        jobSearchRows = filledRows.filter(r => r.toggleJobSearch?.toLowerCase() === "yes").length;
      }

      if (errors.length > 0) {
        return new Response(JSON.stringify({
          status: "error",
          reason: "validation_failed",
          errors,
          summary: { totalRows: filledRows.length, jobSearchRows },
          message: `${errors.length} validation error(s) found`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        status: "ok",
        summary: { totalRows: filledRows.length, jobSearchRows },
        rows: mappedRows,
        message: `${filledRows.length} rows ready`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: check ──────────────────────────────────────────────────────
    if (action === "check") {
      const result = await fetchSheetCsv(sheetId);
      if (!result.ok) {
        const notPublic = result.error === "not_public";
        return new Response(JSON.stringify({
          accessible: false,
          reason: notPublic ? "not_public" : result.error,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { headers } = rowsToJson(result.rows!);
      const normalised = headers.map(h => h.toLowerCase());
      const missingHeaders = findMissingHeaders(EXPECTED_HEADERS, headers);

      return new Response(JSON.stringify({
        accessible: true,
        headersValid: missingHeaders.length === 0,
        missingHeaders,
        rowCount: (result.rows?.length ?? 1) - 1,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: import ─────────────────────────────────────────────────────
    if (action === "import") {
      const importSheetName = templateType === "people_enrichment" ? "Sheet1" : "Main_Data";
      const result = await fetchSheetCsv(sheetId, importSheetName);
      if (!result.ok) {
        return new Response(JSON.stringify({
          error: result.error === "not_public"
            ? "Sheet is not publicly accessible. Please share it with 'Anyone with the link'."
            : result.error,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { headers, data } = rowsToJson(result.rows!);
      const missingHeaders = findMissingHeaders(EXPECTED_HEADERS, headers);
      if (missingHeaders.length > 0) {
        return new Response(JSON.stringify({
          error: `Missing columns: ${missingHeaders.join(", ")}. Please use the Bravoro template.`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Create search record — type depends on template
      const searchType = templateType === "people_enrichment" ? "bulk_people_enrichment" : "bulk";
      const entryType = templateType === "people_enrichment" ? "bulk_people_enrichment" : "bulk_upload";

      const { data: search, error: searchError } = await supabase
        .from("searches")
        .insert({
          user_id: userId,
          search_type: searchType,
          excel_file_name: `google_sheet_${sheetId}`,
          status: "processing",
        })
        .select()
        .single();

      if (searchError) throw searchError;

      // Transform rows to match SpreadsheetGrid's exact payload format
      // so n8n receives identical structure regardless of submission method
      const toArrOrStr = (s: string) => {
        const arr = s.trim() ? s.split(",").map(x => x.trim()).filter(Boolean) : [];
        return arr.length <= 1 ? (arr[0] ?? "") : arr;
      };

      let webhookData: Record<string, unknown>;

      if (templateType === "people_enrichment") {
        // People Enrichment: map to title-cased keys
        const peRows = data
          .filter(row => Object.values(row).some(v => v.trim()))
          .map(row => rowToPeopleEnrichmentRow(row, headers));
        webhookData = { Sheet1: peRows };
      } else {
        // Bulk Search: map to SpreadsheetGrid's Main_Data format
        const gridRows = data
          .filter(row => Object.values(row).some(v => v.trim()))
          .map(row => rowToGridRow(row, headers));
        const mainData = gridRows
          .filter(r => r.orgName?.trim() || r.orgDomains?.trim() || r.personFunctions?.trim())
          .map((r, idx) => ({
            "Sr No":                  idx + 1,
            "Organization Name":      r.orgName?.trim() ?? "",
            "Organization Locations":  r.orgLocations?.trim() ?? "",
            "Organization Domains":    r.orgDomains?.trim() ?? "",
            "Person Functions":        toArrOrStr(r.personFunctions ?? ""),
            "Person Seniorities":      toArrOrStr(r.personSeniorities ?? ""),
            "Person Job Title":        r.personJobTitle?.trim() ?? "",
            "Results per Function":    parseInt(r.resultsPerTitle) || 3,
            "Toggle job search":       r.toggleJobSearch || "No",
            "Job Title":               toArrOrStr(r.jobTitle ?? ""),
            "Job Seniority":           toArrOrStr(r.jobSeniority ?? ""),
            "Date Posted":             parseInt(r.datePosted) || 0,
          }));
        webhookData = { Main_Data: mainData };
      }

      // Invoke trigger-n8n-webhook — pass the user's JWT so it can authenticate
      const { error: webhookError } = await supabase.functions.invoke("trigger-n8n-webhook", {
        headers: { Authorization: authHeader! },
        body: {
          searchId: search.id,
          entryType,
          searchData: {
            search_id: search.id,
            data: webhookData,
          },
        },
      });

      if (webhookError) {
        console.error("Webhook error:", webhookError.message);
        return new Response(JSON.stringify({ error: "Failed to start processing. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true, searchId: search.id, rowCount: data.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: preview ────────────────────────────────────────────────────
    // Returns parsed GridRow[] without triggering n8n — used for Sheets sync-back
    if (action === "preview") {
      // Try "Bulk Search" sheet name first (Bravoro export), then Sheet1
      let result = await fetchSheetCsv(sheetId, "Bulk Search");
      if (!result.ok) result = await fetchSheetCsv(sheetId, "Sheet1");

      if (!result.ok) {
        return new Response(JSON.stringify({
          error: result.error === "not_public"
            ? "Sheet is not publicly accessible. In Google Sheets, set sharing to 'Anyone with the link can view'."
            : result.error,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { headers, data } = rowsToJson(result.rows!);
      const gridRows = data.map((row) => rowToGridRow(row, headers));

      return new Response(
        JSON.stringify({ rows: gridRows, rowCount: gridRows.filter((r) => r.orgName?.trim()).length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("import-google-sheet error:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
