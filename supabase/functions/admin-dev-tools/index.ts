import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WEBHOOK_URLS: Record<string, string> = {
  manual_entry: 'https://n8n.srv1081444.hstgr.cloud/webhook/enrichment_bulk_manual',
  bulk_upload: 'https://n8n.srv1081444.hstgr.cloud/webhook/bulk_search',
  bulk_people_enrichment: 'https://n8n.srv1081444.hstgr.cloud/webhook/bulk_enrich',
};

// Derive human-readable type + method from a search record
function getEntryInfo(s: { search_type: string; excel_file_name: string | null; grid_data: unknown }) {
  if (s.search_type === 'manual')
    return { type_label: 'Single Search', entry_method: 'Manual Form' };
  if (s.search_type === 'bulk_people_enrichment') {
    if (s.excel_file_name?.startsWith('google_sheet_'))
      return { type_label: 'People Enrichment', entry_method: 'Google Sheet URL' };
    return { type_label: 'People Enrichment', entry_method: 'File Upload' };
  }
  // search_type === 'bulk'
  if (s.grid_data)
    return { type_label: 'Bulk Search', entry_method: 'Spreadsheet Grid' };
  if (s.excel_file_name?.startsWith('google_sheet_'))
    return { type_label: 'Bulk Search', entry_method: 'Google Sheet URL' };
  if (s.excel_file_name)
    return { type_label: 'Bulk Search', entry_method: 'File Upload' };
  return { type_label: 'Bulk Search', entry_method: 'Unknown' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const respond = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // ── Auth ────────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return respond({ error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    let userId: string;
    try {
      const JWKS = jose.createRemoteJWKSet(
        new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
      );
      const { payload } = await jose.jwtVerify(token, JWKS, {
        issuer: `${supabaseUrl}/auth/v1`,
        audience: 'authenticated',
      });
      userId = payload.sub as string;
      if (!userId) throw new Error('no sub');
    } catch {
      return respond({ error: 'Unauthorized' }, 401);
    }

    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: roleData } = await supabase
      .from('user_roles').select('role').eq('user_id', userId).single();
    if (roleData?.role !== 'admin') return respond({ error: 'Forbidden' }, 403);

    const body = await req.json();
    const { action } = body;

    // ── GET ALL SEARCHES ──────────────────────────────────────────────────────
    if (action === 'get_queue') {
      // 1. Processing flag
      const { data: slot } = await supabase
        .from('api_slots')
        .select('is_locked, locked_by_search_id, locked_at')
        .eq('slot_name', 'processing')
        .single();

      const flagSearchId = slot?.is_locked ? slot.locked_by_search_id : null;
      const flagLockedAt = slot?.locked_at ?? null;

      // 2. Request queue
      const { data: queueItems } = await supabase
        .from('request_queue')
        .select('id, search_id, entry_type, created_at, search_data')
        .eq('status', 'queued')
        .order('created_at', { ascending: true });

      // 3. ALL searches (not just processing) — fetch all statuses
      // Limit to recent 500 to avoid huge payloads; frontend has time filter
      const { data: allSearches } = await supabase
        .from('searches')
        .select('id, user_id, search_type, excel_file_name, status, error_message, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(500);

      // 3b. Lightweight check: which searches have grid_data
      const allIds = (allSearches ?? []).map(s => s.id);
      const gridDataIds = new Set<string>();
      if (allIds.length > 0) {
        // Batch in chunks of 100 to avoid query size issues
        for (let i = 0; i < allIds.length; i += 100) {
          const chunk = allIds.slice(i, i + 100);
          const { data: withGrid } = await supabase
            .from('searches')
            .select('id')
            .in('id', chunk)
            .not('grid_data', 'is', null);
          for (const r of withGrid ?? []) gridDataIds.add(r.id);
        }
      }

      // 3c. Cross-reference: how many results does each search have?
      // Use HEAD count queries in parallel batches — avoids row transfer and 1000-row cap.
      const resultCountMap: Record<string, number> = {};
      if (allIds.length > 0) {
        const BATCH = 25;
        for (let i = 0; i < allIds.length; i += BATCH) {
          const batch = allIds.slice(i, i + BATCH);
          const counts = await Promise.all(
            batch.map(async (id) => {
              const { count } = await supabase
                .from('search_results')
                .select('*', { count: 'exact', head: true })
                .eq('search_id', id);
              return [id, count ?? 0] as const;
            })
          );
          for (const [id, c] of counts) resultCountMap[id] = c;
        }
      }

      // 4. Collect all user_ids to batch-fetch profiles
      const userIdSet = new Set<string>();
      for (const s of allSearches ?? []) if (s.user_id) userIdSet.add(s.user_id);

      // Also get search records for queued items
      const queueSearchIds = (queueItems ?? []).map(q => q.search_id).filter(Boolean);
      const queueSearches: Record<string, any> = {};
      if (queueSearchIds.length > 0) {
        const { data: qs } = await supabase
          .from('searches')
          .select('id, user_id, search_type, excel_file_name, created_at, updated_at')
          .in('id', queueSearchIds);
        const { data: qGrid } = await supabase
          .from('searches')
          .select('id')
          .in('id', queueSearchIds)
          .not('grid_data', 'is', null);
        const qGridSet = new Set((qGrid ?? []).map(r => r.id));
        for (const s of qs ?? []) {
          queueSearches[s.id] = { ...s, grid_data: qGridSet.has(s.id) ? true : null };
          if (s.user_id) userIdSet.add(s.user_id);
        }
      }

      // 5. Batch fetch profiles
      const profileMap: Record<string, { email: string; full_name: string }> = {};
      if (userIdSet.size > 0) {
        const uids = Array.from(userIdSet);
        for (let i = 0; i < uids.length; i += 100) {
          const chunk = uids.slice(i, i + 100);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .in('id', chunk);
          for (const p of profiles ?? []) {
            profileMap[p.id] = { email: p.email ?? '', full_name: p.full_name ?? '' };
          }
        }
      }

      // 6. Build flag_item
      let flag_item = null;
      if (flagSearchId) {
        const search = (allSearches ?? []).find(s => s.id === flagSearchId);
        if (search) {
          const profile = profileMap[search.user_id] ?? { email: '', full_name: '' };
          const info = getEntryInfo({ ...search, grid_data: gridDataIds.has(search.id) ? true : null });
          flag_item = {
            search_id: search.id,
            user_email: profile.email,
            full_name: profile.full_name,
            search_type: search.search_type,
            status: search.status,
            error_message: search.error_message ?? null,
            ...info,
            excel_file_name: search.excel_file_name ?? null,
            result_count: resultCountMap[search.id] ?? 0,
            locked_at: flagLockedAt,
            created_at: search.created_at,
            updated_at: search.updated_at,
          };
        }
      }

      // 7. All searches — enriched
      const searches = (allSearches ?? []).map(s => {
        const profile = profileMap[s.user_id] ?? { email: '', full_name: '' };
        const info = getEntryInfo({ ...s, grid_data: gridDataIds.has(s.id) ? true : null });
        return {
          search_id: s.id,
          user_email: profile.email,
          full_name: profile.full_name,
          search_type: s.search_type,
          status: s.status,
          error_message: s.error_message ?? null,
          ...info,
          excel_file_name: s.excel_file_name ?? null,
          result_count: resultCountMap[s.id] ?? 0,
          is_flag_locked: s.id === flagSearchId,
          created_at: s.created_at,
          updated_at: s.updated_at,
        };
      });

      // 8. Queued items
      const queued = (queueItems ?? []).map((q) => {
        const search = queueSearches[q.search_id];
        const profile = search ? profileMap[search.user_id] : null;
        const info = search ? getEntryInfo(search) : {
          type_label: q.entry_type === 'bulk_people_enrichment' ? 'People Enrichment'
            : q.entry_type === 'manual_entry' ? 'Single Search' : 'Bulk Search',
          entry_method: 'Unknown',
        };
        return {
          id: q.id,
          search_id: q.search_id,
          entry_type: q.entry_type,
          user_email: profile?.email ?? q.search_data?.user_email ?? '',
          full_name: profile?.full_name ?? '',
          ...info,
          created_at: q.created_at,
        };
      });

      return respond({ flag_item, searches, queued });
    }

    // ── STOP SEARCH (mark error with note) ─────────────────────────────────────
    if (action === 'stop_search') {
      const { searchId, note } = body;
      if (!searchId) return respond({ error: 'searchId required' }, 400);

      const errorMsg = note?.trim() || 'Stopped by admin';

      await supabase.from('searches').update({
        status: 'error',
        error_message: errorMsg,
        updated_at: new Date().toISOString(),
      }).eq('id', searchId);

      const { data: slot } = await supabase
        .from('api_slots')
        .select('locked_by_search_id')
        .eq('slot_name', 'processing')
        .single();

      let flagReleased = false;
      let nextDispatched = false;

      if (slot?.locked_by_search_id === searchId) {
        const { data: nextItems } = await supabase
          .rpc('release_processing_flag', { p_search_id: searchId });

        flagReleased = true;

        if (nextItems && nextItems.length > 0) {
          const next = nextItems[0];
          const n8nUrl = WEBHOOK_URLS[next.next_entry_type] ?? WEBHOOK_URLS['bulk_upload'];
          const n8nSecret = Deno.env.get('N8N_WEBHOOK_SECRET');
          const headers: Record<string, string> = {
            'Content-Type': 'application/json; charset=utf-8',
            'type_of_entry': next.next_entry_type,
          };
          if (n8nSecret) headers['x-webhook-secret'] = n8nSecret;

          const r = await fetch(n8nUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(next.next_search_data),
          });

          if (r.ok) {
            nextDispatched = true;
          } else {
            await supabase.rpc('release_processing_flag', { p_search_id: next.next_search_id });
            await supabase.from('searches').update({
              status: 'error',
              error_message: 'Failed to dispatch after previous item was stopped',
              updated_at: new Date().toISOString(),
            }).eq('id', next.next_search_id);
          }
        }
      }

      return respond({ success: true, flag_released: flagReleased, next_dispatched: nextDispatched });
    }

    // ── DELETE QUEUE ITEM ──────────────────────────────────────────────────────
    if (action === 'delete_item') {
      const { queueItemId, searchId } = body;

      if (queueItemId) {
        await supabase.from('request_queue').delete().eq('id', queueItemId);
      }
      if (searchId) {
        await supabase.from('searches').update({
          status: 'cancelled',
          error_message: 'Removed from queue by admin',
          updated_at: new Date().toISOString(),
        }).eq('id', searchId);
      }

      return respond({ success: true });
    }

    if (action === 'get_workspace_searches') {
      const { userIds } = body;
      if (!Array.isArray(userIds) || userIds.length === 0)
        return respond({ error: 'userIds required' }, 400);

      const { data: allSearches } = await supabase
        .from('searches')
        .select('id, user_id, search_type, excel_file_name, status, error_message, created_at, updated_at')
        .in('user_id', userIds)
        .order('updated_at', { ascending: false })
        .limit(500);

      const allIds = (allSearches ?? []).map(s => s.id);

      const gridDataIds = new Set<string>();
      for (let i = 0; i < allIds.length; i += 100) {
        const chunk = allIds.slice(i, i + 100);
        const { data: withGrid } = await supabase
          .from('searches')
          .select('id')
          .in('id', chunk)
          .not('grid_data', 'is', null);
        for (const r of withGrid ?? []) gridDataIds.add(r.id);
      }

      const resultCountMap: Record<string, number> = {};
      const BATCH = 25;
      for (let i = 0; i < allIds.length; i += BATCH) {
        const batch = allIds.slice(i, i + BATCH);
        const counts = await Promise.all(
          batch.map(async (id) => {
            const { count } = await supabase
              .from('search_results')
              .select('*', { count: 'exact', head: true })
              .eq('search_id', id);
            return [id, count ?? 0] as const;
          })
        );
        for (const [id, c] of counts) resultCountMap[id] = c;
      }

      const profileMap: Record<string, { email: string; full_name: string }> = {};
      for (let i = 0; i < userIds.length; i += 100) {
        const chunk = userIds.slice(i, i + 100);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', chunk);
        for (const p of profiles ?? [])
          profileMap[p.id] = { email: p.email ?? '', full_name: p.full_name ?? '' };
      }

      const searches = (allSearches ?? []).map(s => {
        const profile = profileMap[s.user_id] ?? { email: '', full_name: '' };
        const info = getEntryInfo({ ...s, grid_data: gridDataIds.has(s.id) ? true : null });
        return {
          search_id: s.id,
          user_email: profile.email,
          full_name: profile.full_name,
          search_type: s.search_type,
          status: s.status,
          error_message: s.error_message ?? null,
          ...info,
          excel_file_name: s.excel_file_name ?? null,
          result_count: resultCountMap[s.id] ?? 0,
          created_at: s.created_at,
          updated_at: s.updated_at,
        };
      });

      return respond({ searches });
    }

    return respond({ error: `Unknown action: ${action}` }, 400);

  } catch (err) {
    console.error('admin-dev-tools error:', err);
    return respond({ error: String(err) }, 500);
  }
});
