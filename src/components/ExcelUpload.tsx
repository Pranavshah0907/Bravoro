import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Download, Upload, Loader2 } from "lucide-react";
import * as XLSX from 'xlsx';

interface ExcelUploadProps {
  userId: string;
}

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
    <Card className="border-border/50 shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Bulk Upload</CardTitle>
        <CardDescription>
          Download the template, fill it with your data, and upload it back
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <Button
            onClick={handleDownloadTemplate}
            variant="outline"
            className="w-full"
            size="lg"
          >
            <Download className="mr-2 h-5 w-5" />
            Download Excel Template
          </Button>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="excel-file">Upload Filled Template</Label>
              <Input
                id="excel-file"
                type="file"
                accept=".xlsx,.xlsm,.csv"
                onChange={handleFileChange}
                disabled={loading}
                className="cursor-pointer"
              />
            </div>

            {selectedFile && (
              <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
                <p className="text-sm text-muted-foreground">
                  Selected: <span className="text-foreground font-medium">{selectedFile.name}</span>
                </p>
              </div>
            )}

            <Button
              type="submit"
              disabled={!selectedFile || loading}
              className="w-full"
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
          </form>
        </div>
      </CardContent>
    </Card>
  );
};
