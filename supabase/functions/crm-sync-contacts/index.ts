import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getAdapter } from '../_shared/adapters/registry.ts';
import { extractDomain } from '../_shared/normalize.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const SAFETY_OVERLAP_MS = 5 * 60 * 1000; // re-fetch 5 min behind on every delta
const UPSERT_BATCH = 200;
const PAGE_SIZE = 1000;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const expectedSecret = Deno.env.get('CRM_DEDUP_SECRET');
    if (!expectedSecret) {
      return json({ error: 'secret_not_configured' }, 500);
    }

    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${expectedSecret}`) {
      return json({ error: 'unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Optional: target a single integration via { integration_id } in body.
    // Used by the post-connect immediate-backfill kick-off in crm-test-connection.
    let targetIntegrationId: string | null = null;
    try {
      const body = await req.json().catch(() => null);
      if (body && typeof body.integration_id === 'string') {
        targetIntegrationId = body.integration_id;
      }
    } catch { /* no body / not JSON: process all */ }

    const integrations: Array<any> = [];
    let page = 0;
    while (true) {
      let q = supabase
        .from('integrations')
        .select('id, workspace_id, crm_type, contacts_last_synced_at, contacts_initial_synced')
        .eq('status', 'connected')
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (targetIntegrationId) q = q.eq('id', targetIntegrationId);
      const { data, error } = await q;
      if (error) {
        console.error('integrations query failed', error.message);
        return json({ error: 'db_error', message: error.message }, 500);
      }
      if (!data || data.length === 0) break;
      integrations.push(...data);
      if (data.length < PAGE_SIZE) break;
      page += 1;
    }

    const totals = { synced: 0, errored: 0, contactsUpserted: 0 };

    for (const integ of integrations) {
      try {
        const upserted = await syncOne(supabase, integ);
        totals.synced += 1;
        totals.contactsUpserted += upserted;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`sync failed for integration ${integ.id}: ${msg}`);
        totals.errored += 1;
        await supabase.from('integrations').update({
          contacts_sync_error: msg.slice(0, 500),
        }).eq('id', integ.id);
      }
    }

    return json({ ok: true, syncedIntegrations: integrations.length, totals });
  } catch (err) {
    console.error('crm-sync-contacts crash', err);
    return json({ error: 'crash' }, 500);
  }
});

async function syncOne(supabase: any, integ: any): Promise<number> {
  const adapter = getAdapter(integ.crm_type);
  if (typeof adapter.fetchContacts !== 'function') {
    throw new Error(`adapter does not support fetchContacts: ${integ.crm_type}`);
  }

  const { data: token, error: tokErr } = await supabase.rpc('decrypt_integration_token', {
    p_integration_id: integ.id,
  });
  if (tokErr || !token) throw new Error('token_missing');

  const sinceISO = (!integ.contacts_initial_synced || !integ.contacts_last_synced_at)
    ? undefined
    : new Date(new Date(integ.contacts_last_synced_at).getTime() - SAFETY_OVERLAP_MS).toISOString();

  let buffer: any[] = [];
  let upserted = 0;
  for await (const c of adapter.fetchContacts(token, { sinceISO })) {
    buffer.push({
      integration_id: integ.id,
      external_id: c.externalId,
      name: c.name,
      email_normalized: c.primaryEmail,
      emails_all: c.emails,
      domain: c.primaryEmail ? extractDomain(c.primaryEmail) : null,
      phone_normalized: c.phones[0] ?? null,
      raw: c.raw,
      last_synced_at: new Date().toISOString(),
    });
    if (buffer.length >= UPSERT_BATCH) {
      await flush(supabase, buffer);
      upserted += buffer.length;
      buffer = [];
    }
  }
  if (buffer.length > 0) {
    await flush(supabase, buffer);
    upserted += buffer.length;
  }

  await supabase.from('integrations').update({
    contacts_last_synced_at: new Date().toISOString(),
    contacts_initial_synced: true,
    contacts_sync_error: null,
  }).eq('id', integ.id);

  return upserted;
}

async function flush(supabase: any, batch: any[]) {
  const { error } = await supabase
    .from('crm_contacts')
    .upsert(batch, { onConflict: 'integration_id,external_id' });
  if (error) throw new Error(`upsert_failed: ${error.message}`);
}
