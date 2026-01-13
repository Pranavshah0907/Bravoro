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
  companies: Company[];
  apollo_credits?: number;
  cleon1_credits?: number;
  lusha_credits?: number;
}

// Generate a unique request ID for tracking
function generateRequestId(): string {
  return crypto.randomUUID();
}

serve(async (req) => {
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

    const body: RequestBody = await req.json();
    const { search_id, companies, apollo_credits, cleon1_credits, lusha_credits } = body;

    console.log(`[${requestId}] Received request for search_id:`, search_id);
    console.log(`[${requestId}] Number of companies:`, companies?.length || 0);
    console.log(`[${requestId}] Credits received - Apollo: ${apollo_credits ?? 'not provided'}, Clay: ${cleon1_credits ?? 'not provided'}, Lusha: ${lusha_credits ?? 'not provided'}`);

    // Validate required fields
    if (!search_id) {
      console.error(`[${requestId}] Missing search_id`);
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required field', request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!companies || !Array.isArray(companies) || companies.length === 0) {
      console.error(`[${requestId}] Missing or empty companies array`);
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required data', request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
    if (searchData?.user_id && (apollo_credits || cleon1_credits || lusha_credits)) {
      console.log(`[${requestId}] Saving credit usage for user:`, searchData.user_id);
      
      const { error: creditError } = await supabase
        .from('credit_usage')
        .insert({
          user_id: searchData.user_id,
          search_id: search_id,
          apollo_credits: apollo_credits || 0,
          cleon1_credits: cleon1_credits || 0,
          lusha_credits: lusha_credits || 0,
        });

      if (creditError) {
        console.error(`[${requestId}] Error saving credit usage:`, creditError);
      } else {
        console.log(`[${requestId}] Credit usage saved successfully - Apollo: ${apollo_credits || 0}, Clay: ${cleon1_credits || 0}, Lusha: ${lusha_credits || 0}`);
      }
    } else {
      console.log(`[${requestId}] No credits to save or user_id not found. user_id: ${searchData?.user_id}, apollo: ${apollo_credits}, clay: ${cleon1_credits}, lusha: ${lusha_credits}`);
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
