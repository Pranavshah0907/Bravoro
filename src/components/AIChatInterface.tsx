import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Send,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
  UserCheck,
  ArrowUpFromLine,
  Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import bravoroIcon from "@/assets/Logo_icon_final.png";
import bravoroLogo from "@/assets/bravoro-logo.svg";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { parseN8nResponse } from "./ai-chat/parseMessage";
import { RichMessageContent, CreditsLine, contactKey } from "./ai-chat/RichMessageContent";
import { FormattedText } from "./ai-chat/FormattedText";
import { syncChatToResults, hasSyncableData } from "./ai-chat/syncToResults";
import type { MessageMetadata, ContactData } from "./ai-chat/types";

export type ConversationMeta = {
  id: string;
  title: string;
  session_id: string;
  updated_at: string;
  synced_search_id?: string | null;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: MessageMetadata | null;
};

export type AIChatHandle = {
  newChat: () => Promise<void>;
  renameConv: (id: string, newTitle: string) => Promise<void>;
  deleteConv: (id: string) => Promise<void>;
};

const EXAMPLES = [
  "Example: Find 10 robotics companies in Germany hiring Legal Counsel (last 7 days).",
  "Example: Enrich 10 CTO contacts at SaaS startups in Berlin.",
  "Example: Find 15 renewable energy companies in Italy hiring accountants (last 30 days).",
  "Example: Enrich 25 VP Sales contacts at fintech companies in DACH.",
  "Example: Find 5 AI companies in France hiring HR roles (last 14 days).",
  "Example: Enrich 20 founders at cybersecurity startups in the UK; cap 5 companies.",
];

interface AIChatInterfaceProps {
  userId: string;
  isAdmin?: boolean;
  externalActiveId?: string;
  onConvsChange?: (convs: ConversationMeta[], activeId: string) => void;
}

export const AIChatInterface = forwardRef<AIChatHandle, AIChatInterfaceProps>(
  ({ userId, isAdmin, externalActiveId, onConvsChange }, ref) => {
    const [conversations, setConversations] = useState<ConversationMeta[]>([]);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [activeId, setActiveId] = useState<string>("");
    const [input, setInput] = useState("");
    const [loadingConvs, setLoadingConvs] = useState(true);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [sending, setSending] = useState(false);
    const [exampleIdx, setExampleIdx] = useState(() =>
      Math.floor(Math.random() * EXAMPLES.length)
    );
    // Selected contacts for sending with next message: key → ContactData
    const [selectedContacts, setSelectedContacts] = useState<Map<string, ContactData>>(new Map());
    const [syncing, setSyncing] = useState(false);

    const { toast } = useToast();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const isCreatingRef = useRef(false);
    const onConvsChangeRef = useRef(onConvsChange);

    useEffect(() => {
      onConvsChangeRef.current = onConvsChange;
    });

    useEffect(() => {
      if (userId) loadConversations();
    }, [userId]);

    useEffect(() => {
      if (activeId && !messages[activeId]) {
        loadMessages(activeId);
      }
    }, [activeId]);

    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages[activeId], sending]);

    // Sync external active id from parent (sidebar selection)
    useEffect(() => {
      if (externalActiveId && externalActiveId !== activeId) {
        setActiveId(externalActiveId);
        clearSelectedContacts();
      }
    }, [externalActiveId]);

    // Notify parent when conversations or activeId change
    useEffect(() => {
      if (!loadingConvs) {
        onConvsChangeRef.current?.(conversations, activeId);
      }
    }, [conversations, activeId, loadingConvs]);

    useImperativeHandle(ref, () => ({
      newChat,
      renameConv: handleRenameConv,
      deleteConv: handleDeleteConv,
    }));

    // Derived: set of selected contact keys for quick lookup
    const selectedContactKeys = new Set(selectedContacts.keys());

    const handleToggleContact = (contact: ContactData, key: string) => {
      setSelectedContacts((prev) => {
        const next = new Map(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.set(key, contact);
        }
        return next;
      });
    };

    const clearSelectedContacts = () => setSelectedContacts(new Map());

    const handleSyncToResults = async () => {
      if (syncing || !activeId) return;
      const conv = conversations.find((c) => c.id === activeId);
      if (!conv) return;

      setSyncing(true);
      try {
        const msgs = messages[activeId] ?? [];
        const { companiesCount, contactsCount } = await syncChatToResults(
          userId,
          activeId,
          conv.title,
          msgs,
          conv.synced_search_id ?? null
        );
        // Reload conversation to get updated synced_search_id
        const { data: updated } = await supabase
          .from("ai_chat_conversations")
          .select("id, title, session_id, updated_at, synced_search_id")
          .eq("id", activeId)
          .single();
        if (updated) {
          setConversations((prev) =>
            prev.map((c) => (c.id === activeId ? (updated as ConversationMeta) : c))
          );
        }
        toast({
          title: "Synced to Results",
          description: `${contactsCount} contacts and ${companiesCount} companies synced. View them on the Results page.`,
        });
      } catch (err) {
        console.error("[AIChatInterface] sync failed:", err);
        toast({
          title: "Sync failed",
          description: err instanceof Error ? err.message : "Something went wrong",
          variant: "destructive",
        });
      } finally {
        setSyncing(false);
      }
    };

    const loadConversations = async () => {
      setLoadingConvs(true);
      const { data } = await supabase
        .from("ai_chat_conversations")
        .select("id, title, session_id, updated_at, synced_search_id")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      const convs: ConversationMeta[] = data ?? [];
      setConversations(convs);

      if (convs.length > 0) {
        setActiveId(convs[0].id);
      } else if (!isCreatingRef.current) {
        isCreatingRef.current = true;
        await createConversation(convs, 1);
        isCreatingRef.current = false;
      }
      setLoadingConvs(false);
    };

    const loadMessages = async (convId: string) => {
      setLoadingMsgs(true);
      const { data } = await supabase
        .from("ai_chat_messages")
        .select("id, role, content, metadata")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      setMessages((prev) => ({
        ...prev,
        [convId]: (data as Message[]) ?? [],
      }));
      setLoadingMsgs(false);
    };

    const createConversation = async (
      currentConvs: ConversationMeta[],
      n?: number
    ) => {
      let chatNum = n;
      if (chatNum === undefined) {
        const nums = currentConvs
          .map((c) => { const m = c.title.match(/^Chat (\d+)$/); return m ? parseInt(m[1]) : 0; })
          .filter((x) => x > 0);
        chatNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
      }
      const title = `Chat ${chatNum}`;
      const { data: conv, error } = await supabase
        .from("ai_chat_conversations")
        .insert({ user_id: userId, title })
        .select("id, title, session_id, updated_at, synced_search_id")
        .single();

      if (error || !conv) return;

      const newConv = conv as ConversationMeta;
      setConversations((prev) => [newConv, ...prev]);
      setMessages((prev) => ({ ...prev, [newConv.id]: [] }));
      setActiveId(newConv.id);
      // Pick a fresh random example for this new chat
      setExampleIdx(Math.floor(Math.random() * EXAMPLES.length));
    };

    const newChat = async () => {
      const activeMessages = messages[activeId] ?? [];
      const hasUserMessage = activeMessages.some((m) => m.role === "user");
      if (!hasUserMessage) {
        inputRef.current?.focus();
        return;
      }
      await createConversation(conversations);
      setInput("");
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
        inputRef.current.focus();
      }
    };

    const handleRenameConv = async (id: string, newTitle: string) => {
      const trimmed = newTitle.trim();
      if (!trimmed) return;
      const { error } = await supabase
        .from("ai_chat_conversations")
        .update({ title: trimmed })
        .eq("id", id);

      if (!error) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c))
        );
      }
    };

    const handleDeleteConv = async (id: string) => {
      const { error } = await supabase
        .from("ai_chat_conversations")
        .delete()
        .eq("id", id);

      if (error) return;

      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      setMessages((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      if (id === activeId) {
        if (remaining.length > 0) {
          setActiveId(remaining[0].id);
        } else {
          isCreatingRef.current = true;
          await createConversation([], 1);
          isCreatingRef.current = false;
        }
      }
    };

    const sendMessage = async () => {
      if (!input.trim() || sending || !activeId) return;
      const content = input.trim();
      setInput("");
      setSending(true);
      if (inputRef.current) inputRef.current.style.height = "auto";

      const conv = conversations.find((c) => c.id === activeId);
      if (!conv) {
        setSending(false);
        return;
      }

      const tempId = crypto.randomUUID();
      setMessages((prev) => ({
        ...prev,
        [activeId]: [
          ...(prev[activeId] ?? []),
          { id: tempId, role: "user", content },
        ],
      }));

      const { data: savedUserMsg } = await supabase
        .from("ai_chat_messages")
        .insert({ conversation_id: activeId, role: "user", content })
        .select("id, role, content")
        .single();

      if (savedUserMsg) {
        setMessages((prev) => ({
          ...prev,
          [activeId]: (prev[activeId] ?? []).map((m) =>
            m.id === tempId ? (savedUserMsg as Message) : m
          ),
        }));
      }

      // Capture and clear selected contacts BEFORE the async call
      const contactsToSend = selectedContacts.size > 0
        ? Array.from(selectedContacts.values())
        : undefined;
      if (contactsToSend) clearSelectedContacts();

      let replyContent =
        "The AI assistant is currently unavailable. Please try again later.";
      let replyMetadata: MessageMetadata | null = null;

      try {
        const res = await fetch(
          "https://n8n.srv1081444.hstgr.cloud/webhook/chat_bot",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: content,
              session_id: conv.session_id,
              ...(contactsToSend ? { selected_contacts: contactsToSend } : {}),
              user_id: userId,
            }),
          }
        );

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          console.error("[AIChatInterface] n8n HTTP error:", res.status, res.statusText, errBody);
          throw new Error("Service unavailable");
        }
        const raw = await res.text();
        if (!raw?.trim()) throw new Error("Empty response");
        const data = JSON.parse(raw);
        if (
          (data.code !== undefined && typeof data.code === "number" && data.code >= 400) ||
          (data.error !== undefined && data.error !== null && data.error !== false && data.error !== "")
        ) {
          console.error("[AIChatInterface] n8n service error:", data.error ?? data.code);
          throw new Error("Service error");
        }
        const item = Array.isArray(data) ? data[0] : data;

        // Parse structured data, credits, chatName from the response
        const parsed = parseN8nResponse(item);
        replyContent = parsed.cleanText || replyContent;

        // Build metadata if we have meaningful structured data or non-zero credits
        const hasRealData = parsed.structuredData &&
          ((parsed.structuredData.companies?.length ?? 0) > 0 ||
           (parsed.structuredData.contacts?.length ?? 0) > 0);
        const hasRealCredits = parsed.credits && (parsed.credits.total ?? 0) > 0;

        if (hasRealData || hasRealCredits) {
          replyMetadata = {};
          if (hasRealData) replyMetadata.data = parsed.structuredData!;
          if (hasRealCredits) replyMetadata.credits = parsed.credits!;
        }

        // Track credits in analytics (fire-and-forget — don't block chat)
        if (hasRealCredits) {
          supabase
            .from("credit_usage")
            .insert({
              user_id: userId,
              cognism_credits: parsed.credits!.cognism ?? 0,
              apollo_credits: parsed.credits!.apollo ?? 0,
              aleads_credits: parsed.credits!.aleads ?? 0,
              lusha_credits: parsed.credits!.lusha ?? 0,
              theirstack_credits: parsed.credits!.theirstack ?? 0,
              grand_total_credits: parsed.credits!.total ?? 0,
            })
            .then(({ error }) => {
              if (error) console.error("[AIChatInterface] credit_usage insert failed:", error);
            });
        }

        // Auto-rename conversation from chatName
        if (parsed.chatName) {
          await handleRenameConv(activeId, parsed.chatName);
        }
      } catch (err) {
        console.error("[AIChatInterface] n8n fetch failed:", err);
        // replyContent stays as offline message
      }

      // Legacy chatname: prefix handling (in case some responses still use it)
      if (replyContent.toLowerCase().startsWith("chatname:")) {
        const lines = replyContent.split("\n");
        const chatName = lines[0].replace(/^chatname:\s*/i, "").trim();
        replyContent = lines.slice(1).join("\n").trimStart();
        if (chatName) {
          await handleRenameConv(activeId, chatName);
        }
      }

      const { data: savedAssistantMsg } = await supabase
        .from("ai_chat_messages")
        .insert({
          conversation_id: activeId,
          role: "assistant",
          content: replyContent,
          ...(replyMetadata ? { metadata: replyMetadata as unknown as Record<string, unknown> } : {}),
        })
        .select("id, role, content, metadata")
        .single();

      setMessages((prev) => ({
        ...prev,
        [activeId]: [
          ...(prev[activeId] ?? []),
          (savedAssistantMsg as Message) ?? {
            id: crypto.randomUUID(),
            role: "assistant",
            content: replyContent,
            metadata: replyMetadata,
          },
        ],
      }));

      setConversations((prev) => {
        const now = new Date().toISOString();
        return prev
          .map((c) => (c.id === activeId ? { ...c, updated_at: now } : c))
          .sort(
            (a, b) =>
              new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          );
      });

      setSending(false);
      // Restore focus so user can type immediately without clicking
      setTimeout(() => inputRef.current?.focus(), 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      e.target.style.height = "auto";
      e.target.style.height = e.target.scrollHeight + "px";
    };

    const activeMessages = (messages[activeId] ?? []).filter(
      (m) =>
        !(
          m.role === "assistant" &&
          m.content.startsWith("Hello! I'm your AI staffing assistant.")
        )
    );
    const hasUserMessage = activeMessages.some((m) => m.role === "user");
    const activeConv = conversations.find((c) => c.id === activeId);

    if (loadingConvs) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading chats...
          </div>
        </div>
      );
    }

    return (
      <div className="dark flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 md:gap-3 px-3 md:px-5 py-3 md:py-4 border-b border-border/30 shrink-0 bg-card/30 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <img src={bravoroIcon} alt="Bravoro" className="h-9 w-9 object-contain shrink-0 self-center" />
            <div>
              <h2 className="font-semibold text-foreground text-sm leading-tight">
                {activeConv?.title ?? "AI Staffing"}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-muted-foreground">
                  AI Staffing Assistant · Online
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasSyncableData(activeMessages) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncToResults}
                disabled={syncing}
                className={cn(
                  "h-8 gap-1.5 text-xs font-medium border-border/50",
                  activeConv?.synced_search_id
                    ? "text-primary border-primary/30 hover:bg-primary/10"
                    : "hover:bg-muted/50"
                )}
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : activeConv?.synced_search_id ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                )}
                <span className="hidden md:inline">{syncing ? "Syncing..." : activeConv?.synced_search_id ? "Synced" : "Sync to Results"}</span>
              </Button>
            )}
            <img src={bravoroLogo} alt="Bravoro" className="h-5 w-auto shrink-0 self-center opacity-80" />
          </div>
        </div>

        {/* Content */}
        {hasUserMessage ? (
          /* ── Full chat view ── */
          <>
            <div className="flex-1 overflow-y-auto py-5">
              <div className="max-w-4xl mx-auto px-5 space-y-4">
              {loadingMsgs ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                activeMessages.map((msg) => {
                  const msgMeta = msg.metadata as MessageMetadata | null | undefined;
                  const hasRichContent = msg.role === "assistant" && msgMeta?.data &&
                    ((msgMeta.data.companies?.length ?? 0) > 0 || (msgMeta.data.contacts?.length ?? 0) > 0);

                  return (
                    <div key={msg.id} className="animate-fade-in">
                      <div
                        className={cn(
                          "flex gap-3",
                          msg.role === "user" ? "justify-end" : "justify-start"
                        )}
                      >
                        {msg.role === "assistant" && (
                          <div className="shrink-0 w-7 h-7 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center mt-0.5 overflow-hidden">
                            <img
                              src={bravoroIcon}
                              alt="Bravoro"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div
                          className={cn(
                            "px-4 py-3 text-sm leading-relaxed",
                            msg.role === "user"
                              ? "max-w-[78%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm shadow-md shadow-primary/20 whitespace-pre-wrap"
                              : "max-w-[90%] bg-muted/60 text-foreground rounded-2xl rounded-tl-sm border border-border/40"
                          )}
                        >
                          {msg.role === "user" ? (
                            msg.content
                          ) : hasRichContent ? (
                            <RichMessageContent
                              content={msg.content}
                              metadata={msgMeta}
                              selectedContactKeys={selectedContactKeys}
                              onToggleContact={handleToggleContact}
                            />
                          ) : (
                            <FormattedText text={msg.content} />
                          )}
                        </div>
                      </div>
                      {/* Credits line — admin only, assistant messages only */}
                      {isAdmin && msg.role === "assistant" && msgMeta?.credits && (
                        <CreditsLine credits={msgMeta.credits} />
                      )}
                    </div>
                  );
                })
              )}

              {sending && (
                <div className="flex gap-3 justify-start animate-fade-in">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center mt-0.5 overflow-hidden">
                    <img
                      src={bravoroIcon}
                      alt="Bravoro"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="bg-muted/60 border border-border/40 rounded-2xl rounded-tl-sm px-4 py-3.5">
                    <div className="flex gap-1.5 items-center h-4">
                      {[0, 160, 320].map((delay) => (
                        <span
                          key={delay}
                          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/70 animate-bounce"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Bottom input */}
            <div className="shrink-0 py-4 border-t border-border/30 bg-card/30 backdrop-blur-sm">
              <div className="max-w-4xl mx-auto px-3 md:px-5">
              {/* Selected contacts badge */}
              {selectedContacts.size > 0 && (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
                    <UserCheck className="h-3 w-3" />
                    <span>{selectedContacts.size} contact{selectedContacts.size > 1 ? "s" : ""} selected</span>
                    <button
                      type="button"
                      onClick={clearSelectedContacts}
                      className="ml-1 p-0.5 rounded hover:bg-primary/20 transition-colors"
                      title="Clear selection"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="text-[11px] text-muted-foreground/50">
                    Will be sent with your next message
                  </span>
                </div>
              )}
              <div className="flex gap-3 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  disabled={sending || loadingMsgs}
                  placeholder="Type your message… (Enter to send, Shift+Enter for new line)"
                  rows={1}
                  className={cn(
                    "flex-1 resize-none rounded-xl px-4 py-3",
                    "text-sm text-foreground placeholder:text-muted-foreground",
                    "bg-muted/30 border border-border/50",
                    "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                    "duration-200 min-h-[44px] overflow-hidden",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                />
                <Button
                  onClick={sendMessage}
                  disabled={sending || !input.trim() || loadingMsgs}
                  className="shrink-0 h-11 w-11 p-0 rounded-xl bg-gradient-to-br from-primary to-caretta hover:opacity-90 shadow-md shadow-primary/20 disabled:opacity-40"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/40 mt-2 text-center">
                Enter to send · Shift+Enter for new line
              </p>
              </div>
            </div>
          </>
        ) : (
          /* ── Centered bolt-style empty state ── */
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 animate-fade-in">
            {/* Title */}
            <h1
              className="text-3xl md:text-4xl font-bold text-center mb-3 tracking-tight"
              style={{
                background:
                  "linear-gradient(135deg, hsl(var(--foreground)) 0%, hsl(var(--foreground)) 45%, hsl(var(--accent)) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              How can I help you today?
            </h1>
            <p className="text-sm text-muted-foreground/80 mb-10 text-center max-w-lg leading-relaxed">
              Describe the hiring activity you want to target, and I'll find the companies and specified decision makers.
            </p>

            {/* Input card — floating elevated surface */}
            <div className="w-full max-w-2xl">
              <div
                className="relative bg-card border border-border rounded-2xl overflow-hidden"
                style={{
                  boxShadow: "0 0 0 1px hsl(var(--primary) / 0.12), 0 12px 48px hsl(202 55% 4% / 0.8), 0 2px 12px hsl(202 55% 4% / 0.5)",
                }}
              >
                {/* Top accent line */}
                <div className="h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

                {/* Textarea with send button floating inside */}
                <div className="relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                    placeholder={EXAMPLES[exampleIdx]}
                    rows={3}
                    className={cn(
                      "w-full resize-none px-5 pt-5 pb-16 bg-transparent",
                      "text-sm text-foreground placeholder:text-muted-foreground/45",
                      "focus:outline-none overflow-hidden",
                      "min-h-[130px]",
                      "disabled:opacity-50"
                    )}
                  />
                  {/* Floating send button */}
                  <div className="absolute bottom-4 right-4">
                    <Button
                      onClick={sendMessage}
                      disabled={sending || !input.trim()}
                      className="h-9 w-9 p-0 rounded-xl bg-gradient-to-br from-primary to-caretta hover:opacity-90 shadow-lg shadow-primary/25 disabled:opacity-30 duration-150"
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground/30 mt-3 text-center tracking-wide">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }
);

AIChatInterface.displayName = "AIChatInterface";
