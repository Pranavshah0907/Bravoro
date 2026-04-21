import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import * as XLSX from "xlsx";

interface SearchSummary {
  companyName: string;
  domain: string;
  functions: string[];
  seniority: string[];
  geography: string;
  resultsPerFunction: number;
  includeJobSearch: boolean;
  jobTitles: string[];
  jobSeniority: string[];
}

interface ProcessingStatusProps {
  searchId: string;
  onReset: () => void;
  searchSummary?: SearchSummary;
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

export const ProcessingStatus = ({ searchId, onReset, searchSummary }: ProcessingStatusProps) => {
  const { toast } = useToast();
  const [status, setStatus] = useState<"processing" | "completed" | "error" | "queued">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const statusRef = useRef(status);
  statusRef.current = status;

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
        .select("company_name, search_type, excel_file_name")
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

      const srcName = (search as any)?.excel_file_name?.replace(/\.[^.]+$/, "")
        || search?.company_name?.replace(/[\\/*?:\[\]]/g, '').substring(0, 50)
        || "search_results";
      const fileName = `${srcName}_processed.xlsx`;

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

  // Fetch queue position
  const fetchQueuePosition = async () => {
    const { data } = await supabase.rpc('get_queue_position', { p_search_id: searchId });
    if (data !== null && data !== undefined) {
      setQueuePosition(data);
    }
  };

  useEffect(() => {
    // Subscribe to real-time updates for search status
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
          const newStatus = payload.new.status as "processing" | "completed" | "error" | "queued";
          setStatus(newStatus);

          if (newStatus === "completed") {
            toastRef.current({
              title: "Processing Complete!",
              description: "Your enriched data is ready to export",
            });
          } else if (newStatus === "error") {
            setErrorMessage(payload.new.error_message);
            toastRef.current({
              title: "Processing Failed",
              description: payload.new.error_message || "An error occurred",
              variant: "destructive",
            });
          } else if (newStatus === "queued") {
            fetchQueuePosition();
          }
        }
      )
      .subscribe();

    // Subscribe to queue changes for position updates
    const queueChannel = supabase
      .channel("queue-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "request_queue",
        },
        () => {
          if (statusRef.current === "queued") {
            fetchQueuePosition();
          }
        }
      )
      .subscribe();

    // Check current status
    const checkStatus = async () => {
      const { data } = await supabase
        .from("searches")
        .select("status, error_message")
        .eq("id", searchId)
        .single();

      if (data) {
        const searchStatus = data.status as "processing" | "completed" | "error" | "queued";
        setStatus(searchStatus);
        if (searchStatus === "error") {
          setErrorMessage(data.error_message);
        }
        if (searchStatus === "queued") {
          fetchQueuePosition();
        }
      }
    };

    checkStatus();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(queueChannel);
    };
  }, [searchId]);

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle>Request Status</CardTitle>
        <CardDescription>Track the progress of your lead enrichment request</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Search Summary ── */}
        {searchSummary && (
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
            <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground mb-3">Search Summary</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Company</p>
                <p className="font-semibold text-foreground">{searchSummary.companyName}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Domain</p>
                <p className="font-semibold text-foreground">{searchSummary.domain}</p>
              </div>
              {searchSummary.geography && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Geography</p>
                  <p className="font-semibold text-foreground">{searchSummary.geography}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Results / Function</p>
                <p className="font-semibold text-foreground">{searchSummary.resultsPerFunction}</p>
              </div>
              {searchSummary.functions.length > 0 && (
                <div className="col-span-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Functions</p>
                  <p className="font-medium text-foreground">{searchSummary.functions.join(" · ")}</p>
                </div>
              )}
              <div className="col-span-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Seniority</p>
                <p className="font-medium text-foreground">{searchSummary.seniority.join(" · ")}</p>
              </div>
              {searchSummary.includeJobSearch && searchSummary.jobTitles.length > 0 && (
                <div className="col-span-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Job Titles</p>
                  <p className="font-medium text-foreground">{searchSummary.jobTitles.join(" · ")}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {status === "queued" && (
          <div className="flex flex-col items-center justify-center py-12">
            <Clock className="h-16 w-16 text-amber-500 mb-4" />
            <h3 className="text-lg font-medium mb-2">In Queue</h3>
            <p className="text-sm text-muted-foreground text-center mb-2">
              Your request is waiting for an available processing slot.
            </p>
            {queuePosition > 0 && (
              <div className="bg-amber-500/10 text-amber-600 px-4 py-2 rounded-full text-sm font-medium">
                Position in queue: {queuePosition}
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center mt-4">
              Your request will be processed automatically when a slot becomes available.
            </p>
          </div>
        )}

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
