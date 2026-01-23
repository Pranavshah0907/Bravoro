import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import * as XLSX from "xlsx";

interface ProcessingStatusProps {
  searchId: string;
  onReset: () => void;
}

interface Contact {
  First_Name: string;
  Last_Name: string;
  Domain: string;
  Organization: string;
  Title: string;
  Email: string;
  LinkedIn: string;
  Phone_Number_1: string;
  Phone_Number_2: string;
}

interface SearchResult {
  id: string;
  search_id: string;
  company_name: string;
  domain: string | null;
  contact_data: Contact[];
  result_type?: string;
}

export const ProcessingStatus = ({ searchId, onReset }: ProcessingStatusProps) => {
  const { toast } = useToast();
  const [status, setStatus] = useState<"processing" | "completed" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      // Fetch results from search_results table
      const { data: results, error: resultsError } = await supabase
        .from("search_results")
        .select("*")
        .eq("search_id", searchId);

      if (resultsError) throw resultsError;

      if (!results || results.length === 0) {
        toast({
          title: "No Data",
          description: "No results found to export",
          variant: "destructive",
        });
        return;
      }

      // Get search info for company name (for manual type)
      const { data: search } = await supabase
        .from("searches")
        .select("company_name, search_type")
        .eq("id", searchId)
        .single();

      const searchResults: SearchResult[] = results.map(item => ({
        ...item,
        contact_data: Array.isArray(item.contact_data) ? item.contact_data as unknown as Contact[] : []
      }));

      const wb = XLSX.utils.book_new();
      const usedSheetNames = new Set<string>();

      // For manual type, use company name as sheet name (segregated logic)
      searchResults.forEach(result => {
        const sheetData = result.contact_data.map(contact => ({
          First_Name: contact.First_Name,
          Last_Name: contact.Last_Name,
          Domain: result.domain || contact.Domain,
          Organization: result.company_name,
          Title: contact.Title,
          Email: contact.Email,
          LinkedIn: contact.LinkedIn,
          Phone_Number_1: contact.Phone_Number_1,
          Phone_Number_2: contact.Phone_Number_2,
        }));

        if (sheetData.length === 0) return;

        const ws = XLSX.utils.json_to_sheet(sheetData);

        // Sanitize sheet name (Excel has 31 char limit, no special chars)
        let sheetName = (result.company_name || 'Unknown')
          .replace(/[\\/*?:\[\]]/g, '')
          .trim()
          .substring(0, 31);
        
        if (!sheetName) sheetName = 'Company';

        // Ensure unique sheet names
        let finalName = sheetName;
        let counter = 1;
        while (usedSheetNames.has(finalName)) {
          const suffix = `_${counter}`;
          finalName = sheetName.substring(0, 31 - suffix.length) + suffix;
          counter++;
        }
        usedSheetNames.add(finalName);

        XLSX.utils.book_append_sheet(wb, ws, finalName);
      });

      if (wb.SheetNames.length === 0) {
        toast({
          title: "No Data",
          description: "No contacts found to export",
          variant: "destructive",
        });
        return;
      }

      const fileName = search?.company_name 
        ? `${search.company_name.replace(/[\\/*?:\[\]]/g, '').substring(0, 50)}_results.xlsx`
        : `search_results_${searchId.slice(0, 8)}.xlsx`;

      XLSX.writeFile(wb, fileName);

      toast({
        title: "Export Complete",
        description: "Your enriched data has been exported to Excel",
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export Failed",
        description: "Failed to export the results. Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
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
            toast({
              title: "Processing Complete!",
              description: "Your enriched data is ready to export",
            });
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
        .select("status, error_message")
        .eq("id", searchId)
        .single();

      if (data) {
        const searchStatus = data.status as "processing" | "completed" | "error";
        setStatus(searchStatus);
        if (searchStatus === "error") {
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
              Your enriched data is ready to export
            </p>
            <Button 
              onClick={handleExportExcel} 
              size="lg" 
              className="mb-4"
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Download className="mr-2 h-5 w-5" />
              )}
              Export Excel
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
