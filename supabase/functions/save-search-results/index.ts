import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

interface Contact {
  person_id?: string;       // Unique identifier from n8n (primary dedup key)
  Record_ID?: string;       // User-provided record ID for people enrichment (passed through from input)
  First_Name: string;
  Last_Name: string;
  Domain: string;
  Organization: string;
  Title: string;
  Email: string;
  LinkedIn: string;
  Phone_Number_1: string;
  Phone_Number_2: string;
  // New fields from updated people enrichment platform
  Provider?: string;
  People_Search_By?: string;
  Credits_Used?: number;
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
  // New people enrichment flat format fields
  unique_contacts_count?: number;
  companies_count?: number;
  contacts_with_email?: number;
  contacts_with_mobile_phone?: number;
  contacts_with_direct_phone?: number;
  contacts_with_any_phone?: number;
  contacts_with_linkedin?: number;
  cognism_contacts_count?: number;
  lusha_contacts_count?: number;
  aleads_contacts_count?: number;
  searched_by_cognism_count?: number;
  searched_by_apollo_count?: number;
  cognism_total_credits?: number;
  // Old nested credits format (kept for backward compat with company enrichment)
  credits?: {
    cognism?: number;
    lusha?: number;
    aleads?: number;
    apolloEmail?: number;
    apolloPhone?: number;
    theirstack?: number;
    total?: number;
  };
}

// Missing company structure for bulk search (companies not found)
interface MissingCompany {
  organization_name: string;
  domain: string | null;
}

interface RequestBody {
  search_id: string;
  companies?: Company[];
  missing_companies?: MissingCompany[]; // NEW: companies not found during bulk search
  credit_counter?: CreditCounter;
  // Legacy fields (for backward compatibility)
  apollo_credits?: number | string | null;
  aleads_credits?: number | string | null;
  lusha_credits?: number | string | null;
  enriched_contacts?: number | string | null;
  // Fields for people enrichment
  missing_contacts?: Contact[];
  missing_contacts_count?: number;
  // Error handling fields
  status?: 'error' | 'completed';
  error_message?: string;
  // Flag control for queue management
  flag_action?: 'release' | 'hold' | 'none';
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

// Helper function to upsert contacts to master_contacts table
async function upsertToMasterContacts(
  supabase: any,
  requestId: string,
  contacts: Contact[],
  searchId: string,
  userId: string
): Promise<void> {
  if (!contacts || contacts.length === 0) {
    console.log(`[${requestId}] No contacts to upsert to master_contacts`);
    return;
  }

  console.log(`[${requestId}] Upserting ${contacts.length} contacts to master_contacts`);

  for (const contact of contacts) {
    try {
      const personId = contact.person_id?.trim() || null;
      const email = contact.Email?.trim() || null;
      const linkedin = contact.LinkedIn?.trim() || null;
      const firstName = contact.First_Name?.trim() || null;
      const lastName = contact.Last_Name?.trim() || null;
      const organization = contact.Organization?.trim() || null;
      const domain = contact.Domain?.trim() || null;
      const phone1 = contact.Phone_Number_1?.trim() || null;
      const phone2 = contact.Phone_Number_2?.trim() || null;
      const title = contact.Title?.trim() || null;

      // Find existing record using multiple matching strategies
      let existingRecord = null;

      // Strategy 1: Match by person_id (most reliable)
      if (personId) {
        const { data } = await supabase
          .from('master_contacts')
          .select('*')
          .eq('person_id', personId)
          .maybeSingle();
        existingRecord = data;
      }

      // Strategy 2: Match by LinkedIn URL
      if (!existingRecord && linkedin) {
        const { data } = await supabase
          .from('master_contacts')
          .select('*')
          .eq('linkedin', linkedin)
          .maybeSingle();
        existingRecord = data;
      }

      // Strategy 3: Match by email
      if (!existingRecord && email) {
        const { data } = await supabase
          .from('master_contacts')
          .select('*')
          .eq('email', email)
          .maybeSingle();
        existingRecord = data;
      }

      // Strategy 4: Match by first_name + last_name + organization
      if (!existingRecord && firstName && lastName && organization) {
        const { data } = await supabase
          .from('master_contacts')
          .select('*')
          .eq('first_name', firstName)
          .eq('last_name', lastName)
          .eq('organization', organization)
          .maybeSingle();
        existingRecord = data;
      }

      if (existingRecord) {
        // Update existing record - merge data intelligently
        const updates: Record<string, any> = {
          last_updated_at: new Date().toISOString(),
        };

        // Update person_id if we have one now and didn't before
        if (personId && !existingRecord.person_id) {
          updates.person_id = personId;
        }

        // Handle email - add to email_2 if different
        if (email && email !== existingRecord.email && email !== existingRecord.email_2) {
          if (!existingRecord.email) {
            updates.email = email;
          } else if (!existingRecord.email_2) {
            updates.email_2 = email;
          }
        }

        // Handle phone - add to phone_2 if different
        if (phone1 && phone1 !== existingRecord.phone_1 && phone1 !== existingRecord.phone_2) {
          if (!existingRecord.phone_1) {
            updates.phone_1 = phone1;
          } else if (!existingRecord.phone_2) {
            updates.phone_2 = phone1;
          }
        }
        if (phone2 && phone2 !== existingRecord.phone_1 && phone2 !== existingRecord.phone_2) {
          if (!existingRecord.phone_2) {
            updates.phone_2 = phone2;
          }
        }

        // Update other fields if we have new data
        if (linkedin && !existingRecord.linkedin) updates.linkedin = linkedin;
        if (title && !existingRecord.title) updates.title = title;
        if (domain && !existingRecord.domain) updates.domain = domain;

        const { error } = await supabase
          .from('master_contacts')
          .update(updates)
          .eq('id', existingRecord.id);

        if (error) {
          console.error(`[${requestId}] Error updating master_contacts:`, error);
        }
      } else {
        // Insert new record
        const { error } = await supabase
          .from('master_contacts')
          .insert({
            person_id: personId,
            first_name: firstName,
            last_name: lastName,
            email: email,
            phone_1: phone1,
            phone_2: phone2,
            linkedin: linkedin,
            title: title,
            organization: organization,
            domain: domain,
            source_search_id: searchId,
            source_user_id: userId,
            first_seen_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
          });

        if (error) {
          console.error(`[${requestId}] Error inserting to master_contacts:`, error);
        }
      }
    } catch (err) {
      console.error(`[${requestId}] Error processing contact for master_contacts:`, err);
    }
  }

  console.log(`[${requestId}] Completed upserting to master_contacts`);
}

// Helper function to handle flag_action parameter
async function handleFlagAction(
  supabase: any,
  requestId: string,
  search_id: string,
  flagAction: string | undefined
): Promise<void> {
  console.log(`[${requestId}] Flag action requested: ${flagAction || 'none (default)'}`);

  if (flagAction === 'release') {
    try {
      console.log(`[${requestId}] Releasing processing flag for search ${search_id}`);
      
      const { data: nextItems, error: releaseError } = await supabase
        .rpc('release_processing_flag', { p_search_id: search_id }) as { data: any[] | null, error: any };

      if (releaseError) {
        console.error(`[${requestId}] Error releasing flag:`, releaseError);
      } else {
        console.log(`[${requestId}] Flag released. Next items in queue:`, nextItems?.length || 0);
        
        // If there's a queued item, trigger n8n webhook
        if (nextItems && nextItems.length > 0) {
          const nextItem = nextItems[0] as { next_entry_type: string; next_search_data: any; next_search_id: string };
          const n8nWebhookSecret = Deno.env.get('N8N_WEBHOOK_SECRET');
          
          const n8nWebhookUrl = nextItem.next_entry_type === 'bulk_people_enrichment'
            ? 'https://n8n.srv1081444.hstgr.cloud/webhook/bulk_enrich'
            : nextItem.next_entry_type === 'manual_entry'
              ? 'https://n8n.srv1081444.hstgr.cloud/webhook/enrichment_bulk_manual'
              : 'https://n8n.srv1081444.hstgr.cloud/webhook/incoming_request';

          const webhookHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'type_of_entry': nextItem.next_entry_type,
          };
          if (n8nWebhookSecret) {
            webhookHeaders['x-webhook-secret'] = n8nWebhookSecret;
          }

          const response = await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: webhookHeaders,
            body: JSON.stringify(nextItem.next_search_data),
          });

          if (!response.ok) {
            console.error(`[${requestId}] Failed to trigger next queued item`);
            await supabase.from('searches').update({
              status: 'error',
              error_message: 'Failed to process queued request',
              updated_at: new Date().toISOString()
            }).eq('id', nextItem.next_search_id);
            
            await supabase.rpc('release_processing_flag', { 
              p_search_id: nextItem.next_search_id 
            });
          } else {
            console.log(`[${requestId}] Next queued item triggered successfully`);
          }
        }
      }
    } catch (flagError) {
      console.error(`[${requestId}] Flag release error:`, flagError);
    }
  } else if (flagAction === 'hold') {
    console.log(`[${requestId}] Flag action is 'hold' - keeping flag locked`);
    // Do nothing - flag stays locked
  } else {
    console.log(`[${requestId}] Flag action is 'none' or not specified - not touching flag`);
    // Do nothing - let release-api-slot handle it
  }
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

    const bodyAny = body as unknown as Record<string, unknown>;

    // People enrichment: detected by presence of 'missing_contacts' key at top level.
    // Enriched contacts come in companies[].contacts[], missing contacts in missing_contacts[].
    const missingContactsData: Contact[] = Array.isArray(body?.missing_contacts) ? (body.missing_contacts as Contact[]) : [];
    const isPeopleEnrichmentPayload = 'missing_contacts' in bodyAny;

    // Extract credit_counter from new payload format
    const creditCounter = (bodyAny?.credit_counter && typeof bodyAny.credit_counter === 'object')
      ? (bodyAny.credit_counter as CreditCounter)
      : undefined;

    // Parse credits - prefer new credit_counter format, fall back to legacy fields
    let apolloCredits = 0;
    let aleadsCredits = 0;
    let lushaCredits = 0;
    let cognismCredits = 0;
    let theirstackCredits = 0;
    let enrichedContactsCount = 0;
    let contactsCount = 0;
    let apolloEmailCredits = 0;
    let apolloPhoneCredits = 0;
    let grandTotalCredits = 0;

    if (creditCounter) {
      if (creditCounter.credits) {
        // Nested format: credit_counter.credits.{ cognism, lusha, aleads, apolloEmail, apolloPhone, theirstack, total }
        const c = creditCounter.credits;
        apolloEmailCredits = toInt(c.apolloEmail);
        apolloPhoneCredits = toInt(c.apolloPhone);
        apolloCredits = apolloEmailCredits + apolloPhoneCredits;
        aleadsCredits = toInt(c.aleads);
        lushaCredits = toInt(c.lusha);
        cognismCredits = toInt(c.cognism);
        theirstackCredits = toInt(c.theirstack);
        grandTotalCredits = toInt(c.total);
        enrichedContactsCount = toInt(creditCounter.enriched_contacts_count);
        contactsCount = toInt(creditCounter.contacts_count);
        console.log(`[${requestId}] Using nested credit_counter.credits format`);
      } else if ('cognism_total_credits' in creditCounter) {
        // New people enrichment flat format: cognism_total_credits, lusha_total_credits, etc.
        cognismCredits = toInt(creditCounter.cognism_total_credits);
        lushaCredits = toInt(creditCounter.lusha_total_credits);
        aleadsCredits = toInt(creditCounter.aleads_total_credits);
        grandTotalCredits = toInt(creditCounter.grand_total_credits);
        enrichedContactsCount = toInt(creditCounter.enriched_contacts_count);
        contactsCount = toInt(creditCounter.contacts_count);
        // apollo credits not tracked separately in this format
        apolloCredits = 0;
        apolloEmailCredits = 0;
        apolloPhoneCredits = 0;
        console.log(`[${requestId}] Using new people enrichment flat credit_counter format`);
      } else {
        // Legacy flat format: apollo_total_credits, aleads_total_credits, etc.
        apolloCredits = toInt(creditCounter.apollo_total_credits);
        aleadsCredits = toInt(creditCounter.aleads_total_credits);
        lushaCredits = toInt(creditCounter.lusha_total_credits);
        enrichedContactsCount = toInt(creditCounter.enriched_contacts_count);
        contactsCount = toInt(creditCounter.contacts_count);
        apolloEmailCredits = toInt(creditCounter.apollo_email_credits);
        apolloPhoneCredits = toInt(creditCounter.apollo_phone_credits);
        grandTotalCredits = toInt(creditCounter.grand_total_credits);
        console.log(`[${requestId}] Using legacy flat credit_counter format`);
      }

      console.log(`[${requestId}] Using credit_counter format`);
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
    console.log(`[${requestId}] Missing contacts data count:`, missingContactsData.length);
    console.log(`[${requestId}] Body keys:`, Object.keys(bodyAny));
    console.log(`[${requestId}] Credits - Apollo: ${apolloCredits}, A-Leads: ${aleadsCredits}, Lusha: ${lushaCredits}, Cognism: ${cognismCredits}, Theirstack: ${theirstackCredits}`);
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

    // Check if this is a flag-release-only call (no result processing, just release the queue)
    if (bodyAny?.flag_action === 'release' && !companies.length && !isPeopleEnrichmentPayload && bodyAny?.status !== 'error') {
      console.log(`[${requestId}] Flag-only release for search ${search_id}`);
      await handleFlagAction(supabase, requestId, search_id, 'release');
      return new Response(
        JSON.stringify({ success: true, message: 'Flag released', request_id: requestId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this is an error payload from n8n
    const isErrorPayload = bodyAny?.status === 'error' || (bodyAny?.error_message && !companies.length && !isPeopleEnrichmentPayload);

    if (isErrorPayload) {
      const errorMessage = (bodyAny?.error_message as string) || 'Unknown error occurred';
      
      console.log(`[${requestId}] Received error payload for search_id: ${search_id}`);
      console.log(`[${requestId}] Error message: ${errorMessage}`);
      
      // Update the search status to 'error' with the error message and get user info
      const { data: searchData, error: updateError } = await supabase
        .from('searches')
        .update({ 
          status: 'error', 
          error_message: errorMessage,
          updated_at: new Date().toISOString() 
        })
        .eq('id', search_id)
        .select('user_id, search_type')
        .single();

      if (updateError) {
        console.error(`[${requestId}] Error updating search status:`, updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update search status', request_id: requestId }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[${requestId}] Successfully recorded error status for search_id: ${search_id}`);

      // Send error email notification
      if (searchData?.user_id) {
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', searchData.user_id)
            .single();
          
          if (profileData?.email) {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            
            await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                type: 'error',
                userEmail: profileData.email,
                searchType: searchData.search_type || 'enrichment',
                errorMessage: errorMessage,
              }),
            });
            console.log(`[${requestId}] Error email sent to: ${profileData.email}`);
          }
        } catch (emailError) {
          console.error(`[${requestId}] Failed to send error email:`, emailError);
          // Don't fail the request if email fails
        }
      }

      // ========== HANDLE FLAG ACTION (ERROR PATH) ==========
      await handleFlagAction(supabase, requestId, search_id, bodyAny?.flag_action as string | undefined);

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

    const hasAnyCredits = apolloCredits > 0 || aleadsCredits > 0 || lushaCredits > 0 || cognismCredits > 0 || grandTotalCredits > 0;

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

      // Flatten all enriched contacts from companies[] into a single array
      const enrichedContactsFlat: Contact[] = [];
      companies.forEach((company) => {
        if (Array.isArray(company.contacts)) {
          enrichedContactsFlat.push(...company.contacts);
        }
      });

      // Insert enriched contacts as one row (Results page expects a single 'enriched' row)
      if (enrichedContactsFlat.length > 0) {
        const { error: enrichedError } = await supabase
          .from('search_results')
          .insert({
            search_id,
            company_name: 'People Enriched',
            domain: null,
            contact_data: enrichedContactsFlat,
            result_type: 'enriched'
          });

        if (enrichedError) {
          console.error(`[${requestId}] Error inserting enriched contacts:`, enrichedError);
          throw enrichedError;
        }

        results.push({ company_name: 'People Enriched', contacts_count: enrichedContactsFlat.length });
        console.log(`[${requestId}] Inserted ${enrichedContactsFlat.length} enriched contacts`);
      }

      // Insert missing contacts as one row
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

      totalContacts = enrichedContactsFlat.length + missingContactsData.length;
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

      // Handle missing companies for bulk search (companies not found)
      const missingCompanies: MissingCompany[] = Array.isArray(bodyAny?.missing_companies) 
        ? (bodyAny.missing_companies as MissingCompany[])
        : [];

      if (missingCompanies.length > 0) {
        console.log(`[${requestId}] Processing ${missingCompanies.length} missing companies`);
        
        for (const mc of missingCompanies) {
          const { error: mcError } = await supabase
            .from('search_results')
            .insert({
              search_id,
              company_name: mc.organization_name || 'Unknown',
              domain: mc.domain || null,
              contact_data: [],
              result_type: 'missing_company'
            });

          if (mcError) {
            console.error(`[${requestId}] Error inserting missing company:`, mcError);
          }
        }
        
        console.log(`[${requestId}] Inserted ${missingCompanies.length} missing companies`);
      }
    }

    console.log(`[${requestId}] Successfully saved ${results.length} companies with ${totalContacts} total contacts`);

    // Get user data for sending email notification
    const { data: searchData, error: updateError } = await supabase
      .from('searches')
      .update({ 
        status: 'completed', 
        result_url: null,
        updated_at: new Date().toISOString() 
      })
      .eq('id', search_id)
      .select('user_id, search_type')
      .single();

    if (updateError) {
      console.error(`[${requestId}] Error updating search status:`, updateError);
    }

    // Upsert contacts to master_contacts for deduplication and central storage
    if (searchData?.user_id) {
      // Collect all contacts from the payload
      const allContacts: Contact[] = [];
      
      // For both people enrichment and company enrichment, enriched contacts live in companies[]
      companies.forEach((company) => {
        if (company.contacts && Array.isArray(company.contacts)) {
          allContacts.push(...company.contacts);
        }
      });

      // Upsert to master_contacts in background (don't await to avoid slowing response)
      upsertToMasterContacts(supabase, requestId, allContacts, search_id, searchData.user_id)
        .catch((err) => console.error(`[${requestId}] Master contacts upsert failed:`, err));
    }

    // Get user email for notification
    let userEmail: string | null = null;
    if (searchData?.user_id) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', searchData.user_id)
        .single();
      userEmail = profileData?.email || null;
    }

    // Send success email notification
    if (userEmail) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        
        await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            type: 'success',
            userEmail: userEmail,
            searchType: searchData?.search_type || 'enrichment',
          }),
        });
        console.log(`[${requestId}] Success email sent to: ${userEmail}`);
      } catch (emailError) {
        console.error(`[${requestId}] Failed to send success email:`, emailError);
        // Don't fail the request if email fails
      }
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
        .select('id, apollo_credits, aleads_credits, lusha_credits, cognism_credits, theirstack_credits, contacts_count, enriched_contacts_count, apollo_email_credits, apollo_phone_credits, grand_total_credits')
        .eq('user_id', searchData.user_id)
        .eq('search_id', search_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingError) {
        console.error(`[${requestId}] Error reading existing credit usage:`, existingError);
      }

      // Prefer new values when provided, but never decrease totals (handles webhook retries)
      const nextApollo = Math.max(existingCredit?.apollo_credits ?? 0, apolloCredits);
      const nextAleads = Math.max(existingCredit?.aleads_credits ?? 0, aleadsCredits);
      const nextLusha = Math.max(existingCredit?.lusha_credits ?? 0, lushaCredits);
      const nextCognism = Math.max(existingCredit?.cognism_credits ?? 0, cognismCredits);
      const nextTheirstack = Math.max(existingCredit?.theirstack_credits ?? 0, theirstackCredits);
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
            cognism_credits: nextCognism,
            theirstack_credits: nextTheirstack,
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
          console.log(`[${requestId}] Credit usage updated - Apollo: ${nextApollo}, A-Leads: ${nextAleads}, Lusha: ${nextLusha}, Cognism: ${nextCognism}, Theirstack: ${nextTheirstack}, Grand Total: ${nextGrandTotalCredits}`);
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
            cognism_credits: nextCognism,
            theirstack_credits: nextTheirstack,
            contacts_count: nextContactsCount,
            enriched_contacts_count: nextEnrichedContactsCount,
            apollo_email_credits: nextApolloEmailCredits,
            apollo_phone_credits: nextApolloPhoneCredits,
            grand_total_credits: nextGrandTotalCredits,
          });

        if (creditError) {
          console.error(`[${requestId}] Error saving credit usage:`, creditError);
        } else {
          console.log(`[${requestId}] Credit usage saved - Apollo: ${nextApollo}, A-Leads: ${nextAleads}, Lusha: ${nextLusha}, Cognism: ${nextCognism}, Theirstack: ${nextTheirstack}, Grand Total: ${nextGrandTotalCredits}`);
        }
      }
    } else {
      console.log(
        `[${requestId}] No credits to save or user_id not found. user_id: ${searchData?.user_id}, apollo: ${apolloCredits}, aleads: ${aleadsCredits}, lusha: ${lushaCredits}`,
      );
    }

    // ========== HANDLE FLAG ACTION (SUCCESS PATH) ==========
    await handleFlagAction(supabase, requestId, search_id, bodyAny?.flag_action as string | undefined);

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
