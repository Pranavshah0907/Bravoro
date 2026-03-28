import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPECTED_HEADERS = [
  "sr no",
  "organization name",
  "organization locations",
  "organization domains",
  "person titles",
  "person seniorities",
  "results per title",
];

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

// Minimal RFC 4180 CSV parser
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        cells.push(cur.trim()); cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

// Convert parsed rows into the same JSON format the Excel parser produces
function rowsToJson(rows: string[][]): { headers: string[]; data: Record<string, string>[] } {
  if (rows.length === 0) return { headers: [], data: [] };
  const headers = rows[0].map(h => h.trim());
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
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerToken = authHeader.replace("Bearer ", "");
    const authCheck = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { "Authorization": `Bearer ${callerToken}`, "apikey": supabaseAnonKey },
    });
    if (authCheck.status !== 200 && authCheck.status !== 400) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action, sheetUrl, userId } = body;

    const sheetId = extractSheetId(sheetUrl ?? "");
    if (!sheetId) {
      return new Response(JSON.stringify({ error: "Invalid Google Sheets URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      const missingHeaders = EXPECTED_HEADERS.filter(e => !normalised.includes(e));

      return new Response(JSON.stringify({
        accessible: true,
        headersValid: missingHeaders.length === 0,
        missingHeaders,
        rowCount: (result.rows?.length ?? 1) - 1,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: import ─────────────────────────────────────────────────────
    if (action === "import") {
      const result = await fetchSheetCsv(sheetId);
      if (!result.ok) {
        return new Response(JSON.stringify({
          error: result.error === "not_public"
            ? "Sheet is not publicly accessible. Please share it with 'Anyone with the link'."
            : result.error,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { headers, data } = rowsToJson(result.rows!);
      const normalised = headers.map(h => h.toLowerCase());
      const missingHeaders = EXPECTED_HEADERS.filter(e => !normalised.includes(e));
      if (missingHeaders.length > 0) {
        return new Response(JSON.stringify({
          error: `Missing columns: ${missingHeaders.join(", ")}. Please use the Bravoro template.`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Create search record
      const { data: search, error: searchError } = await supabase
        .from("searches")
        .insert({
          user_id: userId,
          search_type: "bulk",
          excel_file_name: `google_sheet_${sheetId}`,
          status: "processing",
        })
        .select()
        .single();

      if (searchError) throw searchError;

      // Invoke trigger-n8n-webhook with same payload shape as Excel upload
      const { error: webhookError } = await supabase.functions.invoke("trigger-n8n-webhook", {
        body: {
          searchId: search.id,
          entryType: "bulk_upload",
          searchData: {
            search_id: search.id,
            data: { Main_Data: data },
            source: "google_sheets",
            sheet_id: sheetId,
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

    return new Response(JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("import-google-sheet error:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
