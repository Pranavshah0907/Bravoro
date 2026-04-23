import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';

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

    const { data: integration, error: lookupErr } = await supabase
      .from('integrations')
      .select('id, workspace_id')
      .eq('id', integration_id)
      .maybeSingle();
    if (lookupErr) {
      console.error('disconnect: integration lookup failed', lookupErr);
      return json({ ok: false, error: 'Failed to load integration. Try again.' }, 500);
    }
    if (!integration) {
      console.log('disconnect: already gone', integration_id);
      return json({ ok: true });
    }

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

    const { error: rpcError } = await supabase.rpc('delete_integration_cascade', {
      p_integration_id: integration_id,
    });
    if (rpcError) {
      console.error('delete_integration_cascade failed', rpcError);
      return json({ ok: false, error: 'Failed to disconnect. Try again.' }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    console.error('crm-disconnect crash', err);
    return json({ ok: false, error: 'Something went wrong. Try again.' }, 500);
  }
});
