# Recruiting Chat — Full Design Spec

**Date:** 2026-04-02
**Status:** Approved (design discussion complete)

---

## Overview

A conversational recruiting/talent search tool within Bravoro. Users find candidates via natural language queries ("SAP experts in Cologne, 30km radius"), preview discovered profiles, select who to enrich, and receive verified contact details — all within a single chat interface.

Built on the same shared chat infrastructure as AI Staffing, but with its own n8n workflow, conversation list, and recruiting-specific behaviors.

---

## Key Design Decisions (from brainstorming)

| Decision | Choice | Why |
|---|---|---|
| Search approach | Adaptive loop (B) — 2-6 Brave queries | Balances quality, cost, and latency |
| Frontend architecture | Shared ChatInterface component (C) | No code duplication, independent UX per tool |
| Enrichment routing | Agent-routed (B) — agent calls enrichment tool | Conversational flow, easy to debug in n8n |
| Enrichment UX | Single async response (C) — pending message until done | Honest about wait time, simple to build |
| Credit display | Admin-only (A) — raw provider breakdown | Future: custom credit system abstracts providers from users |
| Results sync | Phase 2 — after core chat works | Server-side save to search_results + master_contacts |

---

## Architecture

```
User (Recruiting Chat UI)
  -> "Find SAP experts in Cologne, 30km radius"
  -> POST /webhook/recruiting_chat (n8n — NEW workflow)
      -> Recruiting Agent (Claude Sonnet 4.5)
          -> [Tool: Brave Search] x 2-6 adaptive queries
              LinkedIn -> Xing (DACH) -> GitHub (devs)
          -> Parse & deduplicate candidates
          -> Return preview cards
  -> User selects candidates via checkboxes
  -> "Enrich these 5" + selected_contacts array
  -> POST /webhook/recruiting_chat (same webhook, same agent)
      -> Agent recognizes enrichment intent
      -> [Tool: Enrich People] calls /webhook/people-enrichment internally
      -> Returns enriched contact cards
  -> Display enriched results in chat
  -> (Phase 2) Save enriched contacts to search_results + master_contacts
```

---

## n8n Workflow — Recruiting Chat (NEW)

**Duplicated from:** `2Yh2WngvSYzrKNbJ` (Recruiting Search) as starting point, then modified.
**Webhook endpoint:** `POST /webhook/recruiting_chat`
**Does NOT touch:** AI Staffing workflow (`chat_bot`) or People Enrichment workflow (`2HvZ10bHRgzDlNht`)

### Nodes

| # | Node | Type | Purpose |
|---|---|---|---|
| 1 | Recruiting Webhook | webhook v2 | `POST /webhook/recruiting_chat`, responseNode mode |
| 2 | Recruiting Agent | AI Agent v3.1 | Claude Sonnet 4.5, maxIterations: 20, returnIntermediateSteps |
| 3 | Anthropic Chat Model | Claude Sonnet 4.5 | temp 0.3, 4096 max tokens |
| 4 | Chat Memory | Postgres | Session-based, preserves context across messages |
| 5 | Brave Web Search | httpRequestTool v4.2 | GET Brave API, keypair query, Accept: application/json |
| 6 | Enrich People (NEW) | httpRequestTool v4.2 | POST `/webhook/people-enrichment` (server-to-server) |
| 7 | Parse Response | Code node | Handles discovery + enrichment response formats |
| 8 | Respond to Webhook | respondToWebhook | Returns `{ output, text, data, credits, chatName }` |

### Brave Web Search Tool — Existing Config (WORKING)

```json
{
  "method": "GET",
  "url": "https://api.search.brave.com/res/v1/web/search",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpHeaderAuth",
  "sendQuery": true,
  "specifyQuery": "keypair",
  "queryParameters": {
    "parameters": [
      { "name": "q", "value": "={{ $fromAI('query', 'The search query string', 'string') }}" },
      { "name": "count", "value": "20" },
      { "name": "extra_snippets", "value": "true" }
    ]
  },
  "sendHeaders": true,
  "specifyHeaders": "keypair",
  "headerParameters": {
    "parameters": [{ "name": "Accept", "value": "application/json" }]
  }
}
```

Credential: `Brave_http_API` (httpHeaderAuth, X-Subscription-Token)

### Enrich People Tool — NEW Config

```json
{
  "toolDescription": "Enrich selected candidates with verified email, phone, and company details. Call this when the user asks to enrich candidates. Pass a JSON body with the contacts array.",
  "method": "POST",
  "url": "https://n8n.srv1081444.hstgr.cloud/webhook/people-enrichment",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ $fromAI('enrichment_payload', 'JSON object with contacts array. Each contact must have fullName and companyDomain. Example: {\"contacts\": [{\"fullName\": \"John Doe\", \"companyDomain\": \"sap.com\"}]}', 'string') }}",
  "sendHeaders": true,
  "specifyHeaders": "keypair",
  "headerParameters": {
    "parameters": [{ "name": "Content-Type", "value": "application/json" }]
  }
}
```

This calls the existing `People Enrichment by Agent` workflow (`2HvZ10bHRgzDlNht`) server-to-server. The `Transform to Sheet1` node in that workflow already accepts `{ contacts: [{fullName, companyDomain, ...}] }` format and converts it to the enrichment pipeline's expected format.

### Agent System Prompt

```
You are a recruiting/talent search assistant for Bravoro. You help users find candidates by role, skills, and location.

## YOUR TOOLS
1. **Brave Web Search** — Search the web via Brave Search API. Pass a query string.
2. **Enrich People** — Enrich selected candidates with verified emails, phones, and details. Call ONLY when the user explicitly asks to enrich candidates and provides selected_contacts.

You have NO other tools. Do NOT attempt to scrape, fetch URLs, or access any other service.

## MODES

### DISCOVERY MODE — User asks for candidates
When the user asks to find people/candidates/talent:

1. **Understand the request:**
   - Role/title (required)
   - Skills/technologies (optional)
   - Location (optional but common)
   - Radius — if user specifies a radius (e.g., "30km around Cologne"), identify major cities/towns within that radius and include them in your searches
   - Count — how many candidates they want (default: 10)
   - Seniority level (optional)

2. **Search Strategy (adaptive):**
   - ALWAYS start with LinkedIn: `site:linkedin.com/in [role] [skills] [location]`
   - After each search, count unique candidates found so far
   - If you have fewer than the requested count, try:
     a. Different query phrasing (synonyms, alternative titles)
     b. Xing (for DACH region): `site:xing.com/profile [role] [location]`
     c. GitHub (for developers/engineers): `site:github.com [skills] [location]`
   - Stop when you reach the requested count OR 6 total searches, whichever comes first
   - If you couldn't find enough, tell the user honestly

3. **Adaptive query count based on requested candidates:**
   - 1-10 candidates: start with 2 LinkedIn queries, expand if needed
   - 11-20 candidates: start with 3 LinkedIn queries, expand if needed
   - 20+ candidates: start with 3-4 LinkedIn queries, almost always expand

4. **Extract from search result snippets:**
   - Full name, headline/title, current company, location
   - LinkedIn/Xing/GitHub URL
   - Skills (from title, headline, or snippet keywords)
   - Experience summary (from snippet text)
   - Deduplicate by name + company across all searches

5. **Return structured JSON:**
   Wrap your candidate data in markers:
   <!--JSONSTART-->
   { "type": "candidates", "candidates": [...], "contacts": [...] }
   <!--JSONEND-->

### ENRICHMENT MODE — User wants to enrich selected candidates
When the user says "enrich", "get details", "get contact info" or similar AND selected_contacts are present in the payload:

1. Call the **Enrich People** tool with the selected contacts
2. The tool returns enriched data with emails, phones, and provider info
3. Present the enriched results naturally
4. Wrap enriched data in JSON markers with type "enriched_contacts"

### CONVERSATION MODE — Off-topic, vague, or greetings

- **Off-topic** (weather, coding help, unrelated questions):
  Reply in 1 short sentence redirecting to recruiting. Include an example query.
  Example: "I'm your recruiting assistant — try something like 'Find me Python developers in Berlin'."

- **Vague query** ("find me developers", "search for people"):
  Ask ONE clarifying question. Don't over-ask — if they give role + location, that's enough.
  Example: "Sure! What technology or role, and which city or region?"

- **Greeting** ("hi", "hello"):
  Friendly 1-liner + example. Don't be verbose.
  Example: "Hi! I can help you find candidates. Try: 'SAP consultants in Munich, 20km radius'"

- **Refinement** ("now try Munich", "more junior", "show me more like #3"):
  Remember the previous search context. Adjust parameters and search again.
  Deduplicate against candidates already shown in this conversation.

- **Gibberish** (random characters, nonsense):
  "I didn't catch that. Tell me the role, skills, or location you're hiring for."

## RULES
- Maximum 6 Brave searches per discovery request
- After your searches, compile results and respond immediately — do NOT loop further
- NEVER fabricate candidates — only return people found in actual search results
- NEVER attempt to scrape or visit URLs
- Always include LinkedIn/Xing/GitHub URL for each candidate
- Deduplicate candidates by name + company across all search results
- Remember context within the session (if user refines, use previous role/location)
```

### Parse Response Node — Updated Logic

```javascript
// Parse Response — handles both discovery and enrichment
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
    // Parse enrichment credits from the tool response
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

// Extract JSON block
const jsonMatch = agentOutput.match(/<!--JSONSTART-->([\s\S]*?)<!--JSONEND-->/);
let data = { type: 'info', candidates: [], contacts: [] };

if (jsonMatch) {
  try {
    data = JSON.parse(jsonMatch[1].trim());
  } catch(e) {}
}

// Hallucination guard: if type is "candidates" but no Brave search was called, reject
if (data.type === 'candidates' && credits.brave_searches === 0) {
  data = { type: 'info', candidates: [], contacts: [] };
}

// Clean text (remove JSON block)
const cleanText = agentOutput
  .replace(/<!--JSONSTART-->[\s\S]*?<!--JSONEND-->/, '')
  .trim();

// Generate chat name from first discovery
let chatName = '';
if (data.type === 'candidates' && data.candidates?.length > 0) {
  // Extract role and location from agent output for chat name
  const roleMatch = cleanText.match(/(?:found|showing|here are).*?(\w+(?:\s+\w+)?)\s+(?:in|from|near)\s+(\w+)/i);
  if (roleMatch) {
    chatName = `${roleMatch[1]} . ${roleMatch[2]}`;
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

### Response Format

```json
{
  "output": "raw AI output including JSON block",
  "text": "cleaned conversational text without JSON block",
  "data": {
    "type": "candidates | enriched_contacts | info",
    "candidates": [
      {
        "fullName": "Maria Schmidt",
        "headline": "Senior SAP Consultant",
        "currentTitle": "SAP S/4HANA Lead",
        "currentCompany": "Deloitte",
        "companyDomain": "deloitte.com",
        "location": "Cologne, Germany",
        "skills": ["SAP", "S/4HANA", "ABAP", "FI/CO"],
        "experienceSummary": "10+ years in SAP consulting...",
        "linkedinUrl": "https://linkedin.com/in/mariaschmidt",
        "source": "linkedin"
      }
    ],
    "contacts": [
      {
        "fullName": "Maria Schmidt",
        "jobTitle": "SAP S/4HANA Lead",
        "companyName": "Deloitte",
        "companyDomain": "deloitte.com",
        "linkedinUrl": "https://linkedin.com/in/mariaschmidt",
        "email": null,
        "phone": null,
        "city": "Cologne",
        "country": "Germany",
        "source": "linkedin",
        "previewOnly": true,
        "skills": ["SAP", "S/4HANA", "ABAP"],
        "experienceSummary": "10+ years in SAP consulting...",
        "headline": "Senior SAP Consultant"
      }
    ]
  },
  "credits": { "brave_searches": 3, "cognism": 0, "apollo": 0, "lusha": 0, "aleads": 0, "total": 0 },
  "chatName": "SAP Experts . Cologne"
}
```

After enrichment, same structure but:
- `data.type` = `"enriched_contacts"`
- `contacts[].previewOnly` = `false`
- `contacts[].email`, `.phone` populated
- `contacts[].source` = `"Cognism"` / `"Apollo"` etc.
- `credits` includes provider counts

---

## Frontend

### Shared ChatInterface Refactor

**Current state:** `AIChatInterface.tsx` (~650 lines) — monolithic, AI Staffing only.

**Target state:**

| File | Purpose |
|---|---|
| `src/components/chat/ChatInterface.tsx` | Shared chat engine — messages, input, send, conversations, contact selection |
| `src/components/chat/chatTypes.ts` | `ChatConfig` type + shared interfaces |
| `src/components/chat/AIChatWrapper.tsx` | Thin wrapper — passes AI Staffing config |
| `src/components/chat/RecruitingChatWrapper.tsx` | Thin wrapper — passes Recruiting config |

**ChatConfig type:**

```typescript
interface ChatConfig {
  webhookUrl: string;           // n8n webhook URL
  chatType: 'ai_staffing' | 'recruiting';
  placeholderText: string;      // input placeholder
  emptyStateTitle: string;      // shown when no messages
  emptyStateExamples: string[]; // example queries
  features: {
    contactSelection: boolean;  // checkbox on preview contacts
    enrichmentButton: boolean;  // "Enrich Selected (N)" action button
  };
}
```

**AI Staffing config:**
```typescript
{
  webhookUrl: 'https://n8n.srv1081444.hstgr.cloud/webhook/chat_bot',
  chatType: 'ai_staffing',
  placeholderText: 'Ask about staffing...',
  emptyStateTitle: 'AI Staffing Assistant',
  emptyStateExamples: ['Find companies hiring in Berlin', 'Show me tech startups in Munich'],
  features: { contactSelection: true, enrichmentButton: false }
}
```

**Recruiting config:**
```typescript
{
  webhookUrl: 'https://n8n.srv1081444.hstgr.cloud/webhook/recruiting_chat',
  chatType: 'recruiting',
  placeholderText: 'Search for candidates by role, skills, location...',
  emptyStateTitle: 'Recruiting Search',
  emptyStateExamples: [
    'Find SAP experts in Cologne, 30km radius',
    'Senior Python developers in Berlin',
    'Product managers at fintech companies in Frankfurt'
  ],
  features: { contactSelection: true, enrichmentButton: true }
}
```

**Refactor safety rule:** AI Staffing behavior must remain identical after refactor. The wrapper passes the exact same config values that were previously hardcoded. Test AI Staffing first before building Recruiting.

### Database — Minimal Schema Change

```sql
-- Add chat_type column to ai_chat_conversations
ALTER TABLE ai_chat_conversations
  ADD COLUMN chat_type text NOT NULL DEFAULT 'ai_staffing'
  CHECK (chat_type IN ('ai_staffing', 'recruiting'));

-- Index for filtered queries
CREATE INDEX idx_ai_chat_conversations_chat_type
  ON ai_chat_conversations (user_id, chat_type);
```

- Each wrapper queries conversations with `WHERE chat_type = '<its type>'`
- `ai_chat_messages` unchanged — messages belong to conversations which already have a type
- Existing AI Staffing conversations auto-default to `'ai_staffing'`

### Dashboard — 5th Tool Card

Add to `Dashboard.tsx` tools grid:

```typescript
{
  title: "Recruiting Search",
  description: "Find candidates by role, skills & location",
  icon: UserSearch,  // from lucide-react
  gradient: "from-violet-500/20 to-purple-500/20",
  type: "recruiting_chat"
}
```

Dashboard renders `<RecruitingChatWrapper />` when `selectedType === 'recruiting_chat'`.

### Sidebar — New Tool Entry

Add to `AppSidebar.tsx` tools array:

```typescript
{ type: 'recruiting_chat', label: 'Recruiting', shortLabel: 'Recruit.', icon: UserSearch }
```

When Recruiting is active, sidebar shows "Your Chats" section filtered to `chat_type = 'recruiting'`.

### Rendering — Candidate Cards

**New data type handling in `RichMessageContent.tsx`:**

| `data.type` | Renders |
|---|---|
| `candidates` | Candidate preview cards with checkboxes |
| `enriched_contacts` | Full contact cards (no checkboxes) |
| `companies` / `contacts` | Existing AI Staffing rendering (unchanged) |
| `info` | FormattedText only |

**Candidate preview card:**
```
[checkbox] Maria Schmidt                    [LinkedIn icon]
           SAP S/4HANA Lead at Deloitte
           Cologne, Germany
           SAP, S/4HANA, ABAP, FI/CO
           "10+ years in SAP consulting..."
```

**Enriched card (after enrichment):**
```
Maria Schmidt                               [LinkedIn icon]
SAP S/4HANA Lead at Deloitte
Cologne, Germany
maria.schmidt@deloitte.com  |  +49 123 456 789
Source: Cognism
```

**Enrichment button:** When `features.enrichmentButton` is true and contacts are selected, show "Enrich Selected (N)" button above the input area. Clicking it:
1. Captures selected contacts
2. Sends a chat message: "Enrich these [N] candidates" with `selected_contacts` in payload
3. Shows pending message: "Enriching [N] candidates..." with spinner
4. When response arrives, replaces pending message with enriched cards

### Credit Display

- Admin users: see credits line below assistant messages (same as AI Staffing)
- Regular users: see nothing (for now)
- Future: custom Bravoro credit system will replace raw provider breakdown
- Provider names (Cognism, Apollo, Lusha, A-Leads) must NOT be visible to non-admin users

---

## Results Page Sync (Phase 2)

After enrichment completes successfully:

1. n8n `Recruiting Chat` workflow calls `save-search-results` edge function with:
   - `search_id` (from the chat session or auto-generated)
   - `enriched_contacts_data` (enriched contact array)
   - `credit_counter` (provider credits)
   - `flag_action: "release"` (if using queue)

2. `save-search-results` writes to:
   - `search_results` table (per-contact records)
   - `master_contacts` table (deduplicated)

3. Results appear on the Results page automatically — no extra frontend work needed.

**Implementation note:** This uses the existing `save-search-results` edge function as-is. The enriched contact format from `People Enrichment by Agent` workflow already matches what `save-search-results` expects.

---

## Conversational Intelligence — Agent Behaviors

### Smart Query Understanding

| User says | Agent does |
|---|---|
| "SAP experts in Cologne, 30km radius" | Identifies Cologne + nearby cities (Bonn, Leverkusen, Dusseldorf, Bergisch Gladbach) within 30km. Includes them in queries. |
| "Java developers in Frankfurt, senior only" | Adds seniority keywords ("senior", "lead", "principal") to queries |
| "Someone who worked at SAP and now at Deloitte" | Cross-company career path query: `"SAP" "Deloitte" site:linkedin.com/in` |
| "20 React developers in Berlin" | Runs 3-4 LinkedIn queries + expands to GitHub if needed. Stops at 20 or 6 searches. |

### Garbage Handling

| Input type | Response |
|---|---|
| Off-topic ("what's the weather?") | "I'm your recruiting assistant — try something like 'Find me Python developers in Berlin'." |
| Gibberish ("asdfghjk") | "I didn't catch that. Tell me the role, skills, or location you're hiring for." |
| Greeting ("hi") | "Hi! I can help you find candidates. Try: 'SAP consultants in Munich, 20km radius'" |
| Vague ("find developers") | "Sure! What technology or role, and which city or region?" |

### Session Memory

The agent uses Postgres chat memory (session-based). Within a conversation:
- Remembers role, location, skills from previous messages
- "Now try Munich" → keeps role, changes location
- "More junior" → keeps role + location, adjusts seniority
- "Show me more like candidate #3" → uses that profile as query template
- Deduplicates against previously shown candidates

### Platform Priority

1. **LinkedIn** (`site:linkedin.com/in`) — always first, best coverage
2. **Xing** (`site:xing.com/profile`) — DACH region fallback when LinkedIn results are thin
3. **GitHub** (`site:github.com`) — developer/engineer roles only, when results are thin

### Adaptive Search Thresholds

| Requested candidates | Initial LinkedIn queries | Expand? | Max total queries |
|---|---|---|---|
| 1-10 | 2 | If < requested after LinkedIn | 4 |
| 11-20 | 3 | If < requested after LinkedIn | 6 |
| 20+ | 3-4 | Almost always | 6 |

---

## Cost Analysis

| Operation | Cost | Notes |
|---|---|---|
| Discovery (per search) | ~$0.05-0.15 | 2-6 Brave queries + Claude reasoning |
| Enrichment (per contact) | Existing credits | Cognism/Apollo/Lusha/A-Leads waterfall |
| Chat memory | Negligible | Postgres storage |
| **Total per session** | **$0.05-0.15 + enrichment credits** | Discovery is cheap; enrichment is user-controlled |

---

## Sprint Plan

### Sprint 1: n8n Workflow (Backend)
- Create new `Recruiting Chat` workflow (duplicate + modify)
- Add Enrich People tool node
- Update agent system prompt with full conversational intelligence
- Update Parse Response node for both modes
- Test: discovery, enrichment, garbage handling, adaptive search

### Sprint 2: Frontend — Shared Chat Refactor
- Extract ChatInterface from AIChatInterface.tsx
- Create AIChatWrapper (AI Staffing — must work identically)
- Test AI Staffing thoroughly before proceeding
- Database migration: add `chat_type` column

### Sprint 3: Frontend — Recruiting Chat UI
- Create RecruitingChatWrapper
- Add candidate preview cards + enriched cards to RichMessageContent
- Add "Enrich Selected" button
- Add Dashboard card + Sidebar entry
- Test full flow: discovery -> select -> enrich -> display

### Sprint 4: Results Sync + Polish
- Wire enrichment results to save-search-results
- Results page shows recruiting enrichments
- Polish: loading states, error handling, edge cases
- End-to-end testing across all flows

---

## What This Spec Does NOT Cover

- Custom credit system (future initiative)
- Rate limiting / abuse prevention on recruiting searches
- Saved search templates / recurring searches
- Candidate comparison / shortlisting features
- Integration with ATS (Applicant Tracking Systems)

These are potential future enhancements, not part of this implementation.
