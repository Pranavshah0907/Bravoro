import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Database,
  Download,
  Building2, 
  Loader2, 
  ChevronDown,
  ExternalLink,
  Clock,
  X,
  AlertTriangle,
  User as UserIcon
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
import { AppSidebar } from "@/components/AppSidebar";
import { MobileHeader } from "@/components/MobileHeader";
import { MobileTabBar } from "@/components/MobileTabBar";

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

const UserDatabase = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [allContacts, setAllContacts] = useState<MasterContact[]>([]);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [companySearchQuery, setCompanySearchQuery] = useState("");
  const [personSearchQuery, setPersonSearchQuery] = useState("");
  const [showExportWarning, setShowExportWarning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      navigate("/auth");
      return;
    }

    setUser(session.user);

    // Check admin status for sidebar
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .single();
    
    setIsAdmin(roleData?.role === "admin");
    
    await loadUserContacts(session.user.id);
  };

  const loadUserContacts = async (userId: string) => {
    setLoading(true);
    try {
      // RLS will automatically filter to user's own contacts
      const allData: MasterContact[] = [];
      const PAGE_SIZE = 5000;
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from("master_contacts")
          .select("*")
          .eq("source_user_id", userId)
          .order("organization")
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        allData.push(...(data as MasterContact[]));
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      setAllContacts(allData);
    } catch (error) {
      console.error("Error loading contacts:", error);
      toast({
        title: "Failed to load contacts",
        description: "Could not fetch your contact database",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Build company summaries from all contacts
  const companies = useMemo<CompanySummary[]>(() => {
    const orgCounts: Record<string, number> = {};
    allContacts.forEach((contact) => {
      const org = contact.organization || "Unknown";
      orgCounts[org] = (orgCounts[org] || 0) + 1;
    });

    return Object.entries(orgCounts)
      .map(([organization, contact_count]) => ({ organization, contact_count }))
      .sort((a, b) => a.organization.localeCompare(b.organization));
  }, [allContacts]);

  // Filter contacts based on both search queries
  const filteredContacts = useMemo(() => {
    let filtered = allContacts;

    // Filter by company name
    if (companySearchQuery.trim()) {
      const lowerCompany = companySearchQuery.toLowerCase();
      filtered = filtered.filter((c) =>
        (c.organization || "").toLowerCase().includes(lowerCompany)
      );
    }

    // Filter by person name
    if (personSearchQuery.trim()) {
      const lowerPerson = personSearchQuery.toLowerCase();
      filtered = filtered.filter((c) => {
        const fullName = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
        return fullName.includes(lowerPerson);
      });
    }

    return filtered;
  }, [allContacts, companySearchQuery, personSearchQuery]);

  // Build filtered company summaries
  const filteredCompanies = useMemo<CompanySummary[]>(() => {
    const orgCounts: Record<string, number> = {};
    filteredContacts.forEach((contact) => {
      const org = contact.organization || "Unknown";
      orgCounts[org] = (orgCounts[org] || 0) + 1;
    });

    return Object.entries(orgCounts)
      .map(([organization, contact_count]) => ({ organization, contact_count }))
      .sort((a, b) => a.organization.localeCompare(b.organization));
  }, [filteredContacts]);

  // Get contacts for a specific company (from filtered results)
  const getCompanyContacts = useCallback((company: string) => {
    return filteredContacts.filter((c) => (c.organization || "Unknown") === company);
  }, [filteredContacts]);

  const handleCompanyToggle = (company: string) => {
    setExpandedCompany(expandedCompany === company ? null : company);
  };

  const handleClearCompanySearch = () => {
    setCompanySearchQuery("");
  };

  const handleClearPersonSearch = () => {
    setPersonSearchQuery("");
  };

  const handleClearAllFilters = () => {
    setCompanySearchQuery("");
    setPersonSearchQuery("");
  };

  const isFiltering = companySearchQuery.trim() || personSearchQuery.trim();

  const exportCompanyToExcel = async (company: string) => {
    setExporting(true);
    try {
      const contacts = getCompanyContacts(company);
      
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
      const fileName = `my_contacts_${company.replace(/[^a-zA-Z0-9]/g, "_")}_${date}.xlsx`;
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

  const exportAllContacts = async () => {
    setExporting(true);
    setShowExportWarning(false);
    
    try {
      const contactsToExport = isFiltering ? filteredContacts : allContacts;
      
      const byOrg: Record<string, MasterContact[]> = {};
      contactsToExport.forEach((c) => {
        const org = c.organization || "Unknown";
        if (!byOrg[org]) byOrg[org] = [];
        byOrg[org].push(c);
      });

      const wb = XLSX.utils.book_new();

      const summaryData = Object.entries(byOrg).map(([org, contacts]) => ({
        "Company": org,
        "Contact Count": contacts.length,
      }));
      summaryData.push({ "Company": "TOTAL", "Contact Count": contactsToExport.length });
      
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
      const fileName = isFiltering ? `my_contacts_filtered_${date}.xlsx` : `my_contacts_full_${date}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast({
        title: "Export Complete",
        description: `Exported ${contactsToExport.length} contacts across ${Object.keys(byOrg).length} companies`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export Failed",
        description: "Could not export contacts",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportAll = () => {
    const totalToExport = isFiltering ? filteredContacts.length : allContacts.length;
    if (totalToExport > 10000) {
      setShowExportWarning(true);
    } else {
      exportAllContacts();
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    navigate("/auth");
  };

  const handleHomeClick = () => {
    navigate("/dashboard");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex">
        <AppSidebar
          isAdmin={isAdmin}
          isDeveloper={user?.email === "pranavshah0907@gmail.com"}
          onSignOut={handleSignOut}
          onHomeClick={handleHomeClick}
        />
        <main className="flex-1 ml-0 md:ml-16 min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
            <p className="text-muted-foreground animate-pulse">Loading your database...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <AppSidebar
        isAdmin={isAdmin}
        isDeveloper={user?.email === "pranavshah0907@gmail.com"}
        onSignOut={handleSignOut}
        onHomeClick={handleHomeClick}
      />
      <MobileHeader />
      <MobileTabBar isAdmin={isAdmin} isDeveloper={user?.email === "pranavshah0907@gmail.com"} />

      <main className="flex-1 ml-0 md:ml-16 min-h-screen pt-14 pb-20 md:pt-0 md:pb-0">
        <div className="relative z-10 p-4 md:px-10 md:py-10 max-w-[1320px] mx-auto space-y-7">
          {/* Editorial header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 animate-fade-in">
            <div>
              <p className="eyebrow text-foreground/55 mb-2.5">Workspace · Contacts</p>
              <h1 className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight leading-none">
                My <span className="font-display text-primary">database</span>
              </h1>
              <p className="text-[13px] text-muted-foreground mt-2 font-mono tabular">
                <span className="text-foreground/80">{allContacts.length.toLocaleString()}</span> contacts · <span className="text-foreground/80">{companies.length}</span> companies
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-primary/30 text-foreground hover:bg-primary/10 hover:border-primary/50 transition-colors duration-300 text-xs"
                  disabled={exporting || allContacts.length === 0}
                >
                  {exporting ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover border-border">
                {expandedCompany && (
                  <DropdownMenuItem onClick={() => exportCompanyToExcel(expandedCompany)}>
                    <Building2 className="h-4 w-4 mr-2" />
                    Export "{expandedCompany}"
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleExportAll}>
                  <Database className="h-4 w-4 mr-2" />
                  {isFiltering ? "Export Filtered Results" : "Export All Contacts"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Search Filters Card */}
          <Card className="card-paper border-0 animate-fade-in" style={{ animationDelay: "0.03s" }}>
            <CardContent className="p-4 md:p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Company Search */}
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    placeholder="Search by company name..."
                    value={companySearchQuery}
                    onChange={(e) => setCompanySearchQuery(e.target.value)}
                    className="pl-10 pr-10 h-10 bg-muted/20 border-border/40"
                  />
                  {companySearchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearCompanySearch}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Person Search */}
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    placeholder="Search by person name..."
                    value={personSearchQuery}
                    onChange={(e) => setPersonSearchQuery(e.target.value)}
                    className="pl-10 pr-10 h-10 bg-muted/20 border-border/40"
                  />
                  {personSearchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearPersonSearch}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Active Filters Indicator */}
              {isFiltering && (
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    Showing {filteredContacts.length} of {allContacts.length} contacts
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAllFilters}
                    className="h-5 px-2 text-[10px] text-primary hover:text-primary"
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Companies List Card */}
          <Card className="card-paper border-0 animate-fade-in" style={{ animationDelay: "0.06s" }}>
            <CardContent className="p-0">
              <div className="px-5 py-3.5 border-b border-border bg-[hsl(var(--surface-sunken))] flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.16em]">
                  Companies <span className="font-mono tabular text-foreground/70 ml-1">({filteredCompanies.length})</span>
                </span>
              </div>

              <ScrollArea className="h-[calc(100vh-340px)] min-h-[400px]">
                {filteredCompanies.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    {isFiltering ? "No contacts match your search" : "No contacts found in your database"}
                  </div>
                ) : (
                  <div className="p-2 space-y-0.5">
                    {filteredCompanies.map((company) => (
                      <Collapsible
                        key={company.organization}
                        open={expandedCompany === company.organization}
                        onOpenChange={() => handleCompanyToggle(company.organization)}
                      >
                        <CollapsibleTrigger className="w-full">
                          <div
                            className={`flex items-center justify-between p-3 md:p-3.5 rounded-lg text-left transition-colors duration-200 ${
                              expandedCompany === company.organization
                                ? "bg-primary/10 border border-primary/20"
                                : "hover:bg-muted/30 border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Building2 className={`h-4 w-4 shrink-0 ${
                                expandedCompany === company.organization ? "text-primary" : "text-muted-foreground/60"
                              }`} />
                              <span className="text-sm font-medium text-foreground truncate">
                                {company.organization}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-[11px] text-muted-foreground tabular-nums">
                                {company.contact_count} {company.contact_count === 1 ? "contact" : "contacts"}
                              </span>
                              <ChevronDown
                                className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200 ${
                                  expandedCompany === company.organization ? "rotate-180" : ""
                                }`}
                              />
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-1 mx-2 mb-2 rounded-lg border border-border/30 overflow-hidden bg-background/30">
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/20 border-b border-border/30">
                                    <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Name</TableHead>
                                    <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Title</TableHead>
                                    <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Email</TableHead>
                                    <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Phone</TableHead>
                                    <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">LinkedIn</TableHead>
                                    <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Last Updated</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {getCompanyContacts(company.organization).length === 0 ? (
                                    <TableRow>
                                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                        No contacts found
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    getCompanyContacts(company.organization).map((contact) => (
                                      <TableRow key={contact.id} className="hover:bg-muted/15 border-b border-border/20">
                                        <TableCell className="font-medium text-sm">
                                          {contact.first_name || ""} {contact.last_name || ""}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
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
                                            {!contact.email && !contact.email_2 && <span className="text-muted-foreground/40">-</span>}
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
                                            {!contact.phone_1 && !contact.phone_2 && <span className="text-muted-foreground/40">-</span>}
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          {contact.linkedin ? (
                                            <a
                                              href={contact.linkedin}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-primary hover:text-primary/80 flex items-center gap-1 text-sm transition-colors"
                                            >
                                              <ExternalLink className="h-3 w-3" />
                                              View
                                            </a>
                                          ) : (
                                            <span className="text-muted-foreground/40">-</span>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Large Export Warning Dialog */}
      <AlertDialog open={showExportWarning} onOpenChange={setShowExportWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Large Export Warning
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to export {(isFiltering ? filteredContacts.length : allContacts.length).toLocaleString()} contacts. This may take a while and create a large file. Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={exportAllContacts}>
              Continue Export
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserDatabase;
