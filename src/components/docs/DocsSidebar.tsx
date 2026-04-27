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
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-accent" />
          <span className="text-[14px] font-semibold text-foreground">Documentation</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPinChange(!pinned)}
            className="hidden md:flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted transition-colors"
            title={pinned ? "Unpin sidebar" : "Pin sidebar"}
          >
            {pinned ? (
              <Pin className="w-3.5 h-3.5 text-accent" />
            ) : (
              <PinOff className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </button>
          <button
            onClick={onMobileClose}
            className="md:hidden flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search docs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-md bg-muted border border-border text-[12px] text-foreground placeholder-[#6b7280] focus:outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {filteredGroups.map((group) => (
          <div key={group.group ?? "__ungrouped"} className="mt-2">
            {group.group && (
              <div className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                    ? "border-emerald-400 bg-accent/10 text-accent font-medium"
                    : "border-transparent text-foreground hover:bg-muted hover:text-foreground"
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
          "hidden md:flex flex-col flex-shrink-0 border-r border-border bg-muted/40/90 backdrop-blur-sm transition-all duration-300 overflow-hidden",
          pinned ? "w-[200px]" : "w-0"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop: floating toggle when unpinned */}
      {!pinned && (
        <button
          onClick={() => onPinChange(true)}
          className="hidden md:flex fixed left-[72px] top-1/2 -translate-y-1/2 z-30 items-center justify-center w-8 h-8 rounded-full bg-muted border border-border shadow-lg hover:bg-[#224040] transition-colors"
          title="Open docs sidebar"
        >
          <Menu className="w-4 h-4 text-accent" />
        </button>
      )}

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={onMobileClose}
          />
          <aside className="md:hidden fixed left-0 top-0 bottom-0 w-[260px] bg-muted/40 z-50 shadow-2xl">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
