# Documentation Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app `/docs` page with pinned TOC sidebar, right rail, and 13 content sections documenting all Bravoro features.

**Architecture:** Single `DocsPage` component manages the three-panel layout (TOC sidebar + content + right rail). Section content lives in `src/data/docs/*.tsx` files that export React components. Section metadata (slug, title, group, icon) lives in `src/data/docs/sections.ts`. Reusable doc primitives (Tip, Warning, Table, FlowDiagram, FeatureCard) are shared components in `src/components/docs/`.

**Tech Stack:** React 18, React Router v6 (useParams, useNavigate), Tailwind CSS, lucide-react icons, IntersectionObserver API, localStorage for TOC pin state.

---

## File Structure

```
src/pages/DocsPage.tsx                  — Main layout: TOC + content + right rail + mobile header
src/components/docs/
  DocsSidebar.tsx                        — Left TOC sidebar with pin/unpin, search, grouped nav
  DocsRightRail.tsx                      — Sticky "On this page" rail, auto-generated from headings
  DocsTip.tsx                            — Teal tip box (Lightbulb icon)
  DocsWarning.tsx                        — Amber warning box (AlertTriangle icon)
  DocsTable.tsx                          — Dark-themed table with header row
  DocsFeatureCard.tsx                    — Feature card with icon, title, description, link
  DocsFlowDiagram.tsx                    — CSS-only horizontal step flow with arrows
  DocsNavFooter.tsx                      — Previous/Next section navigation
  DocsCodeBlock.tsx                      — Monospace code/header display block
src/data/docs/
  sections.ts                            — Section metadata array + types + helper functions
  overview.tsx                           — Overview section content
  getting-started.tsx                    — Getting Started content
  single-search.tsx                      — Single Search content
  bulk-search.tsx                        — Bulk Search content
  people-enrichment.tsx                  — People Enrichment content
  ai-staffing-chat.tsx                   — AI Staffing Chat content
  recruiting-chat.tsx                    — Recruiting Chat content
  results.tsx                            — Results & Export content
  database.tsx                           — Database content
  analytics.tsx                          — Analytics content
  credits.tsx                            — Credits content
  settings.tsx                           — Settings content
  admin.tsx                              — Admin content
```

**Modified files:**
- `src/App.tsx` — Add `/docs` and `/docs/:sectionSlug` routes
- `src/components/UserAvatarMenu.tsx` — Add "Documentation" menu item

---

## Task 1: Section Metadata & Types

**Files:**
- Create: `src/data/docs/sections.ts`

- [ ] **Step 1: Create sections.ts with all metadata**

```tsx
// src/data/docs/sections.ts
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import {
  BookOpen, Rocket, Search, Upload, Users, Bot, UserSearch,
  FileSpreadsheet, Database, BarChart3, Coins, Settings, Shield,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface DocSection {
  slug: string;
  title: string;
  subtitle: string;
  group: string | null;
  icon: LucideIcon;
  component: LazyExoticComponent<ComponentType>;
}

export const DOC_SECTIONS: DocSection[] = [
  {
    slug: "overview",
    title: "Overview",
    subtitle: "Everything you need to know about Bravoro",
    group: null,
    icon: BookOpen,
    component: lazy(() => import("./overview")),
  },
  {
    slug: "getting-started",
    title: "Getting Started",
    subtitle: "Set up your workspace and run your first search",
    group: null,
    icon: Rocket,
    component: lazy(() => import("./getting-started")),
  },
  {
    slug: "single-search",
    title: "Single Search",
    subtitle: "Look up one company at a time",
    group: "Features",
    icon: Search,
    component: lazy(() => import("./single-search")),
  },
  {
    slug: "bulk-search",
    title: "Bulk Search",
    subtitle: "Upload multiple companies and enrich contacts in batch",
    group: "Features",
    icon: Upload,
    component: lazy(() => import("./bulk-search")),
  },
  {
    slug: "people-enrichment",
    title: "People Enrichment",
    subtitle: "Enrich existing contact lists with verified details",
    group: "Features",
    icon: Users,
    component: lazy(() => import("./people-enrichment")),
  },
  {
    slug: "ai-staffing-chat",
    title: "AI Staffing Chat",
    subtitle: "Conversational company and contact discovery",
    group: "Features",
    icon: Bot,
    component: lazy(() => import("./ai-staffing-chat")),
  },
  {
    slug: "recruiting-chat",
    title: "Recruiting Chat",
    subtitle: "AI-powered candidate search with enrichment",
    group: "Features",
    icon: UserSearch,
    component: lazy(() => import("./recruiting-chat")),
  },
  {
    slug: "results",
    title: "Results & Export",
    subtitle: "View, filter, and export your search results",
    group: "Platform",
    icon: FileSpreadsheet,
    component: lazy(() => import("./results")),
  },
  {
    slug: "database",
    title: "Database",
    subtitle: "Your master contact database",
    group: "Platform",
    icon: Database,
    component: lazy(() => import("./database")),
  },
  {
    slug: "analytics",
    title: "Analytics",
    subtitle: "Credit usage and consumption tracking",
    group: "Platform",
    icon: BarChart3,
    component: lazy(() => import("./analytics")),
  },
  {
    slug: "credits",
    title: "Credits",
    subtitle: "How the credit system works",
    group: "Platform",
    icon: Coins,
    component: lazy(() => import("./credits")),
  },
  {
    slug: "settings",
    title: "Settings",
    subtitle: "Profile, security, and workspace info",
    group: "Platform",
    icon: Settings,
    component: lazy(() => import("./settings")),
  },
  {
    slug: "admin",
    title: "Workspace & Users",
    subtitle: "Admin-only workspace and user management",
    group: "Admin",
    icon: Shield,
    component: lazy(() => import("./admin")),
  },
];

export function getSectionBySlug(slug: string): DocSection | undefined {
  return DOC_SECTIONS.find((s) => s.slug === slug);
}

export function getAdjacentSections(slug: string): { prev: DocSection | null; next: DocSection | null } {
  const idx = DOC_SECTIONS.findIndex((s) => s.slug === slug);
  return {
    prev: idx > 0 ? DOC_SECTIONS[idx - 1] : null,
    next: idx < DOC_SECTIONS.length - 1 ? DOC_SECTIONS[idx + 1] : null,
  };
}

export function getGroupedSections(): { group: string | null; sections: DocSection[] }[] {
  const groups: { group: string | null; sections: DocSection[] }[] = [];
  for (const section of DOC_SECTIONS) {
    const last = groups[groups.length - 1];
    if (last && last.group === section.group) {
      last.sections.push(section);
    } else {
      groups.push({ group: section.group, sections: [section] });
    }
  }
  return groups;
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd /c/Pranav/SiddhaAI/02_Bravoro/01_WebsiteRepo/leapleadsai && npx tsc --noEmit --pretty 2>&1 | head -20`

Note: This will show errors about missing content files (`./overview`, etc.) — that's expected. Verify only that `sections.ts` itself has no syntax/type errors.

- [ ] **Step 3: Commit**

```bash
git add src/data/docs/sections.ts
git commit -m "feat(docs): add section metadata and helper functions"
```

---

## Task 2: Reusable Doc Primitive Components

**Files:**
- Create: `src/components/docs/DocsTip.tsx`
- Create: `src/components/docs/DocsWarning.tsx`
- Create: `src/components/docs/DocsTable.tsx`
- Create: `src/components/docs/DocsFeatureCard.tsx`
- Create: `src/components/docs/DocsFlowDiagram.tsx`
- Create: `src/components/docs/DocsCodeBlock.tsx`
- Create: `src/components/docs/DocsNavFooter.tsx`

- [ ] **Step 1: Create DocsTip.tsx**

```tsx
// src/components/docs/DocsTip.tsx
import { Lightbulb } from "lucide-react";

export function DocsTip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-4 rounded-lg border border-emerald-500/25 bg-emerald-500/5 text-[13px] text-emerald-300/90 my-4">
      <Lightbulb className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
```

- [ ] **Step 2: Create DocsWarning.tsx**

```tsx
// src/components/docs/DocsWarning.tsx
import { AlertTriangle } from "lucide-react";

export function DocsWarning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-4 rounded-lg border border-amber-500/25 bg-amber-500/5 text-[13px] text-amber-400/80 my-4">
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
```

- [ ] **Step 3: Create DocsTable.tsx**

```tsx
// src/components/docs/DocsTable.tsx
interface DocsTableProps {
  headers: string[];
  rows: string[][];
}

export function DocsTable({ headers, rows }: DocsTableProps) {
  return (
    <div className="my-4 rounded-lg border border-[#1e4040] overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-[#1a3535]">
            {headers.map((h) => (
              <th key={h} className="px-4 py-2.5 text-left font-semibold text-[#9ca3af]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-[#1e4040]">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-[#d1d5db]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Create DocsFeatureCard.tsx**

```tsx
// src/components/docs/DocsFeatureCard.tsx
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

interface DocsFeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
}

export function DocsFeatureCard({ icon: Icon, title, description, href }: DocsFeatureCardProps) {
  return (
    <Link
      to={href}
      className="block rounded-lg border border-[#1e4040] bg-[#0f2424] p-4 transition-colors hover:border-emerald-500/40 hover:bg-[#122c2c]"
    >
      <div className="mb-2 text-emerald-400">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-[13px] font-semibold text-[#e5e7eb] mb-1">{title}</h3>
      <p className="text-[12px] text-[#9ca3af] leading-relaxed">{description}</p>
    </Link>
  );
}

export function DocsFeatureCardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-4">
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Create DocsFlowDiagram.tsx**

```tsx
// src/components/docs/DocsFlowDiagram.tsx
import { ChevronRight } from "lucide-react";

interface DocsFlowDiagramProps {
  steps: string[];
}

export function DocsFlowDiagram({ steps }: DocsFlowDiagramProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 my-4 p-4 rounded-lg bg-[#0f2424] border border-[#1e4040]">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-md bg-[#1a3535] border border-[#2a4a4a] text-[12px] font-medium text-emerald-300">
            {step}
          </div>
          {i < steps.length - 1 && (
            <ChevronRight className="w-4 h-4 text-[#6b7280] shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Create DocsCodeBlock.tsx**

```tsx
// src/components/docs/DocsCodeBlock.tsx
export function DocsCodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 rounded-lg bg-[#0d1f1f] border border-[#1e4040] px-4 py-3 font-mono text-[12px] text-emerald-300/80 overflow-x-auto">
      {children}
    </div>
  );
}
```

- [ ] **Step 7: Create DocsNavFooter.tsx**

```tsx
// src/components/docs/DocsNavFooter.tsx
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DocSection } from "@/data/docs/sections";

interface DocsNavFooterProps {
  prev: DocSection | null;
  next: DocSection | null;
}

export function DocsNavFooter({ prev, next }: DocsNavFooterProps) {
  return (
    <div className="flex items-center justify-between mt-12 pt-6 border-t border-[#1e4040]">
      {prev ? (
        <Link
          to={`/docs/${prev.slug}`}
          className="flex items-center gap-2 text-[13px] text-[#9ca3af] hover:text-emerald-400 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <div>
            <div className="text-[11px] text-[#6b7280]">Previous</div>
            <div className="font-medium">{prev.title}</div>
          </div>
        </Link>
      ) : <div />}
      {next ? (
        <Link
          to={`/docs/${next.slug}`}
          className="flex items-center gap-2 text-[13px] text-[#9ca3af] hover:text-emerald-400 transition-colors text-right"
        >
          <div>
            <div className="text-[11px] text-[#6b7280]">Next</div>
            <div className="font-medium">{next.title}</div>
          </div>
          <ChevronRight className="w-4 h-4" />
        </Link>
      ) : <div />}
    </div>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add src/components/docs/
git commit -m "feat(docs): add reusable doc primitive components (Tip, Warning, Table, FeatureCard, FlowDiagram, CodeBlock, NavFooter)"
```

---

## Task 3: Docs TOC Sidebar

**Files:**
- Create: `src/components/docs/DocsSidebar.tsx`

- [ ] **Step 1: Create DocsSidebar.tsx**

```tsx
// src/components/docs/DocsSidebar.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Pin, PinOff, Search, X, Menu } from "lucide-react";
import { getGroupedSections, type DocSection } from "@/data/docs/sections";
import { cn } from "@/lib/utils";

interface DocsSidebarProps {
  activeSlug: string;
  pinned: boolean;
  onPinChange: (pinned: boolean) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function DocsSidebar({ activeSlug, pinned, onPinChange, mobileOpen, onMobileClose }: DocsSidebarProps) {
  const [search, setSearch] = useState("");
  const grouped = getGroupedSections();

  const filteredGroups = search.trim()
    ? grouped
        .map((g) => ({
          ...g,
          sections: g.sections.filter((s) =>
            s.title.toLowerCase().includes(search.toLowerCase())
          ),
        }))
        .filter((g) => g.sections.length > 0)
    : grouped;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#1e4040]">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-emerald-400" />
          <span className="text-[14px] font-semibold text-[#f3f4f6]">Documentation</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Pin toggle — desktop only */}
          <button
            onClick={() => onPinChange(!pinned)}
            className="hidden md:flex items-center justify-center w-7 h-7 rounded-md hover:bg-[#1a3535] transition-colors"
            title={pinned ? "Unpin sidebar" : "Pin sidebar"}
          >
            {pinned ? (
              <Pin className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <PinOff className="w-3.5 h-3.5 text-[#6b7280]" />
            )}
          </button>
          {/* Close — mobile only */}
          <button
            onClick={onMobileClose}
            className="md:hidden flex items-center justify-center w-7 h-7 rounded-md hover:bg-[#1a3535] transition-colors"
          >
            <X className="w-4 h-4 text-[#9ca3af]" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6b7280]" />
          <input
            type="text"
            placeholder="Search docs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-md bg-[#1a3535] border border-[#2a4a4a] text-[12px] text-[#d1d5db] placeholder-[#6b7280] focus:outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {filteredGroups.map((group) => (
          <div key={group.group ?? "__ungrouped"} className="mt-2">
            {group.group && (
              <div className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#6b7280]">
                {group.group}
              </div>
            )}
            {group.sections.map((section) => (
              <Link
                key={section.slug}
                to={`/docs/${section.slug}`}
                onClick={onMobileClose}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-[12.5px] transition-colors border-l-2",
                  section.slug === activeSlug
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-300 font-medium"
                    : "border-transparent text-[#d1d5db] hover:bg-[#1a3535] hover:text-[#f3f4f6]"
                )}
              >
                <section.icon className="w-3.5 h-3.5 shrink-0 opacity-60" />
                {section.title}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col flex-shrink-0 border-r border-[#1e4040] bg-[#0d1f1f]/90 backdrop-blur-sm transition-all duration-300 overflow-hidden",
          pinned ? "w-[200px]" : "w-0"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop: floating toggle when unpinned */}
      {!pinned && (
        <button
          onClick={() => onPinChange(true)}
          className="hidden md:flex fixed left-[72px] top-1/2 -translate-y-1/2 z-30 items-center justify-center w-8 h-8 rounded-full bg-[#1a3535] border border-[#2a4a4a] shadow-lg hover:bg-[#224040] transition-colors"
          title="Open docs sidebar"
        >
          <Menu className="w-4 h-4 text-emerald-400" />
        </button>
      )}

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={onMobileClose}
          />
          <aside className="md:hidden fixed left-0 top-0 bottom-0 w-[260px] bg-[#0d1f1f] z-50 shadow-2xl">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/docs/DocsSidebar.tsx
git commit -m "feat(docs): add DocsSidebar with pin/unpin, search, grouped nav, mobile overlay"
```

---

## Task 4: Right Rail ("On this page")

**Files:**
- Create: `src/components/docs/DocsRightRail.tsx`

- [ ] **Step 1: Create DocsRightRail.tsx**

```tsx
// src/components/docs/DocsRightRail.tsx
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Heading {
  id: string;
  text: string;
}

interface DocsRightRailProps {
  contentRef: React.RefObject<HTMLDivElement>;
  sectionSlug: string;
}

export function DocsRightRail({ contentRef, sectionSlug }: DocsRightRailProps) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  // Extract h2 headings from content
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    // Small delay to let content render
    const timer = setTimeout(() => {
      const h2s = el.querySelectorAll("h2[id]");
      const items: Heading[] = Array.from(h2s).map((h) => ({
        id: h.id,
        text: h.textContent ?? "",
      }));
      setHeadings(items);
      if (items.length > 0) setActiveId(items[0].id);
    }, 100);
    return () => clearTimeout(timer);
  }, [contentRef, sectionSlug]);

  // IntersectionObserver to track active heading
  useEffect(() => {
    if (headings.length === 0) return;
    const el = contentRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );

    headings.forEach((h) => {
      const target = el.querySelector(`#${CSS.escape(h.id)}`);
      if (target) observer.observe(target);
    });

    return () => observer.disconnect();
  }, [headings, contentRef]);

  if (headings.length < 2) return null;

  return (
    <aside className="hidden xl:block w-[140px] flex-shrink-0 sticky top-8 self-start">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6b7280] mb-3">
        On this page
      </div>
      <nav className="flex flex-col gap-1">
        {headings.map((h) => (
          <button
            key={h.id}
            onClick={() => {
              document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" });
            }}
            className={cn(
              "text-left text-[11px] py-1 pl-3 border-l-2 transition-colors leading-snug",
              h.id === activeId
                ? "border-emerald-400 text-emerald-300"
                : "border-[#1e4040] text-[#9ca3af] hover:text-[#d1d5db]"
            )}
          >
            {h.text}
          </button>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/docs/DocsRightRail.tsx
git commit -m "feat(docs): add DocsRightRail with IntersectionObserver heading tracking"
```

---

## Task 5: DocsPage Layout (Main Page Component)

**Files:**
- Create: `src/pages/DocsPage.tsx`

- [ ] **Step 1: Create DocsPage.tsx**

```tsx
// src/pages/DocsPage.tsx
import { useEffect, useState, useRef, Suspense } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Menu, ChevronRight } from "lucide-react";
import { DOC_SECTIONS, getSectionBySlug, getAdjacentSections } from "@/data/docs/sections";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { DocsRightRail } from "@/components/docs/DocsRightRail";
import { DocsNavFooter } from "@/components/docs/DocsNavFooter";
import bravoroLogo from "@/assets/bravoro-logo.svg";

function useAuthGuard() {
  const nav = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) nav("/", { replace: true });
    });
  }, [nav]);
}

const DocsPage = () => {
  useAuthGuard();
  const { sectionSlug } = useParams<{ sectionSlug: string }>();
  const contentRef = useRef<HTMLDivElement>(null);

  const [tocPinned, setTocPinned] = useState(() => {
    const saved = localStorage.getItem("docs-toc-pinned");
    return saved !== null ? saved === "true" : true;
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("docs-toc-pinned", String(tocPinned));
  }, [tocPinned]);

  // Scroll to top on section change
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [sectionSlug]);

  if (!sectionSlug) {
    return <Navigate to="/docs/overview" replace />;
  }

  const section = getSectionBySlug(sectionSlug);
  if (!section) {
    return <Navigate to="/docs/overview" replace />;
  }

  const { prev, next } = getAdjacentSections(sectionSlug);
  const SectionComponent = section.component;

  return (
    <div className="min-h-screen bg-[#06191a] flex">
      {/* Background effects (matching app pattern) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-[-20%] left-[30%] w-[60%] h-[60%] rounded-full opacity-[0.08]"
          style={{
            background: "radial-gradient(ellipse, #009da5 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Docs TOC Sidebar */}
      <DocsSidebar
        activeSlug={sectionSlug}
        pinned={tocPinned}
        onPinChange={setTocPinned}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* Main content area */}
      <div className="flex-1 min-w-0 relative z-10">
        {/* Fixed logo top-right */}
        <div className="fixed top-6 right-6 md:top-8 md:right-8 z-40 pointer-events-none">
          <img src={bravoroLogo} alt="Bravoro" className="h-6 md:h-7 w-auto" />
        </div>

        {/* Mobile header */}
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-[#06191a]/90 backdrop-blur-sm border-b border-[#1e4040]">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-[#1a3535] transition-colors"
          >
            <Menu className="w-5 h-5 text-[#9ca3af]" />
          </button>
          <div className="text-[13px] text-[#9ca3af] truncate">
            <span className="text-[#6b7280]">Docs</span>
            <ChevronRight className="w-3 h-3 inline mx-1 text-[#6b7280]" />
            <span className="text-[#d1d5db]">{section.title}</span>
          </div>
        </div>

        {/* Content + Right Rail wrapper */}
        <div className="flex max-w-[960px] mx-auto px-4 md:px-8 py-6 md:py-10 gap-8">
          {/* Content area */}
          <div ref={contentRef} className="flex-1 min-w-0">
            {/* Breadcrumb — desktop only */}
            <div className="hidden md:flex items-center gap-1 text-[12px] text-[#6b7280] mb-6">
              <span>Docs</span>
              <ChevronRight className="w-3 h-3" />
              {section.group && (
                <>
                  <span>{section.group}</span>
                  <ChevronRight className="w-3 h-3" />
                </>
              )}
              <span className="text-[#9ca3af]">{section.title}</span>
            </div>

            {/* Title block */}
            <h1 className="text-[22px] md:text-[26px] font-bold text-[#f3f4f6] tracking-tight mb-2">
              {section.title}
            </h1>
            <p className="text-[14px] text-[#9ca3af] mb-8 leading-relaxed">
              {section.subtitle}
            </p>

            {/* Section content */}
            <div className="docs-content prose-dark">
              <Suspense fallback={<div className="animate-pulse h-40 bg-[#1a3535] rounded-lg" />}>
                <SectionComponent />
              </Suspense>
            </div>

            {/* Previous / Next */}
            <DocsNavFooter prev={prev} next={next} />
          </div>

          {/* Right Rail */}
          <DocsRightRail contentRef={contentRef} sectionSlug={sectionSlug} />
        </div>

        {/* Back to dashboard link */}
        <div className="max-w-[960px] mx-auto px-4 md:px-8 pb-10">
          <a
            href="/dashboard"
            className="inline-flex items-center gap-1 text-[12px] text-[#6b7280] hover:text-emerald-400 transition-colors"
          >
            ← Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
};

export default DocsPage;
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/DocsPage.tsx
git commit -m "feat(docs): add DocsPage with three-panel layout, auth guard, mobile header"
```

---

## Task 6: Routing & Avatar Menu Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/UserAvatarMenu.tsx`

- [ ] **Step 1: Add route to App.tsx**

In `src/App.tsx`, add the lazy import after the existing lazy imports (after line 22):

```tsx
const DocsPage = lazy(() => import("./pages/DocsPage"));
```

Add these routes before the catch-all `*` route (before line 48):

```tsx
<Route path="/docs" element={<Navigate to="/docs/overview" replace />} />
<Route path="/docs/:sectionSlug" element={<DocsPage />} />
```

- [ ] **Step 2: Add Documentation item to UserAvatarMenu.tsx**

In `src/components/UserAvatarMenu.tsx`, add `BookOpen` to the lucide-react import on line 10:

```tsx
import { LogOut, Settings, Shield, Terminal, ChevronUp, BookOpen } from "lucide-react";
```

Add this button right before the Settings button (before line 186):

```tsx
          <button
            onClick={() => {
              setOpen(false);
              navigate("/docs");
            }}
            className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors duration-200 hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            <BookOpen className="h-4 w-4 text-sidebar-foreground/60" />
            Documentation
          </button>
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx src/components/UserAvatarMenu.tsx
git commit -m "feat(docs): add /docs route and Documentation item to avatar menu"
```

---

## Task 7: Content Sections — Group 1 (Overview + Getting Started)

**Files:**
- Create: `src/data/docs/overview.tsx`
- Create: `src/data/docs/getting-started.tsx`

- [ ] **Step 1: Create overview.tsx**

```tsx
// src/data/docs/overview.tsx
import { Search, Upload, Users, Bot, UserSearch } from "lucide-react";
import { DocsFeatureCard, DocsFeatureCardGrid } from "@/components/docs/DocsFeatureCard";
import { DocsTable } from "@/components/docs/DocsTable";
import { Link } from "react-router-dom";

export default function OverviewSection() {
  return (
    <>
      <h2 id="what-is-bravoro" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        What is Bravoro?
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Bravoro is a lead enrichment and automation platform that helps sales and recruiting teams
        find, verify, and enrich business contacts at scale. Upload company lists, search individually,
        or use AI chat to discover candidates — Bravoro handles the rest and delivers verified
        emails, phone numbers, and job listings.
      </p>

      <h2 id="core-features" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-4 scroll-mt-24">
        Core Features
      </h2>
      <DocsFeatureCardGrid>
        <DocsFeatureCard
          icon={Search}
          title="Single Search"
          description="Look up one company at a time and get enriched contacts"
          href="/docs/single-search"
        />
        <DocsFeatureCard
          icon={Upload}
          title="Bulk Search"
          description="Upload an Excel file or Google Sheet with multiple companies"
          href="/docs/bulk-search"
        />
        <DocsFeatureCard
          icon={Users}
          title="People Enrichment"
          description="Enrich existing contact lists with verified phone and email"
          href="/docs/people-enrichment"
        />
        <DocsFeatureCard
          icon={Bot}
          title="AI Staffing Chat"
          description="Conversational AI for discovering companies and contacts"
          href="/docs/ai-staffing-chat"
        />
        <DocsFeatureCard
          icon={UserSearch}
          title="Recruiting Chat"
          description="Find and enrich candidates by role, skills, and location"
          href="/docs/recruiting-chat"
        />
      </DocsFeatureCardGrid>

      <h2 id="credit-costs" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-4 scroll-mt-24">
        Credit Costs at a Glance
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-3">
        Every enrichment deducts credits from your workspace pool based on the type of contact data returned.
      </p>
      <DocsTable
        headers={["Contact Type", "Credits per Contact"]}
        rows={[
          ["Mobile Phone", "4 credits"],
          ["Direct Phone", "3 credits"],
          ["Email / LinkedIn", "2 credits"],
          ["Job Listing", "1 credit"],
        ]}
      />

      <h2 id="next-steps" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Next Steps
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed">
        Ready to dive in?{" "}
        <Link to="/docs/getting-started" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
          Get Started →
        </Link>
      </p>
    </>
  );
}
```

- [ ] **Step 2: Create getting-started.tsx**

```tsx
// src/data/docs/getting-started.tsx
import { DocsTip } from "@/components/docs/DocsTip";
import { DocsFlowDiagram } from "@/components/docs/DocsFlowDiagram";
import { Link } from "react-router-dom";

export default function GettingStartedSection() {
  return (
    <>
      <h2 id="dashboard-orientation" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        Dashboard Orientation
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Once you log in, the sidebar on the left is your main navigation. Here's what each section does:
      </p>
      <ul className="space-y-2 text-[14px] text-[#b0b8c0] mb-6 ml-1">
        <li className="flex gap-2"><span className="text-emerald-400 font-medium">Home</span> — Dashboard with enrichment tool cards</li>
        <li className="flex gap-2"><span className="text-emerald-400 font-medium">Analytics</span> — Credit usage charts and consumption breakdown</li>
        <li className="flex gap-2"><span className="text-emerald-400 font-medium">Results</span> — All your completed searches and their results</li>
        <li className="flex gap-2"><span className="text-emerald-400 font-medium">Database</span> — Master database of all enriched contacts</li>
        <li className="flex gap-2"><span className="text-emerald-400 font-medium">Tools</span> — The 5 enrichment tools (Single Search, Bulk Search, People Enrichment, AI Staffing, Recruiting)</li>
      </ul>

      <h2 id="your-first-search" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Your First Search
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        The quickest way to get started is with a <Link to="/docs/single-search" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">Single Search</Link>:
      </p>
      <DocsFlowDiagram steps={["Open Single Search", "Enter company name", "Set function & seniority", "Run search", "View results"]} />
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mt-4 mb-4">
        Enter a company name, optionally narrow by job function and seniority level, then hit search.
        Results appear on the <Link to="/docs/results" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">Results page</Link> with
        enriched contacts and job listings.
      </p>

      <h2 id="workspace-and-credits" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Workspace & Credits
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Your account belongs to a workspace — a shared environment for your team. Each workspace has a
        credit pool that's consumed when enrichments return contact data. Different contact types cost
        different amounts (see <Link to="/docs/credits" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">Credits</Link> for the full breakdown).
      </p>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Check your remaining balance anytime in{" "}
        <Link to="/docs/settings" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">Settings</Link> or{" "}
        <Link to="/docs/analytics" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">Analytics</Link>.
        If credits run out, searches will be paused until your admin adds more.
      </p>

      <DocsTip>
        Start with Single Search to see how results look before running larger bulk operations. This helps you
        fine-tune your search parameters without spending many credits.
      </DocsTip>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/data/docs/overview.tsx src/data/docs/getting-started.tsx
git commit -m "feat(docs): add Overview and Getting Started content sections"
```

---

## Task 8: Content Sections — Group 2 (Features: Single Search, Bulk Search, People Enrichment)

**Files:**
- Create: `src/data/docs/single-search.tsx`
- Create: `src/data/docs/bulk-search.tsx`
- Create: `src/data/docs/people-enrichment.tsx`

- [ ] **Step 1: Create single-search.tsx**

```tsx
// src/data/docs/single-search.tsx
import { DocsTip } from "@/components/docs/DocsTip";
import { DocsTable } from "@/components/docs/DocsTable";
import { DocsFlowDiagram } from "@/components/docs/DocsFlowDiagram";
import { Link } from "react-router-dom";

export default function SingleSearchSection() {
  return (
    <>
      <h2 id="what-it-does" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        What It Does
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Single Search lets you look up one company at a time. Enter a company name, optionally refine by
        domain, location, job function, and seniority — and Bravoro returns enriched contacts matching
        your criteria, plus any open job listings if enabled.
      </p>
      <DocsFlowDiagram steps={["Enter company details", "Run search", "View contacts & jobs"]} />

      <h2 id="search-fields" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Search Fields
      </h2>
      <DocsTable
        headers={["Field", "Required", "Description"]}
        rows={[
          ["Company Name", "Yes", "The company to search for"],
          ["Domain", "No", "Company website domain (improves accuracy)"],
          ["Location", "No", "Filter contacts by geographic location"],
          ["Person Functions", "No", "Job functions like Sales, Marketing, Engineering"],
          ["Person Seniorities", "No", "Levels like Director, VP, C-Suite"],
          ["Job Title", "No", "Specific job title to filter by"],
        ]}
      />
      <DocsTip>
        Adding the company domain is optional but significantly improves match accuracy, especially for
        companies with common names.
      </DocsTip>

      <h2 id="results" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        What You Get
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Results include enriched contacts with email addresses, phone numbers (mobile and direct),
        LinkedIn profiles, and seniority information. If job search is enabled, you'll also see
        current open positions at the company.
      </p>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Credits are deducted per contact type found — see{" "}
        <Link to="/docs/credits" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
          Credits
        </Link>{" "}
        for the cost breakdown.
      </p>
    </>
  );
}
```

- [ ] **Step 2: Create bulk-search.tsx**

```tsx
// src/data/docs/bulk-search.tsx
import { DocsTip } from "@/components/docs/DocsTip";
import { DocsWarning } from "@/components/docs/DocsWarning";
import { DocsTable } from "@/components/docs/DocsTable";
import { DocsCodeBlock } from "@/components/docs/DocsCodeBlock";
import { Link } from "react-router-dom";

export default function BulkSearchSection() {
  return (
    <>
      <h2 id="what-it-does" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        What It Does
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Bulk Search lets you enrich contacts for multiple companies at once. Upload an Excel file,
        connect a Google Sheet, or use the built-in spreadsheet editor — Bravoro processes each
        company row and returns enriched contacts and job listings.
      </p>

      <h2 id="input-methods" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Input Methods
      </h2>

      <h3 className="text-[15px] font-medium text-[#d1d5db] mt-6 mb-2">Excel Upload</h3>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-3">
        Upload a <code className="px-1.5 py-0.5 rounded bg-[#1a3535] text-emerald-300 text-[12px]">.xlsx</code> file
        with the required column headers. Download the template from the upload card to get the
        correct format.
      </p>

      <h3 className="text-[15px] font-medium text-[#d1d5db] mt-6 mb-2">Google Sheets</h3>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-3">
        Paste a Google Sheet URL with the same column headers. The sheet must be shared (at least "Anyone with the link" as Viewer).
        See the{" "}
        <Link to="/google-sheets-guide" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
          Google Sheets Setup Guide
        </Link>{" "}
        for detailed instructions.
      </p>

      <h3 className="text-[15px] font-medium text-[#d1d5db] mt-6 mb-2">Spreadsheet Grid</h3>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-3">
        Use the built-in spreadsheet editor to enter data directly in the browser. You can save
        your work as drafts and come back to them later. Drafts can be renamed, loaded, or deleted
        from the Spreadsheet tab.
      </p>

      <h2 id="required-columns" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Required Columns
      </h2>
      <DocsTable
        headers={["Column", "Required", "Notes"]}
        rows={[
          ["Sr No", "Yes", "Row number"],
          ["Organization Name", "Yes", "Company name"],
          ["Organization Locations", "No", "Filter by location"],
          ["Organization Domains", "No", "Company domain"],
          ["Person Functions", "No", "e.g. \"Sales, Marketing\" (comma separated)"],
          ["Person Seniorities", "No", "e.g. \"Director, VP\""],
          ["Person Job Title", "No", "Specific title filter"],
          ["Results per Function", "No", "Number of results per function"],
          ["Job Search", "No", "\"Yes\" or \"No\""],
          ["Job Title", "No", "Job title to search"],
          ["Job Seniority", "No", "Job seniority filter"],
          ["Date (days)", "No", "Job posting recency in days"],
        ]}
      />
      <DocsWarning>
        Ensure your Excel file has the correct column headers. Columns are matched by name prefix — suffixes
        like "(comma separated)" are acceptable. If headers don't match, the upload will be rejected.
      </DocsWarning>

      <h2 id="draft-management" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Draft Management
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        When using the Spreadsheet Grid, your work is automatically organized into drafts. You can:
      </p>
      <ul className="space-y-1.5 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-disc list-outside">
        <li>Save your current grid as a named draft</li>
        <li>Load a previous draft to continue editing</li>
        <li>Rename or delete drafts you no longer need</li>
        <li>View submitted (sent) sheets separately from drafts</li>
      </ul>

      <DocsTip>
        Start with a small batch (5-10 companies) to verify your column mapping is correct before
        running a large upload.
      </DocsTip>
    </>
  );
}
```

- [ ] **Step 3: Create people-enrichment.tsx**

```tsx
// src/data/docs/people-enrichment.tsx
import { DocsTip } from "@/components/docs/DocsTip";
import { DocsTable } from "@/components/docs/DocsTable";
import { Link } from "react-router-dom";

export default function PeopleEnrichmentSection() {
  return (
    <>
      <h2 id="what-it-does" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        What It Does
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        People Enrichment is for when you already have a list of people and want to fill in their contact
        details. Unlike Bulk Search (which starts from companies), People Enrichment starts from individual
        names and returns verified phone numbers, emails, and LinkedIn profiles.
      </p>

      <h2 id="input-methods" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Input Methods
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Same three options as Bulk Search — Excel upload, Google Sheets, or the built-in Spreadsheet Grid.
        The column headers are different since you're working with people, not companies.
      </p>

      <h2 id="required-columns" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Required Columns
      </h2>
      <DocsTable
        headers={["Column", "Required", "Notes"]}
        rows={[
          ["Sr No", "Yes", "Row number"],
          ["Record Id", "Yes", "Unique identifier for each person"],
          ["First Name", "Yes", "Contact's first name"],
          ["Last Name", "Yes", "Contact's last name"],
          ["Organization Domain", "Yes", "Company domain (e.g. acme.com)"],
          ["LinkedIn URL", "No", "LinkedIn profile URL — significantly improves match accuracy"],
        ]}
      />

      <h2 id="enrichment-results" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Enrichment Results
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        For each person, Bravoro attempts to find and verify:
      </p>
      <ul className="space-y-1.5 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-disc list-outside">
        <li><span className="text-emerald-400">Mobile Phone</span> — personal mobile number</li>
        <li><span className="text-emerald-400">Direct Phone</span> — direct work line</li>
        <li><span className="text-emerald-400">Email</span> — verified business email</li>
        <li><span className="text-emerald-400">LinkedIn</span> — confirmed LinkedIn profile URL</li>
        <li><span className="text-emerald-400">Seniority</span> — current seniority level</li>
      </ul>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Credits are deducted per contact type found — see{" "}
        <Link to="/docs/credits" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
          Credits
        </Link>{" "}
        for costs.
      </p>

      <DocsTip>
        Previously enriched contacts are cached — you won't be charged twice for the same person
        within 6 months. This means re-running enrichment on overlapping lists is safe and cost-effective.
      </DocsTip>
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/data/docs/single-search.tsx src/data/docs/bulk-search.tsx src/data/docs/people-enrichment.tsx
git commit -m "feat(docs): add Single Search, Bulk Search, People Enrichment content sections"
```

---

## Task 9: Content Sections — Group 2 continued (AI Staffing Chat, Recruiting Chat)

**Files:**
- Create: `src/data/docs/ai-staffing-chat.tsx`
- Create: `src/data/docs/recruiting-chat.tsx`

- [ ] **Step 1: Create ai-staffing-chat.tsx**

```tsx
// src/data/docs/ai-staffing-chat.tsx
import { DocsTip } from "@/components/docs/DocsTip";
import { DocsCodeBlock } from "@/components/docs/DocsCodeBlock";

export default function AIStaffingChatSection() {
  return (
    <>
      <h2 id="what-it-does" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        What It Does
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        AI Staffing Chat is a conversational interface for discovering companies and contacts.
        Instead of filling out forms, describe what you're looking for in natural language — the AI
        searches the web and returns structured company cards and contact information.
      </p>

      <h2 id="how-to-use" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        How to Use
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-3">
        Select <span className="text-emerald-400 font-medium">AI Staffing</span> from the Tools section in the sidebar, then type your query.
      </p>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-2">Example queries:</p>
      <DocsCodeBlock>
        "Find software companies in Berlin with 50-200 employees"
      </DocsCodeBlock>
      <DocsCodeBlock>
        "Show me marketing agencies in Munich hiring for account managers"
      </DocsCodeBlock>

      <h2 id="rich-results" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Rich Results
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        The AI returns structured data rendered as interactive cards:
      </p>
      <ul className="space-y-1.5 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-disc list-outside">
        <li><span className="text-emerald-400">Company cards</span> — domain, location, employee count, and a summary</li>
        <li><span className="text-emerald-400">Contact cards</span> — name, title, email, phone when available</li>
        <li><span className="text-emerald-400">Job listings</span> — open positions at discovered companies (collapsible)</li>
      </ul>

      <h2 id="conversation-management" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Conversation Management
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Your chat history is saved automatically. From the sidebar you can:
      </p>
      <ul className="space-y-1.5 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-disc list-outside">
        <li>Start a new chat with the + button</li>
        <li>Switch between previous conversations</li>
        <li>Rename conversations for easier reference</li>
        <li>Delete old conversations you no longer need</li>
      </ul>

      <DocsTip>
        Be specific about location and company size for better results. "Software companies in Berlin
        with 50-200 employees" gives much better results than just "software companies."
      </DocsTip>
    </>
  );
}
```

- [ ] **Step 2: Create recruiting-chat.tsx**

```tsx
// src/data/docs/recruiting-chat.tsx
import { DocsTip } from "@/components/docs/DocsTip";
import { DocsFlowDiagram } from "@/components/docs/DocsFlowDiagram";
import { DocsCodeBlock } from "@/components/docs/DocsCodeBlock";
import { Link } from "react-router-dom";

export default function RecruitingChatSection() {
  return (
    <>
      <h2 id="what-it-does" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        What It Does
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Recruiting Chat is an AI-powered candidate search tool. Describe the role you're hiring for,
        and the AI finds matching candidates across the web. You can then select candidates and enrich
        them with verified contact details — all within the chat.
      </p>

      <h2 id="how-to-use" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        How to Use
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-3">
        Select <span className="text-emerald-400 font-medium">Recruiting</span> from the Tools section in the sidebar, then describe the role.
      </p>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-2">Example queries:</p>
      <DocsCodeBlock>
        "Find senior React developers in Berlin"
      </DocsCodeBlock>
      <DocsCodeBlock>
        "Search for data scientists with Python experience in London"
      </DocsCodeBlock>

      <h2 id="candidate-flow" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Candidate Flow
      </h2>
      <DocsFlowDiagram steps={["Search", "Review candidates", "Select & Enrich", "Get contact details"]} />
      <ol className="space-y-2 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-decimal list-outside mt-4">
        <li>The AI searches for candidates matching your criteria and shows preview cards (name, current title, LinkedIn)</li>
        <li>Review the candidates and use checkboxes to select the ones you want to enrich</li>
        <li>Click <span className="text-emerald-400 font-medium">"Enrich Selected"</span> to retrieve verified contact details</li>
        <li>Enriched cards show: email, mobile phone, direct phone, and seniority level</li>
      </ol>

      <h2 id="auto-save" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Auto-Save to Database
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Enriched contacts with phone numbers are automatically saved to your{" "}
        <Link to="/docs/database" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
          master database
        </Link>
        . No extra steps needed — your enriched candidates are preserved for future reference and won't be
        double-charged if you enrich them again.
      </p>

      <h2 id="credit-costs" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Credit Costs
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Candidate search itself is free — credits are only deducted when you enrich contacts. The cost
        depends on what contact data is found (see{" "}
        <Link to="/docs/credits" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
          Credits
        </Link>
        ).
      </p>

      <DocsTip>
        Include location in your search query — results are more accurate when location comes from
        evidence in candidate profiles, not assumptions. "React developers in Berlin" works better
        than just "React developers."
      </DocsTip>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/data/docs/ai-staffing-chat.tsx src/data/docs/recruiting-chat.tsx
git commit -m "feat(docs): add AI Staffing Chat and Recruiting Chat content sections"
```

---

## Task 10: Content Sections — Group 3 (Platform: Results, Database, Analytics, Credits, Settings)

**Files:**
- Create: `src/data/docs/results.tsx`
- Create: `src/data/docs/database.tsx`
- Create: `src/data/docs/analytics.tsx`
- Create: `src/data/docs/credits.tsx`
- Create: `src/data/docs/settings.tsx`

- [ ] **Step 1: Create results.tsx**

```tsx
// src/data/docs/results.tsx
import { DocsFlowDiagram } from "@/components/docs/DocsFlowDiagram";

export default function ResultsSection() {
  return (
    <>
      <h2 id="viewing-results" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        Viewing Results
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        After any search completes, results appear on the Results page (accessible from the sidebar).
        Each search is listed with its status, timestamp, and input file name. Click a search to expand
        and view the returned data.
      </p>
      <DocsFlowDiagram steps={["Run a search", "Results page", "Expand company", "View contacts & jobs"]} />

      <h2 id="result-structure" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Result Structure
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Results are organized by company. Each company row expands to show:
      </p>
      <ul className="space-y-1.5 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-disc list-outside">
        <li><span className="text-emerald-400">Contacts</span> — enriched people with email, phone, LinkedIn, and seniority</li>
        <li><span className="text-emerald-400">Job Listings</span> — current open positions at the company (collapsible section)</li>
      </ul>

      <h2 id="filtering" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Filtering
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Use the search bar at the top to filter results by company name or the original input file name.
        The results list shows a "Name / File" column that displays either the Excel file name (for bulk
        uploads) or the company name (for single searches).
      </p>

      <h2 id="excel-export" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Excel Export
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Click the download button to export results as an{" "}
        <code className="px-1.5 py-0.5 rounded bg-[#1a3535] text-emerald-300 text-[12px]">.xlsx</code> file.
        The exported file contains all contacts and job data from the search. Files are named{" "}
        <code className="px-1.5 py-0.5 rounded bg-[#1a3535] text-emerald-300 text-[12px]">
          {"<input_file>_processed.xlsx"}
        </code>.
      </p>
    </>
  );
}
```

- [ ] **Step 2: Create database.tsx**

```tsx
// src/data/docs/database.tsx
export default function DatabaseSection() {
  return (
    <>
      <h2 id="what-it-stores" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        What It Stores
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        The Database page is your master repository of all enriched contacts. Every contact found through
        Bulk Search, People Enrichment, or Recruiting Chat enrichment is automatically stored here.
      </p>

      <h2 id="how-contacts-arrive" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        How Contacts Arrive
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Contacts are added automatically from three sources:
      </p>
      <ul className="space-y-1.5 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-disc list-outside">
        <li><span className="text-emerald-400">Bulk Search</span> — all contacts returned from company enrichments</li>
        <li><span className="text-emerald-400">People Enrichment</span> — all successfully enriched people</li>
        <li><span className="text-emerald-400">Recruiting Chat</span> — enriched candidates with phone numbers</li>
      </ul>

      <h2 id="deduplication" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Deduplication
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        The same person won't appear twice in your database. Contacts are matched by their unique provider
        ID, so even if you enrich the same person across different searches, only one record is maintained
        (updated with the latest data).
      </p>

      <h2 id="searching" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Searching & Filtering
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Use the search and filter tools to find contacts by name, company, email, or phone number.
        The database supports full-text search across all contact fields.
      </p>
    </>
  );
}
```

- [ ] **Step 3: Create analytics.tsx**

```tsx
// src/data/docs/analytics.tsx
export default function AnalyticsSection() {
  return (
    <>
      <h2 id="what-it-shows" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        What It Shows
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        The Analytics page gives you a detailed breakdown of your workspace's credit usage over time.
        Use it to understand consumption patterns and manage your credit budget.
      </p>

      <h2 id="usage-breakdown" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Usage Breakdown
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Credits are broken down by contact type:
      </p>
      <ul className="space-y-1.5 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-disc list-outside">
        <li><span className="text-emerald-400">Mobile Phone</span> — 4 credits each</li>
        <li><span className="text-emerald-400">Direct Phone</span> — 3 credits each</li>
        <li><span className="text-emerald-400">Email / LinkedIn</span> — 2 credits each</li>
        <li><span className="text-emerald-400">Job Listings</span> — 1 credit each</li>
      </ul>

      <h2 id="time-charts" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Time-Based Charts
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Charts show credit consumption over time, so you can spot trends — such as which days or weeks
        have the highest usage. This is useful for planning credit top-ups and understanding your team's
        enrichment activity.
      </p>
    </>
  );
}
```

- [ ] **Step 4: Create credits.tsx**

```tsx
// src/data/docs/credits.tsx
import { DocsWarning } from "@/components/docs/DocsWarning";
import { DocsTable } from "@/components/docs/DocsTable";
import { DocsTip } from "@/components/docs/DocsTip";
import { Link } from "react-router-dom";

export default function CreditsSection() {
  return (
    <>
      <h2 id="how-credits-work" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        How Credits Work
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Your workspace has a shared credit pool. Every time a search or enrichment returns contact data,
        credits are deducted based on the type of information found. All users in your workspace draw
        from the same pool.
      </p>

      <h2 id="cost-table" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Cost per Contact Type
      </h2>
      <DocsTable
        headers={["Contact Type", "Credits", "Description"]}
        rows={[
          ["Mobile Phone", "4", "Personal mobile number — highest value, highest cost"],
          ["Direct Phone", "3", "Direct work phone line"],
          ["Email / LinkedIn", "2", "Business email or LinkedIn profile URL"],
          ["Job Listing", "1", "An open position at the company"],
        ]}
      />
      <DocsWarning>
        Credits are deducted when results are returned, not when searches are initiated. If a search finds
        a mobile phone and an email for one contact, that's 4 + 2 = 6 credits.
      </DocsWarning>

      <h2 id="checking-balance" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Checking Your Balance
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        You can check your remaining credits in two places:
      </p>
      <ul className="space-y-1.5 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-disc list-outside">
        <li>
          <Link to="/docs/settings" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">Settings</Link>
          {" "}— shows your workspace balance with color-coded indicator
        </li>
        <li>
          <Link to="/docs/analytics" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">Analytics</Link>
          {" "}— shows usage over time and remaining balance
        </li>
      </ul>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Balance is color-coded: <span className="text-green-400">green</span> (healthy),{" "}
        <span className="text-amber-400">amber</span> (running low),{" "}
        <span className="text-red-400">red</span> (critically low).
      </p>

      <h2 id="running-out" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        What Happens at Zero
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        When your workspace runs out of credits, all searches and enrichments are paused. You'll see a
        friendly message explaining the situation. Contact your workspace admin to request a credit top-up.
      </p>

      <h2 id="cache-benefit" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Cache Benefit
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Bravoro caches enrichment results for 6 months. If you enrich the same person again within that
        window, the cached data is returned at no additional credit cost. This makes it safe to re-run
        enrichments on overlapping contact lists.
      </p>

      <DocsTip>
        Before running a large bulk operation, check your credit balance in Settings to make sure you have
        enough credits to complete the full batch.
      </DocsTip>
    </>
  );
}
```

- [ ] **Step 5: Create settings.tsx**

```tsx
// src/data/docs/settings.tsx
import { DocsTip } from "@/components/docs/DocsTip";

export default function SettingsSection() {
  return (
    <>
      <h2 id="profile" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        Profile
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        View and update your display name. Your email address is shown but cannot be changed directly
        — contact your admin if you need to update it.
      </p>

      <h2 id="security" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Security
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        Change your password from the Security tab. You'll need to enter your current password and
        confirm the new one.
      </p>

      <h2 id="workspace-info" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Workspace Info
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        The Settings page shows your workspace name and remaining credit balance. The credit indicator is
        color-coded — green (healthy), amber (running low), red (critically low).
      </p>

      <DocsTip>
        Check your credits in Settings before running large bulk operations to make sure you have enough
        to complete the full batch.
      </DocsTip>
    </>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/data/docs/results.tsx src/data/docs/database.tsx src/data/docs/analytics.tsx src/data/docs/credits.tsx src/data/docs/settings.tsx
git commit -m "feat(docs): add Results, Database, Analytics, Credits, Settings content sections"
```

---

## Task 11: Content Section — Group 4 (Admin)

**Files:**
- Create: `src/data/docs/admin.tsx`

- [ ] **Step 1: Create admin.tsx**

```tsx
// src/data/docs/admin.tsx
import { DocsWarning } from "@/components/docs/DocsWarning";

export default function AdminSection() {
  return (
    <>
      <DocsWarning>
        This section is only relevant to workspace administrators. If you don't see the Admin option
        in your avatar menu, you don't have admin access.
      </DocsWarning>

      <h2 id="user-management" className="text-[17px] font-semibold text-[#e5e7eb] mt-8 mb-3 scroll-mt-24">
        User Management
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        From the Admin panel, you can manage all users in your workspace:
      </p>
      <ul className="space-y-1.5 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-disc list-outside">
        <li><span className="text-emerald-400">View users</span> — see all members with their roles and status</li>
        <li><span className="text-emerald-400">Create users</span> — add new team members (they'll receive a welcome email with login credentials)</li>
        <li><span className="text-emerald-400">Delete users</span> — remove users who no longer need access</li>
      </ul>

      <h2 id="credit-management" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Credit Management
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        As an admin, you control the workspace's credit pool:
      </p>
      <ul className="space-y-1.5 text-[14px] text-[#b0b8c0] mb-4 ml-4 list-disc list-outside">
        <li><span className="text-emerald-400">View balance</span> — current workspace credit balance</li>
        <li><span className="text-emerald-400">Top-up credits</span> — add credits to the workspace pool via the top-up dialog</li>
        <li><span className="text-emerald-400">Transaction history</span> — complete log of all credit additions and deductions with timestamps</li>
      </ul>

      <h2 id="workspace-settings" className="text-[17px] font-semibold text-[#e5e7eb] mt-10 mb-3 scroll-mt-24">
        Workspace Settings
      </h2>
      <p className="text-[14px] text-[#b0b8c0] leading-relaxed mb-4">
        View workspace details including the workspace name, creation date, and total member count.
      </p>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/docs/admin.tsx
git commit -m "feat(docs): add Admin (Workspace & Users) content section"
```

---

## Task 12: Add docs-content Prose Styles & Verify Full Page

**Files:**
- Modify: `src/index.css` (or global CSS file)

- [ ] **Step 1: Find the global CSS file**

Run: `grep -rl "@tailwind base" src/ --include="*.css" | head -5`

This will find the main CSS entry point (likely `src/index.css`).

- [ ] **Step 2: Add docs-content styles**

Append these styles to the end of the global CSS file (after the existing `@tailwind` directives and any custom styles):

```css
/* Docs content typography */
.docs-content h2 {
  scroll-margin-top: 6rem;
}
.docs-content h3 {
  scroll-margin-top: 6rem;
}
.docs-content p {
  line-height: 1.7;
}
.docs-content a {
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}
.docs-content code {
  font-size: 0.85em;
}
```

- [ ] **Step 3: Start the dev server and verify the page loads**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && cd /c/Pranav/SiddhaAI/02_Bravoro/01_WebsiteRepo/leapleadsai && npm run dev`

Open `http://localhost:8080/docs` in a browser. Verify:
1. Redirect to `/docs/overview` works
2. TOC sidebar is visible and pinned
3. Overview content renders with feature cards and credit table
4. Clicking TOC items navigates between sections
5. Right rail appears on wide screens (> 1280px)
6. Previous/Next navigation works at bottom of each section
7. Pin/unpin toggle works on TOC
8. Mobile: TOC hidden, hamburger button shows overlay

- [ ] **Step 4: Commit styles**

```bash
git add src/index.css
git commit -m "feat(docs): add docs-content prose styles"
```

---

## Task 13: Verify Avatar Menu & Final Polish

**Files:** (no new files — verification only)

- [ ] **Step 1: Verify avatar menu item**

Log into the app at `http://localhost:8080/dashboard`, click the avatar in the sidebar. Verify:
1. "Documentation" item appears between Dev Tools/Admin and Settings
2. Clicking it navigates to `/docs/overview`
3. The BookOpen icon is visible

- [ ] **Step 2: Verify all 13 sections load without errors**

Click through each section in the TOC and verify no console errors:
- Overview, Getting Started
- Single Search, Bulk Search, People Enrichment, AI Staffing Chat, Recruiting Chat
- Results & Export, Database, Analytics, Credits, Settings
- Workspace & Users (Admin)

- [ ] **Step 3: Verify right rail heading tracking**

On any section with multiple h2 headings (e.g., Credits), scroll through and verify the right rail highlights the current heading.

- [ ] **Step 4: Verify breadcrumb shows correct group**

- `/docs/overview` → "Docs › Overview" (no group)
- `/docs/bulk-search` → "Docs › Features › Bulk Search"
- `/docs/credits` → "Docs › Platform › Credits"
- `/docs/admin` → "Docs › Admin › Workspace & Users"

- [ ] **Step 5: Screenshot and review**

Run: `node screenshot.mjs http://localhost:8080/docs/overview overview-docs`

Review the screenshot. Check layout, spacing, typography match the Bravoro dark theme.

- [ ] **Step 6: Final commit if any polish was needed**

```bash
git add -A
git commit -m "fix(docs): polish docs page layout and content"
```
