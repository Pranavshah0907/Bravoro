import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Loader2, Shield, Users, Shuffle, Trash2, Sparkles, Edit, Target, BarChart3, CalendarIcon, Activity, Search } from "lucide-react";
import { z } from "zod";
import { AppSidebar } from "@/components/AppSidebar";
import bravoroLogo from "@/assets/bravoro-logo.svg";
import { format, subDays, subWeeks, subMonths, startOfWeek, startOfMonth, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

const createUserSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters"),
  tempPassword: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "user"]),
  enrichmentLimit: z.number().int().min(0, "Enrichment limit must be 0 or greater"),
});

interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  requires_password_reset: boolean | null;
  enrichment_limit: number;
  enrichment_used: number;
}

interface CreditData {
  id: string;
  user_id: string;
  apollo_credits: number;
  aleads_credits: number;
  lusha_credits: number;
  created_at: string;
  grand_total_credits: number;
}

type AnalyticsTimePeriod = "daily" | "weekly" | "monthly" | "custom";

const Admin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [creatingUser, setCreatingUser] = useState(false);
  
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserFullName, setNewUserFullName] = useState("");
  const [newUserTempPassword, setNewUserTempPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "user">("user");
  const [newUserEnrichmentLimit, setNewUserEnrichmentLimit] = useState<number>(0);

  // Edit limit modal state
  const [editLimitDialogOpen, setEditLimitDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [newEnrichmentLimit, setNewEnrichmentLimit] = useState<number>(0);
  const [updatingLimit, setUpdatingLimit] = useState(false);

  // Admin tab state
  const [adminTab, setAdminTab] = useState<"management" | "analytics">("management");

  // User Analytics state
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userCreditData, setUserCreditData] = useState<CreditData[]>([]);
  const [analyticsTimePeriod, setAnalyticsTimePeriod] = useState<AnalyticsTimePeriod>("daily");
  const [analyticsDateRange, setAnalyticsDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      navigate("/auth");
      return;
    }

    setUser(session.user);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .single();

    if (roleData?.role !== "admin") {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access this page",
        variant: "destructive",
      });
      navigate("/dashboard");
      return;
    }

    setIsAdmin(true);
    setLoading(false);
    loadUsers();
  };

  const loadUsers = async () => {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, email, full_name, created_at, requires_password_reset, enrichment_limit, enrichment_used");

    if (!profilesData) return;

    const usersWithRoles = await Promise.all(
      profilesData.map(async (profile) => {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", profile.id)
          .single();

        return {
          ...profile,
          role: roleData?.role || "user",
          enrichment_limit: profile.enrichment_limit ?? 0,
          enrichment_used: profile.enrichment_used ?? 0,
        };
      })
    );

    setUsers(usersWithRoles);
  };

  const fetchUserAnalytics = async (userId: string) => {
    if (!userId) return;
    
    setLoadingAnalytics(true);
    try {
      const { data, error } = await supabase
        .from("credit_usage")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      
      if (error) throw error;
      setUserCreditData(data || []);
    } catch (error) {
      console.error("Error fetching user analytics:", error);
      toast({
        title: "Failed to load analytics",
        description: "Could not fetch user analytics data",
        variant: "destructive",
      });
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    if (selectedUserId) {
      fetchUserAnalytics(selectedUserId);
    }
  }, [selectedUserId]);

  const selectedUserData = useMemo(() => {
    return users.find(u => u.id === selectedUserId);
  }, [users, selectedUserId]);

  const getFilteredCreditData = useMemo(() => {
    if (!userCreditData.length) return [];
    
    const now = new Date();
    let startDate: Date;
    let endDate = endOfDay(now);
    
    if (analyticsTimePeriod === "custom" && analyticsDateRange?.from && analyticsDateRange?.to) {
      startDate = startOfDay(analyticsDateRange.from);
      endDate = endOfDay(analyticsDateRange.to);
    } else {
      switch (analyticsTimePeriod) {
        case "daily":
          startDate = subDays(now, 30);
          break;
        case "weekly":
          startDate = subWeeks(now, 12);
          break;
        case "monthly":
          startDate = subMonths(now, 12);
          break;
        default:
          startDate = subDays(now, 30);
      }
    }
    
    return userCreditData.filter(item => {
      const date = new Date(item.created_at);
      return date >= startDate && date <= endDate;
    });
  }, [userCreditData, analyticsTimePeriod, analyticsDateRange]);

  const groupedAnalyticsData = useMemo(() => {
    if (!getFilteredCreditData.length) return [];
    
    const grouped: Record<string, { date: string; apollo: number; aleads: number; lusha: number; total: number }> = {};
    
    getFilteredCreditData.forEach(item => {
      const date = new Date(item.created_at);
      let key: string;
      
      switch (analyticsTimePeriod) {
        case "daily":
        case "custom":
          key = format(date, "yyyy-MM-dd");
          break;
        case "weekly":
          key = format(startOfWeek(date), "yyyy-MM-dd");
          break;
        case "monthly":
          key = format(startOfMonth(date), "yyyy-MM");
          break;
        default:
          key = format(date, "yyyy-MM-dd");
      }
      
      if (!grouped[key]) {
        grouped[key] = { date: key, apollo: 0, aleads: 0, lusha: 0, total: 0 };
      }
      
      grouped[key].apollo += item.apollo_credits;
      grouped[key].aleads += item.aleads_credits;
      grouped[key].lusha += item.lusha_credits;
      grouped[key].total += item.apollo_credits + item.aleads_credits + item.lusha_credits;
    });
    
    return Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));
  }, [getFilteredCreditData, analyticsTimePeriod]);

  const analyticsSummary = useMemo(() => {
    return getFilteredCreditData.reduce(
      (acc, curr) => ({
        apollo: acc.apollo + curr.apollo_credits,
        aleads: acc.aleads + curr.aleads_credits,
        lusha: acc.lusha + curr.lusha_credits,
        total: acc.total + curr.apollo_credits + curr.aleads_credits + curr.lusha_credits,
      }),
      { apollo: 0, aleads: 0, lusha: 0, total: 0 }
    );
  }, [getFilteredCreditData]);

  // Calculate table totals for displaying at bottom of detailed usage
  const tableTotals = useMemo(() => {
    return groupedAnalyticsData.reduce(
      (acc, curr) => ({
        apollo: acc.apollo + curr.apollo,
        aleads: acc.aleads + curr.aleads,
        lusha: acc.lusha + curr.lusha,
        total: acc.total + curr.total,
      }),
      { apollo: 0, aleads: 0, lusha: 0, total: 0 }
    );
  }, [groupedAnalyticsData]);

  // Filter users based on search
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const searchLower = userSearch.toLowerCase();
    return users.filter(u => 
      u.email.toLowerCase().includes(searchLower) || 
      (u.full_name?.toLowerCase().includes(searchLower))
    );
  }, [users, userSearch]);

  const formatDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    switch (analyticsTimePeriod) {
      case "daily":
      case "custom":
        return format(date, "MMM d, yyyy");
      case "weekly":
        const weekEnd = new Date(date);
        weekEnd.setDate(weekEnd.getDate() + 6);
        return `${format(date, "MMM d, yyyy")} to ${format(weekEnd, "MMM d, yyyy")}`;
      case "monthly":
        return format(date, "MMM yyyy");
      default:
        return format(date, "MMM d, yyyy");
    }
  };

  const generateStrongPassword = () => {
    const length = 16;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";
    let password = "";
    
    password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
    password += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
    password += "0123456789"[Math.floor(Math.random() * 10)];
    password += "!@#$%^&*"[Math.floor(Math.random() * 8)];
    
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    return password.split('').sort(() => Math.random() - 0.5).join('');
  };

  const handleGeneratePassword = () => {
    const newPassword = generateStrongPassword();
    setNewUserTempPassword(newPassword);
    toast({
      title: "Password Generated",
      description: "Strong password has been generated",
    });
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to delete user ${userEmail}? This action cannot be undone.`)) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "User Deleted",
        description: `User ${userEmail} has been deleted successfully`,
      });

      loadUsers();
    } catch (error: any) {
      toast({
        title: "Failed to Delete User",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
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
        enrichmentLimit: newUserEnrichmentLimit,
      });

      setCreatingUser(true);

      const { data, error: createError } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: newUserEmail.trim(),
          fullName: newUserFullName.trim(),
          tempPassword: newUserTempPassword,
          role: newUserRole,
          enrichmentLimit: newUserEnrichmentLimit,
        },
      });

      if (createError) {
        throw new Error(createError.message || "Failed to create user");
      }

      if (!data?.success) {
        if (data?.error) {
          if (data.error.includes("already been registered")) {
            throw new Error("This email address is already registered. Please use a different email or contact support if you believe this is an error.");
          } else if (data.error.includes("welcome email")) {
            toast({
              title: "User Created with Warning",
              description: `User ${newUserEmail} was created but the welcome email failed to send. ${data.error}`,
              variant: "default",
            });
            
            setNewUserEmail("");
            setNewUserFullName("");
            setNewUserTempPassword("");
            setNewUserRole("user");
            setNewUserEnrichmentLimit(0);
            loadUsers();
            return;
          }
          throw new Error(data.error);
        }
        throw new Error("Failed to create user");
      }

      toast({
        title: "User Created Successfully",
        description: data.message || `User ${newUserEmail} has been created and welcome email sent`,
      });

      setNewUserEmail("");
      setNewUserFullName("");
      setNewUserTempPassword("");
      setNewUserRole("user");
      setNewUserEnrichmentLimit(0);
      loadUsers();
    } catch (error: any) {
      toast({
        title: "Failed to Create User",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleOpenEditLimit = (userToEdit: UserWithRole) => {
    setEditingUser(userToEdit);
    setNewEnrichmentLimit(userToEdit.enrichment_limit);
    setEditLimitDialogOpen(true);
  };

  const handleUpdateEnrichmentLimit = async () => {
    if (!editingUser) return;

    try {
      setUpdatingLimit(true);

      const { error } = await supabase
        .from("profiles")
        .update({ 
          enrichment_limit: newEnrichmentLimit,
          updated_at: new Date().toISOString()
        })
        .eq("id", editingUser.id);

      if (error) throw error;

      toast({
        title: "Enrichment Limit Updated",
        description: `${editingUser.email}'s enrichment limit has been updated to ${newEnrichmentLimit}`,
      });

      setEditLimitDialogOpen(false);
      setEditingUser(null);
      loadUsers();
    } catch (error: any) {
      toast({
        title: "Failed to Update Limit",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setUpdatingLimit(false);
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

  if (!isAdmin) {
    return null;
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully",
    });
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background flex">
      <AppSidebar isAdmin={isAdmin} onSignOut={handleSignOut} />
      
      <main className="flex-1 ml-16 min-h-screen">
        {/* Background Effects */}
        <div className="fixed inset-0 ml-16 pointer-events-none overflow-hidden">
          <div 
            className="absolute -top-1/4 -right-1/4 w-[600px] h-[600px] rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)" }}
          />
        </div>

        <div className="relative z-10 p-6 md:p-8 max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Shield className="h-8 w-8 text-primary" />
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-lg" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">Admin Panel</h1>
                <p className="text-sm text-muted-foreground">Manage users and view analytics</p>
              </div>
            </div>
            <img src={bravoroLogo} alt="Bravoro" className="h-6 w-auto hidden md:block" />
          </div>

          {/* Admin Tabs */}
          <Tabs value={adminTab} onValueChange={(v) => setAdminTab(v as "management" | "analytics")} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2 bg-muted/50">
              <TabsTrigger value="management" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                User Management
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                User Analytics
              </TabsTrigger>
            </TabsList>

            {/* User Management Tab */}
            <TabsContent value="management" className="space-y-6 mt-6">
              {/* Create User Card */}
              <Card className="shadow-strong hover-lift border-border/40 backdrop-blur-sm bg-card/90 animate-fade-in">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl text-foreground">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Create New User
                  </CardTitle>
                  <CardDescription className="text-base text-muted-foreground">
                    Create user credentials. Users will be required to reset their password on first login.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateUser} className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-foreground font-medium">Email Address *</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="user@example.com"
                          value={newUserEmail}
                          onChange={(e) => setNewUserEmail(e.target.value)}
                          required
                          className="h-11 bg-muted/30 border-border/50 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="fullName" className="text-foreground font-medium">Full Name *</Label>
                        <Input
                          id="fullName"
                          type="text"
                          placeholder="John Doe"
                          value={newUserFullName}
                          onChange={(e) => setNewUserFullName(e.target.value)}
                          required
                          className="h-11 bg-muted/30 border-border/50 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tempPassword" className="text-foreground font-medium">Temporary Password *</Label>
                      <div className="flex gap-2">
                        <Input
                          id="tempPassword"
                          type="text"
                          placeholder="Min 8 characters"
                          value={newUserTempPassword}
                          onChange={(e) => setNewUserTempPassword(e.target.value)}
                          required
                          className="flex-1 h-11 bg-muted/30 border-border/50 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleGeneratePassword}
                          className="shrink-0 h-11 hover-lift border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        >
                          <Shuffle className="h-4 w-4 mr-2" />
                          Generate
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        User will be required to change this password on first login
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label htmlFor="role" className="text-foreground font-medium">User Role *</Label>
                        <select
                          id="role"
                          value={newUserRole}
                          onChange={(e) => setNewUserRole(e.target.value as "admin" | "user")}
                          className="flex h-11 w-full rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-sm text-foreground ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                        <p className="text-sm text-muted-foreground">
                          Admins have full access to the admin panel
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="enrichmentLimit" className="text-foreground font-medium">Enrichment Contact Limit *</Label>
                        <div className="relative">
                          <Target className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="enrichmentLimit"
                            type="number"
                            min="0"
                            placeholder="e.g., 1000"
                            value={newUserEnrichmentLimit}
                            onChange={(e) => setNewUserEnrichmentLimit(parseInt(e.target.value) || 0)}
                            required
                            className="h-11 pl-10 bg-muted/30 border-border/50 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Maximum contacts this user can enrich
                        </p>
                      </div>
                    </div>
                    <Button 
                      type="submit" 
                      disabled={creatingUser} 
                      className="w-full md:w-auto h-11 bg-gradient-to-r from-primary to-accent hover:opacity-90 hover-glow transition-all text-primary-foreground font-medium"
                    >
                      {creatingUser ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating User...
                        </>
                      ) : (
                        <>
                          <UserPlus className="mr-2 h-4 w-4" />
                          Create User
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Users List */}
              <Card className="shadow-strong hover-lift border-border/40 backdrop-blur-sm bg-card/90 animate-fade-in" style={{ animationDelay: "0.1s" }}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl text-foreground">
                    <Users className="h-5 w-5 text-primary" />
                    All Users
                  </CardTitle>
                  <CardDescription className="text-base text-muted-foreground">
                    View and manage all registered users
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-border/40 overflow-hidden bg-muted/10">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 border-border/30 hover:bg-muted/40">
                          <TableHead className="font-semibold text-foreground">Email</TableHead>
                          <TableHead className="font-semibold text-foreground">Full Name</TableHead>
                          <TableHead className="font-semibold text-foreground">Role</TableHead>
                          <TableHead className="font-semibold text-foreground">Enrichment Limit</TableHead>
                          <TableHead className="font-semibold text-foreground">Status</TableHead>
                          <TableHead className="font-semibold text-foreground">Created</TableHead>
                          <TableHead className="text-right font-semibold text-foreground">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user, index) => (
                          <TableRow 
                            key={user.id}
                            className="hover:bg-muted/20 transition-colors border-border/30"
                            style={{ 
                              animation: "fade-in 0.5s ease-out forwards",
                              animationDelay: `${index * 0.05}s`,
                              opacity: 0
                            }}
                          >
                            <TableCell className="font-medium text-foreground">{user.email}</TableCell>
                            <TableCell className="text-muted-foreground">{user.full_name || "-"}</TableCell>
                            <TableCell>
                              <Badge 
                                variant={user.role === "admin" ? "default" : "secondary"}
                                className={user.role === "admin" ? "bg-gradient-to-r from-primary to-accent text-primary-foreground" : "bg-muted text-muted-foreground"}
                              >
                                {user.role}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground">
                                  {user.enrichment_used} / {user.enrichment_limit}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenEditLimit(user)}
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={user.requires_password_reset ? "outline" : "default"}
                                className={user.requires_password_reset ? "border-border/50 text-muted-foreground" : "bg-primary/20 text-primary border-primary/30"}
                              >
                                {user.requires_password_reset ? "Pending" : "Active"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(user.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteUser(user.id, user.email)}
                                disabled={user.role === "admin"}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-30"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* User Analytics Tab */}
            <TabsContent value="analytics" className="space-y-6 mt-6">
              <Card className="shadow-strong border-border/40 backdrop-blur-sm bg-card/90 animate-fade-in">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl text-foreground">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    User Analytics
                  </CardTitle>
                  <CardDescription className="text-base text-muted-foreground">
                    View detailed credit usage analytics for any user
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* User Selector and Time Period Controls */}
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 space-y-2">
                      <Label className="text-foreground font-medium">Select User</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between bg-muted/30 border-border/50 text-foreground"
                          >
                            {selectedUserId ? (
                              <span className="truncate">
                                {users.find(u => u.id === selectedUserId)?.email || "Select user"}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Choose a user to view analytics</span>
                            )}
                            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0 bg-popover border-border" align="start">
                          <div className="p-2 border-b border-border">
                            <div className="flex items-center gap-2 px-2">
                              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                              <Input
                                placeholder="Search users..."
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                                className="h-8 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                              />
                            </div>
                          </div>
                          <div className="max-h-[300px] overflow-y-auto">
                            {filteredUsers.length === 0 ? (
                              <div className="py-6 text-center text-sm text-muted-foreground">
                                No users found
                              </div>
                            ) : (
                              filteredUsers.map((user) => (
                                <button
                                  key={user.id}
                                  onClick={() => {
                                    setSelectedUserId(user.id);
                                    setUserSearch("");
                                  }}
                                  className={cn(
                                    "w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors flex items-center justify-between",
                                    selectedUserId === user.id && "bg-muted/50"
                                  )}
                                >
                                  <div className="truncate">
                                    <span className="font-medium">{user.email}</span>
                                    {user.full_name && (
                                      <span className="text-muted-foreground ml-2">({user.full_name})</span>
                                    )}
                                  </div>
                                  {selectedUserId === user.id && (
                                    <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    
                    <div className="flex gap-2 items-end">
                      <div className="space-y-2">
                        <Label className="text-foreground font-medium">Time Period</Label>
                        <Select value={analyticsTimePeriod} onValueChange={(v) => setAnalyticsTimePeriod(v as AnalyticsTimePeriod)}>
                          <SelectTrigger className="w-32 bg-muted/30 border-border/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-popover border-border">
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {analyticsTimePeriod === "custom" && (
                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "justify-start text-left font-normal bg-muted/30 border-border/50",
                                !analyticsDateRange && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {analyticsDateRange?.from ? (
                                analyticsDateRange.to ? (
                                  <>
                                    {format(analyticsDateRange.from, "MMM d")} - {format(analyticsDateRange.to, "MMM d")}
                                  </>
                                ) : (
                                  format(analyticsDateRange.from, "MMM d, yyyy")
                                )
                              ) : (
                                <span>Pick dates</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-popover border-border" align="end">
                            <Calendar
                              initialFocus
                              mode="range"
                              defaultMonth={analyticsDateRange?.from}
                              selected={analyticsDateRange}
                              onSelect={(range) => {
                                setAnalyticsDateRange(range);
                                if (range?.from && range?.to) {
                                  setIsCalendarOpen(false);
                                }
                              }}
                              numberOfMonths={2}
                              disabled={(date) => date > new Date()}
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  </div>

                  {!selectedUserId ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Users className="h-12 w-12 mb-4 opacity-40" />
                      <p className="text-lg font-medium">Select a user to view analytics</p>
                      <p className="text-sm opacity-70">Choose a user from the dropdown above</p>
                    </div>
                  ) : loadingAnalytics ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : (
                    <>
                      {/* Summary Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="border-border/40 bg-gradient-to-br from-card to-card/80">
                          <CardContent className="p-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Total Credits</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{analyticsSummary.total.toLocaleString()}</p>
                          </CardContent>
                        </Card>
                        <Card className="border-border/40 bg-gradient-to-br from-card to-card/80">
                          <CardContent className="p-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Apollo</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{analyticsSummary.apollo.toLocaleString()}</p>
                          </CardContent>
                        </Card>
                        <Card className="border-border/40 bg-gradient-to-br from-card to-card/80">
                          <CardContent className="p-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">A-Leads</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{analyticsSummary.aleads.toLocaleString()}</p>
                          </CardContent>
                        </Card>
                        <Card className="border-border/40 bg-gradient-to-br from-card to-card/80">
                          <CardContent className="p-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Lusha</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{analyticsSummary.lusha.toLocaleString()}</p>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Enrichment Status */}
                      {selectedUserData && selectedUserData.enrichment_limit > 0 && (
                        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card/90">
                          <CardContent className="p-5">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Enrichment Status</p>
                                <p className="text-2xl font-bold text-foreground mt-1">
                                  {selectedUserData.enrichment_used.toLocaleString()} / {selectedUserData.enrichment_limit.toLocaleString()}
                                </p>
                              </div>
                              <div className="p-3 rounded-xl bg-primary/10">
                                <Activity className="h-6 w-6 text-primary" />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Used: {selectedUserData.enrichment_used.toLocaleString()}</span>
                                <span>Remaining: {Math.max(0, selectedUserData.enrichment_limit - selectedUserData.enrichment_used).toLocaleString()}</span>
                              </div>
                              <Progress 
                                value={Math.min((selectedUserData.enrichment_used / selectedUserData.enrichment_limit) * 100, 100)} 
                                className="h-2"
                              />
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Usage Table */}
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
                            <div className="rounded-lg border border-border/40 overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/30 border-border/30 hover:bg-muted/40">
                                    <TableHead className="font-semibold text-foreground">Date</TableHead>
                                    <TableHead className="font-semibold text-foreground text-right">Apollo</TableHead>
                                    <TableHead className="font-semibold text-foreground text-right">A-Leads</TableHead>
                                    <TableHead className="font-semibold text-foreground text-right">Lusha</TableHead>
                                    <TableHead className="font-semibold text-foreground text-right">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {groupedAnalyticsData.map((row, index) => (
                                    <TableRow 
                                      key={row.date}
                                      className="hover:bg-muted/20 transition-colors border-border/30"
                                    >
                                      <TableCell className="font-medium text-foreground">
                                        {formatDateLabel(row.date)}
                                      </TableCell>
                                      <TableCell className="text-right text-muted-foreground">
                                        {row.apollo.toLocaleString()}
                                      </TableCell>
                                      <TableCell className="text-right text-muted-foreground">
                                        {row.aleads.toLocaleString()}
                                      </TableCell>
                                      <TableCell className="text-right text-muted-foreground">
                                        {row.lusha.toLocaleString()}
                                      </TableCell>
                                      <TableCell className="text-right font-semibold text-foreground">
                                        {row.total.toLocaleString()}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                  {/* Total Row */}
                                  <TableRow className="bg-muted/40 border-t-2 border-border hover:bg-muted/50">
                                    <TableCell className="font-bold text-foreground">Total</TableCell>
                                    <TableCell className="text-right font-bold text-foreground">
                                      {tableTotals.apollo.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-foreground">
                                      {tableTotals.aleads.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-foreground">
                                      {tableTotals.lusha.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-primary">
                                      {tableTotals.total.toLocaleString()}
                                    </TableCell>
                                  </TableRow>
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Edit Enrichment Limit Dialog */}
      <Dialog open={editLimitDialogOpen} onOpenChange={setEditLimitDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Edit Enrichment Limit
            </DialogTitle>
            <DialogDescription>
              Update the enrichment contact limit for {editingUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Current Usage</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary to-accent transition-all"
                    style={{ 
                      width: `${editingUser ? Math.min((editingUser.enrichment_used / Math.max(editingUser.enrichment_limit, 1)) * 100, 100) : 0}%` 
                    }}
                  />
                </div>
                <span className="text-sm font-medium text-foreground min-w-[80px] text-right">
                  {editingUser?.enrichment_used} / {editingUser?.enrichment_limit}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newLimit" className="text-foreground font-medium">New Enrichment Limit</Label>
              <Input
                id="newLimit"
                type="number"
                min="0"
                value={newEnrichmentLimit}
                onChange={(e) => setNewEnrichmentLimit(parseInt(e.target.value) || 0)}
                className="h-11 bg-muted/30 border-border/50 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <p className="text-xs text-muted-foreground">
                Set to 0 to disable enrichment for this user
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditLimitDialogOpen(false)}
              className="border-border/50"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateEnrichmentLimit}
              disabled={updatingLimit}
              className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
            >
              {updatingLimit ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Limit"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;