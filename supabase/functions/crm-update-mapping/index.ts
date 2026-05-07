import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';
import type { CustomFieldMappings } from '../_shared/adapters/types.ts';

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

const PERSON_KEYS = [
  'firstName', 'lastName', 'email', 'mobilePhone',
  'directPhone', 'jobTitle', 'linkedin', 'website',
] as const;
const ORG_KEYS = ['name', 'domain', 'website', 'linkedin', 'industry'] as const;

function validateShape(m: unknown): { ok: true; value: CustomFieldMappings } | { ok: false; detail: string } {
  if (!m || typeof m !== 'object') return { ok: false, detail: 'mappings must be an object' };
  const o = m as Record<string, unknown>;
  if (!o.person || typeof o.person !== 'object') return { ok: false, detail: 'mappings.person missing' };
  if (!o.org || typeof o.org !== 'object')       return { ok: false, detail: 'mappings.org missing' };
  const person = o.person as Record<string, unknown>;
  const org = o.org as Record<string, unknown>;
  for (const k of PERSON_KEYS) {
    if (!Array.isArray(person[k])) return { ok: false, detail: `mappings.person.${k} must be array` };
    if (!(person[k] as unknown[]).every(x => typeof x === 'string')) {
      return { ok: false, detail: `mappings.person.${k} must be string[]` };
    }
  }
  for (const k of ORG_KEYS) {
    if (!Array.isArray(org[k])) return { ok: false, detail: `mappings.org.${k} must be array` };
    if (!(org[k] as unknown[]).every(x => typeof x === 'string')) {
      return { ok: false, detail: `mappings.org.${k} must be string[]` };
    }
  }
  for (const k of Object.keys(person)) {
    if (!(PERSON_KEYS as readonly string[]).includes(k)) {
      return { ok: false, detail: `mappings.person has unknown key: ${k}` };
    }
  }
  for (const k of Object.keys(org)) {
    if (!(ORG_KEYS as readonly string[]).includes(k)) {
      return { ok: false, detail: `mappings.org has unknown key: ${k}` };
    }
  }
  return { ok: true, value: m as CustomFieldMappings };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'FORBIDDEN' }, 401);

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
      return json({ ok: false, error: 'FORBIDDEN' }, 401);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return json({ ok: false, error: 'INVALID_STRUCTURE', detail: 'body is not JSON' }, 400);
    }
    const integrationId = (body as any).integrationId;
    if (typeof integrationId !== 'string') {
      return json({ ok: false, error: 'INVALID_STRUCTURE', detail: 'integrationId missing' }, 400);
    }

    const shape = validateShape((body as any).mappings);
    if (!shape.ok) {
      return json({ ok: false, error: 'INVALID_STRUCTURE', detail: shape.detail }, 400);
    }
    const mappings = shape.value;

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: integration, error: lookupErr } = await supabase
      .from('integrations')
      .select('id, workspace_id, status')
      .eq('id', integrationId)
      .maybeSingle();
    if (lookupErr) {
      console.error('crm-update-mapping: integration lookup failed', lookupErr);
      return json({ ok: false, error: 'INVALID_STRUCTURE', detail: 'lookup failed' }, 500);
    }
    if (!integration) return json({ ok: false, error: 'INVALID_STRUCTURE', detail: 'integration not found' }, 404);

    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', userId)
      .maybeSingle();
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    const isAdmin = !!roleRow;
    if (!isAdmin && profile?.workspace_id !== integration.workspace_id) {
      return json({ ok: false, error: 'FORBIDDEN' }, 403);
    }

    if (integration.status !== 'connected') {
      return json({ ok: false, error: 'NOT_CONNECTED' }, 400);
    }

    const { data: meta } = await supabase
      .from('integration_field_metadata')
      .select('object_type, fields_json')
      .eq('integration_id', integrationId);
    const personKeys = new Set<string>();
    const orgKeys = new Set<string>();
    for (const row of meta ?? []) {
      const fields = Array.isArray(row.fields_json) ? row.fields_json as Array<{ key: string }> : [];
      const target = row.object_type === 'person' ? personKeys : orgKeys;
      for (const f of fields) target.add(f.key);
    }

    const unknown: string[] = [];
    for (const k of PERSON_KEYS) {
      for (const v of mappings.person[k]) {
        if (!personKeys.has(v)) unknown.push(`person.${k}:${v}`);
      }
    }
    for (const k of ORG_KEYS) {
      for (const v of mappings.org[k]) {
        if (!orgKeys.has(v)) unknown.push(`org.${k}:${v}`);
      }
    }
    if (unknown.length > 0) {
      return json({ ok: false, error: 'UNKNOWN_FIELD_KEY', keys: unknown }, 400);
    }

    const { error: rpcErr } = await supabase.rpc('update_crm_field_mappings', {
      p_integration_id: integrationId,
      p_mappings: mappings as unknown as Record<string, unknown>,
    });
    if (rpcErr) {
      console.error('update_crm_field_mappings failed', rpcErr);
      return json({ ok: false, error: 'INVALID_STRUCTURE', detail: 'persist failed' }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    console.error('crm-update-mapping crash', err);
    return json({ ok: false, error: 'INVALID_STRUCTURE', detail: 'internal error' }, 500);
  }
});
