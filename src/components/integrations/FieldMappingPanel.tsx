import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Pencil, AlertTriangle } from "lucide-react";
import { supabase, invokeEdgeFunction } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  EditFieldMappingDialog,
  type CustomFieldMappings,
} from "./EditFieldMappingDialog";
import { type FieldOption } from "./FieldMappingRow";

interface Props {
  integrationId: string;
  mapping: CustomFieldMappings;
  onMappingSaved: () => void;
}

interface FieldMetadataRow {
  object_type: "person" | "org";
  fields_json: Array<{ key: string; label: string; isCustom: boolean; type?: string }>;
}

const HEADLINE_ROWS: Array<{
  area: "person" | "org";
  field: string;
  label: string;
}> = [
  { area: "person", field: "email",    label: "Email" },
  { area: "person", field: "linkedin", label: "LinkedIn" },
  { area: "org",    field: "website",  label: "Org website" },
  { area: "org",    field: "industry", label: "Industry" },
];

function autoDetect(personOptions: FieldOption[], orgOptions: FieldOption[]): CustomFieldMappings {
  const WEBSITE_KEYWORDS      = ["website", "webseite", "homepage", "url", "web"];
  const LINKEDIN_KEYWORDS     = ["linkedin"];
  const MOBILE_KEYWORDS       = ["mobile", "cell", "handy"];
  const DIRECT_PHONE_KEYWORDS = ["direct", "dial", "office", "work phone"];
  const DOMAIN_KEYWORDS       = ["domain"];
  const INDUSTRY_KEYWORDS     = ["industry", "branche", "sector", "category", "practice", "specialization"];
  const matches = (label: string, keys: string[]) => keys.some((k) => label.toLowerCase().includes(k));

  const out: CustomFieldMappings = {
    person: {
      firstName: ["first_name"], lastName: ["last_name"], email: ["email"],
      mobilePhone: [], directPhone: [], jobTitle: ["job_title"],
      linkedin: [], website: [],
    },
    org: { name: ["name"], domain: [], website: ["website"], linkedin: [], industry: [] },
  };
  for (const o of personOptions) {
    if (!o.isCustom) continue;
    if (matches(o.label, WEBSITE_KEYWORDS))      out.person.website.push(o.key);
    if (matches(o.label, LINKEDIN_KEYWORDS))     out.person.linkedin.push(o.key);
    if (matches(o.label, MOBILE_KEYWORDS))       out.person.mobilePhone.push(o.key);
    if (matches(o.label, DIRECT_PHONE_KEYWORDS)) out.person.directPhone.push(o.key);
  }
  for (const o of orgOptions) {
    if (!o.isCustom) continue;
    if (matches(o.label, WEBSITE_KEYWORDS))  out.org.website.push(o.key);
    if (matches(o.label, DOMAIN_KEYWORDS))   out.org.domain.push(o.key);
    if (matches(o.label, LINKEDIN_KEYWORDS)) out.org.linkedin.push(o.key);
    if (matches(o.label, INDUSTRY_KEYWORDS)) out.org.industry.push(o.key);
  }
  return out;
}

export function FieldMappingPanel({ integrationId, mapping, onMappingSaved }: Props) {
  const [open, setOpen] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [personOptions, setPersonOptions] = useState<FieldOption[]>([]);
  const [orgOptions, setOrgOptions] = useState<FieldOption[]>([]);
  const { toast } = useToast();

  async function loadMetadata() {
    const { data, error } = await supabase
      .from("integration_field_metadata")
      .select("object_type, fields_json")
      .eq("integration_id", integrationId)
      .returns<FieldMetadataRow[]>();
    if (error || !data) return;
    const personRow = data.find((r) => r.object_type === "person");
    const orgRow = data.find((r) => r.object_type === "org");
    setPersonOptions((personRow?.fields_json ?? []).map((f) => ({
      key: f.key, label: f.label, isCustom: !!f.isCustom,
    })));
    setOrgOptions((orgRow?.fields_json ?? []).map((f) => ({
      key: f.key, label: f.label, isCustom: !!f.isCustom,
    })));
  }

  useEffect(() => {
    void loadMetadata();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationId]);

  const optionByKey = useMemo(() => {
    const m = new Map<string, FieldOption>();
    for (const o of personOptions) m.set(`person:${o.key}`, o);
    for (const o of orgOptions) m.set(`org:${o.key}`, o);
    return m;
  }, [personOptions, orgOptions]);

  function renderHeadlineValue(area: "person" | "org", field: string): React.ReactNode {
    const arr = (mapping[area] as Record<string, string[]>)[field] ?? [];
    if (arr.length === 0) return <span className="text-muted-foreground italic">(unmapped)</span>;
    const first = arr[0];
    const opt = optionByKey.get(`${area}:${first}`);
    const label = opt?.label ?? first;
    const flavor = opt ? (opt.isCustom ? "custom" : "native") : "unknown";
    return (
      <span className="inline-flex items-center gap-1">
        {!opt && <AlertTriangle className="h-3 w-3 text-yellow-600" />}
        <span className="font-medium">{label}</span>
        <span className="text-[10px] uppercase tracking-wide opacity-60">{flavor}</span>
        {arr.length > 1 && <span className="text-xs text-muted-foreground">+{arr.length - 1} more</span>}
      </span>
    );
  }

  async function refreshMetadata() {
    const { data, error } = await invokeEdgeFunction<{ ok: boolean; error?: string }>(
      "crm-refresh-metadata",
      { body: { integration_id: integrationId } }
    );
    if (error || !data?.ok) {
      toast({
        title: "Refresh failed",
        description: data?.error ?? error?.message ?? "Try again.",
        variant: "destructive",
      });
      return;
    }
    await loadMetadata();
    toast({ title: "Fields refreshed" });
  }

  const autoDetected = useMemo(
    () => autoDetect(personOptions, orgOptions),
    [personOptions, orgOptions]
  );

  return (
    <div className="border rounded-md">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Field mapping
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}
        >
          <Pencil className="mr-2 h-3 w-3" />
          Edit
        </Button>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 text-sm">
          {HEADLINE_ROWS.map((r) => (
            <div key={`${r.area}:${r.field}`} className="grid grid-cols-[120px_1fr] gap-2">
              <div className="text-muted-foreground">{r.label}</div>
              <div>{renderHeadlineValue(r.area, r.field)}</div>
            </div>
          ))}
          <div className="text-xs text-muted-foreground pt-1">
            9 more slots mapped — click <strong>Edit</strong> to review.
          </div>
        </div>
      )}

      <EditFieldMappingDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        integrationId={integrationId}
        initialMapping={mapping}
        autoDetected={autoDetected}
        personOptions={personOptions}
        orgOptions={orgOptions}
        onSaved={onMappingSaved}
        onRefreshMetadata={refreshMetadata}
      />
    </div>
  );
}
