import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Download, Upload, Loader2, FileSpreadsheet } from "lucide-react";
import { ProcessingStatus } from "./ProcessingStatus";

interface ExcelUploadProps {
  userId: string;
}

export const ExcelUpload = ({ userId }: ExcelUploadProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<"processing" | "completed" | "error" | null>(null);

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
      // Check file type
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
      // Create search record
      const { data: search, error: searchError } = await supabase
        .from("searches")
        .insert({
          user_id: userId,
          search_type: "excel",
          status: "processing",
          excel_file_name: selectedFile.name,
        })
        .select()
        .single();

      if (searchError) throw searchError;

      setSearchId(search.id);
      setProcessingStatus("processing");

      // Send file to N8N webhook with binary data field named 'data'
      const formData = new FormData();
      formData.append('data', selectedFile);
      formData.append('searchId', search.id);

      const webhookResponse = await fetch('https://n8n.srv1081444.hstgr.cloud/webhook-test/upload-excel', {
        method: 'POST',
        body: formData,
      });

      if (!webhookResponse.ok) {
        throw new Error('Failed to upload file to webhook');
      }

      toast({
        title: "File Uploaded",
        description: "Your Excel file is being processed",
      });
      
      setLoading(false);

    } catch (error: any) {
      toast({
        title: "Submission Failed",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setSearchId(null);
    setProcessingStatus(null);
  };

  if (searchId && processingStatus) {
    return <ProcessingStatus searchId={searchId} onReset={handleReset} />;
  }

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle>Excel Upload</CardTitle>
        <CardDescription>
          Upload a filled template to submit multiple lead enrichment requests
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-lg bg-muted/20">
          <FileSpreadsheet className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Download Template First</h3>
          <p className="text-sm text-muted-foreground text-center mb-4">
            Download our Excel template, fill it with your data, and upload it back
          </p>
          <Button type="button" variant="outline" onClick={handleDownloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Download Template
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Upload Filled Template</Label>
            <Input
              id="file"
              type="file"
              accept=".xlsx,.xls,.xlsm,.csv"
              onChange={handleFileChange}
              required
            />
            {selectedFile && (
              <p className="text-sm text-muted-foreground">
                Selected: {selectedFile.name}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!selectedFile || loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload & Submit
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
