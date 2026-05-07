import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type IntegrationRow = Database["public"]["Tables"]["integrations"]["Row"];

export interface UseIntegrationResult {
  integration: IntegrationRow | null;
  fieldCounts: { person: number; org: number } | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useIntegration(workspaceId: string | null): UseIntegrationResult {
  const [integration, setIntegration] = useState<IntegrationRow | null>(null);
  const [fieldCounts, setFieldCounts] = useState<{ person: number; org: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setIntegration(null);
      setFieldCounts(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: intRow, error: intErr } = await supabase
        .from("integrations")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (intErr) throw intErr;
      setIntegration(intRow);

      if (intRow) {
        const { data: metaRows, error: metaErr } = await supabase
          .from("integration_field_metadata")
          .select("object_type, fields_json")
          .eq("integration_id", intRow.id);
        if (metaErr) throw metaErr;
        const person = metaRows?.find((r) => r.object_type === "person");
        const org = metaRows?.find((r) => r.object_type === "org");
        setFieldCounts({
          person: Array.isArray(person?.fields_json) ? (person!.fields_json as unknown[]).length : 0,
          org: Array.isArray(org?.fields_json) ? (org!.fields_json as unknown[]).length : 0,
        });
      } else {
        setFieldCounts(null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase
      .channel(`integrations:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "integrations",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, load]);

  return { integration, fieldCounts, loading, error, refetch: load };
}
