import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  Home, 
  BarChart3, 
  FileText, 
  Shield, 
  LogOut,
  ChevronRight,
  Database
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  isAdmin?: boolean;
  onSignOut: () => void;
  onHomeClick?: () => void;
}

interface NavItem {
  icon: React.ElementType;
  label: string;
  path?: string;
  onClick?: () => void;
  isDestructive?: boolean;
  adminOnly?: boolean;
}

export const AppSidebar = ({ isAdmin, onSignOut, onHomeClick }: AppSidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);

  const navItems: NavItem[] = [
    { 
      icon: Home, 
      label: "Home", 
      onClick: onHomeClick || (() => navigate("/dashboard"))
    },
    { icon: BarChart3, label: "Analytics", path: "/analytics" },
    { icon: FileText, label: "Results", path: "/results" },
    { icon: Database, label: "Database", path: "/database" },
    { icon: Shield, label: "Admin", path: "/admin", adminOnly: true },
  ];

  const bottomItems: NavItem[] = [
    { icon: LogOut, label: "Sign Out", onClick: onSignOut, isDestructive: true },
  ];

  const renderNavItem = (item: NavItem, index: number) => {
    if (item.adminOnly && !isAdmin) return null;

    const isActive = item.path && location.pathname === item.path;
    const Icon = item.icon;

    return (
      <button
        key={index}
        onClick={() => {
          if (item.onClick) {
            item.onClick();
          } else if (item.path) {
            navigate(item.path);
          }
        }}
        className={cn(
          "group relative flex items-center w-full rounded-xl transition-all duration-300",
          "hover:bg-sidebar-accent/80",
          isExpanded ? "px-4 py-3 gap-4" : "p-3 justify-center",
          isActive && "bg-primary/20 text-primary",
          item.isDestructive && "hover:bg-destructive/10 hover:text-destructive"
        )}
      >
        <div className={cn(
          "relative flex items-center justify-center",
          "transition-transform duration-300 group-hover:scale-110"
        )}>
          <Icon className={cn(
            "h-5 w-5 transition-colors",
            isActive ? "text-primary" : "text-sidebar-foreground/70",
            item.isDestructive && "group-hover:text-destructive"
          )} />
          {isActive && (
            <span className="absolute -inset-2 bg-primary/20 rounded-lg blur-sm" />
          )}
        </div>
        
        <span className={cn(
          "font-medium text-sm whitespace-nowrap transition-all duration-300",
          isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 absolute",
          isActive ? "text-primary" : "text-sidebar-foreground/80",
          item.isDestructive && "group-hover:text-destructive"
        )}>
          {item.label}
        </span>

        {isActive && !isExpanded && (
          <span className="absolute left-0 w-0.5 h-6 bg-primary rounded-r-full" />
        )}
      </button>
    );
  };

  return (
    <aside
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      className={cn(
        "fixed left-0 top-0 h-screen z-50",
        "bg-sidebar-background/95 backdrop-blur-xl",
        "border-r border-sidebar-border/50",
        "flex flex-col",
        "transition-all duration-300 ease-out",
        isExpanded ? "w-56" : "w-16"
      )}
    >
      {/* Navigation */}
      <nav className="flex-1 flex flex-col p-2 pt-4 gap-1">
        {navItems.map((item, index) => renderNavItem(item, index))}
      </nav>

      {/* Bottom Actions */}
      <div className="p-2 border-t border-sidebar-border/50">
        {bottomItems.map((item, index) => renderNavItem(item, index))}
      </div>

      {/* Expand Indicator */}
      <div className={cn(
        "absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2",
        "w-5 h-10 flex items-center justify-center",
        "bg-sidebar-background border border-sidebar-border/50 rounded-full",
        "transition-all duration-300",
        isExpanded ? "opacity-0 scale-75" : "opacity-100 scale-100"
      )}>
        <ChevronRight className="h-3 w-3 text-sidebar-foreground/50" />
      </div>
    </aside>
  );
};