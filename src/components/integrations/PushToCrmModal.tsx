import { useState, useMemo, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Upload, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { invokeEdgeFunction } from '@/integrations/supabase/client';
import { useCrmDestinations } from './useCrmDestinations';
import { useCrmPushes } from './useCrmPushes';
import { useToast } from '@/hooks/use-toast';

export interface PushLeadInput {
  record_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  domain?: string | null;
  organization?: string | null;
  title?: string | null;
  phone_1?: string | null;
  phone_2?: string | null;
  linkedin?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchId: string;
  searchName: string;
  leads: PushLeadInput[];
  currentUserEmail: string | null;
}

interface PushResult {
  lead_index: number;
  record_id: string;
  status: 'success' | 'failed' | 'skipped_idempotent';
  external_deal_id?: string;
  destination_label?: string;
  error_message?: string;
}

const UNASSIGNED = '__unassigned__';

export function PushToCrmModal({
  open, onOpenChange, searchId, searchName, leads, currentUserEmail,
}: Props) {
  const { destinations, users, loading: destsLoading, error: destsError } = useCrmDestinations(open);
  const { pushes } = useCrmPushes(searchId);
  const { toast } = useToast();

  const [destinationId, setDestinationId] = useState<string>('');
  const [ownerId, setOwnerId] = useState<string>(UNASSIGNED);
  const [pushing, setPushing] = useState(false);
  const [results, setResults] = useState<PushResult[] | null>(null);

  // Default destination → first option
  useEffect(() => {
    if (destinations.length > 0 && !destinationId) setDestinationId(destinations[0].id);
  }, [destinations, destinationId]);

  // Default owner → match by email; else Unassigned
  useEffect(() => {
    if (users.length === 0) { setOwnerId(UNASSIGNED); return; }
    const match = currentUserEmail
      ? users.find((u) => u.active && u.email?.toLowerCase() === currentUserEmail.toLowerCase())
      : null;
    setOwnerId(match?.externalId ?? UNASSIGNED);
  }, [users, currentUserEmail]);

  const newLeads = useMemo(
    () => leads.filter((l) => {
      const existing = pushes.get(l.record_id);
      return !existing || existing.status === 'failed';
    }),
    [leads, pushes],
  );

  const onPush = async () => {
    if (!destinationId || newLeads.length === 0) return;
    setPushing(true);
    setResults(null);
    try {
      const { data, error } = await invokeEdgeFunction<{
        ok?: boolean;
        results?: PushResult[];
        stats?: { succeeded: number; failed: number; skipped_idempotent: number };
        error?: string;
      }>('crm-push', {
        body: {
          destination_id: destinationId,
          owner_external_id: ownerId === UNASSIGNED ? null : ownerId,
          search_id: searchId,
          search_name: searchName,
          leads: newLeads,
        },
      });
      if (error || !data?.ok) {
        toast({
          title: 'Push failed',
          description: error?.message ?? data?.error ?? 'Unknown error',
          variant: 'destructive',
        });
        return;
      }
      setResults(data.results ?? []);
      const s = data.stats ?? { succeeded: 0, failed: 0, skipped_idempotent: 0 };
      const summary = `${s.succeeded} pushed, ${s.failed} failed${
        s.skipped_idempotent ? `, ${s.skipped_idempotent} already pushed` : ''
      }`;
      toast({
        title: s.failed > 0 ? 'Push complete with errors' : 'Push complete',
        description: summary,
      });
    } catch (err: any) {
      toast({ title: 'Push failed', description: err?.message ?? 'Network error', variant: 'destructive' });
    } finally {
      setPushing(false);
    }
  };

  const errorMessage = (() => {
    if (!destsError) return null;
    if (destsError === 'no_connected_integration') {
      return 'No CRM connected. Connect Pipedrive in Settings → Integrations first.';
    }
    if (destsError === 'integration_error') {
      return 'Your CRM connection is in an error state. Reconnect from Settings → Integrations.';
    }
    return `Couldn't load destinations: ${destsError}`;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Push contacts to CRM</DialogTitle>
          <DialogDescription>
            {leads.length} contacts in this search.
            {pushes.size > 0 && ` ${pushes.size} already pushed.`}
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {!errorMessage && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Destination</label>
              <Select
                value={destinationId}
                onValueChange={setDestinationId}
                disabled={destsLoading || destinations.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={destsLoading ? 'Loading…' : 'Select destination'} />
                </SelectTrigger>
                <SelectContent>
                  {destinations.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Owner</label>
              <Select
                value={ownerId}
                onValueChange={setOwnerId}
                disabled={destsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {users.filter((u) => u.active).map((u) => (
                    <SelectItem key={u.externalId} value={u.externalId}>
                      {u.name}{u.email ? ` · ${u.email}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {results && results.length > 0 && (
              <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1 text-xs">
                {results.map((r) => (
                  <div key={r.record_id} className="flex items-center gap-2 px-1 py-0.5">
                    {r.status === 'success' && (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                    )}
                    {r.status === 'skipped_idempotent' && (
                      <CheckCircle2 className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    {r.status === 'failed' && (
                      <XCircle className="h-3 w-3 text-destructive shrink-0" />
                    )}
                    <span className="truncate font-mono">{r.record_id}</span>
                    <span className="text-muted-foreground ml-auto shrink-0">
                      {r.status === 'skipped_idempotent' ? 'already pushed' : r.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pushing}>
            Cancel
          </Button>
          <Button
            onClick={onPush}
            disabled={pushing || destsLoading || !destinationId || newLeads.length === 0 || !!errorMessage}
            className="gap-2"
          >
            {pushing && <Loader2 className="h-4 w-4 animate-spin" />}
            <Upload className="h-4 w-4" />
            Push {newLeads.length} {newLeads.length === 1 ? 'contact' : 'contacts'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
