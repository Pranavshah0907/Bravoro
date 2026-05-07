import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { invokeEdgeFunction } from "@/integrations/supabase/client";
import { FieldMappingRow, type FieldOption } from "./FieldMappingRow";

export interface CustomFieldMappings {
  person: {
    firstName: string[]; lastName: string[]; email: string[];
    mobilePhone: string[]; directPhone: string[]; jobTitle: string[];
    linkedin: string[]; website: string[];
  };
  org: {
    name: string[]; domain: string[]; website: string[];
    linkedin: string[]; industry: string[];
  };
}

const PERSON_ROWS: Array<{ key: keyof CustomFieldMappings["person"]; label: string; hint?: string }> = [
  { key: "firstName",   label: "First name" },
  { key: "lastName",    label: "Last name" },
  { key: "email",       label: "Email", hint: "Used for dedup matching" },
  { key: "mobilePhone", label: "Mobile phone" },
  { key: "directPhone", label: "Direct phone" },
  { key: "jobTitle",    label: "Job title" },
  { key: "linkedin",    label: "LinkedIn URL" },
  { key: "website",     label: "Website" },
];
const ORG_ROWS: Array<{ key: keyof CustomFieldMappings["org"]; label: string; hint?: string }> = [
  { key: "name",     label: "Name" },
  { key: "domain",   label: "Domain", hint: "Used for dedup matching" },
  { key: "website",  label: "Website", hint: "Used for dedup matching" },
  { key: "linkedin", label: "LinkedIn URL" },
  { key: "industry", label: "Industry" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: string;
  initialMapping: CustomFieldMappings;
  autoDetected: CustomFieldMappings;
  personOptions: FieldOption[];
  orgOptions: FieldOption[];
  onSaved: () => void;
  onRefreshMetadata: () => Promise<void>;
}

export function EditFieldMappingDialog({
  open, onOpenChange, integrationId, initialMapping, autoDetected,
  personOptions, orgOptions, onSaved, onRefreshMetadata,
}: Props) {
  const [draft, setDraft] = useState<CustomFieldMappings>(initialMapping);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(initialMapping);
      setError(null);
    }
  }, [open, initialMapping]);

  const personOptionsSorted = useMemo(() => personOptions, [personOptions]);
  const orgOptionsSorted = useMemo(() => orgOptions, [orgOptions]);

  function setPerson<K extends keyof CustomFieldMappings["person"]>(key: K, next: string[]) {
    setDraft((d) => ({ ...d, person: { ...d.person, [key]: next } }));
  }
  function setOrg<K extends keyof CustomFieldMappings["org"]>(key: K, next: string[]) {
    setDraft((d) => ({ ...d, org: { ...d.org, [key]: next } }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const { data, error: invokeErr } = await invokeEdgeFunction<
        | { ok: true }
        | { ok: false; error: string; detail?: string; keys?: string[] }
      >("crm-update-mapping", {
        body: { integrationId, mappings: draft },
      });
      if (invokeErr) {
        setError("Couldn't save mapping. Try again.");
        return;
      }
      if (!data?.ok) {
        if (data?.error === "UNKNOWN_FIELD_KEY") {
          setError("One or more fields no longer exist in your CRM. Click 'Refresh fields' and retry.");
        } else if (data?.error === "FORBIDDEN") {
          setError("You don't have permission to edit this workspace's CRM integration.");
        } else if (data?.error === "NOT_CONNECTED") {
          setError("The CRM connection isn't active. Reconnect and try again.");
        } else {
          setError("Something's wrong with the mapping data. Refresh and try again.");
        }
        return;
      }
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      await onRefreshMetadata();
    } catch {
      setError("Couldn't refresh fields from Pipedrive.");
    } finally {
      setRefreshing(false);
    }
  }

  function handleResetConfirmed() {
    setDraft(autoDetected);
    setResetConfirmOpen(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit field mapping</DialogTitle>
            <DialogDescription>
              Tell Bravoro where each data type lives in your CRM. We use this to find
              existing contacts before enrichment runs.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end mb-2">
            <Button type="button" variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing
                ? <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                : <RefreshCw className="mr-2 h-3 w-3" />}
              Refresh fields from Pipedrive
            </Button>
          </div>

          <div className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Person</h3>
            <div className="divide-y">
              {PERSON_ROWS.map((r) => (
                <FieldMappingRow
                  key={r.key}
                  rowLabel={r.label}
                  hint={r.hint}
                  values={draft.person[r.key]}
                  options={personOptionsSorted}
                  onChange={(next) => setPerson(r.key, next)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1 mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Organization</h3>
            <div className="divide-y">
              {ORG_ROWS.map((r) => (
                <FieldMappingRow
                  key={r.key}
                  rowLabel={r.label}
                  hint={r.hint}
                  values={draft.org[r.key]}
                  options={orgOptionsSorted}
                  onChange={(next) => setOrg(r.key, next)}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive mt-3">{error}</p>
          )}

          <DialogFooter className="mt-4 gap-2 sm:justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={() => setResetConfirmOpen(true)} disabled={saving}>
              <RotateCcw className="mr-2 h-3 w-3" />
              Reset to auto-detect
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to auto-detect?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces all current mappings in this dialog with Bravoro's auto-detected defaults
              based on your CRM field labels. You'll still need to click <strong>Save</strong> to commit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetConfirmed}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
