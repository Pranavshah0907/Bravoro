import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getAdapter } from '../_shared/adapters/registry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const BATCH_SIZE = 10;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const expectedSecret = Deno.env.get('CRM_HEALTH_CHECK_SECRET');
    const providedSecret = req.headers.get('x-cron-secret');
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Paginate — a single PostgREST request caps at 1000 rows, so tenants
    // past that limit would be silently skipped without looping.
    const PAGE_SIZE = 1000;
    const integrations: Array<{ id: string; crm_type: string }> = [];
    let page = 0;
    while (true) {
      const { data: pageRows, error } = await supabase
        .from('integrations')
        .select('id, crm_type')
        .eq('status', 'connected')
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) {
        console.error('load integrations failed', error);
        return json({ error: 'query failed' }, 500);
      }
      if (!pageRows || pageRows.length === 0) break;
      integrations.push(...pageRows);
      if (pageRows.length < PAGE_SIZE) break;
      page += 1;
    }

    let stillConnected = 0;
    let newlyError = 0;

    for (let i = 0; i < integrations.length; i += BATCH_SIZE) {
      const batch = integrations.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(async (row) => {
        try {
          const { data: token } = await supabase.rpc('decrypt_integration_token', {
            p_integration_id: row.id,
          });
          if (!token) throw new Error('token_missing');
          const adapter = getAdapter(row.crm_type);
          const result = await adapter.testConnection(token);
          if (result.ok) {
            await supabase.from('integrations').update({
              last_checked_at: new Date().toISOString(),
            }).eq('id', row.id);
            stillConnected += 1;
          } else {
            await supabase.from('integrations').update({
              status: 'error',
              last_error: result.error ?? 'Connection check failed',
              last_checked_at: new Date().toISOString(),
            }).eq('id', row.id);
            newlyError += 1;
          }
        } catch (err) {
          console.error('health check row failed', row.id, (err as Error).message);
          await supabase.from('integrations').update({
            status: 'error',
            last_error: 'Health check failed. Reconnect to continue.',
            last_checked_at: new Date().toISOString(),
          }).eq('id', row.id);
          newlyError += 1;
        }
      }));
    }

    return json({ checked: integrations.length, still_connected: stillConnected, newly_error: newlyError });
  } catch (err) {
    console.error('crm-health-check crash', err);
    return json({ error: 'crash' }, 500);
  }
});
