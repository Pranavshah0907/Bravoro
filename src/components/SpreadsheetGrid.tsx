import { useState, useRef, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, Play, X, Check, Search, Plus, ChevronRight, Clipboard,
  Pencil, FolderOpen, ChevronDown, FileSpreadsheet, ExternalLink,
  Save, Upload, Download, Trash2,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────
const SENIORITY_LEVELS = [
  "Owner","Partner","C-Suite (CXO)","VP","SVP","EVP","Director",
  "Senior Manager","Manager","Team Lead","Senior","Mid-Level","Entry Level","Intern","Training",
];

const LINKEDIN_FUNCTIONS = [
  "Accounting","Administrative","Arts and Design","Business Development",
  "Community and Social Services","Consulting","Education","Engineering",
  "Entrepreneurship","Finance","Healthcare Services","Human Resources",
  "Information Technology","Legal","Marketing","Media and Communication",
  "Military and Protective Services","Operations","Product Management",
  "Program and Project Management","Purchasing","Quality Assurance",
  "Real Estate","Research","Sales","Support",
].sort();

const JOB_SENIORITY_PRESETS = [
  "Internship","Entry level","Associate","Mid-Senior level","Director","Executive",
];

const ROWS_DEFAULT = 20;
const ROWS_MAX     = 100;

// ── Types ──────────────────────────────────────────────────────────────────────
type ColKey =
  | "orgName" | "orgLocations" | "orgDomains"
  | "personFunctions" | "personSeniorities" | "personJobTitle" | "resultsPerTitle"
  | "toggleJobSearch" | "jobTitle" | "jobSeniority" | "datePosted";

interface ColDef {
  key:          ColKey;
  label:        string;
  width:        number;
  type:         "text" | "number" | "yesno" | "picker-multi";
  options?:     string[];
  placeholder?: string;
}

type GridRow = Record<ColKey, string>;

interface DraftMeta {
  id:         string;
  name:       string;
  row_count:  number;
  updated_at: string;
}

const INITIAL_WIDTHS: Record<ColKey, number> = {
  orgName: 180, orgLocations: 140, orgDomains: 140,
  personFunctions: 155, personSeniorities: 155, personJobTitle: 150, resultsPerTitle: 90,
  toggleJobSearch: 80, jobTitle: 150, jobSeniority: 125, datePosted: 90,
};

const COLS: ColDef[] = [
  { key: "orgName",           label: "Organization Name",      width: 180, type: "text",         placeholder: "Acme Corp" },
  { key: "orgLocations",      label: "Organization Locations", width: 140, type: "text",         placeholder: "United States" },
  { key: "orgDomains",        label: "Organization Domains",   width: 140, type: "text",         placeholder: "acme.com" },
  { key: "personFunctions",   label: "Person Functions",       width: 155, type: "picker-multi", options: LINKEDIN_FUNCTIONS },
  { key: "personSeniorities", label: "Person Seniorities",     width: 155, type: "picker-multi", options: SENIORITY_LEVELS },
  { key: "personJobTitle",    label: "Person Job Title",       width: 150, type: "text",         placeholder: "e.g. Account Executive" },
  { key: "resultsPerTitle",   label: "Results / Title",        width: 90,  type: "number",       placeholder: "3" },
  { key: "toggleJobSearch",   label: "Job Search",             width: 80,  type: "yesno" },
  { key: "jobTitle",          label: "Job Title",              width: 150, type: "text",         placeholder: "Sales Manager" },
  { key: "jobSeniority",      label: "Job Seniority",          width: 125, type: "picker-multi", options: JOB_SENIORITY_PRESETS },
  { key: "datePosted",        label: "Date (days)",            width: 90,  type: "number",       placeholder: "0" },
];

const emptyRow = (): GridRow => ({
  orgName: "", orgLocations: "", orgDomains: "",
  personFunctions: "", personSeniorities: "", personJobTitle: "",
  resultsPerTitle: "3", toggleJobSearch: "No",
  jobTitle: "", jobSeniority: "", datePosted: "0",
});

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Component ──────────────────────────────────────────────────────────────────
interface SpreadsheetGridProps { userId: string; userEmail?: string; }

export const SpreadsheetGrid = ({ userId, userEmail = "" }: SpreadsheetGridProps) => {
  const { toast } = useToast();

  // ── Grid state ───────────────────────────────────────────────────────────────
  const [rows,       setRows]       = useState<GridRow[]>(() => Array.from({ length: ROWS_DEFAULT }, emptyRow));
  const [active,     setActive]     = useState<{ r: number; c: number } | null>(null);
  const [editing,    setEditing]    = useState(false);
  const [pickerQ,    setPickerQ]    = useState("");
  const [colWidths,  setColWidths]  = useState<Record<ColKey, number>>(() => ({ ...INITIAL_WIDTHS }));
  const [submitting, setSubmitting] = useState(false);

  // ── Draft state ──────────────────────────────────────────────────────────────
  const [draftId,        setDraftId]        = useState<string | null>(null);
  const [draftName,      setDraftName]      = useState("Untitled Draft");
  const [draftStatus,    setDraftStatus]    = useState<"idle"|"dirty"|"saving"|"saved">("idle");
  const [renamingDraft,  setRenamingDraft]  = useState(false);
  const [draftRenameVal, setDraftRenameVal] = useState("");
  const [drafts,         setDrafts]         = useState<DraftMeta[]>([]);
  const [showDrafts,     setShowDrafts]     = useState(false);
  const [showSheetsMenu, setShowSheetsMenu] = useState(false);
  const [draftSaving,    setDraftSaving]    = useState(false);

  // ── Sheets modal state ───────────────────────────────────────────────────────
  const [sheetsModal,    setSheetsModal]    = useState<"closed"|"export"|"import">("closed");
  const [sheetsStep,     setSheetsStep]     = useState<"form"|"done">("form");
  const [sheetsName,     setSheetsName]     = useState("");
  const [sheetsUseOwn,   setSheetsUseOwn]   = useState(true);
  const [sheetsEmail,    setSheetsEmail]    = useState("");
  const [sheetsLoading,  setSheetsLoading]  = useState(false);
  const [sheetsUrl,      setSheetsUrl]      = useState("");
  const [importUrl,      setImportUrl]      = useState("");
  const [importLoading,  setImportLoading]  = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const containerRef   = useRef<HTMLDivElement>(null);
  const tableWrapRef   = useRef<HTMLDivElement>(null);
  const pickerInputRef = useRef<HTMLInputElement>(null);
  const inputRefs      = useRef<Map<string, HTMLInputElement>>(new Map());
  const resizingRef    = useRef<{ key: ColKey; startX: number; startW: number } | null>(null);
  const draftRenameRef = useRef<HTMLInputElement>(null);
  const toolbarRef     = useRef<HTMLDivElement>(null);
  // Refs for auto-save (avoids stale closure in setTimeout)
  const rowsRef        = useRef(rows);
  const draftIdRef     = useRef(draftId);
  const draftNameRef   = useRef(draftName);
  const draftStatusRef = useRef(draftStatus);
  const skipDirtyRef   = useRef(true); // skip first render + explicit loads
  rowsRef.current      = rows;
  draftIdRef.current   = draftId;
  draftNameRef.current = draftName;
  draftStatusRef.current = draftStatus;

  const setInputRef = (r: number, c: number) => (el: HTMLInputElement | null) => {
    if (el) inputRefs.current.set(`${r}-${c}`, el);
    else    inputRefs.current.delete(`${r}-${c}`);
  };

  const focusCell = useCallback((r: number, c: number) => {
    const el = inputRefs.current.get(`${r}-${c}`);
    if (el) { el.focus(); const l = el.value.length; el.setSelectionRange(l, l); }
  }, []);

  // ── Effects ──────────────────────────────────────────────────────────────────

  // Mark dirty when rows change (but not on first render or explicit loads)
  useEffect(() => {
    if (skipDirtyRef.current) { skipDirtyRef.current = false; return; }
    if (draftIdRef.current) setDraftStatus("dirty");
  }, [rows]);

  // Auto-save: 30s after last change when a draftId exists
  useEffect(() => {
    if (!draftId || draftStatus !== "dirty") return;
    const t = setTimeout(() => {
      if (draftIdRef.current && draftStatusRef.current === "dirty") doAutoSave();
    }, 30_000);
    return () => clearTimeout(t);
  }, [rows, draftId, draftStatus]);

  // Close dropdowns on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowDrafts(false);
        setShowSheetsMenu(false);
      }
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActive(null);
        setEditing(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => { setPickerQ(""); }, [active?.c]);

  // ── Auto-save (reads from refs to avoid stale closure) ───────────────────────
  const doAutoSave = async () => {
    const id   = draftIdRef.current;
    const name = draftNameRef.current;
    const data = rowsRef.current.map(r => ({ ...r }));
    const rc   = data.filter(r => r.orgName.trim()).length;
    if (!id || rc === 0) return;
    setDraftStatus("saving");
    try {
      await supabase.from("bulk_search_drafts")
        .update({ name, grid_data: data, row_count: rc, updated_at: new Date().toISOString() })
        .eq("id", id);
      setDraftStatus("saved");
    } catch { setDraftStatus("dirty"); }
  };

  // ── Draft CRUD ────────────────────────────────────────────────────────────────
  const saveDraft = async () => {
    const data  = rows.map(r => ({ ...r }));
    const rc    = validCount;
    setDraftSaving(true);
    try {
      if (draftId) {
        await supabase.from("bulk_search_drafts")
          .update({ name: draftName, grid_data: data, row_count: rc, updated_at: new Date().toISOString() })
          .eq("id", draftId);
        setDraftStatus("saved");
        toast({ title: "Draft saved", description: `"${draftName}" updated` });
      } else {
        const { data: rec, error } = await supabase.from("bulk_search_drafts")
          .insert({ user_id: userId, name: draftName, grid_data: data, row_count: rc })
          .select().single();
        if (error) throw error;
        setDraftId(rec.id);
        setDraftStatus("saved");
        toast({ title: "Draft saved", description: `"${draftName}" saved` });
      }
    } catch {
      toast({ title: "Save failed", description: "Could not save draft", variant: "destructive" });
    } finally { setDraftSaving(false); }
  };

  const fetchDrafts = async () => {
    const { data } = await supabase.from("bulk_search_drafts")
      .select("id, name, row_count, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(30);
    if (data) setDrafts(data as DraftMeta[]);
  };

  const loadDraft = async (draft: DraftMeta) => {
    if (validCount > 0 && draftId !== draft.id) {
      if (!window.confirm("Load this draft? Unsaved changes to the current grid will be lost.")) return;
    }
    const { data } = await supabase.from("bulk_search_drafts")
      .select("grid_data").eq("id", draft.id).single();
    if (data?.grid_data) {
      skipDirtyRef.current = true;
      setRows(data.grid_data as GridRow[]);
      setDraftId(draft.id);
      setDraftName(draft.name);
      setDraftStatus("saved");
      setActive(null);
      setEditing(false);
      setShowDrafts(false);
    }
  };

  const deleteDraft = async (id: string) => {
    if (!window.confirm("Delete this draft? This cannot be undone.")) return;
    await supabase.from("bulk_search_drafts").delete().eq("id", id);
    setDrafts(prev => prev.filter(d => d.id !== id));
    if (draftId === id) { setDraftId(null); setDraftName("Untitled Draft"); setDraftStatus("idle"); }
  };

  const commitRename = () => {
    const name = draftRenameVal.trim() || draftName;
    setDraftName(name);
    setRenamingDraft(false);
    if (draftId) setDraftStatus("dirty"); // trigger save on next auto-save
  };

  // ── Google Sheets ─────────────────────────────────────────────────────────────
  const openExportModal = () => {
    const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    setSheetsName(draftName !== "Untitled Draft" ? draftName : `Bravoro Bulk Search · ${today}`);
    setSheetsUseOwn(true);
    setSheetsEmail("");
    setSheetsStep("form");
    setSheetsUrl("");
    setSheetsModal("export");
    setShowSheetsMenu(false);
  };

  const openImportModal = () => {
    setImportUrl("");
    setSheetsModal("import");
    setShowSheetsMenu(false);
  };

  const handleExportToSheets = async () => {
    const email = sheetsUseOwn ? userEmail : sheetsEmail.trim();
    if (!email) {
      toast({ title: "Email required", description: "Enter a Google email to share the sheet with.", variant: "destructive" });
      return;
    }
    const filledRows = rows.filter(r => r.orgName.trim());
    if (!filledRows.length) {
      toast({ title: "No data", description: "Add at least one company first.", variant: "destructive" });
      return;
    }
    setSheetsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("export-to-google-sheet", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { sheetName: sheetsName || "Bravoro Bulk Search", userEmail: email, rows: filledRows },
      });
      if (error) throw new Error(error.message);
      if (!data?.url) throw new Error("No URL returned");
      setSheetsUrl(data.url);
      setSheetsStep("done");
      if (data.shareError) {
        toast({
          title: "Sheet created (sharing may have failed)",
          description: "Open the link and request access if needed.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : "Please try again", variant: "destructive" });
    } finally { setSheetsLoading(false); }
  };

  const handleImportFromSheet = async () => {
    if (!importUrl.trim()) return;
    setImportLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("import-google-sheet", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { action: "preview", sheetUrl: importUrl.trim() },
      });
      if (error) throw new Error(error.message);
      if (!data?.rows) throw new Error("No data returned from sheet");
      skipDirtyRef.current = true;
      // Pad to ROWS_DEFAULT
      const imported: GridRow[] = data.rows;
      while (imported.length < ROWS_DEFAULT) imported.push(emptyRow());
      setRows(imported);
      setSheetsModal("closed");
      setImportUrl("");
      if (draftId) setDraftStatus("dirty");
      toast({ title: "Imported!", description: `${data.rowCount} rows loaded from Google Sheets` });
    } catch (err) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "Make sure the sheet is publicly viewable", variant: "destructive" });
    } finally { setImportLoading(false); }
  };

  // ── Grid helpers ─────────────────────────────────────────────────────────────
  const setCell = (r: number, k: ColKey, v: string) =>
    setRows(p => p.map((row, i) => i === r ? { ...row, [k]: v } : row));

  // Column resize
  const startResize = (e: React.MouseEvent, key: ColKey) => {
    e.preventDefault(); e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startW: colWidths[key] };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const newW = Math.max(48, resizingRef.current.startW + ev.clientX - resizingRef.current.startX);
      setColWidths(prev => ({ ...prev, [resizingRef.current!.key]: newW }));
    };
    const onUp = () => {
      resizingRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Keyboard navigation
  const navigate = (r: number, c: number, dr: number, dc: number) => {
    const nr = r + dr; const nc = c + dc;
    if (nr < 0 || nr >= rows.length || nc < 0 || nc >= COLS.length) return;
    setActive({ r: nr, c: nc }); setEditing(false);
    setTimeout(() => focusCell(nr, nc), 0);
  };

  const handleCellKeyDown = (e: React.KeyboardEvent, r: number, c: number) => {
    const col = COLS[c];
    if (e.key === "F2")     { e.preventDefault(); setEditing(prev => !prev); return; }
    if (e.key === "Escape") { e.preventDefault(); setEditing(false); return; }
    if (e.key === "Tab")    { e.preventDefault(); navigate(r, c, 0, e.shiftKey ? -1 : 1); return; }
    if (e.key === "Enter")  { e.preventDefault(); navigate(r, c, 1, 0); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); navigate(r, c, -1, 0); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); navigate(r, c,  1, 0); return; }
    const inTextEdit = editing && (col.type === "text" || col.type === "number");
    if (!inTextEdit) {
      if (e.key === "ArrowLeft")  { e.preventDefault(); navigate(r, c, 0, -1); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); navigate(r, c, 0,  1); return; }
    }
  };

  // Paste (TSV from Excel)
  const handlePaste = (e: React.ClipboardEvent) => {
    if (!active || !tableWrapRef.current) return;
    if (!tableWrapRef.current.contains(e.target as Node)) return;
    if (COLS[active.c]?.type === "yesno") return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    const pastedRows = text.trim().split(/\r?\n/).map(r => r.split("\t"));
    setRows(prev => {
      const next = [...prev];
      pastedRows.forEach((pr, dr) => {
        const ri = active.r + dr;
        if (ri >= ROWS_MAX) return;
        while (next.length <= ri) next.push(emptyRow());
        const row = { ...next[ri] };
        pr.forEach((val, dc) => { const ci = active.c + dc; if (ci < COLS.length) row[COLS[ci].key] = val.trim(); });
        next[ri] = row;
      });
      return next.slice(0, ROWS_MAX);
    });
  };

  // Picker
  const activePicker = active ? COLS[active.c] : null;
  const showPicker   = activePicker?.type === "picker-multi";

  const getSelected = (): string[] => {
    if (!active || !activePicker) return [];
    const v = rows[active.r]?.[activePicker.key] ?? "";
    return v ? v.split(",").map(s => s.trim()).filter(Boolean) : [];
  };

  const getFiltered = (): string[] => {
    if (!activePicker?.options) return [];
    const q = pickerQ.toLowerCase();
    return q ? activePicker.options.filter(o => o.toLowerCase().includes(q)) : [...activePicker.options];
  };

  const toggleItem = (item: string) => {
    if (!active || !activePicker) return;
    const sel  = getSelected();
    const next = sel.includes(item) ? sel.filter(s => s !== item) : [...sel, item];
    setCell(active.r, activePicker.key, next.join(", "));
  };

  const addCustomItem = () => {
    const custom = pickerQ.trim();
    if (!custom || !active || !activePicker) return;
    const sel = getSelected();
    if (!sel.includes(custom)) setCell(active.r, activePicker.key, [...sel, custom].join(", "));
    setPickerQ("");
  };

  // Submit
  const handleSubmit = async () => {
    const valid = rows.filter(r => r.orgName.trim());
    if (!valid.length) {
      toast({ title: "No Data", description: "Add at least one company name.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const mainData = valid.map((r, idx) => ({
        "Sr No":                       idx + 1,
        "Organization Name":           r.orgName.trim(),
        "Organization Locations":      r.orgLocations.trim(),
        "Organization Domains":        r.orgDomains.trim(),
        "Person Functions":            r.personFunctions.trim(),
        "Person Seniorities / Titles": r.personSeniorities.trim(),
        "Person Job Title":            r.personJobTitle.trim(),
        "Results per title":           parseInt(r.resultsPerTitle) || 3,
        "Toggle job search":           r.toggleJobSearch || "No",
        "Job Title (comma separated)": r.jobTitle.trim(),
        "Job Seniority":               r.jobSeniority.trim(),
        "Date Posted (max age days)":  parseInt(r.datePosted) || 0,
      }));

      const { data: search, error: se } = await supabase
        .from("searches")
        .insert({ user_id: userId, search_type: "bulk", excel_file_name: `grid_${valid.length}_companies`, status: "processing" })
        .select().single();
      if (se) throw se;

      const { data: { session } } = await supabase.auth.getSession();
      const { error: we } = await supabase.functions.invoke("trigger-n8n-webhook", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { searchId: search.id, entryType: "bulk_upload", searchData: { search_id: search.id, data: { Main_Data: mainData } } },
      });
      if (we) {
        toast({ title: "Processing Failed", description: "Couldn't reach the processing server.", variant: "destructive" });
        return;
      }

      // Auto-delete draft on successful submit
      if (draftId) {
        await supabase.from("bulk_search_drafts").delete().eq("id", draftId);
        setDraftId(null); setDraftName("Untitled Draft"); setDraftStatus("idle");
      }

      toast({ title: "Processing Started", description: `${valid.length} ${valid.length === 1 ? "company" : "companies"} queued. You'll get an email when results are ready.` });
      skipDirtyRef.current = true;
      setRows(Array.from({ length: ROWS_DEFAULT }, emptyRow));
      setActive(null);
    } catch (err) {
      toast({ title: "Processing Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const validCount = rows.filter(r => r.orgName.trim()).length;
  const selected   = getSelected();
  const filtered   = getFiltered();

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .sg-input::placeholder { color: #b0c8c8; }
        .sg-input:focus::placeholder { color: #c5d8d8; }
        .sg-picker-input::placeholder { color: #9ab8b8; }
        .sg-input:focus { outline: none; }
      `}</style>

      <div ref={containerRef} onPaste={handlePaste} className="space-y-3">

        {/* ── Draft & Sheets Toolbar ───────────────────────────────────────── */}
        <div
          ref={toolbarRef}
          className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: "#f4fcfc", border: "1px solid #c8e2e2" }}
        >
          {/* Draft name */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <div className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: "#009da5" }} />
            {renamingDraft ? (
              <input
                ref={draftRenameRef}
                value={draftRenameVal}
                onChange={e => setDraftRenameVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingDraft(false); }}
                onBlur={commitRename}
                className="text-[12px] font-semibold bg-transparent outline-none border-b min-w-[120px] max-w-[220px]"
                style={{ color: "#007980", borderColor: "#009da5" }}
              />
            ) : (
              <button
                onClick={() => { setDraftRenameVal(draftName); setRenamingDraft(true); setTimeout(() => draftRenameRef.current?.focus(), 0); }}
                className="flex items-center gap-1 text-[12px] font-semibold transition-colors truncate max-w-[200px]"
                style={{ color: "#007980" }}
                title="Click to rename"
              >
                <span className="truncate">{draftName}</span>
                <Pencil className="h-2.5 w-2.5 shrink-0 opacity-60" />
              </button>
            )}

            {/* Status indicator */}
            <div className="flex items-center gap-1 ml-1 shrink-0">
              <div className={`w-1.5 h-1.5 rounded-full ${
                draftStatus === "saved"   ? "bg-green-400" :
                draftStatus === "saving"  ? "bg-amber-400 animate-pulse" :
                draftStatus === "dirty"   ? "bg-amber-400" :
                "bg-[#c8e2e2]"
              }`} />
              <span className="text-[10px]" style={{ color: "#9abcbc" }}>
                {draftStatus === "saved"  ? "Saved" :
                 draftStatus === "saving" ? "Saving…" :
                 draftStatus === "dirty"  ? "Unsaved" :
                 draftId ? "" : "Not saved"}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">

            {/* Drafts dropdown */}
            <div className="relative">
              <button
                onClick={() => { setShowDrafts(p => !p); setShowSheetsMenu(false); if (!showDrafts) fetchDrafts(); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                style={{ color: "#5a8888", border: "1px solid #daeaea", background: showDrafts ? "#e8f7f7" : "#fff" }}
              >
                <FolderOpen className="h-3 w-3" />
                <span>Drafts</span>
                <ChevronDown className="h-2.5 w-2.5" />
              </button>

              {showDrafts && (
                <div
                  className="absolute top-full mt-1.5 right-0 z-50 rounded-xl overflow-hidden"
                  style={{ background: "#fff", border: "1px solid #c8e2e2", boxShadow: "0 8px 32px rgba(0,157,165,0.12)", width: 280 }}
                >
                  <div className="px-3 py-2 border-b" style={{ borderColor: "#daeaea", background: "#f4fcfc" }}>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#007980" }}>Saved Drafts</span>
                  </div>
                  {drafts.length === 0 ? (
                    <div className="px-3 py-5 text-center text-[12px]" style={{ color: "#9abcbc" }}>No drafts saved yet</div>
                  ) : (
                    <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
                      {drafts.map(d => (
                        <div key={d.id} className="flex items-center gap-2 px-3 py-2.5 border-b hover:bg-[#f4fcfc] transition-colors group" style={{ borderColor: "#f0f5f5" }}>
                          <div className="flex-1 min-w-0" onClick={() => loadDraft(d)} style={{ cursor: "pointer" }}>
                            <div className="text-[12px] font-semibold truncate" style={{ color: "#1a2e2e" }}>{d.name}</div>
                            <div className="text-[10px] mt-0.5" style={{ color: "#9abcbc" }}>
                              {d.row_count} {d.row_count === 1 ? "row" : "rows"} · {formatRelativeTime(d.updated_at)}
                            </div>
                          </div>
                          <button
                            onClick={() => loadDraft(d)}
                            className="shrink-0 px-2 py-1 rounded text-[10px] font-semibold transition-colors opacity-0 group-hover:opacity-100"
                            style={{ color: "#007980", background: "#e8f7f7" }}
                          >Load</button>
                          <button
                            onClick={() => deleteDraft(d.id)}
                            className="shrink-0 p-1 rounded transition-colors opacity-0 group-hover:opacity-100 hover:text-red-500"
                            style={{ color: "#b0cccc" }}
                          ><Trash2 className="h-3 w-3" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Save Draft */}
            <button
              onClick={saveDraft}
              disabled={draftSaving}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
              style={{ color: "#007980", border: "1px solid #daeaea", background: "#fff" }}
            >
              {draftSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              <span>Save Draft</span>
            </button>

            {/* Sheets dropdown */}
            <div className="relative">
              <button
                onClick={() => { setShowSheetsMenu(p => !p); setShowDrafts(false); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
                style={{ color: "#fff", background: "#009da5", border: "1px solid #007980" }}
              >
                <FileSpreadsheet className="h-3 w-3" />
                <span>Sheets</span>
                <ChevronDown className="h-2.5 w-2.5" />
              </button>

              {showSheetsMenu && (
                <div
                  className="absolute top-full mt-1.5 right-0 z-50 rounded-xl overflow-hidden"
                  style={{ background: "#fff", border: "1px solid #c8e2e2", boxShadow: "0 8px 32px rgba(0,157,165,0.12)", width: 220 }}
                >
                  <button
                    onClick={openExportModal}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left text-[12px] transition-colors hover:bg-[#f4fcfc]"
                    style={{ color: "#1a2e2e", borderBottom: "1px solid #f0f5f5" }}
                  >
                    <Upload className="h-3.5 w-3.5 shrink-0" style={{ color: "#009da5" }} />
                    <div>
                      <div className="font-semibold">Export to Google Sheets</div>
                      <div className="text-[10px] mt-0.5" style={{ color: "#9abcbc" }}>Share grid as a Google Sheet</div>
                    </div>
                  </button>
                  <button
                    onClick={openImportModal}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left text-[12px] transition-colors hover:bg-[#f4fcfc]"
                    style={{ color: "#1a2e2e" }}
                  >
                    <Download className="h-3.5 w-3.5 shrink-0" style={{ color: "#009da5" }} />
                    <div>
                      <div className="font-semibold">Import from Google Sheets</div>
                      <div className="text-[10px] mt-0.5" style={{ color: "#9abcbc" }}>Pull data back from a sheet</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Hint bar ─────────────────────────────────────────────────────── */}
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1">
          <div className="flex items-center gap-1.5">
            <Clipboard className="h-3 w-3 text-[#009da5]" />
            <span className="text-[11px] text-[#4a7878]">Click a cell · paste from Excel or Google Sheets</span>
          </div>
          <span className="text-[#2a5050]">·</span>
          <div className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#009da5]" />
            <span className="text-[11px] text-[#4a7878]">teal columns open picker · arrow keys navigate · double-click to edit</span>
          </div>
          {validCount > 0 && (
            <><span className="text-[#2a5050]">·</span>
            <span className="text-[11px] font-semibold text-[#58dddd]">{validCount} {validCount === 1 ? "row" : "rows"} filled</span></>
          )}
        </div>

        {/* ── Grid + Picker ─────────────────────────────────────────────────── */}
        <div className="flex gap-3 items-start">

          {/* Table */}
          <div
            ref={tableWrapRef}
            className="flex-1 min-w-0 rounded-xl overflow-auto"
            style={{ maxHeight: 540, background: "#ffffff", border: "1px solid #c8e2e2", boxShadow: "0 4px 24px rgba(0,157,165,0.10), 0 1px 4px rgba(0,0,0,0.06)" }}
          >
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 44 + Object.values(colWidths).reduce((s, w) => s + w, 0), tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 44 }} />
                {COLS.map(c => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-30 text-center border-b border-r" style={{ height: 36, padding: 0, background: "#edf6f6", borderColor: "#c8e2e2" }}>
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#7aacac" }}>#</span>
                  </th>
                  {COLS.map(col => {
                    const isPicker = col.type === "picker-multi";
                    return (
                      <th key={col.key} className="sticky top-0 z-20 text-left border-b border-r" style={{ height: 36, background: "#edf6f6", borderColor: "#c8e2e2", position: "relative", padding: 0, overflow: "visible" }}>
                        <div className="flex items-center gap-1.5 pl-2.5 pr-4 h-full overflow-hidden">
                          <span className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color: isPicker ? "#007980" : "#5a8888" }}>{col.label}</span>
                          {isPicker && <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: "#009da5", opacity: 0.8 }} />}
                        </div>
                        <div className="absolute right-0 top-0 h-full flex items-center justify-center group/rh" style={{ width: 8, cursor: "col-resize", zIndex: 1 }} onMouseDown={e => startResize(e, col.key)}>
                          <div className="h-3/5 rounded-full transition-colors duration-150 group-hover/rh:bg-[#009da5]" style={{ width: 2, background: "#c8e2e2" }} />
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => {
                  const isActiveRow = active?.r === ri;
                  const rowBg = isActiveRow ? "#f0fafa" : ri % 2 === 0 ? "#ffffff" : "#fafefe";
                  return (
                    <tr key={ri} style={{ background: rowBg }}>
                      <td className="sticky left-0 z-10 border-r border-b text-center" style={{ height: 32, background: isActiveRow ? "#e4f4f4" : "#f5fafa", padding: 0, borderColor: "#daeaea" }}>
                        <span className="text-[11px] font-semibold tabular-nums" style={{ color: "#9abcbc" }}>{ri + 1}</span>
                      </td>
                      {COLS.map((col, ci) => {
                        const isActive = active?.r === ri && active?.c === ci;
                        const isPicker = col.type === "picker-multi";
                        const hasValue = !!row[col.key].trim();
                        const isEditing = isActive && editing;
                        return (
                          <td key={col.key} className="relative p-0 border-b border-r" style={{ height: 32, borderColor: "#daeaea", background: isPicker && hasValue && !isActive ? "rgba(0,157,165,0.04)" : undefined, ...(isActive ? { outline: isEditing ? "1px solid #009da5" : "3px solid #009da5", outlineOffset: isEditing ? "-1px" : "-3px", position: "relative", zIndex: 20 } : {}) }}
                            onClick={() => { setActive({ r: ri, c: ci }); setEditing(false); if (col.type === "yesno") { setCell(ri, col.key, row[col.key] === "Yes" ? "No" : "Yes"); } else { setTimeout(() => inputRefs.current.get(`${ri}-${ci}`)?.focus(), 0); } }}
                            onDoubleClick={() => {
                              if (col.type === "yesno") return;
                              if (col.key === "personJobTitle") {
                                const fns = row.personFunctions ? row.personFunctions.split(",").map(s => s.trim()).filter(Boolean) : [];
                                if (fns.length > 1) {
                                  toast({ title: "Too many Person Functions", description: "Person Job Title requires 0 or 1 Person Function. Remove extra functions first.", variant: "destructive" });
                                  return;
                                }
                              }
                              setActive({ r: ri, c: ci }); setEditing(true); setTimeout(() => { const el = inputRefs.current.get(`${ri}-${ci}`); if (el) { el.focus(); const l = el.value.length; el.setSelectionRange(l, l); } }, 0);
                            }}
                          >
                            {col.type === "yesno" ? (
                              <div className="w-full h-full flex items-center justify-center cursor-pointer select-none">
                                <span className="text-[11px] font-bold tracking-wider" style={{ color: row[col.key] === "Yes" ? "#007980" : "#b0c8c8" }}>{row[col.key] === "Yes" ? "YES" : "NO"}</span>
                              </div>
                            ) : isPicker ? (
                              <div className="relative flex items-center w-full h-full">
                                <input ref={setInputRef(ri, ci)} type="text" value={row[col.key]} readOnly={!isEditing} onChange={e => setCell(ri, col.key, e.target.value)} onFocus={() => setActive({ r: ri, c: ci })} onKeyDown={e => handleCellKeyDown(e, ri, ci)} placeholder={isActive ? (isEditing ? "type or use picker…" : "double-click to edit") : ""} className="sg-input w-full h-full bg-transparent outline-none border-none pl-2.5 pr-7 text-[12px] cursor-default" style={{ color: "#007980", caretColor: isEditing ? "#009da5" : "transparent" }} />
                                <ChevronRight className="absolute right-1.5 h-3 w-3 shrink-0 pointer-events-none transition-colors" style={{ color: isActive ? "#009da5" : "#b0d0d0" }} />
                              </div>
                            ) : (
                              <input ref={setInputRef(ri, ci)} type="text" value={row[col.key]} readOnly={!isEditing} onChange={e => setCell(ri, col.key, e.target.value)} onFocus={() => setActive({ r: ri, c: ci })} onKeyDown={e => handleCellKeyDown(e, ri, ci)} placeholder={isActive ? (isEditing ? (col.placeholder ?? "") : "double-click to edit") : ""} className="sg-input w-full h-full bg-transparent outline-none border-none px-2.5 text-[12px]" style={{ color: "#1a2e2e", caretColor: isEditing ? "#009da5" : "transparent" }} />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length < ROWS_MAX && (
              <div style={{ borderTop: "1px solid #daeaea" }}>
                <button type="button" onClick={() => setRows(r => [...r, ...Array.from({ length: Math.min(10, ROWS_MAX - r.length) }, emptyRow)])}
                  className="w-full py-2.5 flex items-center justify-center gap-1.5 text-[11px] transition-all duration-200 cursor-pointer hover:bg-[#f0fafa]" style={{ color: "#9abcbc" }}>
                  <Plus className="h-3 w-3" />Add 10 more rows<span className="ml-1" style={{ color: "#c0d8d8" }}>{rows.length}/{ROWS_MAX}</span>
                </button>
              </div>
            )}
          </div>

          {/* Picker panel */}
          {showPicker && activePicker && active && (
            <div className="w-[220px] shrink-0 flex flex-col rounded-xl overflow-hidden" style={{ maxHeight: 540, background: "#ffffff", border: "1px solid #c8e2e2", boxShadow: "0 4px 24px rgba(0,157,165,0.10), 0 1px 4px rgba(0,0,0,0.06)" }}>
              <div className="px-3 pt-3 pb-2.5 shrink-0" style={{ borderBottom: "1px solid #daeaea", background: "#edf6f6" }}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: "#009da5" }} />
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] truncate" style={{ color: "#007980" }}>{activePicker.label}</p>
                </div>
                <p className="text-[10px] pl-[13px]" style={{ color: "#9abcbc" }}>Row {active.r + 1}</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ borderBottom: "1px solid #daeaea", background: "#fafefe" }}>
                <Search className="h-3 w-3 shrink-0" style={{ color: "#9abcbc" }} />
                <input ref={pickerInputRef} value={pickerQ} onChange={e => setPickerQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomItem(); } if (e.key === "Escape") setPickerQ(""); }} placeholder="Search or type + Enter…" className="sg-picker-input flex-1 bg-transparent text-[12px] outline-none" style={{ color: "#1a2e2e" }} />
                {pickerQ && <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setPickerQ("")} style={{ color: "#9abcbc" }}><X className="h-3 w-3" /></button>}
              </div>
              {pickerQ.trim() && !filtered.some(f => f.toLowerCase() === pickerQ.toLowerCase().trim()) && (
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={addCustomItem} className="flex items-center gap-2 px-3 py-2 w-full text-left transition-colors shrink-0 hover:bg-[#e8f7f7]" style={{ borderBottom: "1px solid #daeaea", background: "#f4fcfc", color: "#007980" }}>
                  <Plus className="h-3 w-3 shrink-0" style={{ color: "#009da5" }} />
                  <span className="text-[11px] font-medium">Add "<span className="font-semibold">{pickerQ.trim()}</span>"</span>
                </button>
              )}
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-1 px-2.5 py-2 shrink-0" style={{ borderBottom: "1px solid #daeaea" }}>
                  {selected.map(item => (
                    <span key={item} onMouseDown={e => e.preventDefault()} onClick={() => toggleItem(item)} className="inline-flex items-center gap-1 px-1.5 py-[3px] rounded text-[10px] border cursor-pointer leading-none transition-colors" style={{ background: "rgba(0,157,165,0.08)", color: "#007980", borderColor: "rgba(0,157,165,0.25)" }} onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = "rgba(239,68,68,0.07)"; el.style.color = "#dc2626"; el.style.borderColor = "rgba(239,68,68,0.2)"; }} onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = "rgba(0,157,165,0.08)"; el.style.color = "#007980"; el.style.borderColor = "rgba(0,157,165,0.25)"; }}>
                      {item}<X className="h-[7px] w-[7px]" />
                    </span>
                  ))}
                </div>
              )}
              <div className="flex-1 overflow-y-auto py-0.5">
                {filtered.length === 0 ? (
                  <p className="px-3 py-4 text-[11px] text-center" style={{ color: "#9abcbc" }}>{pickerQ ? "No matches — press Enter to add" : "No options"}</p>
                ) : filtered.map(option => {
                  const isSel = selected.includes(option);
                  return (
                    <button key={option} type="button" onMouseDown={e => e.preventDefault()} onClick={() => toggleItem(option)} className="w-full flex items-center gap-2.5 px-3 py-[7px] text-left transition-colors duration-100" style={{ background: isSel ? "rgba(0,157,165,0.06)" : undefined, color: isSel ? "#007980" : "#2a4a4a" }} onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = "#f0fafa"; }} onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = ""; }}>
                      <div className="w-[13px] h-[13px] rounded-[3px] border shrink-0 flex items-center justify-center transition-all duration-100" style={{ background: isSel ? "#009da5" : "transparent", borderColor: isSel ? "#009da5" : "#b0cccc" }}>
                        {isSel && <Check className="h-[9px] w-[9px] text-white" />}
                      </div>
                      <span className="text-[12px] truncate">{option}</span>
                    </button>
                  );
                })}
              </div>
              {selected.length > 0 && (
                <div style={{ borderTop: "1px solid #daeaea" }} className="shrink-0">
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setCell(active.r, activePicker.key, "")} className="w-full py-2 text-[11px] transition-colors" style={{ color: "#9abcbc" }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#dc2626"; }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#9abcbc"; }}>Clear selection</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Submit row ────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 pt-1">
          <div className="flex-1 min-w-0">
            {validCount > 0 ? (
              <p className="text-[12px] text-[#3d7070]"><span className="text-[#58dddd] font-semibold">{validCount}</span>{" "}{validCount === 1 ? "company" : "companies"} ready to process</p>
            ) : (
              <p className="text-[12px] text-[#2a4545]">Fill at least one company name to run</p>
            )}
          </div>
          <button type="button" onClick={handleSubmit} disabled={submitting || validCount === 0} className="h-11 px-7 rounded-xl font-semibold text-[14px] tracking-wide bg-[#009da5] text-black hover:bg-[#00b2ba] shadow-[0_4px_20px_rgba(0,157,165,0.22)] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.99] cursor-pointer flex items-center gap-2 shrink-0">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Processing…</> : <><Play className="h-4 w-4" />Run Bulk Search</>}
          </button>
        </div>
      </div>

      {/* ── Google Sheets Modal ───────────────────────────────────────────────── */}
      {sheetsModal !== "closed" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(6,25,26,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", width: "100%", maxWidth: 460, boxShadow: "0 24px 80px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,157,165,0.2)" }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ background: "#edf6f6", borderBottom: "1px solid #daeaea" }}>
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="h-4 w-4" style={{ color: "#009da5" }} />
                <span className="text-[14px] font-bold" style={{ color: "#0c2e2e" }}>
                  {sheetsModal === "export" ? "Export to Google Sheets" : "Import from Google Sheets"}
                </span>
              </div>
              <button onClick={() => setSheetsModal("closed")} className="p-1 rounded-lg transition-colors hover:bg-[#daeaea]" style={{ color: "#5a8888" }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Export form */}
            {sheetsModal === "export" && sheetsStep === "form" && (
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#5a8888" }}>Sheet Name</label>
                  <input value={sheetsName} onChange={e => setSheetsName(e.target.value)} placeholder="Bravoro Bulk Search · March 29" className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none" style={{ border: "1px solid #c8e2e2", color: "#1a2e2e", background: "#fafefe" }} onFocus={e => { e.currentTarget.style.borderColor = "#009da5"; }} onBlur={e => { e.currentTarget.style.borderColor = "#c8e2e2"; }} />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "#5a8888" }}>Share with Google Email</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <div onClick={() => setSheetsUseOwn(true)} className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors" style={{ borderColor: sheetsUseOwn ? "#009da5" : "#b0cccc" }}>
                        {sheetsUseOwn && <div className="w-2 h-2 rounded-full" style={{ background: "#009da5" }} />}
                      </div>
                      <span className="text-[12px]" style={{ color: "#1a2e2e" }}>
                        Use my Bravoro email
                        {userEmail && <span className="ml-1.5 font-semibold" style={{ color: "#007980" }}>{userEmail}</span>}
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <div onClick={() => setSheetsUseOwn(false)} className="w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5 transition-colors shrink-0" style={{ borderColor: !sheetsUseOwn ? "#009da5" : "#b0cccc" }}>
                        {!sheetsUseOwn && <div className="w-2 h-2 rounded-full" style={{ background: "#009da5" }} />}
                      </div>
                      <div className="flex-1">
                        <span className="text-[12px]" style={{ color: "#1a2e2e" }}>Use a different Google email</span>
                        {!sheetsUseOwn && (
                          <input value={sheetsEmail} onChange={e => setSheetsEmail(e.target.value)} placeholder="you@gmail.com" className="mt-1.5 w-full px-3 py-2 rounded-lg text-[12px] outline-none" style={{ border: "1px solid #c8e2e2", color: "#1a2e2e", background: "#fafefe" }} onFocus={e => { e.currentTarget.style.borderColor = "#009da5"; }} onBlur={e => { e.currentTarget.style.borderColor = "#c8e2e2"; }} />
                        )}
                      </div>
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-[11px]" style={{ background: "#f4fcfc", border: "1px solid #daeaea", color: "#5a8888" }}>
                  <span>Sheet is created in Bravoro's Google account and shared with you as an editor. It will be publicly viewable so you can sync changes back.</span>
                </div>

                <div className="flex gap-3 pt-1">
                  <button onClick={() => setSheetsModal("closed")} className="flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-colors" style={{ border: "1px solid #daeaea", color: "#5a8888" }}>Cancel</button>
                  <button onClick={handleExportToSheets} disabled={sheetsLoading} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: "#009da5", color: "#fff" }}>
                    {sheetsLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Creating…</> : <><Upload className="h-4 w-4" />Create Sheet</>}
                  </button>
                </div>
              </div>
            )}

            {/* Export result */}
            {sheetsModal === "export" && sheetsStep === "done" && (
              <div className="p-6 space-y-5">
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "#f0fcf0", border: "1px solid #a0d8a0" }}>
                  <Check className="h-5 w-5 shrink-0" style={{ color: "#22c55e" }} />
                  <div>
                    <div className="text-[13px] font-semibold" style={{ color: "#166534" }}>Sheet created!</div>
                    <div className="text-[11px] mt-0.5" style={{ color: "#4ade80" }}>Shared with {sheetsUseOwn ? userEmail : sheetsEmail}</div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#5a8888" }}>Sheet URL</label>
                  <div className="flex items-center gap-2">
                    <input readOnly value={sheetsUrl} className="flex-1 px-3 py-2 rounded-lg text-[11px] outline-none truncate" style={{ border: "1px solid #c8e2e2", color: "#5a8888", background: "#fafefe" }} />
                    <button onClick={() => { navigator.clipboard.writeText(sheetsUrl); toast({ title: "Copied!" }); }} className="px-3 py-2 rounded-lg text-[11px] font-medium transition-colors shrink-0" style={{ border: "1px solid #daeaea", color: "#007980" }}>Copy</button>
                  </div>
                </div>

                <div className="text-[11px] px-3 py-2.5 rounded-lg" style={{ background: "#f4fcfc", border: "1px solid #daeaea", color: "#5a8888" }}>
                  <span className="font-semibold" style={{ color: "#007980" }}>Sync back:</span> Edit the sheet in Google Sheets, then use "Import from Google Sheets" to pull changes back into this grid.
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setSheetsModal("closed")} className="flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-colors" style={{ border: "1px solid #daeaea", color: "#5a8888" }}>Close</button>
                  <a href={sheetsUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors" style={{ background: "#009da5", color: "#fff" }}>
                    <ExternalLink className="h-4 w-4" />Open Sheet
                  </a>
                </div>
              </div>
            )}

            {/* Import form */}
            {sheetsModal === "import" && (
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#5a8888" }}>Google Sheets URL</label>
                  <input value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className="w-full px-3 py-2.5 rounded-lg text-[12px] outline-none" style={{ border: "1px solid #c8e2e2", color: "#1a2e2e", background: "#fafefe" }} onFocus={e => { e.currentTarget.style.borderColor = "#009da5"; }} onBlur={e => { e.currentTarget.style.borderColor = "#c8e2e2"; }} />
                </div>

                <div className="text-[11px] px-3 py-2.5 rounded-lg space-y-1" style={{ background: "#f4fcfc", border: "1px solid #daeaea", color: "#5a8888" }}>
                  <div><span className="font-semibold" style={{ color: "#007980" }}>Tip:</span> If you exported from Bravoro, just paste that URL — it's already set to public view.</div>
                  <div>For other sheets: set sharing to <span className="font-semibold">"Anyone with the link can view"</span>.</div>
                </div>

                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px]" style={{ background: "#fff8f0", border: "1px solid #f0d8b0", color: "#7a5020" }}>
                  <span>⚠️</span><span>This will <span className="font-semibold">replace</span> the current grid data.</span>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setSheetsModal("closed")} className="flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-colors" style={{ border: "1px solid #daeaea", color: "#5a8888" }}>Cancel</button>
                  <button onClick={handleImportFromSheet} disabled={importLoading || !importUrl.trim()} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors" style={{ background: "#009da5", color: "#fff" }}>
                    {importLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Importing…</> : <><Download className="h-4 w-4" />Import Data</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
