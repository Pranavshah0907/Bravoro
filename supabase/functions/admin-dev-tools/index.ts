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
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const respond = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return respond({ error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

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
      return respond({ error: 'Unauthorized' }, 401);
    }

    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (roleData?.role !== 'admin') return respond({ error: 'Forbidden' }, 403);

    const body = await req.json();
    const { action } = body;

    // ── GET QUEUE ──────────────────────────────────────────────────────────────
    if (action === 'get_queue') {
      // 1. Processing flag state
      const { data: slot } = await supabase
        .from('api_slots')
        .select('slot_name, is_locked, locked_by_search_id, locked_at')
        .eq('slot_name', 'processing')
        .single();

      let processing = null;
      if (slot?.is_locked && slot.locked_by_search_id) {
        const { data: search } = await supabase
          .from('searches')
          .select('id, search_type, user_id, created_at')
          .eq('id', slot.locked_by_search_id)
          .single();

        let userEmail = '';
        let fullName = '';
        if (search?.user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', search.user_id)
            .single();
          userEmail = profile?.email ?? '';
          fullName = profile?.full_name ?? '';
        }

        processing = {
          search_id: slot.locked_by_search_id,
          locked_at: slot.locked_at,
          search_type: search?.search_type ?? '',
          user_email: userEmail,
          full_name: fullName,
        };
      }

      // 2. Queued items (FIFO order)
      const { data: queueItems } = await supabase
        .from('request_queue')
        .select('id, search_id, entry_type, status, created_at, search_data')
        .eq('status', 'queued')
        .order('created_at', { ascending: true });

      const queued = (queueItems ?? []).map((item) => ({
        id: item.id,
        search_id: item.search_id,
        entry_type: item.entry_type,
        created_at: item.created_at,
        user_email: item.search_data?.user_email ?? '',
      }));

      return respond({ processing, queued });
    }

    // ── DELETE ITEM ────────────────────────────────────────────────────────────
    if (action === 'delete_item') {
      const { itemType, queueItemId, searchId } = body;

      if (itemType === 'queued') {
        if (queueItemId) {
          await supabase.from('request_queue').delete().eq('id', queueItemId);
        }
        await supabase.from('searches').update({
          status: 'cancelled',
          error_message: 'Cancelled by admin',
          updated_at: new Date().toISOString(),
        }).eq('id', searchId);

        return respond({ success: true });
      }

      if (itemType === 'processing') {
        // Mark current search cancelled
        await supabase.from('searches').update({
          status: 'cancelled',
          error_message: 'Cancelled by admin',
          updated_at: new Date().toISOString(),
        }).eq('id', searchId);

        // Release flag — atomically picks up next queued item
        const { data: nextItems, error: releaseError } = await supabase
          .rpc('release_processing_flag', { p_search_id: searchId });

        if (releaseError) {
          console.error('release_processing_flag error:', releaseError);
          throw releaseError;
        }

        let nextDispatched = false;

        if (nextItems && nextItems.length > 0) {
          const next = nextItems[0];
          const n8nUrl = WEBHOOK_URLS[next.next_entry_type] ?? WEBHOOK_URLS['bulk_upload'];
          const n8nWebhookSecret = Deno.env.get('N8N_WEBHOOK_SECRET');

          const webhookHeaders: Record<string, string> = {
            'Content-Type': 'application/json; charset=utf-8',
            'type_of_entry': next.next_entry_type,
          };
          if (n8nWebhookSecret) webhookHeaders['x-webhook-secret'] = n8nWebhookSecret;

          const r = await fetch(n8nUrl, {
            method: 'POST',
            headers: webhookHeaders,
            body: JSON.stringify(next.next_search_data),
          });

          if (r.ok) {
            nextDispatched = true;
            console.log(`Next queued item ${next.next_search_id} dispatched to n8n`);
          } else {
            console.error(`n8n dispatch failed for ${next.next_search_id}: ${r.status}`);
            // Release flag again so the queue isn't stuck
            await supabase.rpc('release_processing_flag', { p_search_id: next.next_search_id });
            await supabase.from('searches').update({
              status: 'error',
              error_message: 'Failed to dispatch after previous item was cancelled',
              updated_at: new Date().toISOString(),
            }).eq('id', next.next_search_id);
          }
        }

        return respond({ success: true, next_dispatched: nextDispatched });
      }

      return respond({ error: 'Unknown itemType' }, 400);
    }

    return respond({ error: `Unknown action: ${action}` }, 400);

  } catch (err) {
    console.error('admin-dev-tools error:', err);
    return respond({ error: String(err) }, 500);
  }
});