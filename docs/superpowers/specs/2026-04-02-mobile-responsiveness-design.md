# Mobile Responsiveness Design Spec

**Date:** 2026-04-02
**Status:** Approved
**Problem:** The Bravoro app looks great on desktop/laptop but is unusable on mobile. The fixed sidebar layout eats 64–224px of a 375px mobile screen, leaving no room for content. Responsive Tailwind classes are used inconsistently across pages.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Option B — responsive where useful, "desktop recommended" for heavy data-entry | B2B SaaS users don't upload Excel on phones, but they check results and chat |
| Sidebar on mobile | Bottom Tab Bar (4 tabs) | Industry standard (Slack, LinkedIn, Notion). Thumb-friendly, always visible |
| Tab bar items | Search, Results, AI Chat, More | 4 tabs keeps icons large; "More" menu holds Settings, Analytics, DevTools, Admin |
| Desktop-only pages | Dismissible banner + content still renders | Non-blocking, lowest effort, lets users use page in a pinch |
| Breakpoint | `md:` (768px) — Tailwind default | Standard tablet/mobile split. No config changes needed |
| Architecture | CSS-first, same components | No separate mobile codebase. Tailwind responsive classes + `useIsMobile()` hook for JS decisions |

---

## Breakpoint Strategy

- **< 768px** — mobile layout: bottom tab bar, no sidebar, stacked single-column content
- **>= 768px** — desktop layout: existing sidebar, no changes whatsoever

All layout changes use Tailwind responsive prefixes (`md:`, `sm:`). The desktop layout is guaranteed untouched because mobile styles are the base and desktop overrides are added via `md:` prefix.

---

## Core Layout Changes

### 1. AppSidebar (`src/components/AppSidebar.tsx`)

- Add `hidden md:flex` to the root `<aside>` element (currently `flex flex-col`)
- This hides the entire sidebar below 768px and shows it as-is above 768px
- Zero changes to sidebar internals, pin behavior, or desktop appearance

### 2. Dashboard Main Content (`src/pages/Dashboard.tsx`)

- Change `ml-56`/`ml-16` to `ml-0 md:ml-56` / `ml-0 md:ml-16`
- Same for the fixed background overlay element
- Add `pb-20 md:pb-0` to main content to prevent bottom tab bar from covering content
- Add `pt-14 md:pt-0` to main content to account for mobile header bar

### 3. MobileTabBar (new: `src/components/MobileTabBar.tsx`)

- Fixed to bottom of screen, `block md:hidden`
- 4 tabs: Search (`/dashboard`), Results (`/results`), AI Chat (`/ai-chat`), More
- Active tab: emerald highlight matching brand
- "More" tab opens a slide-up sheet (using existing shadcn Sheet component) containing:
  - Settings (`/settings`)
  - Analytics (`/analytics`)
  - DevTools (`/dev-tools`)
  - Admin (`/admin`) — only shown for admin users
- Safe area: `pb-[env(safe-area-inset-bottom)]` for notched phones
- Height: ~60px + safe area
- Icons: Lucide icons (already in project) — Search, BarChart3, MessageSquare, MoreHorizontal

### 4. MobileHeader (new: `src/components/MobileHeader.tsx`)

- Fixed to top of screen, `block md:hidden`
- Shows: Bravoro logo icon (from `src/assets/Logo_icon_final.png`) + current page title + user avatar
- Height: ~56px
- Background: matches app theme (`bg-sidebar-background/95 backdrop-blur-xl`)
- Border bottom: `border-b border-sidebar-border/50`

### 5. Integration Point

There is no shared layout wrapper — each page renders `AppSidebar` independently. Rather than adding `MobileTabBar` + `MobileHeader` to every page file, we create a **`MobileShell`** wrapper component (`src/components/MobileShell.tsx`) that:
- Renders `MobileHeader` (hidden on desktop via `md:hidden`)
- Renders `MobileTabBar` (hidden on desktop via `md:hidden`)
- Wraps `children` with proper padding (`pt-14 pb-20 md:pt-0 md:pb-0`)

Each page that currently renders `AppSidebar` will also render `<MobileShell>` around its main content. This keeps the change per-page to ~3 lines instead of duplicating header/tabbar JSX everywhere.

---

## Page-Specific Adaptations

### Fully Responsive Pages

**Landing Page (`LandingV2.tsx`)**
- Already mostly responsive via `clamp()`. Minor fixes:
  - Nav: reduce fixed padding on mobile (`padding: 12px 16px` below md)
  - Ensure touch targets are >= 44px
  - Test hero section at 375px width

**Login / Signup / Password Reset**
- Already form-based. Ensure:
  - Max-width container doesn't overflow
  - Form inputs are full-width on mobile
  - Buttons are full-width on mobile

**Results (`Results.tsx`)**
- Result cards: stack vertically (likely already happening with grid responsive classes)
- Result detail panel: if master-detail, stack vertically on mobile (detail below list, or navigate to detail view)
- Tables: wrap in `overflow-x-auto` for horizontal scroll
- Search/filter bar: stack filters vertically

**AI Chat (`AIChatInterface.tsx`)**
- Natural mobile fit — chat UIs are mobile-native
- Messages: full-width with appropriate padding
- Input bar: fixed above bottom tab bar (not behind it)
  - Needs `bottom: 60px` (tab bar height) + safe area on mobile
- Rich message cards (companies, contacts): stack vertically, full-width
- Contact selection badges: horizontally scrollable

**Settings (`Settings.tsx`)**
- Forms stack single-column
- Full-width inputs on mobile
- Adequate touch targets on buttons/toggles

**Analytics (`UsageAnalytics.tsx`)**
- Charts already resize via responsive containers
- Stat cards: stack 1-column on mobile (likely already `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`)
- Date range picker: full-width on mobile

**DevTools (`DevTools.tsx`)**
- Stack panels vertically
- Scrollable content areas
- Full-width on mobile

### Desktop-Recommended Pages (Dismissible Banner)

**DesktopRecommendedBanner component (`src/components/DesktopRecommendedBanner.tsx`)**
- Only renders when `useIsMobile()` returns true
- Small banner at top of page content: "Best on desktop — this page has large tables that work better on a wider screen" + dismiss X button
- Dismissal stored in `sessionStorage` (key per page, reappears next session)
- Brand-styled: emerald border, dark green background, matching existing toast/alert patterns

**Pages that get the banner:**
- Dashboard / Single Search (ManualForm) — banner shown, forms still usable (stack single-column)
- Bulk Search (ExcelUpload) — banner shown, upload cards stack vertically, SpreadsheetGrid gets `overflow-x-auto` wrapper
- Bulk People Enrichment — banner shown, same treatment
- Admin — banner shown, master-detail stacks vertically

---

## Shared Utilities

### `useIsMobile()` hook
- Already exists at `src/hooks/use-mobile.tsx`
- Returns `true` when viewport < 768px
- Used for: showing "More" sheet, rendering banner, adjusting input positioning in AI Chat

### Safe Area Handling
- Add to `tailwind.config.ts`: safe area utility if not present
- Tab bar: `padding-bottom: env(safe-area-inset-bottom)` for notched phones (iPhone X+)
- Alternatively use a fixed `pb-4` as a simpler fallback

### Page Title Context
- `MobileHeader` needs to know the current page title
- Use `useLocation()` from react-router + a simple path-to-title map
- No new context or state management needed

---

## What We Are NOT Doing

- No separate mobile app, PWA, or native wrapper
- No changes to Supabase, edge functions, RLS, or any backend
- No changes to desktop layout above 768px — guaranteed by Tailwind responsive prefix approach
- No new routes or pages
- No JavaScript-based layout switching (CSS-first)
- No refactoring of existing components beyond adding responsive classes
- No changes to data logic, API calls, or state management

---

## File Change Summary

| File | Change Type |
|---|---|
| `src/components/AppSidebar.tsx` | Modify — add `hidden md:flex` |
| `src/pages/Dashboard.tsx` | Modify — responsive margins, add MobileHeader + MobileTabBar |
| `src/components/MobileTabBar.tsx` | **New** — bottom tab bar component |
| `src/components/MobileHeader.tsx` | **New** — mobile top header |
| `src/components/DesktopRecommendedBanner.tsx` | **New** — dismissible "best on desktop" banner |
| `src/pages/Results.tsx` | Modify — responsive stacking, overflow-x-auto on tables |
| `src/components/AIChatInterface.tsx` | Modify — input positioning above tab bar |
| `src/pages/Settings.tsx` | Modify — responsive form stacking |
| `src/pages/UsageAnalytics.tsx` | Modify — responsive stat cards |
| `src/pages/DevTools.tsx` | Modify — responsive panel stacking |
| `src/pages/Admin.tsx` | Modify — add banner, responsive stacking |
| `src/pages/ExcelUpload.tsx` (or parent) | Modify — add banner, overflow wrapper |
| `src/pages/BulkPeopleEnrichment.tsx` | Modify — add banner |
| `src/pages/ManualForm.tsx` (or parent) | Modify — add banner |
| `src/components/MobileShell.tsx` | **New** — wrapper with MobileHeader + MobileTabBar + padding |
| `src/pages/landing/LandingV2.tsx` | Modify — minor padding/touch-target fixes |
| `src/pages/Auth.tsx` / `src/pages/ResetPassword.tsx` | Modify — minor responsive fixes |
| `tailwind.config.ts` | Possibly modify — safe area plugin if needed |

---

## Implementation Order

**Sprint 1 — Foundation (core layout)**
1. Hide sidebar on mobile (`AppSidebar.tsx`)
2. Fix Dashboard.tsx margins for mobile
3. Build MobileHeader component
4. Build MobileTabBar component (with "More" sheet)
5. Build MobileShell wrapper component
6. Integrate MobileShell into all pages that use AppSidebar
7. Test: app renders correctly on mobile AND desktop is unchanged

**Sprint 2 — Fully responsive pages**
8. Fix Landing page minor issues (src/pages/landing/LandingV2.tsx)
9. Fix Auth/ResetPassword pages
9. Make Results page responsive
10. Make AI Chat responsive (input above tab bar)
11. Make Settings page responsive
12. Make Analytics page responsive
13. Make DevTools page responsive

**Sprint 3 — Desktop-recommended pages**
14. Build DesktopRecommendedBanner component
15. Add banner to Dashboard/ManualForm
16. Add banner + overflow wrapper to Bulk Search/SpreadsheetGrid
17. Add banner to Bulk People Enrichment
18. Add banner to Admin page

**Sprint 4 — Polish & testing**
19. Test all pages at 375px, 414px, 768px widths
20. Test safe area on notched phone mockup
21. Verify desktop is completely unchanged at 1024px+
22. Fix any overflow, text-wrapping, or touch-target issues found in testing
