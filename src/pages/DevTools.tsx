import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileHeader } from "@/components/MobileHeader";
import { MobileTabBar } from "@/components/MobileTabBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Terminal, RefreshCw, Trash2, Clock, Loader2, Inbox,
  Square, Copy, Check, Filter, CheckCircle2, AlertTriangle,
  XCircle, ArrowUpDown, ChevronUp, ChevronDown, Lock,
  MoreHorizontal, Download, FileText,
} from "lucide-react";
import bravoroLogo from "@/assets/bravoro-logo.svg";
import { differenceInHours, format } from "date-fns";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SearchItem {
  search_id: string;
  user_email: string;
  full_name: string;
  search_type: string;
  status: string;
  error_message?: string | null;
  type_label: string;
  entry_method: string;
  excel_file_name?: string | null;
  result_count: number;
  is_flag_locked?: boolean;
  created_at: string;
  updated_at?: string;
  locked_at?: string;
}

interface QueueItem {
  id: string;
  search_id: string;
  entry_type: string;
  user_email: string;
  full_name: string;
  type_label: string;
  entry_method: string;
  created_at: string;
}

interface StopTarget {
  searchId: string;
  label: string;
}

interface DeleteTarget {
  queueItemId: string;
  searchId: string;
  label: string;
}

type StatusFilter = "all" | "processing" | "completed" | "error" | "queued";
type TimeFilter = "24h" | "7d" | "30d" | "all";
type SortDir = "desc" | "asc";

const TIME_FILTER_HOURS: Record<TimeFilter, number> = {
  "24h": 24, "7d": 168, "30d": 720, "all": Infinity,
};

// Effective display status
function getDisplayStatus(item: SearchItem): "processing" | "completed" | "error" | "stuck" {
  if (item.status === "error" || item.status === "cancelled") return "error";
  if (item.status === "completed") return "completed";
  // status === "processing"
  if (item.result_count > 0) return "completed"; // done but stale flag
  const age = differenceInHours(new Date(), new Date(item.updated_at ?? item.created_at));
  return age > 24 ? "stuck" : "processing";
}

function formatDateTime(dateStr: string): string {
  try {
    return format(new Date(dateStr), "dd MMM yyyy, hh:mm a");
  } catch {
    return "—";
  }
}

// ── Page ───────────────────────────────────────────────────────────────────────

const DevTools = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  const [flagItem, setFlagItem] = useState<SearchItem | null>(null);
  const [searches, setSearches] = useState<SearchItem[]>([]);
  const [queued, setQueued] = useState<QueueItem[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [textFilter, setTextFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("7d");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [stopTarget, setStopTarget] = useState<StopTarget | null>(null);
  const [stopNote, setStopNote] = useState("");
  const [stopping, setStopping] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedError, setExpandedError] = useState<string | null>(null);

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => { checkAccess(); }, []);

  const checkAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { navigate("/auth"); return; }
    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", session.user.id).single();
    if (roleData?.role !== "admin" || session.user.email !== "pranavshah0907@gmail.com") {
      toast({ title: "Access Denied", variant: "destructive" });
      navigate("/dashboard");
      return;
    }
    setIsAdmin(true);
    setLoading(false);
    fetchData();
  };

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-dev-tools", {
        body: { action: "get_queue" },
      });
      if (error) throw error;
      setFlagItem(data.flag_item ?? null);
      setSearches(data.searches ?? []);
      setQueued(data.queued ?? []);
      setLastRefreshed(new Date());
    } catch {
      toast({ title: "Failed to load data", variant: "destructive" });
    } finally {
      setFetching(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!isAdmin) return;
    const id = setInterval(fetchData, 15_000);
    return () => clearInterval(id);
  }, [isAdmin, fetchData]);

  // ── Filtering + sorting ───────────────────────────────────────────────────
  const matchesText = useCallback((item: { user_email?: string; full_name?: string }) => {
    if (!textFilter) return true;
    const q = textFilter.toLowerCase();
    return item.user_email?.toLowerCase().includes(q) || item.full_name?.toLowerCase().includes(q);
  }, [textFilter]);

  const filteredSearches = useMemo(() => {
    const maxHours = TIME_FILTER_HOURS[timeFilter];
    return searches
      .filter(s => {
        if (!matchesText(s)) return false;
        // Time filter
        if (maxHours !== Infinity) {
          const age = differenceInHours(new Date(), new Date(s.updated_at ?? s.created_at));
          if (age > maxHours) return false;
        }
        // Status filter
        if (statusFilter === "all") return true;
        if (statusFilter === "queued") return false; // queued items are separate
        const ds = getDisplayStatus(s);
        if (statusFilter === "processing") return ds === "processing" || ds === "stuck";
        if (statusFilter === "completed") return ds === "completed";
        if (statusFilter === "error") return ds === "error";
        return true;
      })
      .sort((a, b) => {
        const da = new Date(a.updated_at ?? a.created_at).getTime();
        const db = new Date(b.updated_at ?? b.created_at).getTime();
        return sortDir === "desc" ? db - da : da - db;
      });
  }, [searches, textFilter, statusFilter, timeFilter, sortDir, matchesText]);

  const filteredQueued = useMemo(() => queued.filter(matchesText), [queued, matchesText]);

  // Stats
  const counts = useMemo(() => {
    const c = { total: searches.length, processing: 0, stuck: 0, completed: 0, error: 0, queued: queued.length };
    for (const s of searches) {
      const ds = getDisplayStatus(s);
      if (ds === "processing") c.processing++;
      else if (ds === "stuck") c.stuck++;
      else if (ds === "completed") c.completed++;
      else if (ds === "error") c.error++;
    }
    return c;
  }, [searches, queued]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleSignOut = async () => { await supabase.auth.signOut({ scope: 'local' }); navigate("/"); };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const confirmStop = async () => {
    if (!stopTarget) return;
    setStopping(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-dev-tools", {
        body: { action: "stop_search", searchId: stopTarget.searchId, note: stopNote },
      });
      if (error) throw error;
      const parts: string[] = ["Search stopped."];
      if (data.flag_released) parts.push("Flag released.");
      if (data.next_dispatched) parts.push("Next item dispatched.");
      toast({ title: parts.join(" ") });
      setStopTarget(null);
      setStopNote("");
      await fetchData();
    } catch (err) {
      toast({ title: "Stop failed", description: String(err), variant: "destructive" });
    } finally {
      setStopping(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("admin-dev-tools", {
        body: { action: "delete_item", queueItemId: deleteTarget.queueItemId, searchId: deleteTarget.searchId },
      });
      if (error) throw error;
      toast({ title: "Removed from queue" });
      setDeleteTarget(null);
      await fetchData();
    } catch (err) {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  // ── Per-search export helpers ────────────────────────────────────────────
  const [exporting, setExporting] = useState<string | null>(null);

  interface Contact {
    Record_ID?: string;
    First_Name: string;
    Last_Name: string;
    Domain: string;
    Organization: string;
    Title: string;
    Email: string;
    LinkedIn: string;
    Phone_Number_1: string;
    Phone_Number_2: string;
    job_search_result?: { job_search_status: string; results: any[] };
    Provider?: string;
    People_Search_By?: string;
    CognismCreditsUsed?: number;
    lushaCreditsUsed?: number;
    aLeadscreditsUsed?: number;
    apolloCreditsUsed?: number;
  }

  interface ResultRow {
    id: string;
    search_id: string;
    company_name: string;
    domain: string | null;
    contact_data: Contact[];
    result_type?: string;
  }

  const fetchResults = async (searchId: string): Promise<ResultRow[]> => {
    const { data, error } = await supabase
      .from("search_results")
      .select("*")
      .eq("search_id", searchId);
    if (error) throw error;
    return (data || []).map(item => ({
      ...item,
      contact_data: Array.isArray(item.contact_data) ? item.contact_data as unknown as Contact[] : [],
    }));
  };

  const buildJobsCell = (contacts: Contact[]): string => {
    const seen = new Set<string>();
    const jobBlocks: string[] = [];
    for (const c of contacts) {
      if (c.job_search_result?.job_search_status === "jobs_found" && Array.isArray(c.job_search_result.results)) {
        for (const resultGroup of c.job_search_result.results) {
          const jobList = Array.isArray((resultGroup as any).jobs) ? (resultGroup as any).jobs : [resultGroup];
          for (const job of jobList) {
            const key = job.job_link || job.job_title;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            const lines = [job.job_title || "", job.job_link || "", job.location || "", job.last_posted_date || ""];
            if (job.hiring_team_name) lines.push(job.hiring_team_name);
            if (job.recruiter_phone_number) lines.push(job.recruiter_phone_number);
            jobBlocks.push(lines.filter(Boolean).join("\n"));
          }
        }
      }
    }
    return jobBlocks.join("\n\n");
  };

  // ── Export Excel (per search — same as Results page) ──────────────────────
  const handleExportExcel = async (item: SearchItem) => {
    setExporting(item.search_id);
    try {
      const results = await fetchResults(item.search_id);
      if (!results.length) { toast({ title: "No results to export", variant: "destructive" }); return; }

      const isPeopleEnrichment = item.search_type === "bulk_people_enrichment";
      const wb = XLSX.utils.book_new();

      if (isPeopleEnrichment) {
        const enrichedResults = results.filter(r => r.result_type === "enriched" || r.company_name === "People Enriched");
        const enrichedContacts = enrichedResults.flatMap(r => r.contact_data);
        const missing = results.find(r => r.result_type === "missing" || r.company_name === "People not found");
        if (enrichedContacts.length) {
          const ws = XLSX.utils.json_to_sheet(enrichedContacts.map(c => ({
            Record_ID: c.Record_ID || "", First_Name: c.First_Name, Last_Name: c.Last_Name,
            Domain: c.Domain, Organization: c.Organization, Title: c.Title,
            Email: c.Email, LinkedIn: c.LinkedIn, Phone_Number_1: c.Phone_Number_1, Phone_Number_2: c.Phone_Number_2,
          })));
          XLSX.utils.book_append_sheet(wb, ws, "Output");
        }
        if (missing?.contact_data?.length) {
          const ws = XLSX.utils.json_to_sheet(missing.contact_data.map(c => ({
            Record_ID: c.Record_ID || "", First_Name: c.First_Name, Last_Name: c.Last_Name,
            Domain: c.Domain || "", Organization: c.Organization || "", Title: c.Title || "",
            Email: c.Email || "", LinkedIn: c.LinkedIn || "", Phone_Number_1: c.Phone_Number_1 || "", Phone_Number_2: c.Phone_Number_2 || "",
          })));
          XLSX.utils.book_append_sheet(wb, ws, "Missing_contacts");
        }
      } else {
        const companyResults = results.filter(r => r.result_type !== "missing_company");
        const missingCompanies = results.filter(r => r.result_type === "missing_company");
        const allContacts: any[] = [];
        companyResults.forEach(r => {
          const jobsCell = buildJobsCell(r.contact_data);
          r.contact_data.forEach(c => {
            allContacts.push({
              Company: r.company_name, Domain: r.domain || c.Domain,
              First_Name: c.First_Name, Last_Name: c.Last_Name, Title: c.Title,
              Email: c.Email, LinkedIn: c.LinkedIn, Phone_1: c.Phone_Number_1, Phone_2: c.Phone_Number_2,
              open_job_positions: jobsCell,
            });
          });
        });
        if (allContacts.length) {
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allContacts), "Contacts");
        }
        if (missingCompanies.length) {
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
            missingCompanies.map(mc => ({ Company_Name: mc.company_name, Domain: mc.domain || "" }))
          ), "Missing_Companies");
        }
      }

      if (!wb.SheetNames.length) { toast({ title: "No data to export", variant: "destructive" }); return; }
      const srcName = item.excel_file_name?.replace(/\.[^.]+$/, "");
      XLSX.writeFile(wb, `${srcName || "search_results"}_processed.xlsx`);
      toast({ title: "Excel exported" });
    } catch (err) {
      toast({ title: "Export failed", description: String(err), variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  // ── Export PDF (per search — same as Results page) ────────────────────────
  const handleExportPDF = async (item: SearchItem) => {
    setExporting(item.search_id);
    try {
      const results = await fetchResults(item.search_id);
      if (!results.length) { toast({ title: "No results to export", variant: "destructive" }); return; }

      const companyResults = results.filter(r => r.result_type !== "missing_company");
      const allContacts = companyResults.flatMap(r => r.contact_data);
      if (!allContacts.length) { toast({ title: "No contacts for PDF", variant: "destructive" }); return; }

      const C = {
        white: [255, 255, 255] as [number,number,number],
        accent: [0, 160, 125] as [number,number,number],
        accentDark: [0, 110, 88] as [number,number,number],
        accentPale: [220, 245, 240] as [number,number,number],
        headerBg: [15, 60, 55] as [number,number,number],
        text: [30, 40, 38] as [number,number,number],
        textMid: [80, 95, 92] as [number,number,number],
        textLight: [140, 155, 152] as [number,number,number],
        rowAlt: [244, 250, 248] as [number,number,number],
        border: [210, 230, 226] as [number,number,number],
        totalRow: [230, 245, 240] as [number,number,number],
      };

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const PW = doc.internal.pageSize.getWidth();
      const PH = doc.internal.pageSize.getHeight();
      const ML = 15, MR = 15, TW = PW - ML - MR;

      // Header band
      doc.setFillColor(...C.headerBg);
      doc.rect(0, 0, PW, 28, "F");
      doc.setFillColor(...C.accent);
      doc.rect(0, 0, 5, 28, "F");
      doc.setTextColor(...C.accent);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("BRAVORO", ML + 4, 13);
      doc.setTextColor(200, 230, 226);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Enrichment Report", ML + 4, 21);
      const label = item.excel_file_name || item.user_email || `ID: ${item.search_id.slice(0, 8)}`;
      doc.setTextColor(160, 200, 195);
      doc.setFontSize(8);
      doc.text(label, PW - MR, 13, { align: "right" });
      doc.text(new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }), PW - MR, 21, { align: "right" });

      let cursorY = 36;

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

      // Contact Details table
      sectionHeading("Contact Details", cursorY);
      cursorY += 5;
      const contactRows = allContacts.map(c => {
        const name = [c.First_Name, c.Last_Name].filter(Boolean).join(" ") || "—";
        const phones = [c.Phone_Number_1, c.Phone_Number_2].filter(p => p && String(p).trim());
        const provider = (c.Provider || "").trim();
        const phoneStr = phones.length ? (provider ? `[${provider}]  ${phones.join("  ·  ")}` : phones.join("  ·  ")) : "—";
        return [name, c.Organization || "—", c.Title || "—", phoneStr];
      });

      autoTable(doc, {
        startY: cursorY,
        head: [["Name", "Organisation", "Title", "Phone (Provider)"]],
        body: contactRows,
        margin: { left: ML, right: MR },
        styles: { fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, textColor: C.text, lineColor: C.border, lineWidth: 0.15, fillColor: C.white, font: "helvetica", overflow: "linebreak" },
        headStyles: { fillColor: C.headerBg, textColor: [200, 230, 226] as [number,number,number], fontStyle: "bold", fontSize: 8, lineWidth: 0 },
        alternateRowStyles: { fillColor: C.rowAlt },
        columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 42 }, 2: { cellWidth: 52 }, 3: { cellWidth: "auto" } },
      });

      // Provider statistics
      const providerMap: Record<string, number> = {};
      allContacts.forEach(c => {
        const hasPhone = [c.Phone_Number_1, c.Phone_Number_2].some(p => p && String(p).trim());
        if (!hasPhone) return;
        providerMap[(c.Provider || "Unknown").trim()] = (providerMap[(c.Provider || "Unknown").trim()] || 0) + 1;
      });
      const total = Object.values(providerMap).reduce((a, b) => a + b, 0);
      const providerEntries = Object.entries(providerMap).sort((a, b) => b[1] - a[1]);

      const tableEndY = (doc as any).lastAutoTable?.finalY ?? cursorY;
      cursorY = tableEndY + 10;

      if (providerEntries.length > 0) {
        sectionHeading("Provider Summary", cursorY);
        cursorY += 5;
        const statsRows = providerEntries.map(([prov, count]) => [prov, String(count), `${((count / total) * 100).toFixed(1)}%`]);
        statsRows.push(["Total", String(total), "100%"]);

        autoTable(doc, {
          startY: cursorY,
          head: [["Provider", "Contacts Found", "Share"]],
          body: statsRows,
          margin: { left: ML, right: MR },
          tableWidth: TW,
          styles: { fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, textColor: C.text, lineColor: C.border, lineWidth: 0.15, fillColor: C.white },
          headStyles: { fillColor: C.headerBg, textColor: [200, 230, 226] as [number,number,number], fontStyle: "bold", fontSize: 8, lineWidth: 0 },
          alternateRowStyles: { fillColor: C.rowAlt },
          didParseCell: (data) => {
            if (data.row.index === statsRows.length - 1 && data.section === "body") {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.textColor = C.accentDark;
              data.cell.styles.fillColor = C.totalRow;
            }
          },
          columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 50, halign: "center" }, 2: { cellWidth: 36, halign: "center" } },
        });

        // Pie chart
        const statsEndY = (doc as any).lastAutoTable?.finalY ?? cursorY;
        cursorY = statsEndY + 10;
        doc.setTextColor(...C.accentDark);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.text("PROVIDER BREAKDOWN", ML, cursorY);
        cursorY += 5;

        const pieColors: [number,number,number][] = [[0,160,125],[230,90,60],[60,130,200],[200,160,30],[140,80,200],[40,190,155]];
        const sf = doc.internal.scaleFactor;
        const pageH = doc.internal.pageSize.getHeight();
        const drawPieSlice = (cx: number, cy: number, r: number, startAng: number, endAng: number, color: [number,number,number]) => {
          if (Math.abs(endAng - startAng) < 0.0001) return;
          doc.setFillColor(...color);
          const steps = 48;
          const toX = (x: number) => (x * sf).toFixed(3);
          const toY = (y: number) => ((pageH - y) * sf).toFixed(3);
          const parts: string[] = [`${toX(cx)} ${toY(cy)} m`];
          for (let s = 0; s <= steps; s++) {
            const a = startAng + (endAng - startAng) * s / steps;
            parts.push(`${toX(cx + r * Math.cos(a))} ${toY(cy + r * Math.sin(a))} l`);
          }
          parts.push(`${toX(cx)} ${toY(cy)} l f`);
          (doc.internal as any).out(parts.join(" "));
        };

        const r = 16, cx = ML + r + 4, chartTopY = cursorY, cy = chartTopY + r;
        let angle = -Math.PI / 2;
        providerEntries.forEach(([, count], i) => {
          const sweep = (count / total) * 2 * Math.PI;
          drawPieSlice(cx, cy, r, angle, angle + sweep - 0.03, pieColors[i % pieColors.length]);
          angle += sweep;
        });
        doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.6); doc.circle(cx, cy, r, "S");
        doc.setFillColor(...C.white); doc.circle(cx, cy, r * 0.44, "F");
        doc.setDrawColor(...C.border); doc.setLineWidth(0.15); doc.circle(cx, cy, r * 0.44, "S");

        const legendX = cx + r + 10, rowH = 7;
        const legendStartY = cy - (providerEntries.length * rowH) / 2 + rowH * 0.5;
        const pctX = ML + TW;
        providerEntries.forEach(([prov, count], i) => {
          const pct = ((count / total) * 100).toFixed(1);
          const ly = legendStartY + i * rowH;
          doc.setFillColor(...pieColors[i % pieColors.length]);
          doc.circle(legendX + 1.8, ly - 1.5, 2.2, "F");
          doc.setTextColor(...C.text); doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
          doc.text(prov, legendX + 7, ly);
          doc.setTextColor(...C.textMid); doc.setFont("helvetica", "bold");
          doc.text(`${pct}%`, pctX, ly, { align: "right" });
          doc.setDrawColor(...C.border); doc.setLineWidth(0.15);
          const nameEndX = legendX + 7 + doc.getStringUnitWidth(prov) * 8.5 / sf / (72 / 25.4) + 2;
          doc.setLineDashPattern([0.8, 1.2], 0);
          doc.line(nameEndX, ly - 1, pctX - doc.getStringUnitWidth(`${pct}%`) * 8.5 / sf / (72 / 25.4) - 3, ly - 1);
          doc.setLineDashPattern([], 0);
        });

        // Cost breakdown
        const COST_PER_CREDIT: Record<string, number> = { cognism: 0.76, apollo: 0.01975, aleads: 0.00683, lusha: 0.087416, theirstack: 0.0326 };
        const PLATFORM_LABELS: Record<string, string> = { cognism: "Cognism", apollo: "Apollo", aleads: "A-Leads", lusha: "Lusha", theirstack: "Theirstack" };

        const { data: creditRow } = await supabase
          .from("credit_usage")
          .select("cognism_credits, apollo_credits, aleads_credits, lusha_credits, theirstack_credits")
          .eq("search_id", item.search_id)
          .maybeSingle();

        if (creditRow) {
          const creditFields = [
            { key: "cognism", dbField: "cognism_credits" as const },
            { key: "apollo", dbField: "apollo_credits" as const },
            { key: "aleads", dbField: "aleads_credits" as const },
            { key: "lusha", dbField: "lusha_credits" as const },
            { key: "theirstack", dbField: "theirstack_credits" as const },
          ];
          const costRows: string[][] = [];
          let grandTotal = 0;
          creditFields.forEach(({ key, dbField }) => {
            const credits = Number(creditRow[dbField]) || 0;
            if (credits <= 0) return;
            const rate = COST_PER_CREDIT[key];
            const lineCost = credits * rate;
            grandTotal += lineCost;
            costRows.push([PLATFORM_LABELS[key], String(credits), `€ ${rate.toFixed(4)}`, `€ ${lineCost.toFixed(2)}`]);
          });
          if (costRows.length > 0) {
            costRows.push(["Total", "", "", `€ ${grandTotal.toFixed(2)}`]);
            const pieBottomY = cy + r + 6;
            const costBlockH = 12 + costRows.length * 8 + 10;
            if (pieBottomY + costBlockH + 14 > PH - 14) { doc.addPage(); cursorY = 20; } else { cursorY = pieBottomY + 6; }
            sectionHeading("Cost Breakdown", cursorY);
            cursorY += 5;
            autoTable(doc, {
              startY: cursorY,
              head: [["Platform", "Credits Used", "Cost / Credit", "Total Cost"]],
              body: costRows,
              margin: { left: ML, right: MR },
              tableWidth: TW,
              styles: { fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, textColor: C.text, lineColor: C.border, lineWidth: 0.15, fillColor: C.white },
              headStyles: { fillColor: C.headerBg, textColor: [200, 230, 226] as [number,number,number], fontStyle: "bold", fontSize: 8, lineWidth: 0 },
              alternateRowStyles: { fillColor: C.rowAlt },
              didParseCell: (data) => {
                if (data.row.index === costRows.length - 1 && data.section === "body") {
                  data.cell.styles.fontStyle = "bold";
                  data.cell.styles.textColor = C.accentDark;
                  data.cell.styles.fillColor = C.totalRow;
                }
              },
              columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 36, halign: "center" }, 2: { cellWidth: 36, halign: "center" }, 3: { cellWidth: 36, halign: "right" } },
            });
          }
        }
      }

      // Footer on all pages
      const totalPages = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(...C.accent); doc.setLineWidth(0.4);
        doc.line(ML, PH - 10, PW - MR, PH - 10);
        doc.setTextColor(...C.textLight); doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
        doc.text("Bravoro · Confidential", ML, PH - 5);
        doc.text(`Page ${i} of ${totalPages}`, PW - MR, PH - 5, { align: "right" });
      }

      const filename = item.excel_file_name
        ? `bravoro_report_${item.excel_file_name.replace(/\.[^.]+$/, "").replace(/\s+/g, "_").toLowerCase()}.pdf`
        : `bravoro_report_${item.search_id.slice(0, 8)}.pdf`;
      doc.save(filename);
      toast({ title: "PDF exported", description: "Enrichment Report" });
    } catch (err) {
      toast({ title: "PDF export failed", description: String(err), variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex overflow-hidden">
      <AppSidebar isAdmin={isAdmin} isDeveloper onSignOut={handleSignOut} />
      <MobileHeader />
      <MobileTabBar isAdmin={isAdmin} isDeveloper />

      <div className="flex-1 ml-0 md:ml-16 flex flex-col h-screen overflow-hidden pt-14 pb-20 md:pt-0 md:pb-0">

        {/* Header */}
        <header className="shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 px-4 md:px-8 py-3 md:py-4 border-b border-border/30" style={{ background: "#060f10" }}>
          <div className="flex items-center gap-3">
            <Terminal className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold text-foreground tracking-tight">Developer Tools</span>
            <img src={bravoroLogo} alt="Bravoro" className="ml-2 h-4 w-auto opacity-30 hidden md:block" />
          </div>

          <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={textFilter}
                onChange={(e) => setTextFilter(e.target.value)}
                placeholder="Filter..."
                className="h-8 w-full md:w-56 pl-8 text-xs bg-transparent border-border/40 focus:border-primary/50 placeholder:text-muted-foreground/50"
              />
            </div>
            {lastRefreshed && (
              <span className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {format(lastRefreshed, "hh:mm:ss a")}
              </span>
            )}
            <Button
              size="sm" variant="outline" onClick={fetchData} disabled={fetching}
              className="h-8 text-xs border-border/40 hover:border-primary/40 hover:text-primary transition-colors shrink-0"
            >
              <RefreshCw className={cn("h-3 w-3 mr-1.5", fetching && "animate-spin")} />
              <span className="hidden md:inline">Refresh</span>
            </Button>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-[1200px] mx-auto space-y-6">

            {/* Status filter chips (horizontal) */}
            <div className="flex items-center gap-2 flex-wrap">
              {([
                { key: "all" as StatusFilter, label: "All", count: counts.total, color: "text-foreground", activeBg: "bg-white/10" },
                { key: "processing" as StatusFilter, label: "Processing", count: counts.processing + counts.stuck, color: "text-orange-400", activeBg: "bg-orange-400/15" },
                { key: "completed" as StatusFilter, label: "Completed", count: counts.completed, color: "text-emerald-400", activeBg: "bg-emerald-400/15" },
                { key: "error" as StatusFilter, label: "Errored", count: counts.error, color: "text-red-400", activeBg: "bg-red-400/15" },
                { key: "queued" as StatusFilter, label: "Queued", count: counts.queued, color: "text-sky-400", activeBg: "bg-sky-400/15" },
              ]).map(({ key, label, count, color, activeBg }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border",
                    statusFilter === key
                      ? cn(activeBg, color, "border-current/20")
                      : "bg-transparent text-muted-foreground border-border/20 hover:border-border/40 hover:text-foreground"
                  )}
                >
                  {label}
                  <span className={cn(
                    "text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-md",
                    statusFilter === key ? "bg-white/10" : "bg-white/5"
                  )}>
                    {count}
                  </span>
                </button>
              ))}

              {/* Spacer + time filter + sort */}
              <div className="ml-auto flex items-center gap-2">
                <div className="flex items-center gap-1 bg-black/30 rounded-lg p-0.5">
                  {(["24h", "7d", "30d", "all"] as TimeFilter[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setTimeFilter(t)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                        timeFilter === t
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {t === "all" ? "All time" : t}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground bg-black/30 transition-colors"
                  title={`Sort by date: ${sortDir === "desc" ? "newest first" : "oldest first"}`}
                >
                  {sortDir === "desc" ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                  Date
                </button>
              </div>
            </div>

            {/* ── Processing Flag Banner ─────────────────────────────────── */}
            {flagItem && (statusFilter === "all" || statusFilter === "processing") && (
              <div className="rounded-xl border border-amber-500/30 px-5 py-3 flex items-center justify-between" style={{ background: "rgba(245,158,11,0.05)" }}>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Flag Locked</span>
                  </div>
                  <button onClick={() => copyId(flagItem.search_id)} className="text-xs font-mono text-amber-300/80 hover:text-amber-300 transition-colors" title={flagItem.search_id}>
                    {flagItem.search_id.slice(0, 8)}...
                    {copiedId === flagItem.search_id && <Check className="inline h-3 w-3 ml-1 text-emerald-400" />}
                  </button>
                  <span className="text-sm text-foreground">{flagItem.user_email}</span>
                  <span className="text-xs text-muted-foreground">{flagItem.type_label} / {flagItem.entry_method}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(flagItem.locked_at ?? flagItem.created_at)}</span>
                </div>
                <button
                  onClick={() => setStopTarget({ searchId: flagItem.search_id, label: flagItem.user_email || flagItem.search_id.slice(0, 8) })}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  title="Stop"
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* ── Queued section ──────────────────────────────────────────── */}
            {(statusFilter === "all" || statusFilter === "queued") && filteredQueued.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
                  Queue ({filteredQueued.length})
                </h2>
                <div className="rounded-xl border border-border/30 overflow-hidden" style={{ background: "#0c1d1d" }}>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/30">
                        {["#", "Search ID", "User", "Type / Method", "Submitted", ""].map((h, i) => (
                          <th key={i} className={cn("text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider", i === 0 && "w-10")}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredQueued.map((item, idx) => (
                        <tr key={item.id} className={cn("hover:bg-white/[0.02] transition-colors", idx > 0 && "border-t border-border/10")}>
                          <td className="px-4 py-3 text-xs font-mono text-muted-foreground">#{idx + 1}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => copyId(item.search_id)} className="group flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-primary transition-colors" title={item.search_id}>
                              {item.search_id.slice(0, 8)}
                              {copiedId === item.search_id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-foreground">{item.user_email || "—"}</span>
                              {item.full_name && <span className="text-xs text-muted-foreground">{item.full_name}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-foreground/80">{item.type_label}</span>
                            <span className="text-xs text-muted-foreground ml-2">{item.entry_method}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{formatDateTime(item.created_at)}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setDeleteTarget({ queueItemId: item.id, searchId: item.search_id, label: item.user_email || item.search_id.slice(0, 8) })}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Remove from queue"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ── Main searches table ─────────────────────────────────────── */}
            {statusFilter !== "queued" && (
              <section>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
                  Searches ({filteredSearches.length}{filteredSearches.length !== searches.length ? ` of ${searches.length}` : ""})
                </h2>

                {filteredSearches.length > 0 ? (
                  <div className="rounded-xl border border-border/30 overflow-hidden" style={{ background: "#0c1d1d" }}>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/30">
                          {["#", "Search ID", "User", "Type / Method", "Results", "Date / Time", "Status", ""].map((h, i) => (
                            <th
                              key={i}
                              className={cn(
                                "text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider",
                                i === 0 && "w-10",
                                i === 4 && "w-20",
                                i === 5 && "cursor-pointer hover:text-foreground select-none"
                              )}
                              onClick={i === 5 ? () => setSortDir(d => d === "desc" ? "asc" : "desc") : undefined}
                            >
                              {h}
                              {i === 5 && (
                                <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-50" />
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSearches.map((item, idx) => {
                          const ds = getDisplayStatus(item);
                          const isExpanded = expandedError === item.search_id;
                          return (
                            <>
                              <tr
                                key={item.search_id}
                                className={cn(
                                  "hover:bg-white/[0.02] transition-colors",
                                  idx > 0 && "border-t border-border/10",
                                  item.is_flag_locked && "bg-amber-500/[0.03]"
                                )}
                              >
                                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">#{idx + 1}</td>

                                <td className="px-4 py-3">
                                  <button
                                    onClick={() => copyId(item.search_id)}
                                    className="group flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
                                    title={item.search_id}
                                  >
                                    {item.search_id.slice(0, 8)}
                                    {copiedId === item.search_id
                                      ? <Check className="h-3 w-3 text-emerald-400" />
                                      : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                  </button>
                                </td>

                                <td className="px-4 py-3">
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{item.user_email || "—"}</span>
                                    {item.full_name && <span className="text-xs text-muted-foreground truncate">{item.full_name}</span>}
                                  </div>
                                </td>

                                <td className="px-4 py-3">
                                  <div className="flex flex-col">
                                    <span className="text-sm text-foreground/80">{item.type_label || "—"}</span>
                                    <span className="text-xs text-muted-foreground">{item.entry_method}</span>
                                    {item.excel_file_name && (
                                      <span className="text-[11px] text-muted-foreground/70 truncate max-w-[180px]" title={item.excel_file_name}>
                                        {item.excel_file_name}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="px-4 py-3">
                                  {item.result_count > 0 ? (
                                    <span className="text-sm font-medium text-emerald-400">{item.result_count}</span>
                                  ) : (
                                    <span className="text-sm text-muted-foreground/50">0</span>
                                  )}
                                </td>

                                <td className="px-4 py-3">
                                  <span className="text-sm text-foreground/80 whitespace-nowrap">
                                    {formatDateTime(item.updated_at ?? item.created_at)}
                                  </span>
                                </td>

                                <td className="px-4 py-3">
                                  <StatusBadge status={ds} item={item} onToggleError={() => setExpandedError(isExpanded ? null : item.search_id)} />
                                </td>

                                <td className="px-4 py-3">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                                        {exporting === item.search_id
                                          ? <Loader2 className="h-4 w-4 animate-spin" />
                                          : <MoreHorizontal className="h-4 w-4" />}
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48" style={{ background: "#0c1d1d", border: "1px solid rgba(255,255,255,0.1)" }}>
                                      {item.result_count > 0 && (
                                        <>
                                          <DropdownMenuItem
                                            onClick={() => handleExportExcel(item)}
                                            className="text-xs gap-2 cursor-pointer"
                                          >
                                            <Download className="h-3.5 w-3.5" />
                                            Export Excel
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => handleExportPDF(item)}
                                            className="text-xs gap-2 cursor-pointer"
                                          >
                                            <FileText className="h-3.5 w-3.5" />
                                            Download Report
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                      {(ds === "processing" || ds === "stuck") && (
                                        <DropdownMenuItem
                                          onClick={() => setStopTarget({ searchId: item.search_id, label: item.user_email || item.search_id.slice(0, 8) })}
                                          className="text-xs gap-2 cursor-pointer text-red-400 focus:text-red-400"
                                        >
                                          <Square className="h-3.5 w-3.5" />
                                          Stop Search
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </td>
                              </tr>
                              {/* Expanded error row */}
                              {isExpanded && item.error_message && (
                                <tr key={`${item.search_id}-err`} className="border-t border-border/10">
                                  <td colSpan={8} className="px-8 py-3">
                                    <div className="flex items-start gap-2 text-sm text-red-300 bg-red-400/5 rounded-lg px-4 py-3 border border-red-400/10">
                                      <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                                      <span className="whitespace-pre-wrap break-all">{item.error_message}</span>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/30 px-6 py-8 flex items-center justify-center gap-3 text-muted-foreground" style={{ background: "#0c1d1d" }}>
                    <Inbox className="h-5 w-5" />
                    <span className="text-sm">
                      {searches.length > 0 ? "No searches match current filters" : "No searches found"}
                    </span>
                  </div>
                )}
              </section>
            )}

          </div>
        </main>
      </div>

      {/* ── Stop dialog ───────────────────────────────────────────────────────── */}
      <Dialog open={!!stopTarget} onOpenChange={(open) => { if (!open && !stopping) { setStopTarget(null); setStopNote(""); } }}>
        <DialogContent className="max-w-md" style={{ background: "#0c1d1d", border: "1px solid rgba(255,255,255,0.07)" }}>
          <DialogHeader>
            <DialogTitle className="text-foreground text-base">Stop this search?</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
              This will mark the search for{" "}
              <span className="text-foreground font-medium">{stopTarget?.label}</span> as
              {" "}<span className="text-red-400">error</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Error note</label>
            <Textarea
              value={stopNote}
              onChange={(e) => setStopNote(e.target.value)}
              placeholder="Reason for stopping (visible to user in Results)..."
              className="min-h-[80px] text-sm bg-black/20 border-border/30 focus:border-primary/50 placeholder:text-muted-foreground/50 resize-none"
            />
          </div>
          <DialogFooter className="gap-2 mt-1">
            <Button variant="outline" size="sm" onClick={() => { setStopTarget(null); setStopNote(""); }} disabled={stopping} className="border-border/30">
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmStop} disabled={stopping}>
              {stopping ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Square className="h-3 w-3 mr-1.5" />}
              Stop Search
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md" style={{ background: "#0c1d1d", border: "1px solid rgba(255,255,255,0.07)" }}>
          <DialogHeader>
            <DialogTitle className="text-foreground text-base">Remove from queue?</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
              This will remove the queued request from{" "}
              <span className="text-foreground font-medium">{deleteTarget?.label}</span> and mark the search as cancelled.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-1">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting} className="border-border/30">
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const StatusBadge = ({ status, item, onToggleError }: {
  status: "processing" | "completed" | "error" | "stuck";
  item: SearchItem;
  onToggleError?: () => void;
}) => {
  const config = {
    processing: { bg: "bg-orange-400/10 text-orange-400 border-orange-400/20", icon: null, label: "Processing" },
    stuck: { bg: "bg-red-400/10 text-red-400 border-red-400/20", icon: <AlertTriangle className="h-3 w-3 mr-1" />, label: "Stuck" },
    completed: { bg: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20", icon: <CheckCircle2 className="h-3 w-3 mr-1" />, label: "Completed" },
    error: { bg: "bg-red-400/10 text-red-400 border-red-400/20", icon: <XCircle className="h-3 w-3 mr-1" />, label: item.status === "cancelled" ? "Cancelled" : "Error" },
  };
  const c = config[status];

  const badge = (
    <Badge className={cn("text-[10px] border whitespace-nowrap", c.bg, status === "error" && item.error_message && "cursor-pointer hover:brightness-125")}>
      {c.icon}
      {c.label}
    </Badge>
  );

  if (status === "error" && item.error_message && onToggleError) {
    return <button onClick={onToggleError}>{badge}</button>;
  }
  return badge;
};

export default DevTools;
