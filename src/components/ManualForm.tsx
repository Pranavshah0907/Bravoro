import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, X, ChevronDown, Check, Search, ArrowRight, Briefcase } from "lucide-react";
import { ProcessingStatus } from "./ProcessingStatus";
import { z } from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── Constants ──────────────────────────────────────────────────────────────────
const COUNTRIES = [
  "United States","United Kingdom","Canada","Australia","Germany","France",
  "India","China","Japan","Brazil","Mexico","Spain","Italy","Netherlands",
  "Singapore","Switzerland","Sweden","Norway","Denmark","Finland","Belgium",
  "Austria","Ireland","Poland","Czech Republic","Portugal","Greece","Hungary",
  "Romania","South Korea","Malaysia","Thailand","Indonesia","Philippines",
  "Vietnam","United Arab Emirates","Saudi Arabia","Israel","Turkey","Egypt",
  "South Africa","Nigeria","Kenya","Argentina","Chile","Colombia","Peru",
].sort();

const SENIORITY_LEVELS = [
  "Owner","Partner","C-Suite (CXO)","VP","SVP","EVP","Director",
  "Senior Manager","Manager","Team Lead","Senior","Mid-Level",
  "Entry Level","Intern","Training",
];

const LINKEDIN_FUNCTIONS = [
  "Accounting","Administrative","Arts and Design","Business Development",
  "Community and Social Services","Consulting","Education","Engineering",
  "Entrepreneurship","Finance","Healthcare Services","Human Resources",
  "Information Technology","Legal","Marketing","Media and Communication",
  "Military and Protective Services","Operations","Product Management",
  "Program and Project Management","Purchasing","Quality Assurance",
  "Real Estate","Research","Sales","Support",
].sort();

// ── Job Search constants ────────────────────────────────────────────────────────
const JOB_DEPARTMENTS = [
  "Sales","Marketing","Engineering","Product Management","Design",
  "Finance","Accounting","Human Resources","Legal","Operations",
  "Customer Success","Customer Support","Information Technology",
  "Research & Development","Business Development","Data & Analytics",
  "Communications","Public Relations","Procurement","Strategy",
  "Security","Supply Chain","Quality Assurance","Administration",
  "Executive","Consulting","Healthcare","Education",
].sort();

const JOB_SENIORITY_PRESETS = [
  "Internship","Entry level","Associate","Mid-Senior level","Director","Executive",
];

const DATE_POSTED_OPTIONS = [
  { label: "Anytime",       value: "anytime"    },
  { label: "Past 24 hours", value: "past_24h"   },
  { label: "Past week",     value: "past_week"  },
  { label: "Past month",    value: "past_month" },
] as const;

type DatePosted = "anytime" | "past_24h" | "past_week" | "past_month" | "custom";

// ── Spell-check helpers for Job Titles ─────────────────────────────────────────
const COMMON_JOB_TITLE_WORDS = [
  "Accountant","Administrator","Analyst","Architect","Assistant","Associate",
  "Automation","Coordinator","Consultant","Designer","Developer","Director",
  "Engineer","Engineering","Executive","Finance","Founder","Leadership",
  "Manager","Marketing","Mechanic","Operations","Planner","Product",
  "Project","Quality","Recruiter","Researcher","Robotics","Sales",
  "Scientist","Security","Software","Specialist","Strategist","Support",
  "Technician","Technology","Training","Vendor","Architect","Infrastructure",
  "Manufacturing","Procurement","Logistics","Analytics","Intelligence",
];

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i-1] === b[j-1]
        ? prev[j-1]
        : 1 + Math.min(prev[j], curr[j-1], prev[j-1]);
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[b.length];
}

function getSpellSuggestion(input: string): string | null {
  if (input.length < 4) return null;
  const lower = input.toLowerCase();
  let best: string | null = null;
  let bestDist = 3; // suggest only if distance <= 2
  for (const word of COMMON_JOB_TITLE_WORDS) {
    const wl = word.toLowerCase();
    if (wl === lower) return null; // exact match
    const d = levenshtein(lower, wl);
    if (d < bestDist) { bestDist = d; best = word; }
  }
  return best;
}

const formSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required"),
  domain: z.string().trim().min(1, "Domain name is required"),
  functions: z.array(z.string()),
  seniority: z.array(z.string()).min(1, "At least one seniority level must be selected"),
  geography: z.string(),
  resultsPerFunction: z.number().min(1, "Results per function must be at least 1"),
});

interface ManualFormProps { userId: string; }

// ── Sub-components ─────────────────────────────────────────────────────────────

const SectionHeading = ({ num, children, right }: { num: string; children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex items-center gap-3 mb-6">
    <span className="text-[12px] font-black tracking-[0.3em] text-[#009da5]/80 shrink-0 tabular-nums">{num}</span>
    <span className="text-[16px] font-bold tracking-[0.16em] uppercase text-[#70e8e8] shrink-0">{children}</span>
    <div className="flex-1 h-px bg-gradient-to-r from-[#009da5]/30 to-transparent" />
    {right && <div className="shrink-0 ml-2">{right}</div>}
  </div>
);

const FieldLabel = ({
  children, required, hint, action,
}: {
  children: React.ReactNode; required?: boolean; hint?: string; action?: React.ReactNode;
}) => (
  <div className="flex items-center justify-between mb-2.5">
    <div className="flex items-baseline gap-1.5">
      <span className="text-[13px] font-bold text-white tracking-[0.08em] uppercase">
        {children}
        {required && <span className="text-[#00c8d2] ml-0.5">*</span>}
      </span>
      {hint && <span className="text-[12px] text-[#5e9898] normal-case tracking-normal font-normal">{hint}</span>}
    </div>
    {action}
  </div>
);

const LineInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`
      w-full py-2.5 px-0 bg-transparent
      border-0 border-b border-[#254848]
      text-[16px] text-white
      outline-none transition-colors duration-200
      focus:border-[#009da5]
      placeholder:text-[#3a6060]
      [appearance:textfield]
      [&::-webkit-inner-spin-button]:appearance-none
      [&::-webkit-outer-spin-button]:appearance-none
      ${props.className ?? ""}
    `}
    style={{ boxShadow: "none", WebkitBoxShadow: "none", ...props.style }}
  />
);

const Tag = ({ label, onRemove, variant = "teal" }: { label: string; onRemove: () => void; variant?: "teal" | "violet" }) => {
  const colors = variant === "violet"
    ? "bg-[#7c3aed]/10 text-[#a78bfa] border-[#7c3aed]/25"
    : "bg-[#009da5]/10 text-[#58dddd] border-[#009da5]/25";
  return (
    <span className={`tag-bubble inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium border select-none whitespace-nowrap ${colors}`}>
      {label}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="rounded p-0.5 hover:bg-white/10 transition-colors duration-150 focus-visible:outline-none opacity-50 hover:opacity-100"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
};

const TagBox = ({ children, onClick, className = "" }: {
  children: React.ReactNode; onClick?: () => void; className?: string;
}) => (
  <div
    onClick={onClick}
    className={`
      min-h-[42px] flex flex-wrap gap-1.5 items-center px-3 py-2
      border border-[#254848] rounded-lg bg-[#060e0e]
      cursor-text transition-colors duration-200
      focus-within:border-[#009da5]/60 hover:border-[#2e5555]
      ${className}
    `}
  >
    {children}
  </div>
);

// Toggle switch
const ToggleSwitch = ({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) => (
  <button
    type="button"
    onClick={onToggle}
    className="flex items-center gap-2.5 group cursor-pointer focus-visible:outline-none"
    role="switch"
    aria-checked={on}
  >
    <span className={`text-[13px] font-semibold tracking-wide transition-colors duration-200 ${on ? "text-[#58dddd]" : "text-[#8ac8c8] group-hover:text-[#a8e0e0]"}`}>
      {label}
    </span>
    <div className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-250 ${on ? "bg-[#009da5]" : "bg-[#1e3d3d] group-hover:bg-[#254848]"}`}>
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${on ? "translate-x-4" : "translate-x-0"}`} />
    </div>
  </button>
);

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-[#0d2020] border border-[#254848] font-mono text-[#5a9898] leading-none">{children}</kbd>
);

const HintLine = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[12px] text-[#5e9898] mt-1.5 leading-relaxed">{children}</p>
);

const PaneDivider = () => <div className="h-px bg-[#1a3535]" />;

// Reusable searchable tag-dropdown input (used for Functions, Seniority, and Job Departments)
const TagDropdownInput = ({
  selected, onAdd, onRemove,
  placeholder, suggestions, tagVariant = "teal",
  keepSelectedInList = false,
}: {
  selected: string[];
  onAdd: (val: string) => void;
  onRemove: (val: string) => void;
  placeholder: string;
  suggestions: string[];
  tagVariant?: "teal" | "violet";
  // true = items stay in list with checkmark (Functions); false = items vanish when selected (Seniority)
  keepSelectedInList?: boolean;
  // false = only allow selection from suggestions, no free-text entry
  allowCustom?: boolean;
}) => {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const canTypeCustom = allowCustom !== false;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addTag = (val: string) => {
    const v = val.trim();
    if (v && !selected.includes(v)) onAdd(v);
    setInput(""); setSearch("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      if (canTypeCustom) {
        addTag(input);
      } else {
        const match = suggestions.find(s => s.toLowerCase() === input.trim().toLowerCase());
        if (match) addTag(match);
      }
    } else if (e.key === "Backspace" && !input && selected.length > 0) {
      onRemove(selected[selected.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // When keepSelectedInList=true, show all (with checkmarks); when false, hide selected items
  const filtered = suggestions.filter(s =>
    s.toLowerCase().includes(search.toLowerCase()) &&
    (keepSelectedInList || !selected.includes(s))
  );

  const checkBg = tagVariant === "violet" ? "bg-[#7c3aed] border-[#7c3aed]" : "bg-[#009da5] border-[#009da5]";
  const checkBorder = tagVariant === "violet" ? "border-[#2a1a4a]" : "border-[#254848]";

  return (
    <div className="relative" ref={dropdownRef}>
      <TagBox className="pr-10" onClick={() => inputRef.current?.focus()}>
        {selected.map(tag => <Tag key={tag} label={tag} onRemove={() => onRemove(tag)} variant={tagVariant} />)}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value); setSearch(e.target.value); }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={e => {
            const relatedTarget = e.relatedTarget as Node | null;
            if (!relatedTarget || (dropdownRef.current && !dropdownRef.current.contains(relatedTarget))) {
              if (input.trim() && canTypeCustom) addTag(input);
              if (!canTypeCustom) { setInput(""); setSearch(""); }
              setOpen(false);
            }
          }}
          placeholder={selected.length === 0 ? placeholder : "Add more…"}
          className="mf-bare flex-1 min-w-[120px] bg-transparent text-[14px] text-white outline-none py-0.5"
        />
      </TagBox>

      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={() => { setOpen(v => !v); inputRef.current?.focus(); }}
        className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all duration-200 focus-visible:outline-none ${open ? "text-[#58dddd] bg-[#009da5]/10" : "text-[#5a9898] hover:text-[#58dddd] hover:bg-[#009da5]/10"}`}
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="fn-dropdown absolute top-[calc(100%+4px)] left-0 right-0 z-50 rounded-xl border border-[#1a3535] bg-[#0c1d1d] shadow-[0_16px_48px_rgba(0,0,0,0.7)] overflow-hidden">
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[#1a3535]/60 bg-[#091616]">
            <Search className="h-3.5 w-3.5 text-[#5a9898] shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="mf-bare flex-1 bg-transparent text-[14px] text-white outline-none"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-[#2e5c5c] hover:text-[#3d8080] transition-colors">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="max-h-44 overflow-y-auto py-1 px-1.5">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-xs text-center text-[#5a9090]">
                {search ? (canTypeCustom ? `No match — press Enter to add "${search}"` : "No matching option") : "All suggestions selected"}
              </p>
            ) : (
              filtered.map(item => {
                const isChecked = keepSelectedInList && selected.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      if (isChecked) {
                        onRemove(item);
                      } else {
                        onAdd(item);
                        setInput(""); setSearch("");
                      }
                      setOpen(true);
                      inputRef.current?.focus();
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-[14px] rounded-lg text-left transition-colors duration-150 ${
                      isChecked
                        ? "text-[#58dddd] hover:bg-white/[0.04]"
                        : "text-[#b0d8d8] hover:bg-white/[0.05] hover:text-white"
                    }`}
                  >
                    <div className={`w-[15px] h-[15px] rounded-[3px] border flex items-center justify-center shrink-0 transition-all duration-150 ${isChecked ? checkBg : checkBorder}`}>
                      {isChecked && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    {item}
                  </button>
                );
              })
            )}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-[#1a3535]/60 px-3.5 py-2 flex items-center justify-between bg-[#091616]">
              <span className="text-[12px] text-[#6aacac] font-medium">{selected.length} selected</span>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => selected.forEach(s => onRemove(s))} className="text-[12px] text-[#4d8080] hover:text-red-400 transition-colors font-medium">Clear all</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Free-text tag input with spell suggestion (used for Job Titles)
// Uses LanguageTool API (auto language detection) for multi-language spell correction,
// with local Levenshtein as a fast fallback for common English typos.
const JobTitleInput = ({ tags, onAdd, onRemove }: {
  tags: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void;
}) => {
  const [input, setInput] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkSpelling = async (text: string) => {
    if (text.length < 4) { setSuggestion(null); return; }

    // Fast path: local Levenshtein for common English job title words
    const local = getSpellSuggestion(text);
    if (local) { setSuggestion(local); return; }

    // Slow path: LanguageTool API — auto-detects language, handles German/French/etc.
    try {
      setChecking(true);
      const res = await fetch("https://api.languagetool.org/v2/check", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ text, language: "auto" }).toString(),
      });
      if (!res.ok) return;
      const data = await res.json();
      const first = data.matches?.[0];
      // Only suggest if the match covers the whole word and there's a replacement
      if (first?.replacements?.length > 0) {
        setSuggestion(first.replacements[0].value);
      } else {
        setSuggestion(null);
      }
    } catch {
      // Network failure — silently skip
    } finally {
      setChecking(false);
    }
  };

  const addTag = (val: string) => {
    const v = val.trim();
    if (v && !tags.includes(v)) onAdd(v);
    setInput(""); setSuggestion(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    setSuggestion(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 4) {
      debounceRef.current = setTimeout(() => checkSpelling(val.trim()), 600);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault(); addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      onRemove(tags[tags.length - 1]);
    }
  };

  return (
    <div>
      <TagBox onClick={() => inputRef.current?.focus()}>
        {tags.map(tag => <Tag key={tag} label={tag} onRemove={() => onRemove(tag)} />)}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (input.trim()) addTag(input); }}
          placeholder={tags.length === 0 ? "e.g. Sales, Marketing…" : "Add more…"}
          className="mf-bare flex-1 min-w-[120px] bg-transparent text-[14px] text-white outline-none py-0.5"
        />
      </TagBox>
      {(suggestion || checking) && (
        <div className="flex items-center gap-1.5 mt-1.5 min-h-[20px]">
          {checking && !suggestion && (
            <span className="text-[12px] text-[#3d6464] flex items-center gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> checking…
            </span>
          )}
          {suggestion && (
            <>
              <span className="text-[12px] text-[#5e9898]">Did you mean</span>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => addTag(suggestion)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-semibold bg-[#009da5]/12 text-[#58dddd] border border-[#009da5]/30 hover:bg-[#009da5]/20 transition-colors duration-150 cursor-pointer"
              >
                {suggestion} <Check className="h-2.5 w-2.5" />
              </button>
              <span className="text-[11px] text-[#3d6060]">?</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
export const ManualForm = ({ userId }: ManualFormProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Contact enrichment state
  const [companyName, setCompanyName] = useState("");
  const [domain, setDomain] = useState("");
  const [geography, setGeography] = useState("");
  const [resultsPerFunction, setResultsPerFunction] = useState<number>(10);
  const [resultsPerFunctionRaw, setResultsPerFunctionRaw] = useState<string>("10");
  const [searchId, setSearchId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<"processing" | "completed" | "error" | "queued" | null>(null);

  // Functions state
  const [selectedFunctions, setSelectedFunctions] = useState<string[]>([]);

  // Seniority state
  const [selectedSeniority, setSelectedSeniority] = useState<string[]>([]);

  // Person Job Title state (free-text tags)
  const [personJobTitles, setPersonJobTitles] = useState<string[]>([]);
  const [personJobTitleInput, setPersonJobTitleInput] = useState("");
  const personJobTitleInputRef = useRef<HTMLInputElement>(null);

  // Job search state
  const [includeJobSearch, setIncludeJobSearch] = useState(false);
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [jobSeniority, setJobSeniority] = useState<string[]>([]);
  const [jobSeniorityInput, setJobSeniorityInput] = useState("");
  const [datePosted, setDatePosted] = useState<DatePosted>("anytime");
  const [customDays, setCustomDays] = useState<number>(7);
  const [customDaysRaw, setCustomDaysRaw] = useState<string>("7");
  const customDaysInputRef = useRef<HTMLInputElement>(null);
  const jobSeniorityInputRef = useRef<HTMLInputElement>(null);

  // Search summary (captured at submit time, passed to ProcessingStatus)
  const [searchSummary, setSearchSummary] = useState<{
    companyName: string; domain: string; functions: string[]; seniority: string[];
    geography: string; resultsPerFunction: number; includeJobSearch: boolean;
    jobTitles: string[]; jobSeniority: string[];
  } | null>(null);

  // Seniority helpers
  const handleSelectAllSeniorities = () => {
    setSelectedSeniority(prev => prev.length === SENIORITY_LEVELS.length ? [] : [...SENIORITY_LEVELS]);
  };
  const allSenioritiesSelected = selectedSeniority.length === SENIORITY_LEVELS.length;

  // Job seniority helpers (simple tag input, no dropdown)
  const addJobSeniorityTag = (val: string) => {
    const v = val.trim();
    if (v && !jobSeniority.includes(v)) setJobSeniority(p => [...p, v]);
    setJobSeniorityInput("");
  };
  const removeJobSeniorityTag = (tag: string) => setJobSeniority(p => p.filter(t => t !== tag));
  const handleJobSeniorityKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && jobSeniorityInput.trim()) {
      e.preventDefault(); addJobSeniorityTag(jobSeniorityInput);
    } else if (e.key === "Backspace" && !jobSeniorityInput && jobSeniority.length > 0) {
      setJobSeniority(p => p.slice(0, -1));
    }
  };

  const isFormValid = () =>
    companyName.trim() && domain.trim() && selectedSeniority.length > 0 && resultsPerFunction > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      formSchema.parse({ companyName, domain, functions: selectedFunctions, seniority: selectedSeniority, geography, resultsPerFunction });
      setLoading(true);

      const { data: search, error: searchError } = await supabase
        .from("searches")
        .insert({
          user_id: userId, search_type: "manual",
          company_name: companyName.trim(), domain: domain.trim(),
          functions: selectedFunctions, seniority: selectedSeniority,
          geography, results_per_function: resultsPerFunction, status: "processing",
        })
        .select().single();

      if (searchError) throw searchError;
      setSearchSummary({
        companyName: companyName.trim(), domain: domain.trim(),
        functions: selectedFunctions, seniority: selectedSeniority,
        geography, resultsPerFunction, includeJobSearch,
        jobTitles: includeJobSearch ? jobTitles : [],
        jobSeniority: includeJobSearch ? jobSeniority : [],
      });
      setSearchId(search.id);
      setProcessingStatus("processing");

      const datePostedDays = !includeJobSearch ? 0
        : datePosted === "past_24h" ? 1
        : datePosted === "past_week" ? 7
        : datePosted === "past_month" ? 30
        : datePosted === "custom" ? customDays
        : 0;

      const searchData: Record<string, unknown> = {
        "Sr No": 1,
        "Organization Name": companyName.trim(),
        "Organization Locations": geography,
        "Organization Domains": domain.trim(),
        "Person Functions": selectedFunctions.join(", "),
        "Person Seniorities": selectedSeniority.join(", "),
        "Person Job Title": personJobTitles.join(", "),
        "Results per Function": resultsPerFunction,
        "Toggle job search": includeJobSearch ? "Yes" : "No",
        "Job Title": includeJobSearch ? jobTitles.join(", ") : "",
        "Job Seniority": includeJobSearch ? jobSeniority : [],
        "Date Posted": datePostedDays,
        search_type: "manual",
      };

      const { data: { session } } = await supabase.auth.getSession();
      const { error: fnError } = await supabase.functions.invoke("trigger-n8n-webhook", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { searchId: search.id, entryType: "manual_entry", searchData },
      });

      if (fnError) {
        console.error("trigger-n8n-webhook failed:", fnError);
        const errMsg = fnError.message || "";
        if (errMsg.includes("INSUFFICIENT_CREDITS") || errMsg.includes("run out of credits")) {
          throw new Error("Your workspace has run out of credits. Please contact your admin to top up.");
        }
        throw new Error("Failed to start processing. Please try again.");
      }

      toast({ title: "Request Submitted", description: "Your lead enrichment request is being processed" });
    } catch (error: any) {
      toast({ title: "Submission Failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setCompanyName(""); setDomain(""); setSelectedFunctions([]); setSelectedSeniority([]);
    setPersonJobTitles([]); setPersonJobTitleInput("");
    setGeography(""); setResultsPerFunction(10); setSearchId(null); setProcessingStatus(null);
    setIncludeJobSearch(false); setJobTitles([]); setJobSeniority([]); setDatePosted("anytime"); setCustomDays(7);
    setSearchSummary(null);
  };

  if (searchId && processingStatus) {
    return <ProcessingStatus searchId={searchId} onReset={handleReset} searchSummary={searchSummary ?? undefined} />;
  }

  const valid = isFormValid();

  return (
    <>
      <style>{`
        @keyframes tagPop {
          0%   { transform: scale(0.65) translateY(4px); opacity: 0; }
          100% { transform: scale(1)   translateY(0);    opacity: 1; }
        }
        .tag-bubble { animation: tagPop 0.15s cubic-bezier(0.34, 1.56, 0.64, 1); }
        @keyframes dropDown {
          0%   { opacity: 0; transform: translateY(-5px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .fn-dropdown { animation: dropDown 0.13s ease-out; }
        .mf-bare::placeholder { color: #3d6464; }
      `}</style>

      <div className="rounded-2xl overflow-hidden border border-[#1e4040]/60 shadow-[0_12px_56px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,157,165,0.06)]">

        {/* ══ TWO-PANE ROW ════════════════════════════════════════════════════ */}
        <div className="flex flex-col lg:flex-row">

          {/* ── LEFT PANE: Target ── */}
          <div className="lg:w-[38%] bg-[#0c1d1d] border-b lg:border-b-0 lg:border-r border-[#1e4040]/55 px-7 pt-8 pb-9 flex flex-col gap-7">
            <SectionHeading num="01">Target</SectionHeading>

            <div>
              <FieldLabel required>Company Name</FieldLabel>
              <LineInput type="text" placeholder="Acme Corporation" value={companyName} onChange={e => setCompanyName(e.target.value)} />
            </div>

            <div>
              <FieldLabel required>Domain</FieldLabel>
              <LineInput type="text" placeholder="acme.com" value={domain} onChange={e => setDomain(e.target.value)} />
            </div>

            <div>
              <FieldLabel hint="optional">Geography</FieldLabel>
              <Select value={geography} onValueChange={setGeography}>
                <SelectTrigger className="h-auto py-2.5 px-0 w-full bg-transparent border-0 border-b border-[#254848] text-[16px] text-white rounded-none shadow-none outline-none ring-0 ring-offset-0 focus:ring-0 focus:ring-offset-0 focus:border-[#009da5] data-[placeholder]:text-[#3a6060] [&>svg]:text-[#5a9898] [&>svg]:opacity-80 transition-colors duration-200">
                  <SelectValue placeholder="Select a country" />
                </SelectTrigger>
                <SelectContent className="bg-[#0c1d1d] border border-[#1a3535] rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.75)] max-h-64">
                  {COUNTRIES.map(country => (
                    <SelectItem key={country} value={country} className="text-[14px] text-[#88c0c0] rounded-lg focus:bg-[#009da5]/15 focus:text-[#58dddd] cursor-pointer">
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-auto pt-4 flex items-center gap-2 opacity-55">
              <div className="w-5 h-px bg-[#009da5]" />
              <span className="text-[12px] text-[#009da5] tracking-[0.12em]">* required</span>
            </div>
          </div>

          {/* ── RIGHT PANE: Filter Parameters ── */}
          <div className="flex-1 bg-[#080f0f] px-7 pt-8 pb-9 flex flex-col gap-6">
            <SectionHeading num="02">Filter Parameters</SectionHeading>

            {/* Functions */}
            <div>
              <FieldLabel hint="optional">Functions</FieldLabel>
              <TagDropdownInput
                selected={selectedFunctions}
                onAdd={v => { if (!selectedFunctions.includes(v)) setSelectedFunctions(p => [...p, v]); }}
                onRemove={v => setSelectedFunctions(p => p.filter(t => t !== v))}
                placeholder="Search or type a function…"
                suggestions={LINKEDIN_FUNCTIONS}
                keepSelectedInList={true}
              />
              <HintLine>Pick from dropdown · Type custom & press <Kbd>Enter</Kbd> · <Kbd>⌫</Kbd> removes last</HintLine>
            </div>

            <PaneDivider />

            {/* Seniority */}
            <div>
              <FieldLabel
                required
                action={
                  <button
                    type="button"
                    onClick={handleSelectAllSeniorities}
                    className={`text-[12px] px-2.5 py-1 rounded-md font-semibold border transition-colors duration-200 cursor-pointer ${
                      allSenioritiesSelected
                        ? "bg-[#009da5]/16 text-[#58dddd] border-[#009da5]/40"
                        : "bg-transparent text-[#7ababa] border-[#254848] hover:border-[#009da5]/40 hover:text-[#58dddd]"
                    }`}
                  >
                    {allSenioritiesSelected ? "✓ All selected" : "Select all"}
                  </button>
                }
              >
                Seniority Level
              </FieldLabel>
              <TagDropdownInput
                selected={selectedSeniority}
                onAdd={v => { if (!selectedSeniority.includes(v)) setSelectedSeniority(p => [...p, v]); }}
                onRemove={v => setSelectedSeniority(p => p.filter(t => t !== v))}
                placeholder="Search or pick a seniority level…"
                suggestions={SENIORITY_LEVELS}
                keepSelectedInList={true}
                allowCustom={false}
              />
              <HintLine>Pick from dropdown · <Kbd>⌫</Kbd> removes last</HintLine>
            </div>

            <PaneDivider />

            {/* Person Job Title */}
            <div>
              <FieldLabel hint="optional">Person Job Title</FieldLabel>
              <TagBox onClick={() => personJobTitleInputRef.current?.focus()}>
                {personJobTitles.map(tag => <Tag key={tag} label={tag} onRemove={() => setPersonJobTitles(p => p.filter(t => t !== tag))} />)}
                <input
                  ref={personJobTitleInputRef}
                  type="text"
                  value={personJobTitleInput}
                  onChange={e => setPersonJobTitleInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && personJobTitleInput.trim()) {
                      e.preventDefault();
                      const v = personJobTitleInput.trim();
                      if (!personJobTitles.includes(v)) setPersonJobTitles(p => [...p, v]);
                      setPersonJobTitleInput("");
                    } else if (e.key === "Backspace" && !personJobTitleInput && personJobTitles.length > 0) {
                      setPersonJobTitles(p => p.slice(0, -1));
                    }
                  }}
                  onBlur={() => {
                    if (personJobTitleInput.trim()) {
                      const v = personJobTitleInput.trim();
                      if (!personJobTitles.includes(v)) setPersonJobTitles(p => [...p, v]);
                      setPersonJobTitleInput("");
                    }
                  }}
                  placeholder={personJobTitles.length === 0 ? "e.g. Software Engineer, Product Manager…" : "Add more…"}
                  className="mf-bare flex-1 min-w-[120px] bg-transparent text-[14px] text-white outline-none py-0.5"
                />
              </TagBox>
              <HintLine>Type a title & press <Kbd>Enter</Kbd> · <Kbd>⌫</Kbd> removes last</HintLine>
            </div>

            <PaneDivider />

            {/* Results */}
            <div className="max-w-[180px]">
              <FieldLabel required hint="per function">Results</FieldLabel>
              <LineInput
                type="number" min="1" placeholder="10"
                value={resultsPerFunctionRaw}
                onChange={e => {
                  setResultsPerFunctionRaw(e.target.value);
                  const n = parseInt(e.target.value);
                  if (!isNaN(n) && n >= 1) setResultsPerFunction(n);
                }}
                onBlur={() => {
                  const n = parseInt(resultsPerFunctionRaw);
                  const valid = !isNaN(n) && n >= 1 ? n : 1;
                  setResultsPerFunction(valid);
                  setResultsPerFunctionRaw(String(valid));
                }}
              />
            </div>
          </div>
        </div>

        {/* ══ JOB SEARCH SECTION ══════════════════════════════════════════════ */}
        <div className="border-t border-[#1e4040]/55 bg-[#0a1818]">

          {/* Toggle header row */}
          <div className="px-7 py-4 flex items-center gap-3">
            <span className="text-[12px] font-black tracking-[0.3em] text-[#009da5]/80 tabular-nums">03</span>
            <div className="flex items-center gap-2">
              <Briefcase className="h-3.5 w-3.5 text-[#009da5]/80" />
              <span className="text-[16px] font-bold tracking-[0.16em] uppercase text-[#70e8e8]">Job Search</span>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-[#009da5]/20 to-transparent" />
            <ToggleSwitch
              on={includeJobSearch}
              onToggle={() => setIncludeJobSearch(v => !v)}
              label="Include job search?"
            />
          </div>

          {/* Collapsible content — CSS grid animation */}
          <div
            style={{
              display: "grid",
              gridTemplateRows: includeJobSearch ? "1fr" : "0fr",
              transition: "grid-template-rows 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            <div style={{ overflow: "hidden" }}>
              <div className="px-7 pb-8 pt-2">
                {/* Subtle top divider inside expanded area */}
                <div className="h-px bg-[#1a3535]/50 mb-6" />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                  {/* 1 — Job Titles */}
                  <div>
                    <FieldLabel hint="optional">Job Titles</FieldLabel>
                    <JobTitleInput
                      tags={jobTitles}
                      onAdd={v => { if (!jobTitles.includes(v)) setJobTitles(p => [...p, v]); }}
                      onRemove={v => setJobTitles(p => p.filter(t => t !== v))}
                    />
                    <HintLine>Type a job title & press <Kbd>Enter</Kbd> · <Kbd>⌫</Kbd> removes last</HintLine>
                  </div>

                  {/* 2 — Job Seniority */}
                  <div>
                    <FieldLabel hint="optional">Job Seniority</FieldLabel>
                    <TagBox onClick={() => jobSeniorityInputRef.current?.focus()}>
                      {jobSeniority.map(tag => <Tag key={tag} label={tag} onRemove={() => removeJobSeniorityTag(tag)} />)}
                      <input
                        ref={jobSeniorityInputRef}
                        type="text"
                        value={jobSeniorityInput}
                        onChange={e => setJobSeniorityInput(e.target.value)}
                        onKeyDown={handleJobSeniorityKeyDown}
                        onBlur={() => { if (jobSeniorityInput.trim()) addJobSeniorityTag(jobSeniorityInput); }}
                        placeholder={jobSeniority.length === 0 ? "e.g. Manager, Director…" : "Add more…"}
                        className="mf-bare flex-1 min-w-[100px] bg-transparent text-[14px] text-white outline-none py-0.5"
                      />
                    </TagBox>
                    {/* Quick presets */}
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {JOB_SENIORITY_PRESETS.map(level => {
                        const active = jobSeniority.includes(level);
                        return (
                          <button
                            key={level}
                            type="button"
                            onClick={() => active ? removeJobSeniorityTag(level) : addJobSeniorityTag(level)}
                            className={`px-2 py-0.5 rounded-md text-[12px] font-medium border transition-all duration-150 cursor-pointer active:scale-[0.97] focus-visible:outline-none ${
                              active
                                ? "bg-[#009da5]/18 text-[#58dddd] border-[#009da5]/45"
                                : "bg-transparent text-[#5a9090] border-[#254848] hover:border-[#009da5]/35 hover:text-[#7ab8b8]"
                            }`}
                          >
                            {level}
                          </button>
                        );
                      })}
                    </div>
                    <HintLine>Type & press <Kbd>Enter</Kbd> · Or click a preset below</HintLine>
                  </div>

                  {/* 3 — Date Posted */}
                  <div>
                    <FieldLabel>Date Posted</FieldLabel>
                    <div className="flex flex-col gap-2 mt-1">
                      {DATE_POSTED_OPTIONS.map(opt => {
                        const active = datePosted === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setDatePosted(opt.value)}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] font-medium border text-left transition-all duration-150 cursor-pointer focus-visible:outline-none ${
                              active
                                ? "bg-[#009da5]/16 text-[#58dddd] border-[#009da5]/42"
                                : "bg-transparent text-[#7ab8b8] border-[#254848] hover:border-[#009da5]/30 hover:text-[#9dd4d4]"
                            }`}
                          >
                            <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-150 ${
                              active ? "border-[#009da5]" : "border-[#3d6868]"
                            }`}>
                              {active && <div className="w-1.5 h-1.5 rounded-full bg-[#009da5]" />}
                            </div>
                            {opt.label}
                          </button>
                        );
                      })}

                      {/* Custom option */}
                      <div
                        onClick={() => {
                          setDatePosted("custom");
                          setTimeout(() => customDaysInputRef.current?.focus(), 50);
                        }}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] font-medium border text-left transition-all duration-150 cursor-pointer select-none ${
                          datePosted === "custom"
                            ? "bg-[#009da5]/16 text-[#58dddd] border-[#009da5]/42"
                            : "bg-transparent text-[#7ab8b8] border-[#254848] hover:border-[#009da5]/30 hover:text-[#9dd4d4]"
                        }`}
                      >
                        {/* Radio dot */}
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-150 ${
                          datePosted === "custom" ? "border-[#009da5]" : "border-[#3d6868]"
                        }`}>
                          {datePosted === "custom" && <div className="w-1.5 h-1.5 rounded-full bg-[#009da5]" />}
                        </div>

                        <span className="shrink-0">Custom: Past</span>

                        {/* Editable days input */}
                        {datePosted === "custom" ? (
                          <input
                            ref={customDaysInputRef}
                            type="number"
                            min="1"
                            max="365"
                            value={customDaysRaw}
                            onChange={e => {
                              setCustomDaysRaw(e.target.value);
                              const n = parseInt(e.target.value);
                              if (!isNaN(n) && n >= 1 && n <= 365) setCustomDays(n);
                            }}
                            onBlur={() => {
                              const n = parseInt(customDaysRaw);
                              const valid = !isNaN(n) && n >= 1 ? Math.min(365, n) : 1;
                              setCustomDays(valid);
                              setCustomDaysRaw(String(valid));
                            }}
                            onClick={e => e.stopPropagation()}
                            className="w-12 mx-0.5 text-center border border-[#009da5]/50 rounded-md text-[14px] text-[#58dddd] font-bold outline-none focus:border-[#009da5] px-1 py-0.5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            style={{ background: "#0a1f1f" }}
                          />
                        ) : (
                          <span className="mx-1 opacity-40 font-normal text-[12px]">—</span>
                        )}

                        <span className="shrink-0">days</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══ SUBMIT ROW ══════════════════════════════════════════════════════ */}
        <div className="border-t border-[#1e4040]/55 bg-[#060c0c] px-7 py-5">
          <button
            type="button"
            onClick={handleSubmit as any}
            disabled={!valid || loading}
            className={`
              w-full h-12 rounded-xl font-semibold text-[15px] tracking-wide
              transition-all duration-200
              disabled:opacity-25 disabled:cursor-not-allowed
              active:scale-[0.99] cursor-pointer
              flex items-center justify-center gap-2
              ${valid && !loading
                ? "bg-[#009da5] text-black hover:bg-[#00b2ba] shadow-[0_4px_16px_rgba(0,157,165,0.25)]"
                : "bg-white/[0.03] text-[#2e5252] border border-white/[0.05]"
              }
            `}
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
            ) : (
              <>Run Search<ArrowRight className="h-4 w-4" /></>
            )}
          </button>
        </div>

      </div>
    </>
  );
};
