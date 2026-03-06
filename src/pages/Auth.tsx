import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { LogIn, Loader2, Mail, Lock, X, PhoneCall } from "lucide-react";
import { z } from "zod";
import bravoroLogo from "@/assets/bravoro-logo.svg";
import bravoroIcon from "@/assets/Logo_icon_final.png";
import { ForgotPasswordDialog } from "@/components/ForgotPasswordDialog";

// Static beam data — computed once at module level, never re-rendered
// 3 depth layers matching original: thin/slow, medium, thick/fast
const BEAM_DATA = [
  // Layer 1 — thin, slow, subtle (opacity ~0.06–0.08, blur 2px)
  { left: "4%",  w: 10, dur: 14, delay:  0,    op: 0.07,  blur: 2   },
  { left: "22%", w: 12, dur: 16, delay: -5,    op: 0.06,  blur: 2   },
  { left: "41%", w: 10, dur: 13, delay: -9,    op: 0.08,  blur: 2   },
  { left: "63%", w: 11, dur: 15, delay: -2,    op: 0.065, blur: 2   },
  { left: "82%", w: 10, dur: 17, delay: -11,   op: 0.07,  blur: 2   },
  // Layer 2 — medium (opacity ~0.09–0.11, blur 3.5px)
  { left: "13%", w: 17, dur: 11, delay: -4,    op: 0.10,  blur: 3.5 },
  { left: "34%", w: 16, dur: 12, delay: -8,    op: 0.09,  blur: 3.5 },
  { left: "55%", w: 18, dur: 10, delay: -1,    op: 0.11,  blur: 3.5 },
  { left: "74%", w: 16, dur: 13, delay: -6,    op: 0.10,  blur: 3.5 },
  // Layer 3 — thick, faster, more visible (opacity ~0.13–0.15, blur 5px)
  { left: "7%",  w: 24, dur: 8,  delay: -3,    op: 0.14,  blur: 5   },
  { left: "29%", w: 26, dur: 9,  delay: -7,    op: 0.13,  blur: 5   },
  { left: "50%", w: 22, dur: 7,  delay: -0.5,  op: 0.15,  blur: 5   },
  { left: "70%", w: 25, dur: 10, delay: -5,    op: 0.14,  blur: 5   },
  { left: "90%", w: 23, dur: 8,  delay: -10,   op: 0.13,  blur: 5   },
];

const signInSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const rotatingWords = ["Search", "Enrich", "Connect"];

type AnimPhase = "idle" | "exit" | "enter";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);
  const [animPhase, setAnimPhase] = useState<AnimPhase>("idle");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/dashboard");
    });
  }, [navigate]);

  // Rotating word — exit → swap → enter
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimPhase("exit");
      setTimeout(() => {
        setWordIndex((p) => (p + 1) % rotatingWords.length);
        setAnimPhase("enter");
        setTimeout(() => setAnimPhase("idle"), 520);
      }, 360);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  const wordClass =
    animPhase === "exit"
      ? "auth-word-exit"
      : animPhase === "enter"
      ? "auth-word-enter"
      : "";

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
    <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>

      {/* Static background gradient — same colors as canvas drew */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        background: "linear-gradient(to bottom, #09161f 0%, #0f2535 100%)",
      }} />

      {/* CSS beam layer — compositor-only, zero JS after mount */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        overflow: "hidden", pointerEvents: "none",
      }}>
        {BEAM_DATA.map((b, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: b.left,
              top: 0,
              width: b.w,
              height: "160vh",
              background: "linear-gradient(to bottom, transparent 0%, rgba(88,221,221,0.35) 25%, rgba(88,221,221,0.9) 50%, rgba(88,221,221,0.35) 75%, transparent 100%)",
              opacity: b.op,
              filter: `blur(${b.blur}px)`,
              willChange: "transform",
              animation: `auth-beam-rise ${b.dur}s linear ${b.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Center glow */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
        background: "radial-gradient(ellipse 65% 50% at 50% 40%, rgba(88,221,221,0.06) 0%, transparent 70%)",
      }} />

      {/* Hero content */}
      <div style={{
        position: "relative", zIndex: 2,
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100vh",
        padding: "0 24px", textAlign: "center",
      }}>

        {/* Full Bravoro logo */}
        <div style={{
          marginBottom: "clamp(28px, 4vh, 44px)",
          position: "relative",
        }}>
          <div style={{
            position: "absolute", inset: "-12px",
            background: "radial-gradient(ellipse, rgba(88,221,221,0.12), transparent 70%)",
            filter: "blur(16px)",
            pointerEvents: "none",
          }} />
          <img
            src={bravoroLogo}
            alt="Bravoro"
            style={{
              height: "clamp(28px, 3.8vh, 40px)",
              width: "auto",
              position: "relative",
              filter: "drop-shadow(0 0 18px rgba(88,221,221,0.35))",
            }}
          />
        </div>

        {/* Hero headline */}
        <div style={{ maxWidth: "820px", marginBottom: "clamp(12px, 2vh, 20px)" }}>
          <h1 style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "clamp(2rem, 3.8vw, 3.4rem)",
            fontWeight: 800,
            lineHeight: 1.18,
            letterSpacing: "-0.03em",
            color: "#e4efef",
            margin: 0,
          }}>
            Your One-Stop Platform to Find
            <br />
            <span style={{
              background: "linear-gradient(135deg, #58dddd 0%, #009da5 55%, #00686d 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              the Right Decision Makers
            </span>
          </h1>
        </div>

        {/* Rotating word */}
        <div style={{
          height: "clamp(56px, 8vh, 80px)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "clamp(30px, 4.5vh, 48px)",
        }}>
          <span
            className={wordClass}
            style={{
              display: "block",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800,
              fontSize: "clamp(2.2rem, 4.5vw, 4rem)",
              letterSpacing: "-0.04em",
              background: "linear-gradient(135deg, #58dddd 0%, #009da5 60%, #277587 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              textShadow: "none",
              lineHeight: 1,
            }}
          >
            {rotatingWords[wordIndex]}
          </span>
        </div>

        {/* CTA Buttons */}
        <div style={{ display: "flex", flexDirection: "row", gap: "14px", flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={() => setShowLogin(true)}
            className="auth-btn-primary"
            style={{
              background: "linear-gradient(135deg, #009da5 0%, #007a80 50%, #00686d 100%)",
              color: "#fff",
              border: "none",
              borderRadius: "12px",
              padding: "clamp(11px, 1.5vh, 14px) clamp(24px, 3vw, 32px)",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 700,
              fontSize: "clamp(0.85rem, 1.1vw, 0.95rem)",
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: "8px",
              boxShadow: "0 4px 24px rgba(0,157,165,0.4), 0 1px 0 rgba(255,255,255,0.12) inset",
              letterSpacing: "0.01em",
            }}
          >
            <LogIn size={15} />
            Login to Platform
          </button>

          <a
            href="/contact"
            className="auth-btn-secondary"
            style={{
              background: "rgba(88,221,221,0.06)",
              color: "#58dddd",
              border: "1px solid rgba(88,221,221,0.32)",
              borderRadius: "12px",
              padding: "clamp(11px, 1.5vh, 14px) clamp(24px, 3vw, 32px)",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 600,
              fontSize: "clamp(0.85rem, 1.1vw, 0.95rem)",
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: "8px",
              textDecoration: "none",
              backdropFilter: "blur(10px)",
              letterSpacing: "0.01em",
            }}
          >
            <PhoneCall size={15} />
            Contact Us
          </a>
        </div>

        {/* Tagline */}
        <p style={{
          marginTop: "clamp(20px, 3vh, 32px)",
          color: "rgba(110,114,114,0.65)",
          fontSize: "0.7rem",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
        }}>
          Enterprise Lead Intelligence · Trusted by Sales Teams
        </p>
      </div>

      {/* Login Modal Overlay */}
      {showLogin && (
        <div
          className="auth-modal-overlay"
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(7,21,31,0.82)",
            backdropFilter: "blur(12px)",
            padding: "16px",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowLogin(false); }}
        >
          <div
            className="auth-modal-card"
            style={{
              position: "relative",
              background: "linear-gradient(160deg, rgba(13,34,46,0.98) 0%, rgba(9,24,34,0.99) 100%)",
              border: "1px solid rgba(88,221,221,0.18)",
              borderRadius: "20px",
              padding: "clamp(28px, 4vh, 40px) clamp(24px, 4vw, 40px)",
              width: "100%",
              maxWidth: "420px",
              boxShadow: "0 0 0 1px rgba(88,221,221,0.06) inset, 0 32px 100px rgba(0,0,0,0.7), 0 0 80px rgba(88,221,221,0.08)",
            }}
          >
            {/* Top edge glow line */}
            <div style={{
              position: "absolute", top: 0, left: "20%", right: "20%", height: "1px",
              background: "linear-gradient(90deg, transparent, rgba(88,221,221,0.5), transparent)",
              borderRadius: "100px",
            }} />

            {/* Close */}
            <button
              onClick={() => setShowLogin(false)}
              className="auth-close-btn"
              style={{
                position: "absolute", top: "14px", right: "14px",
                background: "rgba(88,221,221,0.08)",
                border: "1px solid rgba(88,221,221,0.15)",
                borderRadius: "8px", width: "30px", height: "30px",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "rgba(197,216,215,0.7)",
              }}
            >
              <X size={13} />
            </button>

            {/* Modal header */}
            <div style={{ textAlign: "center", marginBottom: "clamp(20px, 3vh, 28px)" }}>
              <div style={{ position: "relative", display: "inline-block", marginBottom: "14px" }}>
                <div style={{
                  position: "absolute", inset: "-6px", borderRadius: "16px",
                  background: "radial-gradient(ellipse, rgba(88,221,221,0.18), transparent 70%)",
                  filter: "blur(10px)",
                }} />
                <img
                  src={bravoroIcon}
                  alt="Bravoro"
                  style={{
                    height: "44px", width: "44px", borderRadius: "12px",
                    boxShadow: "0 0 0 1px rgba(88,221,221,0.2), 0 8px 24px rgba(0,0,0,0.4)",
                    position: "relative",
                  }}
                />
              </div>
              <h2 style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 800, fontSize: "1.45rem", color: "#e4efef",
                margin: "0 0 5px", letterSpacing: "-0.025em",
              }}>
                Welcome Back
              </h2>
              <p style={{
                color: "rgba(110,114,114,0.9)",
                fontSize: "0.82rem",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                margin: 0,
              }}>
                Sign in to access your account
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSignIn} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{
                  color: "#c5d8d7", fontSize: "0.78rem", fontWeight: 600,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  display: "flex", alignItems: "center", gap: "5px",
                  letterSpacing: "0.02em", textTransform: "uppercase",
                }}>
                  <Mail size={11} style={{ color: "#58dddd" }} />
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="auth-input"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(88,221,221,0.18)",
                    borderRadius: "10px", padding: "11px 13px",
                    color: "#e4efef",
                    fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "0.88rem",
                    outline: "none", width: "100%", boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={{
                    color: "#c5d8d7", fontSize: "0.78rem", fontWeight: 600,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    display: "flex", alignItems: "center", gap: "5px",
                    letterSpacing: "0.02em", textTransform: "uppercase",
                  }}>
                    <Lock size={11} style={{ color: "#58dddd" }} />
                    Password
                  </label>
                  <ForgotPasswordDialog />
                </div>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="auth-input"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(88,221,221,0.18)",
                    borderRadius: "10px", padding: "11px 13px",
                    color: "#e4efef",
                    fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "0.88rem",
                    outline: "none", width: "100%", boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="auth-submit-btn"
                style={{
                  background: loading
                    ? "rgba(0,157,165,0.4)"
                    : "linear-gradient(135deg, #009da5 0%, #00686d 100%)",
                  color: "#fff", border: "none", borderRadius: "10px",
                  padding: "12px",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 700, fontSize: "0.9rem",
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                  marginTop: "4px",
                  boxShadow: loading ? "none" : "0 4px 20px rgba(0,157,165,0.35)",
                  letterSpacing: "0.01em",
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={15} style={{ animation: "auth-spin 1s linear infinite" }} />
                    Signing In...
                  </>
                ) : (
                  <>
                    <LogIn size={15} />
                    Sign In
                  </>
                )}
              </button>
            </form>

            <div style={{
              marginTop: "18px", paddingTop: "14px",
              borderTop: "1px solid rgba(88,221,221,0.1)",
              textAlign: "center",
            }}>
              <p style={{
                color: "rgba(110,114,114,0.85)", fontSize: "0.78rem",
                fontFamily: "'Plus Jakarta Sans', sans-serif", margin: 0,
              }}>
                Don't have an account?{" "}
                <a href="/contact" style={{ color: "#58dddd", fontWeight: 600, textDecoration: "none" }}>
                  Contact us
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* CSS beam animation — compositor thread only, no JS */
        @keyframes auth-beam-rise {
          from { transform: rotate(-35deg) translateY(110vh); }
          to   { transform: rotate(-35deg) translateY(-160vh); }
        }

        /* Rotating word animations */
        .auth-word-exit {
          animation: auth-word-up 0.36s cubic-bezier(0.4, 0, 1, 1) forwards;
        }
        .auth-word-enter {
          animation: auth-word-in 0.52s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes auth-word-up {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(-50px); }
        }
        @keyframes auth-word-in {
          from { opacity: 0; transform: translateY(50px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes auth-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        .auth-modal-overlay {
          animation: auth-fade-overlay 0.25s ease;
        }
        @keyframes auth-fade-overlay {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .auth-modal-card {
          animation: auth-slide-modal 0.35s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes auth-slide-modal {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .auth-btn-primary {
          transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
        }
        .auth-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 36px rgba(0,157,165,0.55) !important;
          filter: brightness(1.08);
        }
        .auth-btn-primary:active { transform: translateY(0); }

        .auth-btn-secondary {
          transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }
        .auth-btn-secondary:hover {
          transform: translateY(-2px);
          border-color: rgba(88,221,221,0.6) !important;
          background: rgba(88,221,221,0.1) !important;
        }
        .auth-btn-secondary:active { transform: translateY(0); }

        .auth-close-btn {
          transition: background 0.2s ease, color 0.2s ease;
        }
        .auth-close-btn:hover {
          background: rgba(88,221,221,0.16) !important;
          color: #58dddd !important;
        }

        .auth-input {
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .auth-input:focus {
          border-color: rgba(88,221,221,0.5) !important;
          box-shadow: 0 0 0 3px rgba(88,221,221,0.09) !important;
        }

        .auth-submit-btn {
          transition: filter 0.2s ease, transform 0.15s ease;
        }
        .auth-submit-btn:hover:not(:disabled) {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }
        .auth-submit-btn:active:not(:disabled) { transform: translateY(0); }
      `}</style>
    </div>
  );
};

export default Auth;
