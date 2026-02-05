import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { z } from "zod";
import bravoroLogo from "@/assets/bravoro-logo.svg";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetComplete, setResetComplete] = useState(false);

  const token = searchParams.get("token");

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setTokenError("No reset token provided");
        setValidating(false);
        return;
      }

      try {
        // Hash the token to compare with stored hash
        const encoder = new TextEncoder();
        const data = encoder.encode(token);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Validate token via secure edge function (not direct DB query)
        const { data: validationResult, error } = await supabase.functions.invoke('validate-reset-token', {
          body: { token_hash: tokenHash },
        });

        if (error) {
          console.error('Token validation error:', error);
          setTokenError("Unable to validate reset link");
          setValidating(false);
          return;
        }

        if (!validationResult?.valid) {
          setTokenError(validationResult?.error || "Invalid or expired reset link");
          setValidating(false);
          return;
        }

        setUserId(validationResult.user_id);
        setTokenValid(true);
        setValidating(false);
      } catch (err) {
        console.error('Token validation error:', err);
        setTokenError("Unable to validate reset link");
        setValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      passwordSchema.parse(newPassword);

      if (newPassword !== confirmPassword) {
        throw new Error("Passwords do not match");
      }

      setLoading(true);

      // Hash the token to mark it as used
      const encoder = new TextEncoder();
      const data = encoder.encode(token!);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Use Supabase Admin API via edge function to update password
      // The edge function handles token validation and email lookup securely
      const { error: updateError } = await supabase.functions.invoke('update-user-password', {
        body: {
          userId: userId,
          newPassword: newPassword,
          tokenHash: tokenHash,
        },
      });

      if (updateError) throw updateError;

      setResetComplete(true);
      toast({
        title: "Password Updated",
        description: "Your password has been changed successfully. You can now sign in.",
      });

    } catch (error: any) {
      toast({
        title: "Password Reset Failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const passwordRequirements = [
    { met: newPassword.length >= 8, text: "At least 8 characters" },
    { met: /[A-Z]/.test(newPassword), text: "One uppercase letter" },
    { met: /[a-z]/.test(newPassword), text: "One lowercase letter" },
    { met: /[0-9]/.test(newPassword), text: "One number" },
    { met: /[^A-Za-z0-9]/.test(newPassword), text: "One special character" },
  ];

  // Loading state
  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/15 rounded-full blur-3xl" style={{ animation: "float 6s ease-in-out infinite" }} />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent/10 rounded-full blur-3xl" style={{ animation: "float 8s ease-in-out infinite reverse" }} />
        
        <Card className="w-full max-w-md shadow-strong border-border/40 bg-card/90 backdrop-blur-xl relative z-10">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Validating reset link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid token state
  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/15 rounded-full blur-3xl" style={{ animation: "float 6s ease-in-out infinite" }} />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent/10 rounded-full blur-3xl" style={{ animation: "float 8s ease-in-out infinite reverse" }} />
        
        <Card className="w-full max-w-md shadow-strong border-border/40 bg-card/90 backdrop-blur-xl relative z-10">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              <img src={bravoroLogo} alt="Bravoro" className="h-8 w-auto" />
            </div>
            <div className="mx-auto mb-4 w-12 h-12 bg-destructive/20 rounded-full flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-2xl text-foreground">Invalid Reset Link</CardTitle>
            <CardDescription className="text-muted-foreground">
              {tokenError || "This password reset link is invalid or has expired."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => navigate("/auth")}
              className="w-full bg-gradient-to-r from-primary to-caretta hover:opacity-90 text-primary-foreground font-medium shadow-glow"
            >
              Return to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Reset complete state
  if (resetComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/15 rounded-full blur-3xl" style={{ animation: "float 6s ease-in-out infinite" }} />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent/10 rounded-full blur-3xl" style={{ animation: "float 8s ease-in-out infinite reverse" }} />
        
        <Card className="w-full max-w-md shadow-strong border-border/40 bg-card/90 backdrop-blur-xl relative z-10">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              <img src={bravoroLogo} alt="Bravoro" className="h-8 w-auto" />
            </div>
            <div className="mx-auto mb-4 w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl text-foreground">Password Reset Complete</CardTitle>
            <CardDescription className="text-muted-foreground">
              Your password has been successfully updated. You can now sign in with your new password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => navigate("/auth")}
              className="w-full bg-gradient-to-r from-primary to-caretta hover:opacity-90 text-primary-foreground font-medium shadow-glow"
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Password reset form
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/15 rounded-full blur-3xl" style={{ animation: "float 6s ease-in-out infinite" }} />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent/10 rounded-full blur-3xl" style={{ animation: "float 8s ease-in-out infinite reverse" }} />
      
      <Card className="w-full max-w-md shadow-strong border-border/40 bg-card/90 backdrop-blur-xl relative z-10">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <img src={bravoroLogo} alt="Bravoro" className="h-8 w-auto" />
          </div>
          <div className="mx-auto mb-4 w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl text-foreground">Set New Password</CardTitle>
          <CardDescription className="text-muted-foreground">
            Enter your new password below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-foreground">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="bg-muted/30 border-border/50 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-foreground">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="bg-muted/30 border-border/50 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Password Requirements */}
            <div className="bg-muted/30 rounded-lg p-4 space-y-2 border border-border/30">
              <p className="text-sm font-medium mb-2 text-foreground">Password Requirements:</p>
              {passwordRequirements.map((req, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <CheckCircle2
                    className={`h-4 w-4 ${
                      req.met ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <span className={req.met ? "text-foreground" : "text-muted-foreground"}>
                    {req.text}
                  </span>
                </div>
              ))}
            </div>

            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-primary to-caretta hover:opacity-90 text-primary-foreground font-medium shadow-glow" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating Password...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Reset Password
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
