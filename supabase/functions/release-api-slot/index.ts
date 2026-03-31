import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

// Simplified schema - only needs search_id now
const releaseSchema = z.object({
  search_id: z.string().uuid("search_id must be a valid UUID"),
});

function generateRequestId(): string {
  return crypto.randomUUID();
}

serve(async (req) => {
  const requestId = generateRequestId();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate webhook secret
    const webhookSecret = Deno.env.get('N8N_WEBHOOK_SECRET');
    const providedSecret = req.headers.get('x-webhook-secret');
    
    if (webhookSecret && providedSecret !== webhookSecret) {
      console.error(`[${requestId}] Invalid webhook secret`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    console.log(`[${requestId}] Received release request:`, JSON.stringify(body));
    
    const validationResult = releaseSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error(`[${requestId}] Validation error:`, validationResult.error.issues);
      return new Response(
        JSON.stringify({ error: 'Invalid request data', details: validationResult.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { search_id } = validationResult.data;
    console.log(`[${requestId}] Releasing processing flag for search ${search_id}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Call the release function which also checks for queued items
    const { data: nextItems, error: releaseError } = await supabase
      .rpc('release_processing_flag', { p_search_id: search_id });

    if (releaseError) {
      console.error(`[${requestId}] Release error:`, releaseError);
      throw releaseError;
    }

    console.log(`[${requestId}] Processing flag released. Next items:`, nextItems?.length || 0);

    // If there's a queued item to process, send it to n8n
    if (nextItems && nextItems.length > 0) {
      const nextItem = nextItems[0];
      console.log(`[${requestId}] Processing next queued item:`, nextItem.next_search_id);

      const n8nWebhookSecret = Deno.env.get('N8N_WEBHOOK_SECRET');
      
      // Determine webhook URL based on entry type
      const WEBHOOK_URLS: Record<string, string> = {
        manual_entry: 'https://n8n.srv1081444.hstgr.cloud/webhook/enrichment_bulk_manual',
        bulk_upload: 'https://n8n.srv1081444.hstgr.cloud/webhook/bulk_search',
        bulk_people_enrichment: 'https://n8n.srv1081444.hstgr.cloud/webhook/bulk_enrich',
      };
      const n8nWebhookUrl = WEBHOOK_URLS[nextItem.next_entry_type] || WEBHOOK_URLS['bulk_upload'];

      // Build headers
      const webhookHeaders: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'type_of_entry': nextItem.next_entry_type,
      };

      if (n8nWebhookSecret) {
        webhookHeaders['x-webhook-secret'] = n8nWebhookSecret;
      }

      // Send to n8n (payload is already complete in search_data)
      const response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: webhookHeaders,
        body: JSON.stringify(nextItem.next_search_data),
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => '');
        console.error(`[${requestId}] N8N webhook failed for queued item:`, {
          status: response.status,
          statusText: response.statusText,
          body: responseText
        });
        
        // Update search status to error
        await supabase
          .from('searches')
          .update({
            status: 'error',
            error_message: 'Failed to process queued request',
            updated_at: new Date().toISOString()
          })
          .eq('id', nextItem.next_search_id);
        
        // Release the flag since we failed
        await supabase.rpc('release_processing_flag', { p_search_id: nextItem.next_search_id });
      } else {
        console.log(`[${requestId}] Queued item sent to n8n successfully`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        request_id: requestId,
        queued_item_processed: nextItems && nextItems.length > 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[${requestId}] Error releasing processing flag:`, error);
    
    return new Response(
      JSON.stringify({ error: 'Failed to release processing flag', request_id: requestId }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
