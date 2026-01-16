import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Schema for manual entry
const manualEntrySchema = z.object({
  searchId: z.string().uuid({ message: "Invalid searchId: must be a valid UUID" }),
  searchData: z.object({
    company_name: z.string().optional(),
    domain: z.string().optional(),
    functions: z.array(z.string()).optional(),
    geography: z.string().optional(),
    seniority: z.array(z.string()).optional(),
    results_per_function: z.number().int().positive().optional(),
  }),
  entryType: z.literal('manual_entry').optional(),
  apollo_credits: z.number().int().min(0).max(1000000).optional().default(0),
  cleon1_credits: z.number().int().min(0).max(1000000).optional().default(0),
  lusha_credits: z.number().int().min(0).max(1000000).optional().default(0),
});

// Schema for bulk upload - accepts any data structure from Excel
const bulkUploadSchema = z.object({
  searchId: z.string().uuid({ message: "Invalid searchId: must be a valid UUID" }),
  searchData: z.object({
    search_id: z.string().uuid().optional(),
    data: z.record(z.array(z.record(z.unknown()))).optional(), // Excel sheets as object with arrays of records
  }).passthrough(), // Allow additional fields
  entryType: z.literal('bulk_upload'),
  apollo_credits: z.number().int().min(0).max(1000000).optional().default(0),
  cleon1_credits: z.number().int().min(0).max(1000000).optional().default(0),
  lusha_credits: z.number().int().min(0).max(1000000).optional().default(0),
});

// Schema for bulk people enrichment - similar to bulk upload
const bulkPeopleEnrichmentSchema = z.object({
  searchId: z.string().uuid({ message: "Invalid searchId: must be a valid UUID" }),
  searchData: z.object({
    search_id: z.string().uuid().optional(),
    data: z.record(z.array(z.record(z.unknown()))).optional(), // Excel sheets as object with arrays of records
  }).passthrough(), // Allow additional fields
  entryType: z.literal('bulk_people_enrichment'),
  apollo_credits: z.number().int().min(0).max(1000000).optional().default(0),
  cleon1_credits: z.number().int().min(0).max(1000000).optional().default(0),
  lusha_credits: z.number().int().min(0).max(1000000).optional().default(0),
});

// Combined schema that accepts any format
const requestSchema = z.union([bulkUploadSchema, bulkPeopleEnrichmentSchema, manualEntrySchema]);

// Generate a unique request ID for tracking
function generateRequestId(): string {
  return crypto.randomUUID();
}

serve(async (req) => {
  const requestId = generateRequestId();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log(`[${requestId}] Received request body:`, JSON.stringify(body));
    
    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error(`[${requestId}] Validation error:`, validationResult.error.issues);
      return new Response(
        JSON.stringify({ error: 'Invalid request data', request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { searchData, searchId, entryType, apollo_credits, cleon1_credits, lusha_credits } = validationResult.data;
    console.log(`[${requestId}] Entry type:`, entryType);
    console.log(`[${requestId}] Search data keys:`, Object.keys(searchData));

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const n8nWebhookSecret = Deno.env.get('N8N_WEBHOOK_SECRET');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user_id and email from the search record
    const { data: searchRecord, error: searchError } = await supabase
      .from('searches')
      .select('user_id')
      .eq('id', searchId)
      .maybeSingle();

    if (searchError) {
      console.error(`[${requestId}] Search record error:`, searchError);
    }
    console.log(`[${requestId}] Search record found:`, !!searchRecord);

    let userEmail = '';
    let enrichmentRemaining = 0;
    let enrichmentLimit = 0;

    if (searchRecord?.user_id) {
      // Get user profile including enrichment data
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('email, enrichment_limit, enrichment_used')
        .eq('id', searchRecord.user_id)
        .maybeSingle();
      
      if (profileError) {
        console.error(`[${requestId}] Profile error:`, profileError);
      }
      userEmail = profileData?.email || '';
      enrichmentLimit = profileData?.enrichment_limit ?? 0;
      const enrichmentUsed = profileData?.enrichment_used ?? 0;
      enrichmentRemaining = Math.max(0, enrichmentLimit - enrichmentUsed);
      
      console.log(`[${requestId}] Enrichment data - limit: ${enrichmentLimit}, used: ${enrichmentUsed}, remaining: ${enrichmentRemaining}`);
    }

    console.log(`[${requestId}] User email retrieved:`, !!userEmail);

    // Select webhook URL based on entry type
    // NOTE: n8n expects an `authorization` header (no Bearer prefix) for these webhooks.
    const n8nWebhookUrl = entryType === 'bulk_people_enrichment'
      ? 'https://n8n.srv1081444.hstgr.cloud/webhook/bulk_enrich'
      : 'https://n8n.srv1081444.hstgr.cloud/webhook/incoming_request';

    console.log(`[${requestId}] Using webhook URL for entry type:`, entryType);

    // Build payload based on entry type
    let payloadToSend: Record<string, unknown>;

    if (entryType === 'bulk_upload' || entryType === 'bulk_people_enrichment') {
      // For bulk upload and people enrichment, include the Excel data
      payloadToSend = {
        search_id: searchId,
        user_email: userEmail,
        data: (searchData as { data?: unknown }).data, // The parsed Excel content
        enrichment_remaining: enrichmentRemaining,
        enrichment_limit: enrichmentLimit,
      };
    } else {
      // For manual entry, spread the search data fields
      payloadToSend = {
        ...searchData,
        search_id: searchId,
        user_email: userEmail,
        enrichment_remaining: enrichmentRemaining,
        enrichment_limit: enrichmentLimit,
      };
    }

    console.log(`[${requestId}] Sending payload to n8n webhook with enrichment_remaining: ${enrichmentRemaining}, enrichment_limit: ${enrichmentLimit}`);

    // Build headers with webhook secret authentication
    const webhookHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'type_of_entry': entryType || 'manual_entry',
    };

    // Add webhook secret if configured
    if (n8nWebhookSecret) {
      webhookHeaders['x-webhook-secret'] = n8nWebhookSecret;
    }

    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: webhookHeaders,
      body: JSON.stringify(payloadToSend),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      console.error(
        `[${requestId}] N8N webhook failed`,
        JSON.stringify({ status: response.status, statusText: response.statusText, body: responseText })
      );
      throw new Error(`N8N webhook failed: ${response.status}`);
    }

    const result = await response.json();
    console.log(`[${requestId}] N8N webhook response received`);

    // Store credit usage if credits are provided
    if ((apollo_credits > 0 || cleon1_credits > 0 || lusha_credits > 0) && searchRecord?.user_id) {
      const { error: creditError } = await supabase
        .from('credit_usage')
        .insert({
          user_id: searchRecord.user_id,
          search_id: searchId,
          apollo_credits,
          cleon1_credits,
          lusha_credits,
        });
      
      if (creditError) {
        console.error(`[${requestId}] Credit tracking error:`, creditError);
      }
    }

    // Update the search record based on n8n response
    if (result.status === 'error') {
      console.log(`[${requestId}] N8N reported error status`);
      await supabase
        .from('searches')
        .update({
          status: 'error',
          error_message: 'Processing failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', searchId);
    } else if (result.status === 'completed' || result.status === 'success') {
      // Construct download URL from file_id
      const downloadUrl = `https://n8n.srv1081444.hstgr.cloud/webhook/download?fileId=${result.file_id}`;
      
      await supabase
        .from('searches')
        .update({
          status: 'completed',
          result_url: downloadUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', searchId);

      // Store credit usage from n8n response if provided
      if ((result.apollo_credits > 0 || result.cleon1_credits > 0 || result.lusha_credits > 0) && searchRecord?.user_id) {
        const { error: creditError } = await supabase
          .from('credit_usage')
          .insert({
            user_id: searchRecord.user_id,
            search_id: searchId,
            apollo_credits: result.apollo_credits || 0,
            cleon1_credits: result.cleon1_credits || 0,
            lusha_credits: result.lusha_credits || 0,
          });
        
        if (creditError) {
          console.error(`[${requestId}] Credit tracking error from n8n response:`, creditError);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, request_id: requestId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[${requestId}] Error triggering N8N webhook:`, error);
    
    // Try to update search status to error if we have searchId
    try {
      const body = await req.clone().json();
      const { searchId } = body;
      if (searchId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from('searches')
          .update({
            status: 'error',
            error_message: 'Processing failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', searchId);
      }
    } catch (updateError) {
      console.error(`[${requestId}] Error updating search status:`, updateError);
    }
    
    return new Response(
      JSON.stringify({ error: 'Request processing failed', request_id: requestId }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
