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

interface CreditCounter {
  contacts_count?: number;
  enriched_contacts_count?: number;
  apollo_email_credits?: number;
  apollo_phone_credits?: number;
  apollo_total_credits?: number;
  aleads_total_credits?: number;
  lusha_total_credits?: number;
  grand_total_credits?: number;
}

interface RequestBody {
  search_id: string;
  companies?: Company[];
  credit_counter?: CreditCounter;
  // Legacy fields (for backward compatibility)
  apollo_credits?: number | string | null;
  aleads_credits?: number | string | null;
  lusha_credits?: number | string | null;
  enriched_contacts?: number | string | null;
  // Fields for people enrichment with success/failure categorization
  enriched_contacts_data?: Contact[];
  missing_contacts?: Contact[];
  // Error handling fields
  status?: 'error' | 'completed';
  error_message?: string;
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

function pickFirst(obj: Record<string, unknown> | undefined, keys: string[]): unknown {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v;
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
        // Try to parse JSON strings (for nested objects like companies, credit_counter)
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
      // Parse as JSON - handle array wrapper from n8n
      const rawBody = await req.json();
      body = Array.isArray(rawBody) ? rawBody[0] : rawBody;
    }

    const search_id = typeof body?.search_id === 'string' ? body.search_id : '';
    const companies: Company[] = Array.isArray(body?.companies) ? (body.companies as Company[]) : [];
    
    // Check for people enrichment payload format (enriched_contacts_data and/or missing_contacts)
    const enrichedContactsData: Contact[] = Array.isArray(body?.enriched_contacts_data) ? (body.enriched_contacts_data as Contact[]) : [];
    const missingContactsData: Contact[] = Array.isArray(body?.missing_contacts) ? (body.missing_contacts as Contact[]) : [];
    const isPeopleEnrichmentPayload = enrichedContactsData.length > 0 || missingContactsData.length > 0;

    const bodyAny = body as unknown as Record<string, unknown>;

    // Extract credit_counter from new payload format
    const creditCounter = (bodyAny?.credit_counter && typeof bodyAny.credit_counter === 'object')
      ? (bodyAny.credit_counter as CreditCounter)
      : undefined;

    // Parse credits - prefer new credit_counter format, fall back to legacy fields
    let apolloCredits = 0;
    let aleadsCredits = 0;
    let lushaCredits = 0;
    let enrichedContactsCount = 0;
    let contactsCount = 0;
    let apolloEmailCredits = 0;
    let apolloPhoneCredits = 0;
    let grandTotalCredits = 0;

    if (creditCounter) {
      // New format: credit_counter object with detailed fields
      apolloCredits = toInt(creditCounter.apollo_total_credits);
      aleadsCredits = toInt(creditCounter.aleads_total_credits);
      lushaCredits = toInt(creditCounter.lusha_total_credits);
      enrichedContactsCount = toInt(creditCounter.enriched_contacts_count);
      contactsCount = toInt(creditCounter.contacts_count);
      apolloEmailCredits = toInt(creditCounter.apollo_email_credits);
      apolloPhoneCredits = toInt(creditCounter.apollo_phone_credits);
      grandTotalCredits = toInt(creditCounter.grand_total_credits);
      
      console.log(`[${requestId}] Using new credit_counter format`);
    } else {
      // Legacy format: individual fields at root level or nested in credits object
      const creditsObj = (bodyAny?.credits && typeof bodyAny.credits === 'object')
        ? (bodyAny.credits as Record<string, unknown>)
        : undefined;

      const apolloRaw = pickFirst(bodyAny, [
        'apollo_credits',
        'apolloCredits',
        'apollo',
        'credits[apollo_credits]',
        'credits[apolloCredits]',
        'credits[apollo]',
      ]) ?? pickFirst(creditsObj, ['apollo_credits', 'apolloCredits', 'apollo']);

      const aleadsRaw = pickFirst(bodyAny, [
        'aleads_credits',
        'aleadsCredits',
        'aleads',
        'credits[aleads_credits]',
        'credits[aleadsCredits]',
        'credits[aleads]',
      ]) ?? pickFirst(creditsObj, ['aleads_credits', 'aleadsCredits', 'aleads']);

      const lushaRaw = pickFirst(bodyAny, [
        'lusha_credits',
        'lushaCredits',
        'lusha',
        'credits[lusha_credits]',
        'credits[lushaCredits]',
        'credits[lusha]',
      ]) ?? pickFirst(creditsObj, ['lusha_credits', 'lushaCredits', 'lusha']);

      const enrichedContactsRaw = pickFirst(bodyAny, [
        'enriched_contacts',
        'enrichedContacts',
        'enriched_count',
        'enrichedCount',
      ]);

      apolloCredits = toInt(apolloRaw);
      aleadsCredits = toInt(aleadsRaw);
      lushaCredits = toInt(lushaRaw);
      enrichedContactsCount = toInt(enrichedContactsRaw);
      
      console.log(`[${requestId}] Using legacy credit format`);
    }

    console.log(`[${requestId}] Received request for search_id:`, search_id);
    console.log(`[${requestId}] Number of companies:`, companies.length);
    console.log(`[${requestId}] Is people enrichment payload:`, isPeopleEnrichmentPayload);
    console.log(`[${requestId}] Enriched contacts data count:`, enrichedContactsData.length);
    console.log(`[${requestId}] Missing contacts data count:`, missingContactsData.length);
    console.log(`[${requestId}] Body keys:`, Object.keys(bodyAny));
    console.log(`[${requestId}] Credits - Apollo: ${apolloCredits}, A-Leads: ${aleadsCredits}, Lusha: ${lushaCredits}`);
    console.log(`[${requestId}] Additional fields - contacts_count: ${contactsCount}, enriched_contacts_count: ${enrichedContactsCount}`);
    console.log(`[${requestId}] Apollo breakdown - email: ${apolloEmailCredits}, phone: ${apolloPhoneCredits}`);
    console.log(`[${requestId}] Grand total credits: ${grandTotalCredits}`);

    // Validate required fields
    if (!search_id) {
      console.error(`[${requestId}] Missing search_id`);
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required field', request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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

    // Check if this is an error payload from n8n
    const isErrorPayload = bodyAny?.status === 'error' || (bodyAny?.error_message && !companies.length && !isPeopleEnrichmentPayload);

    if (isErrorPayload) {
      const errorMessage = (bodyAny?.error_message as string) || 'Unknown error occurred';
      
      console.log(`[${requestId}] Received error payload for search_id: ${search_id}`);
      console.log(`[${requestId}] Error message: ${errorMessage}`);
      
      // Update the search status to 'error' with the error message
      const { error: updateError } = await supabase
        .from('searches')
        .update({ 
          status: 'error', 
          error_message: errorMessage,
          updated_at: new Date().toISOString() 
        })
        .eq('id', search_id);

      if (updateError) {
        console.error(`[${requestId}] Error updating search status:`, updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update search status', request_id: requestId }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[${requestId}] Successfully recorded error status for search_id: ${search_id}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Error status recorded',
          search_id,
          request_id: requestId 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const hasAnyCredits = apolloCredits > 0 || aleadsCredits > 0 || lushaCredits > 0;

    // Delete existing results for this search (for re-runs)
    const { error: deleteError } = await supabase
      .from('search_results')
      .delete()
      .eq('search_id', search_id);

    if (deleteError) {
      console.error(`[${requestId}] Error deleting existing results:`, deleteError);
    }

    let results: { company_name: string; contacts_count: number }[] = [];
    let totalContacts = 0;

    // Handle people enrichment payload format
    if (isPeopleEnrichmentPayload) {
      console.log(`[${requestId}] Processing people enrichment payload format`);
      
      // Insert enriched contacts
      if (enrichedContactsData.length > 0) {
        const { error: enrichedError } = await supabase
          .from('search_results')
          .insert({
            search_id,
            company_name: 'People Enriched',
            domain: null,
            contact_data: enrichedContactsData,
            result_type: 'enriched'
          });

        if (enrichedError) {
          console.error(`[${requestId}] Error inserting enriched contacts:`, enrichedError);
          throw enrichedError;
        }
        
        results.push({ company_name: 'People Enriched', contacts_count: enrichedContactsData.length });
        console.log(`[${requestId}] Inserted ${enrichedContactsData.length} enriched contacts`);
      }

      // Insert missing contacts
      if (missingContactsData.length > 0) {
        const { error: missingError } = await supabase
          .from('search_results')
          .insert({
            search_id,
            company_name: 'People not found',
            domain: null,
            contact_data: missingContactsData,
            result_type: 'missing'
          });

        if (missingError) {
          console.error(`[${requestId}] Error inserting missing contacts:`, missingError);
          throw missingError;
        }
        
        results.push({ company_name: 'People not found', contacts_count: missingContactsData.length });
        console.log(`[${requestId}] Inserted ${missingContactsData.length} missing contacts`);
      }

      totalContacts = enrichedContactsData.length + missingContactsData.length;
    } else {
      // Original logic: Insert each company's results
      const insertPromises = companies.map(async (company) => {
        const { company_name, domain, contacts } = company;
        
        console.log(`[${requestId}] Inserting contacts for company:`, company_name);

        const { error } = await supabase
          .from('search_results')
          .insert({
            search_id,
            company_name: company_name || 'Unknown Company',
            domain: domain || null,
            contact_data: contacts || [],
            result_type: 'enriched'
          });

        if (error) {
          console.error(`[${requestId}] Error inserting company:`, error);
          throw error;
        }

        return { company_name, contacts_count: contacts?.length || 0 };
      });

      results = await Promise.all(insertPromises);
      totalContacts = results.reduce((sum, r) => sum + r.contacts_count, 0);
    }

    console.log(`[${requestId}] Successfully saved ${results.length} companies with ${totalContacts} total contacts`);

    // Update the search status to 'completed' (clear result_url as we no longer use storage)
    const { data: searchData, error: updateError } = await supabase
      .from('searches')
      .update({ 
        status: 'completed', 
        result_url: null,
        updated_at: new Date().toISOString() 
      })
      .eq('id', search_id)
      .select('user_id')
      .single();

    if (updateError) {
      console.error(`[${requestId}] Error updating search status:`, updateError);
    }

    // Update enrichment_used if enriched_contacts_count was provided
    if (searchData?.user_id && enrichedContactsCount > 0) {
      console.log(`[${requestId}] Incrementing enrichment_used by ${enrichedContactsCount} for user:`, searchData.user_id);
      
      const { error: rpcError } = await supabase.rpc('increment_enrichment_used', {
        p_user_id: searchData.user_id,
        p_count: enrichedContactsCount,
      });

      if (rpcError) {
        console.error(`[${requestId}] Error incrementing enrichment_used:`, rpcError);
      } else {
        console.log(`[${requestId}] Successfully incremented enrichment_used by ${enrichedContactsCount}`);
      }
    }

    // Save credit usage if any credits were provided
    if (searchData?.user_id && hasAnyCredits) {
      console.log(`[${requestId}] Saving credit usage for user:`, searchData.user_id);

      const { data: existingCredit, error: existingError } = await supabase
        .from('credit_usage')
        .select('id, apollo_credits, aleads_credits, lusha_credits, contacts_count, enriched_contacts_count, apollo_email_credits, apollo_phone_credits, grand_total_credits')
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

      // New fields - also apply the same "never decrease" logic
      const nextContactsCount = Math.max(existingCredit?.contacts_count ?? 0, contactsCount);
      const nextEnrichedContactsCount = Math.max(existingCredit?.enriched_contacts_count ?? 0, enrichedContactsCount);
      const nextApolloEmailCredits = Math.max(existingCredit?.apollo_email_credits ?? 0, apolloEmailCredits);
      const nextApolloPhoneCredits = Math.max(existingCredit?.apollo_phone_credits ?? 0, apolloPhoneCredits);
      const nextGrandTotalCredits = Math.max(existingCredit?.grand_total_credits ?? 0, grandTotalCredits);

      if (existingCredit?.id) {
        const { error: creditError } = await supabase
          .from('credit_usage')
          .update({
            apollo_credits: nextApollo,
            aleads_credits: nextAleads,
            lusha_credits: nextLusha,
            contacts_count: nextContactsCount,
            enriched_contacts_count: nextEnrichedContactsCount,
            apollo_email_credits: nextApolloEmailCredits,
            apollo_phone_credits: nextApolloPhoneCredits,
            grand_total_credits: nextGrandTotalCredits,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingCredit.id);

        if (creditError) {
          console.error(`[${requestId}] Error updating credit usage:`, creditError);
        } else {
          console.log(`[${requestId}] Credit usage updated - Apollo: ${nextApollo}, A-Leads: ${nextAleads}, Lusha: ${nextLusha}, Grand Total: ${nextGrandTotalCredits}`);
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
            contacts_count: nextContactsCount,
            enriched_contacts_count: nextEnrichedContactsCount,
            apollo_email_credits: nextApolloEmailCredits,
            apollo_phone_credits: nextApolloPhoneCredits,
            grand_total_credits: nextGrandTotalCredits,
          });

        if (creditError) {
          console.error(`[${requestId}] Error saving credit usage:`, creditError);
        } else {
          console.log(`[${requestId}] Credit usage saved - Apollo: ${nextApollo}, A-Leads: ${nextAleads}, Lusha: ${nextLusha}, Grand Total: ${nextGrandTotalCredits}`);
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
        enriched_contacts_deducted: enrichedContactsCount,
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
