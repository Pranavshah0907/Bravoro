import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Terminal, RefreshCw, Trash2, Clock, Loader2, Inbox,
  Square, Copy, Check, Filter, CheckCircle2, AlertTriangle,
} from "lucide-react";
import bravoroLogo from "@/assets/bravoro-logo.svg";
import { formatDistanceToNow, differenceInHours } from "date-fns";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SearchItem {
  search_id: string;
  user_email: string;
  full_name: string;
  search_type: string;
  type_label: string;
  entry_method: string;
  excel_file_name?: string | null;
  result_count: number;
  created_at: string;
  updated_at?: string;
  locked_at?: string;
}

interface QueueItem extends SearchItem {
  id: string;
  entry_type: string;
}

interface StopTarget {
  searchId: string;
  label: string;
  section: "flag" | "in_progress";
}

interface DeleteTarget {
  queueItemId: string;
  searchId: string;
  label: string;
}

type TimeFilter = "24h" | "7d" | "30d" | "all";

const TIME_FILTER_HOURS: Record<TimeFilter, number> = {
  "24h": 24,
  "7d": 168,
  "30d": 720,
  "all": Infinity,
};

// Effective status from result_count + age
function getEffectiveStatus(item: SearchItem): "done_stale" | "stuck" | "processing" {
  if (item.result_count > 0) return "done_stale";
  const age = differenceInHours(new Date(), new Date(item.updated_at ?? item.created_at));
  return age > 24 ? "stuck" : "processing";
}

// ── Page ───────────────────────────────────────────────────────────────────────

const DevTools = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  const [flagItem, setFlagItem] = useState<SearchItem | null>(null);
  const [inProgress, setInProgress] = useState<SearchItem[]>([]);
  const [queued, setQueued] = useState<QueueItem[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [filter, setFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("7d");

  const [stopTarget, setStopTarget] = useState<StopTarget | null>(null);
  const [stopNote, setStopNote] = useState("");
  const [stopping, setStopping] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);

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
    fetchQueue();
  };

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-dev-tools", {
        body: { action: "get_queue" },
      });
      if (error) throw error;
      setFlagItem(data.flag_item ?? null);
      setInProgress(data.in_progress ?? []);
      setQueued(data.queued ?? []);
      setLastRefreshed(new Date());
    } catch {
      toast({ title: "Failed to load queue", variant: "destructive" });
    } finally {
      setFetching(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!isAdmin) return;
    const id = setInterval(fetchQueue, 15_000);
    return () => clearInterval(id);
  }, [isAdmin, fetchQueue]);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const matchesText = useCallback((item: { user_email: string; full_name?: string }) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return item.user_email?.toLowerCase().includes(q) || item.full_name?.toLowerCase().includes(q);
  }, [filter]);

  const matchesTime = useCallback((item: SearchItem) => {
    const maxHours = TIME_FILTER_HOURS[timeFilter];
    if (maxHours === Infinity) return true;
    const age = differenceInHours(new Date(), new Date(item.updated_at ?? item.created_at));
    return age <= maxHours;
  }, [timeFilter]);

  const filteredFlag = useMemo(() => flagItem && matchesText(flagItem) ? flagItem : null, [flagItem, matchesText]);
  const filteredInProgress = useMemo(
    () => inProgress.filter(i => matchesText(i) && matchesTime(i)),
    [inProgress, matchesText, matchesTime]
  );
  const filteredQueued = useMemo(() => queued.filter(matchesText), [queued, matchesText]);

  // Stats
  const stuckCount = useMemo(() => filteredInProgress.filter(i => getEffectiveStatus(i) === "stuck").length, [filteredInProgress]);
  const doneStaleCount = useMemo(() => filteredInProgress.filter(i => getEffectiveStatus(i) === "done_stale").length, [filteredInProgress]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleSignOut = async () => { await supabase.auth.signOut(); navigate("/"); };

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
      await fetchQueue();
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
      await fetchQueue();
    } catch (err) {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
    } finally {
      setDeleting(false);
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

  const totalAll = (flagItem ? 1 : 0) + filteredInProgress.length + filteredQueued.length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex overflow-hidden">
      <AppSidebar isAdmin={isAdmin} isDeveloper onSignOut={handleSignOut} />

      <div className="flex-1 ml-16 flex flex-col h-screen overflow-hidden">

        {/* Header */}
        <header className="shrink-0 flex items-center justify-between px-8 py-4 border-b border-border/30" style={{ background: "#060f10" }}>
          <div className="flex items-center gap-3">
            <Terminal className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold text-foreground tracking-tight">Developer Tools</span>
            <img src={bravoroLogo} alt="Bravoro" className="ml-2 h-4 w-auto opacity-30" />
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/70" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by name or email..."
                className="h-8 w-56 pl-8 text-xs bg-transparent border-border/30 focus:border-primary/50 placeholder:text-muted-foreground/60"
              />
            </div>
            {lastRefreshed && (
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(lastRefreshed, { addSuffix: true })}
              </span>
            )}
            <Button
              size="sm" variant="outline" onClick={fetchQueue} disabled={fetching}
              className="h-8 text-xs border-border/30 hover:border-primary/40 hover:text-primary transition-colors"
            >
              <RefreshCw className={cn("h-3 w-3 mr-1.5", fetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-[1100px] mx-auto space-y-8">

            {/* Stats */}
            <div className="flex items-stretch gap-3 flex-wrap">
              {[
                { label: "Visible", value: totalAll, color: "text-foreground", border: "border-border/20" },
                { label: "Flag Locked", value: flagItem ? 1 : 0, color: "text-amber-400", border: "border-amber-500/20" },
                { label: "Stuck", value: stuckCount, color: "text-red-400", border: "border-red-500/20" },
                { label: "Done (stale)", value: doneStaleCount, color: "text-emerald-400", border: "border-emerald-500/20" },
                { label: "Queued", value: filteredQueued.length, color: "text-primary", border: "border-primary/20" },
              ].map(({ label, value, color, border }) => (
                <div key={label} className={cn("px-4 py-2.5 rounded-xl border flex items-center gap-3", border)} style={{ background: "#0c1d1d" }}>
                  <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">{label}</span>
                  <span className={cn("text-xl font-bold tabular-nums", color)}>{value}</span>
                </div>
              ))}
            </div>

            {/* ── Processing Flag ──────────────────────────────────────────── */}
            <Section title="Processing Flag" count={filteredFlag ? 1 : 0}>
              {filteredFlag ? (
                <DataTable>
                  <SearchRow
                    item={filteredFlag}
                    time={filteredFlag.locked_at ? formatDistanceToNow(new Date(filteredFlag.locked_at), { addSuffix: true }) : "—"}
                    statusBadge={<StatusBadge status="processing" label="Flag Locked" />}
                    indicator={<PulsingDot color="bg-amber-400" />}
                    copiedId={copiedId}
                    onCopy={copyId}
                    onStop={() => setStopTarget({
                      searchId: filteredFlag.search_id,
                      label: filteredFlag.user_email || filteredFlag.search_id.slice(0, 8),
                      section: "flag",
                    })}
                  />
                </DataTable>
              ) : (
                <EmptyState label={flagItem && !filteredFlag ? "Filtered out" : "No flag locked"} />
              )}
            </Section>

            {/* ── In Progress ──────────────────────────────────────────────── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">
                    In Progress ({filteredInProgress.length}{inProgress.length !== filteredInProgress.length ? ` of ${inProgress.length}` : ""})
                  </h2>
                  <span className="text-[10px] text-muted-foreground/60">Sent to n8n — awaiting callback</span>
                </div>

                {/* Time filter */}
                <div className="flex items-center gap-1 bg-black/20 rounded-lg p-0.5">
                  {(["24h", "7d", "30d", "all"] as TimeFilter[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setTimeFilter(t)}
                      className={cn(
                        "px-3 py-1 rounded-md text-[11px] font-medium transition-colors",
                        timeFilter === t
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground/70 hover:text-muted-foreground/70"
                      )}
                    >
                      {t === "all" ? "All" : t}
                    </button>
                  ))}
                </div>
              </div>

              {filteredInProgress.length > 0 ? (
                <DataTable>
                  {filteredInProgress.map((item, idx) => {
                    const eff = getEffectiveStatus(item);
                    return (
                      <SearchRow
                        key={item.search_id}
                        item={item}
                        time={item.updated_at ? formatDistanceToNow(new Date(item.updated_at), { addSuffix: true }) : "—"}
                        statusBadge={
                          eff === "done_stale"
                            ? <StatusBadge status="done_stale" label={`Done (${item.result_count} results)`} />
                            : eff === "stuck"
                            ? <StatusBadge status="stuck" label="Stuck" />
                            : <StatusBadge status="processing" label="Processing" />
                        }
                        indicator={<span className="text-xs font-mono text-muted-foreground/60">#{idx + 1}</span>}
                        copiedId={copiedId}
                        onCopy={copyId}
                        divider={idx > 0}
                        onStop={() => setStopTarget({
                          searchId: item.search_id,
                          label: item.user_email || item.search_id.slice(0, 8),
                          section: "in_progress",
                        })}
                      />
                    );
                  })}
                </DataTable>
              ) : (
                <EmptyState label={
                  inProgress.length > 0 ? `All ${inProgress.length} items hidden by filters` : "No in-progress searches"
                } />
              )}
            </section>

            {/* ── Queue ────────────────────────────────────────────────────── */}
            <Section title="Queue" count={filteredQueued.length}>
              {filteredQueued.length > 0 ? (
                <DataTable>
                  {filteredQueued.map((item, idx) => (
                    <SearchRow
                      key={item.id}
                      item={item}
                      time={formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      statusBadge={<StatusBadge status="queued" label="Queued" />}
                      indicator={<span className="text-xs font-mono text-muted-foreground/60">#{idx + 1}</span>}
                      copiedId={copiedId}
                      onCopy={copyId}
                      divider={idx > 0}
                      onDelete={() => setDeleteTarget({
                        queueItemId: item.id,
                        searchId: item.search_id,
                        label: item.user_email || item.search_id.slice(0, 8),
                      })}
                    />
                  ))}
                </DataTable>
              ) : (
                <EmptyState label={queued.length > 0 ? "All filtered out" : "Queue is empty"} />
              )}
            </Section>

          </div>
        </main>
      </div>

      {/* ── Stop dialog ───────────────────────────────────────────────────────── */}
      <Dialog open={!!stopTarget} onOpenChange={(open) => { if (!open && !stopping) { setStopTarget(null); setStopNote(""); } }}>
        <DialogContent className="max-w-md" style={{ background: "#0c1d1d", border: "1px solid rgba(255,255,255,0.07)" }}>
          <DialogHeader>
            <DialogTitle className="text-foreground text-base">Stop this search?</DialogTitle>
            <DialogDescription className="text-muted-foreground/70 text-sm leading-relaxed">
              This will mark the search for{" "}
              <span className="text-foreground font-medium">{stopTarget?.label}</span> as
              {" "}<span className="text-red-400">error</span>.
              {stopTarget?.section === "flag" && " The processing flag will be released and the next queued item dispatched."}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <label className="text-xs font-medium text-muted-foreground/60 mb-1.5 block">Error note</label>
            <Textarea
              value={stopNote}
              onChange={(e) => setStopNote(e.target.value)}
              placeholder="Reason for stopping (visible to user in Results)..."
              className="min-h-[80px] text-sm bg-black/20 border-border/30 focus:border-primary/50 placeholder:text-muted-foreground/60 resize-none"
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
            <DialogDescription className="text-muted-foreground/70 text-sm leading-relaxed">
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

const Section = ({ title, count, children }: { title: string; count: number; children: React.ReactNode }) => (
  <section>
    <h2 className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest mb-3">
      {title} ({count})
    </h2>
    {children}
  </section>
);

const HEADERS = ["", "Search ID", "User", "Type / Method", "Results", "Time", "Status", ""];

const DataTable = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl border border-border/20 overflow-hidden" style={{ background: "#0c1d1d" }}>
    <table className="w-full">
      <thead>
        <tr className="border-b border-border/30">
          {HEADERS.map((h, i) => (
            <th
              key={i}
              className={cn(
                "text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider",
                (i === 0 || i === 7) && "w-10",
                i === 4 && "w-20"
              )}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

const StatusBadge = ({ status, label }: { status: "processing" | "stuck" | "done_stale" | "queued"; label: string }) => {
  const styles = {
    processing: "bg-orange-400/10 text-orange-400 border-orange-400/20",
    stuck: "bg-red-400/10 text-red-400 border-red-400/20",
    done_stale: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
    queued: "bg-primary/10 text-primary border-primary/20",
  };
  const icons = {
    processing: null,
    stuck: <AlertTriangle className="h-3 w-3 mr-1" />,
    done_stale: <CheckCircle2 className="h-3 w-3 mr-1" />,
    queued: null,
  };
  return (
    <Badge className={cn("text-[10px] border whitespace-nowrap", styles[status])}>
      {icons[status]}
      {label}
    </Badge>
  );
};

interface SearchRowProps {
  item: SearchItem | QueueItem;
  time: string;
  statusBadge: React.ReactNode;
  indicator: React.ReactNode;
  copiedId: string | null;
  onCopy: (id: string) => void;
  divider?: boolean;
  onStop?: () => void;
  onDelete?: () => void;
}

const SearchRow = ({ item, time, statusBadge, indicator, copiedId, onCopy, divider, onStop, onDelete }: SearchRowProps) => (
  <tr className={cn("hover:bg-white/[0.015] transition-colors", divider && "border-t border-border/10")}>
    <td className="px-4 py-3">{indicator}</td>

    <td className="px-4 py-3">
      <button
        onClick={() => onCopy(item.search_id)}
        className="group flex items-center gap-1.5 text-xs font-mono text-muted-foreground/80 hover:text-primary transition-colors"
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
        {item.full_name && <span className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{item.full_name}</span>}
      </div>
    </td>

    <td className="px-4 py-3">
      <div className="flex flex-col">
        <span className="text-sm text-muted-foreground">{item.type_label || "—"}</span>
        <span className="text-[11px] text-muted-foreground/70 mt-0.5">{item.entry_method}</span>
        {item.excel_file_name && (
          <span className="text-[10px] text-muted-foreground/60 mt-0.5 truncate max-w-[180px]" title={item.excel_file_name}>
            {item.excel_file_name}
          </span>
        )}
      </div>
    </td>

    <td className="px-4 py-3">
      {item.result_count > 0 ? (
        <span className="text-sm font-medium text-emerald-400">{item.result_count}</span>
      ) : (
        <span className="text-sm text-muted-foreground/60">0</span>
      )}
    </td>

    <td className="px-4 py-3">
      <span className="text-sm text-muted-foreground/70 whitespace-nowrap">{time}</span>
    </td>

    <td className="px-4 py-3">{statusBadge}</td>

    <td className="px-4 py-3">
      {onStop && (
        <button
          onClick={onStop}
          className="p-1.5 rounded-md text-muted-foreground/60 hover:text-red-400 hover:bg-red-400/10 transition-colors"
          title="Stop with note"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Remove from queue"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </td>
  </tr>
);

const PulsingDot = ({ color }: { color: string }) => (
  <span className="relative flex h-2.5 w-2.5 ml-1">
    <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-60", color)} />
    <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", color)} />
  </span>
);

const EmptyState = ({ label }: { label: string }) => (
  <div className="rounded-xl border border-border/30 px-6 py-6 flex items-center gap-3 text-muted-foreground/60" style={{ background: "#0c1d1d" }}>
    <Inbox className="h-4 w-4 shrink-0" />
    <span className="text-sm">{label}</span>
  </div>
);

export default DevTools;
