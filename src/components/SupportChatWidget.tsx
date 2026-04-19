import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Paperclip, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  id: string;
  role: "user" | "system";
  content: string;
  attachments?: string[];
}

interface AttachedImage {
  id: string;
  file: File;
  preview: string;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "system",
  content:
    "Hello! Whether you have a question, feedback, or need assistance with a feature, we're here to help. Please describe what you need in detail and feel free to attach any relevant screenshots.\n\nWe'll get back to you shortly.\n\n— Team Bravoro",
};

export function SupportChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<AttachedImage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [hasPulse, setHasPulse] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchProfile = async (userId: string) => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("id", userId)
        .single();
      if (data) {
        setUserName(`${data.first_name || ""} ${data.last_name || ""}`.trim());
        setUserEmail(data.email || "");
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setUserName("");
        setUserEmail("");
      }
      setMessages([WELCOME_MESSAGE]);
      setInput("");
      setAttachments([]);
      setIsOpen(false);
    });

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) fetchProfile(user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) setHasPulse(false);
  }, [isOpen]);

  // Click outside to minimize
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (!widgetRef.current) return;
      const target = e.target as Node;
      if (!widgetRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const addAttachments = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    const newAttachments: AttachedImage[] = imageFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        addAttachments(imageFiles);
      }
    },
    [addAttachments]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.files) {
        addAttachments(e.dataTransfer.files);
      }
    },
    [addAttachments]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed && attachments.length === 0) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      attachments: attachments.map((a) => a.preview),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsSending(true);

    try {
      const attachmentPayloads = await Promise.all(
        attachments.map(async (a) => ({
          filename: a.file.name || `screenshot-${Date.now()}.png`,
          content: await fileToBase64(a.file),
          type: a.file.type,
        }))
      );

      attachments.forEach((a) => URL.revokeObjectURL(a.preview));
      setAttachments([]);

      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          type: "support",
          userName: userName || "Unknown User",
          userEmail: userEmail || "unknown",
          message: trimmed,
          attachments: attachmentPayloads,
        },
      });

      const errorMsg = data?.error || (error?.message !== "Edge Function returned a non-2xx status code" ? error?.message : null);
      if (error || !data?.success) throw new Error(errorMsg || "Failed to send message");

      const thankYou: ChatMessage = {
        id: crypto.randomUUID(),
        role: "system",
        content:
          "Thank you for reaching out! Our team has received your message and will get back to you shortly.",
      };
      setMessages((prev) => [...prev, thankYou]);
    } catch (err) {
      console.error("Support email error:", err);
      toast({
        title: "Couldn't send message",
        description: "Please try again or email us directly at support@bravoro.com",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div ref={widgetRef}>
      {/* Floating bubble */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        aria-label={isOpen ? "Close support chat" : "Open support chat"}
        className="fixed bottom-5 right-5 z-[9999] flex items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        style={{
          width: 52,
          height: 52,
          background: "linear-gradient(135deg, #009da5, #00686d)",
          boxShadow: "0 4px 20px rgba(0, 157, 165, 0.35), 0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        <div
          className="transition-transform duration-200"
          style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          {isOpen ? (
            <X className="h-[22px] w-[22px] text-white" />
          ) : (
            <MessageCircle className="h-[22px] w-[22px] text-white" />
          )}
        </div>
        {hasPulse && !isOpen && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{
              background: "rgba(0, 157, 165, 0.25)",
              animationDuration: "2s",
              animationIterationCount: "3",
            }}
          />
        )}
      </button>

      {/* Chat window */}
      {isOpen && (
        <div
          className="fixed z-[9998] flex flex-col overflow-hidden"
          style={{
            bottom: 72,
            right: 20,
            width: 360,
            maxWidth: "calc(100vw - 32px)",
            height: 500,
            maxHeight: "calc(100vh - 100px)",
            borderRadius: 16,
            background: "#080f0f",
            border: "1px solid rgba(88, 221, 221, 0.08)",
            boxShadow:
              "0 16px 56px rgba(0, 0, 0, 0.55), 0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(88, 221, 221, 0.05)",
            animation: "supportChatSlideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 shrink-0"
            style={{
              background: "linear-gradient(135deg, #0b1e28 0%, #0e3a3d 100%)",
              borderBottom: "1px solid rgba(88, 221, 221, 0.08)",
            }}
          >
            <div
              className="flex items-center justify-center rounded-full shrink-0"
              style={{
                width: 32,
                height: 32,
                background: "rgba(0, 157, 165, 0.15)",
                border: "1px solid rgba(0, 157, 165, 0.2)",
              }}
            >
              <MessageCircle className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="font-semibold text-white leading-tight"
                style={{ fontSize: 13 }}
              >
                Bravoro Support
              </p>
              <p
                className="leading-tight mt-0.5"
                style={{ fontSize: 10.5, color: "rgba(94, 234, 212, 0.5)" }}
              >
                We typically reply within a few hours
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              aria-label="Close chat"
            >
              <X className="h-4 w-4 text-white/40 hover:text-white/70" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={chatBodyRef}
            className="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-2.5"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "#1a3535 transparent",
              background: "#080f0f",
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[82%]"
                  style={
                    msg.role === "user"
                      ? {
                          background: "linear-gradient(135deg, #007a80, #006266)",
                          color: "#e0f5f5",
                          padding: "10px 14px",
                          borderRadius: "14px 14px 4px 14px",
                          fontSize: 12.5,
                          lineHeight: 1.55,
                        }
                      : {
                          background: "#0e1818",
                          color: "#a8c8c8",
                          padding: "10px 14px",
                          borderRadius: "14px 14px 14px 4px",
                          border: "1px solid rgba(88, 221, 221, 0.06)",
                          fontSize: 12.5,
                          lineHeight: 1.55,
                        }
                  }
                >
                  <p className="whitespace-pre-wrap break-words m-0">{msg.content}</p>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {msg.attachments.map((src, i) => (
                        <img
                          key={i}
                          src={src}
                          alt={`Attachment ${i + 1}`}
                          className="rounded-md object-cover"
                          style={{
                            width: 64,
                            height: 64,
                            border: "1px solid rgba(88, 221, 221, 0.1)",
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div
              className="px-3.5 py-2 flex gap-2 overflow-x-auto shrink-0"
              style={{
                borderTop: "1px solid rgba(88, 221, 221, 0.06)",
                background: "#0a1212",
                scrollbarWidth: "none",
              }}
            >
              {attachments.map((att) => (
                <div key={att.id} className="relative group shrink-0">
                  <img
                    src={att.preview}
                    alt="Attachment preview"
                    className="rounded-md object-cover"
                    style={{
                      width: 48,
                      height: 48,
                      border: "1px solid rgba(88, 221, 221, 0.1)",
                    }}
                  />
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-red-500/80 hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ width: 16, height: 16 }}
                  >
                    <Trash2 className="h-2 w-2 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input area */}
          <div
            className="shrink-0 px-3 py-2.5 flex items-end gap-1.5"
            style={{
              borderTop: "1px solid rgba(88, 221, 221, 0.06)",
              background: "#0a1212",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addAttachments(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors shrink-0"
              aria-label="Attach image"
              title="Attach screenshot"
            >
              <Paperclip className="h-4 w-4 text-emerald-400/40 hover:text-emerald-400/70" />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Describe your issue..."
              disabled={isSending}
              rows={1}
              className="flex-1 resize-none rounded-lg px-3 py-2 text-white placeholder:text-white/25 focus:outline-none disabled:opacity-50"
              style={{
                background: "#121e1e",
                border: "1px solid rgba(88, 221, 221, 0.06)",
                fontSize: 12.5,
                maxHeight: 88,
                minHeight: 36,
                scrollbarWidth: "thin",
                scrollbarColor: "#1a3535 transparent",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(0, 157, 165, 0.3)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(88, 221, 221, 0.06)"; }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "36px";
                el.style.height = Math.min(el.scrollHeight, 88) + "px";
              }}
            />
            <button
              onClick={handleSend}
              disabled={isSending || (!input.trim() && attachments.length === 0)}
              className="p-2 rounded-lg transition-all duration-150 shrink-0 disabled:opacity-20"
              style={{
                background:
                  !isSending && (input.trim() || attachments.length > 0)
                    ? "linear-gradient(135deg, #009da5, #00686d)"
                    : "transparent",
              }}
              aria-label="Send message"
            >
              {isSending ? (
                <div
                  className="h-4 w-4 rounded-full border-2 border-emerald-400/40 border-t-emerald-400 animate-spin"
                />
              ) : (
                <Send className="h-4 w-4 text-white" />
              )}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes supportChatSlideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
