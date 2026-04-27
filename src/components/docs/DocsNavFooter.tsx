import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DocSection } from "@/data/docs/sections";

interface DocsNavFooterProps {
  prev: DocSection | null;
  next: DocSection | null;
}

export function DocsNavFooter({ prev, next }: DocsNavFooterProps) {
  return (
    <div className="flex items-center justify-between mt-12 pt-6 border-t border-border">
      {prev ? (
        <Link
          to={`/docs/${prev.slug}`}
          className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-accent transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <div>
            <div className="text-[11px] text-muted-foreground">Previous</div>
            <div className="font-medium">{prev.title}</div>
          </div>
        </Link>
      ) : <div />}
      {next ? (
        <Link
          to={`/docs/${next.slug}`}
          className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-accent transition-colors text-right"
        >
          <div>
            <div className="text-[11px] text-muted-foreground">Next</div>
            <div className="font-medium">{next.title}</div>
          </div>
          <ChevronRight className="w-4 h-4" />
        </Link>
      ) : <div />}
    </div>
  );
}
