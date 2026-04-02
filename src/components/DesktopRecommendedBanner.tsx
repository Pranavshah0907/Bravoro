import { useState } from "react";
import { Monitor, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface DesktopRecommendedBannerProps {
  pageKey: string;
}

export function DesktopRecommendedBanner({ pageKey }: DesktopRecommendedBannerProps) {
  const isMobile = useIsMobile();
  const storageKey = `desktop-banner-dismissed-${pageKey}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(storageKey) === "1"; }
    catch { return false; }
  });

  if (!isMobile || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(storageKey, "1"); }
    catch { /* ignore */ }
  };

  return (
    <div className="mx-3 mt-3 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3">
      <Monitor className="h-4 w-4 text-emerald-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-emerald-400">Best on desktop</p>
        <p className="text-[11px] text-muted-foreground">This page has large tables that work better on a wider screen.</p>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded hover:bg-emerald-500/20 transition-colors"
      >
        <X className="h-3.5 w-3.5 text-emerald-400" />
      </button>
    </div>
  );
}
