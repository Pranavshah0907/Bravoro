import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { invokeEdgeFunction } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, RefreshCw, Unplug } from "lucide-react";

type IntegrationRow = {
  id: string;
  crm_type: string;
  account_display_name: string;
  last_checked_at: string;
};

interface Props {
  integration: IntegrationRow;
  fieldCounts: { person: number; org: number } | null;
  onChanged: () => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function ConnectedCard({ integration, fieldCounts, onChanged }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const { data, error } = await invokeEdgeFunction<{ ok: boolean; error?: string; fieldCount?: { person: number; org: number } }>(
        "crm-refresh-metadata",
        { body: { integration_id: integration.id } }
      );
      if (error || !data?.ok) {
        toast({ title: "Refresh failed", description: error?.message ?? data?.error ?? "Unknown error", variant: "destructive" });
        onChanged();
        return;
      }
      toast({
        title: "Fields refreshed",
        description: `${data.fieldCount?.person ?? 0} person · ${data.fieldCount?.org ?? 0} org fields synced.`,
      });
      onChanged();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const { error } = await invokeEdgeFunction<{ ok: boolean }>(
        "crm-disconnect",
        { body: { integration_id: integration.id } }
      );
      if (error) {
        toast({ title: "Disconnect failed", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Disconnected", description: "CRM removed from Bravoro." });
      setConfirmOpen(false);
      onChanged();
    } finally {
      setDisconnecting(false);
    }
  }

  const crmLabel = integration.crm_type.charAt(0).toUpperCase() + integration.crm_type.slice(1);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <span className="font-semibold">{crmLabel} — Connected</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1 text-sm">
            <p className="font-medium">{integration.account_display_name}</p>
            <p className="text-muted-foreground">Last checked: {relativeTime(integration.last_checked_at)}</p>
            {fieldCounts && (
              <p className="text-muted-foreground">
                {fieldCounts.person} person fields · {fieldCounts.org} org fields synced
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh fields
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)} disabled={disconnecting}>
              <Unplug className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {crmLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Bravoro will stop using this CRM for dedup checks. You can reconnect anytime by pasting the API token again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
