import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Loader2, Shield, Users, Shuffle, Trash2, Sparkles } from "lucide-react";
import { z } from "zod";
import { AppSidebar } from "@/components/AppSidebar";
import emploioLogo from "@/assets/emploio-logo.svg";

const createUserSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters"),
  tempPassword: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "user"]),
});

interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  requires_password_reset: boolean | null;
}

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
      .select("id, email, full_name, created_at, requires_password_reset");

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
        };
      })
    );

    setUsers(usersWithRoles);
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
      });

      setCreatingUser(true);

      const { data, error: createError } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: newUserEmail.trim(),
          fullName: newUserFullName.trim(),
          tempPassword: newUserTempPassword,
          role: newUserRole,
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
                <p className="text-sm text-muted-foreground">Manage users and permissions</p>
              </div>
            </div>
            <img src={emploioLogo} alt="emploio" className="h-6 w-auto hidden md:block" />
          </div>

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
                  Admins have full access to the admin panel and can manage users
                </p>
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
        </div>
      </main>
    </div>
  );
};

export default Admin;