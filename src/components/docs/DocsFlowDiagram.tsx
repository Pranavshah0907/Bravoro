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
