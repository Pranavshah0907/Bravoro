import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Download, Upload, Loader2, FileSpreadsheet, ExternalLink, BookOpen, Users, Check, Info, AlertTriangle } from "lucide-react";
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

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch("/Bulk_PeopleEnrichment_Template.xlsx");
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Bulk_PeopleEnrichment_Template.xlsx";
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
      description: "Make a copy, fill it with your data, then download and upload here",
    });
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
      const { error: webhookError } = await supabase.functions.invoke(
        "trigger-n8n-webhook",
        {
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
    <Card className="shadow-strong hover-lift border border-border backdrop-blur-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl flex items-center gap-2">
          <Users className="h-5 w-5 text-accent" />
          Bulk People Enrichment
        </CardTitle>
        <CardDescription className="text-base">
          Enrich existing contact lists with updated information
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Template Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Microsoft Excel Template */}
          <div className="p-4 rounded-xl border border-border/50 bg-gradient-to-br from-accent/5 to-accent/10 hover:border-accent/30 transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-accent/10 group-hover:bg-accent/20 transition-colors">
                <FileSpreadsheet className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Microsoft Excel</h3>
                <p className="text-xs text-muted-foreground">Download .xlsx template</p>
              </div>
            </div>
            <Button
              onClick={handleDownloadTemplate}
              variant="outline"
              className="w-full h-10 border-accent/30 hover:bg-accent/10 hover:border-accent/50 hover:text-accent transition-all"
            >
              <Download className="mr-2 h-4 w-4 text-accent" />
              Download Template
            </Button>
          </div>

          {/* Google Sheets Template */}
          <div className="p-4 rounded-xl border border-border/50 bg-gradient-to-br from-secondary/5 to-secondary/10 hover:border-secondary/30 transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-secondary/10 group-hover:bg-secondary/20 transition-colors">
                <svg className="h-5 w-5 text-secondary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 11V9H11V5H9V9H5V11H9V19H11V11H19Z" />
                  <path d="M19 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3ZM5 19V5H19V19H5Z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">Google Sheets</h3>
                <p className="text-xs text-muted-foreground">Copy to your Drive</p>
              </div>
            </div>
            <Button
              onClick={handleGoogleSheetCopy}
              variant="outline"
              className="w-full h-10 border-secondary/30 hover:bg-secondary/10 hover:border-secondary/50 hover:text-secondary transition-all"
            >
              <ExternalLink className="mr-2 h-4 w-4 text-secondary" />
              Make a Copy
            </Button>
          </div>
        </div>

        {/* Required fields note */}
        <div className="p-3 rounded-lg bg-muted/50 border border-border/30 space-y-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Required fields:</span> First Name, Last Name, Organization Domain
            <br />
            <span className="font-medium text-foreground">Optional:</span> Record ID
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="inline-block h-3.5 w-3.5 ml-1 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Option to include a unique identifier to track original data with enriched contacts</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            , LinkedIn URL
          </p>
          <p className="text-sm flex items-center gap-1.5">
            <span className="text-amber-500">⚠️</span>
            <span className="text-muted-foreground">Important: Keep headers unchanged for a successful upload.</span>
          </p>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-card px-3 py-1 text-muted-foreground rounded-full">Then upload your file</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-foreground font-medium">Upload Filled Template</Label>
            <div
              onClick={handleZoneClick}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                relative cursor-pointer rounded-xl border-2 border-dashed p-8 transition-all duration-300
                ${isDragging 
                  ? 'border-primary bg-primary/10 scale-[1.02]' 
                  : selectedFile 
                    ? 'border-primary/50 bg-primary/5' 
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }
              `}
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
                    <div className="p-3 rounded-full bg-primary/10">
                      <FileSpreadsheet className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{selectedFile.name}</p>
                      <p className="text-sm text-muted-foreground mt-1">Click or drag to replace</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`p-3 rounded-full transition-colors ${isDragging ? 'bg-primary/20' : 'bg-muted'}`}>
                      <Upload className={`h-8 w-8 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {isDragging ? 'Drop your file here' : 'Drag & drop your file here'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        or <span className="text-primary font-medium">browse</span> to choose a file
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">Supports .xlsx, .xlsm, .csv</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          {loading && currentStep !== 'idle' && (
            <div className="space-y-3 p-4 rounded-xl bg-muted/30 border border-border/50">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">
                  {PROCESSING_STEPS.find(s => s.key === currentStep)?.label}
                </span>
                <span className="text-muted-foreground">{getCurrentProgress()}%</span>
              </div>
              <Progress value={getCurrentProgress()} className="h-2" />
              <div className="flex justify-between gap-1">
                {PROCESSING_STEPS.map((step, index) => (
                  <div key={step.key} className="flex items-center gap-1">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs transition-colors ${
                      getCurrentProgress() >= step.progress 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {getCurrentProgress() >= step.progress ? <Check className="h-3 w-3" /> : index + 1}
                    </div>
                    <span className={`text-xs hidden md:inline ${
                      getCurrentProgress() >= step.progress ? 'text-foreground' : 'text-muted-foreground'
                    }`}>
                      {step.key === 'parsing' ? 'Parse' : step.key === 'validating' ? 'Validate' : step.key === 'creating' ? 'Create' : step.key === 'triggering' ? 'Process' : 'Done'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-center">
            <Button
              type="submit"
              disabled={!selectedFile || loading}
              className="w-full max-w-md h-12 bg-gradient-to-r from-primary to-accent hover:opacity-90 hover-glow text-base font-medium transition-all text-primary-foreground"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Validating & Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-5 w-5" />
                  Upload & Enrich
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
