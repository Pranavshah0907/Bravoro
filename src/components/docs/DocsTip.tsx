import { Lightbulb } from "lucide-react";

export function DocsTip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-4 rounded-lg border border-emerald-500/25 bg-accent/5 text-[13px] text-accent/90 my-4">
      <Lightbulb className="w-4 h-4 text-accent shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
