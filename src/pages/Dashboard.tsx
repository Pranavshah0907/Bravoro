import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, FileText, BarChart3, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ManualForm } from "@/components/ManualForm";
import { ExcelUpload } from "@/components/ExcelUpload";
import { PasswordReset } from "@/components/PasswordReset";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import leapLogo from "@/assets/leap-logo.png";
import leapFont from "@/assets/leap-font.png";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresPasswordReset, setRequiresPasswordReset] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAuthAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        checkProfile(session.user.id);
      } else {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const checkAuthAndProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      setUser(session.user);
      await checkProfile(session.user.id);
    } else {
      navigate("/auth");
    }
  };

  const checkProfile = async (userId: string) => {
    // Check if password reset is required
    const { data: profile } = await supabase
      .from("profiles")
      .select("requires_password_reset")
      .eq("id", userId)
      .single();

    if (profile?.requires_password_reset) {
      setRequiresPasswordReset(true);
      setLoading(false);
      return;
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    setIsAdmin(roleData?.role === "admin");
    setRequiresPasswordReset(false);
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully",
    });
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-primary/5">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground animate-pulse">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  if (requiresPasswordReset && user) {
    return (
      <PasswordReset 
        userId={user.id} 
        onComplete={() => {
          setRequiresPasswordReset(false);
          checkAuthAndProfile();
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/10 to-primary/5 relative">
      {/* Animated background elements */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "4s" }} />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-secondary/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "5s" }} />

      <header className="border-b border-border/50 glass-effect sticky top-0 z-50 animate-slide-up">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img src={leapLogo} alt="LEAP Logo" className="h-12 w-12 transition-transform hover:scale-110" />
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl" />
            </div>
            <div>
              <img src={leapFont} alt="LEAP" className="h-8" />
              <p className="text-xs text-muted-foreground mt-1 tracking-wide">Lead Enrichment & Automation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate("/analytics")}
              className="hover-lift hover:text-primary transition-all"
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Analytics
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate("/results")}
              className="hover-lift hover:text-primary transition-all"
            >
              <FileText className="mr-2 h-4 w-4" />
              Results
            </Button>
            {isAdmin && (
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => navigate("/admin")}
                className="hover-lift bg-gradient-to-r from-secondary/10 to-accent/10 hover:from-secondary/20 hover:to-accent/20 transition-all"
              >
                <Shield className="mr-2 h-4 w-4" />
                Admin
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleSignOut}
              className="hover:text-destructive transition-all"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-5xl relative z-10">
        <div className="mb-10 text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            <span>AI-Powered Lead Generation</span>
          </div>
          <h2 className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
            Welcome back!
          </h2>
          <p className="text-muted-foreground text-lg">
            Choose your preferred method to submit lead enrichment requests
          </p>
        </div>

        <Tabs defaultValue="manual" className="w-full animate-slide-up">
          <TabsList className="grid w-full grid-cols-2 mb-8 h-12 p-1 bg-muted/50 backdrop-blur-sm">
            <TabsTrigger 
              value="manual" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary/90 data-[state=active]:text-primary-foreground transition-all"
            >
              Manual Entry
            </TabsTrigger>
            <TabsTrigger 
              value="bulk"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary/90 data-[state=active]:text-primary-foreground transition-all"
            >
              Bulk Upload
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="animate-fade-in">
            <ManualForm userId={user?.id || ""} />
          </TabsContent>

          <TabsContent value="bulk" className="animate-fade-in">
            <ExcelUpload userId={user?.id || ""} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;
