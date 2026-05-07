import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { normalizeEmail, extractDomain } from '../_shared/normalize.ts';

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

const NAME_SIMILARITY_THRESHOLD = 0.6;

interface InputLead {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  domain?: string | null;
}

interface OutputResult {
  lead_index: number;
  verdict: 'unique' | 'duplicate';
  matched_external_id?: string;
  matched_via?: 'email_exact' | 'email_in_emails_all' | 'name_domain_fuzzy';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const expectedSecret = Deno.env.get('CRM_DEDUP_SECRET');
    if (!expectedSecret) return json({ error: 'secret_not_configured' }, 500);

    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${expectedSecret}`) return json({ error: 'unauthorized' }, 401);

    let body: { workspace_id?: string; leads?: InputLead[] };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }
    const { workspace_id, leads } = body;
    if (!workspace_id) return json({ error: 'missing_workspace_id' }, 400);
    if (!Array.isArray(leads)) return json({ error: 'missing_leads' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: integ, error: integErr } = await supabase
      .from('integrations')
      .select('id, status, contacts_initial_synced')
      .eq('workspace_id', workspace_id)
      .maybeSingle();

    if (integErr) return json({ error: 'db_error', message: integErr.message }, 500);

    const allUnique = (reason?: string) => json({
      ok: true,
      results: leads.map((_, i) => ({ lead_index: i, verdict: 'unique' as const })),
      stats: {
        checked: leads.length, duplicates: 0, unique: leads.length,
        ...(reason ? { skipped_reason: reason } : {}),
      },
    });

    if (!integ) return allUnique('no_integration');
    if (integ.status === 'error') return allUnique('integration_error');
    if (!integ.contacts_initial_synced) return allUnique('backfill_in_progress');

    const results: OutputResult[] = [];
    let dupes = 0;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const email = normalizeEmail(lead.email ?? null);
      const domain = lead.domain
        ? lead.domain.trim().toLowerCase()
        : (email ? extractDomain(email) : null);
      const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() || null;

      let match: OutputResult | null = null;

      // Layer 1: exact primary email
      if (email && !match) {
        const { data } = await supabase
          .from('crm_contacts')
          .select('external_id')
          .eq('integration_id', integ.id)
          .eq('email_normalized', email)
          .limit(1)
          .maybeSingle();
        if (data) {
          match = {
            lead_index: i,
            verdict: 'duplicate',
            matched_external_id: data.external_id,
            matched_via: 'email_exact',
          };
        }
      }

      // Layer 2: email in emails_all array
      if (email && !match) {
        const { data } = await supabase
          .from('crm_contacts')
          .select('external_id')
          .eq('integration_id', integ.id)
          .contains('emails_all', [email])
          .limit(1)
          .maybeSingle();
        if (data) {
          match = {
            lead_index: i,
            verdict: 'duplicate',
            matched_external_id: data.external_id,
            matched_via: 'email_in_emails_all',
          };
        }
      }

      // Layer 3: fuzzy name + same domain
      if (domain && name && !match) {
        const { data } = await supabase.rpc('crm_contact_fuzzy_name_match', {
          p_integration_id: integ.id,
          p_domain: domain,
          p_name: name,
          p_threshold: NAME_SIMILARITY_THRESHOLD,
        });
        if (data && Array.isArray(data) && data.length > 0) {
          match = {
            lead_index: i,
            verdict: 'duplicate',
            matched_external_id: data[0].external_id,
            matched_via: 'name_domain_fuzzy',
          };
        }
      }

      if (match) { results.push(match); dupes++; }
      else { results.push({ lead_index: i, verdict: 'unique' }); }
    }

    return json({
      ok: true,
      results,
      stats: { checked: leads.length, duplicates: dupes, unique: leads.length - dupes },
    });
  } catch (err) {
    console.error('crm-dedup-check crash', err);
    return json({ error: 'crash' }, 500);
  }
});
