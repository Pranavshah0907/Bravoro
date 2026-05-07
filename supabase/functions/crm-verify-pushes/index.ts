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

const VERIFY_CAP = 50;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // ── JWT auth ─────────────────────────────────────────────────
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

    // ── Body ─────────────────────────────────────────────────────
    let body: any;
    try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    const { search_id }: { search_id?: string } = body;
    if (!search_id) return json({ error: 'missing_search_id' }, 400);

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── Resolve workspace + integration ──────────────────────────
    const { data: profile } = await supabase
      .from('profiles').select('workspace_id').eq('id', userId).maybeSingle();
    if (!profile?.workspace_id) return json({ error: 'no_workspace' }, 400);

    const { data: integ } = await supabase
      .from('integrations')
      .select('id, status')
      .eq('workspace_id', profile.workspace_id)
      .maybeSingle();
    if (!integ) return json({ error: 'no_connected_integration' }, 404);
    if (integ.status !== 'connected') return json({ error: 'integration_error' }, 409);

    // ── Load successful pushes for this search ───────────────────
    const { data: pushes, error: pushesErr } = await supabase
      .from('crm_pushes')
      .select('id, external_deal_id')
      .eq('workspace_id', profile.workspace_id)
      .eq('search_id', search_id)
      .eq('status', 'success')
      .not('external_deal_id', 'is', null)
      .order('pushed_at', { ascending: false })
      .limit(VERIFY_CAP);

    if (pushesErr) return json({ error: 'db_error', message: pushesErr.message }, 500);
    if (!pushes || pushes.length === 0) {
      return json({ ok: true, verified: 0, removed: 0 });
    }

    // ── Decrypt token ────────────────────────────────────────────
    const { data: token } = await supabase.rpc('decrypt_integration_token', {
      p_integration_id: integ.id,
    });
    if (!token) return json({ error: 'token_missing' }, 500);

    // ── Verify each deal in Pipedrive ────────────────────────────
    const idsToRemove: string[] = [];

    for (const p of pushes) {
      const url = `https://api.pipedrive.com/v1/deals/${p.external_deal_id}?api_token=${encodeURIComponent(token)}`;
      try {
        const res = await fetch(url);
        if (res.status === 404) {
          idsToRemove.push(p.id);
          continue;
        }
        if (!res.ok) {
          // Token problem etc — don't drop the row, the user may want to retry verification later
          console.warn(`verify GET deal ${p.external_deal_id} returned ${res.status}; skipping`);
          continue;
        }
        const data = await res.json();
        const deal = data?.data;
        // Pipedrive marks a soft-deleted deal with active_flag=false (or sometimes deleted=true).
        // Treat either as "no longer in CRM".
        if (!deal || deal.active_flag === false || deal.deleted === true) {
          idsToRemove.push(p.id);
        }
      } catch (err) {
        console.warn(`verify deal ${p.external_deal_id} threw:`, (err as Error).message);
        // Don't remove the row on network errors — be conservative
      }
    }

    // ── Remove the dead rows ─────────────────────────────────────
    if (idsToRemove.length > 0) {
      const { error: delErr } = await supabase
        .from('crm_pushes')
        .delete()
        .in('id', idsToRemove);
      if (delErr) {
        console.error('crm_pushes delete failed:', delErr.message);
        return json({ error: 'db_delete_error', message: delErr.message }, 500);
      }
    }

    return json({
      ok: true,
      verified: pushes.length,
      removed: idsToRemove.length,
      capped: pushes.length === VERIFY_CAP,
    });
  } catch (err) {
    console.error('crm-verify-pushes crash', (err as Error).message);
    return json({ error: 'crash' }, 500);
  }
});
