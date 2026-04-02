import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, BarChart3, MessageSquare, MoreHorizontal, Settings, Terminal, Shield, TrendingUp } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface MobileTabBarProps {
  isAdmin?: boolean;
  isDeveloper?: boolean;
}

const TABS = [
  { icon: Search, label: "Search", path: "/dashboard" },
  { icon: BarChart3, label: "Results", path: "/results" },
  { icon: MessageSquare, label: "AI Chat", path: "/dashboard", query: "?tab=ai_staffing" },
  { icon: MoreHorizontal, label: "More", path: "__more__" },
] as const;

export function MobileTabBar({ isAdmin = false, isDeveloper = false }: MobileTabBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (tab: typeof TABS[number]) => {
    if (tab.path === "__more__") return false;
    if (tab.label === "AI Chat") {
      return location.pathname === "/dashboard" && location.search.includes("ai_staffing");
    }
    return location.pathname === tab.path && !location.search.includes("ai_staffing");
  };

  const handleTabPress = (tab: typeof TABS[number]) => {
    if (tab.path === "__more__") {
      setMoreOpen(true);
      return;
    }
    if (tab.query) {
      navigate(tab.path + tab.query);
    } else {
      navigate(tab.path);
    }
  };

  const moreItems = [
    { icon: Settings, label: "Settings", path: "/settings" },
    { icon: TrendingUp, label: "Analytics", path: "/analytics" },
    ...(isDeveloper ? [{ icon: Terminal, label: "Dev Tools", path: "/dev-tools" }] : []),
    ...(isAdmin ? [{ icon: Shield, label: "Admin", path: "/admin" }] : []),
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden bg-sidebar-background/95 backdrop-blur-xl border-t border-sidebar-border/50">
        <div className="flex items-center justify-around w-full h-16 pb-[env(safe-area-inset-bottom)]">
          {TABS.map((tab) => {
            const active = isActive(tab);
            return (
              <button
                key={tab.label}
                onClick={() => handleTabPress(tab)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 flex-1 h-full",
                  "transition-colors duration-200",
                  active ? "text-emerald-400" : "text-muted-foreground"
                )}
              >
                <tab.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="bg-sidebar-background border-sidebar-border/50">
          <SheetHeader>
            <SheetTitle className="text-foreground">More</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1 mt-4 pb-4">
            {moreItems.map((item) => (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setMoreOpen(false);
                }}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-left",
                  "transition-colors duration-200",
                  location.pathname === item.path
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "text-muted-foreground hover:bg-muted/30"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
