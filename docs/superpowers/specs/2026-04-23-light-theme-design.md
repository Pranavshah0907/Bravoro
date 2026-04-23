# Light Theme — Design Spec

**Date:** 2026-04-23
**Status:** Approved (autonomous execution)
**Owner:** Pranav Shah

## Goal

Add a fully-realized light theme to the Bravoro app, selectable from a theme toggle in the user avatar menu. The theme must:

- Apply consistently across every authenticated page (dashboard, results, admin, analytics, database, dev tools, settings, docs)
- Persist per-user across devices (Supabase sync)
- Respect OS preference when set to "Auto"
- Leave the unauthenticated auth/login page always-dark (brand front door)

## Visual Direction

Decided through visual brainstorming on 2026-04-23.

### Theme: Warm Cream

| Token | Light | Dark (existing) |
|---|---|---|
| Background | `#fbf8f3` (warm off-white cream) | `#060f0f` (near-black with teal breath) |
| Surface (cards) | `#ffffff` (pure white) | `#0a1414` |
| Surface elevated (popovers, dialogs) | `#ffffff` with subtle shadow | `#0d1818` |
| Sidebar | `#f5f1e8` (slightly warmer than bg) | `#060c0c` |
| Foreground (body text) | `#1a1714` (warm near-black) | `#e4f4f4` |
| Foreground muted | `#6e6253` (warm gray) | `#7ca8a8` |
| Foreground subtle | `#8a7e6f` (warm light gray) | `#5a7878` |
| Border | `#ece4d4` (cream-tinted) | `#0f2424` |
| Input bg | `#fbf8f3` (matches body) | `#0d1e1e` |

### Brand Teal in Light Mode

The bright cyan (`#58dddd`) used in dark mode is too cold against warm cream. In light mode, teal shifts to a deeper, more grounded variant:

| Token | Light | Dark |
|---|---|---|
| Primary | `#06464a` (deep harmonious teal) | `#009da5` (Ocean Blue) |
| Primary hover | `#052f32` | `#00868c` |
| Accent | `#00868c` (mid teal — darker than dark-mode accent for cream contrast) | `#58dddd` (Cardinal Blue) |
| Accent muted bg | `#d8e8e3` (pale teal-green for badges, pills) | `#0f2828` |
| Caretta (special CTA) | `#06464a` | `#00686d` |
| Ring (focus) | `#06464a` | `#58dddd` |

### Functional Colors

These stay constant or shift slightly per theme for AAA contrast:

| Token | Light | Dark |
|---|---|---|
| Destructive | `#dc2626` (red-600) | `#dc2626` |
| Destructive bg | `#fee2e2` | `#1a0808` |
| Success | `#15803d` (green-700) | `#22c55e` (green-500) |
| Warning | `#b45309` (amber-700) | `#f59e0b` (amber-500) |

### Shadows

Light mode uses warm shadows tinted with the cream's brown undertone:

| Token | Light | Dark |
|---|---|---|
| Soft | `0 4px 20px hsl(35 30% 25% / 0.06)` | `0 4px 20px hsl(183 100% 10% / 0.5)` |
| Medium | `0 8px 32px hsl(35 30% 25% / 0.10)` | `0 8px 32px hsl(183 100% 10% / 0.6)` |
| Strong | `0 16px 48px hsl(35 30% 25% / 0.14)` | `0 16px 48px hsl(183 100% 10% / 0.7)` |
| Glow | `0 0 40px hsl(180 50% 50% / 0.15)` | `0 0 40px hsl(180 66% 61% / 0.2)` |
| Card | `0 2px 8px hsl(35 30% 25% / 0.06)` | `0 4px 24px hsl(183 100% 3% / 0.8)` |

### Charts (Recharts)

Chart series colors stay theme-agnostic — they're content, not chrome:

```
chart-1: 183 100% 32%  (teal)
chart-2: 280 60% 50%   (purple)
chart-3: 40 85% 50%    (amber)
chart-4: 340 65% 50%   (pink)
chart-5: 145 55% 40%   (green)
```

## Toggle UI

Three-state segmented control inside the avatar popover, between "Documentation" and "Settings":

```
┌─────────────────────────────┐
│ 🎨  Theme                   │
│         ☀  Light │ 🖥 Auto │ 🌙 Dark│  ← active state highlighted
└─────────────────────────────┘
```

- Width: pill aligns right within the menu row
- Active state: lighter background (`bg-white/10` on dark popover, `bg-foreground/8` on light)
- Inactive: opacity-60
- Click → updates theme immediately (no confirmation), animation handled by CSS transitions

## Persistence Strategy

### Storage layers

1. **`localStorage["bravoro-theme"]`** → set immediately on user click. Read on app boot before first paint to prevent flash.
2. **`profiles.theme_preference` (Supabase)** → enum `'light' | 'dark' | 'system'`, default `'system'`. Synced on change.

### Sync flow

- **On theme change:** Set localStorage immediately + fire-and-forget update to Supabase (don't block UI).
- **On login:** After session is established, fetch `theme_preference` from `profiles`. If it differs from localStorage, update localStorage and re-apply theme.
- **On logout:** Don't clear localStorage — next user that logs in will overwrite it from their own profile.
- **First-time / never-toggled:** Default to `'system'` (follows OS `prefers-color-scheme`).

### Schema change

```sql
ALTER TABLE profiles
ADD COLUMN theme_preference text NOT NULL DEFAULT 'system'
CHECK (theme_preference IN ('light', 'dark', 'system'));
```

No RLS policy changes needed — existing profile policies cover this column.

## Auth Page Treatment

The auth/login page (`src/pages/Auth.tsx`), reset-password page, and forgot-password dialog **stay always-dark** regardless of theme setting. Implementation: these components apply `dark` class to a wrapper div (or use `dark:` Tailwind variants explicitly), bypassing the global theme.

The animated rotating words ("Search · Enrich · Connect") and layered beam animations are tuned for dark backgrounds and lose their drama in light. Treat auth as the brand front door — same approach as Linear, Vercel, Stripe.

## Architecture

### Theme Provider

Use the existing `next-themes` package (already in deps, currently unused).

```tsx
// src/main.tsx (or App.tsx)
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  storageKey="bravoro-theme"
  enableSystem
  disableTransitionOnChange={false}
>
  <App />
</ThemeProvider>
```

### CSS Token Strategy

Existing `index.css` already has `:root` (dark) and `.light` selectors. Strategy:

1. **Keep `:root` exactly as it is** — dark tokens stay in `:root`. This preserves current behavior as the no-class fallback (e.g., before `next-themes` script runs, or when nested in a wrapper with no explicit class).
2. **Add a `.dark` selector** that mirrors `:root`'s dark tokens identically. This is required so the auth-page-isolation pattern works: when `<html>` has `.light`, wrapping a subtree in `<div class="dark">` needs `.dark` to be a defined selector to re-establish dark tokens inside that subtree.
3. **Fully rewrite the `.light` block** with the new cream tokens above (current block is an incomplete stub). Every CSS variable defined in `:root` must have a corresponding override in `.light` — no token may leak its dark value through to light mode.

Because all three selectors target `<html>` with equal specificity, ordering in the file matters: keep `:root` first, then `.dark`, then `.light`. Last rule wins when classes match.

### Supabase Sync Hook

```tsx
// src/hooks/useThemeSync.ts
export function useThemeSync() {
  const { theme, setTheme } = useTheme();

  // On mount: pull theme from Supabase if logged in
  useEffect(() => { /* fetch profile.theme_preference, setTheme if differs */ }, []);

  // On theme change: push to Supabase if logged in
  useEffect(() => { /* update profiles.theme_preference */ }, [theme]);
}
```

Mounted once at the app root, inside `ThemeProvider` but outside auth-required guards (gracefully no-ops when logged out).

### Auth Page Isolation

The auth page wraps its content in a `<div className="dark">` that re-asserts the dark theme tokens regardless of root class. This works because Tailwind's `dark:` variants and our CSS variables both respect the closest ancestor with `.dark` class.

Alternative considered: Use route-aware logic in `ThemeProvider` to force dark on `/`, `/reset-password`. Rejected — couples auth state to provider, harder to debug.

## Refactor Scope

The current codebase has approximately:
- **510** hardcoded hex color references (e.g., `bg-[#1a3535]`, `text-[#e4f4f4]`)
- **181** hardcoded Tailwind palette references (e.g., `bg-emerald-400`, `text-slate-900`)

across **43+ component/page files**.

Each will be triaged into one of three buckets:

| Bucket | Action | Examples |
|---|---|---|
| **Chrome** (responds to theme) | Replace with semantic token (`bg-card`, `text-foreground`, etc.) | Sidebar bg, popover bg, input borders, card backgrounds, text colors, divider lines |
| **Brand-locked** (constant across themes) | Keep hardcoded but use the new dual-mode brand variables (e.g., light-mode-aware emerald/teal) | Logo gradient, primary CTA gradients, brand badges |
| **Content** (truly constant) | Keep as-is, no change | Chart series colors, status badges, destructive red, error messages |

### Phased execution (single session)

**Phase 1 — Foundation + chrome (load-bearing)**
- Add `next-themes` provider to App.tsx
- Add Supabase migration + sync hook
- Rewrite `index.css` with new light/dark tokens (cream + deep teal)
- Convert `src/components/ui/*` (shadcn primitives — already mostly use tokens, audit for hardcoded leaks)
- Convert `AppSidebar.tsx`, `MobileHeader.tsx`, `MobileTabBar.tsx`, `UserAvatarMenu.tsx`
- Add 3-state toggle to `UserAvatarMenu.tsx`
- Convert `Dashboard.tsx` (background gradients, layered glows, enrichment cards)
- Convert `SupportChatWidget.tsx`, `UpdateBanner.tsx`, `DesktopRecommendedBanner.tsx`

**Phase 2 — Page-by-page conversion**
- `Results.tsx` (1,450 lines — biggest single page)
- `Admin.tsx` (2,750 lines — biggest overall)
- `UsageAnalytics.tsx`
- `UserDatabase.tsx`
- `DevTools.tsx`
- `Settings.tsx`
- `GoogleSheetsGuide.tsx`
- `DocsPage.tsx` + all `src/data/docs/*.tsx` files
- `src/components/docs/*` components

**Phase 3 — Feature components**
- `ManualForm.tsx`
- `ExcelUpload.tsx`, `SpreadsheetGrid.tsx`, `SheetsManager.tsx`
- `BulkPeopleEnrichment.tsx`, `PeopleEnrichmentGrid.tsx`, `PESheetsManager.tsx`
- `AIChatInterface.tsx`, `chat/*`, `ai-chat/*`
- `CompanyBrowserDialog.tsx`, `MasterDatabaseTab.tsx`, `WorkspaceSearches.tsx`, `ProcessingStatus.tsx`
- `EnrichmentCard.tsx`, `PasswordReset.tsx`

**Phase 4 — Verification + polish**
- Light-mode screenshot pass: load each major page in light mode, screenshot, identify any leftover hardcoded colors, fix
- Dark-mode regression pass: load each major page in dark, confirm no visual change vs current
- Final grep audit: search for `bg-[#`, `text-[#`, `border-[#`, `from-[#`, `to-[#` and any remaining `bg-emerald-`, `text-slate-9`, etc.

The toggle is fully wired and visible from Phase 1 onward. Because the entire conversion happens in one continuous session, the toggle never ships in a half-converted state to a real user.

## Implementation Order Within a Component

For each file being converted:

1. Find every hardcoded color → triage into chrome / brand / content
2. Chrome: replace with the closest-matching semantic Tailwind class (`bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, etc.). If no token fits, use `bg-[hsl(var(--my-token))]` and add the new token to `index.css`.
3. Brand-locked: replace with the new dual-mode variant (e.g., `bg-primary` which switches between light/dark teal automatically)
4. Content: no change
5. Spot-check the file in dark mode visually (no regressions) before moving on

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Visual regressions in dark mode during conversion | Phase 4 dark-mode regression pass with screenshots; convert tokens in `.dark` block to match current `:root` exactly |
| Flash-of-wrong-theme on page load | `next-themes` injects a blocking script in `<head>` to set the class before first paint |
| Charts/Recharts using hardcoded fills | Use existing `--chart-1..5` CSS vars, audit chart props in Phase 2 |
| Custom CSS-in-JS (`bg-[#...]` Tailwind arbitrary values) hard to grep | Phase 4 includes a final grep audit for `bg-[#`, `text-[#`, `border-[#`, `from-[#`, `to-[#` |
| `index.css` `.dark` semantic shift breaks specificity | Test both selectors mounted on `<html>` (next-themes default behavior) |
| Auth page light leaks if user navigates back to `/` after login | Auth page enforces `dark` class on its root element — works regardless of html-level theme |

## Success Criteria

- [ ] Toggle in avatar menu cycles Light / Auto / Dark
- [ ] Theme persists across page reloads
- [ ] Theme persists across devices (logged in)
- [ ] First-time user sees theme matching their OS preference
- [ ] Auth page is dark on every device, every theme setting
- [ ] All authenticated pages render correctly in both light and dark — no broken contrast, no hardcoded color leaking through
- [ ] No visual regression in dark mode vs current behavior
- [ ] No flash of wrong theme on initial load
- [ ] Type-check passes (`tsc --noEmit`)
- [ ] App boots and main user flows work in both themes (sidebar nav, avatar menu, dashboard tabs, single search, results page, admin view)

## Out of Scope

- Custom per-page theme overrides (e.g., "always show analytics in dark")
- High-contrast accessibility theme (separate effort if needed)
- Themed brand assets (logo PNG variants for light bg) — current SVG logo works on both
- Email template theming
- Sub-themes (e.g., user-customizable accent colors)
