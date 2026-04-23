import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { LogOut, Settings, Shield, Terminal, ChevronUp, BookOpen, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

interface UserAvatarMenuProps {
  isExpanded: boolean;
  onSignOut: () => void;
  isAdmin?: boolean;
  isDeveloper?: boolean;
}

interface UserProfile {
  firstName: string | null;
  lastName: string | null;
  email: string;
  workspaceName: string | null;
}

function getInitials(profile: UserProfile): string {
  const { firstName, lastName, email } = profile;
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  if (firstName) {
    return firstName[0].toUpperCase();
  }
  if (email) {
    return email[0].toUpperCase();
  }
  return "?";
}

function getDisplayName(profile: UserProfile): string {
  const { firstName, lastName, email } = profile;
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }
  if (firstName) {
    return firstName;
  }
  return email;
}

export function UserAvatarMenu({ isExpanded, onSignOut, isAdmin = false, isDeveloper = false }: UserAvatarMenuProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({
    firstName: null,
    lastName: null,
    email: "",
    workspaceName: null,
  });

  useEffect(() => {
    async function fetchProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const email = user.email ?? "";

      const { data: profileData } = await supabase
        .from("profiles")
        .select("first_name, last_name, workspace_id")
        .eq("id", user.id)
        .single();

      let workspaceName: string | null = null;
      if (profileData?.workspace_id) {
        const { data: wsData } = await supabase
          .from("workspaces")
          .select("company_name")
          .eq("id", profileData.workspace_id)
          .single();
        workspaceName = wsData?.company_name ?? null;
      }

      setProfile({
        firstName: profileData?.first_name ?? null,
        lastName: profileData?.last_name ?? null,
        email,
        workspaceName,
      });
    }

    fetchProfile();
  }, []);

  const initials = getInitials(profile);
  const displayName = getDisplayName(profile);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center w-full rounded-lg transition-colors duration-200",
            "hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
            "active:bg-sidebar-accent",
            isExpanded ? "gap-3 px-3 py-2" : "justify-center p-2"
          )}
        >
          {/* Initials circle */}
          <div
            className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-xs font-bold select-none"
          >
            {initials}
          </div>

          {isExpanded && (
            <>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate leading-tight">
                  {profile.firstName || displayName}
                </p>
              </div>
              <ChevronUp
                className={cn(
                  "h-4 w-4 text-sidebar-foreground/60 transition-transform duration-200",
                  open && "rotate-180"
                )}
              />
            </>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-64 rounded-xl border-border bg-popover p-0 shadow-xl shadow-foreground/10"
      >
        {/* User info section */}
        <div className="px-4 py-3">
          <p className="text-sm font-medium text-popover-foreground truncate">
            {displayName}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {profile.email}
          </p>
          {profile.workspaceName && (
            <p className="text-xs text-primary truncate mt-1">
              {profile.workspaceName}
            </p>
          )}
        </div>

        <Separator className="bg-border" />

        {/* Menu items */}
        <div className="p-1.5">
          {isAdmin && (
            <button
              onClick={() => {
                setOpen(false);
                navigate("/admin");
              }}
              className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-popover-foreground transition-colors duration-200 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Shield className="h-4 w-4 text-muted-foreground" />
              Admin
            </button>
          )}
          {isDeveloper && (
            <button
              onClick={() => {
                setOpen(false);
                navigate("/dev-tools");
              }}
              className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-popover-foreground transition-colors duration-200 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Terminal className="h-4 w-4 text-muted-foreground" />
              Dev Tools
            </button>
          )}
          <button
            onClick={() => {
              setOpen(false);
              navigate("/docs");
            }}
            className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-popover-foreground transition-colors duration-200 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            Documentation
          </button>
          <div className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-popover-foreground">
            <Palette className="h-4 w-4 text-muted-foreground" />
            <span>Theme</span>
            <ThemeToggle className="ml-auto" />
          </div>
          <button
            onClick={() => {
              setOpen(false);
              navigate("/settings");
            }}
            className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-popover-foreground transition-colors duration-200 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings className="h-4 w-4 text-muted-foreground" />
            Settings
          </button>
        </div>

        <Separator className="bg-border" />

        <div className="p-1.5">
          <button
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-destructive/80 transition-colors duration-200 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}