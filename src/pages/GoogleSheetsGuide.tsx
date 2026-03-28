import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, BookOpen, ChevronRight, MousePointer2,
  ToggleRight, Search, Layers, Upload, Lightbulb,
  AlertTriangle, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Auth guard ───────────────────────────────────────────────────────────────
function useAuthGuard() {
  const nav = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) nav("/", { replace: true });
    });
  }, [nav]);
}

// ─── IntersectionObserver hook ────────────────────────────────────────────────
function useInView(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

// ─── Atoms ────────────────────────────────────────────────────────────────────
const ColBadge = ({ col, active }: { col: string; active?: boolean }) => (
  <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[11px] font-bold border transition-colors
    ${active ? "bg-[#009da5]/30 border-[#009da5] text-[#58dddd]" : "bg-[#0e2a2a] border-[#1e4040] text-[#58dddd]"}`}>
    {col}
  </span>
);

const StepBadge = ({ n }: { n: number }) => (
  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#009da5]/15 border border-[#009da5]/40 flex items-center justify-center text-[13px] font-bold text-[#58dddd]">
    {n}
  </div>
);

const Tip = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-3 p-3 rounded-lg border border-[#009da5]/25 bg-[#009da5]/5 text-[13px] text-[#3d9090]">
    <Lightbulb className="w-4 h-4 text-[#58dddd] shrink-0 mt-0.5" />
    <span>{children}</span>
  </div>
);

const Warn = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-3 p-3 rounded-lg border border-amber-500/25 bg-amber-500/5 text-[13px] text-amber-400/80">
    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
    <span>{children}</span>
  </div>
);

const SectionHeading = ({ id, icon: Icon, label }: { id: string; icon: React.ElementType; label: string }) => (
  <div id={id} className="flex items-center gap-3 mb-6 scroll-mt-24">
    <div className="p-2 rounded-lg bg-[#009da5]/10 border border-[#009da5]/20">
      <Icon className="w-4 h-4 text-[#58dddd]" />
    </div>
    <h2 className="text-[18px] font-semibold text-white">{label}</h2>
  </div>
);

// ─── Screenshot card — centered, not full-width ───────────────────────────────
function ScreenshotCard({ src, alt, maxWidth, className }: {
  src: string; alt: string; maxWidth?: string; className?: string;
}) {
  return (
    <div className={`mx-auto rounded-xl overflow-hidden border border-[#1e4040] shadow-xl shadow-black/40 ${className ?? ""}`}
      style={{ maxWidth: maxWidth ?? "100%" }}>
      <img src={src} alt={alt} className="w-full h-auto block" />
    </div>
  );
}

// ─── Cursor SVG ───────────────────────────────────────────────────────────────
const Cursor = ({ x, y, clicking }: { x: number; y: number; clicking?: boolean }) => (
  <div
    className="pointer-events-none absolute z-50"
    style={{
      left: x,
      top: y,
      transform: `scale(${clicking ? 0.82 : 1})`,
      transition: "left 550ms cubic-bezier(0.4,0,0.2,1), top 550ms cubic-bezier(0.4,0,0.2,1), transform 100ms",
    }}
  >
    <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
      <path d="M0 0L0 16L4 12L7 18L9 17L6 11L11 11Z" fill="white" stroke="#333" strokeWidth="1" />
    </svg>
  </div>
);

// ─── Layout constants ─────────────────────────────────────────────────────────
const DEMO_PAD    = 16;   // p-4
const STATUS_H    = 26;   // label row height (14px) + margin-bottom (12px)
const HEADER_H    = 54;   // header row — taller to fit col label + picker button
const ROW_H       = 28;   // data row height
const ROW_NUM_W   = 30;   // row number column
const GAP         = 12;   // gap-3 between sheet and sidebar
const SIDEBAR_W   = 188;  // sidebar width
const SIDEBAR_TH  = 24;   // sidebar title header height

// Sidebar picker demo (Person Titles / Seniorities)
const SHEET_COL_W  = 168;                              // target column width
const SHEET_W      = ROW_NUM_W + SHEET_COL_W;          // 198px total sheet width
const SB_X         = DEMO_PAD + SHEET_W + GAP;         // 226 — sidebar left edge

// Cursor anchors (relative to outer demo div)
const BTN_X        = DEMO_PAD + ROW_NUM_W + SHEET_COL_W / 2;          // 130 — center of header col
const BTN_Y        = DEMO_PAD + STATUS_H + Math.round(HEADER_H * 0.73); // ~79 — picker button center
const CELL_X       = BTN_X;                                             // same x
const CELL_Y       = DEMO_PAD + STATUS_H + HEADER_H + Math.round(ROW_H / 2); // ~110 — row 3 center
// Confirm = first button in flex-row with Clear All inside p-2 sidebar content
const CONFIRM_X    = SB_X + 8 + Math.round((SIDEBAR_W - 16 - 4) / 4); // ~267
const CONFIRM_Y    = DEMO_PAD + STATUS_H + SIDEBAR_TH + 8 + 12 + 6 + 20 + 6 + 12; // ~128

// ─── SidebarAnimationDemo ─────────────────────────────────────────────────────
// Full sequence: idle → click picker button → sidebar opens → click cell → filter → check → confirm → result
type SidebarPhase =
  | "idle" | "move-btn" | "click-btn" | "sidebar-in"
  | "move-cell" | "click-cell" | "filter" | "check1" | "check2"
  | "move-confirm" | "confirm" | "value" | "pause" | "reset";

const SIDEBAR_SEQ: [SidebarPhase, number][] = [
  ["idle",         800],
  ["move-btn",     600],
  ["click-btn",    350],
  ["sidebar-in",   750],
  ["move-cell",    650],
  ["click-cell",   350],
  ["filter",      1000],
  ["check1",       600],
  ["check2",       600],
  ["move-confirm", 550],
  ["confirm",      400],
  ["value",       1800],
  ["pause",        800],
  ["reset",        300],
];

function SidebarAnimationDemo({ title, colLetter, options, result }: {
  title: string; colLetter: string; options: [string, string]; result: string;
}) {
  const { ref, inView } = useInView();
  const [phase, setPhase] = useState<SidebarPhase>("idle");
  const [filterText, setFilterText] = useState("");
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!inView) return;
    cancelRef.current = false;

    async function run() {
      while (!cancelRef.current) {
        for (const [p, ms] of SIDEBAR_SEQ) {
          if (cancelRef.current) return;
          setPhase(p);
          if (p === "filter") {
            const word = options[0].slice(0, 3).toLowerCase();
            for (let i = 0; i <= word.length; i++) {
              if (cancelRef.current) return;
              setFilterText(word.slice(0, i));
              await new Promise(r => setTimeout(r, ms / (word.length + 1)));
            }
          } else {
            if (p === "idle" || p === "reset") setFilterText("");
            await new Promise(r => setTimeout(r, ms));
          }
        }
      }
    }
    run();
    return () => { cancelRef.current = true; };
  }, [inView, options]);

  // Derived state
  const sidebarVisible  = !["idle", "move-btn", "reset"].includes(phase);
  const btnClicking     = phase === "click-btn";
  const cellActive      = ["click-cell","filter","check1","check2","move-confirm","confirm","value","pause"].includes(phase);
  const cellSelected    = cellActive; // blue ring on cell
  const check1Active    = ["check1","check2","move-confirm","confirm","value","pause"].includes(phase);
  const check2Active    = ["check2","move-confirm","confirm","value","pause"].includes(phase);
  const confirmActive   = phase === "confirm";
  const valueVisible    = ["value","pause"].includes(phase);

  const cursorPos = (() => {
    if (["idle","reset"].includes(phase))                                  return { x: 42, y: 55 };
    if (["move-btn","click-btn","sidebar-in"].includes(phase))             return { x: BTN_X, y: BTN_Y };
    if (["move-cell","click-cell","filter","check1","check2"].includes(phase)) return { x: CELL_X, y: CELL_Y };
    return { x: CONFIRM_X, y: CONFIRM_Y }; // move-confirm, confirm, value, pause
  })();

  // Options visible in the list (use visibility:hidden to keep height stable)
  const opt0Visible = !filterText || options[0].toLowerCase().includes(filterText);
  const opt1Visible = !filterText || options[1].toLowerCase().includes(filterText);

  return (
    <div className="mx-auto" style={{ maxWidth: 460 }}>
      <div
        ref={ref}
        className="relative rounded-xl border border-[#1e4040] bg-[#060f0f] overflow-hidden"
        style={{ padding: DEMO_PAD, minHeight: 240 }}
      >
        {/* Status label */}
        <div className="font-medium" style={{ height: 14, marginBottom: 12, fontSize: 11, color: "#3d7070" }}>
          Live demo — {title} picker
          <span className="ml-2 inline-flex items-center gap-1" style={{ color: "#58dddd" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#58dddd] animate-pulse" />
            playing
          </span>
        </div>

        {/* Sheet + Sidebar */}
        <div className="flex items-start" style={{ gap: GAP }}>

          {/* ── Mini sheet ── */}
          <div className="shrink-0" style={{ width: SHEET_W }}>
            {/* Header — tall enough for col name + picker button */}
            <div
              className="flex border border-[#d0d0d0] rounded-t overflow-hidden"
              style={{ height: HEADER_H }}
            >
              <div style={{ width: ROW_NUM_W, flexShrink: 0 }} className="bg-[#f8f9fa] border-r border-[#d0d0d0]" />
              <div
                style={{ width: SHEET_COL_W, flexShrink: 0 }}
                className="bg-[#c8e6e4] flex flex-col items-center justify-center text-center"
              >
                <span style={{ fontSize: 9, fontWeight: 600, color: "#444", lineHeight: 1 }}>{colLetter}</span>
                <span style={{ fontSize: 8, color: "#666", marginTop: 2, marginBottom: 5 }}>{title}</span>
                {/* Picker button — what the user clicks to open the sidebar */}
                <div
                  style={{
                    fontSize: 8,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 3,
                    background: btnClicking ? "rgba(0,157,165,0.35)" : "rgba(0,157,165,0.18)",
                    border: "1px solid rgba(0,157,165,0.5)",
                    color: "#0d5a5a",
                    transform: btnClicking ? "scale(0.92)" : "scale(1)",
                    transition: "transform 100ms, background 100ms",
                    cursor: "pointer",
                    letterSpacing: "0.01em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {title} Picker
                </div>
              </div>
            </div>

            {/* Data rows */}
            {[3, 4, 5].map(row => (
              <div
                key={row}
                className={`flex border-x border-b border-[#d0d0d0] overflow-hidden ${row === 5 ? "rounded-b" : ""}`}
                style={{ height: ROW_H }}
              >
                <div
                  style={{ width: ROW_NUM_W, flexShrink: 0 }}
                  className="bg-[#f8f9fa] border-r border-[#d0d0d0] flex items-center justify-center text-[#999] font-mono"
                >
                  <span style={{ fontSize: 9 }}>{row}</span>
                </div>
                <div
                  style={{ width: SHEET_COL_W, flexShrink: 0 }}
                  className={`flex items-center justify-center transition-all duration-400
                    ${row === 3 && cellSelected ? "bg-[#e8f0fe]" : "bg-white"}`}
                  style={{
                    outline: row === 3 && cellSelected ? "2px solid #1a73e8" : "none",
                    outlineOffset: -2,
                  }}
                >
                  {row === 3 && valueVisible && (
                    <span style={{ fontSize: 9, color: "#1a3535", fontWeight: 500, padding: "0 4px" }}>{result}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── Sidebar panel ── */}
          <div
            className="shrink-0 rounded-lg border border-[#d0d0d0] bg-white shadow-xl overflow-hidden"
            style={{
              width: SIDEBAR_W,
              opacity: sidebarVisible ? 1 : 0,
              transform: sidebarVisible ? "translateX(0)" : "translateX(18px)",
              transition: "opacity 480ms, transform 480ms",
              pointerEvents: "none",
            }}
          >
            {/* Sidebar title header */}
            <div
              style={{ height: SIDEBAR_TH, fontSize: 10, fontWeight: 600, color: "#333" }}
              className="bg-[#f8f9fa] border-b border-[#d0d0d0] px-3 flex items-center"
            >
              {title}
            </div>

            {/* Content area — fixed structure so height never changes */}
            <div style={{ position: "relative" }}>
              {/* Full editor — always rendered, opacity transitions */}
              <div
                className="p-2"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  opacity: cellActive ? 1 : 0,
                  transition: "opacity 300ms",
                }}
              >
                <div style={{ fontSize: 9, color: "#999", fontStyle: "italic" }}>Row 3 — {title}</div>
                {/* Custom input */}
                <div style={{ display: "flex", gap: 4 }}>
                  <div className="flex-1 rounded border border-[#ddd] bg-[#fafafa] flex items-center px-1.5"
                    style={{ height: 20, fontSize: 9, color: "#bbb" }}>Custom…</div>
                  <div className="rounded border border-[#009da5]/40 bg-[#e0f7f4] flex items-center px-1.5"
                    style={{ height: 20, fontSize: 9, color: "#009da5" }}>Add</div>
                </div>
                {/* Confirm / Clear */}
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    className="flex-1 rounded font-bold text-white"
                    style={{
                      height: 24, fontSize: 9,
                      background: confirmActive ? "#166a49" : "#1a7f5a",
                      transform: confirmActive ? "scale(0.95)" : "scale(1)",
                      transition: "transform 100ms, background 100ms",
                    }}
                  >Confirm</button>
                  <button className="flex-1 rounded border border-[#ddd]"
                    style={{ height: 24, fontSize: 9, color: "#666" }}>Clear All</button>
                </div>
                <div style={{ borderTop: "1px solid #eee" }} />
                {/* Filter */}
                <div className="rounded border border-[#ddd] bg-[#fafafa] flex items-center px-1.5"
                  style={{ height: 20, fontSize: 9, color: filterText ? "#333" : "#bbb" }}>
                  {filterText
                    ? <span>{filterText}<span className="animate-pulse">|</span></span>
                    : <span>Filter…</span>}
                </div>
                {/* Options — visibility:hidden keeps height stable while filtering */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label className="flex items-center gap-1.5" style={{ fontSize: 9, color: "#333", visibility: opt0Visible ? "visible" : "hidden" }}>
                    <div style={{
                      width: 12, height: 12, borderRadius: 2,
                      background: check1Active ? "#009da5" : "white",
                      border: check1Active ? "1px solid #009da5" : "1px solid #ccc",
                      transition: "all 300ms", flexShrink: 0,
                    }} />
                    {options[0]}
                  </label>
                  <label className="flex items-center gap-1.5" style={{ fontSize: 9, color: "#333", visibility: opt1Visible ? "visible" : "hidden" }}>
                    <div style={{
                      width: 12, height: 12, borderRadius: 2,
                      background: check2Active ? "#009da5" : "white",
                      border: check2Active ? "1px solid #009da5" : "1px solid #ccc",
                      transition: "all 300ms", flexShrink: 0,
                    }} />
                    {options[1]}
                  </label>
                  <div style={{ fontSize: 9, color: "#bbb", visibility: filterText ? "hidden" : "visible" }}>…more</div>
                </div>
              </div>

              {/* "No cell" overlay — shown before user clicks a cell */}
              <div
                style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 12,
                  opacity: cellActive ? 0 : 1,
                  transition: "opacity 300ms",
                  pointerEvents: "none",
                }}
              >
                <span style={{ fontSize: 9, color: "#aaa", textAlign: "center", lineHeight: 1.5 }}>
                  Click any cell in col {colLetter} to begin
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Cursor — absolute in outer demo div */}
        <Cursor x={cursorPos.x} y={cursorPos.y} clicking={btnClicking || phase === "click-cell" || phase === "confirm"} />
      </div>
    </div>
  );
}

// ─── JobSeniorityDemo ─────────────────────────────────────────────────────────
const JOB_SEN_OPTIONS = ["Internship", "Entry level", "Associate", "Mid-Senior level", "Director", "Executive"];

// Layout for job seniority demo
const JS_H_W     = 78;
const JS_J_W     = 148;
const JS_SHEET   = ROW_NUM_W + JS_H_W + JS_J_W;          // 256px
const JS_SB_X    = DEMO_PAD + JS_SHEET + GAP;             // 284

const JS_BTN_X   = DEMO_PAD + ROW_NUM_W + JS_H_W + JS_J_W / 2;       // 178
const JS_BTN_Y   = BTN_Y;                                              // same vertical
const JS_CELL_X  = JS_BTN_X;
const JS_CELL_Y  = CELL_Y;                                             // same vertical
const JS_CONFIRM_X = JS_SB_X + 8 + Math.round((SIDEBAR_W - 16 - 4) / 4); // ~331
// No custom input — confirm is higher up
const JS_CONFIRM_Y = DEMO_PAD + STATUS_H + SIDEBAR_TH + 8 + 12 + 6 + 12;  // ~106

type JSPhase =
  | "idle" | "move-btn" | "click-btn" | "sidebar-in"
  | "move-cell" | "click-cell" | "check1" | "check2"
  | "move-confirm" | "confirm" | "value" | "pause" | "reset";

const JS_SEQ: [JSPhase, number][] = [
  ["idle",         800],
  ["move-btn",     600],
  ["click-btn",    350],
  ["sidebar-in",   750],
  ["move-cell",    650],
  ["click-cell",   350],
  ["check1",       900],
  ["check2",       700],
  ["move-confirm", 550],
  ["confirm",      400],
  ["value",       1800],
  ["pause",        800],
  ["reset",        300],
];

function JobSeniorityDemo() {
  const { ref, inView } = useInView();
  const [phase, setPhase] = useState<JSPhase>("idle");
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!inView) return;
    cancelRef.current = false;
    async function run() {
      while (!cancelRef.current) {
        for (const [p, ms] of JS_SEQ) {
          if (cancelRef.current) return;
          setPhase(p);
          await new Promise(r => setTimeout(r, ms));
        }
      }
    }
    run();
    return () => { cancelRef.current = true; };
  }, [inView]);

  const sidebarVisible = !["idle","move-btn","reset"].includes(phase);
  const btnClicking    = phase === "click-btn";
  const cellActive     = ["click-cell","check1","check2","move-confirm","confirm","value","pause"].includes(phase);
  const cellSelected   = cellActive;
  const check1Active   = ["check1","check2","move-confirm","confirm","value","pause"].includes(phase);  // Director (idx 4)
  const check2Active   = ["check2","move-confirm","confirm","value","pause"].includes(phase);           // Associate (idx 2)
  const confirmActive  = phase === "confirm";
  const valueVisible   = ["value","pause"].includes(phase);

  const cursorPos = (() => {
    if (["idle","reset"].includes(phase))                                 return { x: 42, y: 55 };
    if (["move-btn","click-btn","sidebar-in"].includes(phase))            return { x: JS_BTN_X, y: JS_BTN_Y };
    if (["move-cell","click-cell","check1","check2"].includes(phase))     return { x: JS_CELL_X, y: JS_CELL_Y };
    return { x: JS_CONFIRM_X, y: JS_CONFIRM_Y };
  })();

  return (
    <div className="mx-auto" style={{ maxWidth: 500 }}>
      <div
        ref={ref}
        className="relative rounded-xl border border-[#1e4040] bg-[#060f0f] overflow-hidden"
        style={{ padding: DEMO_PAD, minHeight: 260 }}
      >
        <div className="font-medium" style={{ height: 14, marginBottom: 12, fontSize: 11, color: "#3d7070" }}>
          Live demo — Job Seniority picker
          <span className="ml-2 inline-flex items-center gap-1" style={{ color: "#58dddd" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#58dddd] animate-pulse" />
            playing
          </span>
        </div>

        <div className="flex items-start" style={{ gap: GAP }}>

          {/* ── Mini sheet: H (static Yes) + J (target with picker button) ── */}
          <div className="shrink-0" style={{ width: JS_SHEET }}>
            {/* Header */}
            <div className="flex border border-[#d0d0d0] rounded-t overflow-hidden" style={{ height: HEADER_H }}>
              <div style={{ width: ROW_NUM_W, flexShrink: 0 }} className="bg-[#f8f9fa] border-r border-[#d0d0d0]" />
              {/* H column — static, no button */}
              <div
                style={{ width: JS_H_W, flexShrink: 0 }}
                className="bg-[#c8e6e4] border-r border-[#d0d0d0] flex flex-col items-center justify-center text-center"
              >
                <span style={{ fontSize: 9, fontWeight: 600, color: "#444" }}>H</span>
                <span style={{ fontSize: 8, color: "#666", marginTop: 2 }}>Toggle</span>
              </div>
              {/* J column — with picker button */}
              <div
                style={{ width: JS_J_W, flexShrink: 0 }}
                className="bg-[#c8e6e4] flex flex-col items-center justify-center text-center"
              >
                <span style={{ fontSize: 9, fontWeight: 600, color: "#444", lineHeight: 1 }}>J</span>
                <span style={{ fontSize: 8, color: "#666", marginTop: 2, marginBottom: 5 }}>Job Seniority</span>
                <div
                  style={{
                    fontSize: 8, fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 3,
                    background: btnClicking ? "rgba(0,157,165,0.35)" : "rgba(0,157,165,0.18)",
                    border: "1px solid rgba(0,157,165,0.5)",
                    color: "#0d5a5a",
                    transform: btnClicking ? "scale(0.92)" : "scale(1)",
                    transition: "transform 100ms, background 100ms",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Seniority Picker
                </div>
              </div>
            </div>

            {/* Data rows */}
            {[3, 4, 5].map(row => (
              <div
                key={row}
                className={`flex border-x border-b border-[#d0d0d0] overflow-hidden ${row === 5 ? "rounded-b" : ""}`}
                style={{ height: ROW_H }}
              >
                <div style={{ width: ROW_NUM_W, flexShrink: 0 }}
                  className="bg-[#f8f9fa] border-r border-[#d0d0d0] flex items-center justify-center">
                  <span style={{ fontSize: 9, color: "#999" }}>{row}</span>
                </div>
                {/* H — Yes in row 3, grey (no toggle) in rows 4,5 */}
                <div
                  style={{ width: JS_H_W, flexShrink: 0 }}
                  className={`border-r border-[#d0d0d0] flex items-center justify-center ${row === 3 ? "bg-white" : "bg-[#f0f0f0]"}`}
                >
                  {row === 3 && <span style={{ fontSize: 9, fontWeight: 600, color: "#14532d" }}>Yes</span>}
                </div>
                {/* J — active for row 3 (toggle=Yes), grey for 4,5 */}
                <div
                  style={{
                    width: JS_J_W, flexShrink: 0,
                    background: row === 3 ? (cellSelected ? "#e8f0fe" : "white") : "#f0f0f0",
                    outline: row === 3 && cellSelected ? "2px solid #1a73e8" : "none",
                    outlineOffset: -2,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 400ms",
                  }}
                >
                  {row === 3 && valueVisible && (
                    <span style={{ fontSize: 9, color: "#1a3535", fontWeight: 500, padding: "0 4px" }}>Director, Associate</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── Sidebar: 6 fixed options, no custom input ── */}
          <div
            className="shrink-0 rounded-lg border border-[#d0d0d0] bg-white shadow-xl overflow-hidden"
            style={{
              width: SIDEBAR_W,
              opacity: sidebarVisible ? 1 : 0,
              transform: sidebarVisible ? "translateX(0)" : "translateX(18px)",
              transition: "opacity 480ms, transform 480ms",
              pointerEvents: "none",
            }}
          >
            <div style={{ height: SIDEBAR_TH, fontSize: 10, fontWeight: 600, color: "#333" }}
              className="bg-[#f8f9fa] border-b border-[#d0d0d0] px-3 flex items-center">
              Job Seniority
            </div>

            {/* Content — same fixed-height trick */}
            <div style={{ position: "relative" }}>
              {/* Full editor */}
              <div
                className="p-2"
                style={{ display: "flex", flexDirection: "column", gap: 6, opacity: cellActive ? 1 : 0, transition: "opacity 300ms" }}
              >
                <div style={{ fontSize: 9, color: "#999", fontStyle: "italic" }}>Row 3 — Job Seniority</div>
                {/* Confirm / Clear */}
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    className="flex-1 rounded font-bold text-white"
                    style={{
                      height: 24, fontSize: 9,
                      background: confirmActive ? "#166a49" : "#1a7f5a",
                      transform: confirmActive ? "scale(0.95)" : "scale(1)",
                      transition: "transform 100ms, background 100ms",
                    }}
                  >Confirm</button>
                  <button className="flex-1 rounded border border-[#ddd]"
                    style={{ height: 24, fontSize: 9, color: "#666" }}>Clear</button>
                </div>
                <div style={{ borderTop: "1px solid #eee" }} />
                {/* 6 fixed options */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {JOB_SEN_OPTIONS.map((opt, i) => {
                    const checked = (i === 4 && check1Active) || (i === 2 && check2Active);
                    return (
                      <label key={opt} className="flex items-center gap-1.5" style={{ fontSize: 9, color: "#333" }}>
                        <div style={{
                          width: 12, height: 12, borderRadius: 2, flexShrink: 0,
                          background: checked ? "#009da5" : "white",
                          border: checked ? "1px solid #009da5" : "1px solid #ccc",
                          transition: "all 300ms",
                        }} />
                        {opt}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* "No cell" overlay */}
              <div
                style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 12,
                  opacity: cellActive ? 0 : 1,
                  transition: "opacity 300ms",
                  pointerEvents: "none",
                }}
              >
                <span style={{ fontSize: 9, color: "#aaa", textAlign: "center", lineHeight: 1.5 }}>
                  Click any cell in col J to begin
                </span>
              </div>
            </div>
          </div>
        </div>

        <Cursor x={cursorPos.x} y={cursorPos.y} clicking={btnClicking || phase === "click-cell" || phase === "confirm"} />
      </div>
    </div>
  );
}

// ─── ToggleDemo ───────────────────────────────────────────────────────────────
type TogglePhase = "start"|"move-h"|"dropdown"|"select-yes"|"unlocked"|"pause1"|"move-h2"|"dropdown2"|"select-no"|"locked"|"pause2"|"reset";

const TOGGLE_SEQ: [TogglePhase, number][] = [
  ["start",      600],
  ["move-h",     600],
  ["dropdown",   500],
  ["select-yes", 600],
  ["unlocked",  1400],
  ["pause1",     500],
  ["move-h2",    200],
  ["dropdown2",  500],
  ["select-no",  600],
  ["locked",    1400],
  ["pause2",     400],
  ["reset",      200],
];

// Toggle demo layout — all fixed widths
const TD_H_W  = 88;
const TD_I_W  = 88;
const TD_J_W  = 88;
const TD_K_W  = 56;
const TD_TOTAL = ROW_NUM_W + TD_H_W + TD_I_W + TD_J_W + TD_K_W; // 350px

// H cell center
const TG_H_X  = DEMO_PAD + ROW_NUM_W + Math.round(TD_H_W / 2); // 60
const TG_H_Y  = DEMO_PAD + STATUS_H + HEADER_H + Math.round(ROW_H / 2); // 110

function ToggleDemo() {
  const { ref, inView } = useInView();
  const [phase, setPhase] = useState<TogglePhase>("start");
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!inView) return;
    cancelRef.current = false;
    async function run() {
      while (!cancelRef.current) {
        for (const [p, ms] of TOGGLE_SEQ) {
          if (cancelRef.current) return;
          setPhase(p);
          await new Promise(r => setTimeout(r, ms));
        }
      }
    }
    run();
    return () => { cancelRef.current = true; };
  }, [inView]);

  const showDd1      = ["dropdown","select-yes"].includes(phase);
  const showDd2      = ["dropdown2","select-no"].includes(phase);
  const unlocked     = ["select-yes","unlocked","pause1","move-h2","dropdown2"].includes(phase);
  const hYes         = ["unlocked","pause1","move-h2","dropdown2"].includes(phase);
  const hNo          = ["locked","pause2","reset","start"].includes(phase);
  const highlightYes = phase === "select-yes";
  const highlightNo  = phase === "select-no";

  const cursorPos = (() => {
    if (["start","reset","locked","pause2"].includes(phase))    return { x: 38, y: 55 };
    return { x: TG_H_X, y: TG_H_Y };
  })();

  const ddTop  = DEMO_PAD + STATUS_H + HEADER_H + ROW_H;  // below row 3
  const ddLeft = DEMO_PAD + ROW_NUM_W;

  return (
    <div className="mx-auto" style={{ maxWidth: 420 }}>
      <div
        ref={ref}
        className="relative rounded-xl border border-[#1e4040] bg-[#060f0f] overflow-hidden"
        style={{ padding: DEMO_PAD, minHeight: 220 }}
      >
        <div className="font-medium" style={{ height: 14, marginBottom: 12, fontSize: 11, color: "#3d7070" }}>
          Live demo — Job search toggle
          <span className="ml-2 inline-flex items-center gap-1" style={{ color: "#58dddd" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#58dddd] animate-pulse" />
            playing
          </span>
        </div>

        {/* Sheet — fixed widths */}
        <div style={{ width: TD_TOTAL }}>
          {/* Header */}
          <div className="flex border border-[#d0d0d0] rounded-t overflow-hidden" style={{ height: HEADER_H }}>
            <div style={{ width: ROW_NUM_W, flexShrink: 0 }} className="bg-[#f8f9fa] border-r border-[#d0d0d0]" />
            {[
              { w: TD_H_W, l: "H", s: "Toggle" },
              { w: TD_I_W, l: "I", s: "Job Title" },
              { w: TD_J_W, l: "J", s: "Seniority" },
              { w: TD_K_W, l: "K", s: "Date Posted" },
            ].map(({ w, l, s }) => (
              <div key={l} style={{ width: w, flexShrink: 0 }}
                className="bg-[#c8e6e4] border-r border-[#d0d0d0] last:border-r-0 flex flex-col items-center justify-center text-center">
                <span style={{ fontSize: 9, fontWeight: 600, color: "#444" }}>{l}</span>
                <span style={{ fontSize: 8, color: "#666", marginTop: 2, padding: "0 2px" }}>{s}</span>
              </div>
            ))}
          </div>

          {/* Data rows */}
          {[3, 4, 5].map(row => (
            <div key={row}
              className={`flex border-x border-b border-[#d0d0d0] overflow-hidden ${row === 5 ? "rounded-b" : ""}`}
              style={{ height: ROW_H }}>
              <div style={{ width: ROW_NUM_W, flexShrink: 0 }}
                className="bg-[#f8f9fa] border-r border-[#d0d0d0] flex items-center justify-center">
                <span style={{ fontSize: 9, color: "#999" }}>{row}</span>
              </div>
              {/* H toggle */}
              <div style={{ width: TD_H_W, flexShrink: 0 }}
                className="border-r border-[#d0d0d0] flex items-center justify-center bg-white">
                {row === 3 && hYes && <span style={{ fontSize: 9, fontWeight: 600, color: "#14532d" }}>Yes</span>}
                {row === 3 && (hNo || highlightNo) && !hYes && <span style={{ fontSize: 9, fontWeight: 600, color: "#991b1b" }}>No</span>}
              </div>
              {/* I, J, K — white for row 3 when unlocked; always grey for rows 4,5 */}
              {[TD_I_W, TD_J_W, TD_K_W].map((w, ci) => (
                <div key={ci} style={{ width: w, flexShrink: 0 }}
                  className={`border-r border-[#d0d0d0] last:border-r-0 transition-all duration-700
                    ${row === 3 ? (unlocked ? "bg-white" : "bg-[#f0f0f0]") : "bg-[#f0f0f0]"}`} />
              ))}
            </div>
          ))}
        </div>

        {/* Dropdown */}
        {(showDd1 || showDd2 || highlightYes || highlightNo) && (
          <div className="absolute bg-white border border-[#d0d0d0] rounded shadow-lg z-20 overflow-hidden"
            style={{ left: ddLeft, top: ddTop, minWidth: 80, fontSize: 10 }}>
            <div className={`px-3 py-1.5 transition-colors ${highlightYes ? "bg-[#e8f5e9] text-emerald-700 font-semibold" : "text-[#333]"}`}>Yes</div>
            <div className={`px-3 py-1.5 transition-colors ${highlightNo ? "bg-[#fce4e4] text-red-700 font-semibold" : "text-[#333]"}`}>No</div>
          </div>
        )}

        {/* Status badge */}
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold transition-all duration-500
            ${unlocked ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-[#1e4040] border border-[#1e4040] text-[#3d7070]"}`}>
            <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${unlocked ? "bg-emerald-400" : "bg-[#3d7070]"}`} />
            {unlocked ? "I, J, K unlocked — fill in job details" : "I, J, K locked (grey)"}
          </div>
        </div>

        <Cursor x={cursorPos.x} y={cursorPos.y} clicking={highlightYes || highlightNo} />
      </div>
    </div>
  );
}

// ─── Navigation items ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "get-started",   label: "Get Started" },
  { id: "layout",        label: "Sheet Layout" },
  { id: "titles",        label: "Person Titles" },
  { id: "seniorities",   label: "Person Seniorities" },
  { id: "job-toggle",    label: "Job Search Toggle" },
  { id: "job-seniority", label: "Job Seniority" },
  { id: "submit",        label: "Submit" },
];

// ─── Main page ────────────────────────────────────────────────────────────────
const GoogleSheetsGuide = () => {
  useAuthGuard();

  return (
    <div className="min-h-screen bg-[#060f0f] text-white">
      {/* Sticky header */}
      <header className="sticky top-0 z-50 border-b border-[#1e4040] bg-[#060f0f]/95 backdrop-blur">
        <div className="max-w-5xl mx-auto flex items-center h-14 px-5 gap-3">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="gap-2 text-[#3d7070] hover:text-white h-8 px-3">
              <ArrowLeft className="h-4 w-4" /> Dashboard
            </Button>
          </Link>
          <div className="h-4 w-px bg-[#1e4040]" />
          <div className="flex items-center gap-2 text-[13px] text-[#3d7070]">
            <BookOpen className="h-4 w-4 text-[#58dddd]" />
            <span className="text-white font-medium">BulkSearch Sheet — Tutorial</span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 py-10 flex gap-10">
        {/* Sidebar nav */}
        <aside className="hidden lg:block w-44 shrink-0">
          <div className="sticky top-24 space-y-1">
            <p className="text-[11px] font-semibold text-[#3d7070] uppercase tracking-wider mb-3">Contents</p>
            {NAV_ITEMS.map(item => (
              <a key={item.id} href={`#${item.id}`}
                className="flex items-center gap-2 text-[12px] text-[#3d7070] hover:text-[#58dddd] transition-colors py-1 group">
                <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-[#58dddd] transition-opacity" />
                {item.label}
              </a>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 space-y-16 min-w-0">

          {/* Hero */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#009da5]/30 bg-[#009da5]/5 text-[12px] text-[#58dddd] mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#58dddd]" /> BulkSearch Template V2
            </div>
            <h1 className="text-[28px] font-bold text-white mb-2 leading-tight">How to use the BulkSearch Sheet</h1>
            <p className="text-[14px] text-[#3d7070] leading-relaxed">
              Up to 100 companies per upload. Use the sidebar pickers for titles &amp; seniorities, enable job search per row, then export as Excel and submit.
            </p>
          </div>

          {/* ── 1. Get Started ──────────────────────────────────────────── */}
          <section>
            <SectionHeading id="get-started" icon={Upload} label="1. Get Started" />
            <div className="space-y-3 mb-5">
              {[
                { step: "Make a Copy", desc: 'Click "Make a Copy" on the dashboard. Sheet opens in your Google Drive.' },
                { step: "Allow the script", desc: "A permissions prompt appears — click Review Permissions → Allow. Required for sidebar pickers to work." },
                { step: "Spot the BulkSearch menu", desc: "After allowing, a BulkSearch menu appears in the top menu bar with all three pickers." },
                { step: "Fill rows 3–102", desc: "Rows 1–2 are the frozen header. Your data goes from row 3 downward — 100 rows maximum." },
              ].map((s, i) => (
                <div key={i} className="flex gap-3 items-start rounded-xl border border-[#1e4040] bg-[#080f0f] p-4">
                  <StepBadge n={i + 1} />
                  <div>
                    <p className="text-[13px] font-semibold text-white">{s.step}</p>
                    <p className="text-[12px] text-[#3d9090] mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── 2. Sheet Layout ─────────────────────────────────────────── */}
          <section>
            <SectionHeading id="layout" icon={Layers} label="2. Sheet Layout" />
            <p className="text-[13px] text-[#3d7070] mb-4">Every row = one company. Here's what each column does:</p>

            <ScreenshotCard
              src="/tutorial/overview.png"
              alt="BulkSearch sheet columns overview"
              maxWidth="680px"
              className="mb-5"
            />

            <div className="overflow-x-auto rounded-xl border border-[#1e4040]">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[#1e4040] bg-[#0c1d1d]">
                    <th className="text-left px-4 py-2 text-[#3d7070] font-semibold">Col</th>
                    <th className="text-left px-4 py-2 text-[#3d7070] font-semibold">Name</th>
                    <th className="text-left px-4 py-2 text-[#3d7070] font-semibold">How to fill</th>
                    <th className="text-left px-4 py-2 text-[#3d7070] font-semibold">Required</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["A","Sr No","Auto-filled",false],
                    ["B","Organization Name","Type manually","✓"],
                    ["C","Organization Locations","Type manually","✓"],
                    ["D","Organization Domains","e.g. company.com","✓"],
                    ["E","Person Titles","Sidebar picker — click cell then open picker","✓"],
                    ["F","Person Seniorities","Sidebar picker — click cell then open picker","✓"],
                    ["G","Results per Title","Number ≥ 1","✓"],
                    ["H","Toggle Job Search","Yes / No dropdown","–"],
                    ["I","Job Title","Free text, comma separated (H = Yes)","–"],
                    ["J","Job Seniority","Sidebar picker (H = Yes)","–"],
                    ["K","Date Posted","Max age in days (H = Yes)","–"],
                  ].map(([col, name, note, req], i) => (
                    <tr key={col as string} className={`border-b border-[#1e4040]/60 ${i % 2 === 0 ? "bg-[#060f0f]" : "bg-[#080f0f]"}`}>
                      <td className="px-4 py-2"><ColBadge col={col as string} /></td>
                      <td className="px-4 py-2 text-white font-medium">{name as string}</td>
                      <td className="px-4 py-2 text-[#3d9090]">{note as string}</td>
                      <td className="px-4 py-2">
                        {req === "✓"
                          ? <span className="px-2 py-0.5 rounded-full bg-[#009da5]/10 border border-[#009da5]/30 text-[#58dddd] text-[11px]">Required</span>
                          : <span className="text-[#2a4a4a] text-[11px]">Optional</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── 3. Person Titles ────────────────────────────────────────── */}
          <section>
            <SectionHeading id="titles" icon={MousePointer2} label="3. Person Titles (col E)" />

            <ScreenshotCard
              src="/tutorial/cols-ef.png"
              alt="Person Titles column E"
              maxWidth="280px"
              className="mb-5"
            />

            <ul className="space-y-2 text-[13px] text-[#3d9090] mb-5">
              <li className="flex gap-2"><span className="text-[#58dddd] font-bold shrink-0">1.</span>Click the <strong className="text-white">Person Titles Picker</strong> button in the column header (or via BulkSearch menu).</li>
              <li className="flex gap-2"><span className="text-[#58dddd] font-bold shrink-0">2.</span>The sidebar opens. Now click any cell in <ColBadge col="E" /> for the row you want to edit — the sidebar loads that row instantly.</li>
              <li className="flex gap-2"><span className="text-[#58dddd] font-bold shrink-0">3.</span>Type in the filter box to narrow — e.g. "eng" → only Engineering shows.</li>
              <li className="flex gap-2"><span className="text-[#58dddd] font-bold shrink-0">4.</span>Tick the categories. Add a custom one by typing in the top box and pressing <kbd className="px-1.5 py-0.5 rounded bg-[#0e2a2a] border border-[#1e4040] text-[#58dddd] text-[11px]">Enter</kbd> or clicking Add.</li>
              <li className="flex gap-2"><span className="text-[#58dddd] font-bold shrink-0">5.</span>Click <strong className="text-white">Confirm</strong> — selected titles are written to col E as comma-separated list.</li>
            </ul>

            <SidebarAnimationDemo
              title="Person Titles"
              colLetter="E"
              options={["Engineering", "Finance"]}
              result="Engineering, Finance"
            />

            <div className="mt-4">
              <Tip>Re-opening the sidebar on the same row restores your previous selections — add or remove without starting over.</Tip>
            </div>
          </section>

          {/* ── 4. Person Seniorities ────────────────────────────────────── */}
          <section>
            <SectionHeading id="seniorities" icon={MousePointer2} label="4. Person Seniorities (col F)" />

            <ScreenshotCard
              src="/tutorial/cols-ef.png"
              alt="Person Seniorities column F"
              maxWidth="280px"
              className="mb-5"
            />

            <ul className="space-y-2 text-[13px] text-[#3d9090] mb-5">
              <li className="flex gap-2"><span className="text-[#58dddd] font-bold shrink-0">1.</span>Click the <strong className="text-white">Person Seniorities Picker</strong> button, then click a cell in <ColBadge col="F" />.</li>
              <li className="flex gap-2"><span className="text-[#58dddd] font-bold shrink-0">2.</span>15 standard levels: Owner, Partner, C-Suite, VP, SVP, EVP, Director, Senior Manager, Manager, Team Lead, Senior, Mid-Level, Entry Level, Intern, Training.</li>
              <li className="flex gap-2"><span className="text-[#58dddd] font-bold shrink-0">3.</span>Filter, tick, or add a custom level. Click <strong className="text-white">Confirm</strong>.</li>
            </ul>

            <SidebarAnimationDemo
              title="Person Seniorities"
              colLetter="F"
              options={["Director", "Manager"]}
              result="Director, Manager"
            />
          </section>

          {/* ── 5. Job Search Toggle ─────────────────────────────────────── */}
          <section>
            <SectionHeading id="job-toggle" icon={ToggleRight} label="5. Job Search Toggle (col H)" />

            <ScreenshotCard
              src="/tutorial/cols-hk.png"
              alt="Toggle job search column H"
              maxWidth="480px"
              className="mb-5"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[12px] font-bold text-emerald-400">YES</div>
                  <span className="text-[13px] text-white font-medium">Job search on</span>
                </div>
                <ul className="space-y-1.5 text-[12px] text-[#3d9090]">
                  <li>• Cols I, J, K unlock (white)</li>
                  <li>• Type job titles in <ColBadge col="I" /> — comma separated</li>
                  <li>• Pick job seniority via <ColBadge col="J" /> sidebar</li>
                  <li>• Enter max post age in days in <ColBadge col="K" /></li>
                </ul>
              </div>
              <div className="rounded-xl border border-[#1e4040] bg-[#080f0f] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-[12px] font-bold text-red-400">NO / Empty</div>
                  <span className="text-[13px] text-white font-medium">Job search off</span>
                </div>
                <ul className="space-y-1.5 text-[12px] text-[#3d9090]">
                  <li>• Cols I, J, K grey — cleared and locked</li>
                  <li>• Enrichment runs without job filter</li>
                </ul>
              </div>
            </div>

            <ToggleDemo />

            <div className="mt-4">
              <Warn>Switching col H from Yes → No permanently clears all values in I, J, K for that row.</Warn>
            </div>
          </section>

          {/* ── 6. Job Seniority ─────────────────────────────────────────── */}
          <section>
            <SectionHeading id="job-seniority" icon={Search} label="6. Job Seniority (col J)" />

            <ScreenshotCard
              src="/tutorial/cols-hk.png"
              alt="Job Seniority column J"
              maxWidth="480px"
              className="mb-5"
            />

            <ul className="space-y-2 text-[13px] text-[#3d9090] mb-5">
              <li className="flex gap-2"><span className="text-[#58dddd] font-bold shrink-0">1.</span>Col H must be <strong className="text-emerald-400">Yes</strong> first — otherwise col J is grey and the sidebar will show an error.</li>
              <li className="flex gap-2"><span className="text-[#58dddd] font-bold shrink-0">2.</span>Click the <strong className="text-white">Seniority Picker</strong> button in the J header, then click a cell in <ColBadge col="J" />.</li>
              <li className="flex gap-2"><span className="text-[#58dddd] font-bold shrink-0">3.</span>6 fixed levels: Internship, Entry level, Associate, Mid-Senior level, Director, Executive.</li>
              <li className="flex gap-2"><span className="text-[#58dddd] font-bold shrink-0">4.</span>Tick one or more, then click <strong className="text-white">Confirm</strong>.</li>
            </ul>

            <JobSeniorityDemo />
          </section>

          {/* ── 7. Submit ──────────────────────────────────────────────────── */}
          <section>
            <SectionHeading id="submit" icon={Upload} label="7. Submit Your File" />
            <div className="space-y-3">
              {[
                { step: "Download as Excel", desc: "File → Download → Microsoft Excel (.xlsx)" },
                { step: "Go to Bulk Upload", desc: "Open the dashboard and go to the Bulk Upload section." },
                { step: "Upload the file", desc: "Drag and drop or click to select your .xlsx file." },
                { step: "Submit", desc: "Click Submit for Enrichment. Track progress on the dashboard." },
              ].map((s, i) => (
                <div key={i} className="flex gap-3 items-center rounded-xl border border-[#1e4040] bg-[#080f0f] p-4">
                  <StepBadge n={i + 1} />
                  <div>
                    <p className="text-[13px] font-semibold text-white">{s.step}</p>
                    <p className="text-[12px] text-[#3d9090] mt-0.5">{s.desc}</p>
                  </div>
                  {i === 3 && <CheckCircle2 className="w-5 h-5 text-emerald-400 ml-auto shrink-0" />}
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Warn>Max 100 rows per upload (rows 3–102). Rows outside this range are ignored by the system.</Warn>
            </div>
          </section>

          {/* Footer */}
          <div className="pt-6 border-t border-[#1e4040] flex justify-between items-center">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="gap-2 text-[#3d7070] hover:text-white">
                <ArrowLeft className="h-4 w-4" /> Back to Dashboard
              </Button>
            </Link>
            <span className="text-[11px] text-[#2a4a4a]">BulkSearch Template V2</span>
          </div>
        </main>
      </div>
    </div>
  );
};

export default GoogleSheetsGuide;
