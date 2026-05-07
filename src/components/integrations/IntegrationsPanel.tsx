import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIntegration } from "./useIntegration";
import { ConnectForm } from "./ConnectForm";
import { ConnectedCard } from "./ConnectedCard";
import { ErrorCard } from "./ErrorCard";
import { Loader2 } from "lucide-react";

export function IntegrationsPanel() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loadingWs, setLoadingWs] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) {
        setLoadingWs(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("workspace_id")
        .eq("id", uid)
        .maybeSingle();
      setWorkspaceId(profile?.workspace_id ?? null);
      setLoadingWs(false);
    })();
  }, []);

  const { integration, fieldCounts, loading, refetch } = useIntegration(workspaceId);

  if (loadingWs || loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <p className="text-sm text-muted-foreground">
        Your account isn't assigned to a workspace yet. Contact an admin.
      </p>
    );
  }

  if (!integration) return <ConnectForm onConnected={refetch} />;
  if (integration.status === "error") return <ErrorCard integration={integration} onChanged={refetch} />;
  return <ConnectedCard integration={integration} fieldCounts={fieldCounts} onChanged={refetch} />;
}
