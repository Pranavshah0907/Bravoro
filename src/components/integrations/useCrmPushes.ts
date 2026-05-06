import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CrmPushRow {
  id: string;
  bravoro_record_id: string | null;
  destination_id: string;
  destination_label: string;
  external_deal_id: string | null;
  status: 'success' | 'failed';
  pushed_at: string;
  error_message: string | null;
}

/**
 * Returns a Map keyed by `bravoro_record_id` of the workspace's pushes for
 * the given search. Updates live via Supabase Realtime when crm-push
 * inserts or updates rows in crm_pushes.
 */
export function useCrmPushes(searchId?: string) {
  const [pushes, setPushes] = useState<Map<string, CrmPushRow>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!searchId) {
      setPushes(new Map());
      setLoading(false);
      return;
    }
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('crm_pushes')
        .select('id, bravoro_record_id, destination_id, destination_label, external_deal_id, status, pushed_at, error_message')
        .eq('search_id', searchId);
      if (cancelled) return;
      const map = new Map<string, CrmPushRow>();
      for (const r of (data ?? [])) {
        if (r.bravoro_record_id) map.set(r.bravoro_record_id, r as CrmPushRow);
      }
      setPushes(map);
      setLoading(false);
    })();

    channel = supabase
      .channel(`crm_pushes:${searchId}`)
      .on('postgres_changes' as never, {
        event: '*',
        schema: 'public',
        table: 'crm_pushes',
        filter: `search_id=eq.${searchId}`,
      }, (payload: any) => {
        const row = (payload.new ?? payload.old) as CrmPushRow;
        if (!row?.bravoro_record_id) return;
        setPushes((prev) => {
          const next = new Map(prev);
          if (payload.eventType === 'DELETE') next.delete(row.bravoro_record_id!);
          else next.set(row.bravoro_record_id!, row);
          return next;
        });
      })
      .subscribe();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [searchId]);

  return { pushes, loading };
}
