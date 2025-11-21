import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, RefreshCw, CheckCircle2, XCircle } from "lucide-react";

interface ProcessingStatusProps {
  searchId: string;
  onReset: () => void;
}

export const ProcessingStatus = ({ searchId, onReset }: ProcessingStatusProps) => {
  const { toast } = useToast();
  const [status, setStatus] = useState<"processing" | "completed" | "error">("processing");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDownload = async (path: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("results")
        .download(path);

      if (error) throw error;

      const blob = data;
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = path.split("/").pop() || "leap_results.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      toast({
        title: "Report Downloaded Successfully!",
        description: "Your enriched data has been downloaded",
      });
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download Failed",
        description: "Failed to download the file. Please try again.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    // Subscribe to real-time updates
    const channel = supabase
      .channel("search-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "searches",
          filter: `id=eq.${searchId}`,
        },
        (payload) => {
          const newStatus = payload.new.status as "processing" | "completed" | "error";
          setStatus(newStatus);
          
          if (newStatus === "completed") {
            const url = payload.new.result_url;
            setResultUrl(url);
            
            // Auto-trigger download
            if (url) {
              handleDownload(url);
            }
          } else if (newStatus === "error") {
            setErrorMessage(payload.new.error_message);
            toast({
              title: "Processing Failed",
              description: payload.new.error_message || "An error occurred",
              variant: "destructive",
            });
          }
        }
      )
      .subscribe();

    // Also check current status
    const checkStatus = async () => {
      const { data } = await supabase
        .from("searches")
        .select("status, result_url, error_message")
        .eq("id", searchId)
        .single();

      if (data) {
        const searchStatus = data.status as "processing" | "completed" | "error";
        setStatus(searchStatus);
        if (searchStatus === "completed" && data.result_url) {
          setResultUrl(data.result_url);
          
          // Auto-trigger download if already completed
          handleDownload(data.result_url);
        } else if (searchStatus === "error") {
          setErrorMessage(data.error_message);
        }
      }
    };

    checkStatus();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [searchId, toast]);

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle>Request Status</CardTitle>
        <CardDescription>Track the progress of your lead enrichment request</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {status === "processing" && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
            <h3 className="text-lg font-medium mb-2">Processing Your Request</h3>
            <p className="text-sm text-muted-foreground text-center">
              This may take a few minutes. You can wait here or check back later.
            </p>
          </div>
        )}

        {status === "completed" && (
          <div className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-lg font-medium mb-2">Processing Complete!</h3>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Your enriched data is ready to download
            </p>
            <Button onClick={() => resultUrl && handleDownload(resultUrl)} size="lg" className="mb-4">
              <Download className="mr-2 h-5 w-5" />
              Download Results
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center justify-center py-12">
            <XCircle className="h-16 w-16 text-destructive mb-4" />
            <h3 className="text-lg font-medium mb-2">Processing Failed</h3>
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>
                {errorMessage || "An unexpected error occurred while processing your request"}
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={onReset} className="flex-1">
            <RefreshCw className="mr-2 h-4 w-4" />
            Submit New Request
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
