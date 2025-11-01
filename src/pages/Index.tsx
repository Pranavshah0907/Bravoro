import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, Shield, TrendingUp } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to auth page by default
    navigate("/auth");
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-accent/10">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-6xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              LEAP
            </h1>
            <p className="text-xl text-muted-foreground">
              Lead Enrichment & Automation Platform
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <div className="p-6 rounded-lg bg-card border border-border/50 shadow-soft">
              <Zap className="h-12 w-12 text-primary mb-4 mx-auto" />
              <h3 className="font-semibold mb-2">Lightning Fast</h3>
              <p className="text-sm text-muted-foreground">
                Automated lead enrichment in minutes, not hours
              </p>
            </div>
            <div className="p-6 rounded-lg bg-card border border-border/50 shadow-soft">
              <Shield className="h-12 w-12 text-primary mb-4 mx-auto" />
              <h3 className="font-semibold mb-2">Secure & Reliable</h3>
              <p className="text-sm text-muted-foreground">
                Enterprise-grade security for your data
              </p>
            </div>
            <div className="p-6 rounded-lg bg-card border border-border/50 shadow-soft">
              <TrendingUp className="h-12 w-12 text-primary mb-4 mx-auto" />
              <h3 className="font-semibold mb-2">Scale with Ease</h3>
              <p className="text-sm text-muted-foreground">
                From single leads to bulk processing
              </p>
            </div>
          </div>

          <div className="pt-8">
            <Button size="lg" onClick={() => navigate("/auth")} className="group">
              Get Started
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
