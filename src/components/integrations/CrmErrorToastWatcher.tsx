import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CrmErrorToastWatcher() {
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || cancelled) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("workspace_id")
        .eq("id", uid)
        .maybeSingle();
      const wsId = profile?.workspace_id;
      if (!wsId || cancelled) return;

      const { data: integration } = await supabase
        .from("integrations")
        .select("id, crm_type, status, last_error")
        .eq("workspace_id", wsId)
        .eq("status", "error")
        .maybeSingle();
      if (!integration || cancelled) return;

      const storageKey = `crm_error_toast_last_shown_${wsId}`;
      const lastShown = localStorage.getItem(storageKey);
      const today = todayYmd();
      if (lastShown === today) return;

      localStorage.setItem(storageKey, today);
      toast({
        title: `${integration.crm_type.charAt(0).toUpperCase() + integration.crm_type.slice(1)} connection needs attention`,
        description: integration.last_error ?? "Reconnect to resume dedup checks.",
        action: (
          <ToastAction altText="Fix now" onClick={() => navigate("/settings?tab=integrations")}>
            Fix now
          </ToastAction>
        ),
      });
    }

    void check();

    return () => {
      cancelled = true;
    };
  }, [toast, navigate]);

  return null;
}
