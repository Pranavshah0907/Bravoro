import { ChevronRight } from "lucide-react";

interface DocsFlowDiagramProps {
  steps: string[];
}

export function DocsFlowDiagram({ steps }: DocsFlowDiagramProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 my-4 p-4 rounded-lg bg-card border border-border">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-md bg-muted border border-border text-[12px] font-medium text-accent">
            {step}
          </div>
          {i < steps.length - 1 && (
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}
