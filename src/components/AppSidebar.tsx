import { useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Home,
  BarChart3,
  FileText,
  ChevronRight,
  Database,
  Plus,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
  Pin,
  PinOff,
  Search,
  Upload,
  Users,
  Bot,
  UserSearch,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import bravoroIcon from "@/assets/Logo_icon_final.png";
import { UserAvatarMenu } from "@/components/UserAvatarMenu";

interface AiConv {
  id: string;
  title: string;
}

const DEVELOPER_EMAIL = "pranavshah0907@gmail.com";

interface AppSidebarProps {
  isAdmin?: boolean;
  isDeveloper?: boolean;
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
  onSelectEnrichment?: (type: string) => void;
  recruitConversations?: AiConv[];
  recruitActiveId?: string;
  onSelectRecruitConv?: (id: string) => void;
  onNewRecruitChat?: () => void;
  onRenameRecruitConv?: (id: string, newTitle: string) => void;
  onDeleteRecruitConv?: (id: string) => void;
}

interface NavItem {
  icon: React.ElementType;
  label: string;
  path?: string;
  onClick?: () => void;
}

export const AppSidebar = ({
  isAdmin,
  isDeveloper,
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
  onSelectEnrichment,
  recruitConversations = [],
  recruitActiveId,
  onSelectRecruitConv,
  onNewRecruitChat,
  onRenameRecruitConv,
  onDeleteRecruitConv,
}: AppSidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [anyDropdownOpen, setAnyDropdownOpen] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Keep sidebar expanded while any dropdown is open — prevents mouseLeave collapse
  const isExpanded = isHovered || isPinned || anyDropdownOpen;
  const isAiStaffingActive = selectedType === "ai_staffing";
  const isRecruitingActive = selectedType === "recruiting_chat";
  const showYourChats = (isAiStaffingActive || isRecruitingActive) && isExpanded;

  const navItems: NavItem[] = [
    {
      icon: Home,
      label: "Home",
      onClick: onHomeClick || (() => navigate("/dashboard")),
    },
    { icon: BarChart3, label: "Analytics", path: "/analytics" },
    { icon: FileText, label: "Results", path: "/results" },
    { icon: Database, label: "Database", path: "/database" },
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
    if (trimmed) {
      if (selectedType === "recruiting_chat") {
        onRenameRecruitConv?.(id, trimmed);
      } else {
        onRenameAiConv?.(id, trimmed);
      }
    }
  };

  const handleRenameKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    id: string
  ) => {
    if (e.key === "Enter") handleRenameCommit(id);
    if (e.key === "Escape") setRenamingId(null);
  };

  const renderNavItem = (item: NavItem, index: number) => {
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
          "group relative flex items-center w-full rounded-lg transition-colors duration-200",
          "hover:bg-sidebar-accent",
          isExpanded ? "px-3 py-2.5 gap-3" : "p-2.5 justify-center",
          isActive && [
            "bg-card dark:bg-primary/15",
            "shadow-[var(--elev-1)] dark:shadow-none",
            "ring-1 ring-border/70 dark:ring-0",
          ]
        )}
      >
        {/* Active rail — left edge accent stripe, present in both states */}
        {isActive && (
          <span
            aria-hidden
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary"
          />
        )}
        <div className="relative flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
          <Icon
            className={cn(
              "h-[18px] w-[18px] transition-colors duration-200",
              isActive ? "text-primary" : "text-sidebar-foreground/65 group-hover:text-sidebar-foreground"
            )}
            strokeWidth={1.75}
          />
        </div>

        <span
          className={cn(
            "text-[13.5px] whitespace-nowrap transition-all duration-300 tracking-tight",
            isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 absolute",
            isActive
              ? "text-foreground font-semibold"
              : "text-sidebar-foreground/80 font-medium group-hover:text-sidebar-foreground"
          )}
        >
          {item.label}
        </span>
      </button>
    );
  };

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "fixed left-0 top-0 h-screen z-50",
        "bg-sidebar dark:bg-sidebar-background/95 dark:backdrop-blur-xl",
        "border-r border-sidebar-border",
        "shadow-[inset_-1px_0_0_hsl(var(--sidebar-border)/0.6)]",
        "hidden md:flex flex-col",
        "duration-300 ease-out",
        isExpanded ? "w-56" : "w-16"
      )}
    >
      {/* Top header — B logo + pin toggle */}
      <div
        className={cn(
          "flex items-center shrink-0 px-2 pt-3 pb-2",
          isExpanded ? "justify-between" : "justify-center"
        )}
      >
        {/* B logo */}
        <div className="relative flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse, rgba(88,221,221,0.15), transparent 70%)",
              filter: "blur(6px)",
            }}
          />
          <img
            src={bravoroIcon}
            alt="Bravoro"
            className={cn(
              "relative object-contain duration-300",
              isExpanded ? "h-7 w-7" : "h-8 w-8"
            )}
          />
        </div>

        {/* Pin toggle — right side, only visible when expanded */}
        <button
          onClick={togglePin}
          className={cn(
            "flex items-center justify-center rounded-lg p-1.5 duration-200",
            "hover:bg-sidebar-accent/80",
            isPinned
              ? "text-primary"
              : "text-sidebar-foreground/35 hover:text-sidebar-foreground/70",
            isExpanded ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none absolute"
          )}
          title={isPinned ? "Unpin sidebar" : "Pin sidebar open"}
        >
          {isPinned ? (
            <PinOff className="h-3.5 w-3.5" />
          ) : (
            <Pin className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Scrollable middle section — nav + tools + chats all scroll together */}
      <nav className="flex-1 flex flex-col p-2 pt-2 gap-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
        {navItems.map((item, index) => renderNavItem(item, index))}

        {/* Divider */}
        <div
          className={cn(
            "my-1 border-t border-sidebar-border/40",
            isExpanded ? "mx-2" : "mx-1"
          )}
        />

        {/* Enrichment Tools section — always visible */}
        <div className="flex flex-col gap-0.5">
          {isExpanded && (
            <span className="px-3 pt-2 pb-1.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.16em]">
              Tools
            </span>
          )}
          {[
            { type: "manual", label: "Single Search", icon: Search },
            { type: "bulk", label: "Bulk Search", icon: Upload },
            { type: "people_enrichment", label: "Bulk People Enr.", icon: Users },
            { type: "ai_staffing", label: "AI Staffing", icon: Bot },
            { type: "recruiting_chat", label: "Recruiting", icon: UserSearch },
          ].map(({ type, label, icon: Icon }) => {
            const isActive = selectedType === type;
            return (
              <button
                key={type}
                onClick={() => {
                  if (onSelectEnrichment) {
                    onSelectEnrichment(type);
                  } else {
                    navigate(`/dashboard?tab=${type}`);
                  }
                }}
                title={!isExpanded ? label : undefined}
                className={cn(
                  "group relative flex items-center w-full rounded-lg transition-colors duration-200",
                  isExpanded ? "px-3 py-2 gap-3" : "p-2.5 justify-center",
                  isActive
                    ? [
                        "bg-card dark:bg-primary/15",
                        "shadow-[var(--elev-1)] dark:shadow-none",
                        "ring-1 ring-border/70 dark:ring-0",
                      ]
                    : "hover:bg-sidebar-accent"
                )}
              >
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-primary"
                  />
                )}
                <div className="relative flex items-center justify-center shrink-0">
                  <Icon
                    className={cn(
                      "h-[16px] w-[16px] transition-colors duration-200",
                      isActive ? "text-primary" : "text-sidebar-foreground/55 group-hover:text-sidebar-foreground"
                    )}
                    strokeWidth={1.75}
                  />
                </div>
                <span
                  className={cn(
                    "text-[12.5px] whitespace-nowrap transition-all duration-300 truncate tracking-tight",
                    isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 absolute",
                    isActive
                      ? "text-foreground font-semibold"
                      : "text-sidebar-foreground/70 font-medium group-hover:text-sidebar-foreground"
                  )}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Divider before chats */}
        {showYourChats && (
          <div className={cn("my-1 border-t border-sidebar-border/40", isExpanded ? "mx-2" : "mx-1")} />
        )}

        {/* Your Chats section */}
        {showYourChats && (() => {
          const isRecruiting = selectedType === "recruiting_chat";
          const activeConvs = isRecruiting ? recruitConversations : aiConversations;
          const currentActiveId = isRecruiting ? recruitActiveId : aiActiveId;
          const handleSelectConv = isRecruiting ? onSelectRecruitConv : onSelectAiConv;
          const handleNewChat = isRecruiting ? onNewRecruitChat : onNewAiChat;
          const handleRenameConvFn = isRecruiting ? onRenameRecruitConv : onRenameAiConv;
          const handleDeleteConvFn = isRecruiting ? onDeleteRecruitConv : onDeleteAiConv;

          return (
            <div className="flex flex-col gap-0.5 animate-fade-in">
              <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
                <span className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  Your Chats
                </span>
                <button
                  onClick={handleNewChat}
                  className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 duration-150"
                  title="New chat"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-0.5">
                {activeConvs.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    "group relative flex items-center rounded-lg duration-150",
                    conv.id === currentActiveId
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
                      onClick={() => handleSelectConv?.(conv.id)}
                      className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left"
                    >
                      <MessageSquare
                        className={cn(
                          "h-3 w-3 shrink-0",
                          conv.id === currentActiveId ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <span
                        className={cn(
                          "truncate text-xs",
                          conv.id === currentActiveId
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-foreground"
                        )}
                      >
                        {conv.title}
                      </span>
                    </button>
                  )}

                  {renamingId !== conv.id && (
                    <DropdownMenu
                      onOpenChange={(open) =>
                        setAnyDropdownOpen(open)
                      }
                    >
                      <DropdownMenuTrigger asChild>
                        <button
                          className={cn(
                            "shrink-0 p-1 mr-1 rounded-md duration-150",
                            "text-muted-foreground hover:text-foreground hover:bg-muted/80",
                            "opacity-0 group-hover:opacity-100 focus:opacity-100",
                            conv.id === currentActiveId && "opacity-100"
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
                          onSelect={() => handleDeleteConvFn?.(conv.id)}
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
          );
        })()}
      </nav>

      {/* Bottom — User Avatar Menu */}
      <div className="p-2 border-t border-sidebar-border/50">
        <UserAvatarMenu isExpanded={isExpanded} onSignOut={onSignOut} isAdmin={isAdmin} isDeveloper={isDeveloper} />
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
