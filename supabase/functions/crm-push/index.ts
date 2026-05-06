import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';
import { getAdapter } from '../_shared/adapters/registry.ts';
import { normalizeEmail, extractDomain, normalizePhone } from '../_shared/normalize.ts';

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

const MAX_LEADS_PER_REQUEST = 100;

interface InputLead {
  record_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  domain?: string | null;
  organization?: string | null;
  title?: string | null;
  phone_1?: string | null;
  phone_2?: string | null;
  linkedin?: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const userJwt = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    let userId: string;
    try {
      const JWKS = jose.createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
      const { payload } = await jose.jwtVerify(userJwt, JWKS, {
        issuer: `${supabaseUrl}/auth/v1`,
        audience: 'authenticated',
      });
      userId = payload.sub as string;
      if (!userId) throw new Error('no sub');
    } catch {
      return json({ error: 'unauthorized' }, 401);
    }

    let body: any;
    try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    const {
      destination_id,
      owner_external_id,
      search_id,
      search_name,
      leads,
    }: {
      destination_id: string;
      owner_external_id: string | null;
      search_id: string | null;
      search_name: string | null;
      leads: InputLead[];
    } = body;

    if (!destination_id) return json({ error: 'missing_destination_id' }, 400);
    if (!Array.isArray(leads) || leads.length === 0) return json({ error: 'missing_leads' }, 400);
    if (leads.length > MAX_LEADS_PER_REQUEST) {
      return json({ error: 'too_many_leads', max: MAX_LEADS_PER_REQUEST }, 400);
    }

    const m = destination_id.match(/^pipeline:(\w+)\|stage:(\w+)$/);
    if (!m) return json({ error: 'bad_destination_id' }, 400);
    const [, pipelineId, stageId] = m;

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: profile } = await supabase
      .from('profiles').select('workspace_id').eq('id', userId).maybeSingle();
    if (!profile?.workspace_id) return json({ error: 'no_workspace' }, 400);

    const { data: integ } = await supabase
      .from('integrations')
      .select('id, crm_type, status, account_identifier')
      .eq('workspace_id', profile.workspace_id)
      .maybeSingle();
    if (!integ) return json({ error: 'no_connected_integration' }, 404);
    if (integ.status !== 'connected') return json({ error: 'integration_error' }, 409);

    const { data: token } = await supabase.rpc('decrypt_integration_token', { p_integration_id: integ.id });
    if (!token) return json({ error: 'token_missing' }, 500);

    const adapter = getAdapter(integ.crm_type);
    const titlePrefix = Deno.env.get('CRM_PUSH_TITLE_PREFIX') ?? '';
    const destinationLabel = await resolveDestinationLabel(adapter, token, destination_id);

    const results: any[] = [];
    let succeeded = 0, failed = 0, idempotent = 0;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      try {
        const { data: existing } = await supabase
          .from('crm_pushes')
          .select('id, status, external_deal_id')
          .eq('integration_id', integ.id)
          .eq('bravoro_record_id', lead.record_id)
          .eq('destination_id', destination_id)
          .maybeSingle();

        if (existing && existing.status === 'success') {
          results.push({
            lead_index: i, record_id: lead.record_id,
            status: 'skipped_idempotent',
            external_deal_id: existing.external_deal_id,
            destination_label: destinationLabel,
          });
          idempotent++;
          continue;
        }

        const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim()
                  || (lead.email ? lead.email.split('@')[0] : 'Unnamed Contact');
        const email = normalizeEmail(lead.email ?? null);
        const domain = lead.domain
          ? lead.domain.trim().toLowerCase()
          : (email ? extractDomain(email) : null);
        const phone = normalizePhone(lead.phone_1 ?? null) ?? normalizePhone(lead.phone_2 ?? null);

        // 1. Org
        let orgId: string | null = null;
        if (domain || lead.organization) {
          try {
            const o = await adapter.findOrCreateOrganization(token, {
              name: lead.organization ?? null,
              domain: domain ?? null,
            });
            orgId = o.externalId;
          } catch (err) {
            console.warn('org find/create failed (non-fatal):', (err as Error).message);
          }
        }

        // 2. Person — first check the Plan A mirror (fast)
        let personId: string;
        if (email) {
          const { data: mirrorHit } = await supabase
            .from('crm_contacts')
            .select('external_id')
            .eq('integration_id', integ.id)
            .eq('email_normalized', email)
            .limit(1)
            .maybeSingle();
          if (mirrorHit) {
            personId = mirrorHit.external_id;
          } else {
            const p = await adapter.findOrCreatePerson(token, {
              name,
              email,
              phone,
              linkedIn: lead.linkedin ?? null,
              jobTitle: lead.title ?? null,
              organizationExternalId: orgId,
            });
            personId = p.externalId;
            // Update mirror so next dedup-check sees this Person without waiting for cron
            if (p.created) {
              await supabase.from('crm_contacts').upsert({
                integration_id: integ.id,
                external_id: personId,
                name,
                email_normalized: email,
                emails_all: [email],
                domain,
                phone_normalized: phone,
                raw: p.raw ?? { id: personId },
                last_synced_at: new Date().toISOString(),
              }, { onConflict: 'integration_id,external_id' });
            }
          }
        } else {
          const p = await adapter.findOrCreatePerson(token, {
            name,
            email: null,
            phone,
            linkedIn: lead.linkedin ?? null,
            jobTitle: lead.title ?? null,
            organizationExternalId: orgId,
          });
          personId = p.externalId;
        }

        // 3. Deal
        const title = `${titlePrefix}${name}${domain ? ` — ${domain}` : ''}`;
        const deal = await adapter.createDeal(token, {
          title,
          pipelineId,
          stageId,
          ownerExternalId: owner_external_id ?? null,
          personExternalId: personId,
          organizationExternalId: orgId,
          sourceLabel: 'Bravoro',
          sourceId: lead.record_id ?? null,
          channelLabel: search_name ?? null,
        });

        // Bookkeeping
        await supabase.from('crm_pushes').upsert({
          integration_id: integ.id,
          workspace_id: profile.workspace_id,
          search_id: search_id ?? null,
          bravoro_record_id: lead.record_id,
          bravoro_email: email,
          destination_id,
          destination_label: destinationLabel,
          external_deal_id: deal.externalId,
          external_person_id: personId,
          external_org_id: orgId,
          status: 'success',
          error_message: null,
          pushed_by_user_id: userId,
          pushed_at: new Date().toISOString(),
        }, { onConflict: 'integration_id,bravoro_record_id,destination_id' });

        results.push({
          lead_index: i, record_id: lead.record_id,
          status: 'success',
          external_deal_id: deal.externalId,
          destination_label: destinationLabel,
        });
        succeeded++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase.from('crm_pushes').upsert({
          integration_id: integ.id,
          workspace_id: profile.workspace_id,
          search_id: search_id ?? null,
          bravoro_record_id: lead.record_id,
          bravoro_email: normalizeEmail(lead.email ?? null),
          destination_id,
          destination_label: destinationLabel,
          status: 'failed',
          error_message: msg.slice(0, 500),
          pushed_by_user_id: userId,
          pushed_at: new Date().toISOString(),
        }, { onConflict: 'integration_id,bravoro_record_id,destination_id' });
        results.push({
          lead_index: i, record_id: lead.record_id,
          status: 'failed',
          error_message: msg.slice(0, 500),
        });
        failed++;
      }
    }

    return json({
      ok: true,
      results,
      stats: { succeeded, failed, skipped_idempotent: idempotent },
    });
  } catch (err) {
    console.error('crm-push crash', (err as Error).message);
    return json({ error: 'crash' }, 500);
  }
});

async function resolveDestinationLabel(adapter: any, token: string, destinationId: string): Promise<string> {
  try {
    const dests = await adapter.listDestinations(token);
    const found = dests.find((d: any) => d.id === destinationId);
    return found?.label ?? destinationId;
  } catch {
    return destinationId;
  }
}
