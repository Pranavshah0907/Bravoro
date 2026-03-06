import { useNavigate } from "react-router-dom";
import bravoroLogo from "@/assets/bravoro-logo.svg";
import { LogIn, ChevronRight } from "lucide-react";

const MARQUEE_ITEMS = [
  "Hiring Signals",
  "·",
  "Decision Makers",
  "·",
  "Lead Enrichment",
  "·",
  "Apollo · Lusha",
  "·",
  "Enterprise Sales",
  "·",
  "AI Staffing",
  "·",
  "B2B Intelligence",
  "·",
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

  return (
    <div
      style={{
        background: "#09161f",
        color: "#e4efef",
        width: "100%",
        minHeight: "100vh",
        overflowX: "hidden",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        position: "relative",
      }}
    >
      {/* ── Navbar ── */}
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 40px",
          position: "relative",
          zIndex: 20,
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ color: "#58dddd", fontSize: "22px", marginRight: "2px" }}>•</span>
          <img
            src={bravoroLogo}
            alt="Bravoro"
            style={{ height: "22px", width: "auto", filter: "brightness(1.05)" }}
          />
          <span style={{ color: "#58dddd", fontSize: "22px", marginLeft: "2px" }}>•</span>
        </div>

        {/* Nav pills */}
        <ul
          className="landing-nav-pills"
          style={{
            display: "flex",
            gap: "4px",
            listStyle: "none",
            margin: 0,
            padding: "4px 10px",
            background: "rgba(0,157,165,0.08)",
            border: "1px solid rgba(88,221,221,0.12)",
            borderRadius: "999px",
          }}
        >
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                className="landing-nav-link"
                style={{
                  display: "block",
                  padding: "6px 14px",
                  borderRadius: "999px",
                  fontSize: "13px",
                  fontWeight: 400,
                  color: "rgba(197,216,215,0.75)",
                  textDecoration: "none",
                  letterSpacing: "0.01em",
                }}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <button
          onClick={() => navigate("/auth")}
          className="landing-cta-nav"
          style={{
            background: "#009da5",
            color: "#fff",
            border: "none",
            borderRadius: "10px",
            padding: "9px 20px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 4px 20px rgba(0,157,165,0.35)",
            letterSpacing: "0.01em",
          }}
        >
          <LogIn size={13} />
          Login to Platform
        </button>
      </nav>

      {/* ── Hero content ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "clamp(48px, 8vh, 96px) 24px clamp(60px, 10vh, 120px)",
          position: "relative",
          zIndex: 10,
        }}
      >
        {/* Badge pill */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: "rgba(0,157,165,0.10)",
            border: "1px solid rgba(88,221,221,0.30)",
            borderRadius: "999px",
            padding: "4px 16px 4px 4px",
            marginBottom: "clamp(28px, 5vh, 44px)",
          }}
        >
          <span
            style={{
              background: "#009da5",
              color: "#fff",
              padding: "3px 10px",
              borderRadius: "999px",
              fontSize: "11px",
              fontWeight: 700,
              marginRight: "10px",
              letterSpacing: "0.05em",
            }}
          >
            2025
          </span>
          <span
            style={{
              color: "#58dddd",
              fontSize: "12px",
              fontWeight: 500,
              letterSpacing: "0.06em",
            }}
          >
            AI Staffing Intelligence
          </span>
        </div>

        {/* Hero headline */}
        <h1
          style={{
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: "-0.035em",
            margin: "0 0 clamp(8px, 1.5vh, 16px)",
            fontSize: "clamp(2.6rem, 6vw, 5rem)",
            color: "#e4efef",
          }}
        >
          Find the Right Decision Makers.
        </h1>
        <h1
          style={{
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: "-0.035em",
            margin: "0 0 clamp(20px, 3.5vh, 32px)",
            fontSize: "clamp(2.6rem, 6vw, 5rem)",
            background: "linear-gradient(135deg, #58dddd 0%, #009da5 55%, #00686d 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          At Scale.
        </h1>

        {/* Subtext */}
        <p
          style={{
            fontSize: "clamp(0.85rem, 1.2vw, 1rem)",
            color: "rgba(197,216,215,0.55)",
            fontWeight: 400,
            maxWidth: "480px",
            margin: "0 0 8px",
            lineHeight: 1.65,
          }}
        >
          AI-powered lead enrichment powered by real-time hiring signals.
        </p>
        <p
          style={{
            fontSize: "clamp(0.85rem, 1.2vw, 1rem)",
            color: "rgba(197,216,215,0.55)",
            fontWeight: 400,
            maxWidth: "480px",
            margin: "0 0 clamp(28px, 5vh, 44px)",
            lineHeight: 1.65,
          }}
        >
          Reach enterprise decision-makers before your competition does.
        </p>

        {/* CTA row */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={() => navigate("/auth")}
            className="landing-btn-primary"
            style={{
              background: "linear-gradient(135deg, #009da5 0%, #00686d 100%)",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              padding: "clamp(10px, 1.5vh, 13px) clamp(22px, 3vw, 30px)",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "7px",
              boxShadow: "0 4px 24px rgba(0,157,165,0.40), 0 1px 0 rgba(255,255,255,0.1) inset",
              letterSpacing: "0.01em",
            }}
          >
            Get Started
            <ChevronRight size={15} />
          </button>

          <button
            onClick={() => navigate("/contact")}
            className="landing-btn-secondary"
            style={{
              background: "rgba(88,221,221,0.06)",
              color: "#58dddd",
              border: "1px solid rgba(88,221,221,0.28)",
              borderRadius: "10px",
              padding: "clamp(10px, 1.5vh, 13px) clamp(22px, 3vw, 30px)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.01em",
              backdropFilter: "blur(8px)",
            }}
          >
            See How It Works
          </button>
        </div>

        {/* Marquee strip */}
        <div
          style={{
            width: "100%",
            maxWidth: "640px",
            margin: "clamp(40px, 7vh, 72px) auto 0",
            overflow: "hidden",
            position: "relative",
            height: "36px",
          }}
        >
          {/* Left fade */}
          <div
            style={{
              pointerEvents: "none",
              position: "absolute",
              inset: "0",
              left: 0,
              width: "80px",
              background: "linear-gradient(to right, #09161f, transparent)",
              zIndex: 2,
            }}
          />
          {/* Right fade */}
          <div
            style={{
              pointerEvents: "none",
              position: "absolute",
              inset: "0",
              right: 0,
              left: "auto",
              width: "80px",
              background: "linear-gradient(to left, #09161f, transparent)",
              zIndex: 2,
            }}
          />
          {/* Scrolling content — duplicated for seamless loop */}
          <div
            className="animate-marquee"
            style={{
              display: "flex",
              whiteSpace: "nowrap",
              alignItems: "center",
              height: "100%",
            }}
          >
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
              <span
                key={i}
                style={{
                  padding: "0 18px",
                  color: item === "·" ? "rgba(88,221,221,0.35)" : "rgba(197,216,215,0.38)",
                  fontSize: item === "·" ? "20px" : "13px",
                  fontWeight: item === "·" ? 700 : 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom glow — static, GPU-free ── */}
      {/* Outer wide glow */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "500px",
          background:
            "radial-gradient(ellipse 90% 70% at 50% 100%, rgba(0,157,165,0.38) 0%, rgba(88,221,221,0.15) 40%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      {/* Inner concentrated glow */}
      <div
        style={{
          position: "absolute",
          bottom: "-40px",
          left: "20%",
          right: "20%",
          height: "300px",
          background:
            "radial-gradient(ellipse 100% 80% at 50% 100%, rgba(0,157,165,0.50) 0%, rgba(88,221,221,0.20) 50%, transparent 100%)",
          filter: "blur(50px)",
          pointerEvents: "none",
          zIndex: 1,
          borderRadius: "50%",
        }}
      />

      {/* ── Hover & interaction styles ── */}
      <style>{`
        .landing-nav-link:hover {
          background: rgba(0,157,165,0.18);
          color: #58dddd !important;
        }
        .landing-cta-nav {
          transition: filter 0.2s ease, transform 0.15s ease;
        }
        .landing-cta-nav:hover {
          filter: brightness(1.12);
          transform: translateY(-1px);
        }
        .landing-cta-nav:active { transform: translateY(0); }

        .landing-btn-primary {
          transition: filter 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
        }
        .landing-btn-primary:hover {
          filter: brightness(1.1);
          transform: translateY(-2px);
          box-shadow: 0 8px 36px rgba(0,157,165,0.55) !important;
        }
        .landing-btn-primary:active { transform: translateY(0); }

        .landing-btn-secondary {
          transition: border-color 0.2s ease, background 0.2s ease, transform 0.15s ease;
        }
        .landing-btn-secondary:hover {
          border-color: rgba(88,221,221,0.55) !important;
          background: rgba(88,221,221,0.12) !important;
          transform: translateY(-2px);
        }
        .landing-btn-secondary:active { transform: translateY(0); }

        /* Responsive: hide nav pills on small screens */
        @media (max-width: 640px) {
          .landing-nav-pills { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default LandingV2;
