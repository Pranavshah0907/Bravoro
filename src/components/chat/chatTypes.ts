import type { ContactData, MessageMetadata } from "../ai-chat/types";

export type ChatType = "ai_staffing" | "recruiting";

export interface ChatConfig {
  webhookUrl: string;
  chatType: ChatType;
  placeholderText: string;
  emptyStateTitle: string;
  emptyStateExamples: string[];
  features: {
    contactSelection: boolean;
    enrichmentButton: boolean;
    syncToResults: boolean;
  };
}

export const AI_STAFFING_CONFIG: ChatConfig = {
  webhookUrl: "https://n8n.srv1081444.hstgr.cloud/webhook/chat_bot",
  chatType: "ai_staffing",
  placeholderText: "Ask about staffing, companies, or contacts\u2026",
  emptyStateTitle: "AI Staffing Assistant",
  emptyStateExamples: [
    "Find 10 robotics companies in Germany hiring Legal Counsel (last 7 days).",
    "Enrich 10 CTO contacts at SaaS startups in Berlin.",
    "Find 15 renewable energy companies in Italy hiring accountants (last 30 days).",
    "Enrich 25 VP Sales contacts at fintech companies in DACH.",
    "Find 5 AI companies in France hiring HR roles (last 14 days).",
    "Enrich 20 founders at cybersecurity startups in the UK; cap 5 companies.",
  ],
  features: {
    contactSelection: true,
    enrichmentButton: false,
    syncToResults: true,
  },
};

export const RECRUITING_CONFIG: ChatConfig = {
  webhookUrl: "https://n8n.srv1081444.hstgr.cloud/webhook/recruiting_chat",
  chatType: "recruiting",
  placeholderText: "Search for candidates by role, skills, location\u2026",
  emptyStateTitle: "Recruiting Search",
  emptyStateExamples: [
    "Find SAP experts in Cologne, 30km radius",
    "Senior Python developers in Berlin",
    "Product managers at fintech companies in Frankfurt",
    "20 React developers in Munich",
    "Java architects who worked at SAP, now in consulting",
    "DevOps engineers in DACH region, Kubernetes experience",
  ],
  features: {
    contactSelection: true,
    enrichmentButton: true,
    syncToResults: false,
  },
};

export type { ContactData, MessageMetadata };

export type ConversationMeta = {
  id: string;
  title: string;
  session_id: string;
  updated_at: string;
  chat_type: ChatType;
  synced_search_id?: string | null;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: MessageMetadata | null;
};

export type ChatHandle = {
  newChat: () => Promise<void>;
  renameConv: (id: string, newTitle: string) => Promise<void>;
  deleteConv: (id: string) => Promise<void>;
};
