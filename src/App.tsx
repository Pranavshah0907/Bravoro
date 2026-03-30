import { UpdateBanner } from "@/components/UpdateBanner";
import { DevVersionBadge } from "@/components/DevVersionBadge";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import DevTools from "./pages/DevTools";
import Results from "./pages/Results";
import UsageAnalytics from "./pages/UsageAnalytics";
import UserDatabase from "./pages/UserDatabase";
import Contact from "./pages/Contact";
import GoogleSheetsGuide from "./pages/GoogleSheetsGuide";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <UpdateBanner />
      {import.meta.env.DEV && <DevVersionBadge />}
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
