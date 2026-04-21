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

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
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
