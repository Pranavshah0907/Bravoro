import { useLocation } from "react-router-dom";
import logoIcon from "@/assets/Logo_icon_final.png";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Home",
  "/results": "Results",
  "/analytics": "Analytics",
  "/database": "Database",
  "/admin": "Admin",
  "/dev-tools": "Dev Tools",
  "/settings": "Settings",
  "/contact": "Contact",
};

const DASHBOARD_TAB_TITLES: Record<string, string> = {
  ai_staffing: "AI Chat",
  recruiting_chat: "Recruiting",
  manual: "Single Search",
  bulk: "Bulk Search",
  people_enrichment: "People Enrichment",
};

export function MobileHeader() {
  const location = useLocation();
  const tab = new URLSearchParams(location.search).get("tab");
  const title =
    location.pathname === "/dashboard" && tab && DASHBOARD_TAB_TITLES[tab]
      ? DASHBOARD_TAB_TITLES[tab]
      : PAGE_TITLES[location.pathname] || "Bravoro";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex md:hidden h-14 bg-sidebar-background/95 backdrop-blur-xl border-b border-sidebar-border/50 items-center px-4 gap-3">
      <img src={logoIcon} alt="Bravoro" className="h-7 w-7 rounded-md" />
      <span className="text-sm font-semibold text-foreground truncate">{title}</span>
    </header>
  );
}
