# CLAUDE.md — Bravoro Project Rules

## Project Nature
This is a **full-stack SaaS product** (Bravoro — lead enrichment & automation), not just a frontend design project. Work spans:
- Feature implementation (React components, Supabase edge functions, data logic)
- Backend/data work (Supabase DB, RLS, edge functions, n8n webhook integration)
- UI/UX design (new pages, components, visual polish)
- Tooling (Excel/PDF export, API integrations)

Treat every task for what it actually is before choosing which skill (if any) to invoke.

---

## Available Skills — When to Use Each

| Skill | Invoke when... |
|---|---|
| `frontend-design` | Building a **new page, section, or component from scratch** where visual design quality matters — landing pages, marketing sections, new dashboard cards, empty states. NOT for bug fixes, logic changes, or adding a column to a table. |
| `ui-ux-pro-max` | Designing or significantly redesigning UI with specific style requirements — glassmorphism, bento grid, dark mode, complex layouts. Use alongside `frontend-design` for ambitious visual work. |
| `mcp__magic__21st_magic_component_builder` | Generating a polished, ready-made UI component (button, modal, card, chart) when you need a specific pattern quickly. |
| `update-config` | Changing Claude Code settings, hooks, permissions, or MCP servers in `settings.json`. |
| `claude-api` | Building features that use the Anthropic/Claude API or Agent SDK directly. |
| `simplify` | After finishing a feature — review changed code for quality, redundancy, and correctness. |

**Do NOT invoke any skill for:**
- Bug fixes in existing components
- Adding/changing data logic (filtering, sorting, mapping)
- Supabase queries, edge functions, migrations
- Excel/PDF export changes
- API/webhook integration work
- TypeScript type changes
- Any task that is primarily logic, not visual design

---

## Skill Usage Rules
- Only invoke a skill when the task **clearly matches** its description above.
- Do not invoke `frontend-design` or `ui-ux-pro-max` just because a file ends in `.tsx`.
- Never invoke a skill for a task that is already in progress or nearly done.
- One skill invocation per task is enough — do not stack multiple design skills unless the task genuinely needs both.

---

## Reference Images
- If a reference image is provided: match layout, spacing, typography, and color exactly. Swap in placeholder content (images via `https://placehold.co/`, generic copy). Do not improve or add to the design.
- If no reference image and design work is needed: design from scratch with high craft (see guardrails below).
- Screenshot your output, compare against reference, fix mismatches, re-screenshot. Do at least 2 comparison rounds. Stop only when no visible differences remain or user says so.

---

## Local Server
- **This is a React/Vite app — NOT a static HTML project.**
- Dev server: `export PATH="/c/Program Files/nodejs:$PATH" && npm run dev` → runs at `http://localhost:8080`
- If port 8080 is taken, Vite auto-assigns the next free port (e.g. 8083). Check terminal output.
- If the server is already running, do not start a second instance.
- **Dashboard requires Supabase auth** — headless browser cannot log in. For screenshotting dashboard UI, create a standalone static HTML preview page, serve it with a one-liner Node server on port 3002, screenshot that, then delete the preview file.
  - One-liner server: `node -e "const h=require('http'),fs=require('fs'),p=require('path');h.createServer((q,r)=>{let f=p.join('.',q.url==='/'?'/preview.html':q.url);fs.readFile(f,(e,d)=>{r.writeHead(e?404:200,{'Content-Type':'text/html'});r.end(e?'Not found':d)});}).listen(3002,()=>console.log('ok'));"`

---

## Screenshot Workflow
- Puppeteer is installed at `C:\Users\prana\AppData\Roaming\npm\node_modules\puppeteer`.
- **Screenshot command:** `node screenshot.mjs http://localhost:8080` (or port 3002 for static preview pages)
- Screenshots saved to `./temporary screenshots/screenshot-N.png` (auto-incremented, never overwritten).
- Optional label: `node screenshot.mjs http://localhost:8080 label` → `screenshot-N-label.png`
- `screenshot.mjs` lives in the project root. Use it as-is.
- After screenshotting, read the PNG from `temporary screenshots/` with the Read tool.
- When comparing, be specific: "heading is 32px but reference shows ~24px", "card gap is 16px but should be 24px"
- Check: spacing/padding, font size/weight/line-height, colors (exact hex), alignment, border-radius, shadows, image sizing

---

## Output Defaults (design work only)
- Single `index.html` file, all styles inline, unless user says otherwise
- Tailwind CSS via CDN: `<script src="https://cdn.tailwindcss.com"></script>`
- Placeholder images: `https://placehold.co/WIDTHxHEIGHT`
- Mobile-first responsive

---

## Brand Assets
- Always check the `brand_assets/` folder before designing. It may contain logos, color guides, style guides, or images.
- If assets exist there, use them. Do not use placeholders where real assets are available.
- Logo: `src/assets/Logo_icon_final.png` (B icon), `src/assets/bravoro-logo.svg` (full logo)
- Brand primary: deep teal (`#06191a` dark bg, `#1a3535` surfaces, emerald-300/400 accents)

---

## Anti-Generic Design Guardrails (apply only when doing design work)
- **Colors:** Never use default Tailwind palette (indigo-500, blue-600, etc.). Use Bravoro brand teal and derive from it.
- **Shadows:** Never flat `shadow-md`. Use layered, color-tinted shadows with low opacity.
- **Typography:** Never same font for headings and body. Apply tight tracking (`-0.03em`) on large headings, generous line-height (`1.7`) on body.
- **Gradients:** Layer multiple radial gradients. Add grain/texture via SVG noise filter for depth.
- **Animations:** Only animate `transform` and `opacity`. Never `transition-all`. Use spring-style easing.
- **Interactive states:** Every clickable element needs hover, focus-visible, and active states.
- **Spacing:** Intentional, consistent spacing tokens — not random Tailwind steps.
- **Depth:** Surfaces should have a layering system (base → elevated → floating).

---

## Hard Rules
- Do not add sections, features, or content not in the reference
- Do not "improve" a reference design — match it
- Do not stop after one screenshot pass (design tasks)
- Do not use `transition-all`
- Do not use default Tailwind blue/indigo as primary color
- Do not start the dev server if it is already running
- Do not use `localStorage` for user data — always use Supabase (multi-user, multi-device)
- Always add RLS policies when creating new Supabase tables
- Never show raw API/n8n errors to users — always show friendly messages
- **Always deploy edge functions with `--no-verify-jwt`** — Supabase migrated to ES256 JWTs which break gateway-level verification. All functions handle auth internally via `getUser(token)` + role checks, which is more secure anyway. Never set `verify_jwt: true`.
- Use `invokeEdgeFunction()` from `@/integrations/supabase/client` instead of raw `supabase.functions.invoke()` — it refreshes the session and extracts real error messages
