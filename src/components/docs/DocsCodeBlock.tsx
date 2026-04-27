export function DocsCodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 rounded-lg bg-muted/40 border border-border px-4 py-3 font-mono text-[12px] text-accent/80 overflow-x-auto">
      {children}
    </div>
  );
}
