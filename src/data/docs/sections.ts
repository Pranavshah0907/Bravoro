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
