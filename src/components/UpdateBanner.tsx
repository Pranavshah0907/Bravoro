import { useVersionCheck } from "@/hooks/useVersionCheck";

export function UpdateBanner() {
  const updateAvailable = useVersionCheck();

  if (!updateAvailable) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-4 px-4 py-2.5 bg-primary text-primary-foreground text-[13px] font-medium shadow-lg">
      <span>A new version of Bravoro is available.</span>
      <button
        onClick={() => window.location.reload()}
        className="shrink-0 px-3 py-1 rounded-md bg-foreground/15 hover:bg-foreground/25 transition-colors font-semibold text-[12px]"
      >
        Reload now
      </button>
    </div>
  );
}
