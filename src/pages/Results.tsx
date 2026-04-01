import { useEffect, useMemo, useState, useRef, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import {
  Download,
  RefreshCw,
  Trash2,
  CalendarIcon,
  Info,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Copy,
  Phone,
  MoreHorizontal,
  Briefcase,
  MapPin,
  ExternalLink,
  FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AppSidebar } from "@/components/AppSidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import bravoroLogo from "@/assets/bravoro-logo.svg";
import { CompanyBrowserDialog } from "@/components/CompanyBrowserDialog";

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

interface JobResult {
  job_title: string;
  job_link: string;
  linkedin_job_link?: string;
  last_posted_date: string;
  company: string;
  company_domain?: string;
  location: string;
  seniority?: string;
  hiring_team_name?: string | null;
  hiring_team_role?: string | null;
  hiring_team_linkedin?: string | null;
  hiring_team_image?: string | null;
  recruiter_phone_number?: string | null;
  credits_used?: number;
}

interface JobSearchResultData {
  job_search_status: string;
  results: JobResult[];
}

interface Contact {
  Record_ID?: string;       // User-provided record ID for people enrichment
  First_Name: string;
  Last_Name: string;
  Domain: string;
  Organization: string;
  Title: string;
  Email: string;
  LinkedIn: string;
  Phone_Number_1: string;
  Phone_Number_2: string;
  job_search_result?: JobSearchResultData;
  Provider?: string;
  People_Search_By?: string;
  Credits_Used?: number;
}

interface SearchResult {
  id: string;
  search_id: string;
  company_name: string;
  domain: string | null;
  contact_data: Contact[];
  result_type?: string;
}

const getPhoneNumbers = (contact: Partial<Contact>): string[] => {
  const raw = [contact.Phone_Number_1, contact.Phone_Number_2]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);

  // Dedupe while preserving order
  return Array.from(new Set(raw));
};

// Builds the open_job_positions cell value for a company's contacts.
// Deduplicates jobs (n8n repeats the same job list on every contact).
// Format per job: Title \n URL \n Location \n Date \n Hiring Person (if any)
// Jobs separated by a blank line.
const buildJobsCell = (contacts: Contact[]): string => {
  const seen = new Set<string>();
  const jobBlocks: string[] = [];

  for (const c of contacts) {
    if (
      c.job_search_result?.job_search_status === "jobs_found" &&
      Array.isArray(c.job_search_result.results)
    ) {
      for (const resultGroup of c.job_search_result.results) {
        const jobList: JobResult[] = Array.isArray((resultGroup as any).jobs)
          ? (resultGroup as any).jobs
          : [resultGroup];
        for (const job of jobList) {
          const key = job.job_link || job.job_title;
          if (!key || seen.has(key)) continue;
          seen.add(key);

          const lines = [
            job.job_title || "",
            job.job_link || "",
            job.location || "",
            job.last_posted_date || "",
          ];
          if (job.hiring_team_name) lines.push(job.hiring_team_name);
          if (job.recruiter_phone_number) lines.push(job.recruiter_phone_number);

          jobBlocks.push(lines.filter(Boolean).join("\n"));
        }
      }
    }
  }

  return jobBlocks.join("\n\n");
};

const CONTACTS_PER_PAGE = 10;

// Collapsible panel showing deduped job listings for a company.
// Returns null when no job_search_result data exists on any contact.
const CompanyJobsPanel = ({ contacts }: { contacts: Contact[] }) => {
  const [expanded, setExpanded] = useState(false);

  const uniqueJobs = useMemo<JobResult[]>(() => {
    const seen = new Set<string>();
    const jobs: JobResult[] = [];
    for (const c of contacts) {
      if (
        c.job_search_result?.job_search_status === "jobs_found" &&
        Array.isArray(c.job_search_result.results)
      ) {
        for (const resultGroup of c.job_search_result.results) {
          // n8n payload nests jobs inside results[].jobs[]
          const jobList: JobResult[] = Array.isArray((resultGroup as any).jobs)
            ? (resultGroup as any).jobs
            : [resultGroup]; // fallback: treat result itself as a job (legacy format)
          for (const job of jobList) {
            const key = job.job_link || job.job_title;
            if (key && !seen.has(key)) {
              seen.add(key);
              jobs.push(job);
            }
          }
        }
      }
    }
    return jobs;
  }, [contacts]);

  if (uniqueJobs.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-[#173030] bg-[#06191a] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors group"
      >
        <div className="flex items-center gap-2">
          <Briefcase className="h-3.5 w-3.5 text-emerald-400/70" />
          <span className="text-[11px] font-semibold tracking-widest uppercase text-emerald-300/80">
            Active Job Openings
          </span>
          <span className="text-[10px] font-semibold bg-emerald-400/12 text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-400/20">
            {uniqueJobs.length}
          </span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200 ${
            expanded ? "" : "-rotate-90"
          }`}
        />
      </button>

      {/* Job cards grid */}
      {expanded && (
        <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {uniqueJobs.map((job, idx) => (
            <div
              key={idx}
              className="rounded-md border border-[#173030] bg-[#081f1f] p-3 hover:border-emerald-900/50 transition-colors"
            >
              {/* Title + open link */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-xs font-semibold text-[#d0f5ee] leading-snug line-clamp-2 flex-1">
                  {job.job_title}
                </p>
                <a
                  href={job.job_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-emerald-500/50 hover:text-emerald-300 transition-colors mt-0.5"
                  title="View job posting"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              {/* Location + date */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/60">
                {job.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-2.5 w-2.5 text-muted-foreground/40" />
                    {job.location}
                  </span>
                )}
                {job.last_posted_date && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="h-2.5 w-2.5 text-muted-foreground/40" />
                    {job.last_posted_date}
                  </span>
                )}
              </div>

              {/* Hiring manager — only if present */}
              {job.hiring_team_name && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="text-emerald-400/40">Hiring:</span>
                  {job.hiring_team_linkedin ? (
                    <a
                      href={job.hiring_team_linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400/80 hover:text-emerald-300 transition-colors underline underline-offset-2 decoration-emerald-400/30"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {job.hiring_team_name}
                    </a>
                  ) : (
                    <span className="text-emerald-400/80">{job.hiring_team_name}</span>
                  )}
                  {job.hiring_team_role && (
                    <span className="text-muted-foreground/40">· {job.hiring_team_role}</span>
                  )}
                  {job.recruiter_phone_number && (
                    <span className="text-emerald-400/60">· {job.recruiter_phone_number}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [companyBrowserOpen, setCompanyBrowserOpen] = useState<Record<string, boolean>>({});

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
      
      // Check admin status
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .single();
      setIsAdmin(roleData?.role === "admin");
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
        // IMPORTANT:
        // `search_results.result_type` now defaults to 'enriched' for *all* rows, including manual/bulk searches.
        // So we must NOT use `result_type === 'enriched'` to detect the special "People Enriched / People not found" UI.
        // People enrichment is driven by the search type (and optionally presence of 'missing' rows for backwards compatibility).
        const search = searches.find(s => s.id === searchId);
        const isPeopleEnrichment =
          search?.search_type === "bulk_people_enrichment" ||
          results.some(
            (r) =>
              r.result_type === "missing" ||
              r.company_name === "People Enriched" ||
              r.company_name === "People not found"
          );
        
        if (isPeopleEnrichment) {
          // For people enrichment, set 'enriched' as the default active tab
          setActiveCompanyTab(prev => ({ ...prev, [searchId]: 'enriched' }));
          setCurrentPage(prev => ({ ...prev, [`${searchId}-enriched`]: 1 }));
        } else {
          // For bulk searches, check if there are missing companies and default to that tab
          const hasMissingCompanies = results.some(r => r.result_type === 'missing_company');
          const defaultTab = hasMissingCompanies ? 'missing_companies' : results[0].company_name;
          setActiveCompanyTab(prev => ({ ...prev, [searchId]: defaultTab }));
          setCurrentPage(prev => ({ ...prev, [`${searchId}-${defaultTab}`]: 1 }));
        }
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
    await supabase.auth.signOut({ scope: 'local' });
    toast({
      title: "Signed out",
      description: "You have been signed out successfully",
    });
    navigate("/auth");
  };


  const handleExportToExcel = (searchId: string) => {
    const results = searchResults[searchId];
    if (!results || results.length === 0) return;

    // Separate company results from missing companies
    const companyResults = results.filter(r => r.result_type !== 'missing_company');
    const missingCompanyResults = results.filter(r => r.result_type === 'missing_company');

    const allContacts: any[] = [];
    companyResults.forEach(result => {
      const jobsCell = buildJobsCell(result.contact_data);
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
          open_job_positions: jobsCell,
        });
      });
    });

    const wb = XLSX.utils.book_new();
    
    // Add Contacts sheet
    const ws = XLSX.utils.json_to_sheet(allContacts);
    XLSX.utils.book_append_sheet(wb, ws, "Contacts");

    // Add Missing_Companies sheet if there are any
    if (missingCompanyResults.length > 0) {
      const missingData = missingCompanyResults.map(mc => ({
        Company_Name: mc.company_name,
        Domain: mc.domain || ''
      }));
      const wsMissing = XLSX.utils.json_to_sheet(missingData);
      XLSX.utils.book_append_sheet(wb, wsMissing, "Missing_Companies");
    }

    const srcName = searches.find(s => s.id === searchId)?.excel_file_name?.replace(/\.[^.]+$/, "");
    XLSX.writeFile(wb, `${srcName || "search_results"}_processed.xlsx`);

    toast({
      title: "Export Complete",
      description: "Results exported to Excel",
    });
  };

  const handleExportSegregatedExcel = (searchId: string) => {
    const results = searchResults[searchId];
    if (!results || results.length === 0) return;

    // Separate company results from missing companies
    const companyResults = results.filter(r => r.result_type !== 'missing_company');
    const missingCompanyResults = results.filter(r => r.result_type === 'missing_company');

    const wb = XLSX.utils.book_new();
    const usedSheetNames = new Set<string>();

    companyResults.forEach(result => {
      // Create sheet data for this company
      const jobsCell = buildJobsCell(result.contact_data);
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
        open_job_positions: jobsCell,
      }));

      if (sheetData.length === 0) return;

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(sheetData);

      // Sanitize sheet name (Excel has 31 char limit, no special chars)
      let sheetName = (result.company_name || 'Unknown')
        .replace(/[\\/*?:\[\]]/g, '') // Remove invalid chars
        .trim()
        .substring(0, 31);            // Max 31 characters
      
      // Handle empty sheet name
      if (!sheetName) sheetName = 'Company';

      // Ensure unique sheet names if duplicates exist
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

    // Add Missing_Companies sheet if there are any
    if (missingCompanyResults.length > 0) {
      const missingData = missingCompanyResults.map(mc => ({
        Company_Name: mc.company_name,
        Domain: mc.domain || ''
      }));
      const wsMissing = XLSX.utils.json_to_sheet(missingData);
      XLSX.utils.book_append_sheet(wb, wsMissing, "Missing_Companies");
    }

    if (wb.SheetNames.length === 0) {
      toast({
        title: "No Data",
        description: "No contacts found to export",
        variant: "destructive",
      });
      return;
    }

    const srcName2 = searches.find(s => s.id === searchId)?.excel_file_name?.replace(/\.[^.]+$/, "");
    XLSX.writeFile(wb, `${srcName2 || "search_results"}_processed.xlsx`);

    toast({
      title: "Export Complete",
      description: "Results exported with separate company sheets",
    });
  };

  const handleExportPeopleEnrichment = (searchId: string) => {
    const results = searchResults[searchId];
    if (!results) return;

    const wb = XLSX.utils.book_new();

    // Find enriched and missing results
    const enrichedResult = results.find(r => 
      r.result_type === 'enriched' || r.company_name === 'People Enriched'
    );
    const missingResult = results.find(r => 
      r.result_type === 'missing' || r.company_name === 'People not found'
    );

    // Sheet 1: Output (enriched contacts) - includes Record_ID if present
    if (enrichedResult?.contact_data?.length > 0) {
      const enrichedData = enrichedResult.contact_data.map(c => ({
        Record_ID: c.Record_ID || '',
        First_Name: c.First_Name,
        Last_Name: c.Last_Name,
        Domain: c.Domain,
        Organization: c.Organization,
        Title: c.Title,
        Email: c.Email,
        LinkedIn: c.LinkedIn,
        Phone_Number_1: c.Phone_Number_1,
        Phone_Number_2: c.Phone_Number_2,
      }));
      const ws1 = XLSX.utils.json_to_sheet(enrichedData);
      XLSX.utils.book_append_sheet(wb, ws1, "Output");
    }

    // Sheet 2: Missing_contacts - includes Record_ID if present
    if (missingResult?.contact_data?.length > 0) {
      const missingData = missingResult.contact_data.map(c => ({
        Record_ID: c.Record_ID || '',
        First_Name: c.First_Name,
        Last_Name: c.Last_Name,
        Domain: c.Domain || '',
        Organization: c.Organization || '',
        Title: c.Title || '',
        Email: c.Email || '',
        LinkedIn: c.LinkedIn || '',
        Phone_Number_1: c.Phone_Number_1 || '',
        Phone_Number_2: c.Phone_Number_2 || '',
      }));
      const ws2 = XLSX.utils.json_to_sheet(missingData);
      XLSX.utils.book_append_sheet(wb, ws2, "Missing_contacts");
    }

    if (wb.SheetNames.length === 0) {
      toast({
        title: "No Data",
        description: "No contacts found to export",
        variant: "destructive",
      });
      return;
    }

    const srcName3 = searches.find(s => s.id === searchId)?.excel_file_name?.replace(/\.[^.]+$/, "");
    XLSX.writeFile(wb, `${srcName3 || "people_enrichment"}_processed.xlsx`);

    toast({
      title: "Export Complete",
      description: "People enrichment results exported to Excel",
    });
  };

  const handleExportAdminPDF = async (searchId: string) => {
    const results = searchResults[searchId];
    if (!results || results.length === 0) return;

    const search = searches.find(s => s.id === searchId);
    const companyResults = results.filter(r => r.result_type !== 'missing_company');
    const allContacts = companyResults.flatMap(r => r.contact_data);
    if (allContacts.length === 0) return;

    // ── Colour palette — light/white theme ──────────────────────────────────
    const C = {
      white:      [255, 255, 255] as [number,number,number],
      pageBg:     [250, 251, 251] as [number,number,number],
      accent:     [0,  160, 125]  as [number,number,number],  // brand teal
      accentDark: [0,  110,  88]  as [number,number,number],
      accentPale: [220, 245, 240] as [number,number,number],
      headerBg:   [15,  60,  55]  as [number,number,number],  // deep teal header
      text:       [30,  40,  38]  as [number,number,number],  // near-black text
      textMid:    [80,  95,  92]  as [number,number,number],  // secondary text
      textLight:  [140,155,152]   as [number,number,number],  // muted text
      rowAlt:     [244,250,248]   as [number,number,number],  // very light teal tint
      border:     [210,230,226]   as [number,number,number],
      totalRow:   [230, 245, 240] as [number,number,number],
    };

    // Portrait A4
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();   // 210
    const PH = doc.internal.pageSize.getHeight();  // 297
    const ML = 15; // margin left
    const MR = 15; // margin right
    const TW = PW - ML - MR; // table width = 180

    // ── Header band ─────────────────────────────────────────────────────────
    doc.setFillColor(...C.headerBg);
    doc.rect(0, 0, PW, 28, "F");
    // Accent left stripe
    doc.setFillColor(...C.accent);
    doc.rect(0, 0, 5, 28, "F");

    // "BRAVORO" brand
    doc.setTextColor(...C.accent);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("BRAVORO", ML + 4, 13);

    // Report subtitle
    doc.setTextColor(200, 230, 226);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Enrichment Report", ML + 4, 21);

    // Company / search label (right-aligned)
    const label = search?.company_name
      ? search.company_name
      : search?.excel_file_name
        ? search.excel_file_name
        : `ID: ${searchId.slice(0, 8)}`;
    doc.setTextColor(160, 200, 195);
    doc.setFontSize(8);
    doc.text(label, PW - MR, 13, { align: "right" });
    doc.text(
      new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      PW - MR, 21, { align: "right" }
    );

    let cursorY = 36;

    // ── Section heading helper ────────────────────────────────────────────────
    const sectionHeading = (title: string, y: number) => {
      doc.setFillColor(...C.accentPale);
      doc.rect(ML, y - 4, TW, 7, "F");
      doc.setFillColor(...C.accent);
      doc.rect(ML, y - 4, 3, 7, "F");
      doc.setTextColor(...C.accentDark);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(title.toUpperCase(), ML + 6, y + 0.5);
    };

    // ── TABLE 1: Contacts ────────────────────────────────────────────────────
    sectionHeading("Contact Details", cursorY);
    cursorY += 5;

    const contactRows = allContacts.map(c => {
      const name = [c.First_Name, c.Last_Name].filter(Boolean).join(" ") || "—";
      const phones = [c.Phone_Number_1, c.Phone_Number_2].filter(p => p && String(p).trim());
      const provider = (c.Provider || "").trim();
      const phoneStr = phones.length
        ? (provider ? `[${provider}]  ${phones.join("  ·  ")}` : phones.join("  ·  "))
        : "—";
      return [name, c.Organization || "—", c.Title || "—", phoneStr];
    });

    autoTable(doc, {
      startY: cursorY,
      head: [["Name", "Organisation", "Title", "Phone (Provider)"]],
      body: contactRows,
      margin: { left: ML, right: MR },
      styles: {
        fontSize: 8,
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
        textColor: C.text,
        lineColor: C.border,
        lineWidth: 0.15,
        fillColor: C.white,
        font: "helvetica",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: C.headerBg,
        textColor: [200, 230, 226] as [number,number,number],
        fontStyle: "bold",
        fontSize: 8,
        lineWidth: 0,
      },
      alternateRowStyles: { fillColor: C.rowAlt },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 42 },
        2: { cellWidth: 52 },
        3: { cellWidth: "auto" },
      },
    });

    // ── Provider statistics — only count contacts where a phone was found ──────
    const providerMap: Record<string, number> = {};
    allContacts.forEach(c => {
      const hasPhone = [c.Phone_Number_1, c.Phone_Number_2].some(p => p && String(p).trim());
      if (!hasPhone) return;
      const provider = (c.Provider || "Unknown").trim();
      providerMap[provider] = (providerMap[provider] || 0) + 1;
    });
    const total = Object.values(providerMap).reduce((a, b) => a + b, 0);
    const providerEntries = Object.entries(providerMap).sort((a, b) => b[1] - a[1]);

    const tableEndY = (doc as any).lastAutoTable?.finalY ?? cursorY;
    const statsBlockH = 10 + (providerEntries.length + 1) * 8 + 14 + providerEntries.length * 9 + 10;
    if (tableEndY + statsBlockH + 10 > PH - 14) {
      doc.addPage();
      cursorY = 20;
    } else {
      cursorY = tableEndY + 10;
    }

    // ── TABLE 2: Provider Summary ─────────────────────────────────────────────
    sectionHeading("Provider Summary", cursorY);
    cursorY += 5;

    const statsRows = providerEntries.map(([prov, count]) => [
      prov,
      String(count),
      `${((count / total) * 100).toFixed(1)}%`,
    ]);
    statsRows.push(["Total", String(total), "100%"]);

    autoTable(doc, {
      startY: cursorY,
      head: [["Provider", "Contacts Found", "Share"]],
      body: statsRows,
      margin: { left: ML, right: MR },
      tableWidth: TW,
      styles: {
        fontSize: 8,
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
        textColor: C.text,
        lineColor: C.border,
        lineWidth: 0.15,
        fillColor: C.white,
      },
      headStyles: {
        fillColor: C.headerBg,
        textColor: [200, 230, 226] as [number,number,number],
        fontStyle: "bold",
        fontSize: 8,
        lineWidth: 0,
      },
      alternateRowStyles: { fillColor: C.rowAlt },
      didParseCell: (data) => {
        if (data.row.index === statsRows.length - 1 && data.section === "body") {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = C.accentDark;
          data.cell.styles.fillColor = C.totalRow;
        }
      },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 50, halign: "center" },
        2: { cellWidth: 36, halign: "center" },
      },
    });

    // ── Pie chart: "Provider Breakdown" ──────────────────────────────────────
    const statsEndY = (doc as any).lastAutoTable?.finalY ?? cursorY;
    cursorY = statsEndY + 10;

    // Section mini-label
    doc.setTextColor(...C.accentDark);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text("PROVIDER BREAKDOWN", ML, cursorY);
    cursorY += 5;

    const pieColors: [number,number,number][] = [
      [0,  160, 125],
      [230, 90,  60],
      [60, 130, 200],
      [200,160,  30],
      [140, 80, 200],
      [40, 190, 155],
    ];

    // Helper: draw a filled pie slice using raw PDF path commands
    const sf = doc.internal.scaleFactor;
    const pageH = doc.internal.pageSize.getHeight();
    const drawPieSlice = (cx: number, cy: number, r: number, startAng: number, endAng: number, color: [number,number,number]) => {
      if (Math.abs(endAng - startAng) < 0.0001) return;
      doc.setFillColor(...color);
      const steps = 48;
      const toX = (x: number) => (x * sf).toFixed(3);
      const toY = (y: number) => ((pageH - y) * sf).toFixed(3);
      const parts: string[] = [];
      parts.push(`${toX(cx)} ${toY(cy)} m`);
      for (let s = 0; s <= steps; s++) {
        const a = startAng + (endAng - startAng) * s / steps;
        parts.push(`${toX(cx + r * Math.cos(a))} ${toY(cy + r * Math.sin(a))} l`);
      }
      parts.push(`${toX(cx)} ${toY(cy)} l f`);
      (doc.internal as any).out(parts.join(" "));
    };

    // Pie layout constants — smaller chart, legend beside it
    const r   = 16;              // radius mm (compact)
    const cx  = ML + r + 4;     // centre x — snug to left margin
    const chartTopY = cursorY;
    const cy  = chartTopY + r;  // centre y

    // Draw slices
    let angle = -Math.PI / 2;   // start from 12-o'clock
    providerEntries.forEach(([, count], i) => {
      const sweep = (count / total) * 2 * Math.PI;
      const color = pieColors[i % pieColors.length];
      drawPieSlice(cx, cy, r, angle, angle + sweep - 0.03, color);
      angle += sweep;
    });

    // Outer white ring for clean slice edges
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.6);
    doc.circle(cx, cy, r, "S");

    // Donut hole
    doc.setFillColor(...C.white);
    doc.circle(cx, cy, r * 0.44, "F");
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.15);
    doc.circle(cx, cy, r * 0.44, "S");

    // ── Legend — vertically centred beside the chart ──────────────────────────
    const legendX      = cx + r + 10;         // starts just right of the pie
    const rowH         = 7;                    // mm per legend row
    const legendH      = providerEntries.length * rowH;
    const legendStartY = cy - legendH / 2 + rowH * 0.5; // vertically centred

    // Right-aligned % column: fixed from legendX
    const pctX = ML + TW;                     // flush to right margin

    providerEntries.forEach(([prov, count], i) => {
      const pct   = ((count / total) * 100).toFixed(1);
      const ly    = legendStartY + i * rowH;
      const color = pieColors[i % pieColors.length];

      // Colour swatch — circle dot style
      doc.setFillColor(...color);
      doc.circle(legendX + 1.8, ly - 1.5, 2.2, "F");

      // Provider name
      doc.setTextColor(...C.text);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.text(prov, legendX + 7, ly);

      // Percentage right-aligned
      doc.setTextColor(...C.textMid);
      doc.setFont("helvetica", "bold");
      doc.text(`${pct}%`, pctX, ly, { align: "right" });

      // Thin dotted leader line between name and %
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.15);
      const nameEndX = legendX + 7 + doc.getStringUnitWidth(prov) * 8.5 / doc.internal.scaleFactor / (72 / 25.4) + 2;
      doc.setLineDashPattern([0.8, 1.2], 0);
      doc.line(nameEndX, ly - 1, pctX - doc.getStringUnitWidth(`${pct}%`) * 8.5 / doc.internal.scaleFactor / (72 / 25.4) - 3, ly - 1);
      doc.setLineDashPattern([], 0);
    });

    // ── TABLE 3: Cost Breakdown ────────────────────────────────────────────
    const COST_PER_CREDIT: Record<string, number> = {
      cognism:    0.76,
      apollo:     0.01975,
      aleads:     0.00683,
      lusha:      0.087416,
      theirstack: 0.0326,
    };

    const PLATFORM_LABELS: Record<string, string> = {
      cognism:    "Cognism",
      apollo:     "Apollo",
      aleads:     "A-Leads",
      lusha:      "Lusha",
      theirstack: "Theirstack",
    };

    // Fetch credit usage for this search
    const { data: creditRow } = await supabase
      .from("credit_usage")
      .select("cognism_credits, apollo_credits, aleads_credits, lusha_credits, theirstack_credits")
      .eq("search_id", searchId)
      .maybeSingle();

    if (creditRow) {
      const creditFields: { key: string; dbField: keyof typeof creditRow }[] = [
        { key: "cognism",    dbField: "cognism_credits" },
        { key: "apollo",     dbField: "apollo_credits" },
        { key: "aleads",     dbField: "aleads_credits" },
        { key: "lusha",      dbField: "lusha_credits" },
        { key: "theirstack", dbField: "theirstack_credits" },
      ];

      const costRows: string[][] = [];
      let grandTotal = 0;

      creditFields.forEach(({ key, dbField }) => {
        const credits = Number(creditRow[dbField]) || 0;
        if (credits <= 0) return;
        const rate = COST_PER_CREDIT[key];
        const lineCost = credits * rate;
        grandTotal += lineCost;
        costRows.push([
          PLATFORM_LABELS[key],
          String(credits),
          `€ ${rate.toFixed(4)}`,
          `€ ${lineCost.toFixed(2)}`,
        ]);
      });

      if (costRows.length > 0) {
        // Add grand total row
        costRows.push(["Total", "", "", `€ ${grandTotal.toFixed(2)}`]);

        // Page-break check
        const pieBottomY = cy + r + 6;
        const costBlockH = 12 + costRows.length * 8 + 10;
        if (pieBottomY + costBlockH + 14 > PH - 14) {
          doc.addPage();
          cursorY = 20;
        } else {
          cursorY = pieBottomY + 6;
        }

        sectionHeading("Cost Breakdown", cursorY);
        cursorY += 5;

        autoTable(doc, {
          startY: cursorY,
          head: [["Platform", "Credits Used", "Cost / Credit", "Total Cost"]],
          body: costRows,
          margin: { left: ML, right: MR },
          tableWidth: TW,
          styles: {
            fontSize: 8,
            cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
            textColor: C.text,
            lineColor: C.border,
            lineWidth: 0.15,
            fillColor: C.white,
          },
          headStyles: {
            fillColor: C.headerBg,
            textColor: [200, 230, 226] as [number, number, number],
            fontStyle: "bold",
            fontSize: 8,
            lineWidth: 0,
          },
          alternateRowStyles: { fillColor: C.rowAlt },
          didParseCell: (data) => {
            if (data.row.index === costRows.length - 1 && data.section === "body") {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.textColor = C.accentDark;
              data.cell.styles.fillColor = C.totalRow;
            }
          },
          columnStyles: {
            0: { cellWidth: "auto" },
            1: { cellWidth: 36, halign: "center" },
            2: { cellWidth: 36, halign: "center" },
            3: { cellWidth: 36, halign: "right" },
          },
        });
      }
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const totalPages = (doc.internal as any).getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      // Thin teal rule above footer
      doc.setDrawColor(...C.accent);
      doc.setLineWidth(0.4);
      doc.line(ML, PH - 10, PW - MR, PH - 10);
      doc.setTextColor(...C.textLight);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.text("Bravoro · Confidential", ML, PH - 5);
      doc.text(`Page ${i} of ${totalPages}`, PW - MR, PH - 5, { align: "right" });
    }

    const filename = search?.company_name
      ? `bravoro_report_${search.company_name.replace(/\s+/g, "_").toLowerCase()}.pdf`
      : `bravoro_report_${searchId.slice(0, 8)}.pdf`;
    doc.save(filename);

    toast({ title: "PDF Exported", description: "Admin report downloaded" });
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
      case "queued":
        return <Badge variant="secondary" className="bg-amber-500/20 text-amber-600 font-medium">In Queue</Badge>;
      case "completed":
        return <Badge className="bg-primary text-primary-foreground font-medium">Completed</Badge>;
      case "error":
        return (
          <div className="flex items-center gap-2">
            <Badge variant="destructive" className="font-medium">Error</Badge>
            {errorMessage && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:bg-destructive/10"
                    aria-label="View error details"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Error Details</DialogTitle>
                    <DialogDescription>
                      Full error message from processing
                    </DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="max-h-[60vh] w-full rounded-md border p-4">
                    <div className="whitespace-pre-wrap break-words text-sm text-foreground">
                      {errorMessage}
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
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

    // For bulk_people_enrichment, show tabs for enriched vs missing contacts
    if (search.search_type === "bulk_people_enrichment") {
      // Separate results by type
      const enrichedResult = results.find(r => r.result_type === 'enriched' || r.company_name === 'People Enriched');
      const missingResult = results.find(r => r.result_type === 'missing' || r.company_name === 'People not found');
      
      const enrichedContacts = enrichedResult?.contact_data || [];
      const missingContacts = missingResult?.contact_data || [];
      
      // If no categorized results, fall back to showing all contacts as enriched (backwards compatibility)
      const hasCategories = enrichedResult || missingResult;
      if (!hasCategories) {
        const allContacts = results.flatMap(r => r.contact_data);
        const pageKey = getPageKey(search.id, 'all');
        const totalPages = getTotalPages(allContacts);
        const currentPageNum = currentPage[pageKey] || 1;

        if (!currentPage[pageKey]) {
          setCurrentPage(prev => ({ ...prev, [pageKey]: 1 }));
        }

        return (
          <div className="p-4 md:p-6 bg-muted/30 border-t border-border/30">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <h4 className="text-sm font-semibold text-foreground">
                Enriched Contacts <span className="text-muted-foreground font-normal">({allContacts.length} total)</span>
              </h4>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleExportPeopleEnrichment(search.id)}
                  className="hover-lift border-primary/30 text-primary hover:bg-primary/10"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Excel
                </Button>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExportAdminPDF(search.id)}
                    className="hover-lift border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                    title="Admin: Export PDF Report"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    PDF Report
                  </Button>
                )}
              </div>
            </div>
            {renderContactsTable(search.id, 'all', allContacts)}
            {totalPages > 1 && (
              <Pagination className="mt-4">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => handlePageChange(search.id, 'all', Math.max(1, currentPageNum - 1))}
                      className={cn("cursor-pointer hover:bg-muted/50", currentPageNum === 1 && "pointer-events-none opacity-50")}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) pageNum = i + 1;
                    else if (currentPageNum <= 3) pageNum = i + 1;
                    else if (currentPageNum >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = currentPageNum - 2 + i;
                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink onClick={() => handlePageChange(search.id, 'all', pageNum)} isActive={currentPageNum === pageNum} className="cursor-pointer">
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => handlePageChange(search.id, 'all', Math.min(totalPages, currentPageNum + 1))}
                      className={cn("cursor-pointer hover:bg-muted/50", currentPageNum === totalPages && "pointer-events-none opacity-50")}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        );
      }

      // Active tab for people enrichment
      const activeTab = activeCompanyTab[search.id] || 'enriched';
      const activeContacts = activeTab === 'enriched' ? enrichedContacts : missingContacts;
      const pageKey = getPageKey(search.id, activeTab);
      const totalPages = getTotalPages(activeContacts);
      const currentPageNum = currentPage[pageKey] || 1;

      return (
        <div className="p-4 md:p-6 bg-muted/30 border-t border-border/30">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <h4 className="text-sm font-semibold text-foreground">People Enrichment Results</h4>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExportPeopleEnrichment(search.id)}
                className="hover-lift border-primary/30 text-primary hover:bg-primary/10"
              >
                <Download className="h-4 w-4 mr-2" />
                Export Excel
              </Button>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleExportAdminPDF(search.id)}
                  className="hover-lift border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                  title="Admin: Export PDF Report"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  PDF Report
                </Button>
              )}
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              setActiveCompanyTab(prev => ({ ...prev, [search.id]: value }));
              const newPageKey = getPageKey(search.id, value);
              if (!currentPage[newPageKey]) {
                setCurrentPage(prev => ({ ...prev, [newPageKey]: 1 }));
              }
            }}
          >
            <TabsList className="mb-4 bg-muted/30 p-1 rounded-lg">
              <TabsTrigger 
                value="enriched" 
                className="text-xs rounded-md data-[state=active]:bg-card data-[state=active]:shadow-soft px-3 py-1.5"
              >
                People Enriched <span className="ml-1 text-muted-foreground">({enrichedContacts.length})</span>
              </TabsTrigger>
              <TabsTrigger 
                value="missing" 
                className="text-xs rounded-md data-[state=active]:bg-card data-[state=active]:shadow-soft px-3 py-1.5"
              >
                People not found <span className="ml-1 text-muted-foreground">({missingContacts.length})</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="enriched">
              {renderContactsTable(search.id, 'enriched', enrichedContacts)}
            </TabsContent>
            <TabsContent value="missing">
              {renderContactsTable(search.id, 'missing', missingContacts)}
            </TabsContent>
          </Tabs>

          {totalPages > 1 && (
            <Pagination className="mt-4">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => handlePageChange(search.id, activeTab, Math.max(1, currentPageNum - 1))}
                    className={cn("cursor-pointer hover:bg-muted/50", currentPageNum === 1 && "pointer-events-none opacity-50")}
                  />
                </PaginationItem>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (currentPageNum <= 3) pageNum = i + 1;
                  else if (currentPageNum >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = currentPageNum - 2 + i;
                  return (
                    <PaginationItem key={pageNum}>
                      <PaginationLink onClick={() => handlePageChange(search.id, activeTab, pageNum)} isActive={currentPageNum === pageNum} className="cursor-pointer">
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => handlePageChange(search.id, activeTab, Math.min(totalPages, currentPageNum + 1))}
                    className={cn("cursor-pointer hover:bg-muted/50", currentPageNum === totalPages && "pointer-events-none opacity-50")}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      );
    }

    // Original logic for manual entry and bulk upload with company tabs
    // Separate company results from missing companies for bulk search
    const companyResults = results.filter(r => r.result_type !== 'missing_company');
    const missingCompanyResults = results.filter(r => r.result_type === 'missing_company');
    
    const activeCompany = activeCompanyTab[search.id] || (companyResults[0]?.company_name || 'missing_companies');
    const activeResult = activeCompany === 'missing_companies' ? null : companyResults.find(r => r.company_name === activeCompany);
    const contacts = activeResult?.contact_data || [];
    const totalPages = activeCompany === 'missing_companies' ? 1 : getTotalPages(contacts);
    const pageKey = getPageKey(search.id, activeCompany);
    const currentPageNum = currentPage[pageKey] || 1;

    // Render missing companies table
    const renderMissingCompaniesTable = () => {
      if (missingCompanyResults.length === 0) {
        return <p className="text-sm text-muted-foreground">No missing companies.</p>;
      }
      return (
        <div className="overflow-x-auto rounded-lg border border-border/40 bg-card/80">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs font-semibold text-foreground">Company Name</TableHead>
                <TableHead className="text-xs font-semibold text-foreground">Domain</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {missingCompanyResults.map((mc, idx) => (
                <TableRow key={idx} className="hover:bg-muted/10 transition-colors">
                  <TableCell className="text-sm font-medium">{mc.company_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{mc.domain || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    };

    return (
      <div className="p-4 md:p-6 bg-muted/30 border-t border-border/30">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h4 className="text-sm font-semibold text-foreground">Contact Results</h4>
          <div className="flex items-center gap-2">
            {search.search_type === "manual" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExportSegregatedExcel(search.id)}
                className="hover-lift border-primary/30 text-primary hover:bg-primary/10"
              >
                <Download className="h-4 w-4 mr-2" />
                Export Excel
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="hover-lift border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export
                    <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card border-border shadow-medium">
                  <DropdownMenuItem onClick={() => handleExportToExcel(search.id)}>
                    <Download className="h-4 w-4 mr-2" />
                    Combined Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExportSegregatedExcel(search.id)}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Segregated Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExportAdminPDF(search.id)}
                className="hover-lift border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                title="Admin: Export PDF Report"
              >
                <FileText className="h-4 w-4 mr-2" />
                PDF Report
              </Button>
            )}
          </div>
        </div>

        {companyResults.length > 1 || missingCompanyResults.length > 0 ? (
          (() => {
            // Determine how many tabs to show before "more" button
            const MAX_VISIBLE_TABS = 8;
            const hasMissingCompanies = missingCompanyResults.length > 0;
            const totalCompanies = companyResults.length + (hasMissingCompanies ? 1 : 0);
            const showMoreButton = totalCompanies > MAX_VISIBLE_TABS;
            const visibleCompanyCount = showMoreButton 
              ? MAX_VISIBLE_TABS - (hasMissingCompanies ? 2 : 1) // Reserve space for missing companies tab and "more" button
              : companyResults.length;
            const visibleCompanies = companyResults.slice(0, visibleCompanyCount);
            const hiddenCount = companyResults.length - visibleCompanyCount;

            return (
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
                  {hasMissingCompanies && (
                    <TabsTrigger 
                      value="missing_companies" 
                      className="text-xs rounded-md data-[state=active]:bg-card data-[state=active]:shadow-soft px-3 py-1.5"
                    >
                      Missing Companies <span className="ml-1 text-muted-foreground">({missingCompanyResults.length})</span>
                    </TabsTrigger>
                  )}
                  {visibleCompanies.map(result => (
                    <TabsTrigger 
                      key={result.company_name} 
                      value={result.company_name} 
                      className="text-xs rounded-md data-[state=active]:bg-card data-[state=active]:shadow-soft px-3 py-1.5"
                    >
                      {result.company_name} <span className="ml-1 text-muted-foreground">({result.contact_data.length})</span>
                    </TabsTrigger>
                  ))}
                  {showMoreButton && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs px-3 py-1.5 h-auto font-medium text-primary hover:text-primary/80 hover:bg-primary/10"
                      onClick={() => setCompanyBrowserOpen(prev => ({ ...prev, [search.id]: true }))}
                    >
                      <MoreHorizontal className="h-3 w-3 mr-1" />
                      More ({hiddenCount})
                    </Button>
                  )}
                </TabsList>
                {companyResults.map(result => (
                  <TabsContent key={result.company_name} value={result.company_name}>
                    {renderContactsTable(search.id, result.company_name, result.contact_data)}
                  </TabsContent>
                ))}
                {hasMissingCompanies && (
                  <TabsContent value="missing_companies">
                    {renderMissingCompaniesTable()}
                  </TabsContent>
                )}

                <CompanyBrowserDialog
                  open={companyBrowserOpen[search.id] || false}
                  onOpenChange={(open) => setCompanyBrowserOpen(prev => ({ ...prev, [search.id]: open }))}
                  companies={companyResults}
                  onSelectCompany={(companyName) => {
                    setActiveCompanyTab(prev => ({ ...prev, [search.id]: companyName }));
                    const newPageKey = getPageKey(search.id, companyName);
                    if (!currentPage[newPageKey]) {
                      setCurrentPage(prev => ({ ...prev, [newPageKey]: 1 }));
                    }
                  }}
                />
              </Tabs>
            );
          })()
        ) : companyResults.length === 1 ? (
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              <span className="font-medium text-foreground">{companyResults[0].company_name}</span> · {contacts.length} contacts
            </p>
            {renderContactsTable(search.id, companyResults[0].company_name, contacts)}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No results found.</p>
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

    const PhoneCell = ({ contact }: { contact: Contact }) => {
      const phones = useMemo(() => getPhoneNumbers(contact), [contact]);

      const handleCopy = async (value: string) => {
        try {
          await navigator.clipboard.writeText(value);
          toast({
            title: "Copied",
            description: "Phone number copied to clipboard",
          });
        } catch {
          toast({
            title: "Copy failed",
            description: "Couldn't copy the phone number",
            variant: "destructive",
          });
        }
      };

      if (phones.length === 0) {
        return <span className="text-muted-foreground">-</span>;
      }

      if (phones.length === 1) {
        return <span className="text-muted-foreground">{phones[0]}</span>;
      }

      const primary = phones[0];
      const additionalCount = phones.length - 1;
      return (
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">{primary}</span>
          <span className="text-muted-foreground">,</span>

          <Dialog>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs font-medium text-primary hover:text-primary/80 hover:bg-primary/10"
              >
                +{additionalCount}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Phone numbers
                </DialogTitle>
                <DialogDescription>
                  {contact.First_Name || contact.Last_Name
                    ? `For ${[contact.First_Name, contact.Last_Name].filter(Boolean).join(" ")}`
                    : "All available phone numbers"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                {phones.map((p, i) => (
                  <div
                    key={`${p}-${i}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-card p-3"
                  >
                    <a
                      href={`tel:${p}`}
                      className="text-sm font-medium text-foreground hover:text-accent transition-colors break-all"
                    >
                      {p}
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => handleCopy(p)}
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      );
    };

    if (paginatedContacts.length === 0) {
      return <p className="text-sm text-muted-foreground">No contacts available.</p>;
    }

    return (
      <div>
        <CompanyJobsPanel contacts={contacts} />
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
                <TableCell className="text-sm">
                  <PhoneCell contact={contact} />
                </TableCell>
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
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex">
      <AppSidebar isAdmin={isAdmin} isDeveloper={user?.email === "pranavshah0907@gmail.com"} onSignOut={handleSignOut} />

      <main className="flex-1 ml-16 min-h-screen">
        {/* Background Effects */}
        <div className="fixed inset-0 ml-16 pointer-events-none overflow-hidden">
          <div 
            className="absolute -top-1/4 -right-1/4 w-[600px] h-[600px] rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)" }}
          />
        </div>

        <div className="relative z-10 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          {/* Page Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 md:mb-8 animate-fade-in">
            <div className="flex items-center justify-between w-full lg:w-auto">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                  Search Results
                </h1>
                <p className="text-muted-foreground mt-1">Track your enrichment requests and download results</p>
              </div>
              <img src={bravoroLogo} alt="Bravoro" className="h-6 w-auto hidden md:block lg:hidden" />
            </div>
            <img src={bravoroLogo} alt="Bravoro" className="h-6 w-auto hidden lg:block" />
            
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
                    <TableHead className="font-semibold text-foreground">Name / File</TableHead>
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
                          <TableCell className="max-w-[300px]">
                            {(search.search_type === "bulk" || search.search_type === "bulk_people_enrichment") && search.excel_file_name ? (
                              <span className="text-sm truncate block" title={search.excel_file_name}>{search.excel_file_name}</span>
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
                            {search.status === "completed" ? (
                              search.search_type === "bulk_people_enrichment" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleExportPeopleEnrichment(search.id)}
                                  className="hover-lift border-primary/30 text-primary hover:bg-primary/10 w-24"
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Export
                                </Button>
                              ) : search.search_type === "manual" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleExportSegregatedExcel(search.id)}
                                  className="hover-lift border-primary/30 text-primary hover:bg-primary/10 w-24"
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Export
                                </Button>
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="hover-lift border-primary/30 text-primary hover:bg-primary/10 w-24"
                                    >
                                      <Download className="h-4 w-4 mr-2" />
                                      Export
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="bg-card border-border shadow-medium">
                                    <DropdownMenuItem onClick={() => handleExportToExcel(search.id)}>
                                      <Download className="h-4 w-4 mr-2" />
                                      Combined Excel
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleExportSegregatedExcel(search.id)}>
                                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                                      Segregated Excel
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )
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