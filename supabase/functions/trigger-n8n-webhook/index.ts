import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Webhook URLs per entry type
const WEBHOOK_URLS: Record<string, string> = {
  manual_entry: 'https://n8n.srv1081444.hstgr.cloud/webhook/enrichment_bulk_manual',
  bulk_upload: 'https://n8n.srv1081444.hstgr.cloud/webhook/incoming_request',
  bulk_people_enrichment: 'https://n8n.srv1081444.hstgr.cloud/webhook/bulk_enrich',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { searchId, entryType, searchData } = body;

    if (!searchId || !searchData) {
      return new Response(
        JSON.stringify({ error: 'Missing searchId or searchData' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const n8nWebhookSecret = Deno.env.get('N8N_WEBHOOK_SECRET');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user email and enrichment limits
    let userEmail = '';
    let enrichmentRemaining = 0;
    let enrichmentLimit = 0;

    const { data: searchRecord } = await supabase
      .from('searches')
      .select('user_id')
      .eq('id', searchId)
      .maybeSingle();

    if (searchRecord?.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, enrichment_limit, enrichment_used')
        .eq('id', searchRecord.user_id)
        .maybeSingle();

      userEmail = profile?.email || '';
      enrichmentLimit = profile?.enrichment_limit ?? 0;
      enrichmentRemaining = Math.max(0, enrichmentLimit - (profile?.enrichment_used ?? 0));
    }

    // Mark search as processing
    await supabase
      .from('searches')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', searchId);

    // Build payload
    const payload = {
      ...searchData,
      search_id: searchId,
      user_email: userEmail,
      enrichment_remaining: enrichmentRemaining,
      enrichment_limit: enrichmentLimit,
    };

    // Select webhook URL
    const n8nUrl = WEBHOOK_URLS[entryType] || WEBHOOK_URLS['bulk_upload'];

    // Build headers
    const webhookHeaders: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'type_of_entry': entryType || 'manual_entry',
    };
    if (n8nWebhookSecret) {
      webhookHeaders['x-webhook-secret'] = n8nWebhookSecret;
    }

    // Call n8n
    const response = await fetch(n8nUrl, {
      method: 'POST',
      headers: webhookHeaders,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`n8n webhook failed: ${response.status} ${text}`);

      await supabase
        .from('searches')
        .update({ status: 'error', error_message: 'Processing failed', updated_at: new Date().toISOString() })
        .eq('id', searchId);

      return new Response(
        JSON.stringify({ error: `n8n webhook failed: ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('trigger-n8n-webhook error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
