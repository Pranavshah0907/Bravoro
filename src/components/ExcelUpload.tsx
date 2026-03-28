import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Download, Upload, Loader2, FileSpreadsheet, ExternalLink,
  BookOpen, Check, AlertTriangle, Link2, RefreshCw, CircleCheck, CircleX,
} from "lucide-react";
import * as XLSX from 'xlsx';

const EXPECTED_HEADERS = [
  'Sr No', 'Organization Name', 'Organization Locations', 'Organization Domains',
  'Person Functions', 'Person Seniorities / Titles', 'Results per title',
  'Toggle job search', 'Job Title (comma separated)', 'Job Seniority', 'Date Posted (max age days)',
];

const GOOGLE_SHEET_COPY_URL   = "https://docs.google.com/spreadsheets/d/1Z4p1HJf5sMGgnNy_wGI04D-Jd0YNjSYq5A-PcEt-mbs/copy";
const GOOGLE_SHEET_TEMPLATE_URL = "https://docs.google.com/spreadsheets/d/1NcaoGsAy1mabRHHj-TQOBwjRZEvgMsq3KRt4MQZitMc/copy";

interface ExcelUploadProps { userId: string; }

type ProcessingStep = 'idle' | 'parsing' | 'creating' | 'triggering' | 'complete';
type SheetCheckStatus = 'idle' | 'checking' | 'accessible' | 'inaccessible';
type ActiveMode = 'excel' | 'sheets-copy' | 'sheets-url';

const PROCESSING_STEPS: { key: ProcessingStep; label: string; progress: number }[] = [
  { key: 'parsing',    label: 'Parsing file...',            progress: 25  },
  { key: 'creating',   label: 'Creating search record...',  progress: 50  },
  { key: 'triggering', label: 'Triggering processing...',   progress: 75  },
  { key: 'complete',   label: 'Complete!',                  progress: 100 },
];

export const ExcelUpload = ({ userId }: ExcelUploadProps) => {
  const { toast } = useToast();

  // ── File upload state ──────────────────────────────────────────────────────
  const [loading, setLoading]           = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging]     = useState(false);
  const [currentStep, setCurrentStep]   = useState<ProcessingStep>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Google Sheets URL state ────────────────────────────────────────────────
  const [activeMode, setActiveMode]           = useState<ActiveMode>('excel');
  const [sheetUrl, setSheetUrl]               = useState('');
  const [sheetCheckStatus, setSheetCheckStatus] = useState<SheetCheckStatus>('idle');
  const [sheetCheckMsg, setSheetCheckMsg]     = useState('');
  const [sheetImporting, setSheetImporting]   = useState(false);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch("/BulkSearch_Template_V2.xlsm");
      if (!response.ok) throw new Error('Download failed');
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

  const handleGoogleSheetCopy = () => {
    window.open(GOOGLE_SHEET_COPY_URL, "_blank", "noopener,noreferrer");
    toast({ title: "Google Sheets Opened", description: "Make a copy, fill it with your data, then download and upload here" });
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
          const workbook = XLSX.read(e.target?.result, { type: 'binary' });
          const result: any = {};
          let headers: string[] = [];
          workbook.SheetNames.forEach((sheetName) => {
            const ws = workbook.Sheets[sheetName];
            result[sheetName] = XLSX.utils.sheet_to_json(ws);
            if (sheetName === 'Main_Data' || (headers.length === 0 && sheetName === workbook.SheetNames[0])) {
              headers = (XLSX.utils.sheet_to_json(ws, { header: 1 })[0] as string[]) || [];
            }
          });
          resolve({ data: result, headers });
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsBinaryString(file);
    });

  const validateHeaders = (headers: string[]): boolean => {
    const norm = headers.map(h => String(h).replace(/\r\n|\r|\n/g, ' ').trim().toLowerCase());
    return EXPECTED_HEADERS.every(e => norm.includes(e.toLowerCase()));
  };

  const getCurrentProgress = () => PROCESSING_STEPS.find(s => s.key === currentStep)?.progress || 0;

  // ── File upload submit ─────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast({ title: "No File Selected", description: "Please select a file to upload", variant: "destructive" });
      return;
    }
    setLoading(true); setCurrentStep('parsing');
    try {
      const { data: excelData, headers } = await parseExcelToJSON(selectedFile);
      if (!validateHeaders(headers)) {
        toast({ title: "Header Names Mismatch", description: "Please use the same headers as in the template file and try again.", variant: "destructive" });
        setLoading(false); setCurrentStep('idle'); return;
      }
      setCurrentStep('creating');
      const { data: search, error: searchError } = await supabase
        .from("searches").insert({ user_id: userId, search_type: "bulk", excel_file_name: selectedFile.name, status: "processing" })
        .select().single();
      if (searchError) throw searchError;
      setCurrentStep('triggering');
      const { data: { session } } = await supabase.auth.getSession();
      const { error: webhookError } = await supabase.functions.invoke("trigger-n8n-webhook", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { searchId: search.id, entryType: 'bulk_upload', searchData: { search_id: search.id, data: excelData } },
      });
      if (webhookError) {
        toast({ title: "Processing Failed", description: "We couldn't reach the processing server. Please try again shortly.", variant: "destructive" });
        setCurrentStep('idle'); setLoading(false); return;
      }
      setCurrentStep('complete');
      toast({ title: "Processing Started", description: "Your request is being processed. You will receive an email when your results are ready." });
      setTimeout(() => { setSelectedFile(null); setCurrentStep('idle'); }, 1500);
    } catch (error) {
      toast({ title: "Processing Failed", description: error instanceof Error ? error.message : "Failed to process your request", variant: "destructive" });
      setCurrentStep('idle');
    } finally { setLoading(false); }
  };

  // ── Google Sheets URL: check access ───────────────────────────────────────
  const handleCheckAccess = async () => {
    if (!sheetUrl.trim()) return;
    setSheetCheckStatus('checking');
    setSheetCheckMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("import-google-sheet", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { action: 'check', sheetUrl: sheetUrl.trim(), userId },
      });
      if (error || !data) throw new Error(error?.message ?? 'Unknown error');
      if (data.accessible) {
        if (!data.headersValid) {
          setSheetCheckStatus('inaccessible');
          setSheetCheckMsg(`Sheet is accessible but missing columns: ${data.missingHeaders?.join(', ')}. Please use the Bravoro template.`);
        } else {
          setSheetCheckStatus('accessible');
          setSheetCheckMsg(`Sheet is accessible — ${data.rowCount} row${data.rowCount !== 1 ? 's' : ''} found.`);
        }
      } else {
        setSheetCheckStatus('inaccessible');
        setSheetCheckMsg(
          data.reason === 'not_public'
            ? 'Sheet is not publicly accessible.'
            : (data.reason ?? 'Could not access sheet.')
        );
      }
    } catch {
      setSheetCheckStatus('inaccessible');
      setSheetCheckMsg('Could not reach the sheet. Please check the URL and try again.');
    }
  };

  // ── Google Sheets URL: import & process ───────────────────────────────────
  const handleSheetImport = async () => {
    setSheetImporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("import-google-sheet", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { action: 'import', sheetUrl: sheetUrl.trim(), userId },
      });
      if (error || !data) throw new Error(error?.message ?? 'Unknown error');
      if (data.error) throw new Error(data.error);
      toast({ title: "Processing Started", description: `${data.rowCount} companies queued. You'll receive an email when results are ready.` });
      setSheetUrl(''); setSheetCheckStatus('idle'); setSheetCheckMsg('');
    } catch (err) {
      toast({ title: "Import Failed", description: err instanceof Error ? err.message : "Failed to import sheet.", variant: "destructive" });
    } finally { setSheetImporting(false); }
  };

  // ── Card style helpers ────────────────────────────────────────────────────
  const cardClass = (mode: ActiveMode) =>
    `p-4 rounded-xl border transition-all duration-200 cursor-pointer group ${
      activeMode === mode
        ? 'border-[#009da5]/60 bg-[#009da5]/8 shadow-[0_0_0_1px_rgba(0,157,165,0.2)]'
        : 'border-[#1e4040]/60 bg-[#0a1818] hover:border-[#009da5]/30'
    }`;

  return (
    <div className="rounded-2xl overflow-hidden border border-[#1e4040]/60 shadow-[0_12px_56px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,157,165,0.06)]">

      {/* ── SECTION 01: Get Template ────────────────────────────────────────── */}
      <div className="bg-[#0c1d1d] px-7 pt-8 pb-8 border-b border-[#1e4040]/55">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-[12px] font-black tracking-[0.3em] text-[#009da5]/80 shrink-0 tabular-nums">01</span>
          <span className="text-[16px] font-bold tracking-[0.16em] uppercase text-[#70e8e8] shrink-0">Get Template</span>
          <div className="flex-1 h-px bg-gradient-to-r from-[#009da5]/30 to-transparent" />
        </div>

        <p className="text-[14px] text-[#3d7070] font-medium mb-6">
          Choose how you'd like to fill in your companies
        </p>

        {/* Three template cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Microsoft Excel */}
          <div className={cardClass('excel')} onClick={() => setActiveMode('excel')}>
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
              onClick={(e) => { e.stopPropagation(); handleDownloadTemplate(); }}
              className="w-full h-9 rounded-lg border border-[#254848] bg-transparent text-[12px] font-semibold text-[#58dddd] hover:bg-[#009da5]/10 hover:border-[#009da5]/50 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Download Template
            </button>
          </div>

          {/* Google Sheets — script-based copy */}
          <div className={cardClass('sheets-copy')} onClick={() => setActiveMode('sheets-copy')}>
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
                <p className="text-[11px] text-[#3d7070]">With picker sidebars</p>
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
              onClick={(e) => { e.stopPropagation(); handleGoogleSheetCopy(); }}
              className="w-full h-9 rounded-lg border border-[#254848] bg-transparent text-[12px] font-semibold text-[#58dddd] hover:bg-[#009da5]/10 hover:border-[#009da5]/50 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Make a Copy
            </button>
          </div>

          {/* Google Sheets — plain URL */}
          <div className={cardClass('sheets-url')} onClick={() => setActiveMode('sheets-url')}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-[#009da5]/10 group-hover:bg-[#009da5]/18 transition-colors">
                <Link2 className="h-5 w-5 text-[#009da5]" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-white">Google Sheets URL</h3>
                <p className="text-[11px] text-[#3d7070]">No scripts, no warnings</p>
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); window.open(GOOGLE_SHEET_TEMPLATE_URL, "_blank", "noopener,noreferrer"); }}
              className="w-full h-9 rounded-lg border border-[#254848] bg-transparent text-[12px] font-semibold text-[#58dddd] hover:bg-[#009da5]/10 hover:border-[#009da5]/50 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Template
            </button>
          </div>
        </div>

        {/* Warning */}
        <div className="mt-5 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <p className="text-[12px] text-[#5e9898]">Important: Keep headers unchanged for a successful upload.</p>
        </div>
      </div>

      {/* ── SECTION 02: Upload File (Excel / Sheets Copy) ───────────────────── */}
      {activeMode !== 'sheets-url' && (
        <div className="bg-[#080f0f] px-7 pt-8 pb-8">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-[12px] font-black tracking-[0.3em] text-[#009da5]/80 shrink-0 tabular-nums">02</span>
            <span className="text-[16px] font-bold tracking-[0.16em] uppercase text-[#70e8e8] shrink-0">Upload File</span>
            <div className="flex-1 h-px bg-gradient-to-r from-[#009da5]/30 to-transparent" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <span className="text-[13px] font-bold text-white tracking-[0.08em] uppercase">Upload Filled Template</span>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f && validateFile(f)) setSelectedFile(f); }}
              className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 transition-all duration-300 ${
                isDragging ? 'border-[#009da5] bg-[#009da5]/8'
                  : selectedFile ? 'border-[#009da5]/50 bg-[#009da5]/5'
                  : 'border-[#254848] hover:border-[#009da5]/40 hover:bg-[#009da5]/5'
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
                    <div className={`p-3 rounded-full transition-colors ${isDragging ? 'bg-[#009da5]/20' : 'bg-[#1a3535]'}`}>
                      <Upload className={`h-8 w-8 ${isDragging ? 'text-[#009da5]' : 'text-[#3d7070]'}`} />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-white">{isDragging ? 'Drop your file here' : 'Drag & drop your file here'}</p>
                      <p className="text-[13px] text-[#5e9898] mt-1">or <span className="text-[#58dddd] font-medium">browse</span> to choose a file</p>
                      <p className="text-[12px] text-[#3d6060] mt-2">Supports .xlsx, .xlsm, .csv</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {loading && currentStep !== 'idle' && (
              <div className="space-y-3 p-4 rounded-xl bg-[#0a1818] border border-[#1e4040]/55">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-white">{PROCESSING_STEPS.find(s => s.key === currentStep)?.label}</span>
                  <span className="text-[13px] text-[#3d7070]">{getCurrentProgress()}%</span>
                </div>
                <Progress value={getCurrentProgress()} className="h-2" />
                <div className="flex justify-between gap-2">
                  {PROCESSING_STEPS.map((step, index) => (
                    <div key={step.key} className="flex items-center gap-1.5">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] transition-colors ${getCurrentProgress() >= step.progress ? 'bg-[#009da5] text-black' : 'bg-[#1a3535] text-[#3d7070]'}`}>
                        {getCurrentProgress() >= step.progress ? <Check className="h-3 w-3" /> : index + 1}
                      </div>
                      <span className={`text-[12px] hidden sm:inline ${getCurrentProgress() >= step.progress ? 'text-white' : 'text-[#3d7070]'}`}>
                        {step.key === 'parsing' ? 'Parse' : step.key === 'creating' ? 'Create' : step.key === 'triggering' ? 'Process' : 'Done'}
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
              {loading ? <><Loader2 className="h-5 w-5 animate-spin" />Processing…</> : <><Upload className="h-5 w-5" />Upload & Process</>}
            </button>
          </form>
        </div>
      )}

      {/* ── SECTION 02: Connect Google Sheet (URL mode) ─────────────────────── */}
      {activeMode === 'sheets-url' && (
        <div className="bg-[#080f0f] px-7 pt-8 pb-8">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-[12px] font-black tracking-[0.3em] text-[#009da5]/80 shrink-0 tabular-nums">02</span>
            <span className="text-[16px] font-bold tracking-[0.16em] uppercase text-[#70e8e8] shrink-0">Connect Sheet</span>
            <div className="flex-1 h-px bg-gradient-to-r from-[#009da5]/30 to-transparent" />
          </div>

          {/* Instructions */}
          <div className="mb-6 space-y-2">
            {[
              "Open the template and click File → Make a copy",
              "Fill in your company data using the dropdown menus",
              "Click Share → Anyone with the link → Viewer",
              "Paste your sheet URL below",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-[#009da5]/20 border border-[#009da5]/30 flex items-center justify-center text-[10px] font-bold text-[#009da5] shrink-0">{i + 1}</span>
                <span className="text-[13px] text-[#5e9898]">{step}</span>
              </div>
            ))}
          </div>

          {/* URL input + check */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="url"
                value={sheetUrl}
                onChange={(e) => { setSheetUrl(e.target.value); setSheetCheckStatus('idle'); setSheetCheckMsg(''); }}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="flex-1 h-11 rounded-lg bg-[#0a1818] border border-[#254848] px-4 text-[13px] text-white placeholder-[#3d6060] focus:outline-none focus:border-[#009da5]/50 transition-colors"
              />
              <button
                onClick={handleCheckAccess}
                disabled={!sheetUrl.trim() || sheetCheckStatus === 'checking'}
                className="h-11 px-4 rounded-lg border border-[#254848] bg-transparent text-[13px] font-semibold text-[#58dddd] hover:bg-[#009da5]/10 hover:border-[#009da5]/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 shrink-0 cursor-pointer"
              >
                {sheetCheckStatus === 'checking'
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Checking…</>
                  : <><RefreshCw className="h-4 w-4" />Check Access</>
                }
              </button>
            </div>

            {/* Status feedback */}
            {sheetCheckStatus === 'accessible' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-950/30 border border-emerald-700/30">
                <CircleCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-[13px] text-emerald-300">{sheetCheckMsg}</span>
              </div>
            )}

            {sheetCheckStatus === 'inaccessible' && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-950/30 border border-amber-700/30">
                  <CircleX className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <span className="text-[13px] text-amber-300">{sheetCheckMsg}</span>
                </div>
                {sheetCheckMsg.includes('not publicly') && (
                  <div className="p-3 rounded-lg bg-[#0a1818] border border-[#1e4040]/60 text-[12px] text-[#5e9898] space-y-1">
                    <p className="font-semibold text-white">How to make it public:</p>
                    <p>1. Open your sheet → click <span className="text-[#58dddd]">Share</span> (top right)</p>
                    <p>2. Under "General access" change <span className="text-[#58dddd]">Restricted</span> to <span className="text-[#58dddd]">Anyone with the link</span></p>
                    <p>3. Make sure the role is set to <span className="text-[#58dddd]">Viewer</span> → click Done</p>
                    <p>4. Come back and click Check Access again</p>
                  </div>
                )}
              </div>
            )}

            {/* Process button — only shown when accessible */}
            {sheetCheckStatus === 'accessible' && (
              <button
                onClick={handleSheetImport}
                disabled={sheetImporting}
                className="w-full h-12 rounded-xl font-semibold text-[15px] tracking-wide bg-[#009da5] text-black hover:bg-[#00b2ba] shadow-[0_4px_16px_rgba(0,157,165,0.25)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
              >
                {sheetImporting
                  ? <><Loader2 className="h-5 w-5 animate-spin" />Importing…</>
                  : <><Check className="h-5 w-5" />Process Sheet</>
                }
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
