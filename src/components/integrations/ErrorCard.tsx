import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { invokeEdgeFunction } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, Unplug } from "lucide-react";
import { ConnectForm } from "./ConnectForm";

type IntegrationRow = {
  id: string;
  crm_type: string;
  account_display_name: string;
  last_checked_at: string;
  last_error: string | null;
};

interface Props {
  integration: IntegrationRow;
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

export function ErrorCard({ integration, onChanged }: Props) {
  const [showReconnect, setShowReconnect] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const { toast } = useToast();

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

  if (showReconnect) {
    return <ConnectForm defaultCrm={integration.crm_type} onConnected={onChanged} />;
  }

  return (
    <>
      <Card className="border-destructive/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="font-semibold">{crmLabel} — Connection error</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1 text-sm">
            <p>{integration.last_error ?? "Unknown connection error."}</p>
            <p className="text-muted-foreground">Last checked: {relativeTime(integration.last_checked_at)}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowReconnect(true)}>
              Reconnect
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
              Remove this CRM from Bravoro. You can reconnect anytime.
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
