import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WEBHOOK_URLS: Record<string, string> = {
  manual_entry: 'https://n8n.srv1081444.hstgr.cloud/webhook/enrichment_bulk_manual',
  bulk_upload: 'https://n8n.srv1081444.hstgr.cloud/webhook/bulk_search',
  bulk_people_enrichment: 'https://n8n.srv1081444.hstgr.cloud/webhook/bulk_enrich',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    // Cryptographically verify the JWT against Supabase's JWKS endpoint.
    // This handles ES256 tokens correctly (the Supabase runtime verify_jwt only supports HS256).
    // jose.createRemoteJWKSet caches the JWKS after the first fetch — negligible overhead.
    let userId: string;
    try {
      const JWKS = jose.createRemoteJWKSet(
        new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
      );
      const { payload } = await jose.jwtVerify(token, JWKS, {
        issuer: `${supabaseUrl}/auth/v1`,
        audience: 'authenticated',
      });
      userId = payload.sub as string;
      if (!userId) throw new Error('no sub');
    } catch {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // userId cryptographically verified from JWT

    const body = await req.json();
    const { searchId, entryType, searchData } = body;

    if (!searchId || !searchData) {
      return new Response(
        JSON.stringify({ error: 'Missing searchId or searchData' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const n8nWebhookSecret = Deno.env.get('N8N_WEBHOOK_SECRET');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user profile and workspace credit balance
    let userEmail = '';
    let userName = '';
    let workspaceId: string | null = null;

    const { data: searchRecord } = await supabase
      .from('searches')
      .select('user_id')
      .eq('id', searchId)
      .maybeSingle();

    if (searchRecord?.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name, workspace_id')
        .eq('id', searchRecord.user_id)
        .maybeSingle();

      userEmail = profile?.email || '';
      userName = profile?.full_name || '';
      workspaceId = profile?.workspace_id || null;
    }

    // Credit gate — block if no workspace or credits exhausted
    if (!workspaceId) {
      await supabase.from('searches').update({
        status: 'error',
        error_message: 'No workspace assigned',
        updated_at: new Date().toISOString(),
      }).eq('id', searchId);

      return new Response(
        JSON.stringify({ success: false, error: 'NO_WORKSPACE', message: 'No workspace assigned to your account' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: creditData, error: creditError } = await supabase
      .rpc('get_workspace_credit_balance', { p_user_id: searchRecord!.user_id });

    if (creditError || !creditData?.success) {
      console.error('Credit balance check failed:', creditError || creditData);
      await supabase.from('searches').update({
        status: 'error',
        error_message: 'Could not verify credit balance',
        updated_at: new Date().toISOString(),
      }).eq('id', searchId);

      return new Response(
        JSON.stringify({ success: false, error: 'CREDIT_CHECK_FAILED', message: 'Could not verify credit balance' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (creditData.is_exhausted) {
      await supabase.from('searches').update({
        status: 'error',
        error_message: 'Insufficient credits',
        updated_at: new Date().toISOString(),
      }).eq('id', searchId);

      return new Response(
        JSON.stringify({ success: false, error: 'INSUFFICIENT_CREDITS', message: 'Workspace credits exhausted' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build n8n payload
    const payload = {
      ...searchData,
      search_id: searchId,
      user_id: userId,
      user_email: userEmail,
      user_name: userName,
      workspace_id: workspaceId,
    };

    // Try to acquire the processing flag
    const { data: flagAcquired } = await supabase
      .rpc('acquire_processing_flag', { p_search_id: searchId });

    if (!flagAcquired) {
      // Flag is busy — add to queue
      await supabase.from('request_queue').insert({
        search_id: searchId,
        entry_type: entryType || 'manual_entry',
        search_data: payload,
        status: 'queued',
      });

      await supabase.from('searches').update({
        status: 'queued',
        updated_at: new Date().toISOString(),
      }).eq('id', searchId);

      console.log(`Queued search ${searchId} — flag was busy`);
      return new Response(
        JSON.stringify({ success: true, queued: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Flag acquired — mark as processing and send to n8n
    await supabase.from('searches').update({
      status: 'processing',
      updated_at: new Date().toISOString(),
    }).eq('id', searchId);

    const n8nUrl = WEBHOOK_URLS[entryType] || WEBHOOK_URLS['bulk_upload'];
    const webhookHeaders: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'type_of_entry': entryType || 'manual_entry',
    };
    if (n8nWebhookSecret) {
      webhookHeaders['x-webhook-secret'] = n8nWebhookSecret;
    }

    const response = await fetch(n8nUrl, {
      method: 'POST',
      headers: webhookHeaders,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`n8n webhook failed: ${response.status} ${text}`);

      // Release flag on failure so next queued item can proceed
      await supabase.rpc('release_processing_flag', { p_search_id: searchId });
      await supabase.from('searches').update({
        status: 'error',
        error_message: 'Processing failed',
        updated_at: new Date().toISOString(),
      }).eq('id', searchId);

      // Return 200 so client doesn't show a hard error — DB status reflects the failure
      return new Response(
        JSON.stringify({ success: false, error: `n8n webhook failed: ${response.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('trigger-n8n-webhook error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
