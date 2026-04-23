import { lazy, Suspense } from "react";
import { UpdateBanner } from "@/components/UpdateBanner";
import { DevVersionBadge } from "@/components/DevVersionBadge";
import { SupportChatWidget } from "@/components/SupportChatWidget";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useThemeSync } from "@/hooks/useThemeSync";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const DevTools = lazy(() => import("./pages/DevTools"));
const Results = lazy(() => import("./pages/Results"));
const UsageAnalytics = lazy(() => import("./pages/UsageAnalytics"));
const UserDatabase = lazy(() => import("./pages/UserDatabase"));
const Contact = lazy(() => import("./pages/Contact"));
const GoogleSheetsGuide = lazy(() => import("./pages/GoogleSheetsGuide"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));
const DocsPage = lazy(() => import("./pages/DocsPage"));

const queryClient = new QueryClient();

function ThemeSyncMount() {
  useThemeSync();
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <ThemeSyncMount />
      <TooltipProvider>
        <UpdateBanner />
        {import.meta.env.DEV && <DevVersionBadge />}
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Navigate to="/" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/dev-tools" element={<DevTools />} />
              <Route path="/results" element={<Results />} />
              <Route path="/analytics" element={<UsageAnalytics />} />
              <Route path="/database" element={<UserDatabase />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/google-sheets-guide" element={<GoogleSheetsGuide />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/docs" element={<Navigate to="/docs/overview" replace />} />
              <Route path="/docs/:sectionSlug" element={<DocsPage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <SupportChatWidget />
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
