import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { LogOut, Download, RefreshCw, Trash2, CalendarIcon, Info, ChevronDown, ChevronRight } from "lucide-react";
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
import leapLogo from "@/assets/leap-logo.png";
import leapFont from "@/assets/leap-font.png";

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
        return <Badge variant="secondary">Pending</Badge>;
      case "processing":
        return <Badge variant="default">Processing</Badge>;
      case "completed":
        return <Badge variant="default" className="bg-green-600">Completed</Badge>;
      case "error":
        return (
          <div className="flex items-center gap-2">
            <Badge variant="destructive">Error</Badge>
            {errorMessage && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-destructive cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">{errorMessage}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
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
        <div className="p-6 text-center text-muted-foreground">
          Loading contacts...
        </div>
      );
    }

    if (!results || results.length === 0) {
      return (
        <div className="p-6 text-center text-muted-foreground">
          No contacts found for this search.
        </div>
      );
    }

    const activeCompany = activeCompanyTab[search.id] || results[0].company_name;
    const activeResult = results.find(r => r.company_name === activeCompany);
    const contacts = activeResult?.contact_data || [];
    const paginatedContacts = getPaginatedContacts(search.id, activeCompany, contacts);
    const totalPages = getTotalPages(contacts);
    const pageKey = getPageKey(search.id, activeCompany);
    const currentPageNum = currentPage[pageKey] || 1;

    return (
      <div className="p-4 bg-muted/20 border-t border-border/50">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-sm font-semibold text-foreground">Contact Results</h4>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleExportToExcel(search.id)}
            className="hover-lift"
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
            <TabsList className="mb-4 flex-wrap h-auto gap-1">
              {results.map(result => (
                <TabsTrigger key={result.company_name} value={result.company_name} className="text-xs">
                  {result.company_name} ({result.contact_data.length})
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
            <p className="text-sm text-muted-foreground mb-2">
              {results[0].company_name} ({contacts.length} contacts)
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
                  className={currentPageNum === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
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
                  className={currentPageNum === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
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
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Title</TableHead>
              <TableHead className="text-xs">Email</TableHead>
              <TableHead className="text-xs">Phone</TableHead>
              <TableHead className="text-xs">LinkedIn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedContacts.map((contact, idx) => (
              <TableRow key={idx} className="hover:bg-muted/10">
                <TableCell className="text-xs">
                  {contact.First_Name} {contact.Last_Name}
                </TableCell>
                <TableCell className="text-xs">{contact.Title || "-"}</TableCell>
                <TableCell className="text-xs">
                  {contact.Email ? (
                    <a href={`mailto:${contact.Email}`} className="text-primary hover:underline">
                      {contact.Email}
                    </a>
                  ) : "-"}
                </TableCell>
                <TableCell className="text-xs">{contact.Phone_Number_1 || "-"}</TableCell>
                <TableCell className="text-xs">
                  {contact.LinkedIn ? (
                    <a href={contact.LinkedIn} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
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
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/10 to-primary/5 relative">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl" style={{ animation: "float 6s ease-in-out infinite" }} />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent/5 rounded-full blur-3xl" style={{ animation: "float 8s ease-in-out infinite reverse" }} />

      <header className="border-b border-border/50 glass-effect sticky top-0 z-50 animate-slide-up">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img src={leapLogo} alt="LEAP Logo" className="h-12 w-12 transition-transform hover:scale-110" />
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl" />
            </div>
            <div>
              <img src={leapFont} alt="LEAP" className="h-8" />
              <p className="text-xs text-muted-foreground mt-1 tracking-wide">Lead Enrichment & Automation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate("/dashboard")}
              className="hover-lift transition-all duration-300"
            >
              Back to Dashboard
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleSignOut}
              className="hover:text-destructive transition-all"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8 animate-fade-in">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                Search Results
              </h1>
              <p className="text-muted-foreground mt-2 text-lg">Track your enrichment requests and download results</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap animate-fade-in" style={{ animationDelay: "0.1s" }}>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Entry type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="bulk">Bulk</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "PP") : "From date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="pointer-events-auto" />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "PP") : "To date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="pointer-events-auto" />
                </PopoverContent>
              </Popover>

              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
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
                >
                  Clear Dates
                </Button>
              )}
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => user && fetchSearches(user.id)}
                disabled={loading}
                className="hover-lift transition-all"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="mb-6 p-4 bg-gradient-to-r from-primary/10 to-destructive/10 rounded-lg border border-destructive/20 flex items-center justify-between animate-scale-in shadow-medium">
              <span className="text-sm font-medium">
                {selectedIds.size} {selectedIds.size === 1 ? 'entry' : 'entries'} selected
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Selected
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selectedIds.size} Search {selectedIds.size === 1 ? 'Entry' : 'Entries'}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the selected search {selectedIds.size === 1 ? 'entry' : 'entries'}. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
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

          <div className="bg-card/95 backdrop-blur-sm rounded-lg border border-border/50 shadow-strong hover-lift overflow-hidden animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={filteredSearches.length > 0 && selectedIds.size === filteredSearches.length}
                      onCheckedChange={toggleSelectAll}
                      className="border-primary/50"
                    />
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead className="w-[50px] font-semibold">#</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold">Details</TableHead>
                  <TableHead className="font-semibold">Created At</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && searches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredSearches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No searches found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSearches.map((search, index) => (
                    <>
                      <TableRow 
                        key={search.id}
                        className="hover:bg-muted/20 transition-colors"
                        style={{ 
                          animation: "fade-in 0.5s ease-out forwards",
                          animationDelay: `${index * 0.05}s`,
                          opacity: 0
                        }}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(search.id)}
                            onCheckedChange={() => toggleSelect(search.id)}
                            className="border-primary/50"
                          />
                        </TableCell>
                        <TableCell>
                          {search.status === "completed" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="p-1 h-auto"
                              onClick={() => toggleRowExpansion(search.id, search.status)}
                            >
                              {expandedRows.has(search.id) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          ) : (
                            <span className="w-6 inline-block" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={search.search_type === "bulk" ? "default" : "secondary"}
                            className={search.search_type === "bulk" ? "bg-gradient-to-r from-primary to-secondary" : ""}
                          >
                            {search.search_type === "bulk" ? "Bulk Upload" : "Manual Entry"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {search.search_type === "bulk" && search.excel_file_name ? (
                            <span className="text-sm">{search.excel_file_name}</span>
                          ) : search.company_name ? (
                            <span className="text-sm">{search.company_name}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{new Date(search.created_at).toLocaleString()}</TableCell>
                        <TableCell>{getStatusBadge(search.status, search.error_message)}</TableCell>
                        <TableCell className="text-right">
                          <div className="min-h-[40px] flex items-center justify-end">
                            {search.status === "completed" && search.result_url ? (
                              <Button
                                size="sm"
                                onClick={() => handleDownload(search.result_url!)}
                                className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary hover-glow transition-all"
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </Button>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </div>
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
      </main>
    </div>
  );
};

export default Results;
