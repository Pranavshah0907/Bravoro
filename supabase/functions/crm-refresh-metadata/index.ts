import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';
import { getAdapter } from '../_shared/adapters/registry.ts';
import { InvalidTokenError } from '../_shared/adapters/types.ts';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

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
      return json({ error: 'Unauthorized' }, 401);
    }

    const { integration_id } = await req.json();
    if (typeof integration_id !== 'string') {
      return json({ ok: false, error: 'Missing integration_id.' }, 400);
    }

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: integration } = await supabase
      .from('integrations')
      .select('id, crm_type, workspace_id')
      .eq('id', integration_id)
      .maybeSingle();
    if (!integration) return json({ ok: false, error: 'Integration not found.' }, 404);

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
      return json({ ok: false, error: 'Not allowed.' }, 403);
    }

    const { data: token, error: decryptErr } = await supabase.rpc('decrypt_integration_token', {
      p_integration_id: integration_id,
    });
    if (decryptErr || !token) {
      console.error('decrypt failed', decryptErr);
      return json({ ok: false, error: 'Connection is broken. Reconnect to continue.' }, 500);
    }

    const adapter = getAdapter(integration.crm_type);

    let metadata;
    try {
      metadata = await adapter.fetchFieldMetadata(token);
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        await supabase.from('integrations').update({
          status: 'error',
          last_error: 'Token invalid or revoked',
          last_checked_at: new Date().toISOString(),
        }).eq('id', integration_id);
        return json({ ok: false, error: 'Token is no longer valid. Reconnect to continue.' });
      }
      throw err;
    }

    const customFieldMappings = adapter.autoMapCustomFields(metadata);

    const { error: rpcError } = await supabase.rpc('refresh_crm_metadata', {
      p_integration_id: integration_id,
      p_custom_field_mappings: customFieldMappings,
      p_person_fields: metadata.person,
      p_org_fields: metadata.org,
    });
    if (rpcError) {
      console.error('refresh_crm_metadata failed', rpcError);
      return json({ ok: false, error: 'Failed to save refreshed metadata. Try again.' }, 500);
    }

    return json({
      ok: true,
      customFieldMappings,
      fieldCount: { person: metadata.person.length, org: metadata.org.length },
    });
  } catch (err) {
    console.error('crm-refresh-metadata crash', err);
    return json({ ok: false, error: 'Something went wrong. Try again.' }, 500);
  }
});
