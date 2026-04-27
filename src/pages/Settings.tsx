import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { User as UserIcon, Lock, BarChart3, Loader2, CreditCard } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileHeader } from "@/components/MobileHeader";
import { MobileTabBar } from "@/components/MobileTabBar";
import { BravoroWordmark } from "@/components/BravoroWordmark";

const DEVELOPER_EMAIL = "pranavshah0907@gmail.com";

interface ProfileData {
  first_name: string;
  last_name: string;
  email: string;
  workspace_id: string | null;
}

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Profile state
  const [profile, setProfile] = useState<ProfileData>({
    first_name: "",
    last_name: "",
    email: "",
    workspace_id: null,
  });
  const [workspaceCredits, setWorkspaceCredits] = useState<{ balance: number; name: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Security state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      const currentUser = session.user;
      setUser(currentUser);

      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("first_name, last_name, email, workspace_id")
        .eq("id", currentUser.id)
        .single();

      if (profileData) {
        setProfile({
          first_name: profileData.first_name ?? "",
          last_name: profileData.last_name ?? "",
          email: profileData.email ?? currentUser.email ?? "",
          workspace_id: profileData.workspace_id ?? null,
        });

        if (profileData.workspace_id) {
          const { data: ws } = await supabase
            .from("workspaces")
            .select("credits_balance, company_name")
            .eq("id", profileData.workspace_id)
            .maybeSingle();
          if (ws) {
            setWorkspaceCredits({ balance: ws.credits_balance, name: ws.company_name });
          }
        }
      }

      // Check admin role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", currentUser.id)
        .single();

      if (roleData?.role === "admin") {
        setIsAdmin(true);
      }

      setLoading(false);
    };

    init();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: "local" });
    toast({ title: "Signed out", description: "You have been signed out." });
    navigate("/auth");
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);

    const fullName = `${profile.first_name} ${profile.last_name}`.trim();

    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: profile.first_name,
        last_name: profile.last_name,
        full_name: fullName,
      })
      .eq("id", user.id);

    setSavingProfile(false);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Profile updated",
        description: "Your profile has been saved successfully.",
      });
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "New password and confirmation must match.",
        variant: "destructive",
      });
      return;
    }

    setUpdatingPassword(true);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    setUpdatingPassword(false);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update password. Please try again.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      });
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const initials =
    (profile.first_name?.[0] ?? "").toUpperCase() +
    (profile.last_name?.[0] ?? "").toUpperCase() || "U";

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex overflow-hidden">
      <AppSidebar
        isAdmin={isAdmin}
        isDeveloper={user?.email === DEVELOPER_EMAIL}
        onSignOut={handleSignOut}
      />
      <MobileHeader />
      <MobileTabBar isAdmin={isAdmin} isDeveloper={user?.email === DEVELOPER_EMAIL} />

      <div className="flex-1 ml-0 md:ml-16 overflow-y-auto min-h-screen pt-14 pb-20 md:pt-0 md:pb-0">
        {/* Background Effects — same as Dashboard */}
        <div className="fixed inset-0 ml-0 md:ml-16 pointer-events-none overflow-hidden">
          {/* Top-center teal corona */}
          <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full opacity-25" style={{
            background: "radial-gradient(ellipse, #009da5 0%, transparent 65%)",
            filter: "blur(60px)",
            animation: "float 22s ease-in-out infinite",
          }} />
          {/* Bottom-right secondary glow */}
          <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full" style={{
            background: "radial-gradient(circle, #58dddd 0%, transparent 65%)",
            filter: "blur(80px)",
            opacity: 0.15,
            animation: "float 18s ease-in-out infinite reverse",
          }} />
        </div>

        <div className="relative z-10">
          {/* Bravoro logo top-right */}
          <div className="fixed top-6 right-6 md:top-8 md:right-8 z-40 pointer-events-none">
            <BravoroWordmark className="h-6 md:h-7 w-auto text-foreground" />
          </div>

          <div className="p-4 md:p-12 max-w-3xl mx-auto w-full">
            <h1 className="text-2xl font-bold text-foreground tracking-tight mb-6">
              Settings
            </h1>

          <Tabs defaultValue="profile">
            <TabsList className="bg-muted/50 mb-6">
              <TabsTrigger value="profile" className="gap-2">
                <UserIcon className="h-4 w-4" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2">
                <Lock className="h-4 w-4" />
                Security
              </TabsTrigger>
              <TabsTrigger value="usage" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Usage
              </TabsTrigger>
            </TabsList>

            {/* ── Profile Tab ── */}
            <TabsContent value="profile">
              <div className="rounded-xl border border-border/40 bg-card/30 backdrop-blur-sm p-6 md:p-8 space-y-6">
                {/* Avatar + name display */}
                <div className="flex items-center gap-5">
                  <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
                    <span className="text-xl font-bold text-primary-foreground">
                      {initials}
                    </span>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-foreground">
                      {profile.first_name || profile.last_name
                        ? `${profile.first_name} ${profile.last_name}`.trim()
                        : "No name set"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {profile.email}
                    </p>
                  </div>
                </div>

                <Separator className="bg-border/30" />

                {/* Name fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={profile.first_name}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, first_name: e.target.value }))
                      }
                      placeholder="First name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={profile.last_name}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, last_name: e.target.value }))
                      }
                      placeholder="Last name"
                    />
                  </div>
                </div>

                {/* Email (read-only) */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={profile.email}
                    disabled
                    readOnly
                    className="opacity-60"
                  />
                </div>

                <Button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {savingProfile && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Save Changes
                </Button>
              </div>
            </TabsContent>

            {/* ── Security Tab ── */}
            <TabsContent value="security">
              <div className="rounded-xl border border-border/40 bg-card/30 backdrop-blur-sm p-6 md:p-8 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Change Password
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Update your password to keep your account secure.
                  </p>
                </div>

                <Separator className="bg-border/30" />

                <div className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleUpdatePassword}
                  disabled={updatingPassword || !newPassword || !confirmPassword}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {updatingPassword && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Update Password
                </Button>
              </div>
            </TabsContent>

            {/* ── Usage Tab ── */}
            <TabsContent value="usage" className="space-y-6 animate-in fade-in-50 duration-300">
              <Card className="border-border/40 bg-gradient-to-br from-card to-card/80">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <CreditCard className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Workspace Credits</h3>
                      <p className="text-xs text-muted-foreground">
                        {workspaceCredits ? workspaceCredits.name : "Not assigned to a workspace"}
                      </p>
                    </div>
                  </div>
                  {workspaceCredits ? (
                    <div className="space-y-3">
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-foreground tabular-nums">
                          {workspaceCredits.balance.toLocaleString()}
                        </span>
                        <span className="text-sm text-muted-foreground">credits remaining</span>
                      </div>
                      {workspaceCredits.balance <= 0 && (
                        <p className="text-xs text-red-400">
                          Your workspace is out of credits. Contact your admin to top up.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Contact your admin to get assigned to a workspace.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;