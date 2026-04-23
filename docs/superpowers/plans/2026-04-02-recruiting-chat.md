# Recruiting Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a conversational recruiting search tool — users find candidates via Brave Search, select who to enrich, and get verified contact data — all within a chat interface that shares infrastructure with AI Staffing.

**Architecture:** New n8n workflow (Recruiting Chat) with Brave Search + Enrich People tools. Shared ChatInterface component extracted from AIChatInterface.tsx, parameterized by config. Recruiting gets its own Dashboard card, sidebar entry, and conversation list filtered by `chat_type` column.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui, Supabase (Postgres + Edge Functions), n8n (MCP tools), Brave Search API

**Design Spec:** `docs/superpowers/specs/2026-04-02-recruiting-chat-design.md`

---

## File Structure

### New files
| File | Responsibility |
|---|---|
| `src/components/chat/ChatInterface.tsx` | Shared chat engine — messages, input, send, conversations, contact selection |
| `src/components/chat/chatTypes.ts` | ChatConfig type, shared interfaces, re-exports from ai-chat/types |
| `src/components/chat/RecruitingChatWrapper.tsx` | Thin wrapper — recruiting config + recruiting-specific UI (enrich button) |
| `src/components/chat/AIChatWrapper.tsx` | Thin wrapper — AI Staffing config (preserves existing behavior exactly) |
| `supabase/migrations/20260402150000_chat_type_column.sql` | Add `chat_type` column to `ai_chat_conversations` |

### Modified files
| File | Changes |
|---|---|
| `src/pages/Dashboard.tsx` | Add recruiting_chat to EnrichmentType, add 5th card, render RecruitingChatWrapper, lift recruiting conv state |
| `src/components/AppSidebar.tsx` | Add "Recruiting" tool entry, show chats section for recruiting too, accept recruiting conv props |
| `src/components/ai-chat/types.ts` | Add `skills`, `experienceSummary`, `headline`, `source` fields to ContactData |
| `src/components/ai-chat/RichMessageContent.tsx` | Add CandidateCard component, handle `data.type === "candidates"` and `"enriched_contacts"` |
| `src/components/ai-chat/parseMessage.ts` | Recognize new data types, add `brave_searches` to Credits |

### Untouched files (safety)
| File | Why |
|---|---|
| `src/components/AIChatInterface.tsx` | Replaced by AIChatWrapper + ChatInterface. Kept as backup until Sprint 2 verified. Deleted after. |
| n8n workflow `chat_bot` | AI Staffing workflow — never modified |
| n8n workflow `2HvZ10bHRgzDlNht` (People Enrichment by Agent) | Called as a tool, never modified |

---

## Sprint 1: n8n Workflow (Backend)

### Task 1: Create new Recruiting Chat workflow in n8n

**Goal:** Duplicate the existing Recruiting Search workflow and set up the new webhook endpoint.

- [ ] **Step 1: Fetch current Recruiting Search workflow for reference**

Use MCP tool:
```
mcp__n8n-mcp__n8n_get_workflow(id="2Yh2WngvSYzrKNbJ", mode="full")
```

Note the full JSON — we'll use it as a base.

- [ ] **Step 2: Create new workflow via MCP**

Use `mcp__n8n-mcp__n8n_create_workflow` to create a new workflow named "Recruiting Chat" with:
- Webhook node: `POST /webhook/recruiting_chat` (responseNode mode)
- AI Agent node: Claude Sonnet 4.5, maxIterations 20, returnIntermediateSteps true
- Anthropic Chat Model: temp 0.3, 4096 max tokens
- Chat Memory: Postgres, session-based
- Brave Web Search: exact config from existing workflow (httpRequestTool v4.2, keypair query, Accept: application/json)
- Parse Response: code node (updated in Task 4)
- Respond to Webhook: returns `{{ $json }}`

All connections: Webhook → Agent → Parse Response → Respond. Sub-nodes (Chat Model, Memory, Brave Search) connected to Agent via ai_languageModel, ai_memory, ai_tool.

- [ ] **Step 3: Verify webhook is reachable**

```bash
curl -s -X POST "https://n8n.srv1081444.hstgr.cloud/webhook/recruiting_chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"test","session_id":"test-123"}' | head -c 200
```

Expected: Should get a response (even if error) — confirms webhook is active.

- [ ] **Step 4: Commit n8n workflow ID to memory**

Note the new workflow ID for all subsequent tasks.

---

### Task 2: Add Enrich People tool node

**Goal:** Add an HTTP Request tool that calls the People Enrichment by Agent workflow server-to-server.

- [ ] **Step 1: Add Enrich People node to workflow**

Use `mcp__n8n-mcp__n8n_update_partial_workflow` to add a new node:

```json
{
  "name": "Enrich People",
  "type": "n8n-nodes-base.httpRequestTool",
  "typeVersion": 4.2,
  "position": [800, 500],
  "parameters": {
    "toolDescription": "Enrich selected candidates with verified email, phone, and company details. Call this ONLY when the user explicitly asks to enrich candidates AND selected_contacts are present in the message. Pass a JSON string with the contacts array.",
    "method": "POST",
    "url": "https://n8n.srv1081444.hstgr.cloud/webhook/people-enrichment",
    "sendHeaders": true,
    "specifyHeaders": "keypair",
    "headerParameters": {
      "parameters": [
        { "name": "Content-Type", "value": "application/json" }
      ]
    },
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ $fromAI('enrichment_payload', 'JSON string with contacts to enrich. Must contain a contacts array where each contact has fullName and companyDomain. Format: {\"contacts\":[{\"fullName\":\"John Doe\",\"companyDomain\":\"example.com\"}]}', 'string') }}",
    "options": {}
  },
  "onError": "continueRegularOutput"
}
```

- [ ] **Step 2: Connect Enrich People to Agent as ai_tool**

Use `mcp__n8n-mcp__n8n_update_partial_workflow` to add connection from Enrich People to Agent's ai_tool input (index 1, alongside Brave Web Search at index 0).

- [ ] **Step 3: Test enrichment tool with a manual execution**

In n8n UI, manually test the workflow with:
```json
{
  "message": "Enrich these candidates",
  "session_id": "test-enrich-123",
  "selected_contacts": [
    { "fullName": "Test User", "companyDomain": "sap.com" }
  ]
}
```

Verify: Agent calls Enrich People tool, gets response from people-enrichment workflow.

---

### Task 3: Update agent system prompt

**Goal:** Replace the simple discovery-only prompt with the full conversational intelligence prompt.

- [ ] **Step 1: Update Agent node parameters**

Use `mcp__n8n-mcp__n8n_update_partial_workflow` to update the Recruiting Agent node's system prompt. Full prompt from spec section "Agent System Prompt" in `docs/superpowers/specs/2026-04-02-recruiting-chat-design.md`.

Key behaviors:
- Discovery mode: adaptive 2-6 queries, LinkedIn → Xing → GitHub
- Enrichment mode: calls Enrich People tool with selected_contacts
- Conversation mode: garbage handling, vague query clarification, greetings
- Radius handling: identify nearby cities within specified km
- Dynamic query count based on requested candidate count
- Session memory via Postgres chat memory

- [ ] **Step 2: Update maxIterations to 20**

The agent may need up to 6 Brave searches + 1 enrichment call + reasoning steps. 20 iterations provides buffer.

---

### Task 4: Update Parse Response code node

**Goal:** Handle both discovery and enrichment response formats, count credits from both tool types.

- [ ] **Step 1: Replace Parse Response code**

Use `mcp__n8n-mcp__n8n_update_partial_workflow` to update the Parse Response code node with:

```javascript
// Parse Response — handles discovery, enrichment, and conversation modes
const agentOutput = $input.first().json.output || '';
const steps = $input.first().json.intermediateSteps || [];

// Count tool usage for credits
const credits = {
  brave_searches: 0,
  cognism: 0,
  apollo: 0,
  lusha: 0,
  aleads: 0,
  total: 0
};

for (const step of steps) {
  const toolName = (step.action?.tool || '').toLowerCase();
  if (toolName.includes('brave')) credits.brave_searches++;
  if (toolName.includes('enrich')) {
    try {
      const enrichResult = JSON.parse(step.observation || '{}');
      const ec = enrichResult.credits || {};
      credits.cognism += ec.cognism || 0;
      credits.apollo += ec.apollo || 0;
      credits.lusha += ec.lusha || 0;
      credits.aleads += ec.aleads || 0;
    } catch(e) {}
  }
}
credits.total = credits.cognism + credits.apollo + credits.lusha + credits.aleads;

// Extract JSON block from agent output
const jsonMatch = agentOutput.match(/<!--JSONSTART-->([\s\S]*?)<!--JSONEND-->/);
let data = { type: 'info', candidates: [], contacts: [] };

if (jsonMatch) {
  try {
    data = JSON.parse(jsonMatch[1].trim());
  } catch(e) {}
}

// Hallucination guard: candidates without Brave search = reject
if (data.type === 'candidates' && credits.brave_searches === 0) {
  data = { type: 'info', candidates: [], contacts: [] };
}

// Clean text (remove JSON block)
const cleanText = agentOutput
  .replace(/<!--JSONSTART-->[\s\S]*?<!--JSONEND-->/, '')
  .trim();

// Generate chat name from first discovery
let chatName = '';
if (data.type === 'candidates' && data.candidates && data.candidates.length > 0) {
  const roleMatch = cleanText.match(
    /(?:found|showing|here are|discovered).*?(\w[\w\s]{2,20}?)\s+(?:in|from|near|around)\s+([\w\s-]+?)(?:\.|,|$)/i
  );
  if (roleMatch) {
    chatName = roleMatch[1].trim() + ' · ' + roleMatch[2].trim();
  }
}

return [{
  json: {
    output: agentOutput,
    text: cleanText,
    data,
    credits,
    chatName
  }
}];
```

---

### Task 5: Test discovery flow end-to-end

**Goal:** Verify the full discovery pipeline works with the new workflow.

- [ ] **Step 1: Test basic discovery**

```bash
curl -s -X POST "https://n8n.srv1081444.hstgr.cloud/webhook/recruiting_chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"Find me 10 SAP experts in Cologne","session_id":"test-disc-001"}' \
  --max-time 120
```

Expected: JSON response with `data.type === "candidates"`, 8-12 candidates, `credits.brave_searches >= 2`.

- [ ] **Step 2: Test radius query**

```bash
curl -s -X POST "https://n8n.srv1081444.hstgr.cloud/webhook/recruiting_chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"Find SAP consultants in Cologne, 30km radius","session_id":"test-disc-002"}' \
  --max-time 120
```

Expected: Candidates from Cologne AND nearby cities (Bonn, Leverkusen, Düsseldorf).

- [ ] **Step 3: Test garbage handling**

```bash
curl -s -X POST "https://n8n.srv1081444.hstgr.cloud/webhook/recruiting_chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"whats the weather","session_id":"test-disc-003"}'
```

Expected: Short redirect message, `data.type === "info"`, no candidates.

- [ ] **Step 4: Test vague query**

```bash
curl -s -X POST "https://n8n.srv1081444.hstgr.cloud/webhook/recruiting_chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"find developers","session_id":"test-disc-004"}'
```

Expected: Clarifying question (asks for technology/location), no candidates.

---

### Task 6: Test enrichment flow end-to-end

**Goal:** Verify the agent correctly calls Enrich People tool when given selected_contacts.

- [ ] **Step 1: Test enrichment with selected contacts**

```bash
curl -s -X POST "https://n8n.srv1081444.hstgr.cloud/webhook/recruiting_chat" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Enrich these candidates",
    "session_id": "test-enrich-001",
    "selected_contacts": [
      {"fullName": "Maria Schmidt", "companyDomain": "deloitte.com", "jobTitle": "SAP Consultant", "linkedinUrl": "https://linkedin.com/in/test"}
    ]
  }' \
  --max-time 180
```

Expected: Agent calls Enrich People tool, returns `data.type === "enriched_contacts"` with email/phone data, `credits` shows provider usage.

- [ ] **Step 2: Verify enrichment credits are counted**

Check the response `credits` object — should have non-zero values for whichever providers returned data (cognism, apollo, lusha, or aleads).

---

## Sprint 2: Frontend — Shared Chat Refactor

**CRITICAL RULE: After this sprint, AI Staffing must work identically to how it works today. Every step that touches shared code must be verified against AI Staffing.**

### Task 7: Database migration — add chat_type column

**Files:**
- Create: `supabase/migrations/20260402150000_chat_type_column.sql`

- [ ] **Step 1: Write migration**

```sql
-- Add chat_type to distinguish AI Staffing vs Recruiting conversations
ALTER TABLE ai_chat_conversations
  ADD COLUMN IF NOT EXISTS chat_type text NOT NULL DEFAULT 'ai_staffing';

-- Constraint to ensure valid values
ALTER TABLE ai_chat_conversations
  ADD CONSTRAINT ai_chat_conversations_chat_type_check
  CHECK (chat_type IN ('ai_staffing', 'recruiting'));

-- Index for filtered queries (each wrapper queries by user_id + chat_type)
CREATE INDEX IF NOT EXISTS idx_ai_chat_conversations_user_chat_type
  ON ai_chat_conversations (user_id, chat_type);
```

- [ ] **Step 2: Apply migration via Supabase Management API**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/ggvhwxpaovfvoyvzixqw/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE ai_chat_conversations ADD COLUMN IF NOT EXISTS chat_type text NOT NULL DEFAULT '\''ai_staffing'\''; ALTER TABLE ai_chat_conversations ADD CONSTRAINT ai_chat_conversations_chat_type_check CHECK (chat_type IN ('\''ai_staffing'\'', '\''recruiting'\'')); CREATE INDEX IF NOT EXISTS idx_ai_chat_conversations_user_chat_type ON ai_chat_conversations (user_id, chat_type);"}'
```

- [ ] **Step 3: Verify column exists**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/ggvhwxpaovfvoyvzixqw/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = '\''ai_chat_conversations'\'' AND column_name = '\''chat_type'\''"}'
```

Expected: `chat_type`, `text`, `'ai_staffing'::text`

- [ ] **Step 4: Regenerate Supabase types**

```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN \
  /c/Users/prana/scoop/shims/supabase.exe gen types typescript \
  --project-id ggvhwxpaovfvoyvzixqw > src/integrations/supabase/types.ts
```

- [ ] **Step 5: Commit migration**

```bash
git add supabase/migrations/20260402150000_chat_type_column.sql src/integrations/supabase/types.ts
git commit -m "feat: add chat_type column to ai_chat_conversations for recruiting chat"
```

---

### Task 8: Create chatTypes.ts — shared config type

**Files:**
- Create: `src/components/chat/chatTypes.ts`

- [ ] **Step 1: Create the config type file**

```typescript
import type { ContactData, MessageMetadata } from "../ai-chat/types";

export type ChatType = "ai_staffing" | "recruiting";

export interface ChatConfig {
  /** n8n webhook URL to POST messages to */
  webhookUrl: string;
  /** Discriminator for conversation filtering */
  chatType: ChatType;
  /** Input field placeholder */
  placeholderText: string;
  /** Title shown in empty state */
  emptyStateTitle: string;
  /** Example queries shown in empty state */
  emptyStateExamples: string[];
  /** Feature flags per chat type */
  features: {
    /** Show checkboxes on preview contacts */
    contactSelection: boolean;
    /** Show "Enrich Selected (N)" button that sends enrichment message */
    enrichmentButton: boolean;
    /** Show "Sync to Results" button in chat header */
    syncToResults: boolean;
  };
}

export const AI_STAFFING_CONFIG: ChatConfig = {
  webhookUrl: "https://n8n.srv1081444.hstgr.cloud/webhook/chat_bot",
  chatType: "ai_staffing",
  placeholderText: "Ask about staffing, companies, or contacts…",
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
  placeholderText: "Search for candidates by role, skills, location…",
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

/** Re-export common types for convenience */
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/chatTypes.ts
git commit -m "feat: add ChatConfig type and configs for AI Staffing + Recruiting"
```

---

### Task 9: Extract ChatInterface from AIChatInterface

**Files:**
- Create: `src/components/chat/ChatInterface.tsx`
- Reference: `src/components/AIChatInterface.tsx` (copy logic, parameterize)

This is the largest task. We extract the ~789-line `AIChatInterface.tsx` into a config-driven `ChatInterface.tsx`. The key changes:

1. Webhook URL comes from `config.webhookUrl` instead of hardcoded
2. Conversations filtered by `config.chatType`
3. New conversations created with `chat_type: config.chatType`
4. Placeholder text from `config.placeholderText`
5. Examples from `config.emptyStateExamples`
6. Enrichment button rendered when `config.features.enrichmentButton && selectedContacts.size > 0`
7. Sync button rendered when `config.features.syncToResults`

- [ ] **Step 1: Create ChatInterface.tsx**

Copy the entire `AIChatInterface.tsx` to `src/components/chat/ChatInterface.tsx` and make these changes:

1. **Props:** Replace `AIChatInterfaceProps` with:
```typescript
import type { ChatConfig, ChatHandle, ConversationMeta, Message, ContactData } from "./chatTypes";

interface ChatInterfaceProps {
  config: ChatConfig;
  userId: string;
  isAdmin?: boolean;
  externalActiveId?: string;
  onConvsChange?: (convs: ConversationMeta[], activeId: string) => void;
}
```

2. **Webhook URL** (line ~358): Replace hardcoded URL:
```typescript
// BEFORE:
const res = await fetch("https://n8n.srv1081444.hstgr.cloud/webhook/chat_bot", {

// AFTER:
const res = await fetch(config.webhookUrl, {
```

3. **Load conversations** (line ~190-194): Filter by chat_type:
```typescript
// BEFORE:
const { data } = await supabase
  .from("ai_chat_conversations")
  .select("id, title, session_id, updated_at, synced_search_id")
  .eq("user_id", userId)
  .order("updated_at", { ascending: false });

// AFTER:
const { data } = await supabase
  .from("ai_chat_conversations")
  .select("id, title, session_id, updated_at, synced_search_id, chat_type")
  .eq("user_id", userId)
  .eq("chat_type", config.chatType)
  .order("updated_at", { ascending: false });
```

4. **Create conversation** (line ~224-250): Add chat_type:
```typescript
// In the .insert() call, add chat_type:
const { data: newConv } = await supabase
  .from("ai_chat_conversations")
  .insert({
    user_id: userId,
    title: `Chat ${chatNum}`,
    session_id: crypto.randomUUID(),
    chat_type: config.chatType,
  })
  .select("id, title, session_id, updated_at, synced_search_id, chat_type")
  .single();
```

5. **Examples** (line ~52-59): Use config:
```typescript
// BEFORE:
const EXAMPLES = ["Example: Find 10 robotics...", ...];

// AFTER: (inside component)
const examples = config.emptyStateExamples;
```

6. **Placeholder text** (line ~683): Use config:
```typescript
// BEFORE:
placeholder="Ask about staffing, companies, or contacts…"

// AFTER:
placeholder={config.placeholderText}
```

7. **Enrichment button** — Add above the input area, after the selected contacts badge:
```typescript
{config.features.enrichmentButton && selectedContacts.size > 0 && !sending && (
  <button
    onClick={() => {
      const enrichMsg = `Enrich these ${selectedContacts.size} candidates`;
      setInput(enrichMsg);
      // Auto-send after a tick so the input is set
      setTimeout(() => {
        sendMessage(enrichMsg);
        setInput("");
      }, 0);
    }}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
  >
    <UserCheck className="h-3.5 w-3.5" />
    Enrich Selected ({selectedContacts.size})
  </button>
)}
```

8. **Sync to Results button** — Only render when `config.features.syncToResults`:
```typescript
{config.features.syncToResults && hasSyncableData(msgs) && (
  // existing sync button JSX
)}
```

9. **Imports:** Update to use types from `./chatTypes` instead of local definitions. Remove `ConversationMeta`, `Message`, `AIChatHandle` local type definitions.

10. **Export:** `export const ChatInterface = forwardRef<ChatHandle, ChatInterfaceProps>(...)`

- [ ] **Step 2: Verify ChatInterface compiles**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd /c/Pranav/SiddhaAI/02_Bravoro/01_WebsiteRepo/leapleadsai && npx tsc --noEmit 2>&1 | head -30
```

Fix any TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatInterface.tsx
git commit -m "feat: extract ChatInterface from AIChatInterface with config-driven behavior"
```

---

### Task 10: Create AIChatWrapper — AI Staffing thin wrapper

**Files:**
- Create: `src/components/chat/AIChatWrapper.tsx`

- [ ] **Step 1: Create the wrapper**

```typescript
import { forwardRef } from "react";
import { ChatInterface } from "./ChatInterface";
import { AI_STAFFING_CONFIG } from "./chatTypes";
import type { ChatHandle, ConversationMeta } from "./chatTypes";

interface AIChatWrapperProps {
  userId: string;
  isAdmin?: boolean;
  externalActiveId?: string;
  onConvsChange?: (convs: ConversationMeta[], activeId: string) => void;
}

export const AIChatWrapper = forwardRef<ChatHandle, AIChatWrapperProps>(
  (props, ref) => (
    <ChatInterface ref={ref} config={AI_STAFFING_CONFIG} {...props} />
  )
);

AIChatWrapper.displayName = "AIChatWrapper";
```

- [ ] **Step 2: Update Dashboard.tsx to use AIChatWrapper**

In `src/pages/Dashboard.tsx`:

```typescript
// BEFORE (line 9):
import { AIChatInterface, ConversationMeta, AIChatHandle } from "@/components/AIChatInterface";

// AFTER:
import { AIChatWrapper } from "@/components/chat/AIChatWrapper";
import type { ChatHandle, ConversationMeta } from "@/components/chat/chatTypes";
```

Update type references:
```typescript
// BEFORE (line 31):
const aiChatRef = useRef<AIChatHandle>(null);

// AFTER:
const aiChatRef = useRef<ChatHandle>(null);
```

Update render (line ~249):
```typescript
// BEFORE:
<AIChatInterface
  ref={aiChatRef}
  userId={user?.id || ""}
  isAdmin={isAdmin}
  externalActiveId={aiActiveId}
  onConvsChange={handleConvsChange}
/>

// AFTER:
<AIChatWrapper
  ref={aiChatRef}
  userId={user?.id || ""}
  isAdmin={isAdmin}
  externalActiveId={aiActiveId}
  onConvsChange={handleConvsChange}
/>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Test AI Staffing works identically**

Start dev server and test:
1. Open AI Staffing from Dashboard
2. Verify existing conversations load
3. Send a test message — verify n8n response renders correctly
4. Create new chat — verify it appears in sidebar
5. Rename/delete a chat — verify it works
6. Verify contact selection checkboxes work on preview contacts
7. Verify credits line shows for admin

**This is the critical gate — do NOT proceed if AI Staffing has any regression.**

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/AIChatWrapper.tsx src/pages/Dashboard.tsx
git commit -m "feat: replace AIChatInterface with AIChatWrapper on Dashboard, verify AI Staffing unchanged"
```

---

## Sprint 3: Frontend — Recruiting Chat UI

### Task 11: Update types for recruiting data

**Files:**
- Modify: `src/components/ai-chat/types.ts`

- [ ] **Step 1: Add recruiting-specific fields to ContactData**

```typescript
// Add to ContactData interface (after existing fields):
export interface ContactData {
  fullName: string;
  jobTitle: string;
  companyName: string;
  companyDomain: string;
  linkedinUrl: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  source: string;
  previewOnly: boolean;
  // Recruiting-specific (optional — not present in AI Staffing contacts)
  skills?: string[];
  experienceSummary?: string;
  headline?: string;
}
```

- [ ] **Step 2: Add brave_searches to Credits**

```typescript
export interface Credits {
  theirstack: number;
  cognism: number;
  apollo: number;
  lusha: number;
  aleads: number;
  total: number;
  brave_searches?: number;
  [key: string]: number | undefined;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-chat/types.ts
git commit -m "feat: add recruiting fields (skills, headline, experienceSummary) to ContactData"
```

---

### Task 12: Add candidate card rendering to RichMessageContent

**Files:**
- Modify: `src/components/ai-chat/RichMessageContent.tsx`

- [ ] **Step 1: Add CandidatePreviewCard component**

Add this component inside `RichMessageContent.tsx`, before the main export:

```typescript
/** Candidate preview card — shown after discovery, before enrichment */
const CandidatePreviewCard = ({
  contact,
  isSelected,
  onToggle,
  contactKey: key,
}: {
  contact: ContactData;
  isSelected: boolean;
  onToggle: (contact: ContactData, key: string) => void;
  contactKey: string;
}) => (
  <div
    className={cn(
      "group relative flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
      isSelected
        ? "bg-emerald-500/10 border-emerald-500/30"
        : "bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]"
    )}
    onClick={() => onToggle(contact, key)}
  >
    {/* Checkbox */}
    <div className={cn(
      "mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
      isSelected
        ? "bg-emerald-500 border-emerald-500"
        : "border-white/20 group-hover:border-white/40"
    )}>
      {isSelected && (
        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>

    {/* Content */}
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-white truncate">{contact.fullName}</span>
        {contact.linkedinUrl && (
          <a
            href={contact.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-400 hover:text-blue-300 shrink-0"
            title="View LinkedIn profile"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </a>
        )}
      </div>
      {(contact.headline || contact.jobTitle) && (
        <p className="text-xs text-white/60 mt-0.5 truncate">
          {contact.headline || `${contact.jobTitle}${contact.companyName ? ` at ${contact.companyName}` : ""}`}
        </p>
      )}
      {(contact.city || contact.country) && (
        <p className="text-xs text-white/40 mt-0.5">
          {[contact.city, contact.country].filter(Boolean).join(", ")}
        </p>
      )}
      {contact.skills && contact.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {contact.skills.slice(0, 5).map((skill) => (
            <span key={skill} className="px-1.5 py-0.5 text-[10px] rounded bg-white/[0.06] text-white/50">
              {skill}
            </span>
          ))}
          {contact.skills.length > 5 && (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-white/[0.06] text-white/40">
              +{contact.skills.length - 5}
            </span>
          )}
        </div>
      )}
      {contact.experienceSummary && (
        <p className="text-[11px] text-white/30 mt-1 line-clamp-2 italic">
          {contact.experienceSummary}
        </p>
      )}
    </div>
  </div>
);
```

- [ ] **Step 2: Add EnrichedCandidateCard component**

```typescript
/** Enriched candidate card — shown after enrichment, full details */
const EnrichedCandidateCard = ({ contact }: { contact: ContactData }) => (
  <div className="flex items-start gap-3 p-3 rounded-lg border bg-emerald-500/[0.05] border-emerald-500/20">
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-white truncate">{contact.fullName}</span>
        {contact.linkedinUrl && (
          <a
            href={contact.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 shrink-0"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </a>
        )}
      </div>
      {contact.jobTitle && (
        <p className="text-xs text-white/60 mt-0.5">
          {contact.jobTitle}{contact.companyName ? ` at ${contact.companyName}` : ""}
        </p>
      )}
      {(contact.city || contact.country) && (
        <p className="text-xs text-white/40 mt-0.5">
          {[contact.city, contact.country].filter(Boolean).join(", ")}
        </p>
      )}
      {/* Verified contact details */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="text-emerald-400 hover:text-emerald-300 truncate max-w-[200px]">
            {contact.email}
          </a>
        )}
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="text-emerald-400 hover:text-emerald-300">
            {contact.phone}
          </a>
        )}
      </div>
      {contact.source && (
        <p className="text-[10px] text-white/30 mt-1.5">Source: {contact.source}</p>
      )}
    </div>
  </div>
);
```

- [ ] **Step 3: Update main RichMessageContent to handle new data types**

In the main `RichMessageContent` component, add rendering branches for `candidates` and `enriched_contacts` data types. Find the section where it checks `structuredData` and renders panels (around line 512-580):

After the existing companies/contacts rendering, add:

```typescript
{/* Candidate Preview Cards (recruiting discovery) */}
{structuredData.type === "candidates" && structuredData.contacts && structuredData.contacts.length > 0 && (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-white/50 uppercase tracking-wider">
        Candidates Found ({structuredData.contacts.length})
      </span>
      {/* Select All button */}
      <button
        onClick={() => {
          const allKeys = structuredData.contacts.map((c) => contactKey(c));
          const allSelected = allKeys.every((k) => selectedContactKeys.has(k));
          if (allSelected) {
            // Deselect all
            allKeys.forEach((k) => {
              const contact = structuredData.contacts.find((c) => contactKey(c) === k);
              if (contact) onToggleContact(contact, k);
            });
          } else {
            // Select all unselected
            structuredData.contacts.forEach((c) => {
              const k = contactKey(c);
              if (!selectedContactKeys.has(k)) onToggleContact(c, k);
            });
          }
        }}
        className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
      >
        {structuredData.contacts.every((c) => selectedContactKeys.has(contactKey(c)))
          ? "Deselect All"
          : "Select All"}
      </button>
    </div>
    <div className="grid gap-2">
      {structuredData.contacts.map((contact) => {
        const key = contactKey(contact);
        return (
          <CandidatePreviewCard
            key={key}
            contact={contact}
            isSelected={selectedContactKeys.has(key)}
            onToggle={onToggleContact}
            contactKey={key}
          />
        );
      })}
    </div>
  </div>
)}

{/* Enriched Candidate Cards (recruiting enrichment results) */}
{structuredData.type === "enriched_contacts" && structuredData.contacts && structuredData.contacts.length > 0 && (
  <div className="space-y-2">
    <span className="text-xs font-medium text-emerald-400/70 uppercase tracking-wider">
      Enriched Contacts ({structuredData.contacts.length})
    </span>
    <div className="grid gap-2">
      {structuredData.contacts.map((contact) => (
        <EnrichedCandidateCard key={contactKey(contact)} contact={contact} />
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ai-chat/RichMessageContent.tsx
git commit -m "feat: add CandidatePreviewCard and EnrichedCandidateCard for recruiting chat"
```

---

### Task 13: Create RecruitingChatWrapper

**Files:**
- Create: `src/components/chat/RecruitingChatWrapper.tsx`

- [ ] **Step 1: Create the wrapper**

```typescript
import { forwardRef } from "react";
import { ChatInterface } from "./ChatInterface";
import { RECRUITING_CONFIG } from "./chatTypes";
import type { ChatHandle, ConversationMeta } from "./chatTypes";

interface RecruitingChatWrapperProps {
  userId: string;
  isAdmin?: boolean;
  externalActiveId?: string;
  onConvsChange?: (convs: ConversationMeta[], activeId: string) => void;
}

export const RecruitingChatWrapper = forwardRef<ChatHandle, RecruitingChatWrapperProps>(
  (props, ref) => (
    <ChatInterface ref={ref} config={RECRUITING_CONFIG} {...props} />
  )
);

RecruitingChatWrapper.displayName = "RecruitingChatWrapper";
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/RecruitingChatWrapper.tsx
git commit -m "feat: add RecruitingChatWrapper with recruiting config"
```

---

### Task 14: Add Recruiting to Dashboard + Sidebar

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/components/AppSidebar.tsx`

- [ ] **Step 1: Update Dashboard — add recruiting type and card**

In `src/pages/Dashboard.tsx`:

1. Update EnrichmentType (line 17):
```typescript
// BEFORE:
type EnrichmentType = "manual" | "bulk" | "people_enrichment" | "ai_staffing" | null;

// AFTER:
type EnrichmentType = "manual" | "bulk" | "people_enrichment" | "ai_staffing" | "recruiting_chat" | null;
```

2. Add import for RecruitingChatWrapper and UserSearch icon:
```typescript
import { RecruitingChatWrapper } from "@/components/chat/RecruitingChatWrapper";
import type { ChatHandle as RecruitingChatHandle } from "@/components/chat/chatTypes";
import { Search, Upload, Users, Bot, UserSearch } from "lucide-react";
```

3. Add recruiting state (after line 31):
```typescript
const [recruitConvs, setRecruitConvs] = useState<ConversationMeta[]>([]);
const [recruitActiveId, setRecruitActiveId] = useState<string>("");
const recruitChatRef = useRef<RecruitingChatHandle>(null);
```

4. Add 5th enrichment option (after line 62):
```typescript
{
  type: "recruiting_chat" as const,
  title: "Recruiting Search",
  description: "Find candidates by role, skills & location using AI",
  icon: UserSearch,
  gradient: "from-violet-500/20 via-purple-500/15 to-violet-500/8",
},
```

5. Add handlers for recruiting conversations (near the existing AI chat handlers):
```typescript
const handleRecruitConvsChange = (convs: ConversationMeta[], id: string) => {
  setRecruitConvs(convs);
  setRecruitActiveId(id);
};

const handleSelectRecruitConv = (id: string) => setRecruitActiveId(id);
const handleNewRecruitChat = () => recruitChatRef.current?.newChat();
const handleRenameRecruitConv = (id: string, t: string) => recruitChatRef.current?.renameConv(id, t);
const handleDeleteRecruitConv = (id: string) => recruitChatRef.current?.deleteConv(id);
```

6. Add recruiting chat render branch (after the ai_staffing block, line ~256):
```typescript
{selectedType === "recruiting_chat" ? (
  <div className="p-4 lg:p-6" style={{ paddingTop: "1.5rem", height: "100vh" }}>
    <RecruitingChatWrapper
      ref={recruitChatRef}
      userId={user?.id || ""}
      isAdmin={isAdmin}
      externalActiveId={recruitActiveId}
      onConvsChange={handleRecruitConvsChange}
    />
  </div>
) : !selectedType ? (
```

7. Update logo hide condition (line ~240):
```typescript
// BEFORE:
{selectedType !== "ai_staffing" && (

// AFTER:
{selectedType !== "ai_staffing" && selectedType !== "recruiting_chat" && (
```

8. Pass recruiting props to AppSidebar (line ~197-210):
```typescript
<AppSidebar
  isAdmin={isAdmin}
  isDeveloper={user?.email === "pranavshah0907@gmail.com"}
  onSignOut={handleSignOut}
  onHomeClick={handleHomeClick}
  selectedType={selectedType}
  aiConversations={aiConvs}
  aiActiveId={aiActiveId}
  onSelectAiConv={handleSelectAiConv}
  onNewAiChat={handleNewAiChat}
  onRenameAiConv={handleRenameAiConv}
  onDeleteAiConv={handleDeleteAiConv}
  recruitConversations={recruitConvs}
  recruitActiveId={recruitActiveId}
  onSelectRecruitConv={handleSelectRecruitConv}
  onNewRecruitChat={handleNewRecruitChat}
  onRenameRecruitConv={handleRenameRecruitConv}
  onDeleteRecruitConv={handleDeleteRecruitConv}
  onPinChange={handlePinChange}
  onSelectEnrichment={(type) => setSelectedType(type as EnrichmentType)}
/>
```

- [ ] **Step 2: Update AppSidebar — add recruiting tool + chats section**

In `src/components/AppSidebar.tsx`:

1. Add `UserSearch` to lucide imports (line 1-22):
```typescript
import { ..., UserSearch } from "lucide-react";
```

2. Add recruiting props to interface (line 40-54):
```typescript
interface AppSidebarProps {
  // ... existing props ...
  recruitConversations?: AiConv[];
  recruitActiveId?: string;
  onSelectRecruitConv?: (id: string) => void;
  onNewRecruitChat?: () => void;
  onRenameRecruitConv?: (id: string, newTitle: string) => void;
  onDeleteRecruitConv?: (id: string) => void;
}
```

3. Destructure new props (line 65-78):
```typescript
export const AppSidebar = ({
  // ... existing ...
  recruitConversations = [],
  recruitActiveId,
  onSelectRecruitConv,
  onNewRecruitChat,
  onRenameRecruitConv,
  onDeleteRecruitConv,
  // ... rest ...
}: AppSidebarProps) => {
```

4. Add recruiting tool to tools array (line 263-268):
```typescript
{ type: "recruiting_chat", label: "Recruiting", icon: UserSearch },
```
Insert after the `ai_staffing` entry.

5. Update `showYourChats` logic (line 91-92):
```typescript
// BEFORE:
const isAiStaffingActive = selectedType === "ai_staffing";
const showYourChats = isAiStaffingActive && isExpanded;

// AFTER:
const isAiStaffingActive = selectedType === "ai_staffing";
const isRecruitingActive = selectedType === "recruiting_chat";
const showYourChats = (isAiStaffingActive || isRecruitingActive) && isExpanded;
```

6. Update "Your Chats" section to show the right conversations (line ~317-421):

The section currently renders `aiConversations`. We need to switch based on which chat type is active:

```typescript
{showYourChats && (() => {
  const isRecruiting = selectedType === "recruiting_chat";
  const convs = isRecruiting ? recruitConversations : aiConversations;
  const currentActiveId = isRecruiting ? recruitActiveId : aiActiveId;
  const onSelectConv = isRecruiting ? onSelectRecruitConv : onSelectAiConv;
  const onNewChat = isRecruiting ? onNewRecruitChat : onNewAiChat;
  const onRenameConv = isRecruiting ? onRenameRecruitConv : onRenameAiConv;
  const onDeleteConv = isRecruiting ? onDeleteRecruitConv : onDeleteAiConv;

  return (
    <div className="flex flex-col gap-0.5 min-h-0 animate-fade-in overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
        <span className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
          Your Chats
        </span>
        <button
          onClick={onNewChat}
          className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 duration-150"
          title="New chat"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
        {convs.map((conv) => (
          // ... existing conversation item JSX, but using currentActiveId, onSelectConv, onRenameConv, onDeleteConv instead of aiActiveId, onSelectAiConv, etc.
        ))}
      </div>
    </div>
  );
})()}
```

Replace all references inside the Your Chats section:
- `aiActiveId` → `currentActiveId`
- `onSelectAiConv` → `onSelectConv`
- `onRenameAiConv` → `onRenameConv`
- `onDeleteAiConv` → `onDeleteConv`
- `aiConversations` → `convs`

- [ ] **Step 3: Update Dashboard grid layout for 5 cards**

The current grid is `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (line 277). With 5 cards, we need:

```typescript
// BEFORE:
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl w-full items-stretch">

// AFTER:
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 max-w-6xl w-full items-stretch">
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Test both AI Staffing and Recruiting in browser**

1. Open Dashboard — verify 5 cards appear with correct icons/labels
2. Click "AI Staffing" — verify conversations load, chat works as before
3. Click "Recruiting Search" — verify empty state shows recruiting examples
4. Create a recruiting chat — verify it appears in sidebar under "Your Chats"
5. Switch between AI Staffing and Recruiting — verify each shows its own conversations
6. Send a recruiting query — verify response renders candidate cards

- [ ] **Step 6: Commit**

```bash
git add src/pages/Dashboard.tsx src/components/AppSidebar.tsx
git commit -m "feat: add Recruiting Search to Dashboard and sidebar with dedicated conversation list"
```

---

### Task 15: Wire enrichment button in ChatInterface

**Files:**
- Modify: `src/components/chat/ChatInterface.tsx`

- [ ] **Step 1: Add enrichment button to the input area**

In `ChatInterface.tsx`, find the section where the selected contacts badge is rendered (near the input/textarea area). Add the enrichment button right next to it:

```typescript
{/* Selected contacts badge + Enrich button */}
{selectedContacts.size > 0 && (
  <div className="flex items-center gap-2 px-4 pb-2">
    {/* Existing badge */}
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-primary/15 text-primary border border-primary/20">
      <UserCheck className="h-3.5 w-3.5" />
      {selectedContacts.size} selected
      <button onClick={clearSelectedContacts} className="ml-1 hover:text-white transition-colors">
        <X className="h-3 w-3" />
      </button>
    </div>

    {/* Enrich button — only for recruiting */}
    {config.features.enrichmentButton && !sending && (
      <button
        onClick={() => {
          const count = selectedContacts.size;
          const msg = `Enrich these ${count} candidate${count > 1 ? "s" : ""}`;
          sendMessage(msg);
        }}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
      >
        <ArrowUpFromLine className="h-3 w-3" />
        Enrich Selected ({selectedContacts.size})
      </button>
    )}
  </div>
)}
```

- [ ] **Step 2: Add "Enriching..." pending state**

In the `sendMessage` function, when the config has `enrichmentButton` and the message starts with "Enrich", show a loading message:

Find where the assistant's temp "thinking" message is created and ensure the loading state text adapts:

```typescript
// When sending enrichment messages, show enrichment-specific loading
const isEnrichmentMessage = config.features.enrichmentButton && 
  content.toLowerCase().startsWith("enrich");

// The existing "thinking" message in the messages array:
const thinkingMsg: Message = {
  id: "thinking",
  role: "assistant",
  content: isEnrichmentMessage 
    ? `Enriching ${selectedContacts.size} candidate${selectedContacts.size > 1 ? "s" : ""}… This may take a minute.`
    : "",
};
```

- [ ] **Step 3: Verify TypeScript compiles and test**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit 2>&1 | head -30
```

Test in browser:
1. Open Recruiting Chat, send a discovery query
2. Select 2-3 candidates via checkboxes
3. Verify "Enrich Selected (3)" button appears
4. Click it — verify enrichment message is sent and pending state shows
5. Verify enriched results come back (if n8n workflow is working)

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/ChatInterface.tsx
git commit -m "feat: add Enrich Selected button and enrichment pending state for recruiting chat"
```

---

## Sprint 4: Results Sync + Polish

### Task 16: Update parseMessage.ts for recruiting data types

**Files:**
- Modify: `src/components/ai-chat/parseMessage.ts`

- [ ] **Step 1: Ensure parseN8nResponse handles recruiting data types**

The existing parser already extracts `<!--JSONSTART-->...<!--JSONEND-->` blocks and puts them in `structuredData`. The data types `"candidates"` and `"enriched_contacts"` will flow through automatically since `structuredData` is typed as `StructuredData` which has a `type: string` field.

Verify that:
1. `data.type === "candidates"` passes through to metadata correctly
2. `data.contacts` array is preserved (it already is — `StructuredData` has `contacts: ContactData[]`)
3. `brave_searches` in credits doesn't break anything (Credits already has `[key: string]: number`)

If `brave_searches` causes TypeScript issues with the index signature, update the `Credits` interface (already done in Task 11).

No code changes needed if the existing parser handles arbitrary `type` values in the JSON block — verify by reading the code.

- [ ] **Step 2: Test parse with recruiting sample data**

Create a quick console test:
```typescript
// In browser console after importing parseN8nResponse:
const testItem = {
  output: "Found candidates <!--JSONSTART-->{\"type\":\"candidates\",\"candidates\":[{\"fullName\":\"Test\"}],\"contacts\":[{\"fullName\":\"Test\",\"previewOnly\":true}]}<!--JSONEND-->",
  text: "Found candidates"
};
console.log(parseN8nResponse(testItem));
```

Verify: `structuredData.type === "candidates"` and `structuredData.contacts` has data.

- [ ] **Step 3: Commit (if any changes needed)**

```bash
git add src/components/ai-chat/parseMessage.ts
git commit -m "fix: ensure parseN8nResponse handles recruiting data types"
```

---

### Task 17: End-to-end testing and polish

**Goal:** Full end-to-end test of the entire recruiting flow, fix any issues.

- [ ] **Step 1: Test Discovery Flow**

1. Open Recruiting Search from Dashboard
2. Type: "Find me 10 SAP experts in Cologne, 30km radius"
3. Verify: Candidate cards appear with names, titles, LinkedIn links, skills
4. Verify: Checkboxes work on each card
5. Verify: "Select All" / "Deselect All" works
6. Verify: Chat name auto-updates (e.g., "SAP Experts · Cologne")
7. Verify: Conversation appears in sidebar

- [ ] **Step 2: Test Enrichment Flow**

1. Select 2-3 candidates
2. Click "Enrich Selected (3)"
3. Verify: Pending message shows "Enriching 3 candidates..."
4. Wait for response (may take 30-90 seconds)
5. Verify: Enriched cards appear with email, phone, source
6. Verify: Credits line shows for admin users

- [ ] **Step 3: Test Conversation Intelligence**

1. Send "hi" → verify friendly greeting + example
2. Send "what's the weather" → verify redirect to recruiting
3. Send "find developers" → verify clarifying question
4. After a discovery, send "now try Munich" → verify context preserved
5. Send "show me more junior ones" → verify refinement works

- [ ] **Step 4: Test AI Staffing is unaffected**

1. Switch to AI Staffing
2. Verify existing conversations load
3. Send a test message
4. Verify rich content (companies, contacts) renders correctly
5. Verify contact selection + sync to results works

- [ ] **Step 5: Fix any issues found**

Address any bugs, TypeScript errors, rendering issues, or UX problems discovered during testing.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: Recruiting Chat — complete implementation with discovery, enrichment, and conversation intelligence"
```

---

### Task 18: Clean up old AIChatInterface.tsx

**Files:**
- Delete: `src/components/AIChatInterface.tsx` (replaced by ChatInterface + AIChatWrapper)

- [ ] **Step 1: Verify no imports reference the old file**

```bash
grep -r "AIChatInterface" src/ --include="*.tsx" --include="*.ts"
```

Should only find references in old/backup files, not in active code.

- [ ] **Step 2: Remove old file**

```bash
git rm src/components/AIChatInterface.tsx
git commit -m "chore: remove old AIChatInterface.tsx, replaced by chat/ChatInterface + wrappers"
```

---

## Test Checkpoints Summary

| After Task | What to verify | How |
|---|---|---|
| Task 1 | New n8n workflow responds to webhook | curl POST |
| Task 5 | Discovery returns real candidates | curl POST + check JSON |
| Task 6 | Enrichment returns verified contacts | curl POST + check JSON |
| Task 7 | DB migration applied, types regenerated | SQL query + tsc |
| Task 10 | **AI Staffing works identically** (critical gate) | Manual browser test |
| Task 12 | Candidate cards render correctly | Browser + dev tools |
| Task 14 | Dashboard shows 5 cards, sidebar works for both | Browser |
| Task 15 | Enrich button sends enrichment message | Browser + n8n logs |
| Task 17 | **Full end-to-end: discovery → select → enrich → display** | Browser |
| Task 17 | **AI Staffing still works** (final regression check) | Browser |
