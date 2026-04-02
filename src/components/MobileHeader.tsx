import { useLocation } from "react-router-dom";
import logoIcon from "@/assets/Logo_icon_final.png";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Search",
  "/results": "Results",
  "/analytics": "Analytics",
  "/database": "Database",
  "/admin": "Admin",
  "/dev-tools": "Dev Tools",
  "/settings": "Settings",
  "/contact": "Contact",
};

export function MobileHeader() {
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] || "Bravoro";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex md:hidden h-14 bg-sidebar-background/95 backdrop-blur-xl border-b border-sidebar-border/50 items-center px-4 gap-3">
      <img src={logoIcon} alt="Bravoro" className="h-7 w-7 rounded-md" />
      <span className="text-sm font-semibold text-foreground truncate">{title}</span>
    </header>
  );
}
