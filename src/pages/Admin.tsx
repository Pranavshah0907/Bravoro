import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import {
  UserPlus, Loader2, Shield, Users, Shuffle, Target,
  BarChart3, CalendarIcon, Activity, Search, Database, Building2, ChevronDown,
  ChevronRight, Plus, MapPin, Phone, Mail, User as UserIcon, FolderOpen,
  Trash2,
} from "lucide-react";
import MasterDatabaseTab from "@/components/MasterDatabaseTab";
import WorkspaceSearches from "@/components/WorkspaceSearches";
import { z } from "zod";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileHeader } from "@/components/MobileHeader";
import { MobileTabBar } from "@/components/MobileTabBar";
import { DesktopRecommendedBanner } from "@/components/DesktopRecommendedBanner";
import bravoroLogo from "@/assets/bravoro-logo.svg";
import { format, subDays, subWeeks, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, endOfDay, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

const createUserSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters"),
  tempPassword: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "user"]),
});

interface Workspace {
  id: string;
  company_name: string;
  company_address: string | null;
  primary_contact_name: string;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  created_at: string;
  credits_balance: number;
  low_credit_threshold: number;
}

interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  requires_password_reset: boolean | null;
  workspace_id: string | null;
  workspace_name: string | null;
}

interface CreditData {
  id: string;
  user_id: string;
  apollo_credits: number;
  aleads_credits: number;
  lusha_credits: number;
  cognism_credits: number;
  theirstack_credits: number;
  created_at: string;
  grand_total_credits: number;
}

type AnalyticsTimePeriod = "billing" | "day" | "week" | "month";

type SelectedView = {
  type: "overview" | "workspace" | "independent" | "user" | "analytics" | "master-database";
  id?: string;
};

const INDEPENDENT_USER_VALUE = "__independent__";

const PLATFORM_COLORS = {
  cognism: "#8b5cf6",
  apollo: "#06b6d4",
  aleads: "#10b981",
  lusha: "#3b82f6",
  theirstack: "#f59e0b",
} as const;

const PLATFORM_LABEL_COLORS = ["#8b5cf6", "#06b6d4", "#10b981", "#3b82f6", "#f59e0b"] as const;

const Admin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [creatingUser, setCreatingUser] = useState(false);

  // Create user form
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserFullName, setNewUserFullName] = useState("");
  const [newUserTempPassword, setNewUserTempPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "user">("user");
  const [newUserWorkspaceId, setNewUserWorkspaceId] = useState<string>(INDEPENDENT_USER_VALUE);

  // Workspace credit top-up
  const [topUpDialogOpen, setTopUpDialogOpen] = useState(false);
  const [topUpWorkspaceId, setTopUpWorkspaceId] = useState<string>("");
  const [topUpWorkspaceName, setTopUpWorkspaceName] = useState<string>("");
  const [topUpAmount, setTopUpAmount] = useState<number>(0);
  const [topUpNote, setTopUpNote] = useState<string>("");
  const [toppingUp, setToppingUp] = useState(false);
  const [newWsInitialCredits, setNewWsInitialCredits] = useState<number>(0);
  const [transactionHistory, setTransactionHistory] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Navigation
  const [selectedView, setSelectedView] = useState<SelectedView>({ type: "overview" });

  // Workspace state
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set([INDEPENDENT_USER_VALUE]));

  // Create workspace form
  const [newWsName, setNewWsName] = useState("");
  const [newWsAddress, setNewWsAddress] = useState("");
  const [newWsContactName, setNewWsContactName] = useState("");
  const [newWsContactEmail, setNewWsContactEmail] = useState("");
  const [newWsContactPhone, setNewWsContactPhone] = useState("");

  // Create user dialog
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);

  // Assign workspace dialog (for independent users)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningUser, setAssigningUser] = useState<UserWithRole | null>(null);
  const [assignTargetWorkspaceId, setAssignTargetWorkspaceId] = useState<string>("");
  const [assigningWorkspace, setAssigningWorkspace] = useState(false);

  // Analytics — unified entity selector (workspace or user)
  const [analyticsEntityType, setAnalyticsEntityType] = useState<"user" | "workspace">("user");
  const [analyticsEntityId, setAnalyticsEntityId] = useState<string>("");
  const [userCreditData, setUserCreditData] = useState<CreditData[]>([]);
  const [workspaceMemberData, setWorkspaceMemberData] = useState<{ user: UserWithRole; credits: CreditData[] }[]>([]);
  const [analyticsTimePeriod, setAnalyticsTimePeriod] = useState<AnalyticsTimePeriod>("billing");
  const [analyticsSelectedDay, setAnalyticsSelectedDay] = useState<Date | undefined>(undefined);
  const [analyticsSelectedWeek, setAnalyticsSelectedWeek] = useState<Date | undefined>(undefined);
  const [analyticsSelectedMonth, setAnalyticsSelectedMonth] = useState<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [isDayPickerOpen, setIsDayPickerOpen] = useState(false);
  const [isWeekPickerOpen, setIsWeekPickerOpen] = useState(false);
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [entitySearch, setEntitySearch] = useState("");
  const [entityPopoverOpen, setEntityPopoverOpen] = useState(false);

  useEffect(() => { checkAdminAccess(); }, []);

  const checkAdminAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { navigate("/auth"); return; }
    setUser(session.user);

    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", session.user.id).single();

    if (roleData?.role !== "admin") {
      toast({ title: "Access Denied", description: "You don't have permission to access this page", variant: "destructive" });
      navigate("/dashboard");
      return;
    }

    setIsAdmin(true);
    setLoading(false);
    loadWorkspaces();
    loadUsers();
  };

  const loadWorkspaces = async () => {
    const { data } = await supabase
      .from("workspaces")
      .select("*")
      .order("company_name", { ascending: true });
    setWorkspaces(data || []);
  };

  const loadUsers = async () => {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, email, full_name, created_at, requires_password_reset, workspace_id");

    if (!profilesData) return;

    const { data: workspacesData } = await supabase.from("workspaces").select("id, company_name");
    const workspaceMap: Record<string, string> = Object.fromEntries(
      (workspacesData || []).map((w) => [w.id, w.company_name])
    );

    const { data: allRoles } = await supabase.from("user_roles").select("user_id, role");
    const roleMap: Record<string, string> = Object.fromEntries(
      (allRoles || []).map((r) => [r.user_id, r.role])
    );

    const usersWithRoles = profilesData.map((profile) => ({
      ...profile,
      role: roleMap[profile.id] || "user",
      workspace_id: profile.workspace_id || null,
      workspace_name: profile.workspace_id ? workspaceMap[profile.workspace_id] || null : null,
    }));

    setUsers(usersWithRoles);
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim() || !newWsContactName.trim()) {
      toast({ title: "Required fields missing", description: "Company name and primary contact name are required.", variant: "destructive" });
      return;
    }
    setCreatingWorkspace(true);
    try {
      const { data: newWs, error } = await supabase.from("workspaces").insert({
        company_name: newWsName.trim(),
        company_address: newWsAddress.trim() || null,
        primary_contact_name: newWsContactName.trim(),
        primary_contact_email: newWsContactEmail.trim() || null,
        primary_contact_phone: newWsContactPhone.trim() || null,
      }).select("id").single();
      if (error) throw error;

      if (newWsInitialCredits > 0 && newWs?.id) {
        await supabase.rpc("add_workspace_credits", {
          p_workspace_id: newWs.id,
          p_amount: newWsInitialCredits,
          p_type: "initial",
          p_note: "Initial credit allocation",
          p_created_by: user?.id ?? null,
        });
      }

      toast({ title: "Workspace Created", description: `"${newWsName}" has been created.` });
      setNewWsName(""); setNewWsAddress(""); setNewWsContactName("");
      setNewWsContactEmail(""); setNewWsContactPhone(""); setNewWsInitialCredits(0);
      setWorkspaceDialogOpen(false);
      loadWorkspaces();
      loadUsers();
    } catch (err: any) {
      toast({ title: "Failed to create workspace", description: err.message || "An error occurred", variant: "destructive" });
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const handleDeleteWorkspace = async (workspaceId: string, companyName: string) => {
    const usersInWorkspace = users.filter((u) => u.workspace_id === workspaceId).length;
    const confirmMsg = usersInWorkspace > 0
      ? `Delete workspace "${companyName}"? The ${usersInWorkspace} user(s) in this workspace will become independent users.`
      : `Delete workspace "${companyName}"? This cannot be undone.`;
    if (!confirm(confirmMsg)) return;

    const { error } = await supabase.from("workspaces").delete().eq("id", workspaceId);
    if (error) {
      toast({ title: "Failed to delete workspace", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Workspace Deleted", description: `"${companyName}" has been removed.` });
      // If currently viewing this workspace, go to overview
      if (selectedView.type === "workspace" && selectedView.id === workspaceId) {
        setSelectedView({ type: "overview" });
      }
      loadWorkspaces();
      loadUsers();
    }
  };

  const handleAssignWorkspace = async () => {
    if (!assigningUser || !assignTargetWorkspaceId) return;
    setAssigningWorkspace(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ workspace_id: assignTargetWorkspaceId })
        .eq("id", assigningUser.id);
      if (error) throw error;
      toast({ title: "Workspace Assigned", description: `${assigningUser.email} has been moved to the workspace.` });
      setAssignDialogOpen(false);
      setAssigningUser(null);
      setAssignTargetWorkspaceId("");
      loadUsers();
    } catch (err: any) {
      toast({ title: "Failed to assign workspace", description: err.message || "An error occurred", variant: "destructive" });
    } finally {
      setAssigningWorkspace(false);
    }
  };

  const fetchUserAnalytics = async (userId: string) => {
    if (!userId) return;
    setLoadingAnalytics(true);
    try {
      const { data, error } = await supabase
        .from("credit_usage").select("*").eq("user_id", userId).order("created_at", { ascending: true });
      if (error) throw error;
      setUserCreditData(data || []);
    } catch (error) {
      toast({ title: "Failed to load analytics", description: "Could not fetch user analytics data", variant: "destructive" });
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const fetchWorkspaceAnalytics = async (workspaceId: string) => {
    if (!workspaceId) return;
    setLoadingAnalytics(true);
    try {
      const wsUsers = users.filter((u) => u.workspace_id === workspaceId);
      const wsUserIds = wsUsers.map((u) => u.id);
      const { data: allCredits } = await supabase
        .from("credit_usage").select("*").in("user_id", wsUserIds).order("created_at", { ascending: true });
      const creditsByUser: Record<string, CreditData[]> = {};
      for (const c of (allCredits || []) as CreditData[]) {
        (creditsByUser[c.user_id] ??= []).push(c);
      }
      const memberDataArr = wsUsers.map((u) => ({
        user: u,
        credits: creditsByUser[u.id] || [],
      }));
      setWorkspaceMemberData(memberDataArr);
    } catch (error) {
      toast({ title: "Failed to load workspace analytics", description: "Could not fetch workspace data", variant: "destructive" });
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    if (!analyticsEntityId) return;
    setUserCreditData([]);
    setWorkspaceMemberData([]);
    if (analyticsEntityType === "user") {
      fetchUserAnalytics(analyticsEntityId);
    } else {
      fetchWorkspaceAnalytics(analyticsEntityId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsEntityId, analyticsEntityType]);

  // Fetch transaction history when viewing a workspace detail
  useEffect(() => {
    if (selectedView.type === "workspace" && selectedView.id) {
      fetchTransactionHistory(selectedView.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedView]);

  // Computed date range for current time period
  const analyticsPeriod = useMemo(() => {
    const now = new Date();
    switch (analyticsTimePeriod) {
      case "billing":
        return { start: startOfMonth(now), end: endOfDay(now) };
      case "day": {
        const d = analyticsSelectedDay ?? now;
        return { start: startOfDay(d), end: endOfDay(d) };
      }
      case "week": {
        const base = analyticsSelectedWeek ?? now;
        return { start: startOfWeek(base, { weekStartsOn: 1 }), end: endOfWeek(base, { weekStartsOn: 1 }) };
      }
      case "month": {
        const base = new Date(analyticsSelectedMonth.year, analyticsSelectedMonth.month, 1);
        return { start: base, end: endOfMonth(base) };
      }
      default:
        return { start: startOfMonth(now), end: endOfDay(now) };
    }
  }, [analyticsTimePeriod, analyticsSelectedDay, analyticsSelectedWeek, analyticsSelectedMonth]);

  const analyticsPeriodLabel = useMemo(() => {
    const now = new Date();
    switch (analyticsTimePeriod) {
      case "billing":
        return `${format(startOfMonth(now), "MMM 1")} – ${format(now, "MMM d, yyyy")}`;
      case "day": {
        const d = analyticsSelectedDay ?? now;
        return format(d, "MMM d, yyyy");
      }
      case "week": {
        const base = analyticsSelectedWeek ?? now;
        return `${format(startOfWeek(base, { weekStartsOn: 1 }), "MMM d")} – ${format(endOfWeek(base, { weekStartsOn: 1 }), "MMM d, yyyy")}`;
      }
      case "month":
        return format(new Date(analyticsSelectedMonth.year, analyticsSelectedMonth.month, 1), "MMMM yyyy");
      default: return "";
    }
  }, [analyticsTimePeriod, analyticsSelectedDay, analyticsSelectedWeek, analyticsSelectedMonth]);

  const analyticsEntityDisplayName = useMemo(() => {
    if (!analyticsEntityId) return "";
    if (analyticsEntityType === "workspace")
      return workspaces.find((w) => w.id === analyticsEntityId)?.company_name || "Workspace";
    const u = users.find((u) => u.id === analyticsEntityId);
    return u ? (u.full_name || u.email) : "Unknown User";
  }, [analyticsEntityId, analyticsEntityType, workspaces, users]);

  const getFilteredCreditData = useMemo(() => {
    if (!userCreditData.length) return [];
    const { start, end } = analyticsPeriod;
    return userCreditData.filter((item) => {
      const date = new Date(item.created_at);
      return date >= start && date <= end;
    });
  }, [userCreditData, analyticsPeriod]);

  const groupedAnalyticsData = useMemo(() => {
    if (!getFilteredCreditData.length) return [];
    const grouped: Record<string, { date: string; cognism: number; apollo: number; aleads: number; lusha: number; theirstack: number; total: number }> = {};
    getFilteredCreditData.forEach((item) => {
      const key = format(new Date(item.created_at), "yyyy-MM-dd");
      if (!grouped[key]) grouped[key] = { date: key, cognism: 0, apollo: 0, aleads: 0, lusha: 0, theirstack: 0, total: 0 };
      grouped[key].cognism += item.cognism_credits ?? 0;
      grouped[key].apollo += item.apollo_credits;
      grouped[key].aleads += item.aleads_credits;
      grouped[key].lusha += item.lusha_credits;
      grouped[key].theirstack += item.theirstack_credits ?? 0;
      grouped[key].total += (item.cognism_credits ?? 0) + item.apollo_credits + item.aleads_credits + item.lusha_credits + (item.theirstack_credits ?? 0);
    });
    return Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));
  }, [getFilteredCreditData]);

  const analyticsSummary = useMemo(() => {
    return getFilteredCreditData.reduce(
      (acc, curr) => ({
        cognism: acc.cognism + (curr.cognism_credits ?? 0),
        apollo: acc.apollo + curr.apollo_credits,
        aleads: acc.aleads + curr.aleads_credits,
        lusha: acc.lusha + curr.lusha_credits,
        theirstack: acc.theirstack + (curr.theirstack_credits ?? 0),
        total: acc.total + (curr.cognism_credits ?? 0) + curr.apollo_credits + curr.aleads_credits + curr.lusha_credits + (curr.theirstack_credits ?? 0),
      }),
      { cognism: 0, apollo: 0, aleads: 0, lusha: 0, theirstack: 0, total: 0 }
    );
  }, [getFilteredCreditData]);

  const tableTotals = useMemo(() => {
    return groupedAnalyticsData.reduce(
      (acc, curr) => ({
        cognism: acc.cognism + curr.cognism,
        apollo: acc.apollo + curr.apollo,
        aleads: acc.aleads + curr.aleads,
        lusha: acc.lusha + curr.lusha,
        theirstack: acc.theirstack + curr.theirstack,
        total: acc.total + curr.total,
      }),
      { cognism: 0, apollo: 0, aleads: 0, lusha: 0, theirstack: 0, total: 0 }
    );
  }, [groupedAnalyticsData]);

  // Workspace analytics aggregation
  const filteredWorkspaceData = useMemo(() => {
    if (!workspaceMemberData.length) return [];
    const { start, end } = analyticsPeriod;
    return workspaceMemberData.map(({ user, credits }) => {
      const filtered = credits.filter((item) => {
        const d = new Date(item.created_at);
        return d >= start && d <= end;
      });
      const totals = filtered.reduce(
        (acc, item) => ({
          cognism: acc.cognism + (item.cognism_credits ?? 0),
          apollo: acc.apollo + item.apollo_credits,
          aleads: acc.aleads + item.aleads_credits,
          lusha: acc.lusha + item.lusha_credits,
          theirstack: acc.theirstack + (item.theirstack_credits ?? 0),
          total: acc.total + (item.cognism_credits ?? 0) + item.apollo_credits + item.aleads_credits + item.lusha_credits + (item.theirstack_credits ?? 0),
        }),
        { cognism: 0, apollo: 0, aleads: 0, lusha: 0, theirstack: 0, total: 0 }
      );
      return { user, ...totals };
    });
  }, [workspaceMemberData, analyticsPeriod]);

  const workspaceAggregate = useMemo(() => {
    return filteredWorkspaceData.reduce(
      (acc, row) => ({
        cognism: acc.cognism + row.cognism,
        apollo: acc.apollo + row.apollo,
        aleads: acc.aleads + row.aleads,
        lusha: acc.lusha + row.lusha,
        theirstack: acc.theirstack + row.theirstack,
        total: acc.total + row.total,
      }),
      { cognism: 0, apollo: 0, aleads: 0, lusha: 0, theirstack: 0, total: 0 }
    );
  }, [filteredWorkspaceData]);

  // Entity search filter for selector popover
  const filteredWorkspaceEntities = useMemo(() => {
    if (!entitySearch.trim()) return workspaces;
    const s = entitySearch.toLowerCase();
    return workspaces.filter((w) => w.company_name.toLowerCase().includes(s));
  }, [workspaces, entitySearch]);

  const filteredUserEntities = useMemo(() => {
    if (!entitySearch.trim()) return users;
    const s = entitySearch.toLowerCase();
    return users.filter((u) => u.email.toLowerCase().includes(s) || u.full_name?.toLowerCase().includes(s));
  }, [users, entitySearch]);

  const toggleWorkspace = (id: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const generateStrongPassword = () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";
    let password = "";
    password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
    password += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
    password += "0123456789"[Math.floor(Math.random() * 10)];
    password += "!@#$%^&*"[Math.floor(Math.random() * 8)];
    for (let i = password.length; i < 16; i++) password += charset[Math.floor(Math.random() * charset.length)];
    return password.split("").sort(() => Math.random() - 0.5).join("");
  };

  const handleGeneratePassword = () => {
    setNewUserTempPassword(generateStrongPassword());
    toast({ title: "Password Generated", description: "Strong password has been generated" });
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to delete user ${userEmail}? This action cannot be undone.`)) return;
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", { body: { userId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "User Deleted", description: `User ${userEmail} has been deleted successfully` });
      // If currently viewing this user, go to overview
      if (selectedView.type === "user" && selectedView.id === userId) {
        setSelectedView({ type: "overview" });
      }
      loadUsers();
    } catch (error: any) {
      toast({ title: "Failed to Delete User", description: error.message || "An error occurred", variant: "destructive" });
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      createUserSchema.parse({
        email: newUserEmail,
        fullName: newUserFullName,
        tempPassword: newUserTempPassword,
        role: newUserRole,
      });
      setCreatingUser(true);

      const workspaceId = newUserWorkspaceId === INDEPENDENT_USER_VALUE ? null : newUserWorkspaceId;

      const { data, error: createError } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: newUserEmail.trim(),
          fullName: newUserFullName.trim(),
          tempPassword: newUserTempPassword,
          role: newUserRole,
          workspaceId,
        },
      });

      // supabase.functions.invoke sets createError for non-2xx but data still has response body
      const errorMsg = data?.error || (createError?.message !== "Edge Function returned a non-2xx status code" ? createError?.message : null);

      if (createError || !data?.success) {
        if (errorMsg) {
          if (errorMsg.includes("already been registered")) {
            throw new Error("This email address is already registered. Please use a different email or contact support if you believe this is an error.");
          }
          throw new Error(errorMsg);
        }
        throw new Error("Failed to create user");
      }

      // User created — check if email had issues
      if (data.emailError) {
        toast({ title: "User Created with Warning", description: `User ${newUserEmail} was created but the welcome email failed to send. Please share credentials manually.`, variant: "default" });
      } else {
        toast({ title: "User Created Successfully", description: data.message || `User ${newUserEmail} has been created and welcome email sent` });
      }
      setNewUserEmail(""); setNewUserFullName(""); setNewUserTempPassword("");
      setNewUserRole("user"); setNewUserWorkspaceId(INDEPENDENT_USER_VALUE);
      setCreateUserDialogOpen(false);
      loadUsers();
    } catch (error: any) {
      toast({ title: "Failed to Create User", description: error.message || "An error occurred", variant: "destructive" });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleTopUp = async () => {
    if (!topUpWorkspaceId || topUpAmount <= 0) return;
    setToppingUp(true);
    try {
      const { data: result } = await supabase.rpc("add_workspace_credits", {
        p_workspace_id: topUpWorkspaceId,
        p_amount: topUpAmount,
        p_type: "topup",
        p_note: topUpNote.trim() || null,
        p_created_by: user?.id ?? null,
      });
      if (!result?.success) throw new Error(result?.error || "Failed to add credits");
      toast({
        title: "Credits Added",
        description: `${topUpAmount.toLocaleString()} credits added to "${topUpWorkspaceName}". New balance: ${result.new_balance.toLocaleString()}`,
      });
      setTopUpDialogOpen(false);
      setTopUpAmount(0);
      setTopUpNote("");
      loadWorkspaces();
    } catch (err: any) {
      toast({ title: "Top-up failed", description: err.message, variant: "destructive" });
    } finally {
      setToppingUp(false);
    }
  };

  const fetchTransactionHistory = async (workspaceId: string) => {
    setLoadingTransactions(true);
    try {
      const { data, error } = await supabase
        .from("workspace_credit_transactions")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setTransactionHistory(data || []);
    } catch (err: any) {
      console.error("Failed to fetch transactions:", err);
      setTransactionHistory([]);
    } finally {
      setLoadingTransactions(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent/8 rounded-full blur-3xl" />
        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground animate-pulse">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    toast({ title: "Signed out", description: "You have been signed out successfully" });
    navigate("/auth");
  };

  // ── Shared user table rows (workspace + independent views) ──
  const renderDetailTable = (tableUsers: UserWithRole[], showAssign = false) => (
    <div className="rounded-lg border border-border/30 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/20 border-border/30 hover:bg-muted/30">
            {["User", "Role", "Status", "Actions"].map((h, i) => (
              <TableHead key={h} className={cn("text-xs font-semibold text-muted-foreground uppercase tracking-wide", i === 3 && "text-right")}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableUsers.map((u) => (
            <TableRow
              key={u.id}
              className="hover:bg-muted/10 transition-colors border-border/20 cursor-pointer"
              onClick={() => setSelectedView({ type: "user", id: u.id })}
            >
              <TableCell>
                <div>
                  <p className="text-sm font-medium text-foreground">{u.email}</p>
                  {u.full_name && <p className="text-xs text-muted-foreground">{u.full_name}</p>}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant={u.role === "admin" ? "default" : "secondary"}
                  className={u.role === "admin" ? "bg-gradient-to-r from-primary to-accent text-primary-foreground text-xs" : "bg-muted text-muted-foreground text-xs"}
                >
                  {u.role}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant={u.requires_password_reset ? "outline" : "default"}
                  className={u.requires_password_reset ? "border-border/50 text-muted-foreground text-xs" : "bg-primary/20 text-primary border-primary/30 text-xs"}
                >
                  {u.requires_password_reset ? "Pending" : "Active"}
                </Badge>
              </TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1">
                  {showAssign && workspaces.length > 0 && (
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => { setAssigningUser(u); setAssignTargetWorkspaceId(""); setAssignDialogOpen(true); }}
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10"
                    >
                      <Building2 className="h-3.5 w-3.5 mr-1" />Assign
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteUser(u.id, u.email)}
                    disabled={u.role === "admin"}
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-30">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex overflow-hidden">
      <AppSidebar isAdmin={isAdmin} isDeveloper={user?.email === "pranavshah0907@gmail.com"} onSignOut={handleSignOut} />
      <MobileHeader />
      <MobileTabBar isAdmin={isAdmin} isDeveloper={user?.email === "pranavshah0907@gmail.com"} />

      <DesktopRecommendedBanner pageKey="admin" />

      {/* ── Two-pane layout ── */}
      <div className="flex-1 ml-0 md:ml-16 flex flex-col md:flex-row h-screen overflow-hidden pt-14 pb-20 md:pt-0 md:pb-0">

        {/* ────────────────── LEFT TREE PANE ────────────────── */}
        <aside
          className="flex-shrink-0 flex flex-col border-r border-border/20 overflow-hidden"
          style={{ width: 256, background: "#060f10" }}
        >
          {/* Pane header */}
          <div className="px-4 pt-5 pb-4 border-b border-border/15 shrink-0">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-bold text-foreground tracking-tight">Admin</span>
              <img src={bravoroLogo} alt="Bravoro" className="ml-auto h-4 w-auto opacity-40" />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => setWorkspaceDialogOpen(true)}
                className="flex-1 h-8 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/40 transition-colors"
              >
                <Plus className="h-3 w-3 mr-1" />
                Workspace
              </Button>
              <Button
                size="sm"
                onClick={() => setCreateUserDialogOpen(true)}
                className="flex-1 h-8 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/40 transition-colors"
              >
                <Plus className="h-3 w-3 mr-1" />
                User
              </Button>
            </div>
          </div>

          {/* Scrollable tree */}
          <div className="flex-1 overflow-y-auto py-2 px-2">
            {/* Overview */}
            <button
              onClick={() => setSelectedView({ type: "overview" })}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors",
                selectedView.type === "overview"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <BarChart3 className="h-3.5 w-3.5 shrink-0" />
              <span className="text-xs font-medium">Overview</span>
            </button>

            {/* Workspaces section */}
            <div className="mt-4">
              <p className="px-3 pb-1.5 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">
                Workspaces
              </p>
              {workspaces.length === 0 ? (
                <p className="px-3 py-1.5 text-xs text-muted-foreground/40 italic">No workspaces yet</p>
              ) : (
                workspaces.map((ws) => {
                  const wsUsers = users.filter((u) => u.workspace_id === ws.id);
                  const isExpanded = expandedWorkspaces.has(ws.id);
                  const isWsSelected = selectedView.type === "workspace" && selectedView.id === ws.id;
                  return (
                    <div key={ws.id}>
                      <div className={cn(
                        "flex items-center rounded-md transition-colors",
                        isWsSelected ? "bg-primary/15" : "hover:bg-white/5"
                      )}>
                        <button
                          onClick={() => toggleWorkspace(ws.id)}
                          className="shrink-0 pl-2 pr-1 py-2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {isExpanded
                            ? <ChevronDown className="h-3 w-3" />
                            : <ChevronRight className="h-3 w-3" />
                          }
                        </button>
                        <button
                          onClick={() => setSelectedView({ type: "workspace", id: ws.id })}
                          className="flex-1 flex items-center gap-2 pr-3 py-2 text-left min-w-0"
                        >
                          <Building2 className={cn("h-3.5 w-3.5 shrink-0", isWsSelected ? "text-primary" : "text-primary/50")} />
                          <div className="flex-1 min-w-0">
                            <span className={cn("block truncate text-xs font-medium", isWsSelected ? "text-primary" : "text-foreground")}>
                              {ws.company_name}
                            </span>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {(ws.credits_balance ?? 0).toLocaleString()} credits
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground/50 shrink-0">{wsUsers.length}</span>
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="ml-5 mb-0.5">
                          {wsUsers.length === 0 ? (
                            <p className="pl-4 py-1 text-[11px] text-muted-foreground/30 italic">empty</p>
                          ) : (
                            wsUsers.map((u) => {
                              const isUserSel = selectedView.type === "user" && selectedView.id === u.id;
                              return (
                                <button
                                  key={u.id}
                                  onClick={() => setSelectedView({ type: "user", id: u.id })}
                                  className={cn(
                                    "w-full flex items-center gap-2 pl-3 pr-2 py-1 rounded-md text-left transition-colors",
                                    isUserSel
                                      ? "bg-primary/15 text-primary"
                                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                                  )}
                                >
                                  <div className="h-1.5 w-1.5 rounded-full bg-current shrink-0 opacity-50" />
                                  <span className="truncate text-[11px]">{u.full_name || u.email.split("@")[0]}</span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Independent users */}
            <div className="mt-3">
              {(() => {
                const indUsers = users.filter((u) => !u.workspace_id);
                const isExpanded = expandedWorkspaces.has(INDEPENDENT_USER_VALUE);
                const isIndSel = selectedView.type === "independent";
                return (
                  <div>
                    <div className={cn(
                      "flex items-center rounded-md transition-colors",
                      isIndSel ? "bg-primary/15" : "hover:bg-white/5"
                    )}>
                      <button
                        onClick={() => toggleWorkspace(INDEPENDENT_USER_VALUE)}
                        className="shrink-0 pl-2 pr-1 py-2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isExpanded
                          ? <ChevronDown className="h-3 w-3" />
                          : <ChevronRight className="h-3 w-3" />
                        }
                      </button>
                      <button
                        onClick={() => setSelectedView({ type: "independent" })}
                        className="flex-1 flex items-center gap-2 pr-3 py-2 text-left min-w-0"
                      >
                        <FolderOpen className={cn("h-3.5 w-3.5 shrink-0", isIndSel ? "text-primary" : "text-muted-foreground/60")} />
                        <span className={cn("flex-1 text-xs font-medium", isIndSel ? "text-primary" : "text-foreground")}>
                          Independent
                        </span>
                        <span className="text-[10px] text-muted-foreground/50 shrink-0">{indUsers.length}</span>
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="ml-5 mb-0.5">
                        {indUsers.length === 0 ? (
                          <p className="pl-4 py-1 text-[11px] text-muted-foreground/30 italic">none</p>
                        ) : (
                          indUsers.map((u) => {
                            const isUserSel = selectedView.type === "user" && selectedView.id === u.id;
                            return (
                              <button
                                key={u.id}
                                onClick={() => setSelectedView({ type: "user", id: u.id })}
                                className={cn(
                                  "w-full flex items-center gap-2 pl-3 pr-2 py-1 rounded-md text-left transition-colors",
                                  isUserSel
                                    ? "bg-primary/15 text-primary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                                )}
                              >
                                <div className="h-1.5 w-1.5 rounded-full bg-current shrink-0 opacity-50" />
                                <span className="truncate text-[11px]">{u.full_name || u.email.split("@")[0]}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Bottom nav */}
          <div className="px-2 py-3 border-t border-border/15 shrink-0 space-y-0.5">
            <button
              onClick={() => setSelectedView({ type: "analytics" })}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors",
                selectedView.type === "analytics"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <Activity className="h-3.5 w-3.5 shrink-0" />
              <span className="text-xs font-medium">Analytics</span>
            </button>
            <button
              onClick={() => setSelectedView({ type: "master-database" })}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors",
                selectedView.type === "master-database"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <Database className="h-3.5 w-3.5 shrink-0" />
              <span className="text-xs font-medium">Master Database</span>
            </button>
          </div>
        </aside>

        {/* ────────────────── RIGHT DETAIL PANE ────────────────── */}
        <main className="flex-1 overflow-y-auto bg-background relative">
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div
              className="absolute -top-1/4 -right-1/4 w-[600px] h-[600px] rounded-full opacity-20"
              style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)" }}
            />
          </div>

          <div className="relative z-10 p-6 md:p-8">

            {/* ── OVERVIEW ── */}
            {selectedView.type === "overview" && (
              <div className="space-y-8 animate-fade-in">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Overview</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Summary of your workspace and user activity</p>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Workspaces", value: workspaces.length, icon: <Building2 className="h-5 w-5" />, color: "text-primary" },
                    { label: "Total Users", value: users.length, icon: <Users className="h-5 w-5" />, color: "text-emerald-400" },
                    { label: "Active Users", value: users.filter((u) => !u.requires_password_reset).length, icon: <Activity className="h-5 w-5" />, color: "text-green-400" },
                    { label: "Pending Login", value: users.filter((u) => u.requires_password_reset).length, icon: <UserIcon className="h-5 w-5" />, color: "text-amber-400" },
                  ].map(({ label, value, icon, color }) => (
                    <Card key={label} className="border-border/40 bg-card/90 backdrop-blur-sm">
                      <CardContent className="p-5">
                        <div className={cn("mb-3", color)}>{icon}</div>
                        <p className="text-3xl font-bold text-foreground">{value}</p>
                        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider font-medium">{label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {workspaces.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Workspaces</h3>
                    <div className="grid gap-2">
                      {workspaces.map((ws) => {
                        const memberCount = users.filter((u) => u.workspace_id === ws.id).length;
                        return (
                          <div
                            key={ws.id}
                            onClick={() => setSelectedView({ type: "workspace", id: ws.id })}
                            className="group flex items-center justify-between rounded-lg border border-border/30 bg-card/40 hover:bg-card/70 px-4 py-3 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-md bg-primary/10 shrink-0">
                                <Building2 className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-foreground">{ws.company_name}</p>
                                <p className="text-xs text-muted-foreground">{ws.primary_contact_name}</p>
                              </div>
                            </div>
                            <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs">
                              {memberCount} {memberCount === 1 ? "user" : "users"}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {users.filter((u) => !u.workspace_id).length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Independent Users</h3>
                    <div
                      onClick={() => setSelectedView({ type: "independent" })}
                      className="flex items-center justify-between rounded-lg border border-border/30 bg-card/40 hover:bg-card/70 px-4 py-3 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-md bg-muted/30 shrink-0">
                          <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-semibold text-foreground">Independent Users</p>
                      </div>
                      <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs">
                        {users.filter((u) => !u.workspace_id).length}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── WORKSPACE DETAIL ── */}
            {selectedView.type === "workspace" && (() => {
              const ws = workspaces.find((w) => w.id === selectedView.id);
              const wsUsers = users.filter((u) => u.workspace_id === selectedView.id);
              if (!ws) return <p className="text-muted-foreground">Workspace not found.</p>;
              return (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <h2 className="text-2xl font-bold text-foreground">{ws.company_name}</h2>
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 ml-11">
                        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                          <UserIcon className="h-3.5 w-3.5 shrink-0" />{ws.primary_contact_name}
                        </span>
                        {ws.primary_contact_email && (
                          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 shrink-0" />{ws.primary_contact_email}
                          </span>
                        )}
                        {ws.primary_contact_phone && (
                          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 shrink-0" />{ws.primary_contact_phone}
                          </span>
                        )}
                        {ws.company_address && (
                          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />{ws.company_address}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => {
                          setTopUpWorkspaceId(ws.id);
                          setTopUpWorkspaceName(ws.company_name);
                          setTopUpAmount(0);
                          setTopUpNote("");
                          setTopUpDialogOpen(true);
                        }}
                        className="h-7 px-3 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
                      >
                        <Plus className="h-3 w-3 mr-1" />Top Up Credits
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => handleDeleteWorkspace(ws.id, ws.company_name)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                      >
                        <Trash2 className="h-4 w-4 mr-1.5" />Delete
                      </Button>
                    </div>
                  </div>

                  {/* Credit Balance */}
                  <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-card/90">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Credit Balance</p>
                          <p className="text-3xl font-bold text-foreground tabular-nums">{(ws.credits_balance ?? 0).toLocaleString()}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-emerald-500/10">
                          <Target className="h-6 w-6 text-emerald-400" />
                        </div>
                      </div>
                      {ws.low_credit_threshold > 0 && (ws.credits_balance ?? 0) <= ws.low_credit_threshold && (
                        <p className="text-xs text-amber-400 mt-2">Low credit balance — below threshold of {ws.low_credit_threshold.toLocaleString()}</p>
                      )}
                    </CardContent>
                  </Card>

                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Users</h3>
                      <span className="text-xs font-bold text-primary">{wsUsers.length}</span>
                    </div>
                    {wsUsers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-border/40 rounded-lg text-muted-foreground">
                        <Users className="h-8 w-8 mb-2 opacity-30" />
                        <p className="text-sm">No users in this workspace yet</p>
                        <p className="text-xs mt-1 opacity-60">Create a user and assign them to this workspace</p>
                      </div>
                    ) : (
                      renderDetailTable(wsUsers, false)
                    )}
                  </div>

                  {/* ── Workspace Searches ── */}
                  <WorkspaceSearches userIds={wsUsers.map(u => u.id)} />

                  {/* ── Transaction History ── */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Credit Transactions</h3>
                      <span className="text-xs font-bold text-primary">{transactionHistory.length}</span>
                    </div>
                    {loadingTransactions ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    ) : transactionHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border/40 rounded-lg text-muted-foreground">
                        <Activity className="h-8 w-8 mb-2 opacity-30" />
                        <p className="text-sm">No transactions yet</p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border/30 overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/20 border-border/30 hover:bg-muted/30">
                              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</TableHead>
                              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</TableHead>
                              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Amount</TableHead>
                              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Balance</TableHead>
                              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Note</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {transactionHistory.map((tx) => (
                              <TableRow key={tx.id} className="hover:bg-muted/10 transition-colors border-border/20">
                                <TableCell className="text-sm text-foreground">
                                  {new Date(tx.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    className={cn("text-[10px]", {
                                      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20": tx.type === "topup" || tx.type === "initial",
                                      "bg-red-500/10 text-red-400 border-red-500/20": tx.type === "deduction",
                                      "bg-amber-500/10 text-amber-400 border-amber-500/20": tx.type === "adjustment",
                                      "bg-muted text-muted-foreground border-border/30": !["topup", "initial", "deduction", "adjustment"].includes(tx.type),
                                    })}
                                  >
                                    {tx.type}
                                  </Badge>
                                </TableCell>
                                <TableCell className={cn("text-sm font-medium text-right tabular-nums", tx.amount >= 0 ? "text-emerald-400" : "text-red-400")}>
                                  {tx.amount >= 0 ? "+" : ""}{tx.amount.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-sm text-foreground text-right tabular-nums">
                                  {tx.balance_after?.toLocaleString() ?? "—"}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                                  {tx.note || "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── INDEPENDENT USERS ── */}
            {selectedView.type === "independent" && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Independent Users</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Users not assigned to any workspace</p>
                </div>
                {(() => {
                  const indUsers = users.filter((u) => !u.workspace_id);
                  return indUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border/40 rounded-lg text-muted-foreground">
                      <FolderOpen className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">No independent users</p>
                    </div>
                  ) : (
                    renderDetailTable(indUsers, true)
                  );
                })()}
              </div>
            )}

            {/* ── USER PROFILE ── */}
            {selectedView.type === "user" && (() => {
              const u = users.find((u) => u.id === selectedView.id);
              if (!u) return <p className="text-muted-foreground">User not found.</p>;
              const isIndependent = !u.workspace_id;
              return (
                <div className="space-y-6 animate-fade-in max-w-2xl">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <UserIcon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-foreground">{u.full_name || "—"}</h2>
                        <p className="text-sm text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <Badge
                        variant={u.role === "admin" ? "default" : "secondary"}
                        className={u.role === "admin" ? "bg-gradient-to-r from-primary to-accent text-primary-foreground" : "bg-muted text-muted-foreground"}
                      >
                        {u.role}
                      </Badge>
                      <Badge
                        variant={u.requires_password_reset ? "outline" : "default"}
                        className={u.requires_password_reset ? "border-border/50 text-muted-foreground" : "bg-primary/20 text-primary border-primary/30"}
                      >
                        {u.requires_password_reset ? "Pending" : "Active"}
                      </Badge>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="border-border/40 bg-card/60">
                      <CardContent className="p-4">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-2">Workspace</p>
                        <div className="flex items-center gap-2">
                          {u.workspace_name ? (
                            <>
                              <Building2 className="h-4 w-4 text-primary shrink-0" />
                              <span className="text-sm font-medium text-foreground">{u.workspace_name}</span>
                            </>
                          ) : (
                            <span className="text-sm text-muted-foreground italic">Independent</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-border/40 bg-card/60">
                      <CardContent className="p-4">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-2">Member Since</p>
                        <span className="text-sm font-medium text-foreground">
                          {new Date(u.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                        </span>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {isIndependent && workspaces.length > 0 && (
                      <Button variant="outline" size="sm"
                        onClick={() => { setAssigningUser(u); setAssignTargetWorkspaceId(""); setAssignDialogOpen(true); }}
                        className="border-primary/30 text-primary hover:bg-primary/10 h-9">
                        <Building2 className="h-3.5 w-3.5 mr-2" />Assign to Workspace
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteUser(u.id, u.email)}
                      disabled={u.role === "admin"}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 h-9">
                      <Trash2 className="h-3.5 w-3.5 mr-2" />Delete User
                    </Button>
                  </div>
                </div>
              );
            })()}

            {/* ── ANALYTICS ── */}
            {selectedView.type === "analytics" && (
              <div className="space-y-6 animate-fade-in">
                {/* Header */}
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Analytics</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Credit usage by workspace or individual user</p>
                </div>

                {/* Controls row */}
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  {/* Unified entity selector */}
                  <div className="flex-1 min-w-0">
                    <Popover open={entityPopoverOpen} onOpenChange={setEntityPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-between bg-card/90 border-border/50 text-foreground h-10"
                        >
                          {analyticsEntityId ? (
                            <div className="flex items-center gap-2 truncate">
                              {analyticsEntityType === "workspace"
                                ? <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                                : <UserIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              }
                              <span className="truncate font-medium">{analyticsEntityDisplayName}</span>
                              {analyticsEntityType === "workspace" && (
                                <Badge className="ml-1 bg-primary/10 text-primary border-primary/20 text-[10px] shrink-0">Workspace</Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Select workspace or user…</span>
                          )}
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0 bg-popover border-border" align="start">
                        <div className="p-2 border-b border-border">
                          <div className="flex items-center gap-2 px-2">
                            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                            <Input
                              placeholder="Search workspaces and users…"
                              value={entitySearch}
                              onChange={(e) => setEntitySearch(e.target.value)}
                              className="h-8 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                            />
                          </div>
                        </div>
                        <div className="max-h-[320px] overflow-y-auto py-1">
                          {/* Workspaces section */}
                          {filteredWorkspaceEntities.length > 0 && (
                            <>
                              <div className="px-3 pt-2 pb-1">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Workspaces</span>
                              </div>
                              {filteredWorkspaceEntities.map((ws) => {
                                const memberCount = users.filter((u) => u.workspace_id === ws.id).length;
                                const isSelected = analyticsEntityType === "workspace" && analyticsEntityId === ws.id;
                                return (
                                  <button
                                    key={ws.id}
                                    onClick={() => {
                                      setAnalyticsEntityType("workspace");
                                      setAnalyticsEntityId(ws.id);
                                      setEntitySearch("");
                                      setEntityPopoverOpen(false);
                                    }}
                                    className={cn(
                                      "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors",
                                      isSelected && "bg-muted/50"
                                    )}
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                                      <span className="font-medium text-foreground">{ws.company_name}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground ml-2 shrink-0">
                                      {memberCount} {memberCount === 1 ? "user" : "users"}
                                    </span>
                                  </button>
                                );
                              })}
                            </>
                          )}
                          {/* Users section */}
                          {filteredUserEntities.length > 0 && (
                            <>
                              <div className={cn("px-3 pt-2 pb-1", filteredWorkspaceEntities.length > 0 && "mt-1 border-t border-border/40")}>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Users</span>
                              </div>
                              {filteredUserEntities.map((u) => {
                                const isSelected = analyticsEntityType === "user" && analyticsEntityId === u.id;
                                return (
                                  <button
                                    key={u.id}
                                    onClick={() => {
                                      setAnalyticsEntityType("user");
                                      setAnalyticsEntityId(u.id);
                                      setEntitySearch("");
                                      setEntityPopoverOpen(false);
                                    }}
                                    className={cn(
                                      "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors",
                                      isSelected && "bg-muted/50"
                                    )}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <UserIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      <div className="truncate">
                                        <span className="font-medium text-foreground">{u.full_name || u.email}</span>
                                        {u.full_name && <span className="text-muted-foreground text-xs ml-1.5">{u.email}</span>}
                                      </div>
                                    </div>
                                    <span className="text-xs text-muted-foreground ml-2 shrink-0">
                                      {u.workspace_name || "Independent"}
                                    </span>
                                  </button>
                                );
                              })}
                            </>
                          )}
                          {filteredWorkspaceEntities.length === 0 && filteredUserEntities.length === 0 && (
                            <div className="py-6 text-center text-sm text-muted-foreground">No results found</div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Time period controls */}
                  <div className="flex flex-col gap-2 items-end shrink-0">
                    {/* Period pills */}
                    <div className="flex gap-1 bg-muted/20 rounded-lg p-1 border border-border/30">
                      {(["billing", "day", "week", "month"] as AnalyticsTimePeriod[]).map((period) => (
                        <button
                          key={period}
                          onClick={() => setAnalyticsTimePeriod(period)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                            analyticsTimePeriod === period
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          )}
                        >
                          {period === "billing" ? "Billing Cycle" : period.charAt(0).toUpperCase() + period.slice(1)}
                        </button>
                      ))}
                    </div>
                    {/* Date picker for non-billing periods */}
                    {analyticsTimePeriod !== "billing" && (
                      <div>
                        {analyticsTimePeriod === "day" && (
                          <Popover open={isDayPickerOpen} onOpenChange={setIsDayPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 text-xs bg-muted/20 border-border/40 text-foreground">
                                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                                {format(analyticsSelectedDay ?? new Date(), "MMM d, yyyy")}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-popover border-border" align="end">
                              <Calendar
                                mode="single"
                                selected={analyticsSelectedDay ?? new Date()}
                                onSelect={(date) => { if (date) { setAnalyticsSelectedDay(date); setIsDayPickerOpen(false); } }}
                                disabled={(date) => date > new Date()}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        )}
                        {analyticsTimePeriod === "week" && (
                          <Popover open={isWeekPickerOpen} onOpenChange={setIsWeekPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 text-xs bg-muted/20 border-border/40 text-foreground">
                                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                                {(() => {
                                  const base = analyticsSelectedWeek ?? new Date();
                                  return `${format(startOfWeek(base, { weekStartsOn: 1 }), "MMM d")} – ${format(endOfWeek(base, { weekStartsOn: 1 }), "MMM d")}`;
                                })()}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-popover border-border" align="end">
                              <Calendar
                                mode="single"
                                selected={analyticsSelectedWeek ?? new Date()}
                                onSelect={(date) => {
                                  if (date) {
                                    setAnalyticsSelectedWeek(startOfWeek(date, { weekStartsOn: 1 }));
                                    setIsWeekPickerOpen(false);
                                  }
                                }}
                                disabled={(date) => date > new Date()}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        )}
                        {analyticsTimePeriod === "month" && (
                          <Popover open={isMonthPickerOpen} onOpenChange={setIsMonthPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 text-xs bg-muted/20 border-border/40 text-foreground">
                                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                                {format(new Date(analyticsSelectedMonth.year, analyticsSelectedMonth.month, 1), "MMMM yyyy")}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-52 p-3 bg-popover border-border" align="end">
                              <div className="flex items-center justify-between mb-3">
                                <button
                                  onClick={() => setAnalyticsSelectedMonth((prev) => ({ ...prev, year: prev.year - 1 }))}
                                  className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                >
                                  <ChevronDown className="h-4 w-4 rotate-90" />
                                </button>
                                <span className="text-sm font-semibold text-foreground">{analyticsSelectedMonth.year}</span>
                                <button
                                  onClick={() => setAnalyticsSelectedMonth((prev) => ({ ...prev, year: prev.year + 1 }))}
                                  disabled={analyticsSelectedMonth.year >= new Date().getFullYear()}
                                  className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                >
                                  <ChevronDown className="h-4 w-4 -rotate-90" />
                                </button>
                              </div>
                              <div className="grid grid-cols-3 gap-1">
                                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => {
                                  const isSelected = analyticsSelectedMonth.month === i;
                                  const isFuture = analyticsSelectedMonth.year === new Date().getFullYear() && i > new Date().getMonth();
                                  return (
                                    <button
                                      key={m}
                                      disabled={isFuture}
                                      onClick={() => { setAnalyticsSelectedMonth((prev) => ({ ...prev, month: i })); setIsMonthPickerOpen(false); }}
                                      className={cn(
                                        "py-1.5 text-xs rounded-md font-medium transition-colors",
                                        isSelected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                                        isFuture && "opacity-30 cursor-not-allowed"
                                      )}
                                    >
                                      {m}
                                    </button>
                                  );
                                })}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    )}
                    {/* Period range label */}
                    <p className="text-xs text-muted-foreground">{analyticsPeriodLabel}</p>
                  </div>
                </div>

                {/* Content */}
                {!analyticsEntityId ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <div className="p-4 rounded-2xl bg-muted/10 mb-4">
                      <BarChart3 className="h-10 w-10 opacity-30" />
                    </div>
                    <p className="text-lg font-medium text-foreground/60">Select an entity to view analytics</p>
                    <p className="text-sm opacity-60 mt-1">Choose a workspace or user from the dropdown above</p>
                  </div>
                ) : loadingAnalytics ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : analyticsEntityType === "workspace" ? (
                  /* ─── Workspace analytics ─── */
                  <div className="space-y-6">
                    {/* Aggregate totals card */}
                    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card/90">
                      <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-5">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <Building2 className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">
                              {workspaces.find((w) => w.id === analyticsEntityId)?.company_name || "Workspace"} — Total
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{analyticsPeriodLabel}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
                          {[
                            { label: "Cognism", value: workspaceAggregate.cognism, color: PLATFORM_COLORS.cognism },
                            { label: "Apollo", value: workspaceAggregate.apollo, color: PLATFORM_COLORS.apollo },
                            { label: "ALeads", value: workspaceAggregate.aleads, color: PLATFORM_COLORS.aleads },
                            { label: "Lusha", value: workspaceAggregate.lusha, color: PLATFORM_COLORS.lusha },
                            { label: "Theirstack", value: workspaceAggregate.theirstack, color: PLATFORM_COLORS.theirstack },
                            { label: "Total", value: workspaceAggregate.total, color: "hsl(var(--primary))" },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="rounded-lg bg-card/60 border border-border/30 p-3">
                              <div className="flex items-center gap-1.5 mb-2">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</span>
                              </div>
                              <p className="text-xl font-bold text-foreground">{value.toLocaleString()}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Members breakdown table */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                          Members ({filteredWorkspaceData.length})
                        </h3>
                      </div>
                      <div className="rounded-lg border border-border/30 overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/20 border-border/30 hover:bg-muted/30">
                              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">User</TableHead>
                              {["Cognism", "Apollo", "ALeads", "Lusha", "Theirstack"].map((h, i) => (
                                <TableHead key={h} className="text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <div className="w-2 h-2 rounded-full" style={{ background: PLATFORM_LABEL_COLORS[i] }} />
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</span>
                                  </div>
                                </TableHead>
                              ))}
                              <TableHead className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredWorkspaceData.map((row) => (
                              <TableRow
                                key={row.user.id}
                                onClick={() => setSelectedView({ type: "user", id: row.user.id })}
                                className="hover:bg-muted/10 transition-colors border-border/20 cursor-pointer"
                              >
                                <TableCell>
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{row.user.full_name || row.user.email}</p>
                                    {row.user.full_name && <p className="text-xs text-muted-foreground">{row.user.email}</p>}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground">{row.cognism.toLocaleString()}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{row.apollo.toLocaleString()}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{row.aleads.toLocaleString()}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{row.lusha.toLocaleString()}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{row.theirstack.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-semibold text-foreground">{row.total.toLocaleString()}</TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-muted/40 border-t-2 border-border hover:bg-muted/50">
                              <TableCell className="font-bold text-foreground">Total</TableCell>
                              <TableCell className="text-right font-bold text-foreground">{workspaceAggregate.cognism.toLocaleString()}</TableCell>
                              <TableCell className="text-right font-bold text-foreground">{workspaceAggregate.apollo.toLocaleString()}</TableCell>
                              <TableCell className="text-right font-bold text-foreground">{workspaceAggregate.aleads.toLocaleString()}</TableCell>
                              <TableCell className="text-right font-bold text-foreground">{workspaceAggregate.lusha.toLocaleString()}</TableCell>
                              <TableCell className="text-right font-bold text-foreground">{workspaceAggregate.theirstack.toLocaleString()}</TableCell>
                              <TableCell className="text-right font-bold text-primary">{workspaceAggregate.total.toLocaleString()}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ─── User analytics ─── */
                  <div className="space-y-5">
                    {/* Platform stat cards */}
                    <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
                      {[
                        { label: "Cognism", value: analyticsSummary.cognism, color: PLATFORM_COLORS.cognism },
                        { label: "Apollo", value: analyticsSummary.apollo, color: PLATFORM_COLORS.apollo },
                        { label: "ALeads", value: analyticsSummary.aleads, color: PLATFORM_COLORS.aleads },
                        { label: "Lusha", value: analyticsSummary.lusha, color: PLATFORM_COLORS.lusha },
                        { label: "Theirstack", value: analyticsSummary.theirstack, color: PLATFORM_COLORS.theirstack },
                        { label: "Total", value: analyticsSummary.total, color: "hsl(var(--primary))" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="rounded-lg bg-card/90 border border-border/40 p-4">
                          <div className="flex items-center gap-1.5 mb-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</span>
                          </div>
                          <p className="text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
                        </div>
                      ))}
                    </div>

                    {/* Detailed usage table */}
                    <Card className="border-border/40 bg-card/90">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg text-foreground">Detailed Usage</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {groupedAnalyticsData.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                            <BarChart3 className="h-10 w-10 mb-3 opacity-40" />
                            <p className="font-medium">No usage data for this period</p>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-border/40 overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/30 border-border/30 hover:bg-muted/40">
                                  <TableHead className="font-semibold text-foreground">Date</TableHead>
                                  {["Cognism", "Apollo", "ALeads", "Lusha", "Theirstack"].map((h, i) => (
                                    <TableHead key={h} className="text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <div className="w-2 h-2 rounded-full" style={{ background: PLATFORM_LABEL_COLORS[i] }} />
                                        <span className="font-semibold text-foreground">{h}</span>
                                      </div>
                                    </TableHead>
                                  ))}
                                  <TableHead className="text-right font-semibold text-foreground">Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {groupedAnalyticsData.map((row) => (
                                  <TableRow key={row.date} className="hover:bg-muted/20 transition-colors border-border/30">
                                    <TableCell className="font-medium text-foreground">{format(new Date(row.date), "MMM d, yyyy")}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{row.cognism.toLocaleString()}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{row.apollo.toLocaleString()}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{row.aleads.toLocaleString()}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{row.lusha.toLocaleString()}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{row.theirstack.toLocaleString()}</TableCell>
                                    <TableCell className="text-right font-semibold text-foreground">{row.total.toLocaleString()}</TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="bg-muted/40 border-t-2 border-border hover:bg-muted/50">
                                  <TableCell className="font-bold text-foreground">Total</TableCell>
                                  <TableCell className="text-right font-bold text-foreground">{tableTotals.cognism.toLocaleString()}</TableCell>
                                  <TableCell className="text-right font-bold text-foreground">{tableTotals.apollo.toLocaleString()}</TableCell>
                                  <TableCell className="text-right font-bold text-foreground">{tableTotals.aleads.toLocaleString()}</TableCell>
                                  <TableCell className="text-right font-bold text-foreground">{tableTotals.lusha.toLocaleString()}</TableCell>
                                  <TableCell className="text-right font-bold text-foreground">{tableTotals.theirstack.toLocaleString()}</TableCell>
                                  <TableCell className="text-right font-bold text-primary">{tableTotals.total.toLocaleString()}</TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {/* ── MASTER DATABASE ── */}
            {selectedView.type === "master-database" && (
              <div className="animate-fade-in">
                <MasterDatabaseTab />
              </div>
            )}

          </div>
        </main>
      </div>

      {/* ─── CREATE USER DIALOG ─── */}
      <Dialog open={createUserDialogOpen} onOpenChange={setCreateUserDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Create New User
            </DialogTitle>
            <DialogDescription>
              Create user credentials. Users will be required to reset their password on first login.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-5 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground font-medium">Email Address *</Label>
                <Input id="email" type="email" placeholder="user@example.com" value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)} required
                  className="h-11 bg-muted/30 border-border/50 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-foreground font-medium">Full Name *</Label>
                <Input id="fullName" type="text" placeholder="John Doe" value={newUserFullName}
                  onChange={(e) => setNewUserFullName(e.target.value)} required
                  className="h-11 bg-muted/30 border-border/50 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tempPassword" className="text-foreground font-medium">Temporary Password *</Label>
              <div className="flex gap-2">
                <Input id="tempPassword" type="text" placeholder="Min 8 characters" value={newUserTempPassword}
                  onChange={(e) => setNewUserTempPassword(e.target.value)} required
                  className="flex-1 h-11 bg-muted/30 border-border/50 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" />
                <Button type="button" variant="outline" onClick={handleGeneratePassword}
                  className="shrink-0 h-11 border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50">
                  <Shuffle className="h-4 w-4 mr-2" />Generate
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">User will be required to change this password on first login</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="role" className="text-foreground font-medium">User Role *</Label>
                <select id="role" value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as "admin" | "user")}
                  className="flex h-11 w-full rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-sm text-foreground ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="workspace" className="text-foreground font-medium">Workspace</Label>
                <select id="workspace" value={newUserWorkspaceId} onChange={(e) => setNewUserWorkspaceId(e.target.value)}
                  className="flex h-11 w-full rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-sm text-foreground ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2">
                  <option value={INDEPENDENT_USER_VALUE}>Independent User</option>
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>{ws.company_name}</option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateUserDialogOpen(false)} className="border-border/50">Cancel</Button>
              <Button type="submit" disabled={creatingUser}
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground">
                {creatingUser ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : <><UserPlus className="mr-2 h-4 w-4" />Create User</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── CREATE WORKSPACE DIALOG ─── */}
      <Dialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Create New Workspace
            </DialogTitle>
            <DialogDescription>
              Add a new company workspace to organise users under one account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateWorkspace} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-foreground font-medium">Company Name *</Label>
              <Input placeholder="Acme Corporation" value={newWsName} onChange={(e) => setNewWsName(e.target.value)}
                required className="h-11 bg-muted/30 border-border/50 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground font-medium">Company Address</Label>
              <Input placeholder="123 Main St, London, UK" value={newWsAddress} onChange={(e) => setNewWsAddress(e.target.value)}
                className="h-11 bg-muted/30 border-border/50 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 h-px bg-border/40" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Primary Contact</span>
              <div className="flex-1 h-px bg-border/40" />
            </div>

            <div className="space-y-2">
              <Label className="text-foreground font-medium">Contact Name *</Label>
              <Input placeholder="Jane Smith" value={newWsContactName} onChange={(e) => setNewWsContactName(e.target.value)}
                required className="h-11 bg-muted/30 border-border/50 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Email</Label>
                <Input type="email" placeholder="jane@acme.com" value={newWsContactEmail} onChange={(e) => setNewWsContactEmail(e.target.value)}
                  className="h-11 bg-muted/30 border-border/50 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Phone</Label>
                <Input type="tel" placeholder="+44 7700 900000" value={newWsContactPhone} onChange={(e) => setNewWsContactPhone(e.target.value)}
                  className="h-11 bg-muted/30 border-border/50 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wsInitialCredits" className="text-foreground font-medium">Initial Credits</Label>
              <Input
                id="wsInitialCredits"
                type="number"
                min="0"
                placeholder="e.g., 5000"
                value={newWsInitialCredits || ""}
                onChange={(e) => setNewWsInitialCredits(parseInt(e.target.value) || 0)}
                className="bg-background/50 border-border/40 focus:border-primary/60 text-foreground placeholder:text-muted-foreground/40"
              />
              <p className="text-xs text-muted-foreground">Credits shared by all workspace members. Can be topped up later.</p>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setWorkspaceDialogOpen(false)} className="border-border/50">Cancel</Button>
              <Button type="submit" disabled={creatingWorkspace} className="bg-gradient-to-r from-primary to-accent hover:opacity-90">
                {creatingWorkspace ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : <><Plus className="mr-2 h-4 w-4" />Create Workspace</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── ASSIGN WORKSPACE DIALOG ─── */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Assign to Workspace
            </DialogTitle>
            <DialogDescription>
              Assign <span className="font-medium text-foreground">{assigningUser?.email}</span> to a company workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-foreground font-medium">Select Workspace</Label>
              <select
                value={assignTargetWorkspaceId}
                onChange={(e) => setAssignTargetWorkspaceId(e.target.value)}
                className="flex h-11 w-full rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              >
                <option value="">— Choose a workspace —</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>{ws.company_name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)} className="border-border/50">Cancel</Button>
            <Button onClick={handleAssignWorkspace} disabled={!assignTargetWorkspaceId || assigningWorkspace}
              className="bg-gradient-to-r from-primary to-accent hover:opacity-90">
              {assigningWorkspace ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Assigning...</> : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── TOP UP CREDITS DIALOG ─── */}
      <Dialog open={topUpDialogOpen} onOpenChange={setTopUpDialogOpen}>
        <DialogContent className="bg-card border-border/40 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Top Up Credits</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Add credits to <span className="text-foreground font-medium">{topUpWorkspaceName}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="topUpAmount" className="text-foreground font-medium">Credits to Add</Label>
              <Input
                id="topUpAmount"
                type="number"
                min="1"
                placeholder="e.g., 1000"
                value={topUpAmount || ""}
                onChange={(e) => setTopUpAmount(parseInt(e.target.value) || 0)}
                className="bg-background/50 border-border/40 focus:border-primary/60 text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topUpNote" className="text-foreground font-medium">Note (optional)</Label>
              <Input
                id="topUpNote"
                placeholder="e.g., April top-up"
                value={topUpNote}
                onChange={(e) => setTopUpNote(e.target.value)}
                className="bg-background/50 border-border/40 focus:border-primary/60 text-foreground placeholder:text-muted-foreground/40"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTopUpDialogOpen(false)} className="text-muted-foreground">Cancel</Button>
            <Button onClick={handleTopUp} disabled={toppingUp || topUpAmount <= 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {toppingUp ? "Adding..." : `Add ${topUpAmount > 0 ? topUpAmount.toLocaleString() : 0} Credits`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
