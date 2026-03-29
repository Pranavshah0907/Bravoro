import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, FileText, Send, Loader2, Trash2, Pencil,
  Download, Check, Clock, AlertCircle, Plus, RefreshCw,
} from "lucide-react";
import type { GridRow } from "./SpreadsheetGrid";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DraftItem {
  id: string;
  name: string;
  row_count: number;
  updated_at: string;
}

interface SentItem {
  id: string;
  excel_file_name: string;
  status: string;
  created_at: string;
  grid_data: GridRow[] | null;
}

interface SheetsManagerProps {
  userId: string;
  currentDraftId: string | null;
  onBack: () => void;
  onLoad: (rows: GridRow[], meta: { draftId?: string; name: string }) => void;
  onDraftDeleted: (id: string) => void;
  onNewSheet: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: diffDays > 365 ? "numeric" : undefined });
}

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  processing: { label: "Processing", color: "#b07000", bg: "rgba(180,120,0,0.10)", icon: <Clock className="h-3 w-3" /> },
  complete:   { label: "Complete",   color: "#007035", bg: "rgba(0,130,60,0.10)",  icon: <Check className="h-3 w-3" /> },
  failed:     { label: "Failed",     color: "#a02020", bg: "rgba(180,30,30,0.10)", icon: <AlertCircle className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { label: status, color: "#5a8888", bg: "rgba(0,157,165,0.08)", icon: null };
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ color: s.color, background: s.bg }}
    >
      {s.icon}
      {s.label}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export const SheetsManager = ({
  userId, currentDraftId, onBack, onLoad, onDraftDeleted, onNewSheet,
}: SheetsManagerProps) => {
  const { toast } = useToast();

  const [drafts, setDrafts]         = useState<DraftItem[]>([]);
  const [sent, setSent]             = useState<SentItem[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [loadingSent, setLoadingSent]     = useState(true);

  // Which item is currently being loaded (spinner)
  const [loadingId, setLoadingId]   = useState<string | null>(null);

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal,  setRenameVal]  = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchDrafts = async () => {
    setLoadingDrafts(true);
    const { data } = await supabase
      .from("bulk_search_drafts")
      .select("id, name, row_count, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    setDrafts((data ?? []) as DraftItem[]);
    setLoadingDrafts(false);
  };

  const fetchSent = async () => {
    setLoadingSent(true);
    const { data } = await supabase
      .from("searches")
      .select("id, excel_file_name, status, created_at, grid_data")
      .eq("user_id", userId)
      .eq("search_type", "bulk")
      .not("grid_data", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);
    setSent((data ?? []) as unknown as SentItem[]);
    setLoadingSent(false);
  };

  useEffect(() => {
    fetchDrafts();
    fetchSent();
  }, [userId]);

  // ── Draft actions ──────────────────────────────────────────────────────────

  const handleLoadDraft = async (d: DraftItem) => {
    setLoadingId(d.id);
    try {
      const { data, error } = await supabase
        .from("bulk_search_drafts")
        .select("grid_data")
        .eq("id", d.id)
        .single();
      if (error || !data?.grid_data) throw new Error("Could not load draft data");
      onLoad(data.grid_data as GridRow[], { draftId: d.id, name: d.name });
    } catch {
      toast({ title: "Load failed", description: "Could not load this draft. Please try again.", variant: "destructive" });
      setLoadingId(null);
    }
  };

  const handleDeleteDraft = async (d: DraftItem) => {
    if (!window.confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("bulk_search_drafts").delete().eq("id", d.id);
    if (error) {
      toast({ title: "Delete failed", description: "Could not delete draft.", variant: "destructive" });
      return;
    }
    setDrafts(prev => prev.filter(x => x.id !== d.id));
    onDraftDeleted(d.id);
    toast({ title: "Draft deleted", description: `"${d.name}" was removed.` });
  };

  const startRename = (d: DraftItem) => {
    setRenamingId(d.id);
    setRenameVal(d.name);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const commitRename = async (d: DraftItem) => {
    const name = renameVal.trim() || d.name;
    setRenamingId(null);
    if (name === d.name) return;
    const { error } = await supabase
      .from("bulk_search_drafts")
      .update({ name })
      .eq("id", d.id);
    if (error) {
      toast({ title: "Rename failed", variant: "destructive" });
      return;
    }
    setDrafts(prev => prev.map(x => x.id === d.id ? { ...x, name } : x));
  };

  const cancelRename = () => { setRenamingId(null); };

  // ── Sent actions ───────────────────────────────────────────────────────────

  const handleLoadSent = (s: SentItem) => {
    if (!s.grid_data?.length) return;
    const name = s.excel_file_name || "Sent Search";
    onLoad(s.grid_data, { name });
  };

  const handleDeleteSent = async (s: SentItem) => {
    const label = s.excel_file_name || "this search";
    if (!window.confirm(`Remove "${label}" from history? This won't affect results.`)) return;
    const { error } = await supabase.from("searches").delete().eq("id", s.id);
    if (error) {
      toast({ title: "Delete failed", description: "Could not remove this record.", variant: "destructive" });
      return;
    }
    setSent(prev => prev.filter(x => x.id !== s.id));
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const DraftRow = ({ d }: { d: DraftItem }) => {
    const isLoading  = loadingId === d.id;
    const isCurrent  = currentDraftId === d.id;
    const isRenaming = renamingId === d.id;

    return (
      <div
        className="flex items-center gap-3 px-4 py-3 border-b transition-colors group"
        style={{
          borderColor: "#edf6f6",
          background: isCurrent ? "rgba(0,157,165,0.04)" : undefined,
        }}
      >
        {/* Icon */}
        <div
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: isCurrent ? "rgba(0,157,165,0.12)" : "#f4fcfc", border: "1px solid #daeaea" }}
        >
          <FileText className="h-4 w-4" style={{ color: isCurrent ? "#009da5" : "#5a9898" }} />
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter")  commitRename(d);
                if (e.key === "Escape") cancelRename();
              }}
              onBlur={() => commitRename(d)}
              className="w-full text-[13px] font-semibold bg-transparent outline-none border-b"
              style={{ color: "#0c2e2e", borderColor: "#009da5", maxWidth: 260 }}
            />
          ) : (
            <button
              onClick={() => startRename(d)}
              className="flex items-center gap-1.5 max-w-full group/name"
              title="Click to rename"
            >
              <span className="text-[13px] font-semibold truncate" style={{ color: "#0c2e2e" }}>
                {d.name}
              </span>
              {isCurrent && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ background: "rgba(0,157,165,0.12)", color: "#007980" }}>
                  Active
                </span>
              )}
              <Pencil className="h-3 w-3 shrink-0 opacity-0 group-hover/name:opacity-50 transition-opacity" style={{ color: "#007980" }} />
            </button>
          )}
          <p className="text-[11px] mt-0.5" style={{ color: "#9abcbc" }}>
            {d.row_count} {d.row_count === 1 ? "row" : "rows"} · {formatDate(d.updated_at)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => handleLoadDraft(d)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
            style={{ background: "#009da5", color: "#fff", opacity: isLoading ? 0.7 : 1 }}
          >
            {isLoading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</>
              : <><Download className="h-3.5 w-3.5" />Load</>
            }
          </button>
          <button
            onClick={() => handleDeleteDraft(d)}
            className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
            style={{ color: "#c0cccc" }}
            title="Delete draft"
          >
            <Trash2 className="h-3.5 w-3.5 hover:text-red-500" />
          </button>
        </div>
      </div>
    );
  };

  const SentRow = ({ s }: { s: SentItem }) => {
    const canLoad = !!s.grid_data?.length;
    const label   = s.excel_file_name || "Bulk Search";
    const rowCount = s.grid_data?.length ?? null;

    return (
      <div
        className="flex items-center gap-3 px-4 py-3 border-b transition-colors"
        style={{ borderColor: "#edf6f6" }}
      >
        {/* Icon */}
        <div
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "#f4fcfc", border: "1px solid #daeaea" }}
        >
          <Send className="h-3.5 w-3.5" style={{ color: "#5a9898" }} />
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold truncate" style={{ color: "#0c2e2e" }}>{label}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {rowCount !== null && (
              <span className="text-[11px]" style={{ color: "#9abcbc" }}>
                {rowCount} {rowCount === 1 ? "row" : "rows"}
              </span>
            )}
            <span className="text-[11px]" style={{ color: "#b8cccc" }}>·</span>
            <span className="text-[11px]" style={{ color: "#9abcbc" }}>{formatDate(s.created_at)}</span>
            <StatusBadge status={s.status} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {canLoad ? (
            <button
              onClick={() => handleLoadSent(s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
              style={{ background: "#edf6f6", color: "#007980", border: "1px solid #c8e2e2" }}
            >
              <Download className="h-3.5 w-3.5" />Load
            </button>
          ) : (
            <span className="text-[11px] px-2" style={{ color: "#b8cccc" }} title="Grid data not stored for this search">
              —
            </span>
          )}
          <button
            onClick={() => handleDeleteSent(s)}
            className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
            style={{ color: "#c0cccc" }}
            title="Remove from history"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #c8e2e2", boxShadow: "0 4px 24px rgba(0,157,165,0.08)" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: "#edf6f6", borderBottom: "1px solid #c8e2e2" }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:bg-[#d8f0f0]"
          style={{ color: "#007980" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Worksheet
        </button>

        <div className="w-px h-4 bg-[#c8e2e2]" />

        <h2 className="text-[18px] font-extrabold tracking-tight" style={{ color: "#0c2e2e" }}>
          My Sheets
        </h2>

        <div className="flex-1" />

        <button
          onClick={() => { fetchDrafts(); fetchSent(); }}
          className="p-1.5 rounded-lg transition-colors hover:bg-[#d8f0f0]"
          title="Refresh"
          style={{ color: "#007980" }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── DRAFTS section ────────────────────────────────────────────────── */}
      <div>
        <div
          className="flex items-center gap-3 px-4 py-2.5"
          style={{ background: "#fafefe", borderBottom: "1px solid #edf6f6" }}
        >
          <FileText className="h-4 w-4 shrink-0" style={{ color: "#009da5" }} />
          <span className="text-[15px] font-bold tracking-tight" style={{ color: "#0c2e2e" }}>
            Drafts
          </span>
          {!loadingDrafts && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,157,165,0.10)", color: "#007980" }}>
              {drafts.length}
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={onNewSheet}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors hover:bg-[#e0f4f4]"
            style={{ color: "#007980", border: "1px solid #c8e2e2" }}
          >
            <Plus className="h-3 w-3" />
            New Sheet
          </button>
        </div>

        {loadingDrafts ? (
          <div className="flex items-center justify-center gap-2 py-8" style={{ color: "#9abcbc" }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-[12px]">Loading drafts…</span>
          </div>
        ) : drafts.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#f4fcfc", border: "1px solid #daeaea" }}>
              <FileText className="h-5 w-5" style={{ color: "#b0cccc" }} />
            </div>
            <p className="text-[12px]" style={{ color: "#9abcbc" }}>No drafts saved yet</p>
            <p className="text-[11px]" style={{ color: "#b8cccc" }}>Use "Save Draft" in the worksheet to save your work</p>
          </div>
        ) : (
          <div>
            {drafts.map(d => <DraftRow key={d.id} d={d} />)}
          </div>
        )}
      </div>

      {/* ── SENT section ──────────────────────────────────────────────────── */}
      <div style={{ borderTop: "2px solid #edf6f6" }}>
        <div
          className="flex items-center gap-3 px-4 py-2.5"
          style={{ background: "#fafefe", borderBottom: "1px solid #edf6f6" }}
        >
          <Send className="h-4 w-4 shrink-0" style={{ color: "#009da5" }} />
          <span className="text-[15px] font-bold tracking-tight" style={{ color: "#0c2e2e" }}>
            Sent
          </span>
          {!loadingSent && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,157,165,0.10)", color: "#007980" }}>
              {sent.length}
            </span>
          )}
        </div>

        {loadingSent ? (
          <div className="flex items-center justify-center gap-2 py-8" style={{ color: "#9abcbc" }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-[12px]">Loading sent searches…</span>
          </div>
        ) : sent.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#f4fcfc", border: "1px solid #daeaea" }}>
              <Send className="h-5 w-5" style={{ color: "#b0cccc" }} />
            </div>
            <p className="text-[12px]" style={{ color: "#9abcbc" }}>No searches sent yet</p>
            <p className="text-[11px]" style={{ color: "#b8cccc" }}>Submitted bulk searches will appear here</p>
          </div>
        ) : (
          <div>
            {sent.map(s => <SentRow key={s.id} s={s} />)}
          </div>
        )}
      </div>

    </div>
  );
};
