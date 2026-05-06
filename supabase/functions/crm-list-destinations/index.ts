import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';
import { getAdapter } from '../_shared/adapters/registry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
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

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: profile } = await supabase
      .from('profiles').select('workspace_id').eq('id', userId).maybeSingle();
    if (!profile?.workspace_id) return json({ error: 'no_workspace' }, 400);

    const { data: integ } = await supabase
      .from('integrations')
      .select('id, crm_type, status, cached_users')
      .eq('workspace_id', profile.workspace_id)
      .maybeSingle();
    if (!integ) return json({ error: 'no_connected_integration' }, 404);
    if (integ.status !== 'connected') return json({ error: 'integration_error' }, 409);

    const { data: token } = await supabase.rpc('decrypt_integration_token', { p_integration_id: integ.id });
    if (!token) return json({ error: 'token_missing' }, 500);

    const adapter = getAdapter(integ.crm_type);
    const destinations = await adapter.listDestinations(token);

    return json({
      ok: true,
      destinations,
      users: integ.cached_users ?? [],
    }, 200, { 'Cache-Control': 'private, max-age=300' });
  } catch (err) {
    console.error('crm-list-destinations crash', (err as Error).message);
    return json({ error: 'crash' }, 500);
  }
});
