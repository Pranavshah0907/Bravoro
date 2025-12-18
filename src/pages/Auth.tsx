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
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8 relative overflow-hidden bg-[#0d222e]">
      {/* Decorative gradient shapes for dark mode */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#009da5]/15 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[#58dddd]/10 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#277587]/8 rounded-full blur-3xl" />

      <Card className="w-full max-w-md relative z-10 animate-scale-in bg-[#0d222e]/80 backdrop-blur-xl border border-[#277587]/30 shadow-[0_8px_32px_rgba(0,157,165,0.15)]">
        <CardHeader className="text-center space-y-6 pb-2">
          <div className="mx-auto flex flex-col items-center gap-6">
            {/* Logo container with accent glow */}
            <div className="bg-gradient-to-br from-[#009da5]/20 to-[#58dddd]/10 rounded-2xl p-6 border border-[#58dddd]/20 shadow-[0_0_40px_rgba(88,221,221,0.15)]">
              <img 
                src={emploioLogo} 
                alt="emploio" 
                className="h-10 md:h-12 w-auto animate-fade-in" 
              />
            </div>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl md:text-3xl font-bold text-[#e4efef]">
              Welcome Back
            </CardTitle>
            <CardDescription className="text-base text-[#c5d8d7]">
              Sign in to access your account
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6 pt-4">
          <form onSubmit={handleSignIn} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2 text-[#e4efef] font-medium">
                <Mail className="h-4 w-4 text-[#58dddd]" />
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 bg-[#0d222e] border-[#277587]/40 text-[#e4efef] placeholder:text-[#6e7272] focus:border-[#58dddd] focus:ring-2 focus:ring-[#58dddd]/20 transition-all"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2 text-[#e4efef] font-medium">
                <Lock className="h-4 w-4 text-[#58dddd]" />
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 bg-[#0d222e] border-[#277587]/40 text-[#e4efef] placeholder:text-[#6e7272] focus:border-[#58dddd] focus:ring-2 focus:ring-[#58dddd]/20 transition-all"
              />
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 bg-gradient-to-r from-[#009da5] to-[#00686d] hover:from-[#00686d] hover:to-[#009da5] text-[#e4efef] font-semibold text-base shadow-[0_4px_20px_rgba(0,157,165,0.3)] hover:shadow-[0_4px_24px_rgba(0,157,165,0.4)] transition-all duration-300" 
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

          <div className="pt-2 border-t border-[#277587]/20">
            <p className="text-center text-sm text-[#c5d8d7]">
              Don't have an account?{" "}
              <a href="/contact" className="text-[#58dddd] hover:text-[#d4f4f2] font-medium transition-colors underline-offset-4 hover:underline">
                Contact us
              </a>{" "}
              or email{" "}
              <a href="mailto:support@emploio.com" className="text-[#58dddd] hover:text-[#d4f4f2] font-medium transition-colors underline-offset-4 hover:underline">
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