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
  const [webhookUrl, setWebhookUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<"processing" | "completed" | "error" | null>(null);

  useEffect(() => {
    // Load webhook URL from settings
    const loadWebhookUrl = async () => {
      const { data } = await supabase
        .from("webhook_settings")
        .select("webhook_url")
        .eq("user_id", userId)
        .single();
      
      if (data?.webhook_url) {
        setWebhookUrl(data.webhook_url);
      }
    };
    loadWebhookUrl();
  }, [userId]);

  const handleDownloadTemplate = () => {
    // Create CSV template
    const csvContent = "Company Name,Domain,Functions,Geography,Seniority\nAcme Corp,acme.com,\"Sales,Marketing\",United States,C-Level\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "leap_template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Template Downloaded",
      description: "Fill in the template and upload it back",
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file type
      const validTypes = [
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
      ];
      
      if (!validTypes.includes(file.type) && !file.name.endsWith(".csv") && !file.name.endsWith(".xlsx")) {
        toast({
          title: "Invalid File Type",
          description: "Please upload an Excel (.xlsx) or CSV file",
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

    if (!webhookUrl.trim()) {
      toast({
        title: "Webhook URL Required",
        description: "Please enter your n8n webhook URL",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Save webhook URL if changed
      await supabase
        .from("webhook_settings")
        .upsert({
          user_id: userId,
          webhook_url: webhookUrl.trim(),
        });

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

      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Content = reader.result?.toString().split(",")[1];

          // Send to n8n webhook
          const response = await fetch(webhookUrl.trim(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              searchId: search.id,
              fileName: selectedFile.name,
              fileContent: base64Content,
              timestamp: new Date().toISOString(),
            }),
          });

          if (!response.ok) {
            throw new Error(`Webhook request failed with status ${response.status}`);
          }

          toast({
            title: "File Uploaded",
            description: "Your Excel file is being processed",
          });
        } catch (webhookError: any) {
          // Update search status to error
          await supabase
            .from("searches")
            .update({
              status: "error",
              error_message: webhookError.message,
            })
            .eq("id", search.id);

          setProcessingStatus("error");
          
          toast({
            title: "Upload Failed",
            description: webhookError.message,
            variant: "destructive",
          });
        } finally {
          setLoading(false);
        }
      };

      reader.onerror = () => {
        toast({
          title: "File Read Error",
          description: "Failed to read the file",
          variant: "destructive",
        });
        setLoading(false);
      };

      reader.readAsDataURL(selectedFile);
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
        <div className="space-y-2">
          <Label htmlFor="webhook-excel">n8n Webhook URL *</Label>
          <Input
            id="webhook-excel"
            type="url"
            placeholder="https://your-n8n-instance.com/webhook/..."
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            required
          />
        </div>

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
              accept=".xlsx,.xls,.csv"
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
            disabled={!selectedFile || !webhookUrl.trim() || loading}
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
