import { useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Home,
  BarChart3,
  FileText,
  Shield,
  LogOut,
  ChevronRight,
  Database,
  Plus,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
  Pin,
  PinOff,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface AiConv {
  id: string;
  title: string;
}

interface AppSidebarProps {
  isAdmin?: boolean;
  onSignOut: () => void;
  onHomeClick?: () => void;
  selectedType?: string | null;
  aiConversations?: AiConv[];
  aiActiveId?: string;
  onSelectAiConv?: (id: string) => void;
  onNewAiChat?: () => void;
  onRenameAiConv?: (id: string, newTitle: string) => void;
  onDeleteAiConv?: (id: string) => void;
  onPinChange?: (pinned: boolean) => void;
}

interface NavItem {
  icon: React.ElementType;
  label: string;
  path?: string;
  onClick?: () => void;
  adminOnly?: boolean;
}

export const AppSidebar = ({
  isAdmin,
  onSignOut,
  onHomeClick,
  selectedType,
  aiConversations = [],
  aiActiveId,
  onSelectAiConv,
  onNewAiChat,
  onRenameAiConv,
  onDeleteAiConv,
  onPinChange,
}: AppSidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const isExpanded = isHovered || isPinned;
  const isAiStaffingActive = selectedType === "ai_staffing";
  const showYourChats = isAiStaffingActive && isExpanded;

  const navItems: NavItem[] = [
    {
      icon: Home,
      label: "Home",
      onClick: onHomeClick || (() => navigate("/dashboard")),
    },
    { icon: BarChart3, label: "Analytics", path: "/analytics" },
    { icon: FileText, label: "Results", path: "/results" },
    { icon: Database, label: "Database", path: "/database" },
    { icon: Shield, label: "Admin", path: "/admin", adminOnly: true },
  ];

  const togglePin = () => {
    const next = !isPinned;
    setIsPinned(next);
    onPinChange?.(next);
  };

  const handleRenameStart = (conv: AiConv) => {
    setRenamingId(conv.id);
    setRenameValue(conv.title);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const handleRenameCommit = (id: string) => {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (trimmed) onRenameAiConv?.(id, trimmed);
  };

  const handleRenameKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    id: string
  ) => {
    if (e.key === "Enter") handleRenameCommit(id);
    if (e.key === "Escape") setRenamingId(null);
  };

  const renderNavItem = (item: NavItem, index: number) => {
    if (item.adminOnly && !isAdmin) return null;

    const isActive = item.path ? location.pathname === item.path : false;
    const Icon = item.icon;

    return (
      <button
        key={index}
        onClick={() => {
          if (item.onClick) item.onClick();
          else if (item.path) navigate(item.path);
        }}
        className={cn(
          "group relative flex items-center w-full rounded-xl duration-300",
          "hover:bg-sidebar-accent/80",
          isExpanded ? "px-4 py-3 gap-4" : "p-3 justify-center",
          isActive && "bg-primary/20 text-primary"
        )}
      >
        <div className="relative flex items-center justify-center duration-300 group-hover:scale-110">
          <Icon
            className={cn(
              "h-5 w-5 duration-200",
              isActive ? "text-primary" : "text-sidebar-foreground/70"
            )}
          />
          {isActive && (
            <span className="absolute -inset-2 bg-primary/20 rounded-lg blur-sm" />
          )}
        </div>

        <span
          className={cn(
            "font-medium text-sm whitespace-nowrap duration-300",
            isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 absolute",
            isActive ? "text-primary" : "text-sidebar-foreground/80"
          )}
        >
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "fixed left-0 top-0 h-screen z-50",
        "bg-sidebar-background/95 backdrop-blur-xl",
        "border-r border-sidebar-border/50",
        "flex flex-col",
        "duration-300 ease-out",
        isExpanded ? "w-56" : "w-16"
      )}
    >
      {/* Navigation */}
      <nav className="flex-1 flex flex-col p-2 pt-4 gap-1 min-h-0 overflow-hidden">
        {navItems.map((item, index) => renderNavItem(item, index))}

        {/* Divider */}
        <div
          className={cn(
            "my-1 border-t border-sidebar-border/40",
            isExpanded ? "mx-2" : "mx-1"
          )}
        />

        {/* Your Chats section — visible when AI Staffing is active and sidebar is expanded */}
        {showYourChats && (
          <div className="flex flex-col gap-0.5 min-h-0 animate-fade-in overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
              <span className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                Your Chats
              </span>
              <button
                onClick={onNewAiChat}
                className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 duration-150"
                title="New chat"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
              {aiConversations.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    "group relative flex items-center rounded-lg duration-150",
                    conv.id === aiActiveId
                      ? "bg-primary/15 border border-primary/20"
                      : "border border-transparent hover:bg-muted/50"
                  )}
                >
                  {renamingId === conv.id ? (
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => handleRenameKeyDown(e, conv.id)}
                      onBlur={() => handleRenameCommit(conv.id)}
                      className="flex-1 min-w-0 px-3 py-2 text-xs bg-transparent outline-none text-foreground border-b border-primary/50"
                    />
                  ) : (
                    <button
                      onClick={() => onSelectAiConv?.(conv.id)}
                      className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left"
                    >
                      <MessageSquare
                        className={cn(
                          "h-3 w-3 shrink-0",
                          conv.id === aiActiveId ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <span
                        className={cn(
                          "truncate text-xs",
                          conv.id === aiActiveId
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-foreground"
                        )}
                      >
                        {conv.title}
                      </span>
                    </button>
                  )}

                  {renamingId !== conv.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={cn(
                            "shrink-0 p-1 mr-1 rounded-md duration-150",
                            "text-muted-foreground hover:text-foreground hover:bg-muted/80",
                            "opacity-0 group-hover:opacity-100 focus:opacity-100",
                            conv.id === aiActiveId && "opacity-100"
                          )}
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-32 z-[200]"
                        sideOffset={4}
                      >
                        <DropdownMenuItem
                          className="gap-2 cursor-pointer text-xs"
                          onSelect={() => handleRenameStart(conv)}
                        >
                          <Pencil className="h-3 w-3" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2 cursor-pointer text-xs text-destructive focus:text-destructive"
                          onSelect={() => onDeleteAiConv?.(conv.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Bottom Actions */}
      <div className="p-2 border-t border-sidebar-border/50 flex flex-col gap-1">
        {/* Pin toggle */}
        <button
          onClick={togglePin}
          className={cn(
            "group flex items-center w-full rounded-xl duration-300",
            isExpanded ? "px-4 py-2.5 gap-4" : "p-2.5 justify-center",
            isPinned
              ? "text-primary hover:bg-primary/10"
              : "text-sidebar-foreground/40 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent/60"
          )}
          title={isPinned ? "Unpin sidebar" : "Pin sidebar open"}
        >
          {isPinned ? (
            <PinOff className="h-4 w-4 shrink-0" />
          ) : (
            <Pin className="h-4 w-4 shrink-0" />
          )}
          <span
            className={cn(
              "text-xs whitespace-nowrap duration-300",
              isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 absolute"
            )}
          >
            {isPinned ? "Unpin sidebar" : "Pin sidebar"}
          </span>
        </button>

        {/* Sign out */}
        <button
          onClick={onSignOut}
          className={cn(
            "group relative flex items-center w-full rounded-xl duration-300",
            "hover:bg-destructive/10",
            isExpanded ? "px-4 py-3 gap-4" : "p-3 justify-center"
          )}
        >
          <div className="relative flex items-center justify-center duration-300 group-hover:scale-110">
            <LogOut className="h-5 w-5 duration-200 text-sidebar-foreground/70 group-hover:text-destructive" />
          </div>
          <span
            className={cn(
              "font-medium text-sm whitespace-nowrap duration-300 text-sidebar-foreground/80 group-hover:text-destructive",
              isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 absolute"
            )}
          >
            Sign Out
          </span>
        </button>
      </div>

      {/* Expand indicator */}
      <div
        className={cn(
          "absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2",
          "w-5 h-10 flex items-center justify-center",
          "bg-sidebar-background border border-sidebar-border/50 rounded-full",
          "duration-300",
          isExpanded ? "opacity-0 scale-75 pointer-events-none" : "opacity-100 scale-100"
        )}
      >
        <ChevronRight className="h-3 w-3 text-sidebar-foreground/50" />
      </div>
    </aside>
  );
};
