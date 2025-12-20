import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, FileText, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ManualForm } from "@/components/ManualForm";
import { ExcelUpload } from "@/components/ExcelUpload";
import { BulkPeopleEnrichment } from "@/components/BulkPeopleEnrichment";
import { PasswordReset } from "@/components/PasswordReset";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import emploioLogo from "@/assets/emploio-logo.svg";

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
      <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent/8 rounded-full blur-3xl" />
        
        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="animate-spin rounded-full h-10 w-10 border-3 border-primary border-t-transparent" />
          <p className="text-muted-foreground text-sm">Loading your workspace...</p>
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
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl" style={{ animation: "float 6s ease-in-out infinite" }} />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent/8 rounded-full blur-3xl" style={{ animation: "float 8s ease-in-out infinite reverse" }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-secondary/5 rounded-full blur-3xl" />

      {/* Header */}
      <header className="border-b border-border/40 glass-effect sticky top-0 z-50">
        <div className="container mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={emploioLogo} alt="emploio" className="h-7 md:h-8 w-auto" />
          </div>
          
          <nav className="flex items-center gap-1 md:gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate("/analytics")}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
            >
              <BarChart3 className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Analytics</span>
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate("/results")}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
            >
              <FileText className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Results</span>
            </Button>
            {isAdmin && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate("/admin")}
                className="text-primary hover:text-primary hover:bg-primary/10 transition-all"
              >
                <Shield className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Admin</span>
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
            >
              <LogOut className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Sign Out</span>
            </Button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 md:px-6 py-8 md:py-12 max-w-4xl relative z-10">
        <div className="mb-8 md:mb-10 text-center animate-fade-in">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
            Welcome back
          </h1>
          <p className="text-muted-foreground text-base md:text-lg">
            Choose your preferred method to submit lead enrichment requests
          </p>
        </div>

        <Tabs defaultValue="manual" className="w-full animate-slide-up">
          <TabsList className="grid w-full grid-cols-3 mb-4 h-12 p-1 bg-muted/60 rounded-xl border border-border/50">
            <TabsTrigger 
              value="manual" 
              className="rounded-lg data-[state=active]:bg-primary/20 data-[state=active]:shadow-soft data-[state=active]:text-foreground text-muted-foreground font-medium transition-all text-xs md:text-sm"
            >
              Single Search
            </TabsTrigger>
            <TabsTrigger 
              value="bulk"
              className="rounded-lg data-[state=active]:bg-primary/20 data-[state=active]:shadow-soft data-[state=active]:text-foreground text-muted-foreground font-medium transition-all text-xs md:text-sm"
            >
              Bulk Search
            </TabsTrigger>
            <TabsTrigger 
              value="people_enrichment"
              className="rounded-lg data-[state=active]:bg-primary/20 data-[state=active]:shadow-soft data-[state=active]:text-foreground text-muted-foreground font-medium transition-all text-xs md:text-sm"
            >
              Bulk People Enrichment
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="animate-fade-in">
            <ManualForm userId={user?.id || ""} />
          </TabsContent>

          <TabsContent value="bulk" className="animate-fade-in">
            <ExcelUpload userId={user?.id || ""} />
          </TabsContent>

          <TabsContent value="people_enrichment" className="animate-fade-in">
            <BulkPeopleEnrichment userId={user?.id || ""} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;