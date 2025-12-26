import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { useToast } from "@/hooks/use-toast";
import { ManualForm } from "@/components/ManualForm";
import { ExcelUpload } from "@/components/ExcelUpload";
import { BulkPeopleEnrichment } from "@/components/BulkPeopleEnrichment";
import { PasswordReset } from "@/components/PasswordReset";
import { AppSidebar } from "@/components/AppSidebar";
import { EnrichmentCard } from "@/components/EnrichmentCard";
import { Search, Upload, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type EnrichmentType = "manual" | "bulk" | "people_enrichment" | null;

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresPasswordReset, setRequiresPasswordReset] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedType, setSelectedType] = useState<EnrichmentType>(null);

  const enrichmentOptions = [
    {
      type: "manual" as const,
      title: "Single Search",
      description: "Search and enrich contacts from a single company",
      icon: Search,
      gradient: "from-primary/15 via-accent/10 to-primary/5",
    },
    {
      type: "bulk" as const,
      title: "Bulk Search",
      description: "Upload multiple companies and enrich contacts in batch",
      icon: Upload,
      gradient: "from-accent/15 via-secondary/10 to-accent/5",
    },
    {
      type: "people_enrichment" as const,
      title: "Bulk People Enrichment",
      description: "Enrich existing contact lists with updated information",
      icon: Users,
      gradient: "from-secondary/15 via-primary/10 to-secondary/5",
    },
  ];

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

  const handleHomeClick = () => {
    setSelectedType(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-primary/30" />
            <div className="absolute inset-0 h-12 w-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
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

  const renderForm = () => {
    switch (selectedType) {
      case "manual":
        return <ManualForm userId={user?.id || ""} />;
      case "bulk":
        return <ExcelUpload userId={user?.id || ""} />;
      case "people_enrichment":
        return <BulkPeopleEnrichment userId={user?.id || ""} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <AppSidebar 
        isAdmin={isAdmin} 
        onSignOut={handleSignOut} 
        onHomeClick={handleHomeClick}
      />

      {/* Main Content */}
      <main className={cn(
        "flex-1 ml-16 min-h-screen",
        "transition-all duration-500"
      )}>
        {/* Background Effects */}
        <div className="fixed inset-0 ml-16 pointer-events-none overflow-hidden">
          <div 
            className="absolute -top-1/4 -right-1/4 w-[800px] h-[800px] rounded-full opacity-30"
            style={{
              background: "radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)",
              animation: "float 20s ease-in-out infinite"
            }}
          />
          <div 
            className="absolute -bottom-1/4 -left-1/4 w-[600px] h-[600px] rounded-full opacity-20"
            style={{
              background: "radial-gradient(circle, hsl(var(--accent) / 0.15) 0%, transparent 70%)",
              animation: "float 15s ease-in-out infinite reverse"
            }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10">
          {!selectedType ? (
            /* Initial View - 3 Cards */
            <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
              <div className="text-center mb-12 animate-fade-in">
                <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
                  Welcome back
                </h1>
                <p className="text-lg text-muted-foreground max-w-md mx-auto">
                  Select an enrichment method to get started
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">
                {enrichmentOptions.map((option, index) => (
                  <div
                    key={option.type}
                    className="animate-slide-up"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <EnrichmentCard
                      title={option.title}
                      description={option.description}
                      icon={option.icon}
                      gradient={option.gradient}
                      onClick={() => setSelectedType(option.type)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Selected View - Left Panel + Form */
            <div className="flex min-h-screen">
              {/* Left Sticky Panel */}
              <div className="w-72 shrink-0 sticky top-0 h-screen border-r border-border/50 bg-card/30 backdrop-blur-sm">
                <div className="p-4 h-full flex flex-col">
                  <div className="mb-6">
                    <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                      Enrichment Options
                    </h2>
                  </div>
                  
                  <div className="space-y-3 flex-1">
                    {enrichmentOptions.map((option, index) => (
                      <div
                        key={option.type}
                        className="animate-slide-right"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <EnrichmentCard
                          title={option.title}
                          description={option.description}
                          icon={option.icon}
                          isSelected={selectedType === option.type}
                          isCompact
                          onClick={() => setSelectedType(option.type)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Form Area */}
              <div className="flex-1 p-8 md:p-12">
                <div className="max-w-3xl mx-auto">
                  <div className="mb-8 animate-fade-in">
                    <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                      {enrichmentOptions.find(o => o.type === selectedType)?.title}
                    </h1>
                    <p className="text-muted-foreground">
                      {enrichmentOptions.find(o => o.type === selectedType)?.description}
                    </p>
                  </div>
                  
                  <div className="animate-slide-up">
                    {renderForm()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;