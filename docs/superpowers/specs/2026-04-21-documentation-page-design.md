# Documentation Page — Design Spec

## Summary

Add an in-app documentation page (`/docs`) to the Bravoro app, accessible from the user avatar menu. The page documents all features, platform tools, and admin operations at medium depth — enough for a B2B professional to self-serve, not a step-by-step tutorial.

Design inspiration: Tailwind Docs, Supabase Docs, Apollo Help Center.

---

## Audience & Tone

- **Primary audience:** End users (people running searches, enrichments, recruiting)
- **Tone:** Clear, concise, professional. No jargon dumps. Scannable.
- **Depth:** Medium — short description + key details (formats, columns, credit costs, tips/warnings). No hand-holding ("click this button") but enough that any feature is understandable on first read.

---

## Layout Architecture

### Four-column layout (desktop)

```
┌──────────┬──────────────┬─────────────────────────────────┬──────────────┐
│ App      │ Docs TOC     │ Content Area                    │ Right Rail   │
│ Sidebar  │ (pinned)     │                                 │ "On this     │
│ 48-64px  │ ~200px       │ flex, max-width 720px           │  page"       │
│ existing │ pin/unpin    │ breadcrumb + title + body        │ ~140px       │
│          │ toggle       │ prev/next nav at bottom          │ sticky       │
└──────────┴──────────────┴─────────────────────────────────┴──────────────┘
```

### Docs TOC Sidebar (left)

- **Width:** ~200px
- **State:** Pinned open by default. User can unpin via toggle button (pin icon in header).
- **Unpinned behavior:** TOC hides. A small floating toggle button appears at the left edge of the content area to re-open it.
- **Header:** "Documentation" title + pin/unpin toggle
- **Search:** Text input at top — filters TOC items client-side (simple substring match on section titles)
- **Navigation groups:**
  - **(ungrouped):** Overview, Getting Started
  - **Features:** Single Search, Bulk Search, People Enrichment, AI Staffing Chat, Recruiting Chat
  - **Platform:** Results & Export, Database, Analytics, Credits, Settings
  - **Admin:** Workspace & Users
- **Active state:** Emerald left border + subtle background tint on current section
- **Scroll:** TOC scrolls independently if content overflows

### Content Area (center)

- **Max-width:** 720px, centered within available space
- **Breadcrumb:** `Docs › Section Name` at top
- **Title block:** Section title (h1, 22px, bold) + subtitle/description (14px, gray)
- **Body:** Rendered markdown-style content with headings (h2, h3), paragraphs, tables, tip/warning boxes, feature cards, inline diagrams
- **Bottom nav:** Previous / Next section links with section names

### Right Rail — "On this page" (right)

- **Width:** ~140px
- **Position:** Sticky, offset from top
- **Content:** Auto-generated from h2 headings within the current section
- **Active tracking:** Uses IntersectionObserver to highlight current heading as user scrolls
- **Click:** Smooth-scrolls to heading
- **Breakpoint:** Hidden below 1280px screen width

### Mobile (< 768px)

- App sidebar: existing mobile behavior (hidden, MobileTabBar at bottom)
- Docs TOC: Hidden by default. Hamburger/menu button in a sticky header shows TOC as a slide-over overlay.
- Right rail: Hidden completely
- Content: Full-width with standard mobile padding
- Sticky mobile header: Shows current section title + TOC toggle

---

## Navigation Integration

### Avatar Menu

Add a "Documentation" item to `UserAvatarMenu.tsx`:
- **Position:** Between the user info section and the Settings item (always visible, not admin-gated)
- **Icon:** `BookOpen` from lucide-react
- **Action:** `navigate('/docs')`

### Routing

Add route in `App.tsx`:
- **Path:** `/docs` and `/docs/:sectionSlug`
- **Component:** `DocsPage` (lazy-loaded)
- **Auth:** Protected (same auth guard as other pages)
- **Default:** `/docs` redirects to `/docs/overview`

---

## Content Sections

### Group 1: Getting Started

#### Overview (`/docs/overview`)
- **What Bravoro is:** 2-3 sentence value prop
- **Core Features grid:** 2x2 (or 2x3) card grid — each card has icon, feature name, one-liner description. Cards link to their respective doc section.
  - Single Search, Bulk Search, People Enrichment, AI Staffing Chat, Recruiting Chat
- **Credit Costs table:** Contact type × credits (Mobile Phone: 4, Direct Phone: 3, Email/LinkedIn: 2, Job Listing: 1)
- **CTA:** "Get Started →" link to Getting Started section

#### Getting Started (`/docs/getting-started`)
- **Dashboard orientation:** What each sidebar item does (1 sentence each)
- **Your first search:** Walk through Single Search as the simplest entry point (enter company name → choose function/seniority → search → view results)
- **Workspace & Credits:** Your workspace has a shared credit pool. Every enrichment deducts credits. Check balance in Settings or Analytics.
- **Tip box:** "Start with Single Search to see how results look before running bulk operations."

### Group 2: Features

#### Single Search (`/docs/single-search`)
- What it does (company-level lookup, one at a time)
- Form fields: Company Name, Domain (optional), Location, Person Functions, Person Seniorities, Job Title
- What results include: contacts with email/phone, job listings if enabled
- Credit cost: per contact type (reference the table)
- Tip: "Domain is optional but improves accuracy"

#### Bulk Search (`/docs/bulk-search`)
- What it does (batch company lookup via file upload)
- **3 input methods:**
  - **Excel Upload:** Upload `.xlsx` file. Required columns table:

    | Column | Required | Notes |
    |--------|----------|-------|
    | Sr No | Yes | Row number |
    | Organization Name | Yes | Company name |
    | Organization Locations | No | Filter by location |
    | Organization Domains | No | Company domain |
    | Person Functions | No | e.g. "Sales, Marketing" (comma separated) |
    | Person Seniorities | No | e.g. "Director, VP" |
    | Person Job Title | No | Specific title filter |
    | Results per Function | No | Number of results per function |
    | Job Search | No | "Yes" / "No" |
    | Job Title | No | Job title to search |
    | Job Seniority | No | Job seniority filter |
    | Date (days) | No | Job posting recency |

  - **Google Sheets:** Paste a Google Sheet URL. Sheet must have the same column headers. Link to Google Sheets Guide page for setup.
  - **Spreadsheet Grid:** Built-in spreadsheet editor. Add rows directly, save as drafts, submit when ready.
- Draft management: Save/load/rename/delete drafts in the Spreadsheet tab
- Warning box: "Ensure your Excel file has the correct column headers. Columns are matched by name prefix — suffixes like '(comma separated)' are acceptable."

#### People Enrichment (`/docs/people-enrichment`)
- What it does (enrich known people with contact details — different from Bulk Search which starts from companies)
- Same 3 input methods (Excel, Google Sheets, Spreadsheet Grid)
- Required columns (different from bulk search — people-focused):

  | Column | Required | Notes |
  |--------|----------|-------|
  | Sr No | Yes | Row number |
  | Record Id | Yes | Unique identifier |
  | First Name | Yes | Contact's first name |
  | Last Name | Yes | Contact's last name |
  | Organization Domain | Yes | Company domain |
  | LinkedIn URL | No | LinkedIn profile URL (improves match accuracy) |
- What enrichment returns: mobile phone, direct phone, email, LinkedIn, seniority
- Credit costs per contact type
- Tip: "Previously enriched contacts are cached — you won't be charged twice for the same person within 6 months."

#### AI Staffing Chat (`/docs/ai-staffing-chat`)
- What it does: conversational AI that helps discover companies and contacts for staffing needs
- How to start: Select "AI Staffing" from Tools, type a query
- Example queries: "Find software companies in Berlin with 50-200 employees", "Show me marketing agencies in Munich"
- Rich results: company cards (with domain, location, employee count), contact cards (with available details)
- Conversation management: rename chats, delete old conversations, start new chats from sidebar
- Tip: "Be specific about location and company size for better results."

#### Recruiting Chat (`/docs/recruiting-chat`)
- What it does: AI-powered candidate search with enrichment
- How to start: Select "Recruiting" from Tools, describe the role you're hiring for
- Example queries: "Find senior React developers in Berlin", "Search for data scientists with Python experience in London"
- **Candidate flow:**
  1. Chat finds candidates (preview cards with name, title, LinkedIn)
  2. Select candidates via checkboxes
  3. Click "Enrich Selected" to get full contact details
  4. Enriched cards show: email, mobile phone, direct phone, seniority
- Auto-save: Enriched contacts with phone numbers are automatically saved to your master database
- Credit costs: Enrichment charges per contact type found
- Tip: "Include location in your search query — results are more accurate when location comes from evidence, not assumptions."

### Group 3: Platform

#### Results & Export (`/docs/results`)
- Where results appear: Results page in sidebar, or navigate after a search completes
- Viewing results: Expandable company rows → contacts + job listings nested inside
- Filtering: search by company name or file name
- Job listings: Collapsible section per company showing open positions
- **Excel export:** Download button exports results as `.xlsx`. File is named `{input_file}_processed.xlsx`. Contains all contacts and job data.
- Past searches: All completed searches listed with status, timestamp, input file name

#### Database (`/docs/database`)
- What it stores: Master database of all enriched contacts across all your searches and chat enrichments
- How contacts get there: Automatically from Bulk Search results, People Enrichment results, and Recruiting Chat enrichments
- Deduplication: Same person won't appear twice — matched by provider ID
- Searching: Filter and search contacts by name, company, email, phone

#### Analytics (`/docs/analytics`)
- What it shows: Credit usage over time, broken down by contact type
- Charts: Usage by type (Mobile Phone, Direct Phone, Email/LinkedIn, Jobs), time-based consumption
- Useful for: Understanding your team's usage patterns and credit burn rate

#### Credits (`/docs/credits`)
- **How credits work:** Your workspace has a shared credit pool. Every search or enrichment deducts credits based on what contact data is found.
- **Cost table:**

  | Contact Type | Credits |
  |---|---|
  | Mobile Phone | 4 |
  | Direct Phone | 3 |
  | Email / LinkedIn | 2 |
  | Job Listing | 1 |

- **Checking balance:** Settings page (Your Credits section) or Analytics page
- **Color-coded warnings:** Green (healthy), amber (running low), red (critically low)
- **What happens at zero:** Searches are blocked with a friendly message. Contact your admin for a top-up.
- **Cache benefit:** Previously enriched contacts don't cost credits again within 6 months
- Warning: "Credits are deducted when results are returned, not when searches are initiated."

#### Settings (`/docs/settings`)
- **Profile tab:** Display name, email (read-only)
- **Security tab:** Change password
- **Workspace:** Shows workspace name and your credits remaining
- Tip: "Check your credits here before running large bulk operations."

### Group 4: Admin

#### Workspace & Users (`/docs/admin`)
- **Admin-only notice:** This section is only relevant to workspace administrators.
- **User management:** View all users in your workspace, create new users (sends welcome email), delete users
- **Credit management:** View current workspace balance, top-up credits via dialog, view transaction history (all credits added/deducted with timestamps)
- **Workspace settings:** Workspace name, creation date, member count

---

## Reusable Content Components

These are the building blocks used across all doc sections:

### Tip Box
- Teal-themed (emerald background tint, emerald left border)
- Lightbulb icon + "Tip" label
- Used for best practices, pro tips

### Warning Box
- Amber-themed (amber background tint, amber left border)
- Alert triangle icon + "Note" label
- Used for gotchas, important caveats

### Table
- Dark-themed with header row (darker background)
- Alternating row tints optional
- Used for: column headers, credit costs, field descriptions

### Feature Card
- Small card with icon, title, one-liner
- Teal border on hover
- Links to doc section
- Used on Overview page only

### Inline Flow Diagram
- Simple horizontal arrow flow: `Step 1 → Step 2 → Step 3`
- CSS-only (flexbox with arrow separators)
- Used to show: Search → Results → Export, Chat → Enrich → Save to DB

### Code/Header Block
- Monospace, dark background
- Used to show exact column header names or format strings

---

## Technical Implementation

### File Structure

```
src/pages/DocsPage.tsx              — Main page component (layout: TOC + content + rail)
src/components/docs/
  DocsSidebar.tsx                    — Left TOC sidebar (pinned/unpinned state)
  DocsContent.tsx                    — Content renderer (takes section data, renders components)
  DocsRightRail.tsx                  — "On this page" sticky rail
  DocsTip.tsx                        — Tip box component
  DocsWarning.tsx                    — Warning box component
  DocsTable.tsx                      — Styled table component
  DocsFeatureCard.tsx                — Feature card component
  DocsFlowDiagram.tsx               — Inline flow diagram
  DocsNavFooter.tsx                  — Previous/Next navigation
src/data/docs/
  sections.ts                        — Section metadata (slug, title, group, icon, order)
  overview.tsx                       — Overview section content
  getting-started.tsx                — Getting Started content
  single-search.tsx                  — Single Search content
  bulk-search.tsx                    — Bulk Search content
  people-enrichment.tsx              — People Enrichment content
  ai-staffing-chat.tsx               — AI Staffing Chat content
  recruiting-chat.tsx                — Recruiting Chat content
  results.tsx                        — Results & Export content
  database.tsx                       — Database content
  analytics.tsx                      — Analytics content
  credits.tsx                        — Credits content
  settings.tsx                       — Settings content
  admin.tsx                          — Admin content
```

### Routing

```tsx
// In App.tsx
<Route path="/docs" element={<DocsPage />}>
  <Route index element={<Navigate to="/docs/overview" replace />} />
  <Route path=":sectionSlug" element={<DocsPage />} />
</Route>
```

### State Management

- **TOC pinned state:** `useState` with `localStorage` persistence (key: `docs-toc-pinned`, default: `true`)
- **Active section:** Derived from URL param `:sectionSlug`
- **Right rail active heading:** IntersectionObserver on h2 elements within content area
- **Search filter:** Local `useState` on TOC — filters `sections` array by title substring

### Content Approach

Each section is a `.tsx` file that exports a React component. This keeps content co-located with any interactive elements (expandable tables, flow diagrams) while staying type-safe. The `DocsContent` component renders the active section's component.

```tsx
// Example: src/data/docs/overview.tsx
export default function OverviewSection() {
  return (
    <>
      <p>Bravoro is a lead enrichment and automation platform...</p>
      <DocsFeatureCardGrid features={FEATURES} />
      <DocsCreditTable />
    </>
  );
}
```

### Visuals

Selective visuals included:
- **Overview:** Feature cards grid, credit cost table
- **Bulk Search:** Required columns table (the 12 headers)
- **People Enrichment:** Required columns table
- **Credits:** Credit cost table, color-coded balance examples
- **Recruiting Chat:** Inline flow diagram (Search → Select → Enrich → Save)
- **Getting Started:** Simple dashboard orientation diagram (sidebar items mapped to descriptions)

No screenshots in v1 — all visuals are rendered as styled components (tables, cards, diagrams).

---

## Entry Points

1. **Avatar menu:** "Documentation" item with BookOpen icon → navigates to `/docs`
2. **Direct URL:** `/docs` or `/docs/:sectionSlug`
3. **Future:** Could add contextual "?" help icons on feature pages that link to relevant doc section

---

## Out of Scope

- API documentation (no public API exists)
- Video tutorials
- Changelog / release notes
- Community / support forums
- Multi-language / i18n
- Full-text search across doc content (TOC filter is sufficient for 13 sections)
