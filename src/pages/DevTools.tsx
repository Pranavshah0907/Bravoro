import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Terminal, RefreshCw, Trash2, Clock, Loader2, Inbox } from "lucide-react";
import bravoroLogo from "@/assets/bravoro-logo.svg";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  manual_entry: "Single Search",
  bulk_upload: "Bulk Search",
  bulk_people_enrichment: "People Enrichment",
  // searches.search_type variants
  bulk: "Bulk Search",
  manual: "Single Search",
  people_enrichment: "People Enrichment",
};

interface ProcessingItem {
  search_id: string;
  locked_at: string;
  search_type: string;
  user_email: string;
  full_name: string;
}

interface QueuedItem {
  id: string;
  search_id: string;
  entry_type: string;
  created_at: string;
  user_email: string;
}

interface DeleteTarget {
  itemType: "processing" | "queued";
  queueItemId?: string;
  searchId: string;
  label: string;
}

const DevTools = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [processing, setProcessing] = useState<ProcessingItem | null>(null);
  const [queued, setQueued] = useState<QueuedItem[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const fetchQueue = useCallback(async () => {
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-dev-tools", {
        body: { action: "get_queue" },
      });
      if (error) throw error;
      setProcessing(data.processing ?? null);
      setQueued(data.queued ?? []);
      setLastRefreshed(new Date());
    } catch {
      toast({ title: "Failed to load queue", variant: "destructive" });
    } finally {
      setFetching(false);
    }
  }, [toast]);

  // Auto-refresh every 15s
  useEffect(() => {
    if (!isAdmin) return;
    const id = setInterval(fetchQueue, 15_000);
    return () => clearInterval(id);
  }, [isAdmin, fetchQueue]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-dev-tools", {
        body: {
          action: "delete_item",
          itemType: deleteTarget.itemType,
          queueItemId: deleteTarget.queueItemId,
          searchId: deleteTarget.searchId,
        },
      });
      if (error) throw error;

      const isProcessing = deleteTarget.itemType === "processing";
      toast({
        title: isProcessing ? "Job cancelled" : "Removed from queue",
        description: isProcessing
          ? data.next_dispatched
            ? "Flag released — next item dispatched to n8n."
            : "Flag released — queue is now free."
          : "Search marked as cancelled.",
      });

      setDeleteTarget(null);
      await fetchQueue();
    } catch (err) {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const totalItems = (processing ? 1 : 0) + queued.length;

  return (
    <div className="min-h-screen bg-background flex overflow-hidden">
      <AppSidebar isAdmin={isAdmin} onSignOut={handleSignOut} />

      <div className="flex-1 ml-16 flex flex-col h-screen overflow-hidden">

        {/* Header */}
        <header
          className="shrink-0 flex items-center justify-between px-8 py-5 border-b border-border/15"
          style={{ background: "#060f10" }}
        >
          <div className="flex items-center gap-3">
            <Terminal className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold text-foreground tracking-tight">Developer Tools</span>
            <img src={bravoroLogo} alt="Bravoro" className="ml-2 h-4 w-auto opacity-30" />
          </div>
          <div className="flex items-center gap-3">
            {lastRefreshed && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground/40">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(lastRefreshed, { addSuffix: true })}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={fetchQueue}
              disabled={fetching}
              className="h-8 text-xs border-border/30 hover:border-primary/40 hover:text-primary transition-colors"
            >
              <RefreshCw className={cn("h-3 w-3 mr-1.5", fetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto space-y-8">

            {/* Stats row */}
            <div className="flex items-stretch gap-3">
              {[
                { label: "Total", value: totalItems, color: "text-foreground", border: "border-border/20" },
                { label: "Processing", value: processing ? 1 : 0, color: "text-amber-400", border: "border-amber-500/20" },
                { label: "Queued", value: queued.length, color: "text-primary", border: "border-primary/20" },
              ].map(({ label, value, color, border }) => (
                <div
                  key={label}
                  className={cn("px-5 py-3 rounded-xl border flex items-center gap-4", border)}
                  style={{ background: "#0c1d1d" }}
                >
                  <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">{label}</span>
                  <span className={cn("text-2xl font-bold tabular-nums", color)}>{value}</span>
                </div>
              ))}
            </div>

            {/* ── Currently Processing ── */}
            <section>
              <h2 className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest mb-3">
                Currently Processing
              </h2>

              {processing ? (
                <div
                  className="rounded-xl border border-amber-500/20 overflow-hidden"
                  style={{ background: "#0c1d1d" }}
                >
                  <QueueTable>
                    <QueueRow
                      position={
                        <span className="relative flex h-2.5 w-2.5 ml-1">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
                        </span>
                      }
                      email={processing.user_email}
                      fullName={processing.full_name}
                      type={TYPE_LABELS[processing.search_type] ?? processing.search_type ?? "—"}
                      time={formatDistanceToNow(new Date(processing.locked_at), { addSuffix: true })}
                      badge={<Badge className="text-[10px] bg-amber-400/10 text-amber-400 border border-amber-400/20">Processing</Badge>}
                      onDelete={() => setDeleteTarget({
                        itemType: "processing",
                        searchId: processing.search_id,
                        label: processing.user_email || processing.search_id,
                      })}
                    />
                  </QueueTable>
                </div>
              ) : (
                <EmptyState label="Nothing currently processing" />
              )}
            </section>

            {/* ── Queue ── */}
            <section>
              <h2 className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest mb-3">
                Queue ({queued.length})
              </h2>

              {queued.length > 0 ? (
                <div
                  className="rounded-xl border border-border/20 overflow-hidden"
                  style={{ background: "#0c1d1d" }}
                >
                  <QueueTable>
                    {queued.map((item, idx) => (
                      <QueueRow
                        key={item.id}
                        position={
                          <span className="text-xs font-mono text-muted-foreground/35">#{idx + 1}</span>
                        }
                        email={item.user_email}
                        type={TYPE_LABELS[item.entry_type] ?? item.entry_type}
                        time={formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        badge={<Badge className="text-[10px] bg-primary/10 text-primary border border-primary/20">Queued</Badge>}
                        divider={idx > 0}
                        onDelete={() => setDeleteTarget({
                          itemType: "queued",
                          queueItemId: item.id,
                          searchId: item.search_id,
                          label: item.user_email || item.id,
                        })}
                      />
                    ))}
                  </QueueTable>
                </div>
              ) : (
                <EmptyState label="Queue is empty" />
              )}
            </section>

          </div>
        </main>
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent
          className="max-w-md"
          style={{ background: "#0c1d1d", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <DialogHeader>
            <DialogTitle className="text-foreground text-base">
              {deleteTarget?.itemType === "processing" ? "Cancel this job?" : "Remove from queue?"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground/70 text-sm leading-relaxed">
              {deleteTarget?.itemType === "processing" ? (
                <>
                  This will cancel the job for{" "}
                  <span className="text-foreground font-medium">{deleteTarget?.label}</span> and
                  release the processing flag. If there are queued items, the next one will be
                  dispatched to n8n automatically.
                </>
              ) : (
                <>
                  This will remove the queued request from{" "}
                  <span className="text-foreground font-medium">{deleteTarget?.label}</span> and
                  mark the search as cancelled.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="border-border/30"
            >
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleting}>
              {deleting
                ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
              {deleteTarget?.itemType === "processing" ? "Cancel Job & Release" : "Remove from Queue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const QueueTable = ({ children }: { children: React.ReactNode }) => (
  <table className="w-full">
    <thead>
      <tr className="border-b border-border/15">
        {["", "User", "Type", "Time", "Status", ""].map((h, i) => (
          <th
            key={i}
            className={cn(
              "text-left px-5 py-3 text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider",
              i === 0 && "w-10",
              i === 5 && "w-10"
            )}
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>{children}</tbody>
  </table>
);

interface QueueRowProps {
  position: React.ReactNode;
  email: string;
  fullName?: string;
  type: string;
  time: string;
  badge: React.ReactNode;
  divider?: boolean;
  onDelete: () => void;
}

const QueueRow = ({ position, email, fullName, type, time, badge, divider, onDelete }: QueueRowProps) => (
  <tr className={cn("hover:bg-white/[0.015] transition-colors", divider && "border-t border-border/10")}>
    <td className="px-5 py-4">{position}</td>
    <td className="px-5 py-4">
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-foreground truncate">{email || "—"}</span>
        {fullName && <span className="text-xs text-muted-foreground/40 mt-0.5">{fullName}</span>}
      </div>
    </td>
    <td className="px-5 py-4">
      <span className="text-sm text-muted-foreground">{type || "—"}</span>
    </td>
    <td className="px-5 py-4">
      <span className="text-sm text-muted-foreground/50">{time}</span>
    </td>
    <td className="px-5 py-4">{badge}</td>
    <td className="px-5 py-4">
      <button
        onClick={onDelete}
        className="p-1.5 rounded-md text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors"
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </td>
  </tr>
);

const EmptyState = ({ label }: { label: string }) => (
  <div
    className="rounded-xl border border-border/15 px-6 py-7 flex items-center gap-3 text-muted-foreground/30"
    style={{ background: "#0c1d1d" }}
  >
    <Inbox className="h-4 w-4 shrink-0" />
    <span className="text-sm">{label}</span>
  </div>
);

export default DevTools;