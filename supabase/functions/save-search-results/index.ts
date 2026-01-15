import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

interface Contact {
  First_Name: string;
  Last_Name: string;
  Domain: string;
  Organization: string;
  Title: string;
  Email: string;
  LinkedIn: string;
  Phone_Number_1: string;
  Phone_Number_2: string;
}

interface Company {
  company_name: string;
  domain: string;
  contacts: Contact[];
}

interface RequestBody {
  search_id: string;
  companies?: Company[];

  // Credits may arrive in different shapes depending on the n8n workflow
  apollo_credits?: number | string | null;
  cleon1_credits?: number | string | null;
  clay_credits?: number | string | null;
  lusha_credits?: number | string | null;

  credits?: {
    apollo?: number | string | null;
    cleon1?: number | string | null;
    clay?: number | string | null;
    lusha?: number | string | null;
  } | null;

  // Allow unknown extra fields without failing parsing
  [key: string]: unknown;
}

// Generate a unique request ID for tracking
function generateRequestId(): string {
  return crypto.randomUUID();
}

function toInt(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  }
  return undefined;
}

function pickFirstInt(...values: unknown[]): number | undefined {
  for (const v of values) {
    const parsed = toInt(v);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

serve(async (req: Request) => {
  const requestId = generateRequestId();
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify webhook secret for authentication
    const webhookSecret = Deno.env.get('N8N_WEBHOOK_SECRET');
    const providedSecret = req.headers.get('x-webhook-secret');
    
    if (!webhookSecret) {
      console.error(`[${requestId}] N8N_WEBHOOK_SECRET not configured`);
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error', request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!providedSecret || providedSecret !== webhookSecret) {
      console.error(`[${requestId}] Invalid or missing webhook secret`);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized', request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] Webhook authentication successful`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = (await req.json()) as RequestBody;

    const bodyAny = body as Record<string, unknown>;
    const creditsAny =
      body?.credits && typeof body.credits === 'object'
        ? (body.credits as Record<string, unknown>)
        : undefined;

    const search_id = typeof body?.search_id === 'string' ? body.search_id : '';
    const companies: Company[] = Array.isArray(body?.companies) ? (body.companies as Company[]) : [];

    const apolloCredits = pickFirstInt(
      body.apollo_credits,
      bodyAny['apolloCredits'],
      bodyAny['apollo_credit'],
      bodyAny['apollo'],
      body.credits?.apollo,
      creditsAny?.['apollo_credits'],
    );

    const cleon1Credits = pickFirstInt(
      body.cleon1_credits,
      bodyAny['cleon1Credits'],
      bodyAny['cleon1'],
      body.clay_credits,
      bodyAny['clay_credits'],
      bodyAny['clayCredits'],
      bodyAny['clay'],
      body.credits?.cleon1,
      body.credits?.clay,
    );

    const lushaCredits = pickFirstInt(
      body.lusha_credits,
      bodyAny['lushaCredits'],
      bodyAny['lusha'],
      body.credits?.lusha,
      creditsAny?.['lusha_credits'],
    );

    const creditKeys = Object.keys(body ?? {}).filter((k) => k.toLowerCase().includes('credit'));

    console.log(`[${requestId}] Received request for search_id:`, search_id);
    console.log(`[${requestId}] Number of companies:`, companies.length);
    console.log(`[${requestId}] Credit-related keys present:`, creditKeys);
    console.log(
      `[${requestId}] Credits parsed - Apollo: ${apolloCredits ?? 'not provided'}, Cleon1/Clay: ${cleon1Credits ?? 'not provided'}, Lusha: ${lushaCredits ?? 'not provided'}`,
    );

    // Validate required fields
    if (!search_id) {
      console.error(`[${requestId}] Missing search_id`);
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required field', request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const hasAnyCredits = [apolloCredits, cleon1Credits, lushaCredits].some((v) => typeof v === 'number');

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(search_id)) {
      console.error(`[${requestId}] Invalid search_id format`);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request format', request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete existing results for this search (for re-runs)
    const { error: deleteError } = await supabase
      .from('search_results')
      .delete()
      .eq('search_id', search_id);

    if (deleteError) {
      console.error(`[${requestId}] Error deleting existing results:`, deleteError);
    }

    // Insert each company's results
    const insertPromises = companies.map(async (company) => {
      const { company_name, domain, contacts } = company;
      
      console.log(`[${requestId}] Inserting contacts for company:`, company_name);

      const { error } = await supabase
        .from('search_results')
        .insert({
          search_id,
          company_name: company_name || 'Unknown Company',
          domain: domain || null,
          contact_data: contacts || []
        });

      if (error) {
        console.error(`[${requestId}] Error inserting company:`, error);
        throw error;
      }

      return { company_name, contacts_count: contacts?.length || 0 };
    });

    const results = await Promise.all(insertPromises);
    const totalContacts = results.reduce((sum, r) => sum + r.contacts_count, 0);

    console.log(`[${requestId}] Successfully saved ${results.length} companies with ${totalContacts} total contacts`);

    // Update the search status to 'completed'
    const { data: searchData, error: updateError } = await supabase
      .from('searches')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', search_id)
      .select('user_id')
      .single();

    if (updateError) {
      console.error(`[${requestId}] Error updating search status:`, updateError);
    }

    // Save credit usage if any credits were provided
    if (searchData?.user_id && hasAnyCredits) {
      console.log(`[${requestId}] Saving credit usage for user:`, searchData.user_id);

      const { data: existingCredit, error: existingError } = await supabase
        .from('credit_usage')
        .select('id, apollo_credits, cleon1_credits, lusha_credits')
        .eq('user_id', searchData.user_id)
        .eq('search_id', search_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingError) {
        console.error(`[${requestId}] Error reading existing credit usage:`, existingError);
      }

      // Prefer new values when provided, but never decrease totals (handles webhook retries)
      const nextApollo = apolloCredits !== undefined
        ? Math.max(existingCredit?.apollo_credits ?? 0, apolloCredits)
        : (existingCredit?.apollo_credits ?? 0);

      const nextCleon1 = cleon1Credits !== undefined
        ? Math.max(existingCredit?.cleon1_credits ?? 0, cleon1Credits)
        : (existingCredit?.cleon1_credits ?? 0);

      const nextLusha = lushaCredits !== undefined
        ? Math.max(existingCredit?.lusha_credits ?? 0, lushaCredits)
        : (existingCredit?.lusha_credits ?? 0);

      if (existingCredit?.id) {
        const { error: creditError } = await supabase
          .from('credit_usage')
          .update({
            apollo_credits: nextApollo,
            cleon1_credits: nextCleon1,
            lusha_credits: nextLusha,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingCredit.id);

        if (creditError) {
          console.error(`[${requestId}] Error updating credit usage:`, creditError);
        } else {
          console.log(`[${requestId}] Credit usage updated - Apollo: ${nextApollo}, Cleon1/Clay: ${nextCleon1}, Lusha: ${nextLusha}`);
        }
      } else {
        const { error: creditError } = await supabase
          .from('credit_usage')
          .insert({
            user_id: searchData.user_id,
            search_id: search_id,
            apollo_credits: nextApollo,
            cleon1_credits: nextCleon1,
            lusha_credits: nextLusha,
          });

        if (creditError) {
          console.error(`[${requestId}] Error saving credit usage:`, creditError);
        } else {
          console.log(`[${requestId}] Credit usage saved - Apollo: ${nextApollo}, Cleon1/Clay: ${nextCleon1}, Lusha: ${nextLusha}`);
        }
      }
    } else {
      console.log(
        `[${requestId}] No credits to save or user_id not found. user_id: ${searchData?.user_id}, apollo: ${apolloCredits}, cleon1: ${cleon1Credits}, lusha: ${lushaCredits}`,
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Data saved successfully',
        companies_saved: results.length,
        total_contacts: totalContacts,
        request_id: requestId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({ success: false, error: 'Request processing failed', request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
