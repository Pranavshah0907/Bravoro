import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { useToast } from "@/hooks/use-toast";
import { ManualForm } from "@/components/ManualForm";
import { ExcelUpload } from "@/components/ExcelUpload";
import { BulkPeopleEnrichment } from "@/components/BulkPeopleEnrichment";
import { AIChatWrapper } from "@/components/chat/AIChatWrapper";
import { RecruitingChatWrapper } from "@/components/chat/RecruitingChatWrapper";
import type { ChatHandle, ConversationMeta } from "@/components/chat/chatTypes";
import type { ChatHandle as RecruitingChatHandle } from "@/components/chat/chatTypes";
import { PasswordReset } from "@/components/PasswordReset";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileHeader } from "@/components/MobileHeader";
import { MobileTabBar } from "@/components/MobileTabBar";
import { EnrichmentCard } from "@/components/EnrichmentCard";
import { DesktopRecommendedBanner } from "@/components/DesktopRecommendedBanner";
import { Search, Upload, Users, Bot, UserSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import bravoroLogo from "@/assets/bravoro-logo.svg";

type EnrichmentType = "manual" | "bulk" | "people_enrichment" | "ai_staffing" | "recruiting_chat" | null;

const VALID_TABS: EnrichmentType[] = ["manual", "bulk", "people_enrichment", "ai_staffing", "recruiting_chat"];

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresPasswordReset, setRequiresPasswordReset] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Derive selectedType from URL ?tab= param
  const tabParam = searchParams.get("tab") as EnrichmentType;
  const selectedType: EnrichmentType = VALID_TABS.includes(tabParam) ? tabParam : null;

  const setSelectedType = (type: EnrichmentType) => {
    if (type) {
      setSearchParams({ tab: type }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  // AI Staffing state lifted to Dashboard for sidebar
  const [aiConvs, setAiConvs] = useState<ConversationMeta[]>([]);
  const [aiActiveId, setAiActiveId] = useState<string>("");
  const aiChatRef = useRef<ChatHandle>(null);

  // Recruiting chat state
  const [recruitConvs, setRecruitConvs] = useState<ConversationMeta[]>([]);
  const [recruitActiveId, setRecruitActiveId] = useState<string>("");
  const recruitChatRef = useRef<RecruitingChatHandle>(null);

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
    {
      type: "recruiting_chat" as const,
      title: "Recruiting Search",
      description: "Find candidates by role, skills & location using AI",
      icon: UserSearch,
      gradient: "from-accent/25 via-primary/15 to-caretta/8",
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
    await supabase.auth.signOut({ scope: 'local' });
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

  // Recruiting handlers
  const handleRecruitConvsChange = (convs: ConversationMeta[], id: string) => {
    setRecruitConvs(convs);
    setRecruitActiveId(id);
  };
  const handleSelectRecruitConv = (id: string) => setRecruitActiveId(id);
  const handleNewRecruitChat = () => recruitChatRef.current?.newChat();
  const handleRenameRecruitConv = (id: string, t: string) => recruitChatRef.current?.renameConv(id, t);
  const handleDeleteRecruitConv = (id: string) => recruitChatRef.current?.deleteConv(id);

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
        return <ExcelUpload userId={user?.id || ""} userEmail={user?.email || ""} />;
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
        isDeveloper={user?.email === "pranavshah0907@gmail.com"}
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
        onSelectEnrichment={(type) => setSelectedType(type as EnrichmentType)}
        recruitConversations={recruitConvs}
        recruitActiveId={recruitActiveId}
        onSelectRecruitConv={handleSelectRecruitConv}
        onNewRecruitChat={handleNewRecruitChat}
        onRenameRecruitConv={handleRenameRecruitConv}
        onDeleteRecruitConv={handleDeleteRecruitConv}
      />

      {/* Mobile navigation */}
      <MobileHeader />
      <MobileTabBar
        isAdmin={isAdmin}
        isDeveloper={user?.email === "pranavshah0907@gmail.com"}
      />

      {/* Main Content */}
      <main className={cn(
        "flex-1 min-w-0 min-h-screen duration-300 ease-out",
        "ml-0 pt-14 pb-20 md:pt-0 md:pb-0 md:ml-16",
        isSidebarPinned && "md:ml-56"
      )}>
        {/* Background Effects — atmospheric black + teal */}
        <div className={cn(
          "fixed inset-0 pointer-events-none overflow-hidden duration-300 ease-out",
          "ml-0 md:ml-16",
          isSidebarPinned && "md:ml-56"
        )}>
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
          {selectedType !== "ai_staffing" && selectedType !== "recruiting_chat" && (
            <div className="fixed top-6 right-6 md:top-8 md:right-8 z-40 pointer-events-none">
              <img src={bravoroLogo} alt="Bravoro" className="h-6 md:h-7 w-auto" />
            </div>
          )}

          {selectedType === "ai_staffing" ? (
            /* AI Staffing — full height */
            <div className="p-4 lg:p-6" style={{ paddingTop: "1.5rem", height: "100vh" }}>
              <AIChatWrapper
                ref={aiChatRef}
                userId={user?.id || ""}
                isAdmin={isAdmin}
                externalActiveId={aiActiveId}
                onConvsChange={handleConvsChange}
              />
            </div>
          ) : selectedType === "recruiting_chat" ? (
            <div className="p-4 lg:p-6" style={{ paddingTop: "1.5rem", height: "100vh" }}>
              <RecruitingChatWrapper
                ref={recruitChatRef}
                userId={user?.id || ""}
                isAdmin={isAdmin}
                externalActiveId={recruitActiveId}
                onConvsChange={handleRecruitConvsChange}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 max-w-6xl w-full items-stretch">
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
            /* ── Selected View: Form ── */
            <div className="min-h-screen">
              {(selectedType === "manual" || selectedType === "bulk" || selectedType === "people_enrichment") && (
                <DesktopRecommendedBanner pageKey={selectedType} />
              )}

              {/* Form Area — full width now that nav is in sidebar */}
              <div className="p-5 lg:p-8 xl:p-10 2xl:p-12 pt-3 lg:pt-8">
                <div className={selectedType === "bulk" ? "max-w-full" : "max-w-4xl mx-auto"}>
                  {/* Page header */}
                  <div className="mb-6 lg:mb-8 animate-fade-in">
                    <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#009da5]/70 mb-2">
                      Enrichment
                    </p>
                    <h1 className="text-2xl lg:text-3xl xl:text-4xl font-extrabold text-white tracking-tight mb-2">
                      {enrichmentOptions.find(o => o.type === selectedType)?.title}
                    </h1>
                    <p className="text-sm lg:text-base text-[#3d7070] font-medium">
                      {enrichmentOptions.find(o => o.type === selectedType)?.description}
                    </p>
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
