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
  apollo_credits?: number | string | null;
  aleads_credits?: number | string | null;
  lusha_credits?: number | string | null;
}

// Generate a unique request ID for tracking
function generateRequestId(): string {
  return crypto.randomUUID();
}

function toInt(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const n = Number(trimmed);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  return 0;
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

    // Parse request body - handle both JSON and Form Data
    let body: RequestBody;
    const contentType = req.headers.get('content-type') || '';
    
    console.log(`[${requestId}] Content-Type: ${contentType}`);
    
    if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      // Parse as form data
      const formData = await req.formData();
      const formEntries: Record<string, unknown> = {};
      
      for (const [key, value] of formData.entries()) {
        console.log(`[${requestId}] Form field: ${key} = ${value}`);
        // Try to parse JSON strings (for nested objects like companies)
        if (typeof value === 'string') {
          try {
            formEntries[key] = JSON.parse(value);
          } catch {
            formEntries[key] = value;
          }
        } else {
          formEntries[key] = value;
        }
      }
      
      body = formEntries as unknown as RequestBody;
      console.log(`[${requestId}] Parsed form data keys:`, Object.keys(formEntries));
    } else {
      // Parse as JSON
      body = (await req.json()) as RequestBody;
    }

    const search_id = typeof body?.search_id === 'string' ? body.search_id : '';
    const companies: Company[] = Array.isArray(body?.companies) ? (body.companies as Company[]) : [];

    // Parse credits using exact field names only
    const apolloCredits = toInt(body.apollo_credits);
    const aleadsCredits = toInt(body.aleads_credits);
    const lushaCredits = toInt(body.lusha_credits);

    console.log(`[${requestId}] Received request for search_id:`, search_id);
    console.log(`[${requestId}] Number of companies:`, companies.length);
    console.log(`[${requestId}] Credits received - apollo_credits: ${body.apollo_credits}, aleads_credits: ${body.aleads_credits}, lusha_credits: ${body.lusha_credits}`);
    console.log(`[${requestId}] Credits parsed - Apollo: ${apolloCredits}, A-Leads: ${aleadsCredits}, Lusha: ${lushaCredits}`);

    // Validate required fields
    if (!search_id) {
      console.error(`[${requestId}] Missing search_id`);
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required field', request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const hasAnyCredits = apolloCredits > 0 || aleadsCredits > 0 || lushaCredits > 0;

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
        .select('id, apollo_credits, aleads_credits, lusha_credits')
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

      const nextAleads = aleadsCredits !== undefined
        ? Math.max(existingCredit?.aleads_credits ?? 0, aleadsCredits)
        : (existingCredit?.aleads_credits ?? 0);

      const nextLusha = lushaCredits !== undefined
        ? Math.max(existingCredit?.lusha_credits ?? 0, lushaCredits)
        : (existingCredit?.lusha_credits ?? 0);

      if (existingCredit?.id) {
        const { error: creditError } = await supabase
          .from('credit_usage')
          .update({
            apollo_credits: nextApollo,
            aleads_credits: nextAleads,
            lusha_credits: nextLusha,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingCredit.id);

        if (creditError) {
          console.error(`[${requestId}] Error updating credit usage:`, creditError);
        } else {
          console.log(`[${requestId}] Credit usage updated - Apollo: ${nextApollo}, A-Leads: ${nextAleads}, Lusha: ${nextLusha}`);
        }
      } else {
        const { error: creditError } = await supabase
          .from('credit_usage')
          .insert({
            user_id: searchData.user_id,
            search_id: search_id,
            apollo_credits: nextApollo,
            aleads_credits: nextAleads,
            lusha_credits: nextLusha,
          });

        if (creditError) {
          console.error(`[${requestId}] Error saving credit usage:`, creditError);
        } else {
          console.log(`[${requestId}] Credit usage saved - Apollo: ${nextApollo}, A-Leads: ${nextAleads}, Lusha: ${nextLusha}`);
        }
      }
    } else {
      console.log(
        `[${requestId}] No credits to save or user_id not found. user_id: ${searchData?.user_id}, apollo: ${apolloCredits}, aleads: ${aleadsCredits}, lusha: ${lushaCredits}`,
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
