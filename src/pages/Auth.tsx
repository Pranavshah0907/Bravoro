import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { LogIn, Loader2, Mail, Lock } from "lucide-react";
import { z } from "zod";
import emploioLogo from "@/assets/emploio-logo.svg";

const signInSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      signInSchema.parse({ email, password });
      setLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      toast({
        title: "Welcome back!",
        description: "You have successfully signed in",
      });

      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Sign In Failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8 relative overflow-hidden section-gradient">
      {/* Subtle decorative shapes */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-3xl" />

      <Card className="w-full max-w-md relative z-10 shadow-strong border-border/40 animate-scale-in bg-card">
        <CardHeader className="text-center space-y-6 pb-2">
          <div className="mx-auto flex flex-col items-center gap-6">
            {/* Logo container with dark background for white SVG */}
            <div className="bg-[#0d222e] rounded-2xl p-6 shadow-medium">
              <img 
                src={emploioLogo} 
                alt="emploio" 
                className="h-10 md:h-12 w-auto animate-fade-in" 
              />
            </div>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl md:text-3xl font-bold text-foreground">
              Welcome Back
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              Sign in to access your account
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6 pt-4">
          <form onSubmit={handleSignIn} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2 text-foreground font-medium">
                <Mail className="h-4 w-4 text-primary" />
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 bg-muted/30 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2 text-foreground font-medium">
                <Lock className="h-4 w-4 text-primary" />
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 bg-muted/30 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 btn-gradient text-primary-foreground font-semibold text-base" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Signing In...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-5 w-5" />
                  Sign In
                </>
              )}
            </Button>
          </form>

          <div className="pt-2 border-t border-border/30">
            <p className="text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <a href="/contact" className="text-primary hover:text-secondary font-medium transition-colors underline-offset-4 hover:underline">
                Contact us
              </a>{" "}
              or email{" "}
              <a href="mailto:support@emploio.com" className="text-primary hover:text-secondary font-medium transition-colors underline-offset-4 hover:underline">
                support@emploio.com
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;