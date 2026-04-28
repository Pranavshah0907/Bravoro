# Bravoro Frontend Redesign — Autonomous Brief

**Audience:** A future Claude Code session with the `taste-skill` family installed.
**Date:** 2026-04-28
**Branch to work on:** `feat/light-theme` (already deployed to `bravoro-test.vercel.app`).

---

## TL;DR for the next agent

You are doing a **deep visual + structural redesign** of the Bravoro app. A previous
session converted dark→light theme tokens and removed forced-dark wrappers — that
work is good and shipped. **You should not redo the token plumbing.** What you
should do: make the app actually feel premium and trustworthy. Right now it reads
as a generic Tailwind/shadcn SaaS, which is the user's exact complaint.

You have **full autonomy** within the constraints below. No need to check in for
permission on layout, typography, spacing, hierarchy, or component design.
Run the screenshot loop heavily, commit in logical chunks, and ship a real design.

---

## What Bravoro is

A B2B lead-enrichment + recruiting SaaS. Users are salespeople, BDRs, founders,
and in-house recruiters. Core value: *"find the right decision-maker, enrich
their contact, run outreach"*. The product currently lives at:

- `app.bravoro.com` — production (branch `main`, untouched)
- `bravoro-test.vercel.app` — preview of `feat/light-theme` (your target)

Brand: deep teal (`#06464a` / `#009da5` / `#58dddd`) on warm cream
(`#fbf8f3`) for light mode, near-black (`#060f0f`) for dark mode. These tokens
are already wired in `src/index.css`. **Don't change the brand palette.** Use
it more thoughtfully.

---

## Current visual problems (the brief from the user)

> *"Why doesn't the website feel rich? Doesn't feel trustworthy. Is it the
> animations? Is it too much color gradient? Doesn't seem pleasant for some
> reason."*

Concrete diagnosis from the last session:

1. **Card-uniformity.** Dashboard hero is 5 equal-width cards in a row, each
   `icon → title → description`. Looks like every YC demo. Equal cards = no
   hierarchy = no point of view.
2. **Mono-teal everywhere.** Sidebar / button / link / badge / accent / focus
   ring / chart / hover — all the same teal. Reads as "one color from a
   palette generator." Premium products use brand color sparingly.
3. **No editorial moments.** One font (Plus Jakarta Sans), uniform spacing
   rhythm, no "wow, that's intentional" hero. Stripe / Linear / Notion / Vercel
   each have at least one signature moment per surface.
4. **The atmospheric glow fights trust.** The radial teal blob behind the
   dashboard signals "we tried to design this" — opposite of the calm
   confidence a B2B data tool should signal.
5. **Cards lack real depth in light mode.** White-on-cream needs layered
   shadow + considered border + intentional surface elevation; we have a
   thin border and a flat shadow.
6. **Token-only conversion left structural problems untouched.** The previous
   session's instruction was "don't change positions" — that's now lifted.
   You can move things, restructure, redesign.

---

## What "rich and trustworthy" means *for Bravoro specifically*

This is not Awwwards bait. This is enterprise data tooling. Trust signal trumps
visual flair. Your North Star comparisons:

- **Stripe Dashboard** — calm authority, generous whitespace, real data over
  decoration, near-zero gradients, signature serif/sans interplay.
- **Linear** — typographic discipline, restrained palette, considered density.
- **Vercel** — confident black/white, almost no color until it's earned.
- **Mercury** — fintech-grade trust through restraint, not through effects.

Anti-patterns to avoid:

- Glassmorphism for its own sake
- Gradient-on-everything
- Cards-inside-cards-inside-cards
- Hero illustrations / 3D blobs / orbs
- "Cosmic" / "starfield" / "aurora" anything
- Identical card grids
- Default Tailwind palette anywhere visible (indigo-500, slate-900, etc.)

---

## Skills to invoke

You have nine `taste-skill` skills installed at `~/.claude/skills/`. Ranked by
fit for this job:

1. **`redesign-existing-projects`** — primary. Built exactly for "improve an
   existing UI by auditing and fixing weak layout, spacing, hierarchy, styling."
2. **`design-taste-frontend`** — the high-agency default. Pair with redesign
   for execution.
3. **`high-end-visual-design`** — for the calm/expensive feel we want.
4. **`full-output-enforcement`** — invoke if you find yourself getting lazy
   or skipping pages.

Don't stack `gpt-taste`, `minimalist-ui`, `industrial-brutalist-ui`, or
`stitch-design-taste` on top — they pull in different directions. Pick one
visual direction and commit.

---

## Scope

### In scope (full autonomy — no need to ask)

- **Dashboard `/dashboard`** — the welcome hero + the 5 enrichment-method
  cards. This is the user's first impression and the worst offender for
  generic-SaaS feel. Free to redesign the layout entirely.
- **Each enrichment view** (`?tab=manual` / `bulk` / `people_enrichment` /
  `ai_staffing` / `recruiting_chat`) — section ordering, card layout,
  micro-typography, spacing, depth.
- **Results page `/results`** — table-heavy, currently looks generic admin.
  Make it feel like a Linear inbox, not a Bootstrap table.
- **Admin `/admin`** — two-pane layout. The right pane stat cards are bland.
  Workspace tree could feel more like a Notion sidebar.
- **Analytics `/analytics`** — Recharts visuals, palette, card framing.
- **Database `/database`** — list-heavy, lots of opportunity for typographic
  hierarchy.
- **Settings `/settings`** + **Dev Tools `/dev-tools`** — light polish.
- **Docs `/docs/*`** — already converted to light mode; do an editorial pass
  on typography (drop caps? aside callouts? better code-block styling?).
- **Sidebar (`AppSidebar.tsx`)** — feels invisible in light. Could earn its
  presence.
- **Typography system** — introduce a serif display face if it earns its
  keep. Consider a tighter sans for body. The current Plus Jakarta Sans is
  fine but bland.
- **Spacing tokens** — establish a deliberate rhythm beyond Tailwind defaults.
- **Shadows / surface elevation system** — light mode currently has
  near-zero depth. Build a real elevation scale.
- **Hover / focus / active states** — every interactive element should have
  considered states.
- **Charts** — Recharts series colors, axis treatments, tooltip design.

### Out of scope (do not touch)

- **Auth pages** (`/`, `/reset-password`, landing page) — always-dark, brand
  front door per the spec. Verify dark-class wrapper still works after your
  changes; don't restyle.
- **Supabase queries, edge functions, RLS policies, migrations** — pure
  data/backend. Don't touch even if you see something weird.
- **Excel / PDF export logic** — `src/lib/exportPdf.ts`, XLSX, etc.
- **n8n webhook integration** — search workflows.
- **`src/integrations/supabase/client.ts`** and the auth flow.
- **Route definitions in `App.tsx`** — leave URL paths alone.
- **Functional behavior of forms** — you can restyle Single Search /
  Bulk Search etc., but their submission logic, validation, payload shape
  must not change.

### Touchable but careful (announce in commit message what changed)

- Component file structure / new components → fine, but maintain the same
  named exports so call-sites still work.
- `index.css` — already retuned for light. You may extend with new tokens
  (typography scale, elevation scale, motion easing curves). Don't change
  existing color tokens — they're production-stable.
- Adding fonts via Google Fonts CDN or a self-hosted fallback — fine.
  Update `index.html` `<link>` if you add web fonts.

---

## Hard constraints

1. **Type-check must pass.** `npx tsc --noEmit` clean before any commit.
2. **Dark mode must not regress.** Run `node screenshot-batch.mjs dark
   regression` after each major page redesign. Compare against baseline
   screenshots in `temporary screenshots/`.
3. **Auth/landing dark-mode rendering must not break.** The `dark` wrapper
   pattern on `<Auth>`, `<ResetPassword>`, etc. is load-bearing.
4. **Don't break the Supabase auth flow.** If you redesign `<UserAvatarMenu>`
   etc., keep the sign-out callback and theme toggle wired identically.
5. **Don't touch `app.bravoro.com`.** Production = `main` branch. Stay on
   `feat/light-theme`. Pushes auto-deploy to `bravoro-test.vercel.app`.
6. **Commit in logical chunks**, not one giant blob. Suggested cadence:
   token + foundation; sidebar + chrome; dashboard hero; per-page passes.

---

## Validation workflow (already wired)

Two scripts in repo root:

```bash
# Take screenshots of every major page in one theme
export PATH="/c/Program Files/nodejs:$PATH" && export MSYS_NO_PATHCONV=1
node screenshot-batch.mjs light pass-N            # all pages, light, 1440x900
node screenshot-batch.mjs dark dark-regress-N     # dark mode regression
node screenshot-batch.mjs light mobile-N --mobile # mobile viewport
```

Screenshots land in `temporary screenshots/screenshot-<n>-<prefix>-<page>.png`.
Read them with the Read tool to actually look at them — don't rely on
descriptions. The previous session has ~145 baseline + pass1-6 screenshots
already there for before/after comparison.

The dev server runs at `http://localhost:8080` (auto-started by Vite). Login
credentials are wired into the screenshot scripts.

For deploys: every push to `feat/light-theme` auto-deploys to
`bravoro-test.vercel.app` within ~90 seconds. Production branch was set via
Vercel API in the previous session.

---

## Suggested execution order

1. **Read this brief + the existing spec** at
   `docs/superpowers/specs/2026-04-23-light-theme-design.md` and
   `temporary screenshots/light-theme-defects.md`.
2. **Read the latest screenshots** (pass5/pass6 from the previous session) to
   see what the current state actually looks like.
3. **Invoke `redesign-existing-projects`**. Let it audit. Take notes.
4. **Establish design system extensions** first: typography scale, elevation
   scale, motion curves, density tokens. These are foundation — touch once,
   benefit everywhere.
5. **Redesign the Dashboard hero**. Highest impact, most generic, worst
   first impression. Don't ship until you'd put it on Bravoro's homepage.
6. **Page-by-page deep pass**, in order of user impact:
   Dashboard tabs → Results → Admin → Analytics → Database → Docs → Settings
   → DevTools.
7. **Cross-cutting polish**: hover states, focus rings, transitions,
   keyboard navigation, empty states, loading states, error states.
8. **Mobile pass**.
9. **Final dark-mode regression**.
10. **Type check + commit + push** (auto-deploys).

---

## What done looks like

- A user opening `bravoro-test.vercel.app` for the first time pauses for two
  seconds longer than they did before.
- The Dashboard hero gives a clear answer to "what is this product" without
  saying it.
- No two pages feel like they were built by different people, but no two
  pages feel like the same template either.
- A Stripe / Linear designer could screenshot any page and not be embarrassed
  to share it.
- The user (Pranav) doesn't have to ask "why doesn't this feel rich" again.

---

## Notes from the previous session that matter

- `src/components/BravoroWordmark.tsx` — inline SVG with `currentColor`,
  uses `accentColor` prop for the V crossbar. Use this everywhere, not the
  raw `bravoro-logo.svg` `<img>`.
- `src/components/EnrichmentCard.tsx` — currently has a top-bleed accent
  layer for light mode. Either commit to that or replace it cleanly.
- `index.css` `.light` block — already has `--hero-gradient`,
  `--glow-strength`, layered shadows. You may add more variables; do not
  remove the existing ones (used in many components).
- Screenshot script numbering is monotonic — never resets. Don't worry
  about overlap with the previous session's screenshots.

Good luck. Make it real.
