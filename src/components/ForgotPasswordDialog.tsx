import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Mail, KeyRound } from "lucide-react";

export const ForgotPasswordDialog = () => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast({
        title: "Email Required",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          type: 'password-reset',
          resetEmail: email.trim(),
        },
      });

      // Check for invoke error OR if the response indicates failure
      if (error || (data && data.success === false)) {
        throw new Error(data?.error || error?.message || 'Failed to send reset email');
      }

      setSubmitted(true);
      toast({
        title: "Check Your Email",
        description: "If an account exists with this email, you'll receive a password reset link.",
      });
    } catch (error: any) {
      console.error('Password reset error:', error);
      toast({
        title: "Request Failed",
        description: "Unable to process your request. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset state when closing
      setEmail("");
      setSubmitted(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-sm text-accent hover:text-primary transition-colors underline-offset-4 hover:underline"
        >
          Forgot password?
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card border-border/40">
        <DialogHeader className="text-center space-y-4">
          <div className="mx-auto w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-xl text-foreground">
            Reset Your Password
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {submitted
              ? "Check your inbox for the password reset link."
              : "Enter your email address and we'll send you a link to reset your password."}
          </DialogDescription>
        </DialogHeader>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email" className="flex items-center gap-2 text-foreground font-medium">
                <Mail className="h-4 w-4 text-accent" />
                Email Address
              </Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="h-12 bg-muted/30 border-border/50 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-primary to-caretta hover:opacity-90 text-primary-foreground font-semibold shadow-glow transition-all duration-300"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Reset Link"
              )}
            </Button>
          </form>
        ) : (
          <div className="pt-4 text-center">
            <div className="bg-primary/10 rounded-lg p-4 mb-4">
              <p className="text-sm text-foreground">
                We've sent a password reset link to <strong>{email}</strong>
              </p>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Didn't receive the email? Check your spam folder or try again.
            </p>
            <Button
              variant="outline"
              onClick={() => setSubmitted(false)}
              className="w-full"
            >
              Try Again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
