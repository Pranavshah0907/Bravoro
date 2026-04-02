import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import bravoroLogo from "@/assets/bravoro-logo.svg";
import bravoroIcon from "@/assets/Logo_icon_final.png";
import { ForgotPasswordDialog } from "@/components/ForgotPasswordDialog";
import { LogIn, ChevronRight, Loader2, Mail, Lock, X, PhoneCall, Eye, EyeOff } from "lucide-react";

const signInSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const MARQUEE_ITEMS = [
  "Hiring Signals", "·", "Decision Makers", "·", "Lead Enrichment", "·",
  "Apollo · Lusha", "·", "Enterprise Sales", "·", "AI Staffing", "·", "B2B Intelligence", "·",
];

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "About", href: "/contact" },
  { label: "Platform", href: "/dashboard" },
  { label: "Contact", href: "/contact" },
  { label: "FAQ", href: "/contact" },
];

const LandingV2 = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // If already logged in, go straight to dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/dashboard");
    });
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      signInSchema.parse({ email, password });
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      toast({ title: "Welcome back!", description: "You have successfully signed in" });
      navigate("/dashboard");
    } catch (error: any) {
      toast({ title: "Sign In Failed", description: error.message || "Invalid credentials", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: "#000000",
        color: "#e4efef",
        width: "100%",
        minHeight: "100vh",
        overflowX: "hidden",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        position: "relative",
      }}
    >
      {/* ── Navbar ── */}
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "clamp(12px, 2vw, 20px) clamp(16px, 4vw, 40px)", position: "relative", zIndex: 20, flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ color: "#58dddd", fontSize: "22px", marginRight: "2px" }}>•</span>
          <img src={bravoroLogo} alt="Bravoro" style={{ height: "22px", width: "auto", filter: "brightness(1.05)" }} />
          <span style={{ color: "#58dddd", fontSize: "22px", marginLeft: "2px" }}>•</span>
        </div>

        <ul className="landing-nav-pills hidden md:flex" style={{ gap: "4px", listStyle: "none", margin: 0, padding: "4px 10px", background: "rgba(0,157,165,0.08)", border: "1px solid rgba(88,221,221,0.12)", borderRadius: "999px" }}>
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <a href={link.href} className="landing-nav-link" style={{ display: "block", padding: "6px 14px", borderRadius: "999px", fontSize: "13px", fontWeight: 400, color: "rgba(197,216,215,0.75)", textDecoration: "none", letterSpacing: "0.01em" }}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <button
          onClick={() => setShowLogin(true)}
          className="landing-cta-nav"
          style={{ background: "#009da5", color: "#fff", border: "none", borderRadius: "10px", padding: "9px 20px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", boxShadow: "0 4px 20px rgba(0,157,165,0.35)", letterSpacing: "0.01em", minHeight: "44px" }}
        >
          <LogIn size={13} />
          Login to Platform
        </button>
      </nav>

      {/* ── Hero content ── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "clamp(48px, 8vh, 96px) 24px clamp(60px, 10vh, 120px)", position: "relative", zIndex: 10 }}>

        {/* Badge pill */}
        <div style={{ display: "inline-flex", alignItems: "center", background: "rgba(0,157,165,0.10)", border: "1px solid rgba(88,221,221,0.30)", borderRadius: "999px", padding: "4px 16px 4px 4px", marginBottom: "clamp(28px, 5vh, 44px)" }}>
          <span style={{ background: "#009da5", color: "#fff", padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, marginRight: "10px", letterSpacing: "0.05em" }}>2025</span>
          <span style={{ color: "#58dddd", fontSize: "12px", fontWeight: 500, letterSpacing: "0.06em" }}>AI Staffing Intelligence</span>
        </div>

        {/* Hero headline */}
        <h1 style={{ fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.035em", margin: "0 0 clamp(8px, 1.5vh, 16px)", fontSize: "clamp(2.6rem, 6vw, 5rem)", color: "#e4efef" }}>
          Find the Right Decision Makers.
        </h1>
        <h1 style={{ fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.035em", margin: "0 0 clamp(20px, 3.5vh, 32px)", fontSize: "clamp(2.6rem, 6vw, 5rem)", background: "linear-gradient(135deg, #58dddd 0%, #009da5 55%, #00686d 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
          At Scale.
        </h1>

        {/* Subtext */}
        <p style={{ fontSize: "clamp(0.85rem, 1.2vw, 1rem)", color: "rgba(197,216,215,0.55)", fontWeight: 400, maxWidth: "480px", margin: "0 0 8px", lineHeight: 1.65 }}>
          AI-powered lead enrichment powered by real-time hiring signals.
        </p>
        <p style={{ fontSize: "clamp(0.85rem, 1.2vw, 1rem)", color: "rgba(197,216,215,0.55)", fontWeight: 400, maxWidth: "480px", margin: "0 0 clamp(28px, 5vh, 44px)", lineHeight: 1.65 }}>
          Reach enterprise decision-makers before your competition does.
        </p>

        {/* CTA row */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={() => setShowLogin(true)}
            className="landing-btn-primary"
            style={{ background: "linear-gradient(135deg, #009da5 0%, #00686d 100%)", color: "#fff", border: "none", borderRadius: "10px", padding: "clamp(10px, 1.5vh, 13px) clamp(22px, 3vw, 30px)", fontSize: "14px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "7px", boxShadow: "0 4px 24px rgba(0,157,165,0.40), 0 1px 0 rgba(255,255,255,0.1) inset", letterSpacing: "0.01em" }}
          >
            Get Started
            <ChevronRight size={15} />
          </button>

          <a
            href="/contact"
            className="landing-btn-secondary"
            style={{ background: "rgba(88,221,221,0.06)", color: "#58dddd", border: "1px solid rgba(88,221,221,0.28)", borderRadius: "10px", padding: "clamp(10px, 1.5vh, 13px) clamp(22px, 3vw, 30px)", fontSize: "14px", fontWeight: 600, cursor: "pointer", letterSpacing: "0.01em", backdropFilter: "blur(8px)", textDecoration: "none", display: "flex", alignItems: "center", gap: "7px" }}
          >
            <PhoneCall size={14} />
            Contact Us
          </a>
        </div>

        {/* Marquee strip */}
        <div style={{ width: "100%", maxWidth: "640px", margin: "clamp(40px, 7vh, 72px) auto 0", overflow: "hidden", position: "relative", height: "36px" }}>
          <div style={{ pointerEvents: "none", position: "absolute", inset: 0, width: "80px", background: "linear-gradient(to right, #000000, transparent)", zIndex: 2 }} />
          <div style={{ pointerEvents: "none", position: "absolute", inset: 0, left: "auto", right: 0, width: "80px", background: "linear-gradient(to left, #000000, transparent)", zIndex: 2 }} />
          <div className="animate-marquee" style={{ display: "flex", whiteSpace: "nowrap", alignItems: "center", height: "100%" }}>
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
              <span key={i} style={{ padding: "0 18px", color: item === "·" ? "rgba(88,221,221,0.35)" : "rgba(197,216,215,0.38)", fontSize: item === "·" ? "20px" : "13px", fontWeight: item === "·" ? 700 : 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom glow — static, GPU-free ── */}
      {/* Wide ambient halo */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "520px", background: "radial-gradient(ellipse 85% 65% at 50% 100%, rgba(0,157,165,0.45) 0%, rgba(39,117,135,0.22) 40%, transparent 70%)", filter: "blur(70px)", pointerEvents: "none", zIndex: 1 }} />
      {/* Bright core — Cardinal Blue */}
      <div style={{ position: "absolute", bottom: "-60px", left: "25%", right: "25%", height: "320px", background: "radial-gradient(ellipse 100% 75% at 50% 100%, rgba(88,221,221,0.55) 0%, rgba(0,157,165,0.30) 45%, transparent 100%)", filter: "blur(45px)", pointerEvents: "none", zIndex: 1, borderRadius: "50%" }} />

      {/* ── Login Modal ── */}
      {showLogin && (
        <div
          className="lv2-modal-overlay"
          style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(7,21,31,0.82)", backdropFilter: "blur(12px)", padding: "16px" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowLogin(false); }}
        >
          <div
            className="lv2-modal-card"
            style={{ position: "relative", background: "linear-gradient(160deg, rgba(13,34,46,0.98) 0%, rgba(9,24,34,0.99) 100%)", border: "1px solid rgba(88,221,221,0.18)", borderRadius: "20px", padding: "clamp(28px, 4vh, 40px) clamp(24px, 4vw, 40px)", width: "100%", maxWidth: "420px", boxShadow: "0 0 0 1px rgba(88,221,221,0.06) inset, 0 32px 100px rgba(0,0,0,0.7), 0 0 80px rgba(88,221,221,0.08)" }}
          >
            {/* Top edge glow */}
            <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: "1px", background: "linear-gradient(90deg, transparent, rgba(88,221,221,0.5), transparent)", borderRadius: "100px" }} />

            {/* Close */}
            <button
              onClick={() => setShowLogin(false)}
              className="lv2-close-btn"
              style={{ position: "absolute", top: "14px", right: "14px", background: "rgba(88,221,221,0.08)", border: "1px solid rgba(88,221,221,0.15)", borderRadius: "8px", width: "30px", height: "30px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(197,216,215,0.7)" }}
            >
              <X size={13} />
            </button>

            {/* Modal header */}
            <div style={{ textAlign: "center", marginBottom: "clamp(20px, 3vh, 28px)" }}>
              <div style={{ position: "relative", display: "inline-block", marginBottom: "14px" }}>
                <div style={{ position: "absolute", inset: "-6px", borderRadius: "16px", background: "radial-gradient(ellipse, rgba(88,221,221,0.18), transparent 70%)", filter: "blur(10px)" }} />
                <img src={bravoroIcon} alt="Bravoro" style={{ height: "44px", width: "44px", borderRadius: "12px", boxShadow: "0 0 0 1px rgba(88,221,221,0.2), 0 8px 24px rgba(0,0,0,0.4)", position: "relative" }} />
              </div>
              <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "1.45rem", color: "#e4efef", margin: "0 0 5px", letterSpacing: "-0.025em" }}>Welcome Back</h2>
              <p style={{ color: "rgba(110,114,114,0.9)", fontSize: "0.82rem", fontFamily: "'Plus Jakarta Sans', sans-serif", margin: 0 }}>Sign in to access your account</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSignIn} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ color: "#c5d8d7", fontSize: "0.78rem", fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", display: "flex", alignItems: "center", gap: "5px", letterSpacing: "0.02em", textTransform: "uppercase" }}>
                  <Mail size={11} style={{ color: "#58dddd" }} />
                  Email Address
                </label>
                <input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="lv2-input" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(88,221,221,0.18)", borderRadius: "10px", padding: "11px 13px", color: "#e4efef", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "0.88rem", outline: "none", width: "100%", boxSizing: "border-box" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={{ color: "#c5d8d7", fontSize: "0.78rem", fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", display: "flex", alignItems: "center", gap: "5px", letterSpacing: "0.02em", textTransform: "uppercase" }}>
                    <Lock size={11} style={{ color: "#58dddd" }} />
                    Password
                  </label>
                  <ForgotPasswordDialog />
                </div>
                <div style={{ position: "relative" }}>
                  <input type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="lv2-input" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(88,221,221,0.18)", borderRadius: "10px", padding: "11px 38px 11px 13px", color: "#e4efef", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "0.88rem", outline: "none", width: "100%", boxSizing: "border-box" }} />
                  <button type="button" onMouseDown={() => setShowPassword(true)} onMouseUp={() => setShowPassword(false)} onMouseLeave={() => setShowPassword(false)} onTouchStart={() => setShowPassword(true)} onTouchEnd={() => setShowPassword(false)} tabIndex={-1} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {showPassword ? <EyeOff size={16} style={{ color: "#58dddd" }} /> : <Eye size={16} style={{ color: "rgba(88,221,221,0.45)" }} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="lv2-submit-btn"
                style={{ background: loading ? "rgba(0,157,165,0.4)" : "linear-gradient(135deg, #009da5 0%, #00686d 100%)", color: "#fff", border: "none", borderRadius: "10px", padding: "12px", fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "0.9rem", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", marginTop: "4px", boxShadow: loading ? "none" : "0 4px 20px rgba(0,157,165,0.35)", letterSpacing: "0.01em" }}
              >
                {loading ? (
                  <><Loader2 size={15} style={{ animation: "lv2-spin 1s linear infinite" }} />Signing In...</>
                ) : (
                  <><LogIn size={15} />Sign In</>
                )}
              </button>
            </form>

            <div style={{ marginTop: "18px", paddingTop: "14px", borderTop: "1px solid rgba(88,221,221,0.1)", textAlign: "center" }}>
              <p style={{ color: "rgba(110,114,114,0.85)", fontSize: "0.78rem", fontFamily: "'Plus Jakarta Sans', sans-serif", margin: 0 }}>
                Don't have an account?{" "}
                <a href="/contact" style={{ color: "#58dddd", fontWeight: 600, textDecoration: "none" }}>Contact us</a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Styles ── */}
      <style>{`
        .landing-nav-link:hover { background: rgba(0,157,165,0.18); color: #58dddd !important; }
        .landing-cta-nav { transition: filter 0.2s ease, transform 0.15s ease; }
        .landing-cta-nav:hover { filter: brightness(1.12); transform: translateY(-1px); }
        .landing-cta-nav:active { transform: translateY(0); }
        .landing-btn-primary { transition: filter 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease; }
        .landing-btn-primary:hover { filter: brightness(1.1); transform: translateY(-2px); box-shadow: 0 8px 36px rgba(0,157,165,0.55) !important; }
        .landing-btn-primary:active { transform: translateY(0); }
        .landing-btn-secondary { transition: border-color 0.2s ease, background 0.2s ease, transform 0.15s ease; }
        .landing-btn-secondary:hover { border-color: rgba(88,221,221,0.55) !important; background: rgba(88,221,221,0.12) !important; transform: translateY(-2px); }
        .landing-btn-secondary:active { transform: translateY(0); }
        @media (max-width: 640px) { .landing-nav-pills { display: none !important; } }

        .lv2-modal-overlay { animation: lv2-fade 0.25s ease; }
        @keyframes lv2-fade { from { opacity: 0; } to { opacity: 1; } }
        .lv2-modal-card { animation: lv2-slide 0.35s cubic-bezier(0.22, 1, 0.36, 1); }
        @keyframes lv2-slide { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .lv2-close-btn { transition: background 0.2s ease, color 0.2s ease; }
        .lv2-close-btn:hover { background: rgba(88,221,221,0.16) !important; color: #58dddd !important; }
        .lv2-input { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        .lv2-input:focus { border-color: rgba(88,221,221,0.5) !important; box-shadow: 0 0 0 3px rgba(88,221,221,0.09) !important; }
        .lv2-submit-btn { transition: filter 0.2s ease, transform 0.15s ease; }
        .lv2-submit-btn:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
        .lv2-submit-btn:active:not(:disabled) { transform: translateY(0); }
        @keyframes lv2-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default LandingV2;
