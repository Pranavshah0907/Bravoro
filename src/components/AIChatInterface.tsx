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
} from "lucide-react";
import bravoroIcon from "@/assets/Logo_icon_final.png";
import bravoroLogo from "@/assets/bravoro-logo.svg";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export type ConversationMeta = {
  id: string;
  title: string;
  session_id: string;
  updated_at: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
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
  externalActiveId?: string;
  onConvsChange?: (convs: ConversationMeta[], activeId: string) => void;
}

export const AIChatInterface = forwardRef<AIChatHandle, AIChatInterfaceProps>(
  ({ userId, externalActiveId, onConvsChange }, ref) => {
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

    const loadConversations = async () => {
      setLoadingConvs(true);
      const { data } = await supabase
        .from("ai_chat_conversations")
        .select("id, title, session_id, updated_at")
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
        .select("id, role, content")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      setMessages((prev) => ({ ...prev, [convId]: (data as Message[]) ?? [] }));
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
        .select("id, title, session_id, updated_at")
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

      let replyContent =
        "The AI assistant is currently unavailable. Please try again later.";
      try {
        const res = await fetch(
          "https://n8n.srv1081444.hstgr.cloud/webhook/chat_bot",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: content,
              session_id: conv.session_id,
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
        console.log("[AIChatInterface] n8n raw response:", raw);
        if (!raw?.trim()) throw new Error("Empty response");
        const data = JSON.parse(raw);
        console.log("[AIChatInterface] n8n parsed data:", data);
        if (
          (data.code !== undefined && typeof data.code === "number" && data.code >= 400) ||
          (data.error !== undefined && data.error !== null && data.error !== false && data.error !== "")
        ) {
          console.error("[AIChatInterface] n8n service error:", data.error ?? data.code);
          throw new Error("Service error");
        }
        const reply =
          data.response ??
          data.action?.message ??
          data.message ??
          data.output ??
          data.text ??
          (Array.isArray(data) &&
            (data[0]?.response ??
              data[0]?.action?.message ??
              data[0]?.message)) ??
          (typeof data === "string" ? data : null);
        if (reply) replyContent = String(reply);
      } catch (err) {
        console.error("[AIChatInterface] n8n fetch failed:", err);
        // replyContent stays as offline message
      }

      // Extract chatname if present and rename conversation
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
        })
        .select("id, role, content")
        .single();

      setMessages((prev) => ({
        ...prev,
        [activeId]: [
          ...(prev[activeId] ?? []),
          (savedAssistantMsg as Message) ?? {
            id: crypto.randomUUID(),
            role: "assistant",
            content: replyContent,
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
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/30 shrink-0 bg-card/30 backdrop-blur-sm">
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
          <img src={bravoroLogo} alt="Bravoro" className="h-5 w-auto shrink-0 self-center opacity-80" />
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
                activeMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-3 animate-fade-in",
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
                        "max-w-[78%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm shadow-md shadow-primary/20"
                          : "bg-muted/60 text-foreground rounded-2xl rounded-tl-sm border border-border/40"
                      )}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
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
              <div className="max-w-4xl mx-auto px-5">
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
