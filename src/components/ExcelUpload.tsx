import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Download, Upload, Loader2, FileSpreadsheet, ExternalLink,
  BookOpen, Check, AlertTriangle, Table2, Link2, CircleCheck,
  XCircle, ChevronDown, ChevronUp, Info,
} from "lucide-react";
import * as XLSX from "xlsx";
import { fixMojibakeDeep } from "@/lib/utils";
import { SpreadsheetGrid, SpreadsheetGridHandle } from "./SpreadsheetGrid";
import type { GridRow } from "./SpreadsheetGrid";
import { SheetsManager } from "./SheetsManager";

// ── Constants ──────────────────────────────────────────────────────────────────
const EXPECTED_HEADERS = [
  "Sr No", "Organization Name", "Organization Locations", "Organization Domains",
  "Person Functions", "Person Seniorities", "Person Job Title", "Results per Function",
  "Job Search", "Job Title", "Job Seniority", "Date (days)",
];

const GOOGLE_SHEET_COPY_URL = "https://docs.google.com/spreadsheets/d/1uldSi7FoRVG7JibkbjJ0RY7nEK_kK9gTiRe5tKtbr6Y/copy";

// ── Types ──────────────────────────────────────────────────────────────────────
type ActiveMode    = "excel" | "sheets-copy" | "spreadsheet";
type ProcessingStep = "idle" | "parsing" | "creating" | "triggering" | "complete";

interface ExcelUploadProps { userId: string; userEmail?: string; }

const PROCESSING_STEPS: { key: ProcessingStep; label: string; progress: number }[] = [
  { key: "parsing",    label: "Parsing file...",           progress: 25  },
  { key: "creating",   label: "Creating search record...", progress: 50  },
  { key: "triggering", label: "Triggering processing...",  progress: 75  },
  { key: "complete",   label: "Complete!",                 progress: 100 },
];

// ── Component ──────────────────────────────────────────────────────────────────
export const ExcelUpload = ({ userId, userEmail }: ExcelUploadProps) => {
  const { toast }    = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridRef      = useRef<SpreadsheetGridHandle>(null);

  const [activeMode, setActiveMode] = useState<ActiveMode>("excel");
  // "grid" = show spreadsheet, "manager" = show My Sheets page
  const [sheetView, setSheetView] = useState<"grid" | "manager">("grid");
  // Rows queued to load into the grid (applied once view switches back to "grid")
  const [pendingLoad, setPendingLoad] = useState<{ rows: GridRow[]; draftId?: string; name: string } | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging,   setIsDragging]   = useState(false);
  const [currentStep,  setCurrentStep]  = useState<ProcessingStep>("idle");

  // ── Google Sheets URL import state ──────────────────────────────────────────
  const [sheetsUrl,         setSheetsUrl]         = useState("");
  const [sheetsValidating,  setSheetsValidating]  = useState(false);
  const [sheetsSubmitting,  setSheetsSubmitting]   = useState(false);
  const [sheetsResult,      setSheetsResult]      = useState<{
    status: "ok" | "error";
    reason?: string;
    message?: string;
    errors?: { row: number; message: string }[];
    missingHeaders?: string[];
    summary?: { totalRows: number; jobSearchRows: number };
  } | null>(null);
  const [sheetsErrorsExpanded, setSheetsErrorsExpanded] = useState(false);

  // ── My Sheets: apply pending load once grid is in view ───────────────────────
  useEffect(() => {
    if (sheetView === "grid" && pendingLoad) {
      gridRef.current?.loadRows(pendingLoad.rows, pendingLoad.draftId ?? null, pendingLoad.name);
      setPendingLoad(null);
    }
  }, [sheetView, pendingLoad]);

  const handleOpenManager = () => setSheetView("manager");

  const handleLoadFromManager = (rows: GridRow[], meta: { draftId?: string; name: string }) => {
    const hasDirty = gridRef.current?.hasUnsavedData();
    if (hasDirty) {
      if (!window.confirm("You have unsaved data in the worksheet. Load this sheet anyway and discard current changes?")) return;
    }
    setPendingLoad({ rows, draftId: meta.draftId, name: meta.name });
    setSheetView("grid");
  };

  const handleDraftDeleted = (id: string) => {
    gridRef.current?.notifyDraftDeleted(id);
  };

  const handleNewSheetFromManager = () => {
    const hasDirty = gridRef.current?.hasUnsavedData();
    if (hasDirty && !window.confirm("You have unsaved data in the worksheet. Start a new sheet and discard current changes?")) return;
    setPendingLoad({ rows: [], name: "Untitled Draft" });
    setSheetView("grid");
  };

  // ── File helpers ──────────────────────────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch("/BulkSearch_Template_V2.xlsm");
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url  = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = "BulkSearch_Template_V2.xlsm";
      document.body.appendChild(link); link.click();
      document.body.removeChild(link); window.URL.revokeObjectURL(url);
      toast({ title: "Template Downloaded", description: "Fill in the template and upload it back" });
    } catch {
      toast({ title: "Download Failed", description: "Failed to download template. Please try again.", variant: "destructive" });
    }
  };

  const validateFile = (file: File): boolean => {
    const validTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel.sheet.macroEnabled.12",
      "text/csv",
    ];
    if (!validTypes.includes(file.type) && !file.name.endsWith(".csv") && !file.name.endsWith(".xlsx") && !file.name.endsWith(".xlsm")) {
      toast({ title: "Invalid File Type", description: "Please upload an Excel (.xlsx, .xlsm) or CSV file", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) setSelectedFile(file);
  };

  const parseExcelToJSON = async (file: File): Promise<{ data: any; headers: string[] }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target?.result, { type: "array" });
          const result: any = {};
          let headers: string[] = [];
          workbook.SheetNames.forEach((sheetName) => {
            const ws = workbook.Sheets[sheetName];
            result[sheetName] = XLSX.utils.sheet_to_json(ws);
            if (sheetName === "Main_Data" || (headers.length === 0 && sheetName === workbook.SheetNames[0])) {
              headers = (XLSX.utils.sheet_to_json(ws, { header: 1 })[0] as string[]) || [];
            }
          });
          resolve({ data: fixMojibakeDeep(result), headers: headers.map(h => typeof h === "string" ? fixMojibakeDeep(h) : h) });
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    });

  const validateHeaders = (headers: string[]): boolean => {
    const norm = headers.map(h => String(h).replace(/\r\n|\r|\n/g, " ").trim().toLowerCase());
    return EXPECTED_HEADERS.every(e => {
      const el = e.toLowerCase();
      return norm.some(h => h === el || h.startsWith(el + " ") || h.startsWith(el + "("));
    });
  };

  const getCurrentProgress = () => PROCESSING_STEPS.find(s => s.key === currentStep)?.progress || 0;

  // ── File upload submit ────────────────────────────────────────────────────────
  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast({ title: "No File Selected", description: "Please select a file to upload", variant: "destructive" });
      return;
    }
    setLoading(true); setCurrentStep("parsing");
    try {
      const { data: excelData, headers } = await parseExcelToJSON(selectedFile);
      if (!validateHeaders(headers)) {
        toast({ title: "Header Names Mismatch", description: "Please use the same headers as in the template file and try again.", variant: "destructive" });
        setLoading(false); setCurrentStep("idle"); return;
      }
      setCurrentStep("creating");
      const { data: search, error: searchError } = await supabase
        .from("searches").insert({ user_id: userId, search_type: "bulk", excel_file_name: selectedFile.name, status: "processing" })
        .select().single();
      if (searchError) throw searchError;
      setCurrentStep("triggering");

      // Transform Excel data to match SpreadsheetGrid's payload format
      const toArrOrStr = (s: string) => {
        const arr = s.trim() ? s.split(",").map(x => x.trim()).filter(Boolean) : [];
        return arr.length <= 1 ? (arr[0] ?? "") : arr;
      };
      const sheetName = Object.keys(excelData).includes("Main_Data") ? "Main_Data" : Object.keys(excelData)[0];
      const rawRows: Record<string, string>[] = excelData[sheetName] ?? [];
      // Flexible header lookup — handles V2 template header variants
      const getVal = (row: Record<string, string>, ...keys: string[]) => {
        for (const k of keys) {
          const found = Object.keys(row).find(h => h.toLowerCase().startsWith(k.toLowerCase()));
          if (found && row[found] != null) return String(row[found]).trim();
        }
        return "";
      };
      const mainData = rawRows
        .filter(row => getVal(row, "Organization Domain", "Organization Name", "Person Function", "Person Seniori"))
        .map((row, idx) => ({
          "Sr No":                  idx + 1,
          "Organization Name":      getVal(row, "Organization Name"),
          "Organization Locations":  getVal(row, "Organization Location"),
          "Organization Domains":    getVal(row, "Organization Domain"),
          "Person Functions":        toArrOrStr(getVal(row, "Person Function")),
          "Person Seniorities":      toArrOrStr(getVal(row, "Person Seniori")),
          "Person Job Title":        getVal(row, "Person Job Title"),
          "Results per Function":    parseInt(getVal(row, "Results per")) || 3,
          "Toggle job search":       getVal(row, "Toggle job search", "Job Search") || "No",
          "Job Title":               toArrOrStr(getVal(row, "Job Title")),
          "Job Seniority":           toArrOrStr(getVal(row, "Job Seniority")),
          "Date Posted":             parseInt(getVal(row, "Date Posted", "Date (days)")) || 0,
        }));

      const { data: { session } } = await supabase.auth.getSession();
      const { error: webhookError } = await supabase.functions.invoke("trigger-n8n-webhook", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { searchId: search.id, entryType: "bulk_upload", searchData: { search_id: search.id, data: { Main_Data: mainData } } },
      });
      if (webhookError) {
        toast({ title: "Processing Failed", description: "We couldn't reach the processing server. Please try again shortly.", variant: "destructive" });
        setCurrentStep("idle"); setLoading(false); return;
      }
      setCurrentStep("complete");
      toast({ title: "Processing Started", description: "Your request is being processed. You will receive an email when your results are ready." });
      setTimeout(() => { setSelectedFile(null); setCurrentStep("idle"); }, 1500);
    } catch (error) {
      toast({ title: "Processing Failed", description: error instanceof Error ? error.message : "Failed to process your request", variant: "destructive" });
      setCurrentStep("idle");
    } finally { setLoading(false); }
  };

  // ── Google Sheets: validate URL ──────────────────────────────────────────────
  const handleSheetsImport = async () => {
    if (!sheetsUrl.trim()) return;
    setSheetsValidating(true);
    setSheetsResult(null);
    setSheetsErrorsExpanded(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("import-google-sheet", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { action: "validate", sheetUrl: sheetsUrl.trim(), userId },
      });
      if (error) throw error;
      setSheetsResult(data);
    } catch {
      setSheetsResult({ status: "error", reason: "network", message: "Could not reach the server. Please try again." });
    } finally {
      setSheetsValidating(false);
    }
  };

  // ── Google Sheets: submit for processing ──────────────────────────────────────
  const handleSheetsSubmit = async () => {
    if (sheetsResult?.status !== "ok") return;
    setSheetsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("import-google-sheet", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { action: "import", sheetUrl: sheetsUrl.trim(), userId },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: "Import Failed", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "Processing Started", description: `${data.rowCount} rows submitted. You'll receive an email when results are ready.` });
        setSheetsUrl("");
        setSheetsResult(null);
      }
    } catch {
      toast({ title: "Processing Failed", description: "We couldn't reach the processing server. Please try again shortly.", variant: "destructive" });
    } finally {
      setSheetsSubmitting(false);
    }
  };

  // ── Card style ────────────────────────────────────────────────────────────────
  const cardClass = (mode: ActiveMode) =>
    `p-4 rounded-xl border transition-all duration-200 cursor-pointer group ${
      activeMode === mode
        ? "border-[#009da5]/60 bg-[#009da5]/8 shadow-[0_0_0_1px_rgba(0,157,165,0.2)]"
        : "border-[#1e4040]/60 bg-[#0a1818] hover:border-[#009da5]/30"
    }`;

  return (
    <div className="rounded-2xl overflow-hidden border border-[#1e4040]/60 shadow-[0_12px_56px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,157,165,0.06)]">

      {/* ── SECTION 01: Input Method ─────────────────────────────────────────── */}
      <div className="bg-[#0c1d1d] px-7 pt-8 pb-8 border-b border-[#1e4040]/55">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-[12px] font-black tracking-[0.3em] text-[#009da5]/80 shrink-0 tabular-nums">01</span>
          <span className="text-[16px] font-bold tracking-[0.16em] uppercase text-[#70e8e8] shrink-0">Input Method</span>
          <div className="flex-1 h-px bg-gradient-to-r from-[#009da5]/30 to-transparent" />
        </div>

        <p className="text-[14px] text-[#3d7070] font-medium mb-6">Choose how you'd like to add your companies</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Microsoft Excel */}
          <div className={cardClass("excel")} onClick={() => setActiveMode("excel")}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-[#009da5]/10 group-hover:bg-[#009da5]/18 transition-colors">
                <FileSpreadsheet className="h-5 w-5 text-[#009da5]" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-white">Microsoft Excel</h3>
                <p className="text-[11px] text-[#3d7070]">Download .xlsm template</p>
              </div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); handleDownloadTemplate(); }}
              className="w-full h-9 rounded-lg border border-[#254848] bg-transparent text-[12px] font-semibold text-[#58dddd] hover:bg-[#009da5]/10 hover:border-[#009da5]/50 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Download Template
            </button>
          </div>

          {/* Google Sheets */}
          <div className={cardClass("sheets-copy")} onClick={() => setActiveMode("sheets-copy")}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-[#009da5]/10 group-hover:bg-[#009da5]/18 transition-colors">
                <svg className="h-5 w-5 text-[#009da5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-[14px] font-semibold text-white">Google Sheets</h3>
                <p className="text-[11px] text-[#3d7070]">With option picker tab</p>
              </div>
              <Link
                to="/google-sheets-guide"
                onClick={e => e.stopPropagation()}
                className="text-[11px] text-[#3d7070] hover:text-[#58dddd] transition-colors flex items-center gap-1"
              >
                <BookOpen className="h-3 w-3" />
                Guide
              </Link>
            </div>
            <button
              onClick={e => {
                e.stopPropagation();
                window.open(GOOGLE_SHEET_COPY_URL, "_blank", "noopener,noreferrer");
                toast({ title: "Google Sheets Opened", description: "Make a copy, fill it with your data, then download and upload here" });
              }}
              className="w-full h-9 rounded-lg border border-[#254848] bg-transparent text-[12px] font-semibold text-[#58dddd] hover:bg-[#009da5]/10 hover:border-[#009da5]/50 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Make a Copy
            </button>
          </div>

          {/* Spreadsheet (new) */}
          <div className={cardClass("spreadsheet")} onClick={() => setActiveMode("spreadsheet")}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-[#009da5]/10 group-hover:bg-[#009da5]/18 transition-colors">
                <Table2 className="h-5 w-5 text-[#009da5]" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-white">Spreadsheet</h3>
                <p className="text-[11px] text-[#3d7070]">Paste from Excel directly</p>
              </div>
            </div>
            <div className="w-full h-9 rounded-lg bg-[#009da5]/10 border border-[#009da5]/25 flex items-center justify-center gap-2">
              <Check className="h-3.5 w-3.5 text-[#009da5]" />
              <span className="text-[12px] font-semibold text-[#58dddd]">Recommended</span>
            </div>
          </div>

        </div>

        {activeMode === "excel" && (
          <div className="mt-5 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <p className="text-[12px] text-[#5e9898]">Important: Keep headers unchanged for a successful upload.</p>
          </div>
        )}
      </div>

      {/* ── SECTION 02: Spreadsheet Grid / My Sheets Manager ─────────────────── */}
      {activeMode === "spreadsheet" && (
        <div className="bg-[#080f0f] px-7 pt-8 pb-8">
          {sheetView === "manager" ? (
            <SheetsManager
              userId={userId}
              currentDraftId={gridRef.current?.getCurrentDraftId() ?? null}
              onBack={() => setSheetView("grid")}
              onLoad={handleLoadFromManager}
              onDraftDeleted={handleDraftDeleted}
              onNewSheet={handleNewSheetFromManager}
            />
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <span className="text-[12px] font-black tracking-[0.3em] text-[#009da5]/80 shrink-0 tabular-nums">02</span>
                <span className="text-[16px] font-bold tracking-[0.16em] uppercase text-[#70e8e8] shrink-0">Enter Companies</span>
                <div className="flex-1 h-px bg-gradient-to-r from-[#009da5]/30 to-transparent" />
              </div>
              <SpreadsheetGrid
                ref={gridRef}
                userId={userId}
                userEmail={userEmail}
                onOpenManager={handleOpenManager}
              />
            </>
          )}
        </div>
      )}

      {/* ── SECTION 02: Google Sheets — URL Import OR File Upload ─────────────── */}
      {activeMode === "sheets-copy" && (
        <div className="bg-[#080f0f] px-7 pt-8 pb-8">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-[12px] font-black tracking-[0.3em] text-[#009da5]/80 shrink-0 tabular-nums">02</span>
            <span className="text-[16px] font-bold tracking-[0.16em] uppercase text-[#70e8e8] shrink-0">Import from Google Sheets</span>
            <div className="flex-1 h-px bg-gradient-to-r from-[#009da5]/30 to-transparent" />
          </div>

          {/* ── Two-column layout: URL import | File upload ───────────── */}
          <div className="flex gap-0 min-h-[220px]">

            {/* LEFT: Paste URL */}
            <div className="flex-1 flex flex-col gap-4 pr-6">
              <span className="text-[12px] font-bold text-white/60 tracking-[0.08em] uppercase">Paste Google Sheet URL</span>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#3d7070] pointer-events-none" />
                  <input
                    type="text"
                    value={sheetsUrl}
                    onChange={e => { setSheetsUrl(e.target.value); if (sheetsResult) setSheetsResult(null); }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSheetsImport(); } }}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#0a1818] border border-[#254848] text-[13px] text-white placeholder:text-[#2e5252] focus:outline-none focus:border-[#009da5]/60 focus:ring-1 focus:ring-[#009da5]/30 transition-colors"
                  />
                </div>
                <button
                  onClick={handleSheetsImport}
                  disabled={!sheetsUrl.trim() || sheetsValidating}
                  className="h-9 px-4 rounded-lg border border-[#254848] bg-[#0a1818] text-[12px] font-semibold text-[#58dddd] hover:bg-[#009da5]/10 hover:border-[#009da5]/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  {sheetsValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {sheetsValidating ? "Checking..." : "Import"}
                </button>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                Sheet must be public: <span className="text-[#58dddd]/70">Share</span> &rarr; <span className="text-[#58dddd]/70">Anyone with the link</span> &rarr; <span className="text-[#58dddd]/70">Viewer</span>
              </p>
              <button
                onClick={handleSheetsSubmit}
                disabled={sheetsResult?.status !== "ok" || sheetsSubmitting}
                className={`mt-auto h-10 rounded-lg font-semibold text-[13px] tracking-wide transition-colors disabled:opacity-20 disabled:cursor-not-allowed active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 ${
                  sheetsResult?.status === "ok" && !sheetsSubmitting
                    ? "bg-[#009da5] text-black hover:bg-[#00b2ba] shadow-[0_2px_12px_rgba(0,157,165,0.2)]"
                    : "bg-white/[0.03] text-[#2e5252] border border-white/[0.05]"
                }`}
              >
                {sheetsSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Processing...</> : <><Upload className="h-4 w-4" />Upload & Process</>}
              </button>
            </div>

            {/* CENTER: Vertical OR divider */}
            <div className="flex flex-col items-center gap-2 px-1">
              <div className="flex-1 w-px bg-[#1e4040]/60" />
              <span className="text-[11px] font-semibold text-[#3d7070] tracking-[0.1em] uppercase">or</span>
              <div className="flex-1 w-px bg-[#1e4040]/60" />
            </div>

            {/* RIGHT: File upload */}
            <div className="flex-1 flex flex-col gap-4 pl-6">
              <span className="text-[12px] font-bold text-white/60 tracking-[0.08em] uppercase">Upload Filled Template</span>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
                onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f && validateFile(f)) setSelectedFile(f); }}
                className={`flex-1 relative cursor-pointer rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 p-5 transition-colors ${
                  isDragging ? "border-[#009da5] bg-[#009da5]/8"
                    : selectedFile ? "border-[#009da5]/50 bg-[#009da5]/5"
                    : "border-[#254848] hover:border-[#009da5]/40 hover:bg-[#009da5]/5"
                }`}
              >
                <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm,.csv" onChange={handleFileChange} disabled={loading} className="hidden" />
                {selectedFile ? (
                  <>
                    <div className="p-2 rounded-full bg-[#009da5]/12"><FileSpreadsheet className="h-6 w-6 text-[#009da5]" /></div>
                    <p className="text-[13px] font-semibold text-white truncate max-w-full">{selectedFile.name}</p>
                    <p className="text-[11px] text-[#5e9898]">Click or drag to replace</p>
                  </>
                ) : (
                  <>
                    <div className={`p-2 rounded-full transition-colors ${isDragging ? "bg-[#009da5]/20" : "bg-[#1a3535]"}`}>
                      <Upload className={`h-6 w-6 ${isDragging ? "text-[#009da5]" : "text-[#3d7070]"}`} />
                    </div>
                    <p className="text-[13px] font-semibold text-white">{isDragging ? "Drop here" : "Drag & drop file"}</p>
                    <p className="text-[11px] text-[#5e9898]">or <span className="text-[#58dddd] font-medium">browse</span> &middot; .xlsx, .xlsm, .csv</p>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={handleFileSubmit as any}
                disabled={!selectedFile || loading}
                className={`h-10 rounded-lg font-semibold text-[13px] tracking-wide transition-colors disabled:opacity-20 disabled:cursor-not-allowed active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 ${
                  selectedFile && !loading
                    ? "bg-[#009da5] text-black hover:bg-[#00b2ba] shadow-[0_2px_12px_rgba(0,157,165,0.2)]"
                    : "bg-white/[0.03] text-[#2e5252] border border-white/[0.05]"
                }`}
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Processing...</> : <><Upload className="h-4 w-4" />Upload & Process</>}
              </button>
            </div>
          </div>

          {/* ── Progress bar (spans full width below) ──────────────────── */}
          {loading && currentStep !== "idle" && (
            <div className="space-y-3 p-4 mt-5 rounded-xl bg-[#0a1818] border border-[#1e4040]/55">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-white">{PROCESSING_STEPS.find(s => s.key === currentStep)?.label}</span>
                <span className="text-[13px] text-[#3d7070]">{getCurrentProgress()}%</span>
              </div>
              <Progress value={getCurrentProgress()} className="h-2" />
            </div>
          )}

          {/* ── Validation / error / success results (full width) ──────── */}
          {sheetsResult && sheetsResult.status === "error" && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] overflow-hidden mt-5">
              <div className="flex items-center gap-3 px-4 py-3">
                <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-red-300">
                    {sheetsResult.reason === "not_public"
                      ? "Sheet is not publicly accessible"
                      : sheetsResult.reason === "headers_mismatch"
                      ? "Header columns don't match the template"
                      : sheetsResult.reason === "validation_failed"
                      ? `${sheetsResult.errors?.length} validation error${(sheetsResult.errors?.length ?? 0) > 1 ? "s" : ""} found`
                      : "Import failed"}
                  </p>
                  {sheetsResult.reason === "not_public" && (
                    <p className="text-[12px] text-red-300/70 mt-1">
                      Open your Google Sheet &rarr; Click <span className="font-medium text-red-200">Share</span> (top right) &rarr; Under "General access", change to <span className="font-medium text-red-200">Anyone with the link</span> &rarr; Set role to <span className="font-medium text-red-200">Viewer</span> &rarr; Click <span className="font-medium text-red-200">Done</span>
                    </p>
                  )}
                  {sheetsResult.reason === "headers_mismatch" && sheetsResult.missingHeaders && (
                    <p className="text-[12px] text-red-300/70 mt-1">
                      Missing: {sheetsResult.missingHeaders.join(", ")}. Make sure you're using the Bravoro template.
                    </p>
                  )}
                  {sheetsResult.reason === "network" && (
                    <p className="text-[12px] text-red-300/70 mt-1">{sheetsResult.message}</p>
                  )}
                </div>
              </div>

              {sheetsResult.reason === "validation_failed" && sheetsResult.errors && sheetsResult.errors.length > 0 && (
                <>
                  <button
                    onClick={() => setSheetsErrorsExpanded(!sheetsErrorsExpanded)}
                    className="w-full flex items-center justify-between px-4 py-2 border-t border-red-500/20 hover:bg-red-500/[0.04] transition-colors cursor-pointer"
                  >
                    <span className="text-[12px] text-red-300/70">
                      {sheetsResult.summary && `${sheetsResult.summary.totalRows} rows found`}
                      {sheetsResult.summary?.jobSearchRows ? ` (${sheetsResult.summary.jobSearchRows} with Job Search)` : ""}
                    </span>
                    <span className="text-[12px] text-red-300/50 flex items-center gap-1">
                      {sheetsErrorsExpanded ? "Hide" : "Show"} details
                      {sheetsErrorsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </span>
                  </button>
                  {sheetsErrorsExpanded && (
                    <div className="px-4 pb-3 space-y-1 max-h-48 overflow-y-auto">
                      {sheetsResult.errors.map((err, i) => (
                        <div key={i} className="flex items-start gap-2 text-[12px] text-red-300/80">
                          <span className="text-red-500 mt-px shrink-0">&bull;</span>
                          <span>{err.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {sheetsResult && sheetsResult.status === "ok" && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] overflow-hidden mt-5">
              <div className="flex items-center gap-3 px-4 py-3">
                <CircleCheck className="h-5 w-5 text-emerald-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-emerald-300">File OK</p>
                  <p className="text-[12px] text-emerald-300/70 mt-0.5">
                    {sheetsResult.summary?.totalRows} row{(sheetsResult.summary?.totalRows ?? 0) !== 1 ? "s" : ""} ready to process
                    {sheetsResult.summary?.jobSearchRows ? ` \u00B7 ${sheetsResult.summary.jobSearchRows} with Job Search` : ""}
                  </p>
                </div>
                <div className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25">
                  <span className="text-[11px] font-semibold text-emerald-300 tracking-wide">VALIDATED</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SECTION 02: File Upload (Excel only) ──────────────────────────────── */}
      {activeMode === "excel" && (
        <div className="bg-[#080f0f] px-7 pt-8 pb-8">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-[12px] font-black tracking-[0.3em] text-[#009da5]/80 shrink-0 tabular-nums">02</span>
            <span className="text-[16px] font-bold tracking-[0.16em] uppercase text-[#70e8e8] shrink-0">Upload File</span>
            <div className="flex-1 h-px bg-gradient-to-r from-[#009da5]/30 to-transparent" />
          </div>

          <form onSubmit={handleFileSubmit} className="space-y-5">
            <span className="text-[13px] font-bold text-white tracking-[0.08em] uppercase">Upload Filled Template</span>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
              onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f && validateFile(f)) setSelectedFile(f); }}
              className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 transition-all duration-300 ${
                isDragging ? "border-[#009da5] bg-[#009da5]/8"
                  : selectedFile ? "border-[#009da5]/50 bg-[#009da5]/5"
                  : "border-[#254848] hover:border-[#009da5]/40 hover:bg-[#009da5]/5"
              }`}
            >
              <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm,.csv" onChange={handleFileChange} disabled={loading} className="hidden" />
              <div className="flex flex-col items-center justify-center gap-3 text-center">
                {selectedFile ? (
                  <>
                    <div className="p-3 rounded-full bg-[#009da5]/12"><FileSpreadsheet className="h-8 w-8 text-[#009da5]" /></div>
                    <div>
                      <p className="text-[15px] font-semibold text-white">{selectedFile.name}</p>
                      <p className="text-[12px] text-[#5e9898] mt-1">Click or drag to replace</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`p-3 rounded-full transition-colors ${isDragging ? "bg-[#009da5]/20" : "bg-[#1a3535]"}`}>
                      <Upload className={`h-8 w-8 ${isDragging ? "text-[#009da5]" : "text-[#3d7070]"}`} />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-white">{isDragging ? "Drop your file here" : "Drag & drop your file here"}</p>
                      <p className="text-[13px] text-[#5e9898] mt-1">or <span className="text-[#58dddd] font-medium">browse</span> to choose a file</p>
                      <p className="text-[12px] text-[#3d6060] mt-2">Supports .xlsx, .xlsm, .csv</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {loading && currentStep !== "idle" && (
              <div className="space-y-3 p-4 rounded-xl bg-[#0a1818] border border-[#1e4040]/55">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-white">{PROCESSING_STEPS.find(s => s.key === currentStep)?.label}</span>
                  <span className="text-[13px] text-[#3d7070]">{getCurrentProgress()}%</span>
                </div>
                <Progress value={getCurrentProgress()} className="h-2" />
                <div className="flex justify-between gap-2">
                  {PROCESSING_STEPS.map((step, index) => (
                    <div key={step.key} className="flex items-center gap-1.5">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] transition-colors ${getCurrentProgress() >= step.progress ? "bg-[#009da5] text-black" : "bg-[#1a3535] text-[#3d7070]"}`}>
                        {getCurrentProgress() >= step.progress ? <Check className="h-3 w-3" /> : index + 1}
                      </div>
                      <span className={`text-[12px] hidden sm:inline ${getCurrentProgress() >= step.progress ? "text-white" : "text-[#3d7070]"}`}>
                        {step.key === "parsing" ? "Parse" : step.key === "creating" ? "Create" : step.key === "triggering" ? "Process" : "Done"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={!selectedFile || loading}
              className={`w-full h-12 rounded-xl font-semibold text-[15px] tracking-wide transition-all duration-200 disabled:opacity-25 disabled:cursor-not-allowed active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 ${
                selectedFile && !loading
                  ? "bg-[#009da5] text-black hover:bg-[#00b2ba] shadow-[0_4px_16px_rgba(0,157,165,0.25)]"
                  : "bg-white/[0.03] text-[#2e5252] border border-white/[0.05]"
              }`}
            >
              {loading ? <><Loader2 className="h-5 w-5 animate-spin" />Processing...</> : <><Upload className="h-5 w-5" />Upload & Process</>}
            </button>
          </form>
        </div>
      )}

    </div>
  );
};
