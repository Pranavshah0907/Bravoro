import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
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
import bravoroLogo from "@/assets/bravoro-logo.svg";

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
      const { data, error } = await supabase
        .from("master_contacts")
        .select("*")
        .eq("source_user_id", userId)
        .order("organization");

      if (error) throw error;

      setAllContacts((data as MasterContact[]) || []);
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
      <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent/8 rounded-full blur-3xl" />
        
        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground animate-pulse">Loading your database...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent/8 rounded-full blur-3xl pointer-events-none" />
      
      <AppSidebar
        isAdmin={isAdmin}
        isDeveloper={user?.email === "pranavshah0907@gmail.com"}
        onSignOut={handleSignOut}
        onHomeClick={handleHomeClick}
      />

      <main className="flex-1 p-6 ml-16 relative z-10">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">My Database</h1>
            <p className="text-muted-foreground mt-1">Your personal contact repository</p>
          </div>
          <img 
            src={bravoroLogo}
            alt="Bravoro Logo" 
            className="h-10 object-contain"
          />
        </div>

        {/* Main Content Card */}
        <Card className="shadow-strong border-border/40 backdrop-blur-sm bg-card/90 animate-fade-in">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl text-foreground">
                  <Database className="h-5 w-5 text-primary" />
                  Contact Database
                </CardTitle>
                <CardDescription className="text-base text-muted-foreground mt-1">
                  Your search results • {allContacts.length.toLocaleString()} contacts • {companies.length} companies
                </CardDescription>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="border-border/50"
                    disabled={exporting || allContacts.length === 0}
                  >
                    {exporting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
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

            {/* Dual Search Bars */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Company Search */}
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by company name..."
                  value={companySearchQuery}
                  onChange={(e) => setCompanySearchQuery(e.target.value)}
                  className="pl-10 pr-10 h-11 bg-muted/30 border-border/50"
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
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by person name..."
                  value={personSearchQuery}
                  onChange={(e) => setPersonSearchQuery(e.target.value)}
                  className="pl-10 pr-10 h-11 bg-muted/30 border-border/50"
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
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  Showing {filteredContacts.length} of {allContacts.length} contacts
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAllFilters}
                  className="h-6 px-2 text-xs"
                >
                  Clear filters
                </Button>
              </div>
            )}
          </CardHeader>

          <CardContent>
            <div className="text-sm font-medium text-muted-foreground mb-3">
              Companies ({filteredCompanies.length})
            </div>
            <ScrollArea className="h-[600px] rounded-md border border-border/40 bg-muted/10">
              {filteredCompanies.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {isFiltering ? "No contacts match your search" : "No contacts found in your database"}
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filteredCompanies.map((company) => (
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
                        <div className="mt-2 mx-4 mb-4 rounded-lg border border-border/40 overflow-hidden bg-background/50">
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
                                {getCompanyContacts(company.organization).length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                      No contacts found
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  getCompanyContacts(company.organization).map((contact) => (
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
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
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
