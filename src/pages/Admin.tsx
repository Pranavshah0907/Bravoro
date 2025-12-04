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
import { ArrowLeft, UserPlus, Loader2, Shield, Users, Shuffle, Trash2, Sparkles } from "lucide-react";
import { z } from "zod";
import leapLogo from "@/assets/leap-logo.png";
import leapFont from "@/assets/leap-font.png";

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

    // Check if user is admin
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

    // Get roles for all users
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
    
    // Ensure at least one of each type
    password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
    password += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
    password += "0123456789"[Math.floor(Math.random() * 10)];
    password += "!@#$%^&*"[Math.floor(Math.random() * 8)];
    
    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // Shuffle the password
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
      // Call edge function to delete user
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

      // Call edge function to create user
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

      // Handle specific error responses from edge function
      if (!data?.success) {
        if (data?.error) {
          // Check for specific error types
          if (data.error.includes("already been registered")) {
            throw new Error("This email address is already registered. Please use a different email or contact support if you believe this is an error.");
          } else if (data.error.includes("welcome email")) {
            // User created but email failed
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

      // Success - user created and email sent
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-primary/5">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground animate-pulse">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/10 to-primary/5 relative">
      {/* Animated background elements */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-3xl" style={{ animation: "float 6s ease-in-out infinite" }} />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent/5 rounded-full blur-3xl" style={{ animation: "float 8s ease-in-out infinite reverse" }} />

      <header className="border-b border-border/50 glass-effect sticky top-0 z-50 animate-slide-up">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate("/dashboard")}
                className="hover-lift"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Shield className="h-8 w-8 text-primary" />
                  <div className="absolute inset-0 bg-primary/10 rounded-full blur-lg" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    Admin Panel
                  </h1>
                  <p className="text-xs text-muted-foreground">Manage users and permissions</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-6xl space-y-8 relative z-10">
        {/* Create User Card */}
        <Card className="shadow-strong hover-lift border-border/50 backdrop-blur-sm bg-card/95 animate-fade-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Sparkles className="h-5 w-5 text-primary" />
              Create New User
            </CardTitle>
            <CardDescription className="text-base">
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
                    className="h-11 transition-all focus:ring-2 focus:ring-primary/20"
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
                    className="h-11 transition-all focus:ring-2 focus:ring-primary/20"
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
                    className="flex-1 h-11 transition-all focus:ring-2 focus:ring-primary/20"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGeneratePassword}
                    className="shrink-0 h-11 hover-lift"
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
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                className="w-full md:w-auto h-11 bg-gradient-to-r from-primary to-accent hover:opacity-90 hover-glow transition-all text-primary-foreground"
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
        <Card className="shadow-strong hover-lift border-border/50 backdrop-blur-sm bg-card/95 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Users className="h-5 w-5 text-primary" />
              All Users
            </CardTitle>
            <CardDescription className="text-base">
              View and manage all registered users
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-semibold">Email</TableHead>
                    <TableHead className="font-semibold">Full Name</TableHead>
                    <TableHead className="font-semibold">Role</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Created</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user, index) => (
                    <TableRow 
                      key={user.id}
                      className="hover:bg-muted/20 transition-colors"
                      style={{ 
                        animation: "fade-in 0.5s ease-out forwards",
                        animationDelay: `${index * 0.05}s`,
                        opacity: 0
                      }}
                    >
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell>{user.full_name || "-"}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={user.role === "admin" ? "default" : "secondary"}
                          className={user.role === "admin" ? "bg-gradient-to-r from-primary to-secondary" : ""}
                        >
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.requires_password_reset ? "outline" : "default"}>
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
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 transition-all"
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
      </main>
    </div>
  );
};

export default Admin;
