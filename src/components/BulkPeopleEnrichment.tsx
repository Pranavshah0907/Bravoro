import { useState, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Download, Upload, Loader2, FileSpreadsheet, ExternalLink, Check, Info, AlertTriangle,
  Link2, CircleCheck, XCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import * as XLSX from 'xlsx';

// Expected headers for People Enrichment template
const EXPECTED_HEADERS = ['Sr No', 'Record Id', 'First Name', 'Last Name', 'Organization Domain', 'LinkedIn URL'];

interface BulkPeopleEnrichmentProps {
  userId: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

type ProcessingStep = 'idle' | 'parsing' | 'validating' | 'creating' | 'triggering' | 'complete';

const PROCESSING_STEPS: { key: ProcessingStep; label: string; progress: number }[] = [
  { key: 'parsing', label: 'Parsing file...', progress: 20 },
  { key: 'validating', label: 'Validating data...', progress: 40 },
  { key: 'creating', label: 'Creating search record...', progress: 60 },
  { key: 'triggering', label: 'Triggering processing...', progress: 80 },
  { key: 'complete', label: 'Complete!', progress: 100 },
];

const GOOGLE_SHEET_COPY_URL = "https://docs.google.com/spreadsheets/d/1Uxe1sT6QTRR2VAq7EIjvE8xMT0rYPm0XSC_4_-3zGIA/copy";

export const BulkPeopleEnrichment = ({ userId }: BulkPeopleEnrichmentProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [currentStep, setCurrentStep] = useState<ProcessingStep>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Google Sheets URL import state ──────────────────────────────────────────
  const [sheetsUrl,            setSheetsUrl]            = useState("");
  const [sheetsValidating,     setSheetsValidating]     = useState(false);
  const [sheetsSubmitting,     setSheetsSubmitting]     = useState(false);
  const [sheetsResult,         setSheetsResult]         = useState<{
    status: "ok" | "error";
    reason?: string;
    message?: string;
    errors?: { row: number; message: string }[];
    missingHeaders?: string[];
    summary?: { totalRows: number; jobSearchRows: number };
  } | null>(null);
  const [sheetsErrorsExpanded, setSheetsErrorsExpanded] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch("/Bulk_PeopleEnrichment.xlsx");
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Bulk_PeopleEnrichment.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Template Downloaded",
        description: "Fill in the template and upload it back",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download template. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleGoogleSheetCopy = () => {
    window.open(GOOGLE_SHEET_COPY_URL, "_blank", "noopener,noreferrer");
    toast({
      title: "Google Sheets Opened",
      description: "Make a copy, fill it with your data, then share publicly and paste the URL below",
    });
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
        body: { action: "validate", sheetUrl: sheetsUrl.trim(), userId, templateType: "people_enrichment" },
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
        body: { action: "import", sheetUrl: sheetsUrl.trim(), userId, templateType: "people_enrichment" },
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

  const validateFile = (file: File): boolean => {
    const validTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel.sheet.macroEnabled.12",
      "text/csv",
    ];
    
    if (!validTypes.includes(file.type) && !file.name.endsWith(".csv") && !file.name.endsWith(".xlsx") && !file.name.endsWith(".xlsm")) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an Excel (.xlsx, .xlsm) or CSV file",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
  };

  const handleZoneClick = () => {
    fileInputRef.current?.click();
  };

  const parseExcelToJSON = async (file: File): Promise<{ data: any; headers: string[] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          
          const result: any = {};
          let headers: string[] = [];
          
          workbook.SheetNames.forEach((sheetName, index) => {
            const worksheet = workbook.Sheets[sheetName];
            result[sheetName] = XLSX.utils.sheet_to_json(worksheet);
            
            // Get headers from the first sheet
            if (index === 0) {
              const headerRow = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[];
              headers = headerRow || [];
            }
          });
          
          resolve({ data: result, headers });
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsBinaryString(file);
    });
  };

  const validateHeaders = (headers: string[]): boolean => {
    const normalizedHeaders = headers.map(h => String(h).trim().toLowerCase());
    const normalizedExpected = EXPECTED_HEADERS.map(h => h.toLowerCase());
    
    for (const expected of normalizedExpected) {
      if (!normalizedHeaders.includes(expected)) {
        return false;
      }
    }
    return true;
  };

  const validateData = (excelData: any): ValidationError[] => {
    const errors: ValidationError[] = [];
    
    // Find the data - could be in the first sheet
    const sheetNames = Object.keys(excelData);
    if (sheetNames.length === 0) {
      errors.push({ row: 0, field: 'file', message: 'No data found in the file' });
      return errors;
    }

    const data = excelData[sheetNames[0]];
    if (!Array.isArray(data) || data.length === 0) {
      errors.push({ row: 0, field: 'file', message: 'No rows found in the file' });
      return errors;
    }

    // Validate each row - mandatory fields: First Name, Last Name, Organization Domain
    data.forEach((row: any, index: number) => {
      const rowNum = index + 2; // +2 because Excel rows start at 1 and we have a header row

      // Extract all key fields
      const firstName = row['First Name'] || row['First_Name'] || row['first name'] || row['first_name'];
      const lastName = row['Last Name'] || row['Last_Name'] || row['last name'] || row['last_name'];
      const domain = row['Organization Domain'] || row['Organization_Domain'] || row['organization domain'] || row['Domain'] || row['domain'];
      const linkedinUrl = row['LinkedIn URL'] || row['LinkedIn_URL'] || row['linkedin url'] || row['linkedin_url'];
      const recordId = row['Record Id'] || row['Record_Id'] || row['record id'] || row['record_id'];

      // Skip effectively empty rows (all key fields are empty/missing)
      const allEmpty = [firstName, lastName, domain, linkedinUrl, recordId].every(
        (val) => !val || String(val).trim() === ''
      );
      if (allEmpty) return;

      // Validate mandatory fields on non-empty rows
      if (!firstName || String(firstName).trim() === '') {
        errors.push({ row: rowNum, field: 'First Name', message: `Row ${rowNum}: First Name is required` });
      }
      if (!lastName || String(lastName).trim() === '') {
        errors.push({ row: rowNum, field: 'Last Name', message: `Row ${rowNum}: Last Name is required` });
      }
      if (!domain || String(domain).trim() === '') {
        errors.push({ row: rowNum, field: 'Organization Domain', message: `Row ${rowNum}: Organization Domain is required` });
      }
    });

    return errors;
  };

  const getCurrentProgress = () => {
    const step = PROCESSING_STEPS.find(s => s.key === currentStep);
    return step?.progress || 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile) {
      toast({
        title: "No File Selected",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setCurrentStep('parsing');

    try {
      // Step 1: Parse Excel to JSON
      console.log('Parsing Excel file...');
      const { data: excelData, headers } = await parseExcelToJSON(selectedFile);
      
      // Validate headers first
      if (!validateHeaders(headers)) {
        toast({
          title: "Header Names Mismatch",
          description: "Please use the same headers as in the template file and try again.",
          variant: "destructive",
        });
        setLoading(false);
        setCurrentStep('idle');
        return;
      }
      
      setCurrentStep('validating');
      
      // Step 2: Validate the data
      console.log('Validating data...');
      const validationErrors = validateData(excelData);
      
      if (validationErrors.length > 0) {
        // Show first 5 errors to avoid overwhelming the user
        const errorMessages = validationErrors.slice(0, 5).map(e => e.message).join('\n');
        const moreErrors = validationErrors.length > 5 ? `\n...and ${validationErrors.length - 5} more errors` : '';
        
        toast({
          title: "Validation Failed",
          description: errorMessages + moreErrors,
          variant: "destructive",
        });
        setLoading(false);
        setCurrentStep('idle');
        return;
      }

      setCurrentStep('creating');

      // Step 3: Insert search record into Supabase
      console.log('Creating search record...');
      const { data: search, error: searchError } = await supabase
        .from("searches")
        .insert({
          user_id: userId,
          search_type: "bulk_people_enrichment",
          excel_file_name: selectedFile.name,
          status: "processing",
        })
        .select()
        .single();

      if (searchError) throw searchError;

      console.log('Search created with ID:', search.id);

      setCurrentStep('triggering');

      // Step 4: Trigger processing via backend function
      console.log('Triggering processing...');
      const { data: { session } } = await supabase.auth.getSession();
      const { error: webhookError } = await supabase.functions.invoke(
        "trigger-n8n-webhook",
        {
          headers: { Authorization: `Bearer ${session?.access_token}` },
          body: {
            searchId: search.id,
            entryType: 'bulk_people_enrichment',
            searchData: {
              search_id: search.id,
              data: excelData,
            },
          },
        }
      );

      if (webhookError) {
        throw new Error(`N8N webhook trigger failed: ${webhookError.message}`);
      }

      console.log('Webhook triggered successfully');
      setCurrentStep('complete');

      toast({
        title: "Processing Started",
        description: "Your request is being processed. You will receive an email when your results are ready.",
      });

      // Reset form after a brief delay to show completion
      setTimeout(() => {
        setSelectedFile(null);
        setCurrentStep('idle');
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      }, 1500);
      
    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        title: "Processing Failed",
        description: error instanceof Error ? error.message : "Failed to process your request",
        variant: "destructive",
      });
      setCurrentStep('idle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl overflow-hidden border border-[#1e4040]/60 shadow-[0_12px_56px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,157,165,0.06)]">

      {/* ── SECTION 01: Template Options ──────────────────────────────────────── */}
      <div className="bg-[#0c1d1d] px-7 pt-8 pb-8 border-b border-[#1e4040]/55">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-[12px] font-black tracking-[0.3em] text-[#009da5]/80 shrink-0 tabular-nums">01</span>
          <span className="text-[16px] font-bold tracking-[0.16em] uppercase text-[#70e8e8] shrink-0">Template</span>
          <div className="flex-1 h-px bg-gradient-to-r from-[#009da5]/30 to-transparent" />
        </div>

        <p className="text-[14px] text-[#3d7070] font-medium mb-6">Download a template, fill it with your contacts, then upload below</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Microsoft Excel */}
          <div className="p-4 rounded-xl border border-[#1e4040]/60 bg-[#0a1818] hover:border-[#009da5]/30 transition-all duration-200 group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-[#009da5]/10 group-hover:bg-[#009da5]/18 transition-colors">
                <FileSpreadsheet className="h-5 w-5 text-[#009da5]" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-white">Microsoft Excel</h3>
                <p className="text-[11px] text-[#3d7070]">Download .xlsx template</p>
              </div>
            </div>
            <button
              onClick={handleDownloadTemplate}
              className="w-full h-9 rounded-lg border border-[#254848] bg-transparent text-[12px] font-semibold text-[#58dddd] hover:bg-[#009da5]/10 hover:border-[#009da5]/50 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Download Template
            </button>
          </div>

          {/* Google Sheets */}
          <div className="p-4 rounded-xl border border-[#1e4040]/60 bg-[#0a1818] hover:border-[#009da5]/30 transition-all duration-200 group">
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
                <p className="text-[11px] text-[#3d7070]">Copy, fill & paste URL below</p>
              </div>
            </div>
            <button
              onClick={handleGoogleSheetCopy}
              className="w-full h-9 rounded-lg border border-[#254848] bg-transparent text-[12px] font-semibold text-[#58dddd] hover:bg-[#009da5]/10 hover:border-[#009da5]/50 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Make a Copy
            </button>
          </div>
        </div>

        {/* Required fields note */}
        <div className="mt-5 p-3 rounded-lg bg-[#0a1818] border border-[#1e4040]/40 space-y-2">
          <p className="text-[13px] text-[#5e9898]">
            <span className="font-semibold text-white">Required fields:</span> First Name, Last Name, Organization Domain
            <br />
            <span className="font-semibold text-white">Optional:</span> Record ID
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="inline-block h-3.5 w-3.5 ml-1 text-[#3d7070] cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Option to include a unique identifier to track original data with enriched contacts</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            , LinkedIn URL
          </p>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <p className="text-[12px] text-[#5e9898]">Important: Keep headers unchanged for a successful upload.</p>
          </div>
        </div>
      </div>

      {/* ── SECTION 02: Import Data ──────────────────────────────────────────── */}
      <div className="bg-[#080f0f] px-7 pt-8 pb-8">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-[12px] font-black tracking-[0.3em] text-[#009da5]/80 shrink-0 tabular-nums">02</span>
          <span className="text-[16px] font-bold tracking-[0.16em] uppercase text-[#70e8e8] shrink-0">Import Data</span>
          <div className="flex-1 h-px bg-gradient-to-r from-[#009da5]/30 to-transparent" />
        </div>

        <div className="space-y-5">
          <span className="text-[13px] font-bold text-white tracking-[0.08em] uppercase">Paste your filled Google Sheet URL</span>

          {/* URL input + Import button */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#3d7070] pointer-events-none" />
              <input
                type="text"
                value={sheetsUrl}
                onChange={e => { setSheetsUrl(e.target.value); if (sheetsResult) setSheetsResult(null); }}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSheetsImport(); } }}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#0a1818] border border-[#254848] text-[14px] text-white placeholder:text-[#2e5252] focus:outline-none focus:border-[#009da5]/60 focus:ring-1 focus:ring-[#009da5]/30 transition-colors"
              />
            </div>
            <button
              onClick={handleSheetsImport}
              disabled={!sheetsUrl.trim() || sheetsValidating}
              className="h-11 px-6 rounded-xl border border-[#254848] bg-[#0a1818] text-[13px] font-semibold text-[#58dddd] hover:bg-[#009da5]/10 hover:border-[#009da5]/50 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2 shrink-0"
            >
              {sheetsValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {sheetsValidating ? "Checking..." : "Import"}
            </button>
          </div>

          {/* Sharing hint */}
          <p className="text-[12px] text-white/70">
            Your sheet must be shared publicly. In Google Sheets: <span className="text-[#58dddd]">Share</span> &rarr; <span className="text-[#58dddd]">General access</span> &rarr; <span className="text-[#58dddd]">Anyone with the link</span> &rarr; <span className="text-[#58dddd]">Viewer</span>
          </p>

          {/* ── Validation error result ────────────────────────────────── */}
          {sheetsResult && sheetsResult.status === "error" && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] overflow-hidden">
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
                      Missing: {sheetsResult.missingHeaders.join(", ")}. Make sure you're using the Bravoro People Enrichment template.
                    </p>
                  )}
                  {sheetsResult.reason === "network" && (
                    <p className="text-[12px] text-red-300/70 mt-1">{sheetsResult.message}</p>
                  )}
                </div>
              </div>

              {/* Expandable row-level errors */}
              {sheetsResult.reason === "validation_failed" && sheetsResult.errors && sheetsResult.errors.length > 0 && (
                <>
                  <button
                    onClick={() => setSheetsErrorsExpanded(!sheetsErrorsExpanded)}
                    className="w-full flex items-center justify-between px-4 py-2 border-t border-red-500/20 hover:bg-red-500/[0.04] transition-colors cursor-pointer"
                  >
                    <span className="text-[12px] text-red-300/70">
                      {sheetsResult.summary && `${sheetsResult.summary.totalRows} rows found`}
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

          {/* ── Success result ────────────────────────────────────────── */}
          {sheetsResult && sheetsResult.status === "ok" && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <CircleCheck className="h-5 w-5 text-emerald-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-emerald-300">File OK</p>
                  <p className="text-[12px] text-emerald-300/70 mt-0.5">
                    {sheetsResult.summary?.totalRows} row{(sheetsResult.summary?.totalRows ?? 0) !== 1 ? "s" : ""} ready to enrich
                  </p>
                </div>
                <div className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25">
                  <span className="text-[11px] font-semibold text-emerald-300 tracking-wide">VALIDATED</span>
                </div>
              </div>
            </div>
          )}

          {/* Submit button for URL import */}
          <button
            onClick={handleSheetsSubmit}
            disabled={sheetsResult?.status !== "ok" || sheetsSubmitting}
            className={`w-full h-12 rounded-xl font-semibold text-[15px] tracking-wide transition-all duration-200 disabled:opacity-25 disabled:cursor-not-allowed active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 ${
              sheetsResult?.status === "ok" && !sheetsSubmitting
                ? "bg-[#009da5] text-black hover:bg-[#00b2ba] shadow-[0_4px_16px_rgba(0,157,165,0.25)]"
                : "bg-white/[0.03] text-[#2e5252] border border-white/[0.05]"
            }`}
          >
            {sheetsSubmitting ? <><Loader2 className="h-5 w-5 animate-spin" />Processing...</> : <><Upload className="h-5 w-5" />Upload & Enrich</>}
          </button>

          {/* ── OR divider ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-4 py-1">
            <div className="flex-1 h-px bg-[#1e4040]/60" />
            <span className="text-[12px] font-semibold text-[#3d7070] tracking-[0.1em] uppercase">or</span>
            <div className="flex-1 h-px bg-[#1e4040]/60" />
          </div>

          {/* ── File Upload ──────────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <span className="text-[13px] font-bold text-white tracking-[0.08em] uppercase">Upload Filled Template</span>

            <div
              onClick={handleZoneClick}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 transition-all duration-300 ${
                isDragging ? "border-[#009da5] bg-[#009da5]/8"
                  : selectedFile ? "border-[#009da5]/50 bg-[#009da5]/5"
                  : "border-[#254848] hover:border-[#009da5]/40 hover:bg-[#009da5]/5"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xlsm,.csv"
                onChange={handleFileChange}
                disabled={loading}
                className="hidden"
              />
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

            {/* Progress Bar */}
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
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] transition-colors ${
                        getCurrentProgress() >= step.progress ? "bg-[#009da5] text-black" : "bg-[#1a3535] text-[#3d7070]"
                      }`}>
                        {getCurrentProgress() >= step.progress ? <Check className="h-3 w-3" /> : index + 1}
                      </div>
                      <span className={`text-[12px] hidden md:inline ${
                        getCurrentProgress() >= step.progress ? "text-white" : "text-[#3d7070]"
                      }`}>
                        {step.key === 'parsing' ? 'Parse' : step.key === 'validating' ? 'Validate' : step.key === 'creating' ? 'Create' : step.key === 'triggering' ? 'Process' : 'Done'}
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
              {loading ? <><Loader2 className="h-5 w-5 animate-spin" />Validating & Processing...</> : <><Upload className="h-5 w-5" />Upload & Enrich</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
