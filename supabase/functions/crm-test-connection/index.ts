import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';
import { getAdapter, isKnownCrmType } from '../_shared/adapters/registry.ts';

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

    const body = await req.json();
    const { crm_type, token } = body;
    if (typeof crm_type !== 'string' || typeof token !== 'string' || !token) {
      return json({ ok: false, error: 'Missing crm_type or token.' }, 400);
    }
    if (!isKnownCrmType(crm_type)) {
      return json({ ok: false, error: "This CRM isn't supported yet." }, 400);
    }

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', userId)
      .maybeSingle();
    if (!profile?.workspace_id) {
      return json({ ok: false, error: "Your account isn't assigned to a workspace." }, 400);
    }

    const adapter = getAdapter(crm_type);

    const connResult = await adapter.testConnection(token);
    if (!connResult.ok) {
      return json({ ok: false, error: connResult.error });
    }

    let metadata;
    try {
      metadata = await adapter.fetchFieldMetadata(token);
    } catch (err) {
      console.error('fetchFieldMetadata failed', (err as Error).message);
      return json({ ok: false, error: 'Token was rejected when reading fields. Try reconnecting.' });
    }

    const customFieldMappings = adapter.autoMapCustomFields(metadata);

    const { data: integrationId, error: rpcError } = await supabase.rpc('finalize_crm_connection', {
      p_workspace_id: profile.workspace_id,
      p_crm_type: crm_type,
      p_account_identifier: connResult.accountIdentifier,
      p_account_display_name: connResult.accountDisplayName,
      p_custom_field_mappings: customFieldMappings,
      p_connected_by_user_id: userId,
      p_token: token,
      p_person_fields: metadata.person,
      p_org_fields: metadata.org,
    });
    if (rpcError) {
      console.error('finalize_crm_connection failed', rpcError);
      return json({ ok: false, error: 'Failed to save connection. Try again.' }, 500);
    }

    // Spec A: kick off the initial contact-mirror backfill so the user
    // doesn't wait up to 30 min for the first n8n cron tick. Fire-and-
    // forget — never block the connect response on the sync.
    const dedupSecret = Deno.env.get('CRM_DEDUP_SECRET');
    if (dedupSecret && integrationId) {
      fetch(`${supabaseUrl}/functions/v1/crm-sync-contacts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${dedupSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ integration_id: integrationId }),
      }).catch((e) => console.warn('initial backfill kick-off failed:', (e as Error).message));
    }

    return json({
      ok: true,
      integrationId,
      accountDisplayName: connResult.accountDisplayName,
    });
  } catch (err) {
    console.error('crm-test-connection crash', err);
    return json({ ok: false, error: 'Something went wrong. Try again.' }, 500);
  }
});
