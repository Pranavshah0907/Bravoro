import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Paperclip, ImageIcon, Trash2 } from "lucide-react";
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
    "Hi there! If you have any questions, feedback, or need help with any feature, please describe it here in as much detail as possible. You can also attach screenshots to help us understand the issue better — just paste (Ctrl+V), drag & drop, or use the attachment button. We'll get back to you as soon as possible.\n\n— Team Bravoro",
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
  const { toast } = useToast();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("id", user.id)
        .single();
      if (data) {
        setUserName(`${data.first_name || ""} ${data.last_name || ""}`.trim());
        setUserEmail(data.email || user.email || "");
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) setHasPulse(false);
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

      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          type: "support",
          userName: userName || "Unknown User",
          userEmail: userEmail || "unknown",
          message: trimmed,
          attachments: attachmentPayloads,
        },
      });

      if (error) throw error;

      const thankYou: ChatMessage = {
        id: crypto.randomUUID(),
        role: "system",
        content:
          "Thank you for reaching out! Our team has received your message and will get back to you as soon as possible. We appreciate your patience.",
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
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        aria-label={isOpen ? "Close support chat" : "Open support chat"}
        className="fixed bottom-6 right-6 z-[9999] flex items-center justify-center rounded-full shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        style={{
          width: 56,
          height: 56,
          background: "linear-gradient(135deg, #009da5, #00686d)",
          boxShadow: "0 4px 20px rgba(0, 157, 165, 0.4)",
        }}
      >
        {isOpen ? (
          <X className="h-6 w-6 text-white" />
        ) : (
          <MessageCircle className="h-6 w-6 text-white" />
        )}
        {hasPulse && !isOpen && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{
              background: "rgba(0, 157, 165, 0.3)",
              animationDuration: "2s",
              animationIterationCount: "3",
            }}
          />
        )}
      </button>

      {/* Chat window */}
      {isOpen && (
        <div
          className="fixed bottom-20 right-6 z-[9998] flex flex-col overflow-hidden rounded-2xl border border-white/10"
          style={{
            width: 380,
            maxWidth: "calc(100vw - 32px)",
            height: 540,
            maxHeight: "calc(100vh - 120px)",
            background: "#0a1414",
            boxShadow:
              "0 12px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(88, 221, 221, 0.08)",
            animation: "supportChatSlideUp 0.25s ease-out",
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-5 py-4 shrink-0"
            style={{
              background: "linear-gradient(135deg, #0d222e, #00686d)",
              borderBottom: "1px solid rgba(88, 221, 221, 0.15)",
            }}
          >
            <div
              className="flex items-center justify-center rounded-full shrink-0"
              style={{
                width: 36,
                height: 36,
                background: "rgba(255, 255, 255, 0.15)",
              }}
            >
              <MessageCircle className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white leading-tight">
                Bravoro Support
              </p>
              <p className="text-xs text-emerald-300/70 leading-tight mt-0.5">
                We typically reply within a few hours
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Close chat"
            >
              <X className="h-5 w-5 text-white/70" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={chatBodyRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#1a3535 transparent" }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
                  style={
                    msg.role === "user"
                      ? {
                          background: "linear-gradient(135deg, #009da5, #007a80)",
                          color: "#fff",
                          borderBottomRightRadius: 6,
                        }
                      : {
                          background: "#122020",
                          color: "#d1e8e8",
                          border: "1px solid rgba(88, 221, 221, 0.1)",
                          borderBottomLeftRadius: 6,
                        }
                  }
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {msg.attachments.map((src, i) => (
                        <img
                          key={i}
                          src={src}
                          alt={`Attachment ${i + 1}`}
                          className="rounded-lg object-cover border border-white/10"
                          style={{ width: 80, height: 80 }}
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
              className="px-4 py-2 flex gap-2 overflow-x-auto shrink-0"
              style={{
                borderTop: "1px solid rgba(88, 221, 221, 0.1)",
                background: "#0e1a1a",
                scrollbarWidth: "none",
              }}
            >
              {attachments.map((att) => (
                <div key={att.id} className="relative group shrink-0">
                  <img
                    src={att.preview}
                    alt="Attachment preview"
                    className="rounded-lg object-cover border border-white/10"
                    style={{ width: 56, height: 56 }}
                  />
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full bg-red-500/90 hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ width: 18, height: 18 }}
                  >
                    <Trash2 className="h-2.5 w-2.5 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input area */}
          <div
            className="shrink-0 px-3 py-3 flex items-end gap-2"
            style={{
              borderTop: "1px solid rgba(88, 221, 221, 0.1)",
              background: "#0c1616",
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
              className="p-2 rounded-xl hover:bg-white/5 transition-colors shrink-0"
              aria-label="Attach image"
              title="Attach image"
            >
              <Paperclip className="h-5 w-5 text-emerald-400/60 hover:text-emerald-400" />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Type your message..."
              disabled={isSending}
              rows={1}
              className="flex-1 resize-none rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-emerald-400/40 disabled:opacity-50"
              style={{
                background: "#162222",
                border: "1px solid rgba(88, 221, 221, 0.1)",
                maxHeight: 100,
                minHeight: 40,
                scrollbarWidth: "thin",
                scrollbarColor: "#1a3535 transparent",
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "40px";
                el.style.height = Math.min(el.scrollHeight, 100) + "px";
              }}
            />
            <button
              onClick={handleSend}
              disabled={isSending || (!input.trim() && attachments.length === 0)}
              className="p-2.5 rounded-xl transition-all duration-150 shrink-0 disabled:opacity-30"
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
                  className="h-5 w-5 rounded-full border-2 border-emerald-400/40 border-t-emerald-400 animate-spin"
                />
              ) : (
                <Send className="h-5 w-5 text-white" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Keyframe animation */}
      <style>{`
        @keyframes supportChatSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
