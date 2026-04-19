import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search, RefreshCw, Clock, Loader2, Inbox, FileText,
  CheckCircle2, AlertTriangle, XCircle, ChevronUp, ChevronDown,
  MoreHorizontal,
} from "lucide-react";
import { differenceInHours, format } from "date-fns";
import { cn } from "@/lib/utils";
import { exportEnrichmentPdf } from "@/lib/exportPdf";

// ── Types ───────────────────────────────────────────────────────────────────

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
  created_at: string;
  updated_at?: string;
}

interface WorkspaceSearchesProps {
  userIds: string[];
}

type StatusFilter = "all" | "processing" | "completed" | "error";
type TimeFilter = "24h" | "7d" | "30d" | "all";
type SortDir = "desc" | "asc";

const TIME_FILTER_HOURS: Record<TimeFilter, number> = {
  "24h": 24,
  "7d": 168,
  "30d": 720,
  "all": Infinity,
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function getDisplayStatus(item: SearchItem): "processing" | "completed" | "error" | "stuck" {
  if (item.status === "error" || item.status === "cancelled") return "error";
  if (item.status === "completed") return "completed";
  if (item.result_count > 0) return "completed";
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

// ── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({
  status,
  item,
  onToggleError,
}: {
  status: "processing" | "completed" | "error" | "stuck";
  item: SearchItem;
  onToggleError?: () => void;
}) {
  const config = {
    processing: {
      className: "bg-orange-400/10 text-orange-400 border-orange-400/20",
      icon: null,
      label: "Processing",
    },
    stuck: {
      className: "bg-red-400/10 text-red-400 border-red-400/20",
      icon: <AlertTriangle className="h-3 w-3 mr-1" />,
      label: "Stuck",
    },
    completed: {
      className: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
      icon: <CheckCircle2 className="h-3 w-3 mr-1" />,
      label: "Completed",
    },
    error: {
      className: "bg-red-400/10 text-red-400 border-red-400/20",
      icon: <XCircle className="h-3 w-3 mr-1" />,
      label: item.status === "cancelled" ? "Cancelled" : "Error",
    },
  }[status];

  const clickable = (status === "error" || status === "stuck") && !!item.error_message;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[11px] px-2 py-0.5 font-medium border flex items-center w-fit select-none",
        config.className,
        clickable && "cursor-pointer hover:opacity-80"
      )}
      onClick={clickable ? onToggleError : undefined}
    >
      {config.icon}
      {config.label}
    </Badge>
  );
}

// ── WorkspaceSearches ────────────────────────────────────────────────────────

export function WorkspaceSearches({ userIds }: WorkspaceSearchesProps) {
  const [searches, setSearches] = useState<SearchItem[]>([]);
  const [fetching, setFetching] = useState(false);

  const [textFilter, setTextFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("30d");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchSearches = useCallback(async () => {
    if (userIds.length === 0) return;
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-dev-tools", {
        body: { action: "get_workspace_searches", userIds },
      });
      if (error) throw error;
      setSearches(data?.searches ?? []);
    } catch {
      // silently fail — parent page handles auth errors
    } finally {
      setFetching(false);
    }
  }, [userIds]);

  useEffect(() => {
    if (userIds.length > 0) {
      fetchSearches();
    } else {
      setSearches([]);
    }
  }, [userIds, fetchSearches]);

  // ── Filtering + sorting ──────────────────────────────────────────────────
  const filteredSearches = useMemo(() => {
    const maxHours = TIME_FILTER_HOURS[timeFilter];
    return searches
      .filter((s) => {
        // Text filter
        if (textFilter) {
          const q = textFilter.toLowerCase();
          const matchesEmail = s.user_email?.toLowerCase().includes(q);
          const matchesName = s.full_name?.toLowerCase().includes(q);
          if (!matchesEmail && !matchesName) return false;
        }
        // Time filter
        if (maxHours !== Infinity) {
          const age = differenceInHours(new Date(), new Date(s.updated_at ?? s.created_at));
          if (age > maxHours) return false;
        }
        // Status filter
        if (statusFilter === "all") return true;
        const ds = getDisplayStatus(s);
        if (statusFilter === "processing") return ds === "processing" || ds === "stuck";
        if (statusFilter === "completed") return ds === "completed";
        if (statusFilter === "error") return ds === "error" || ds === "stuck";
        return true;
      })
      .sort((a, b) => {
        const da = new Date(a.updated_at ?? a.created_at).getTime();
        const db = new Date(b.updated_at ?? b.created_at).getTime();
        return sortDir === "desc" ? db - da : da - db;
      });
  }, [searches, textFilter, statusFilter, timeFilter, sortDir]);

  // ── PDF export ───────────────────────────────────────────────────────────
  const handleExportPDF = async (item: SearchItem) => {
    setExporting(item.search_id);
    try {
      const { data: resultsData, error: resultsError } = await supabase
        .from("search_results")
        .select("*")
        .eq("search_id", item.search_id);
      if (resultsError) throw resultsError;

      const { data: searchRecord, error: searchError } = await supabase
        .from("searches")
        .select("id, company_name, excel_file_name")
        .eq("id", item.search_id)
        .single();
      if (searchError) throw searchError;

      const results = (resultsData || []).map((r) => ({
        ...r,
        contact_data: Array.isArray(r.contact_data) ? r.contact_data : [],
      }));

      await exportEnrichmentPdf(item.search_id, results, searchRecord);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(null);
    }
  };

  // ── Early return ─────────────────────────────────────────────────────────
  if (userIds.length === 0) return null;

  // ── Status chip config ───────────────────────────────────────────────────
  const STATUS_CHIPS: { key: StatusFilter; label: string; className: string; activeClassName: string }[] = [
    {
      key: "all",
      label: "All",
      className: "text-foreground/60 bg-white/5 border border-white/10",
      activeClassName: "text-foreground bg-white/10 border border-white/20",
    },
    {
      key: "processing",
      label: "Processing",
      className: "text-orange-400/60 bg-orange-400/5 border border-orange-400/10",
      activeClassName: "text-orange-400 bg-orange-400/15 border border-orange-400/20",
    },
    {
      key: "completed",
      label: "Completed",
      className: "text-emerald-400/60 bg-emerald-400/5 border border-emerald-400/10",
      activeClassName: "text-emerald-400 bg-emerald-400/15 border border-emerald-400/20",
    },
    {
      key: "error",
      label: "Errored",
      className: "text-red-400/60 bg-red-400/5 border border-red-400/10",
      activeClassName: "text-red-400 bg-red-400/15 border border-red-400/20",
    },
  ];

  const TIME_PILLS: { key: TimeFilter; label: string }[] = [
    { key: "24h", label: "24h" },
    { key: "7d", label: "7d" },
    { key: "30d", label: "30d" },
    { key: "all", label: "All time" },
  ];

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
          Searches{" "}
          <span className="text-foreground/40 font-normal normal-case tracking-normal">
            ({filteredSearches.length})
          </span>
        </span>

        <div className="flex items-center gap-2">
          {/* Text filter */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder="Filter by user..."
              className="h-7 w-40 pl-6 text-xs bg-transparent border-border/30 focus:border-primary/50 placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Sort toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            title={sortDir === "desc" ? "Newest first" : "Oldest first"}
          >
            {sortDir === "desc" ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </Button>

          {/* Refresh */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={fetchSearches}
            disabled={fetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", fetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Status chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.key}
            onClick={() => setStatusFilter(chip.key)}
            className={cn(
              "px-3 py-1.5 text-xs rounded-md font-medium transition-colors",
              statusFilter === chip.key ? chip.activeClassName : chip.className
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Time pills */}
      <div className="flex items-center gap-1 bg-black/20 rounded-md p-1 w-fit">
        {TIME_PILLS.map((pill) => (
          <button
            key={pill.key}
            onClick={() => setTimeFilter(pill.key)}
            className={cn(
              "px-2.5 py-1 text-xs rounded font-medium transition-colors",
              timeFilter === pill.key
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {fetching && searches.length === 0 ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredSearches.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 border border-dashed border-border/30 rounded-lg text-muted-foreground">
          <Inbox className="h-6 w-6 opacity-40" />
          <p className="text-xs">
            {searches.length === 0 ? "No searches yet" : "No searches match current filters"}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border/30 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/20 border-b border-border/30">
                <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground w-8">#</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">User</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">Type / Method</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground w-20">Results</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">Date / Time</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground w-28">Status</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground w-16">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSearches.map((item, idx) => {
                const ds = getDisplayStatus(item);
                const isErrorExpanded = expandedError === item.search_id;
                const canExport =
                  ds === "completed" && item.result_count > 0;

                return (
                  <>
                    <tr
                      key={item.search_id}
                      className="border-b border-border/20 hover:bg-muted/10 transition-colors"
                    >
                      <td className="px-3 py-2.5 text-muted-foreground/50">{idx + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-foreground/90 truncate max-w-[140px]">
                          {item.full_name || "—"}
                        </div>
                        <div className="text-muted-foreground/60 truncate max-w-[140px]">
                          {item.user_email}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-foreground/80">{item.type_label}</div>
                        <div className="text-muted-foreground/60 capitalize">
                          {item.entry_method?.replace(/_/g, " ")}
                          {item.excel_file_name && (
                            <span className="ml-1 text-muted-foreground/40 truncate">
                              · {item.excel_file_name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={cn(
                            "font-medium tabular-nums",
                            item.result_count > 0 ? "text-emerald-400" : "text-muted-foreground/50"
                          )}
                        >
                          {item.result_count}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-foreground/70 whitespace-nowrap">
                          {formatDateTime(item.created_at)}
                        </div>
                        {item.updated_at && item.updated_at !== item.created_at && (
                          <div className="flex items-center gap-1 text-muted-foreground/50 mt-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            <span className="whitespace-nowrap">
                              {formatDateTime(item.updated_at)}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge
                          status={ds}
                          item={item}
                          onToggleError={() =>
                            setExpandedError(isErrorExpanded ? null : item.search_id)
                          }
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {canExport && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                disabled={exporting === item.search_id}
                              >
                                {exporting === item.search_id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              style={{
                                background: "#0c1d1d",
                                border: "1px solid rgba(255,255,255,0.1)",
                              }}
                            >
                              <DropdownMenuItem
                                className="text-xs cursor-pointer gap-2"
                                onClick={() => handleExportPDF(item)}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                Download Report
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                    {isErrorExpanded && item.error_message && (
                      <tr key={`${item.search_id}-error`} className="bg-red-400/5 border-b border-border/20">
                        <td colSpan={7} className="px-4 py-2.5">
                          <p className="text-[11px] text-red-400/80 font-mono whitespace-pre-wrap break-all">
                            {item.error_message}
                          </p>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default WorkspaceSearches;
