import { useEffect, useState } from 'react';
import { invokeEdgeFunction } from '@/integrations/supabase/client';

export interface CrmDestination {
  id: string;
  label: string;
  group?: string;
  pipelineId?: string;
  stageId?: string;
}
export interface CrmUserCached {
  externalId: string;
  name: string;
  email: string | null;
  active: boolean;
}

interface State {
  loading: boolean;
  destinations: CrmDestination[];
  users: CrmUserCached[];
  error: string | null;
}

/**
 * Calls crm-list-destinations once when `open` flips to true. The edge
 * function is server-cached for 5 minutes (Cache-Control), so reopening
 * the modal in quick succession is cheap.
 */
export function useCrmDestinations(open: boolean) {
  const [state, setState] = useState<State>({
    loading: false,
    destinations: [],
    users: [],
    error: null,
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      const { data, error } = await invokeEdgeFunction<{
        ok?: boolean;
        destinations?: CrmDestination[];
        users?: CrmUserCached[];
        error?: string;
      }>('crm-list-destinations', { body: {} });

      if (cancelled) return;

      if (error) {
        setState({
          loading: false,
          destinations: [],
          users: [],
          error: error.message ?? 'fetch_failed',
        });
        return;
      }

      if (data?.ok) {
        setState({
          loading: false,
          destinations: data.destinations ?? [],
          users: data.users ?? [],
          error: null,
        });
      } else {
        setState({
          loading: false,
          destinations: [],
          users: [],
          error: data?.error ?? 'unknown_error',
        });
      }
    })();

    return () => { cancelled = true; };
  }, [open]);

  return state;
}
