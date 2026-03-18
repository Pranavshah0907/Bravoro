import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { useToast } from "@/hooks/use-toast";
import { ManualForm } from "@/components/ManualForm";
import { ExcelUpload } from "@/components/ExcelUpload";
import { BulkPeopleEnrichment } from "@/components/BulkPeopleEnrichment";
import { AIChatInterface, ConversationMeta, AIChatHandle } from "@/components/AIChatInterface";
import { PasswordReset } from "@/components/PasswordReset";
import { AppSidebar } from "@/components/AppSidebar";
import { EnrichmentCard } from "@/components/EnrichmentCard";
import { Search, Upload, Users, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import bravoroLogo from "@/assets/bravoro-logo.svg";

type EnrichmentType = "manual" | "bulk" | "people_enrichment" | "ai_staffing" | null;

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresPasswordReset, setRequiresPasswordReset] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedType, setSelectedType] = useState<EnrichmentType>(null);

  // AI Staffing state lifted to Dashboard for sidebar
  const [aiConvs, setAiConvs] = useState<ConversationMeta[]>([]);
  const [aiActiveId, setAiActiveId] = useState<string>("");
  const aiChatRef = useRef<AIChatHandle>(null);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);

  const enrichmentOptions = [
    {
      type: "manual" as const,
      title: "Single Search",
      description: "Search and enrich contacts from a single company",
      icon: Search,
      gradient: "from-primary/25 via-accent/15 to-primary/8",
    },
    {
      type: "bulk" as const,
      title: "Bulk Search",
      description: "Upload multiple companies and enrich contacts in batch",
      icon: Upload,
      gradient: "from-accent/25 via-secondary/15 to-accent/8",
    },
    {
      type: "people_enrichment" as const,
      title: "Bulk People Enrichment",
      description: "Enrich existing contact lists with updated information",
      icon: Users,
      gradient: "from-secondary/25 via-primary/15 to-secondary/8",
    },
    {
      type: "ai_staffing" as const,
      title: "AI-based Staffing",
      description: "Chat with AI to find and shortlist candidates for your roles",
      icon: Bot,
      gradient: "from-caretta/25 via-primary/15 to-caretta/8",
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

  // AI Staffing handlers
  const handleConvsChange = (convs: ConversationMeta[], activeId: string) => {
    setAiConvs(convs);
    setAiActiveId(activeId);
  };

  const handleSelectAiConv = (id: string) => {
    setAiActiveId(id);
    setSelectedType("ai_staffing");
  };

  const handlePinChange = (pinned: boolean) => {
    setIsSidebarPinned(pinned);
  };

  const handleNewAiChat = () => {
    aiChatRef.current?.newChat();
  };

  const handleRenameAiConv = (id: string, title: string) => {
    aiChatRef.current?.renameConv(id, title);
  };

  const handleDeleteAiConv = (id: string) => {
    aiChatRef.current?.deleteConv(id);
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
        selectedType={selectedType}
        aiConversations={aiConvs}
        aiActiveId={aiActiveId}
        onSelectAiConv={handleSelectAiConv}
        onNewAiChat={handleNewAiChat}
        onRenameAiConv={handleRenameAiConv}
        onDeleteAiConv={handleDeleteAiConv}
        onPinChange={handlePinChange}
      />

      {/* Main Content */}
      <main className={cn(
        "flex-1 min-h-screen duration-300 ease-out",
        isSidebarPinned ? "ml-56" : "ml-16"
      )}>
        {/* Background Effects — atmospheric black + teal */}
        <div className={cn(
          "fixed inset-0 pointer-events-none overflow-hidden duration-300 ease-out",
          isSidebarPinned ? "ml-56" : "ml-16"
        )}>
          {/* Dot grid texture */}
          <div className="absolute inset-0 opacity-[0.055]" style={{
            backgroundImage: "radial-gradient(circle, #009da5 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }} />
          {/* Top-center teal corona */}
          <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full opacity-30" style={{
            background: "radial-gradient(ellipse, #009da5 0%, transparent 65%)",
            filter: "blur(60px)",
            animation: "float 22s ease-in-out infinite",
          }} />
          {/* Bottom-right secondary glow */}
          <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full opacity-15" style={{
            background: "radial-gradient(circle, #58dddd 0%, transparent 65%)",
            filter: "blur(80px)",
            animation: "float 18s ease-in-out infinite reverse",
          }} />
        </div>

        {/* Content */}
        <div className="relative z-10">
          {/* Logo in top right — hidden when AI staffing active (shown in chat header instead) */}
          {selectedType !== "ai_staffing" && (
            <div className="fixed top-6 right-6 md:top-8 md:right-8 z-40 pointer-events-none">
              <img src={bravoroLogo} alt="Bravoro" className="h-6 md:h-7 w-auto" />
            </div>
          )}

          {selectedType === "ai_staffing" ? (
            /* AI Staffing — full height */
            <div className="p-4 lg:p-6" style={{ paddingTop: "1.5rem", height: "100vh" }}>
              <AIChatInterface
                ref={aiChatRef}
                userId={user?.id || ""}
                externalActiveId={aiActiveId}
                onConvsChange={handleConvsChange}
              />
            </div>
          ) : !selectedType ? (
            /* ── Home: Welcome view ── */
            <div className="min-h-screen flex flex-col items-center justify-center px-8 py-16">
              <div className="text-center mb-14 animate-fade-in">
                <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#009da5] mb-4 opacity-80">
                  Lead Enrichment Platform
                </p>
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold mb-4 leading-none tracking-tight" style={{
                  background: "linear-gradient(135deg, #ffffff 30%, #58dddd 75%, #009da5 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>
                  Welcome back
                </h1>
                <p className="text-base lg:text-lg text-[#3d8080] max-w-lg mx-auto font-medium">
                  Select an enrichment method to get started
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl w-full items-stretch">
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
            /* ── Selected View: Left panel + Form ── */
            <div className="flex flex-col lg:flex-row min-h-screen">

              {/* Left Sticky Cards — redesigned black+teal */}
              <div className="
                lg:sticky lg:top-0 lg:h-screen
                w-full lg:w-60 xl:w-68 2xl:w-76
                shrink-0 flex flex-col justify-center
                py-4 lg:py-[10vh]
                px-4 lg:px-0 lg:pl-5
              ">
                <div className="flex flex-row lg:flex-col gap-2 lg:gap-3 h-auto lg:h-full overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
                  {enrichmentOptions.map((option, index) => {
                    const isSelected = selectedType === option.type;
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.type}
                        onClick={() => setSelectedType(option.type)}
                        className={cn(
                          "animate-sweep-left flex-shrink-0 lg:flex-1 relative",
                          "flex flex-col items-center justify-center text-center",
                          "min-w-[130px] lg:min-w-0",
                          "p-4 lg:p-5 xl:p-6 rounded-2xl",
                          "border transition-all duration-300 ease-out",
                          "focus:outline-none active:scale-[0.98]",
                          isSelected
                            ? "bg-[#060d0d] border-[#009da5]/60 shadow-[0_0_24px_#009da525,0_4px_20px_#000000a0]"
                            : "bg-[#060d0d] border-[#0f2424] hover:border-[#009da5]/35 hover:bg-[#0a1414] hover:shadow-[0_4px_20px_#000000a0]"
                        )}
                        style={{ animationDelay: `${index * 80}ms` }}
                      >
                        {/* Left teal bar when selected */}
                        {isSelected && (
                          <div className="absolute left-0 top-4 bottom-4 w-[3px] bg-gradient-to-b from-[#009da5] to-[#58dddd] rounded-r-full shadow-[0_0_8px_#009da5]" />
                        )}

                        {/* Icon */}
                        <div className={cn(
                          "p-3 lg:p-3.5 rounded-xl mb-2.5 lg:mb-3 transition-all duration-300 border",
                          isSelected
                            ? "bg-[#009da5]/15 text-[#58dddd] border-[#009da5]/30 shadow-[0_0_16px_#009da520]"
                            : "bg-[#0a1414] text-[#3d7070] border-[#0f2424] group-hover:text-[#009da5]"
                        )}>
                          <Icon className="h-5 w-5 lg:h-6 lg:w-6" />
                        </div>

                        {/* Title */}
                        <h3 className={cn(
                          "font-bold text-sm lg:text-[15px] leading-tight transition-colors duration-200",
                          isSelected ? "text-white" : "text-[#7ab8b8]"
                        )}>
                          {option.title}
                        </h3>

                        {/* Description */}
                        <p className={cn(
                          "text-[11px] lg:text-xs mt-1.5 px-2 leading-relaxed hidden lg:block transition-colors duration-200",
                          isSelected ? "text-[#3d8080]" : "text-[#2a5555]"
                        )}>
                          {option.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Gap */}
              <div className="hidden lg:block w-4 xl:w-6 shrink-0" />

              {/* Right Form Area — increased padding and text */}
              <div className="flex-1 p-5 lg:p-8 xl:p-10 2xl:p-12 pt-3 lg:pt-8">
                <div className="max-w-3xl mx-auto">
                  {/* Page header */}
                  <div className="mb-6 lg:mb-8 animate-fade-in">
                    <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#009da5]/70 mb-2">
                      Enrichment
                    </p>
                    <h1 className="text-2xl lg:text-3xl xl:text-4xl font-extrabold text-white tracking-tight mb-2">
                      {enrichmentOptions.find(o => o.type === selectedType)?.title}
                    </h1>
                    <p className="text-sm lg:text-base text-[#3d8080] font-medium">
                      {enrichmentOptions.find(o => o.type === selectedType)?.description}
                    </p>
                    {/* Teal underline accent */}
                    <div className="mt-4 h-px w-16 bg-gradient-to-r from-[#009da5] to-transparent rounded-full" />
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
