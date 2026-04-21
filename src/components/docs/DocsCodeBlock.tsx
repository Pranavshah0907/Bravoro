export function DocsCodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 rounded-lg bg-[#0d1f1f] border border-[#1e4040] px-4 py-3 font-mono text-[12px] text-emerald-300/80 overflow-x-auto">
      {children}
    </div>
  );
}
