import { useEffect, useState } from "react";
import { Search, Upload, Users, Bot, UserSearch, ArrowUpRight, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type DashboardEnrichmentType =
  | "manual"
  | "bulk"
  | "people_enrichment"
  | "ai_staffing"
  | "recruiting_chat";

interface ToolDef {
  type: DashboardEnrichmentType;
  title: string;
  blurb: string;
  icon: LucideIcon;
  meta: string;
}

const FEATURED: ToolDef = {
  type: "ai_staffing",
  title: "AI-based Staffing",
  blurb:
    "Chat naturally with an AI recruiter that builds, filters and shortlists candidates against your role spec — no SQL, no boolean strings.",
  icon: Bot,
  meta: "Saved conversations",
};

const SECONDARY: ToolDef[] = [
  {
    type: "manual",
    title: "Single Search",
    blurb: "One company in, verified contacts out.",
    icon: Search,
    meta: "Mobile · Direct · Email",
  },
  {
    type: "bulk",
    title: "Bulk Search",
    blurb: "Hundreds of companies enriched in a single overnight pass.",
    icon: Upload,
    meta: "Up to 500 / file",
  },
  {
    type: "people_enrichment",
    title: "Bulk People Enrichment",
    blurb: "Refresh an existing contact list with current titles and contact info.",
    icon: Users,
    meta: "CSV or Sheets",
  },
  {
    type: "recruiting_chat",
    title: "Recruiting Search",
    blurb: "Find candidates by role, skills and location using natural language.",
    icon: UserSearch,
    meta: "Best for active reqs",
  },
];

interface DashboardHomeProps {
  onSelect: (type: DashboardEnrichmentType) => void;
  userName?: string;
}

export const DashboardHome = ({ onSelect, userName }: DashboardHomeProps) => {
  const greeting = useGreeting();
  const dateLabel = useDateLabel();

  const displayName =
    userName && userName.length > 0
      ? userName.charAt(0).toUpperCase() + userName.slice(1)
      : "there";

  return (
    <div className="relative px-6 lg:px-12 xl:px-16 py-10 lg:py-16 max-w-[1320px] mx-auto">
      {/* ── Editorial header ── */}
      <header className="mb-10 lg:mb-14 animate-fade-in">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <span className="inline-flex items-center gap-2 eyebrow text-foreground/60">
            <span className="relative flex items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-emerald-500/40 blur-[3px] breathe" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <span>Live · {dateLabel}</span>
          </span>
          <span className="hidden sm:inline-block h-3 w-px bg-border" />
          <span className="eyebrow text-foreground/40">Bravoro · Workspace</span>
        </div>

        <h1 className="text-foreground leading-[0.95] tracking-[-0.025em] max-w-[20ch]">
          <span className="block text-4xl md:text-5xl lg:text-6xl font-semibold">
            {greeting},
          </span>
          <span className="block text-4xl md:text-5xl lg:text-6xl font-semibold text-primary">
            {displayName}
            <span className="text-foreground/30">.</span>
          </span>
        </h1>

        <p className="mt-5 text-base lg:text-lg text-muted-foreground max-w-[55ch] leading-relaxed">
          Pick up where you left off, or start a new enrichment pass. Every search
          returns verified mobile, direct, and email contacts — sourced and
          de-duplicated automatically.
        </p>
      </header>

      {/* ── Bento grid: 1 featured + 4 secondary ── */}
      <section
        aria-label="Enrichment tools"
        className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4"
      >
        {/* Featured card — col-span-7, full height of right column */}
        <FeaturedCard
          tool={FEATURED}
          onClick={() => onSelect(FEATURED.type)}
        />

        {/* Right column — 4 secondary tools as compact rows */}
        <div className="lg:col-span-5 grid grid-cols-1 gap-3 lg:gap-4">
          {SECONDARY.map((tool, idx) => (
            <SecondaryRow
              key={tool.type}
              tool={tool}
              onClick={() => onSelect(tool.type)}
              animationDelay={(idx + 1) * 80}
            />
          ))}
        </div>
      </section>

      {/* ── Tertiary editorial footer — quiet, builds trust ── */}
      <footer className="mt-16 lg:mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4">
        <FootStat label="Verified mobile rate" value="92.4%" tone="primary" />
        <FootStat label="Avg. enrichment time" value="38s" tone="muted" />
        <FootStat label="Sources cross-referenced" value="14" tone="muted" />
      </footer>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────── */
/* Featured card — large, single editorial moment per surface  */
/* ──────────────────────────────────────────────────────────── */
const FeaturedCard = ({
  tool,
  onClick,
}: {
  tool: ToolDef;
  onClick: () => void;
}) => {
  const Icon = tool.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative lg:col-span-7 lg:row-span-2 text-left",
        "card-paper card-paper-lift focus-ring",
        "flex flex-col justify-between overflow-hidden",
        "p-7 lg:p-9 min-h-[280px] lg:min-h-[420px]",
        "animate-slide-up"
      )}
      style={{ animationDelay: "120ms" }}
    >
      {/* Editorial accent — single hairline of teal at top, signals 'featured' without flooding */}
      <span
        aria-hidden
        className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent"
      />
      {/* Subtle warm wash in top-right corner — gives the card a 'light source' */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 h-72 w-72 rounded-full"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--primary) / 0.12) 0%, transparent 60%)",
          filter: "blur(20px)",
        }}
      />

      {/* Top row — eyebrow + icon */}
      <div className="relative flex items-start justify-between gap-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
          <span className="eyebrow text-primary/80">Recommended · {tool.meta}</span>
        </div>
        <div className="h-12 w-12 rounded-xl border border-border bg-[hsl(var(--surface-tint))] flex items-center justify-center group-hover:border-primary/40 transition-colors duration-300">
          <Icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
        </div>
      </div>

      {/* Title + blurb */}
      <div className="relative mt-auto pt-10">
        <h2 className="text-3xl lg:text-4xl xl:text-5xl font-semibold text-foreground tracking-tight leading-[1.05] mb-4 max-w-[18ch]">
          {tool.title}
        </h2>
        <p className="text-base lg:text-lg text-muted-foreground leading-relaxed max-w-[42ch]">
          {tool.blurb}
        </p>

        {/* CTA pill with island arrow */}
        <div className="mt-7 inline-flex items-center gap-2 rounded-full pl-4 pr-1.5 py-1.5 bg-foreground text-background text-sm font-medium shadow-sm group-hover:shadow-md transition-shadow duration-300">
          <span>Open {tool.title}</span>
          <span className="h-7 w-7 rounded-full bg-background/15 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-px">
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
        </div>
      </div>
    </button>
  );
};

/* ──────────────────────────────────────────────────────────── */
/* Secondary row — compact tool cards, list-like, not boxes    */
/* ──────────────────────────────────────────────────────────── */
const SecondaryRow = ({
  tool,
  onClick,
  animationDelay,
}: {
  tool: ToolDef;
  onClick: () => void;
  animationDelay: number;
}) => {
  const Icon = tool.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative card-paper card-paper-lift focus-ring text-left",
        "px-5 py-4 lg:px-6 lg:py-5",
        "flex items-center gap-4",
        "animate-slide-up"
      )}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* Icon */}
      <div
        className={cn(
          "shrink-0 h-10 w-10 rounded-lg flex items-center justify-center",
          "border border-border bg-[hsl(var(--surface-sunken))]",
          "transition-colors duration-300",
          "group-hover:border-primary/35 group-hover:bg-[hsl(var(--surface-tint))]"
        )}
      >
        <Icon className="h-4 w-4 text-foreground/70 group-hover:text-primary transition-colors duration-300" strokeWidth={1.75} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[15px] font-semibold text-foreground tracking-tight truncate">
            {tool.title}
          </h3>
          <span className="hidden sm:inline-block text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70 truncate max-w-[40%]">
            {tool.meta}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground leading-snug line-clamp-2">
          {tool.blurb}
        </p>
      </div>

      {/* Trailing arrow — appears on hover */}
      <div
        aria-hidden
        className="shrink-0 h-7 w-7 rounded-full bg-transparent flex items-center justify-center transition-all duration-300 group-hover:bg-foreground group-hover:text-background"
      >
        <ArrowUpRight
          className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-background transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-px"
          strokeWidth={2}
        />
      </div>
    </button>
  );
};

/* ──────────────────────────────────────────────────────────── */
/* Footer stat — three small editorial proofs                  */
/* ──────────────────────────────────────────────────────────── */
const FootStat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "muted";
}) => (
  <div className="border-t border-border pt-5 flex items-baseline justify-between gap-3 md:flex-col md:items-start md:gap-1.5">
    <span className="eyebrow text-muted-foreground">{label}</span>
    <span
      className={cn(
        "font-display text-3xl md:text-4xl tabular tracking-tight leading-none",
        tone === "primary" ? "text-primary" : "text-foreground"
      )}
    >
      {value}
    </span>
  </div>
);

/* ──────────────────────────────────────────────────────────── */
/* Helpers                                                      */
/* ──────────────────────────────────────────────────────────── */
function useGreeting() {
  const [g, setG] = useState(() => greetingFor(new Date()));
  useEffect(() => {
    // Refresh once a minute so the greeting transitions when the user
    // sits on the dashboard through 12:00 / 17:00 / 21:00.
    const tick = () => setG(greetingFor(new Date()));
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  return g;
}

function greetingFor(d: Date) {
  const h = d.getHours();
  if (h < 5) return "Burning the late shift";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good evening";
}

function useDateLabel() {
  const [s, setS] = useState(() => formatDate(new Date()));
  useEffect(() => {
    setS(formatDate(new Date()));
    const t = setInterval(() => setS(formatDate(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);
  return s;
}

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
