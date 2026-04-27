import { useState, useRef, useEffect, useLayoutEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, Play, X, Check, Search, Plus, ChevronRight, Clipboard,
  Pencil, FolderOpen, FileSpreadsheet, ExternalLink,
  Save, Upload, Download, Trash2, Scissors, ClipboardPaste, Copy,
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

export type GridRow = Record<ColKey, string>;

// ── Imperative handle exposed to parent (ExcelUpload) ─────────────────────────
export interface SpreadsheetGridHandle {
  hasUnsavedData:    () => boolean;
  getCurrentDraftId: () => string | null;
  loadRows:          (rows: GridRow[], draftId?: string | null, draftName?: string) => void;
  notifyDraftDeleted:(id: string) => void;
}

const INITIAL_WIDTHS: Record<ColKey, number> = {
  orgName: 180, orgLocations: 140, orgDomains: 140,
  personFunctions: 155, personSeniorities: 155, personJobTitle: 150, resultsPerTitle: 130,
  toggleJobSearch: 80, jobTitle: 150, jobSeniority: 125, datePosted: 90,
};

const COLS: ColDef[] = [
  { key: "orgName",           label: "Organization Name",      width: 180, type: "text",         placeholder: "Acme Corp" },
  { key: "orgLocations",      label: "Organization Locations", width: 140, type: "text",         placeholder: "United States" },
  { key: "orgDomains",        label: "Organization Domains",   width: 140, type: "text",         placeholder: "acme.com" },
  { key: "personFunctions",   label: "Person Functions",       width: 155, type: "picker-multi", options: LINKEDIN_FUNCTIONS },
  { key: "personSeniorities", label: "Person Seniorities",     width: 155, type: "picker-multi", options: SENIORITY_LEVELS },
  { key: "personJobTitle",    label: "Person Job Title",       width: 150, type: "text",         placeholder: "e.g. Account Executive" },
  { key: "resultsPerTitle",   label: "Results per Function",   width: 130, type: "number",       placeholder: "3" },
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

const DEFAULT_ROW = emptyRow();
const ROW_DATA_KEYS: ColKey[] = (Object.keys(DEFAULT_ROW) as ColKey[]).filter(
  k => k !== "resultsPerTitle" && k !== "toggleJobSearch" && k !== "datePosted",
);
const rowHasData = (r: GridRow): boolean =>
  ROW_DATA_KEYS.some(k => r[k] !== DEFAULT_ROW[k]);

// ── Component ──────────────────────────────────────────────────────────────────
interface SpreadsheetGridProps {
  userId:          string;
  userEmail?:      string;
  onOpenManager?:  () => void;
}

export const SpreadsheetGrid = forwardRef<SpreadsheetGridHandle, SpreadsheetGridProps>(
({ userId, userEmail = "", onOpenManager }, ref) => {
  const { toast } = useToast();

  // ── Grid state ───────────────────────────────────────────────────────────────
  const [rows,       setRows]       = useState<GridRow[]>(() => Array.from({ length: ROWS_DEFAULT }, emptyRow));
  const [active,     setActive]     = useState<{ r: number; c: number } | null>(null);
  const [anchor,     setAnchor]     = useState<{ r: number; c: number } | null>(null);
  const [editing,    setEditing]    = useState(false);
  const [pickerQ,    setPickerQ]    = useState("");
  const [colWidths,  setColWidths]  = useState<Record<ColKey, number>>(() => ({ ...INITIAL_WIDTHS }));
  const [submitting,        setSubmitting]        = useState(false);
  const [sessionRestored,   setSessionRestored]   = useState(false);
  const [missingDomainRows, setMissingDomainRows] = useState<Set<number>>(new Set());
  const [invalidLocationRows, setInvalidLocationRows] = useState<Set<number>>(new Set());
  const [copyRange,         setCopyRange]         = useState<{ r1: number; r2: number; c1: number; c2: number } | null>(null);
  const [copyOverlay,       setCopyOverlay]       = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [isCut,             setIsCut]             = useState(false); // true when last copy was a cut
  const [ctxMenu,           setCtxMenu]           = useState<{ x: number; y: number; r: number; c: number } | null>(null);

  // ── Draft state ──────────────────────────────────────────────────────────────
  const [draftId,        setDraftId]        = useState<string | null>(null);
  const [draftName,      setDraftName]      = useState("Untitled Draft");
  const [draftStatus,    setDraftStatus]    = useState<"idle"|"dirty"|"saving"|"saved">("idle");
  const [renamingDraft,  setRenamingDraft]  = useState(false);
  const [draftRenameVal, setDraftRenameVal] = useState("");
  const [draftSaving,    setDraftSaving]    = useState(false);
  const [showSheetsMenu, setShowSheetsMenu] = useState(false);

  // ── Duplicate-name conflict modal state ─────────────────────────────────────
  const [dupConflict, setDupConflict] = useState<{
    existingId: string;
    existingName: string;
    pendingData: GridRow[];
    pendingRc: number;
  } | null>(null);
  const [dupNewName, setDupNewName] = useState("");
  const dupInputRef = useRef<HTMLInputElement>(null);

  // ── Sheets modal state ───────────────────────────────────────────────────────
  const [sheetsModal,    setSheetsModal]    = useState<"closed"|"export"|"import">("closed");
  const [sheetsStep,     setSheetsStep]     = useState<"form"|"done">("form");
  const [sheetsName,     setSheetsName]     = useState("");
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
  const isDraggingRef  = useRef(false);
  const colElsRef      = useRef<Map<ColKey, HTMLElement>>(new Map());
  const tableRef       = useRef<HTMLTableElement>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const draftRenameRef = useRef<HTMLInputElement>(null);
  const toolbarRef     = useRef<HTMLDivElement>(null);
  // Refs for auto-save (avoids stale closure in setTimeout)
  const rowsRef        = useRef(rows);
  const draftIdRef     = useRef(draftId);
  const draftNameRef   = useRef(draftName);
  const draftStatusRef = useRef(draftStatus);
  const skipDirtyRef   = useRef(true); // skip first render + explicit loads
  // Undo history — stores snapshots of rows before each change
  const undoStackRef   = useRef<GridRow[][]>([]);
  const UNDO_LIMIT     = 50;
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
    if (el) el.focus({ preventScroll: false });
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

  // Close dropdowns on outside click; stop drag on mouseup
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowSheetsMenu(false);
      }
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActive(null);
        setAnchor(null);
        setEditing(false);
      }
    };
    const onUp = () => { isDraggingRef.current = false; dragStartPosRef.current = null; };
    const onMove = (e: MouseEvent) => {
      if (!dragStartPosRef.current || isDraggingRef.current) return;
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) isDraggingRef.current = true;
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("mousemove", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("mousemove", onMove);
    };
  }, []);

  useEffect(() => { setPickerQ(""); }, [active?.c]);

  // Close context menu on any click or scroll
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("scroll", close, true); };
  }, [ctxMenu]);

  // Measure actual DOM positions for the copy-range overlay (correct at any zoom/dpi)
  useLayoutEffect(() => {
    if (!copyRange || !tableRef.current) { setCopyOverlay(null); return; }
    const wrapper = tableRef.current.parentElement;
    if (!wrapper) return;
    const firstCell = inputRefs.current.get(`${copyRange.r1}-${copyRange.c1}`)?.closest("td") as HTMLElement | null;
    const lastCell  = inputRefs.current.get(`${copyRange.r2}-${copyRange.c2}`)?.closest("td") as HTMLElement | null;
    if (!firstCell || !lastCell) { setCopyOverlay(null); return; }
    const wRect = wrapper.getBoundingClientRect();
    const fRect = firstCell.getBoundingClientRect();
    const lRect = lastCell.getBoundingClientRect();
    setCopyOverlay({
      top:    fRect.top    - wRect.top,
      left:   fRect.left   - wRect.left,
      width:  lRect.right  - fRect.left,
      height: lRect.bottom - fRect.top,
    });
  }, [copyRange]);

  // ── Session persistence (survives SPA tab switches; blank after full page refresh) ─
  useEffect(() => {
    const key = `sg_session_${userId}`;
    const refreshKey = "sg_was_refresh";
    // If the page was fully refreshed, clear saved session so sheet starts blank
    if (sessionStorage.getItem(refreshKey)) {
      sessionStorage.removeItem(refreshKey);
      sessionStorage.removeItem(key);
    } else {
      const saved = sessionStorage.getItem(key);
      if (saved) {
        try {
          const { rows: r, draftId: did, draftName: dn } = JSON.parse(saved) as {
            rows: GridRow[]; draftId: string | null; draftName: string;
          };
          if (Array.isArray(r) && r.some(row => row.orgName?.trim())) {
            skipDirtyRef.current = true;
            setRows(r);
            if (did) { setDraftId(did); setDraftName(dn ?? "Untitled Draft"); setDraftStatus("saved"); }
          }
        } catch {}
      }
    }
    setSessionRestored(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // mount only

  // Warn on page refresh/close if there's unsaved data; mark refresh so mount clears session
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const hasData = rowsRef.current.some(r => r.orgName.trim());
      if (hasData && draftStatusRef.current !== "saved") {
        sessionStorage.setItem("sg_was_refresh", "1");
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  useEffect(() => {
    if (!sessionRestored) return;
    const key = `sg_session_${userId}`;
    const hasData = rows.some(r => r.orgName.trim()) || !!draftId;
    if (!hasData) { sessionStorage.removeItem(key); return; }
    sessionStorage.setItem(key, JSON.stringify({ rows, draftId, draftName }));
  }, [rows, draftId, draftName, sessionRestored, userId]);

  // ── Auto-save (reads from refs to avoid stale closure) ───────────────────────
  const doAutoSave = async () => {
    const id   = draftIdRef.current;
    const name = draftNameRef.current;
    const data = rowsRef.current.map(r => ({ ...r }));
    const rc   = data.filter(rowHasData).length;
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
    const rc    = data.filter(rowHasData).length;

    if (rc === 0) {
      toast({ title: "Empty sheet", description: "Add some data before saving.", variant: "destructive" });
      return;
    }

    setDraftSaving(true);
    try {
      // Check for duplicate name (exclude current draft if updating)
      const query = supabase
        .from("bulk_search_drafts")
        .select("id, name")
        .eq("user_id", userId)
        .eq("name", draftName)
        .limit(1);
      if (draftId) query.neq("id", draftId);
      const { data: existing } = await query;

      if (existing && existing.length > 0) {
        setDupConflict({ existingId: existing[0].id, existingName: existing[0].name, pendingData: data, pendingRc: rc });
        setDupNewName(draftName);
        setDraftSaving(false);
        setTimeout(() => dupInputRef.current?.select(), 50);
        return;
      }

      if (draftId) {
        await supabase.from("bulk_search_drafts")
          .update({ name: draftName, grid_data: data, row_count: rc, updated_at: new Date().toISOString() })
          .eq("id", draftId);
        setDraftStatus("saved");
        toast({ title: "Draft saved", description: `"${draftName}" updated` });
      } else {
        await insertNewDraft(draftName, data, rc);
      }
    } catch {
      toast({ title: "Save failed", description: "Could not save draft", variant: "destructive" });
    } finally { setDraftSaving(false); }
  };

  const insertNewDraft = async (name: string, data: GridRow[], rc: number) => {
    const { data: rec, error } = await supabase.from("bulk_search_drafts")
      .insert({ user_id: userId, name, grid_data: data, row_count: rc })
      .select().single();
    if (error) throw error;
    setDraftId(rec.id);
    setDraftName(name);
    setDraftStatus("saved");
    toast({ title: "Draft saved", description: `"${name}" saved` });
  };

  const handleDupOverwrite = async () => {
    if (!dupConflict) return;
    setDraftSaving(true);
    try {
      const { existingId, existingName, pendingData, pendingRc } = dupConflict;
      // Delete the old draft we're overwriting, replace with current data
      await supabase.from("bulk_search_drafts")
        .update({ grid_data: pendingData, row_count: pendingRc, updated_at: new Date().toISOString() })
        .eq("id", existingId);
      // If current sheet was also a saved draft (different id), delete it since we merged into the existing one
      if (draftId && draftId !== existingId) {
        await supabase.from("bulk_search_drafts").delete().eq("id", draftId);
      }
      setDraftId(existingId);
      setDraftName(existingName);
      setDraftStatus("saved");
      toast({ title: "Draft saved", description: `"${existingName}" overwritten` });
    } catch {
      toast({ title: "Save failed", description: "Could not overwrite draft", variant: "destructive" });
    } finally { setDraftSaving(false); setDupConflict(null); }
  };

  const handleDupRename = async () => {
    if (!dupConflict) return;
    const newName = dupNewName.trim();
    if (!newName) return;

    // Check the new name isn't also taken (exclude current draft)
    const clashQuery = supabase
      .from("bulk_search_drafts")
      .select("id")
      .eq("user_id", userId)
      .eq("name", newName)
      .limit(1);
    if (draftId) clashQuery.neq("id", draftId);
    const { data: clash } = await clashQuery;
    if (clash && clash.length > 0) {
      toast({ title: "Name also taken", description: `"${newName}" already exists. Choose a different name.`, variant: "destructive" });
      return;
    }

    setDraftSaving(true);
    try {
      if (draftId) {
        // Existing draft — just update its name + data
        await supabase.from("bulk_search_drafts")
          .update({ name: newName, grid_data: dupConflict.pendingData, row_count: dupConflict.pendingRc, updated_at: new Date().toISOString() })
          .eq("id", draftId);
        setDraftName(newName);
        setDraftStatus("saved");
        toast({ title: "Draft saved", description: `"${newName}" saved` });
      } else {
        await insertNewDraft(newName, dupConflict.pendingData, dupConflict.pendingRc);
      }
    } catch {
      toast({ title: "Save failed", description: "Could not save draft", variant: "destructive" });
    } finally { setDraftSaving(false); setDupConflict(null); }
  };

  // ── Imperative handle (used by ExcelUpload/SheetsManager) ───────────────────
  useImperativeHandle(ref, () => ({
    hasUnsavedData:    () => rowsRef.current.some(rowHasData) && draftStatusRef.current !== "saved",
    getCurrentDraftId: () => draftIdRef.current,
    loadRows: (newRows, newDraftId, newDraftName) => {
      skipDirtyRef.current = true;
      undoStackRef.current = [];
      const safe = (Array.isArray(newRows) ? newRows : []).map(r => {
        const base = emptyRow();
        for (const k of Object.keys(base) as ColKey[]) base[k] = typeof r[k] === "string" ? r[k] : base[k];
        return base;
      });
      while (safe.length < ROWS_DEFAULT) safe.push(emptyRow());
      setRows(safe);
      setDraftId(newDraftId ?? null);
      setDraftName(newDraftName ?? "Untitled Draft");
      setDraftStatus(newDraftId ? "saved" : "idle");
      setActive(null); setAnchor(null); setEditing(false);
      setCopyRange(null); setCopyOverlay(null);
      setMissingDomainRows(new Set());
    },
    notifyDraftDeleted: (id) => {
      if (draftIdRef.current === id) {
        setDraftId(null);
        setDraftName("Untitled Draft");
        setDraftStatus("idle");
      }
    },
  }), []);

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

  // ── Google OAuth + Sheets API (client-side) ──────────────────────────────────
  const GOOGLE_CLIENT_ID = "886002554960-au99p28pehmio6bhurnoqp6vlhcjve3j.apps.googleusercontent.com";
  const SHEETS_SCOPE = "https://www.googleapis.com/auth/drive.file";

  const SHEET_HEADERS = [
    "Sr No", "Organization Name", "Organization Locations", "Organization Domains",
    "Person Functions", "Person Seniorities", "Person Job Title", "Results per Function",
    "Job Search", "Job Title", "Job Seniority", "Date (days)",
  ];

  const getGoogleAccessToken = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const google = (window as any).google;
      if (!google?.accounts?.oauth2) {
        reject(new Error("Google Identity Services not loaded. Please refresh and try again."));
        return;
      }
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SHEETS_SCOPE,
        callback: (resp: any) => {
          if (resp.error) reject(new Error(resp.error_description || resp.error));
          else resolve(resp.access_token);
        },
      });
      client.requestAccessToken();
    });

  const handleExportToSheets = async () => {
    const filledRows = rows.filter(r => r.orgName.trim());
    if (!filledRows.length) {
      toast({ title: "No data", description: "Add at least one company first.", variant: "destructive" });
      return;
    }
    setSheetsLoading(true);
    try {
      const gToken = await getGoogleAccessToken();
      const title = sheetsName || "Bravoro Bulk Search";
      const numCols = SHEET_HEADERS.length; // 12 (A-L)
      const numDataRows = filledRows.length;
      const totalRows = 1 + numDataRows; // header + data

      // Teal colors matching V4 template
      const tealBg    = { red: 0, green: 0.616, blue: 0.647 };   // #009da5
      const whiteTxt  = { red: 1, green: 1, blue: 1 };
      const lightGrey = { red: 0.953, green: 0.953, blue: 0.953 }; // #f3f3f3

      // Create spreadsheet with Main_Data sheet
      const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
        method: "POST",
        headers: { Authorization: `Bearer ${gToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          properties: { title },
          sheets: [{
            properties: { title: "Main_Data", sheetId: 0, gridProperties: { frozenRowCount: 1, rowCount: Math.max(totalRows + 10, 102), columnCount: numCols } },
          }],
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err?.error?.message || "Failed to create sheet");
      }
      const spreadsheet = await createRes.json();
      const spreadsheetId = spreadsheet.spreadsheetId;

      // Populate: header row + data rows (A=Sr No, B-L=data)
      const values = [
        SHEET_HEADERS,
        ...filledRows.map((r, i) => [
          i + 1, // Sr No
          r.orgName?.trim()           ?? "",
          r.orgLocations?.trim()      ?? "",
          r.orgDomains?.trim()        ?? "",
          r.personFunctions?.trim()   ?? "",
          r.personSeniorities?.trim() ?? "",
          r.personJobTitle?.trim()    ?? "",
          parseInt(r.resultsPerTitle) || 3,
          r.toggleJobSearch           || "No",
          r.jobTitle?.trim()          ?? "",
          r.jobSeniority?.trim()      ?? "",
          parseInt(r.datePosted)      || 0,
        ]),
      ];
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Main_Data!A1:L${totalRows}?valueInputOption=RAW`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${gToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values }),
        },
      );

      // Column widths
      const exportColWidths = [
        50,  // A - Sr No
        180, // B - Org Name
        150, // C - Org Locations
        180, // D - Org Domains
        180, // E - Person Functions
        160, // F - Person Seniorities
        150, // G - Person Job Title
        120, // H - Results per Function
        90,  // I - Job Search
        150, // J - Job Title
        130, // K - Job Seniority
        90,  // L - Date (days)
      ];

      const requests: any[] = [];

      // Column widths
      exportColWidths.forEach((px, i) => {
        requests.push({
          updateDimensionProperties: {
            range: { sheetId: 0, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
            properties: { pixelSize: px },
            fields: "pixelSize",
          },
        });
      });

      // Header row: teal bg, white bold text, center aligned
      requests.push({
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols },
          cell: {
            userEnteredFormat: {
              backgroundColor: tealBg,
              textFormat: { bold: true, foregroundColor: whiteTxt, fontSize: 10 },
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
              wrapStrategy: "WRAP",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
        },
      });

      // Header row height
      requests.push({
        updateDimensionProperties: {
          range: { sheetId: 0, dimension: "ROWS", startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 36 },
          fields: "pixelSize",
        },
      });

      // Data rows: alternating row colors (white / light grey)
      for (let i = 0; i < numDataRows; i++) {
        if (i % 2 === 1) {
          requests.push({
            repeatCell: {
              range: { sheetId: 0, startRowIndex: i + 1, endRowIndex: i + 2, startColumnIndex: 0, endColumnIndex: numCols },
              cell: { userEnteredFormat: { backgroundColor: lightGrey } },
              fields: "userEnteredFormat.backgroundColor",
            },
          });
        }
      }

      // Col A (Sr No): center aligned
      requests.push({
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: 1 },
          cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
          fields: "userEnteredFormat.horizontalAlignment",
        },
      });

      // Col H (Results per Function): center aligned
      requests.push({
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 7, endColumnIndex: 8 },
          cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
          fields: "userEnteredFormat.horizontalAlignment",
        },
      });

      // Col I (Job Search): Yes/No dropdown + center aligned
      if (numDataRows > 0) {
        requests.push({
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 8, endColumnIndex: 9 },
            cell: {
              dataValidation: {
                condition: { type: "ONE_OF_LIST", values: [{ userEnteredValue: "Yes" }, { userEnteredValue: "No" }] },
                strict: true,
                showCustomUi: true,
              },
              userEnteredFormat: { horizontalAlignment: "CENTER" },
            },
            fields: "dataValidation,userEnteredFormat.horizontalAlignment",
          },
        });
      }

      // Col L (Date days): center aligned
      requests.push({
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 11, endColumnIndex: 12 },
          cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
          fields: "userEnteredFormat.horizontalAlignment",
        },
      });

      // Borders: thin border on all cells
      requests.push({
        updateBorders: {
          range: { sheetId: 0, startRowIndex: 0, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: numCols },
          top:    { style: "SOLID", color: { red: 0.8, green: 0.8, blue: 0.8 } },
          bottom: { style: "SOLID", color: { red: 0.8, green: 0.8, blue: 0.8 } },
          left:   { style: "SOLID", color: { red: 0.8, green: 0.8, blue: 0.8 } },
          right:  { style: "SOLID", color: { red: 0.8, green: 0.8, blue: 0.8 } },
          innerHorizontal: { style: "SOLID", color: { red: 0.8, green: 0.8, blue: 0.8 } },
          innerVertical:   { style: "SOLID", color: { red: 0.8, green: 0.8, blue: 0.8 } },
        },
      });

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${gToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests }),
      });

      setSheetsUrl(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
      setSheetsStep("done");
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
  const JOB_COLS: ColKey[] = ["jobTitle", "jobSeniority", "datePosted"];

  // Wrap setRows to push undo snapshot before every mutation
  const setRowsWithUndo = (updater: React.SetStateAction<GridRow[]>) => {
    setRows(prev => {
      undoStackRef.current = [...undoStackRef.current.slice(-(UNDO_LIMIT - 1)), prev.map(r => ({ ...r }))];
      return typeof updater === "function" ? updater(prev) : updater;
    });
  };

  const handleUndo = () => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const snapshot = stack.pop()!;
    setRows(snapshot); // direct setRows — no undo entry for the undo itself
  };

  const setCell = (r: number, k: ColKey, v: string) =>
    setRowsWithUndo(p => p.map((row, i) => {
      if (i !== r) return row;
      const updated = { ...row, [k]: v };
      // When toggle switches to "No", clear the 3 job columns
      if (k === "toggleJobSearch" && v === "No") {
        updated.jobTitle = "";
        updated.jobSeniority = "";
        updated.datePosted = "0";
      }
      return updated;
    }));

  // Column resize — DOM-direct during drag, commit to state only on mouseup
  const startResize = (e: React.MouseEvent, key: ColKey) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[key];
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(48, startW + ev.clientX - startX);
      const colEl = colElsRef.current.get(key);
      if (colEl) colEl.style.width = `${newW}px`;
      if (tableRef.current) {
        const total = 44 + COLS.reduce((s, c) => s + (c.key === key ? newW : colWidths[c.key]), 0);
        tableRef.current.style.minWidth = `${total}px`;
      }
    };
    const onUp = (ev: MouseEvent) => {
      const newW = Math.max(48, startW + ev.clientX - startX);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setColWidths(prev => ({ ...prev, [key]: newW }));
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Keyboard navigation — focusCell is synchronous because all inputs are already in the DOM
  const navigate = (r: number, c: number, dr: number, dc: number) => {
    const nr = r + dr; const nc = c + dc;
    if (nr < 0 || nr >= rows.length || nc < 0 || nc >= COLS.length) return;
    setAnchor({ r: nr, c: nc });
    setActive({ r: nr, c: nc }); setEditing(false);
    focusCell(nr, nc);
  };

  const handleCellKeyDown = (e: React.KeyboardEvent, r: number, c: number) => {
    const col = COLS[c];

    if (e.key === "F2")     {
      e.preventDefault();
      if (JOB_COLS.includes(col.key) && rows[r]?.toggleJobSearch !== "Yes") return;
      setEditing(prev => !prev); return;
    }
    if (e.key === "Escape") { e.preventDefault(); setEditing(false); setAnchor({ r, c }); setCopyRange(null); return; }

    // Undo (Ctrl+Z) — only when not editing a cell
    if (!editing && (e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
      e.preventDefault(); handleUndo(); return;
    }

    if (!editing && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      const selAnchor = anchor ?? { r, c };
      const selActive = active ?? { r, c };
      const r1 = Math.min(selAnchor.r, selActive.r);
      const r2 = Math.max(selAnchor.r, selActive.r);
      const c1 = Math.min(selAnchor.c, selActive.c);
      const c2 = Math.max(selAnchor.c, selActive.c);
      setRowsWithUndo(prev => prev.map((row, ri) => {
        if (ri < r1 || ri > r2) return row;
        const updated = { ...row };
        for (let ci = c1; ci <= c2; ci++) {
          const cc = COLS[ci];
          if (!cc || cc.type === "yesno") continue;
          updated[cc.key] = cc.type === "number" ? "0" : "";
        }
        return updated;
      }));
      return;
    }

    // Copy (Ctrl+C) — not in edit mode
    if (!editing && (e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
      e.preventDefault(); doCopy(); return;
    }
    // Cut (Ctrl+X) — not in edit mode
    if (!editing && (e.ctrlKey || e.metaKey) && (e.key === "x" || e.key === "X")) {
      e.preventDefault(); doCut(); return;
    }

    if (e.key === "Tab")   { e.preventDefault(); navigate(r, c, 0, e.shiftKey ? -1 : 1); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); navigate(r, c, 1, 0); return; }

    const isArrow = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key);
    if (isArrow) {
      const inTextEdit = editing && (col.type === "text" || col.type === "number");
      const isHoriz = e.key === "ArrowLeft" || e.key === "ArrowRight";
      // Let cursor move freely inside text edit unless Shift/Ctrl override
      if (inTextEdit && isHoriz && !e.shiftKey && !e.ctrlKey) return;

      e.preventDefault();

      const dr = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      const dc = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;

      let nr: number, nc: number;
      if (e.ctrlKey) {
        // Jump to grid edge
        nr = dr !== 0 ? (dr < 0 ? 0 : rows.length - 1) : r;
        nc = dc !== 0 ? (dc < 0 ? 0 : COLS.length - 1) : c;
      } else {
        nr = Math.max(0, Math.min(rows.length - 1, r + dr));
        nc = Math.max(0, Math.min(COLS.length - 1, c + dc));
        if (nr === r && nc === c) return; // at boundary, nothing to do
      }

      if (e.shiftKey) {
        // Extend selection — anchor stays, active moves
        if (!anchor) setAnchor({ r, c });
        setActive({ r: nr, c: nc });
        setEditing(false);
        focusCell(nr, nc);
      } else {
        // Normal move — collapse selection
        setAnchor({ r: nr, c: nc });
        setActive({ r: nr, c: nc });
        setEditing(false);
        focusCell(nr, nc);
      }
      return;
    }

    // Typing while in selection mode: enter edit mode immediately
    if (!editing && (col.type === "text" || col.type === "number") && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Block typing in job columns when toggle is No
      if (JOB_COLS.includes(col.key) && rows[r]?.toggleJobSearch !== "Yes") return;
      e.preventDefault();
      setEditing(true);
      setCell(r, col.key, e.key);
    }
  };

  // ── Copy / Cut helpers (reused by keyboard + context menu) ────────────────
  const doCopy = useCallback(() => {
    if (!active) return;
    const selAnchor = anchor ?? active;
    const selActive = active;
    const r1 = Math.min(selAnchor.r, selActive.r);
    const r2 = Math.max(selAnchor.r, selActive.r);
    const c1 = Math.min(selAnchor.c, selActive.c);
    const c2 = Math.max(selAnchor.c, selActive.c);
    const tsv = rows
      .slice(r1, r2 + 1)
      .map(row => COLS.slice(c1, c2 + 1).map(col => row[col.key] ?? "").join("\t"))
      .join("\n");
    navigator.clipboard.writeText(tsv).catch(() => {});
    setCopyRange({ r1, r2, c1, c2 });
    setIsCut(false);
  }, [active, anchor, rows]);

  const doCut = useCallback(() => {
    if (!active) return;
    const selAnchor = anchor ?? active;
    const selActive = active;
    const r1 = Math.min(selAnchor.r, selActive.r);
    const r2 = Math.max(selAnchor.r, selActive.r);
    const c1 = Math.min(selAnchor.c, selActive.c);
    const c2 = Math.max(selAnchor.c, selActive.c);
    const tsv = rows
      .slice(r1, r2 + 1)
      .map(row => COLS.slice(c1, c2 + 1).map(col => row[col.key] ?? "").join("\t"))
      .join("\n");
    navigator.clipboard.writeText(tsv).catch(() => {});
    setCopyRange({ r1, r2, c1, c2 });
    setIsCut(true);
  }, [active, anchor, rows]);

  const doPaste = useCallback(async () => {
    if (!active) return;
    if (COLS[active.c]?.type === "yesno") return;
    if (editing) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const pastedRows = text.trim().split(/\r?\n/).map(r => r.split("\t"));
      const isSingleCell = pastedRows.length === 1 && pastedRows[0].length === 1;
      const hasMultiSel = anchor && (anchor.r !== active.r || anchor.c !== active.c);

      // If this is a cut-paste, clear the source cells
      const cutSource = isCut && copyRange ? { ...copyRange } : null;

      setRowsWithUndo(prev => {
        const next = [...prev];
        if (isSingleCell && hasMultiSel) {
          const selR1 = Math.min(anchor!.r, active.r);
          const selR2 = Math.max(anchor!.r, active.r);
          const selC1 = Math.min(anchor!.c, active.c);
          const selC2 = Math.max(anchor!.c, active.c);
          const val = pastedRows[0][0].trim();
          for (let ri = selR1; ri <= selR2; ri++) {
            if (ri >= ROWS_MAX) break;
            while (next.length <= ri) next.push(emptyRow());
            const row = { ...next[ri] };
            for (let ci = selC1; ci <= selC2; ci++) {
              if (COLS[ci]?.type !== "yesno") row[COLS[ci].key] = val;
            }
            next[ri] = row;
          }
        } else {
          pastedRows.forEach((pr, dr) => {
            const ri = active.r + dr;
            if (ri >= ROWS_MAX) return;
            while (next.length <= ri) next.push(emptyRow());
            const row = { ...next[ri] };
            pr.forEach((val, dc) => { const ci = active.c + dc; if (ci < COLS.length) row[COLS[ci].key] = val.trim(); });
            next[ri] = row;
          });
        }
        // Clear cut source cells
        if (cutSource) {
          for (let ri = cutSource.r1; ri <= cutSource.r2; ri++) {
            if (ri >= next.length) break;
            const row = { ...next[ri] };
            for (let ci = cutSource.c1; ci <= cutSource.c2; ci++) {
              const cc = COLS[ci];
              if (!cc || cc.type === "yesno") continue;
              row[cc.key] = cc.type === "number" ? "0" : "";
            }
            next[ri] = row;
          }
        }
        return next.slice(0, ROWS_MAX);
      });
      setCopyRange(null);
      setIsCut(false);
    } catch { /* clipboard read denied */ }
  }, [active, anchor, editing, isCut, copyRange]);

  // Paste (TSV from Excel / Ctrl+V) — event-based (has access to clipboardData)
  const handlePaste = (e: React.ClipboardEvent) => {
    if (!active || !tableWrapRef.current) return;
    if (!tableWrapRef.current.contains(e.target as Node)) return;
    if (COLS[active.c]?.type === "yesno") return;
    if (editing) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    const pastedRows = text.trim().split(/\r?\n/).map(r => r.split("\t"));
    const isSingleCell = pastedRows.length === 1 && pastedRows[0].length === 1;
    const hasMultiSel = anchor && (anchor.r !== active.r || anchor.c !== active.c);
    const cutSource = isCut && copyRange ? { ...copyRange } : null;
    setRowsWithUndo(prev => {
      const next = [...prev];
      if (isSingleCell && hasMultiSel) {
        const selR1 = Math.min(anchor!.r, active.r);
        const selR2 = Math.max(anchor!.r, active.r);
        const selC1 = Math.min(anchor!.c, active.c);
        const selC2 = Math.max(anchor!.c, active.c);
        const val = pastedRows[0][0].trim();
        for (let ri = selR1; ri <= selR2; ri++) {
          if (ri >= ROWS_MAX) break;
          while (next.length <= ri) next.push(emptyRow());
          const row = { ...next[ri] };
          for (let ci = selC1; ci <= selC2; ci++) {
            if (COLS[ci]?.type !== "yesno") row[COLS[ci].key] = val;
          }
          next[ri] = row;
        }
      } else {
        pastedRows.forEach((pr, dr) => {
          const ri = active.r + dr;
          if (ri >= ROWS_MAX) return;
          while (next.length <= ri) next.push(emptyRow());
          const row = { ...next[ri] };
          pr.forEach((val, dc) => { const ci = active.c + dc; if (ci < COLS.length) row[COLS[ci].key] = val.trim(); });
          next[ri] = row;
        });
      }
      if (cutSource) {
        for (let ri = cutSource.r1; ri <= cutSource.r2; ri++) {
          if (ri >= next.length) break;
          const row = { ...next[ri] };
          for (let ci = cutSource.c1; ci <= cutSource.c2; ci++) {
            const cc = COLS[ci];
            if (!cc || cc.type === "yesno") continue;
            row[cc.key] = cc.type === "number" ? "0" : "";
          }
          next[ri] = row;
        }
      }
      return next.slice(0, ROWS_MAX);
    });
    setCopyRange(null);
    setIsCut(false);
  };

  // Picker
  const activePicker = active ? COLS[active.c] : null;
  const isJobLocked  = active ? JOB_COLS.includes(COLS[active.c]?.key) && rows[active.r]?.toggleJobSearch !== "Yes" : false;
  const showPicker   = activePicker?.type === "picker-multi" && !isJobLocked;

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
    const filledRows = rows.filter(rowHasData);
    if (!filledRows.length) {
      toast({ title: "No Data", description: "Add at least one row of data.", variant: "destructive" });
      return;
    }

    // Validate: every filled row must have Organization Name
    const missingNameIndices = new Set(
      rows.reduce<number[]>((acc, r, i) => {
        if (rowHasData(r) && !r.orgName.trim()) acc.push(i);
        return acc;
      }, [])
    );
    if (missingNameIndices.size > 0) {
      const rowNums = Array.from(missingNameIndices).map(i => i + 1).join(", ");
      toast({
        title: "Missing Organization Name",
        description: `Row${missingNameIndices.size === 1 ? "" : "s"} ${rowNums} ${missingNameIndices.size === 1 ? "has" : "have"} data but no Organization Name. Please fill it in or clear the row.`,
        variant: "destructive",
      });
      return;
    }

    // Validate: all filled rows must have Organization Domain
    const missingIndices = new Set(
      rows.reduce<number[]>((acc, r, i) => {
        if (rowHasData(r) && !r.orgDomains.trim()) acc.push(i);
        return acc;
      }, [])
    );
    if (missingIndices.size > 0) {
      setMissingDomainRows(missingIndices);
      toast({
        title: "Missing Organization Domains",
        description: `${missingIndices.size} row${missingIndices.size === 1 ? "" : "s"} with data ${missingIndices.size === 1 ? "is" : "are"} missing an Organization Domain. Please fill the highlighted cells.`,
        variant: "destructive",
      });
      return;
    }

    // Validate: Organization Locations must be comma-separated only
    const badSeparator = /[;:|\t]/;
    const invalidLocIndices = new Set(
      rows.reduce<number[]>((acc, r, i) => {
        if (rowHasData(r) && r.orgLocations.trim() && badSeparator.test(r.orgLocations)) acc.push(i);
        return acc;
      }, [])
    );
    if (invalidLocIndices.size > 0) {
      setInvalidLocationRows(invalidLocIndices);
      const sample = rows[Array.from(invalidLocIndices)[0]].orgLocations;
      const badChar = sample.match(badSeparator)?.[0] === "\t" ? "tab" : `"${sample.match(badSeparator)?.[0]}"`;
      toast({
        title: "Invalid Character in Organization Locations",
        description: `${invalidLocIndices.size} row${invalidLocIndices.size === 1 ? " contains" : "s contain"} ${badChar} — only commas are allowed to separate locations. Please fix the highlighted cells.`,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const toArrOrStr = (s: string) => {
        const arr = s.trim() ? s.split(",").map(x => x.trim()).filter(Boolean) : [];
        return arr.length <= 1 ? (arr[0] ?? "") : arr;
      };
      const mainData = filledRows.map((r, idx) => ({
        "Sr No":                  idx + 1,
        "Organization Name":      r.orgName.trim(),
        "Organization Locations": r.orgLocations.trim(),
        "Organization Domains":   r.orgDomains.trim(),
        "Person Functions":       toArrOrStr(r.personFunctions),
        "Person Seniorities":     toArrOrStr(r.personSeniorities),
        "Person Job Title":       r.personJobTitle.trim(),
        "Results per Function":   parseInt(r.resultsPerTitle) || 3,
        "Toggle job search":      r.toggleJobSearch || "No",
        "Job Title":              toArrOrStr(r.jobTitle),
        "Job Seniority":          toArrOrStr(r.jobSeniority),
        "Date Posted":            parseInt(r.datePosted) || 0,
      }));

      const sentName = draftNameRef.current !== "Untitled Draft"
        ? draftNameRef.current
        : `Bulk Search · ${filledRows.length} ${filledRows.length === 1 ? "company" : "companies"}`;
      const { data: search, error: se } = await supabase
        .from("searches")
        .insert({ user_id: userId, search_type: "bulk", excel_file_name: sentName, status: "processing", grid_data: filledRows } as any)
        .select().single();
      if (se) throw se;

      const { data: { session } } = await supabase.auth.getSession();
      const { error: we } = await supabase.functions.invoke("trigger-n8n-webhook", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { searchId: search.id, entryType: "bulk_upload", searchData: { search_id: search.id, data: { Main_Data: mainData } } },
      });
      if (we) {
        const errMsg = we.message || "";
        const isCredits = errMsg.includes("INSUFFICIENT_CREDITS") || errMsg.includes("run out of credits");
        toast({
          title: isCredits ? "Insufficient Credits" : "Processing Failed",
          description: isCredits
            ? "Your workspace has run out of credits. Please contact your admin to top up."
            : "Couldn't reach the processing server.",
          variant: "destructive",
        });
        return;
      }

      // Auto-delete draft on successful submit
      if (draftId) {
        await supabase.from("bulk_search_drafts").delete().eq("id", draftId);
      }
      setDraftId(null); setDraftName("Untitled Draft"); setDraftStatus("idle");

      toast({ title: "Processing Started", description: `${filledRows.length} ${filledRows.length === 1 ? "company" : "companies"} queued. You'll get an email when results are ready.` });
      sessionStorage.removeItem(`sg_session_${userId}`);
      skipDirtyRef.current = true;
      setRows(Array.from({ length: ROWS_DEFAULT }, emptyRow));
      setActive(null);
    } catch (err) {
      toast({ title: "Processing Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  // ── New sheet ─────────────────────────────────────────────────────────────────
  const doReset = (name = "Untitled Draft") => {
    sessionStorage.removeItem(`sg_session_${userId}`);
    skipDirtyRef.current = true;
    undoStackRef.current = [];
    setRows(Array.from({ length: ROWS_DEFAULT }, emptyRow));
    setDraftId(null);
    setDraftName(name);
    setDraftStatus("idle");
    setActive(null);
    setEditing(false);
  };

  const handleNewSheet = async () => {
    const hasUnsaved = rows.some(rowHasData) && draftStatus !== "saved";
    if (hasUnsaved && !window.confirm("You have unsaved changes. Discard them and open a new sheet?")) return;

    // Find a unique name: "Untitled Draft", then "Untitled Draft (1)", "(2)", …
    const { data: existing } = await supabase
      .from("bulk_search_drafts")
      .select("name")
      .eq("user_id", userId);
    const names = new Set((existing ?? []).map(d => d.name));
    let name = "Untitled Draft";
    let n = 1;
    while (names.has(name)) name = `Untitled Draft (${n++})`;

    doReset(name);
  };

  // Clear sheet
  const handleClearSheet = () => {
    if (!rows.some(rowHasData)) return;
    if (!window.confirm("Clear all cell data? Your saved draft will not be deleted.")) return;
    skipDirtyRef.current = true;
    undoStackRef.current = [];
    setRows(Array.from({ length: ROWS_DEFAULT }, emptyRow));
    setActive(null);
    setAnchor(null);
    setEditing(false);
  };

  const validCount = rows.filter(rowHasData).length;
  const selected   = getSelected();
  const filtered   = getFiltered();

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div>
      <style>{`
        .sg-input::placeholder { color: #b0c8c8; }
        .sg-input:focus::placeholder { color: #c5d8d8; }
        .sg-picker-input::placeholder { color: #9ab8b8; }
        .sg-input:focus { outline: none; }
        @keyframes sg-dash-march { to { stroke-dashoffset: -12; } }
      `}</style>

      <div ref={containerRef} onPaste={handlePaste} className="space-y-3 w-full overflow-hidden">

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
                className="flex items-center gap-1 text-[14px] font-semibold transition-colors truncate max-w-[200px]"
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

            {/* Clear Sheet */}
            <button
              onClick={handleClearSheet}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
              style={{ color: "#994444", border: "1px solid #f0d8d8", background: "#fff" }}
              title="Clear all cell data (draft is kept)"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear</span>
            </button>

            {/* New Draft */}
            <button
              onClick={handleNewSheet}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
              style={{ color: "#5a8888", border: "1px solid #daeaea", background: "#fff" }}
              title="Start a new blank sheet"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Draft</span>
            </button>

            {/* My Drafts button */}
            <button
              onClick={() => onOpenManager?.()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
              style={{ color: "#5a8888", border: "1px solid #daeaea", background: "#fff" }}
              title="Open My Drafts — manage drafts and sent searches"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span>My Drafts</span>
            </button>

            {/* Save Draft */}
            <button
              onClick={saveDraft}
              disabled={draftSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
              style={{ color: "#007980", border: "1px solid #daeaea", background: "#fff" }}
            >
              {draftSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>Save Draft</span>
            </button>

            {/* Sheets dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowSheetsMenu(p => !p)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
                style={{ color: "#fff", background: "#009da5", border: "1px solid #007980" }}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Sheets</span>
                <ChevronRight className="h-2.5 w-2.5 rotate-90" />
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

        {/* ── Hint + row count + separator ────────────────────────────────── */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 shrink-0">
            <Clipboard className="h-3 w-3 text-primary" />
            <span className="text-[11px] text-[#4a7878]">Click a cell · Ctrl+C to copy selection · paste from Excel or Google Sheets</span>
          </div>
          {validCount > 0 && (
            <span className="text-[13px] font-bold shrink-0" style={{ color: "#58dddd" }}>{validCount} {validCount === 1 ? "row" : "rows"} filled</span>
          )}
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, #009da5, transparent)" }} />
        </div>

        {/* ── Grid + Picker ─────────────────────────────────────────────────── */}
        <div className="flex gap-3 items-start w-full min-w-0">

          {/* Table */}
          <div
            ref={tableWrapRef}
            className="flex-1 min-w-0 rounded-xl overflow-auto"
            style={{ maxHeight: 540, background: "#ffffff", border: "1px solid #c8e2e2", boxShadow: "0 4px 24px rgba(0,157,165,0.10), 0 1px 4px rgba(0,0,0,0.06)" }}
          >
            <div style={{ position: "relative" }}>
            <table ref={tableRef} style={{ borderCollapse: "collapse", width: "100%", minWidth: 44 + Object.values(colWidths).reduce((s, w) => s + w, 0), tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 44 }} />
                {COLS.map(c => <col key={c.key} ref={el => { if (el) colElsRef.current.set(c.key, el as HTMLElement); else colElsRef.current.delete(c.key); }} style={{ width: colWidths[c.key] }} />)}
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
                          <span className="text-[12px] font-bold uppercase tracking-wider truncate" style={{ color: isPicker ? "#005f65" : "#1a3535" }}>
                            {col.label}{col.key === "orgDomains" && <span style={{ color: "#e05555", marginLeft: 2 }}>*</span>}
                          </span>
                          {isPicker && <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: "#009da5", opacity: 0.8 }} />}
                        </div>
                        <div className="absolute right-0 top-0 h-full flex items-center justify-center group/rh" style={{ width: 8, cursor: "col-resize", zIndex: 1 }} onMouseDown={e => startResize(e, col.key)}>
                          <div className="h-3/5 rounded-full transition-colors duration-150 group-hover/rh:bg-primary" style={{ width: 2, background: "#c8e2e2" }} />
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* Pre-compute selection rectangle once for all cells */}
                {(() => {
                const selR1 = anchor && active ? Math.min(anchor.r, active.r) : -1;
                const selR2 = anchor && active ? Math.max(anchor.r, active.r) : -1;
                const selC1 = anchor && active ? Math.min(anchor.c, active.c) : -1;
                const selC2 = anchor && active ? Math.max(anchor.c, active.c) : -1;
                return rows.map((row, ri) => {
                  const isActiveRow = active?.r === ri;
                  const rowBg = isActiveRow ? "#f0fafa" : ri % 2 === 0 ? "#ffffff" : "#fafefe";
                  return (
                    <tr key={ri} style={{ background: rowBg }}>
                      <td className="sticky left-0 z-10 border-r border-b text-center select-none" style={{ height: 32, background: isActiveRow ? "#e4f4f4" : (selR1 >= 0 && ri >= selR1 && ri <= selR2) ? "rgba(0,157,165,0.07)" : "#f5fafa", padding: 0, borderColor: "#daeaea" }}>
                        <span className="text-[11px] font-semibold tabular-nums" style={{ color: "#9abcbc" }}>{ri + 1}</span>
                      </td>
                      {COLS.map((col, ci) => {
                        const isActive = active?.r === ri && active?.c === ci;
                        const inSel = selR1 >= 0 && ri >= selR1 && ri <= selR2 && ci >= selC1 && ci <= selC2;
                        const isPicker = col.type === "picker-multi";
                        const hasValue = !!row[col.key].trim();
                        const isEditing = isActive && editing;
                        const isJobCol = JOB_COLS.includes(col.key);
                        const jobLocked = isJobCol && row.toggleJobSearch !== "Yes";
                        const isMissingDomain = missingDomainRows.has(ri) && col.key === "orgDomains";
                        const isInvalidLocation = invalidLocationRows.has(ri) && col.key === "orgLocations";
                        const cellBg = jobLocked ? "rgba(0,0,0,0.03)"
                          : (isMissingDomain || isInvalidLocation) && !isActive ? "rgba(239,68,68,0.08)"
                          : inSel && !isActive ? "rgba(0,157,165,0.14)"
                          : isPicker && hasValue && !isActive ? "rgba(0,157,165,0.04)"
                          : undefined;
                        const activeStyle = isActive ? { outline: isEditing ? "1px solid #009da5" : "3px solid #009da5", outlineOffset: isEditing ? "-1px" : "-3px", position: "relative" as const, zIndex: 20 } : {};
                        const missingStyle = (isMissingDomain || isInvalidLocation) && !isActive ? { outline: "1px solid rgba(220,50,50,0.45)", outlineOffset: "-1px" } : {};
                        return (
                          <td key={col.key} className="relative p-0 border-b border-r" style={{ height: 32, borderColor: "#daeaea", background: cellBg, ...activeStyle, ...missingStyle }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              // Select the cell if not already in selection
                              const inCurrentSel = selR1 >= 0 && ri >= selR1 && ri <= selR2 && ci >= selC1 && ci <= selC2;
                              if (!inCurrentSel) {
                                setAnchor({ r: ri, c: ci });
                                setActive({ r: ri, c: ci });
                                setEditing(false);
                              }
                              setCtxMenu({ x: e.clientX, y: e.clientY, r: ri, c: ci });
                            }}
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              // If already editing this cell, let the browser handle text selection
                              const alreadyEditing = editing && active?.r === ri && active?.c === ci;
                              if (!alreadyEditing) {
                                e.preventDefault();
                                if (missingDomainRows.size > 0) setMissingDomainRows(new Set());
                                if (invalidLocationRows.size > 0) setInvalidLocationRows(new Set());
                                setAnchor({ r: ri, c: ci });
                                setActive({ r: ri, c: ci });
                                setEditing(false);
                                isDraggingRef.current = false;
                                dragStartPosRef.current = { x: e.clientX, y: e.clientY };
                                if (col.type === "yesno") {
                                  setCell(ri, col.key, row[col.key] === "Yes" ? "No" : "Yes");
                                  focusCell(ri, ci);
                                } else {
                                  focusCell(ri, ci);
                                }
                              }
                            }}
                            onMouseEnter={() => {
                              if (!isDraggingRef.current) return;
                              setActive({ r: ri, c: ci });
                            }}
                            onDoubleClick={() => {
                              if (col.type === "yesno") return;
                              // Block editing job columns when toggle is No
                              if (JOB_COLS.includes(col.key) && row.toggleJobSearch !== "Yes") return;
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
                              <div className="w-full h-full flex items-center justify-center cursor-pointer select-none relative">
                                <input
                                  ref={setInputRef(ri, ci)}
                                  type="text"
                                  readOnly
                                  value={row[col.key]}
                                  onFocus={() => setActive({ r: ri, c: ci })}
                                  onKeyDown={e => {
                                    handleCellKeyDown(e, ri, ci);
                                    if (e.key === " " || e.key === "Enter") { e.preventDefault(); setCell(ri, col.key, row[col.key] === "Yes" ? "No" : "Yes"); }
                                  }}
                                  className="absolute inset-0 opacity-0 cursor-pointer"
                                  style={{ caretColor: "transparent" }}
                                />
                                <span className="text-[11px] font-bold tracking-wider pointer-events-none" style={{ color: row[col.key] === "Yes" ? "#007980" : "#b0c8c8" }}>{row[col.key] === "Yes" ? "YES" : "NO"}</span>
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
                });})()}
              </tbody>
            </table>
            {/* Copy-range dashed overlay — positioned via DOM measurement */}
            {copyOverlay && (
              <svg style={{ position: "absolute", top: copyOverlay.top, left: copyOverlay.left, width: copyOverlay.width, height: copyOverlay.height, pointerEvents: "none", zIndex: 25, overflow: "visible" }}>
                <rect x={1} y={1} width={copyOverlay.width - 2} height={copyOverlay.height - 2}
                  fill={isCut ? "rgba(220,80,80,0.04)" : "none"}
                  stroke={isCut ? "#c05050" : "#1a73e8"}
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  style={isCut ? { animation: "sg-dash-march 0.4s linear infinite" } : undefined}
                />
              </svg>
            )}
            </div>
            {rows.length < ROWS_MAX && (
              <div style={{ borderTop: "1px solid #daeaea" }}>
                <button type="button" onClick={() => setRows(r => [...r, ...Array.from({ length: Math.min(10, ROWS_MAX - r.length) }, emptyRow)])}
                  className="w-full py-2.5 flex items-center justify-center gap-1.5 text-[11px] transition-all duration-200 cursor-pointer hover:bg-[#f0fafa]" style={{ color: "#9abcbc" }}>
                  <Plus className="h-3 w-3" />Add 10 more rows<span className="ml-1" style={{ color: "#c0d8d8" }}>{rows.length}/{ROWS_MAX}</span>
                </button>
              </div>
            )}
          </div>

          {/* Picker panel — flex sibling, shrinks the table to fit */}
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
                        {isSel && <Check className="h-[9px] w-[9px] text-foreground" />}
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
            {validCount === 0 && (
              <p className="text-[12px] text-[#2a4545]">Fill at least one company name to run</p>
            )}
          </div>
          <button type="button" onClick={handleSubmit} disabled={submitting || validCount === 0} className="h-11 px-7 rounded-xl font-semibold text-[14px] tracking-wide bg-primary text-black hover:bg-accent shadow-[0_4px_20px_rgba(0,157,165,0.22)] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.99] cursor-pointer flex items-center gap-2 shrink-0">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Processing…</> : <><Play className="h-4 w-4" />Run Bulk Search</>}
          </button>
        </div>
      </div>

      {/* ── Context menu ──────────────────────────────────────────────────────── */}
      {ctxMenu && (
        <div
          onMouseDown={e => e.stopPropagation()}
          className="fixed z-[200] rounded-lg overflow-hidden"
          style={{
            top: ctxMenu.y,
            left: ctxMenu.x,
            background: "#fff",
            border: "1px solid #c8e2e2",
            boxShadow: "0 8px 32px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08)",
            minWidth: 160,
          }}
        >
          <button
            onClick={() => { doCopy(); setCtxMenu(null); }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-[12px] transition-colors hover:bg-[#f0fafa]"
            style={{ color: "#1a2e2e", borderBottom: "1px solid #f0f5f5" }}
          >
            <Copy className="h-3.5 w-3.5" style={{ color: "#009da5" }} />
            <span className="flex-1">Copy</span>
            <span className="text-[10px]" style={{ color: "#9abcbc" }}>Ctrl+C</span>
          </button>
          <button
            onClick={() => { doCut(); setCtxMenu(null); }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-[12px] transition-colors hover:bg-[#f0fafa]"
            style={{ color: "#1a2e2e", borderBottom: "1px solid #f0f5f5" }}
          >
            <Scissors className="h-3.5 w-3.5" style={{ color: "#009da5" }} />
            <span className="flex-1">Cut</span>
            <span className="text-[10px]" style={{ color: "#9abcbc" }}>Ctrl+X</span>
          </button>
          <button
            onClick={() => { doPaste(); setCtxMenu(null); }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-[12px] transition-colors hover:bg-[#f0fafa]"
            style={{ color: "#1a2e2e", borderBottom: "1px solid #f0f5f5" }}
          >
            <ClipboardPaste className="h-3.5 w-3.5" style={{ color: "#009da5" }} />
            <span className="flex-1">Paste</span>
            <span className="text-[10px]" style={{ color: "#9abcbc" }}>Ctrl+V</span>
          </button>
          <button
            onClick={() => {
              if (!active) { setCtxMenu(null); return; }
              const selAnchor = anchor ?? active;
              const r1 = Math.min(selAnchor.r, active.r);
              const r2 = Math.max(selAnchor.r, active.r);
              const c1 = Math.min(selAnchor.c, active.c);
              const c2 = Math.max(selAnchor.c, active.c);
              setRowsWithUndo(prev => prev.map((row, ri) => {
                if (ri < r1 || ri > r2) return row;
                const updated = { ...row };
                for (let ci = c1; ci <= c2; ci++) {
                  const cc = COLS[ci];
                  if (!cc || cc.type === "yesno") continue;
                  updated[cc.key] = cc.type === "number" ? "0" : "";
                }
                return updated;
              }));
              setCtxMenu(null);
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-[12px] transition-colors hover:bg-[#f0fafa]"
            style={{ color: "#1a2e2e" }}
          >
            <Trash2 className="h-3.5 w-3.5" style={{ color: "#c05050" }} />
            <span className="flex-1">Clear</span>
            <span className="text-[10px]" style={{ color: "#9abcbc" }}>Del</span>
          </button>
        </div>
      )}

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

                <div className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-[11px]" style={{ background: "#f4fcfc", border: "1px solid #daeaea", color: "#5a8888" }}>
                  <span>You'll sign in with your Google account. The sheet will be created in your own Google Drive.</span>
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
                    <div className="text-[13px] font-semibold" style={{ color: "#166534" }}>Sheet created in your Google Drive!</div>
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

      {/* ── Duplicate Name Conflict Modal ──────────────────────────────────────── */}
      {dupConflict && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(6,25,26,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", width: "100%", maxWidth: 440, boxShadow: "0 24px 80px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,157,165,0.2)" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ background: "#edf6f6", borderBottom: "1px solid #daeaea" }}>
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="h-4 w-4" style={{ color: "#009da5" }} />
                <span className="text-[14px] font-bold" style={{ color: "#0c2e2e" }}>Duplicate Sheet Name</span>
              </div>
              <button onClick={() => setDupConflict(null)} className="p-1 rounded-lg transition-colors hover:bg-[#daeaea]" style={{ color: "#5a8888" }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: "#fff8f0", border: "1px solid #f0d8b0" }}>
                <span className="text-[16px] mt-0.5 shrink-0">⚠️</span>
                <div className="text-[13px] leading-relaxed" style={{ color: "#6a4a1a" }}>
                  A sheet named <span className="font-bold">"{dupConflict.existingName}"</span> already exists. You can overwrite it or save with a different name.
                </div>
              </div>

              {/* Rename input */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#5a8888" }}>Save as new name</label>
                <input
                  ref={dupInputRef}
                  value={dupNewName}
                  onChange={e => setDupNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && dupNewName.trim()) handleDupRename(); }}
                  placeholder="Enter a new name"
                  className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none transition-colors"
                  style={{ border: "1px solid #c8e2e2", color: "#1a2e2e", background: "#fafefe" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#009da5"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#c8e2e2"; }}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setDupConflict(null)}
                  className="py-2.5 px-4 rounded-xl text-[13px] font-medium transition-colors"
                  style={{ border: "1px solid #daeaea", color: "#5a8888" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDupOverwrite}
                  disabled={draftSaving}
                  className="py-2.5 px-4 rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: "#d97706", color: "#fff" }}
                >
                  {draftSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Overwrite
                </button>
                <button
                  onClick={handleDupRename}
                  disabled={draftSaving || !dupNewName.trim() || dupNewName.trim() === dupConflict.existingName}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: "#009da5", color: "#fff" }}
                >
                  {draftSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save as New
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

SpreadsheetGrid.displayName = "SpreadsheetGrid";
