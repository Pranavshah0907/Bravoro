import { useEffect, useState, useRef, Suspense } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Menu, ChevronRight } from "lucide-react";
import { DOC_SECTIONS, getSectionBySlug, getAdjacentSections } from "@/data/docs/sections";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { DocsRightRail } from "@/components/docs/DocsRightRail";
import { DocsNavFooter } from "@/components/docs/DocsNavFooter";
import { BravoroWordmark } from "@/components/BravoroWordmark";

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
    <div className="min-h-screen bg-background flex">
      {/* Background effects (matching app pattern) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-[-20%] left-[30%] w-[60%] h-[60%] rounded-full opacity-[0.08]"
          style={{
            background: "radial-gradient(ellipse, hsl(var(--primary)) 0%, transparent 70%)",
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
          <BravoroWordmark className="h-6 md:h-7 w-auto text-foreground" />
        </div>

        {/* Mobile header */}
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-background/90 backdrop-blur-sm border-b border-border">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
          >
            <Menu className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="text-[13px] text-muted-foreground truncate">
            <span className="text-muted-foreground/70">Docs</span>
            <ChevronRight className="w-3 h-3 inline mx-1 text-muted-foreground/70" />
            <span className="text-foreground/80">{section.title}</span>
          </div>
        </div>

        {/* Content + Right Rail wrapper */}
        <div className="flex max-w-[960px] mx-auto px-4 md:px-8 py-6 md:py-10 gap-8">
          {/* Content area */}
          <div ref={contentRef} className="flex-1 min-w-0">
            {/* Breadcrumb — desktop only */}
            <div className="hidden md:flex items-center gap-1 text-[12px] text-muted-foreground/70 mb-6">
              <span>Docs</span>
              <ChevronRight className="w-3 h-3" />
              {section.group && (
                <>
                  <span>{section.group}</span>
                  <ChevronRight className="w-3 h-3" />
                </>
              )}
              <span className="text-muted-foreground">{section.title}</span>
            </div>

            {/* Title block */}
            <h1 className="text-[22px] md:text-[26px] font-bold text-foreground tracking-tight mb-2">
              {section.title}
            </h1>
            <p className="text-[14px] text-muted-foreground mb-8 leading-relaxed">
              {section.subtitle}
            </p>

            {/* Section content */}
            <div className="docs-content prose-dark">
              <Suspense fallback={<div className="animate-pulse h-40 bg-muted rounded-lg" />}>
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
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground/70 hover:text-primary transition-colors"
          >
            ← Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
};

export default DocsPage;
