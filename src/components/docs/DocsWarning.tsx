import { AlertTriangle } from "lucide-react";

export function DocsWarning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-4 rounded-lg border border-amber-500/25 bg-amber-500/5 text-[13px] text-amber-400/80 my-4">
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
