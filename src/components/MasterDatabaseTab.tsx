import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  Database, 
  Search, 
  Download, 
  Building2, 
  Loader2, 
  ChevronDown,
  ExternalLink,
  Clock,
  X,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface MasterContact {
  id: string;
  person_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  email_2: string | null;
  phone_1: string | null;
  phone_2: string | null;
  linkedin: string | null;
  title: string | null;
  organization: string | null;
  domain: string | null;
  first_seen_at: string;
  last_updated_at: string;
}

interface CompanySummary {
  organization: string;
  contact_count: number;
}

const MasterDatabaseTab = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [companyContacts, setCompanyContacts] = useState<Record<string, MasterContact[]>>({});
  const [loadingContacts, setLoadingContacts] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CompanySummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showExportWarning, setShowExportWarning] = useState(false);
  const [totalContacts, setTotalContacts] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("master_contacts")
        .select("organization")
        .order("organization");

      if (error) throw error;

      const orgCounts: Record<string, number> = {};
      (data || []).forEach((item) => {
        const org = item.organization || "Unknown";
        orgCounts[org] = (orgCounts[org] || 0) + 1;
      });

      const companySummaries: CompanySummary[] = Object.entries(orgCounts)
        .map(([organization, contact_count]) => ({ organization, contact_count }))
        .sort((a, b) => a.organization.localeCompare(b.organization));

      setCompanies(companySummaries);
      setTotalContacts(data?.length || 0);
    } catch (error) {
      console.error("Error loading companies:", error);
      toast({
        title: "Failed to load companies",
        description: "Could not fetch master database",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadContacts = async (company: string) => {
    if (companyContacts[company]) return; // Already loaded
    
    setLoadingContacts(company);
    try {
      const { data, error } = await supabase
        .from("master_contacts")
        .select("*")
        .eq("organization", company)
        .order("last_updated_at", { ascending: false });

      if (error) throw error;

      setCompanyContacts((prev) => ({
        ...prev,
        [company]: (data as MasterContact[]) || [],
      }));
    } catch (error) {
      console.error("Error loading contacts:", error);
      toast({
        title: "Failed to load contacts",
        description: "Could not fetch contacts for this company",
        variant: "destructive",
      });
    } finally {
      setLoadingContacts(null);
    }
  };

  const handleCompanyToggle = (company: string) => {
    if (expandedCompany === company) {
      setExpandedCompany(null);
    } else {
      setExpandedCompany(company);
      loadContacts(company);
    }
  };

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const lowerQuery = query.toLowerCase();
    const filtered = companies.filter((c) =>
      c.organization.toLowerCase().includes(lowerQuery)
    );
    setSearchResults(filtered);
  }, [companies]);

  const handleClearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setIsSearching(false);
  };

  const displayedCompanies = isSearching ? searchResults : companies;

  const exportCompanyToExcel = async (company: string) => {
    setExporting(true);
    try {
      const { data, error } = await supabase
        .from("master_contacts")
        .select("*")
        .eq("organization", company);

      if (error) throw error;

      const contacts = (data as MasterContact[]) || [];
      
      const exportData = contacts.map((c) => ({
        "First Name": c.first_name || "",
        "Last Name": c.last_name || "",
        "Email": c.email || "",
        "Email 2": c.email_2 || "",
        "Phone 1": c.phone_1 || "",
        "Phone 2": c.phone_2 || "",
        "Title": c.title || "",
        "Organization": c.organization || "",
        "Domain": c.domain || "",
        "LinkedIn": c.linkedin || "",
        "First Seen": c.first_seen_at ? new Date(c.first_seen_at).toLocaleDateString() : "",
        "Last Updated": c.last_updated_at ? new Date(c.last_updated_at).toLocaleDateString() : "",
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(wb, ws, company.slice(0, 31));
      
      const date = new Date().toISOString().split("T")[0];
      const fileName = `master_db_${company.replace(/[^a-zA-Z0-9]/g, "_")}_${date}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast({
        title: "Export Complete",
        description: `Exported ${contacts.length} contacts for ${company}`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export Failed",
        description: "Could not export company data",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const exportEntireDatabase = async () => {
    setExporting(true);
    setShowExportWarning(false);
    
    try {
      const { data, error } = await supabase
        .from("master_contacts")
        .select("*")
        .order("organization");

      if (error) throw error;

      const allContacts = (data as MasterContact[]) || [];
      
      const byOrg: Record<string, MasterContact[]> = {};
      allContacts.forEach((c) => {
        const org = c.organization || "Unknown";
        if (!byOrg[org]) byOrg[org] = [];
        byOrg[org].push(c);
      });

      const wb = XLSX.utils.book_new();

      const summaryData = Object.entries(byOrg).map(([org, contacts]) => ({
        "Company": org,
        "Contact Count": contacts.length,
      }));
      summaryData.push({ "Company": "TOTAL", "Contact Count": allContacts.length });
      
      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

      Object.entries(byOrg).forEach(([org, orgContacts]) => {
        const exportData = orgContacts.map((c) => ({
          "First Name": c.first_name || "",
          "Last Name": c.last_name || "",
          "Email": c.email || "",
          "Email 2": c.email_2 || "",
          "Phone 1": c.phone_1 || "",
          "Phone 2": c.phone_2 || "",
          "Title": c.title || "",
          "Organization": c.organization || "",
          "Domain": c.domain || "",
          "LinkedIn": c.linkedin || "",
          "First Seen": c.first_seen_at ? new Date(c.first_seen_at).toLocaleDateString() : "",
          "Last Updated": c.last_updated_at ? new Date(c.last_updated_at).toLocaleDateString() : "",
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const sheetName = org.slice(0, 31).replace(/[*?:/\\[\]]/g, "_");
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      const date = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `master_database_full_${date}.xlsx`);

      toast({
        title: "Export Complete",
        description: `Exported ${allContacts.length} contacts across ${Object.keys(byOrg).length} companies`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export Failed",
        description: "Could not export database",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportEntireDatabase = () => {
    if (totalContacts > 10000) {
      setShowExportWarning(true);
    } else {
      exportEntireDatabase();
    }
  };

  if (loading) {
    return (
      <Card className="shadow-strong border-border/40 backdrop-blur-sm bg-card/90">
        <CardContent className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="shadow-strong border-border/40 backdrop-blur-sm bg-card/90 animate-fade-in">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl text-foreground">
                <Database className="h-5 w-5 text-primary" />
                Master Database
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground mt-1">
                Centralized contact repository • {totalContacts.toLocaleString()} contacts • {companies.length} companies
              </CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  className="border-border/50"
                  disabled={exporting || companies.length === 0}
                >
                  {exporting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {expandedCompany && (
                  <DropdownMenuItem onClick={() => exportCompanyToExcel(expandedCompany)}>
                    <Building2 className="h-4 w-4 mr-2" />
                    Export "{expandedCompany}"
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleExportEntireDatabase}>
                  <Database className="h-4 w-4 mr-2" />
                  Export Entire Database
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Search Bar */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search companies..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 pr-10 h-11 bg-muted/30 border-border/50"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="text-sm font-medium text-muted-foreground mb-3">
            Companies ({displayedCompanies.length})
          </div>
          <ScrollArea className="h-[600px] rounded-md border border-border/40 bg-muted/10">
            {displayedCompanies.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {isSearching ? "No companies match your search" : "No companies found"}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {displayedCompanies.map((company) => (
                  <Collapsible
                    key={company.organization}
                    open={expandedCompany === company.organization}
                    onOpenChange={() => handleCompanyToggle(company.organization)}
                  >
                    <CollapsibleTrigger className="w-full">
                      <div
                        className={`flex items-center justify-between p-4 rounded-lg text-left transition-colors ${
                          expandedCompany === company.organization
                            ? "bg-primary/10 border border-primary/30"
                            : "hover:bg-muted/50 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium text-foreground truncate">
                            {company.organization}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge variant="secondary" className="text-xs">
                            {company.contact_count} {company.contact_count === 1 ? "contact" : "contacts"}
                          </Badge>
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform ${
                              expandedCompany === company.organization ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 ml-8 mr-2 mb-4 rounded-lg border border-border/40 overflow-hidden bg-background/50">
                        {loadingContacts === company.organization ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/30">
                                  <TableHead className="font-semibold">Name</TableHead>
                                  <TableHead className="font-semibold">Title</TableHead>
                                  <TableHead className="font-semibold">Email</TableHead>
                                  <TableHead className="font-semibold">Phone</TableHead>
                                  <TableHead className="font-semibold">LinkedIn</TableHead>
                                  <TableHead className="font-semibold">Last Updated</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(companyContacts[company.organization] || []).length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                      No contacts found
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  (companyContacts[company.organization] || []).map((contact) => (
                                    <TableRow key={contact.id} className="hover:bg-muted/20">
                                      <TableCell className="font-medium">
                                        {contact.first_name || ""} {contact.last_name || ""}
                                      </TableCell>
                                      <TableCell className="text-muted-foreground">
                                        {contact.title || "-"}
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex flex-col">
                                          {contact.email && (
                                            <span className="text-sm">{contact.email}</span>
                                          )}
                                          {contact.email_2 && (
                                            <span className="text-xs text-muted-foreground">{contact.email_2}</span>
                                          )}
                                          {!contact.email && !contact.email_2 && "-"}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex flex-col">
                                          {contact.phone_1 && (
                                            <span className="text-sm">{contact.phone_1}</span>
                                          )}
                                          {contact.phone_2 && (
                                            <span className="text-xs text-muted-foreground">{contact.phone_2}</span>
                                          )}
                                          {!contact.phone_1 && !contact.phone_2 && "-"}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        {contact.linkedin ? (
                                          <a
                                            href={contact.linkedin}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary hover:underline flex items-center gap-1"
                                          >
                                            <ExternalLink className="h-3 w-3" />
                                            View
                                          </a>
                                        ) : (
                                          "-"
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                          <Clock className="h-3 w-3" />
                                          {format(new Date(contact.last_updated_at), "MMM d, yyyy")}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Large Export Warning Dialog */}
      <AlertDialog open={showExportWarning} onOpenChange={setShowExportWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Large Export Warning
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to export {totalContacts.toLocaleString()} contacts. This may take a while and create a large file. Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={exportEntireDatabase}>
              Continue Export
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default MasterDatabaseTab;
