import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: RequestBody = await req.json();
    const { search_id, companies } = body;

    console.log(`[save-search-results] Received request for search_id: ${search_id}`);
    console.log(`[save-search-results] Number of companies: ${companies?.length || 0}`);

    // Validate required fields
    if (!search_id) {
      console.error('[save-search-results] Missing search_id');
      return new Response(
        JSON.stringify({ success: false, error: 'search_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!companies || !Array.isArray(companies) || companies.length === 0) {
      console.error('[save-search-results] Missing or empty companies array');
      return new Response(
        JSON.stringify({ success: false, error: 'companies array is required and must not be empty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(search_id)) {
      console.error('[save-search-results] Invalid search_id format');
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid search_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete existing results for this search (for re-runs)
    const { error: deleteError } = await supabase
      .from('search_results')
      .delete()
      .eq('search_id', search_id);

    if (deleteError) {
      console.error('[save-search-results] Error deleting existing results:', deleteError);
    }

    // Insert each company's results
    const insertPromises = companies.map(async (company) => {
      const { company_name, domain, contacts } = company;
      
      console.log(`[save-search-results] Inserting ${contacts?.length || 0} contacts for company: ${company_name}`);

      const { error } = await supabase
        .from('search_results')
        .insert({
          search_id,
          company_name: company_name || 'Unknown Company',
          domain: domain || null,
          contact_data: contacts || []
        });

      if (error) {
        console.error(`[save-search-results] Error inserting company ${company_name}:`, error);
        throw error;
      }

      return { company_name, contacts_count: contacts?.length || 0 };
    });

    const results = await Promise.all(insertPromises);
    const totalContacts = results.reduce((sum, r) => sum + r.contacts_count, 0);

    console.log(`[save-search-results] Successfully saved ${results.length} companies with ${totalContacts} total contacts`);

    // Update the search status to 'completed'
    const { error: updateError } = await supabase
      .from('searches')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', search_id);

    if (updateError) {
      console.error('[save-search-results] Error updating search status:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Saved ${results.length} companies with ${totalContacts} contacts`,
        companies_saved: results.length,
        total_contacts: totalContacts
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[save-search-results] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
