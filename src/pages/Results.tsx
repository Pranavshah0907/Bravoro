import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { LogOut, Download, RefreshCw, Trash2, CalendarIcon, Info, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import emploioLogo from "@/assets/emploio-logo.svg";

interface Search {
  id: string;
  status: string;
  created_at: string;
  updated_at: string | null;
  result_url: string | null;
  error_message: string | null;
  excel_file_name: string | null;
  search_type: string;
  company_name: string | null;
  domain: string | null;
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
}

const CONTACTS_PER_PAGE = 10;

const Results = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [searches, setSearches] = useState<Search[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchResults, setSearchResults] = useState<Record<string, SearchResult[]>>({});
  const [loadingResults, setLoadingResults] = useState<Set<string>>(new Set());
  const [activeCompanyTab, setActiveCompanyTab] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState<Record<string, number>>({});

  useEffect(() => {
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        fetchSearches(session.user.id);
      } else {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      const interval = setInterval(() => {
        fetchSearches(user.id);
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [user]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      setUser(session.user);
      await fetchSearches(session.user.id);
    } else {
      navigate("/auth");
    }
  };

  const fetchSearches = async (userId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("searches")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setSearches(data || []);
    } catch (error) {
      console.error("Error fetching searches:", error);
      toast({
        title: "Error",
        description: "Failed to fetch search results",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSearchResults = async (searchId: string) => {
    if (searchResults[searchId]) return;

    setLoadingResults(prev => new Set(prev).add(searchId));
    try {
      const { data, error } = await supabase
        .from("search_results")
        .select("*")
        .eq("search_id", searchId);

      if (error) throw error;

      const results = (data || []).map(item => ({
        ...item,
        contact_data: Array.isArray(item.contact_data) ? item.contact_data as unknown as Contact[] : []
      }));

      setSearchResults(prev => ({ ...prev, [searchId]: results }));
      
      if (results.length > 0) {
        setActiveCompanyTab(prev => ({ ...prev, [searchId]: results[0].company_name }));
        setCurrentPage(prev => ({ ...prev, [`${searchId}-${results[0].company_name}`]: 1 }));
      }
    } catch (error) {
      console.error("Error fetching search results:", error);
      toast({
        title: "Error",
        description: "Failed to fetch contact results",
        variant: "destructive",
      });
    } finally {
      setLoadingResults(prev => {
        const next = new Set(prev);
        next.delete(searchId);
        return next;
      });
    }
  };

  const toggleRowExpansion = async (searchId: string, status: string) => {
    if (status !== "completed") return;

    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(searchId)) {
      newExpanded.delete(searchId);
    } else {
      newExpanded.add(searchId);
      await fetchSearchResults(searchId);
    }
    setExpandedRows(newExpanded);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully",
    });
    navigate("/auth");
  };

  const handleDownload = async (path: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("results")
        .download(path);

      if (error) throw error;

      const blob = data;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = path.split("/").pop() || "result.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download Started",
        description: "Your file is being downloaded",
      });
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download Failed",
        description: "Failed to download the file",
        variant: "destructive",
      });
    }
  };

  const handleExportToExcel = (searchId: string) => {
    const results = searchResults[searchId];
    if (!results || results.length === 0) return;

    const allContacts: any[] = [];
    results.forEach(result => {
      result.contact_data.forEach(contact => {
        allContacts.push({
          Company: result.company_name,
          Domain: result.domain || contact.Domain,
          First_Name: contact.First_Name,
          Last_Name: contact.Last_Name,
          Title: contact.Title,
          Email: contact.Email,
          LinkedIn: contact.LinkedIn,
          Phone_1: contact.Phone_Number_1,
          Phone_2: contact.Phone_Number_2,
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(allContacts);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contacts");
    XLSX.writeFile(wb, `search_results_${searchId.slice(0, 8)}.xlsx`);

    toast({
      title: "Export Complete",
      description: "Results exported to Excel",
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    try {
      const { error } = await supabase
        .from("searches")
        .delete()
        .in("id", Array.from(selectedIds));

      if (error) throw error;

      toast({
        title: "Searches Deleted",
        description: `${selectedIds.size} search ${selectedIds.size === 1 ? 'entry' : 'entries'} removed`,
      });

      setSelectedIds(new Set());
      if (user) {
        fetchSearches(user.id);
      }
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete search entries",
        variant: "destructive",
      });
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSearches.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSearches.map(s => s.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const getStatusBadge = (status: string, errorMessage?: string | null) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="bg-muted text-muted-foreground font-medium">Pending</Badge>;
      case "processing":
        return <Badge variant="default" className="bg-secondary text-secondary-foreground font-medium">Processing</Badge>;
      case "completed":
        return <Badge className="bg-primary text-primary-foreground font-medium">Completed</Badge>;
      case "error":
        return (
          <div className="flex items-center gap-2">
            <Badge variant="destructive" className="font-medium">Error</Badge>
            {errorMessage && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-destructive cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="bg-card border-border shadow-medium">
                    <p className="max-w-xs text-sm">{errorMessage}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        );
      default:
        return <Badge variant="outline" className="font-medium">{status}</Badge>;
    }
  };

  const filteredSearches = searches.filter(search => {
    if (filter !== "all" && search.status !== filter) return false;
    if (typeFilter !== "all" && search.search_type !== typeFilter) return false;
    
    if (dateFrom || dateTo) {
      const searchDate = new Date(search.created_at);
      if (dateFrom && searchDate < dateFrom) return false;
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        if (searchDate > endOfDay) return false;
      }
    }
    
    return true;
  });

  const getPageKey = (searchId: string, companyName: string) => `${searchId}-${companyName}`;

  const getPaginatedContacts = (searchId: string, companyName: string, contacts: Contact[]) => {
    const pageKey = getPageKey(searchId, companyName);
    const page = currentPage[pageKey] || 1;
    const start = (page - 1) * CONTACTS_PER_PAGE;
    return contacts.slice(start, start + CONTACTS_PER_PAGE);
  };

  const getTotalPages = (contacts: Contact[]) => Math.ceil(contacts.length / CONTACTS_PER_PAGE);

  const handlePageChange = (searchId: string, companyName: string, page: number) => {
    const pageKey = getPageKey(searchId, companyName);
    setCurrentPage(prev => ({ ...prev, [pageKey]: page }));
  };

  const renderExpandedContent = (search: Search) => {
    const results = searchResults[search.id];
    const isLoading = loadingResults.has(search.id);

    if (isLoading) {
      return (
        <div className="p-8 text-center text-muted-foreground">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mx-auto mb-2" />
          Loading contacts...
        </div>
      );
    }

    if (!results || results.length === 0) {
      return (
        <div className="p-8 text-center text-muted-foreground">
          No contacts found for this search.
        </div>
      );
    }

    // For bulk_people_enrichment, show flat list without company tabs
    if (search.search_type === "bulk_people_enrichment") {
      // Combine all contacts from all results into a flat list
      const allContacts = results.flatMap(r => r.contact_data);
      const paginatedContacts = getPaginatedContacts(search.id, 'all', allContacts);
      const totalPages = getTotalPages(allContacts);
      const pageKey = getPageKey(search.id, 'all');
      const currentPageNum = currentPage[pageKey] || 1;

      // Initialize page if needed
      if (!currentPage[pageKey]) {
        setCurrentPage(prev => ({ ...prev, [pageKey]: 1 }));
      }

      return (
        <div className="p-4 md:p-6 bg-muted/30 border-t border-border/30">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <h4 className="text-sm font-semibold text-foreground">
              Enriched Contacts <span className="text-muted-foreground font-normal">({allContacts.length} total)</span>
            </h4>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExportToExcel(search.id)}
              className="hover-lift border-primary/30 text-primary hover:bg-primary/10"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
          </div>

          {renderContactsTable(search.id, 'all', allContacts)}

          {totalPages > 1 && (
            <Pagination className="mt-4">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => handlePageChange(search.id, 'all', Math.max(1, currentPageNum - 1))}
                    className={cn(
                      "cursor-pointer hover:bg-muted/50",
                      currentPageNum === 1 && "pointer-events-none opacity-50"
                    )}
                  />
                </PaginationItem>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPageNum <= 3) {
                    pageNum = i + 1;
                  } else if (currentPageNum >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPageNum - 2 + i;
                  }
                  return (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        onClick={() => handlePageChange(search.id, 'all', pageNum)}
                        isActive={currentPageNum === pageNum}
                        className="cursor-pointer"
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => handlePageChange(search.id, 'all', Math.min(totalPages, currentPageNum + 1))}
                    className={cn(
                      "cursor-pointer hover:bg-muted/50",
                      currentPageNum === totalPages && "pointer-events-none opacity-50"
                    )}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      );
    }

    // Original logic for manual entry and bulk upload with company tabs
    const activeCompany = activeCompanyTab[search.id] || results[0].company_name;
    const activeResult = results.find(r => r.company_name === activeCompany);
    const contacts = activeResult?.contact_data || [];
    const paginatedContacts = getPaginatedContacts(search.id, activeCompany, contacts);
    const totalPages = getTotalPages(contacts);
    const pageKey = getPageKey(search.id, activeCompany);
    const currentPageNum = currentPage[pageKey] || 1;

    return (
      <div className="p-4 md:p-6 bg-muted/30 border-t border-border/30">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h4 className="text-sm font-semibold text-foreground">Contact Results</h4>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleExportToExcel(search.id)}
            className="hover-lift border-primary/30 text-primary hover:bg-primary/10"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
        </div>

        {results.length > 1 ? (
          <Tabs
            value={activeCompany}
            onValueChange={(value) => {
              setActiveCompanyTab(prev => ({ ...prev, [search.id]: value }));
              const newPageKey = getPageKey(search.id, value);
              if (!currentPage[newPageKey]) {
                setCurrentPage(prev => ({ ...prev, [newPageKey]: 1 }));
              }
            }}
          >
            <TabsList className="mb-4 flex-wrap h-auto gap-1 bg-muted/30 p-1 rounded-lg">
              {results.map(result => (
                <TabsTrigger 
                  key={result.company_name} 
                  value={result.company_name} 
                  className="text-xs rounded-md data-[state=active]:bg-card data-[state=active]:shadow-soft px-3 py-1.5"
                >
                  {result.company_name} <span className="ml-1 text-muted-foreground">({result.contact_data.length})</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {results.map(result => (
              <TabsContent key={result.company_name} value={result.company_name}>
                {renderContactsTable(search.id, result.company_name, result.contact_data)}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              <span className="font-medium text-foreground">{results[0].company_name}</span> · {contacts.length} contacts
            </p>
            {renderContactsTable(search.id, results[0].company_name, contacts)}
          </div>
        )}

        {totalPages > 1 && (
          <Pagination className="mt-4">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => handlePageChange(search.id, activeCompany, Math.max(1, currentPageNum - 1))}
                  className={cn(
                    "cursor-pointer hover:bg-muted/50",
                    currentPageNum === 1 && "pointer-events-none opacity-50"
                  )}
                />
              </PaginationItem>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPageNum <= 3) {
                  pageNum = i + 1;
                } else if (currentPageNum >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPageNum - 2 + i;
                }
                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      onClick={() => handlePageChange(search.id, activeCompany, pageNum)}
                      isActive={currentPageNum === pageNum}
                      className="cursor-pointer"
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              <PaginationItem>
                <PaginationNext
                  onClick={() => handlePageChange(search.id, activeCompany, Math.min(totalPages, currentPageNum + 1))}
                  className={cn(
                    "cursor-pointer hover:bg-muted/50",
                    currentPageNum === totalPages && "pointer-events-none opacity-50"
                  )}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    );
  };

  const renderContactsTable = (searchId: string, companyName: string, contacts: Contact[]) => {
    const paginatedContacts = getPaginatedContacts(searchId, companyName, contacts);

    if (paginatedContacts.length === 0) {
      return <p className="text-sm text-muted-foreground">No contacts available.</p>;
    }

    return (
      <div className="overflow-x-auto rounded-lg border border-border/40 bg-card/80">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs font-semibold text-foreground">Name</TableHead>
              <TableHead className="text-xs font-semibold text-foreground">Title</TableHead>
              <TableHead className="text-xs font-semibold text-foreground">Email</TableHead>
              <TableHead className="text-xs font-semibold text-foreground">Phone</TableHead>
              <TableHead className="text-xs font-semibold text-foreground">LinkedIn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedContacts.map((contact, idx) => (
              <TableRow key={idx} className="hover:bg-muted/10 transition-colors">
                <TableCell className="text-sm font-medium">
                  {contact.First_Name} {contact.Last_Name}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{contact.Title || "-"}</TableCell>
                <TableCell className="text-sm">
                  {contact.Email ? (
                    <a href={`mailto:${contact.Email}`} className="text-primary hover:text-secondary transition-colors">
                      {contact.Email}
                    </a>
                  ) : "-"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{contact.Phone_Number_1 || "-"}</TableCell>
                <TableCell className="text-sm">
                  {contact.LinkedIn ? (
                    <a href={contact.LinkedIn} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-secondary transition-colors">
                      View
                    </a>
                  ) : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl" style={{ animation: "float 6s ease-in-out infinite" }} />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent/8 rounded-full blur-3xl" style={{ animation: "float 8s ease-in-out infinite reverse" }} />

      {/* Header */}
      <header className="border-b border-border/40 glass-effect sticky top-0 z-50">
        <div className="container mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={emploioLogo} alt="emploio" className="h-7 md:h-8 w-auto" />
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate("/dashboard")}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
            >
              <ArrowLeft className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Dashboard</span>
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
            >
              <LogOut className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 md:px-6 py-6 md:py-10 relative z-10">
        <div className="max-w-7xl mx-auto">
          {/* Page Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 md:mb-8 animate-fade-in">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                Search Results
              </h1>
              <p className="text-muted-foreground mt-1">Track your enrichment requests and download results</p>
            </div>
            
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 animate-fade-in">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[150px] bg-card border-border/50 h-9">
                  <SelectValue placeholder="Entry type" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border shadow-medium">
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="bulk">Bulk Upload</SelectItem>
                  <SelectItem value="manual">Manual Entry</SelectItem>
                  <SelectItem value="bulk_people_enrichment">People Enrichment</SelectItem>
                </SelectContent>
              </Select>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal bg-card border-border/50 h-9", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "PP") : "From date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-card border-border shadow-medium" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="pointer-events-auto" />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal bg-card border-border/50 h-9", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "PP") : "To date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-card border-border shadow-medium" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="pointer-events-auto" />
                </PopoverContent>
              </Popover>

              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[130px] bg-card border-border/50 h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border shadow-medium">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>

              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateFrom(undefined);
                    setDateTo(undefined);
                  }}
                  className="h-9 text-muted-foreground hover:text-foreground"
                >
                  Clear
                </Button>
              )}
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => user && fetchSearches(user.id)}
                disabled={loading}
                className="hover-lift h-9 bg-card border-border/50"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
            </div>
          </div>

          {/* Bulk Delete Banner */}
          {selectedIds.size > 0 && (
            <div className="mb-4 p-3 bg-destructive/10 rounded-lg border border-destructive/20 flex items-center justify-between animate-scale-in">
              <span className="text-sm font-medium text-foreground">
                {selectedIds.size} {selectedIds.size === 1 ? 'entry' : 'entries'} selected
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Selected
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-card border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selectedIds.size} Search {selectedIds.size === 1 ? 'Entry' : 'Entries'}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the selected search {selectedIds.size === 1 ? 'entry' : 'entries'}. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-border/50">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleBulkDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {/* Results Table */}
          <div className="bg-card rounded-xl border border-border/40 shadow-soft overflow-hidden animate-fade-in">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/30">
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={filteredSearches.length > 0 && selectedIds.size === filteredSearches.length}
                        onCheckedChange={toggleSelectAll}
                        className="border-border"
                      />
                    </TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead className="w-[40px] font-semibold text-foreground">#</TableHead>
                    <TableHead className="font-semibold text-foreground">Type</TableHead>
                    <TableHead className="font-semibold text-foreground">Details</TableHead>
                    <TableHead className="font-semibold text-foreground">Created</TableHead>
                    <TableHead className="font-semibold text-foreground">Status</TableHead>
                    <TableHead className="text-right font-semibold text-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && searches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mx-auto mb-2" />
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : filteredSearches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        No searches found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSearches.map((search, index) => (
                      <>
                        <TableRow 
                          key={search.id}
                          className={cn(
                            "hover:bg-muted/10 transition-colors border-b border-border/20",
                            expandedRows.has(search.id) && "bg-muted/10"
                          )}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(search.id)}
                              onCheckedChange={() => toggleSelect(search.id)}
                              className="border-border"
                            />
                          </TableCell>
                          <TableCell>
                            {search.status === "completed" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="p-1 h-7 w-7 hover:bg-muted/50"
                                onClick={() => toggleRowExpansion(search.id, search.status)}
                              >
                                {expandedRows.has(search.id) ? (
                                  <ChevronDown className="h-4 w-4 text-primary" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            ) : (
                              <span className="w-7 inline-block" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                          <TableCell>
                            <Badge 
                              variant={search.search_type === "bulk" ? "default" : search.search_type === "bulk_people_enrichment" ? "outline" : "secondary"}
                              className={cn(
                                "font-medium",
                                search.search_type === "bulk" ? "bg-secondary text-secondary-foreground" : 
                                search.search_type === "bulk_people_enrichment" ? "border-accent text-accent" :
                                "bg-muted text-muted-foreground"
                              )}
                            >
                              {search.search_type === "bulk" ? "Bulk" : search.search_type === "bulk_people_enrichment" ? "People Enrich" : "Manual"}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {(search.search_type === "bulk" || search.search_type === "bulk_people_enrichment") && search.excel_file_name ? (
                              <span className="text-sm">{search.excel_file_name}</span>
                            ) : search.company_name ? (
                              <span className="text-sm">{search.company_name}</span>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(search.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>{getStatusBadge(search.status, search.error_message)}</TableCell>
                          <TableCell className="text-right">
                            {search.status === "completed" && search.result_url ? (
                              <Button
                                size="sm"
                                onClick={() => handleDownload(search.result_url!)}
                                className="btn-gradient text-primary-foreground h-8"
                              >
                                <Download className="h-4 w-4 mr-1" />
                                Download
                              </Button>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                        {expandedRows.has(search.id) && (
                          <TableRow key={`${search.id}-expanded`}>
                            <TableCell colSpan={8} className="p-0">
                              {renderExpandedContent(search)}
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Results;