import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Download, Upload, Loader2, FileSpreadsheet, ExternalLink } from "lucide-react";
import * as XLSX from 'xlsx';

interface ExcelUploadProps {
  userId: string;
}

const GOOGLE_SHEET_COPY_URL = "https://docs.google.com/spreadsheets/d/1QyNHmZ6whtOGs8qs8IeRqhqPGmqjKlfpFT0qEAH7PFM/copy";

export const ExcelUpload = ({ userId }: ExcelUploadProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch("/Final_template.xlsm");
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Final_template.xlsm";
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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
        return;
      }

      setSelectedFile(file);
    }
  };

  const parseExcelToJSON = async (file: File): Promise<any> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          
          const result: any = {};
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            result[sheetName] = XLSX.utils.sheet_to_json(worksheet);
          });
          
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsBinaryString(file);
    });
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

    try {
      // Step 1: Parse Excel to JSON
      console.log('Parsing Excel file...');
      const excelData = await parseExcelToJSON(selectedFile);
      
      // Step 2: Insert search record into Supabase
      console.log('Creating search record...');
      const { data: search, error: searchError } = await supabase
        .from("searches")
        .insert({
          user_id: userId,
          search_type: "bulk",
          excel_file_name: selectedFile.name,
          status: "processing",
        })
        .select()
        .single();

      if (searchError) throw searchError;

      console.log('Search created with ID:', search.id);

      // Step 3: Trigger N8N webhook via edge function
      const { error: webhookError } = await supabase.functions.invoke(
        "trigger-n8n-webhook",
        {
          body: {
            searchId: search.id,
            entryType: 'bulk_upload',
            searchData: {
              search_id: search.id,
              data: excelData
            },
          },
        }
      );

      if (webhookError) {
        throw new Error(`N8N webhook trigger failed: ${webhookError.message}`);
      }

      console.log('Webhook triggered successfully');

      toast({
        title: "Processing Started",
        description: "Your request is being processed. You will receive an email when your results are ready.",
      });

      // Reset form
      setSelectedFile(null);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        title: "Processing Failed",
        description: error instanceof Error ? error.message : "Failed to process your request",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-strong hover-lift border border-border backdrop-blur-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-accent" />
          Bulk Upload
        </CardTitle>
        <CardDescription className="text-base">
          Choose a template format, fill it with your data, and upload it back
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
                <p className="text-xs text-muted-foreground">Download .xlsm template</p>
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
              <div>
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
            <Label htmlFor="excel-file" className="text-foreground font-medium">Upload Filled Template</Label>
            <div className="flex justify-center">
              <Input
                id="excel-file"
                type="file"
                accept=".xlsx,.xlsm,.csv"
                onChange={handleFileChange}
                disabled={loading}
                className="cursor-pointer h-11 max-w-md file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 transition-all"
              />
            </div>
          </div>

          {selectedFile && (
            <div className="p-4 rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 animate-scale-in">
              <p className="text-sm text-foreground flex items-center justify-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                Selected: <span className="font-semibold">{selectedFile.name}</span>
              </p>
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
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-5 w-5" />
                  Upload & Process
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
