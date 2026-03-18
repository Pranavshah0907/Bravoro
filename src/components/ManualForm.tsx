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

type DatePosted = "anytime" | "past_24h" | "past_week" | "past_month";

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
    <span className="text-[10px] font-black tracking-[0.3em] text-[#009da5]/70 shrink-0 tabular-nums">{num}</span>
    <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#58dddd] shrink-0">{children}</span>
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
      <span className="text-[11px] font-bold text-[#9dd4d4] tracking-[0.08em] uppercase">
        {children}
        {required && <span className="text-[#00c8d2] ml-0.5">*</span>}
      </span>
      {hint && <span className="text-[11px] text-[#4a7878] normal-case tracking-normal font-normal">{hint}</span>}
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
      text-[15px] text-white
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
    <span className={`tag-bubble inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border select-none whitespace-nowrap ${colors}`}>
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
    <span className={`text-[11.5px] font-semibold tracking-wide transition-colors duration-200 ${on ? "text-[#58dddd]" : "text-[#6aacac] group-hover:text-[#88c4c4]"}`}>
      {label}
    </span>
    <div className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-250 ${on ? "bg-[#009da5]" : "bg-[#1e3d3d] group-hover:bg-[#254848]"}`}>
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${on ? "translate-x-4" : "translate-x-0"}`} />
    </div>
  </button>
);

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-[#0d2020] border border-[#254848] font-mono text-[#5a9898] leading-none">{children}</kbd>
);

const HintLine = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10.5px] text-[#4d8080] mt-1.5 leading-relaxed">{children}</p>
);

const PaneDivider = () => <div className="h-px bg-[#1a3535]" />;

// Reusable searchable tag-dropdown input (used for Functions and Job Departments)
const TagDropdownInput = ({
  selected, onAdd, onRemove,
  placeholder, suggestions, tagVariant = "teal",
}: {
  selected: string[];
  onAdd: (val: string) => void;
  onRemove: (val: string) => void;
  placeholder: string;
  suggestions: string[];
  tagVariant?: "teal" | "violet";
}) => {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault(); addTag(input);
    } else if (e.key === "Backspace" && !input && selected.length > 0) {
      onRemove(selected[selected.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const filtered = suggestions.filter(s =>
    s.toLowerCase().includes(search.toLowerCase()) && !selected.includes(s)
  );

  const accentClass = tagVariant === "violet"
    ? "border-[#7c3aed]/30 bg-[#7c3aed]/08 text-[#a78bfa]"
    : "border-[#009da5]/30 bg-[#009da5]/08 text-[#58dddd]";
  const checkBg = tagVariant === "violet" ? "bg-[#7c3aed] border-[#7c3aed]" : "bg-[#009da5] border-[#009da5]";
  const checkBorder = tagVariant === "violet" ? "border-[#2a1a4a]" : "border-[#1a3838]";

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
          placeholder={selected.length === 0 ? placeholder : "Add more…"}
          className="mf-bare flex-1 min-w-[120px] bg-transparent text-[13px] text-white outline-none py-0.5"
        />
      </TagBox>

      <button
        type="button"
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
              className="mf-bare flex-1 bg-transparent text-[13px] text-white outline-none"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-[#2e5c5c] hover:text-[#3d8080] transition-colors">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="max-h-44 overflow-y-auto py-1 px-1.5">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-xs text-center text-[#4d8080]">
                {search ? `No match — press Enter to add "${search}"` : "All suggestions selected"}
              </p>
            ) : (
              filtered.map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => { onAdd(item); setOpen(true); inputRef.current?.focus(); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-[13px] rounded-lg text-left text-[#88c4c4] hover:bg-white/[0.05] hover:text-white transition-colors duration-150"
                >
                  <div className={`w-[15px] h-[15px] rounded-[4px] border flex items-center justify-center shrink-0 ${checkBorder}`} />
                  {item}
                </button>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-[#1a3535]/60 px-3.5 py-2 flex items-center justify-between bg-[#091616]">
              <span className="text-[11px] text-[#5a9898] font-medium">{selected.length} selected</span>
              <button type="button" onClick={() => selected.forEach(s => onRemove(s))} className="text-[11px] text-[#4d8080] hover:text-red-400 transition-colors font-medium">Clear all</button>
            </div>
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
  const [searchId, setSearchId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<"processing" | "completed" | "error" | "queued" | null>(null);

  // Functions state
  const [selectedFunctions, setSelectedFunctions] = useState<string[]>([]);

  // Seniority state
  const [selectedSeniority, setSelectedSeniority] = useState<string[]>([]);

  // Job search state
  const [includeJobSearch, setIncludeJobSearch] = useState(false);
  const [jobDepartments, setJobDepartments] = useState<string[]>([]);
  const [jobSeniority, setJobSeniority] = useState<string[]>([]);
  const [jobSeniorityInput, setJobSeniorityInput] = useState("");
  const [datePosted, setDatePosted] = useState<DatePosted>("anytime");
  const jobSeniorityInputRef = useRef<HTMLInputElement>(null);

  // Seniority helpers
  const removeSeniorityTag = (tag: string) => setSelectedSeniority(p => p.filter(t => t !== tag));
  const handleSeniorityPresetClick = (level: string) => {
    setSelectedSeniority(p => p.includes(level) ? p.filter(t => t !== level) : [...p, level]);
  };
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
    if ((e.key === "Enter" || e.key === ",") && jobSeniorityInput.trim()) {
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
      setSearchId(search.id);
      setProcessingStatus("processing");

      const searchData: Record<string, unknown> = {
        search_id: search.id,
        company_name: companyName.trim(),
        domain: domain.trim(),
        functions: selectedFunctions,
        seniority: selectedSeniority,
        geography,
        results_per_function: resultsPerFunction,
        user_id: userId,
        search_type: "manual",
        job_search_enabled: includeJobSearch,
      };

      if (includeJobSearch) {
        searchData.job_search = {
          departments: jobDepartments,
          seniority: jobSeniority,
          date_posted: datePosted,
        };
      }

      supabase.functions.invoke("trigger-n8n-webhook", {
        body: { searchId: search.id, entryType: "manual_entry", searchData },
      }).catch(err => console.error("N8N webhook trigger failed:", err));

      toast({ title: "Request Submitted", description: "Your lead enrichment request is being processed" });
    } catch (error: any) {
      toast({ title: "Submission Failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setCompanyName(""); setDomain(""); setSelectedFunctions([]); setSelectedSeniority([]);
    setGeography(""); setResultsPerFunction(10); setSearchId(null); setProcessingStatus(null);
    setIncludeJobSearch(false); setJobDepartments([]); setJobSeniority([]); setDatePosted("anytime");
  };

  if (searchId && processingStatus) {
    return <ProcessingStatus searchId={searchId} onReset={handleReset} />;
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
                <SelectTrigger className="h-auto py-2.5 px-0 w-full bg-transparent border-0 border-b border-[#254848] text-[15px] text-white rounded-none shadow-none outline-none ring-0 ring-offset-0 focus:ring-0 focus:ring-offset-0 focus:border-[#009da5] data-[placeholder]:text-[#3a6060] [&>svg]:text-[#5a9898] [&>svg]:opacity-80 transition-colors duration-200">
                  <SelectValue placeholder="Select a country" />
                </SelectTrigger>
                <SelectContent className="bg-[#0c1d1d] border border-[#1a3535] rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.75)] max-h-64">
                  {COUNTRIES.map(country => (
                    <SelectItem key={country} value={country} className="text-[13px] text-[#88c0c0] rounded-lg focus:bg-[#009da5]/15 focus:text-[#58dddd] cursor-pointer">
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-auto pt-4 flex items-center gap-2 opacity-55">
              <div className="w-5 h-px bg-[#009da5]" />
              <span className="text-[11px] text-[#009da5] tracking-[0.12em]">* required</span>
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
                    className={`text-[11px] px-2.5 py-1 rounded-md font-semibold border transition-colors duration-200 cursor-pointer ${
                      allSenioritiesSelected
                        ? "bg-[#009da5]/16 text-[#58dddd] border-[#009da5]/40"
                        : "bg-transparent text-[#6aacac] border-[#254848] hover:border-[#009da5]/40 hover:text-[#58dddd]"
                    }`}
                  >
                    {allSenioritiesSelected ? "✓ All selected" : "Select all"}
                  </button>
                }
              >
                Seniority Level
              </FieldLabel>

              {selectedSeniority.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {selectedSeniority.map(tag => <Tag key={tag} label={tag} onRemove={() => removeSeniorityTag(tag)} />)}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {SENIORITY_LEVELS.map(level => {
                  const active = selectedSeniority.includes(level);
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => handleSeniorityPresetClick(level)}
                      className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-all duration-150 cursor-pointer active:scale-[0.97] focus-visible:outline-none ${
                        active
                          ? "bg-[#009da5]/18 text-[#58dddd] border-[#009da5]/45"
                          : "bg-transparent text-[#6aacac] border-[#254848] hover:border-[#009da5]/35 hover:text-[#88c4c4]"
                      }`}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
              <HintLine>Click to toggle · Selected levels appear as tags above</HintLine>
            </div>

            <PaneDivider />

            {/* Results */}
            <div className="max-w-[180px]">
              <FieldLabel required hint="per function">Results</FieldLabel>
              <LineInput
                type="number" min="1" placeholder="10"
                value={resultsPerFunction}
                onChange={e => setResultsPerFunction(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>

        {/* ══ JOB SEARCH SECTION ══════════════════════════════════════════════ */}
        <div className="border-t border-[#1e4040]/55 bg-[#0a1818]">

          {/* Toggle header row */}
          <div className="px-7 py-4 flex items-center gap-3">
            <span className="text-[10px] font-black tracking-[0.3em] text-[#009da5]/70 tabular-nums">03</span>
            <div className="flex items-center gap-2">
              <Briefcase className="h-3.5 w-3.5 text-[#009da5]/70" />
              <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#58dddd]">Job Search</span>
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

                  {/* 1 — Departments */}
                  <div>
                    <FieldLabel hint="optional">Departments</FieldLabel>
                    <TagDropdownInput
                      selected={jobDepartments}
                      onAdd={v => { if (!jobDepartments.includes(v)) setJobDepartments(p => [...p, v]); }}
                      onRemove={v => setJobDepartments(p => p.filter(t => t !== v))}
                      placeholder="e.g. Sales, Marketing…"
                      suggestions={JOB_DEPARTMENTS}
                      tagVariant="teal"
                    />
                    <HintLine>Suggestions from dropdown · Press <Kbd>Enter</Kbd> or <Kbd>,</Kbd> to add</HintLine>
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
                        placeholder={jobSeniority.length === 0 ? "e.g. Manager, Director…" : "Add more…"}
                        className="mf-bare flex-1 min-w-[100px] bg-transparent text-[13px] text-white outline-none py-0.5"
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
                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition-all duration-150 cursor-pointer active:scale-[0.97] focus-visible:outline-none ${
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
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium border text-left transition-all duration-150 cursor-pointer focus-visible:outline-none ${
                              active
                                ? "bg-[#009da5]/16 text-[#58dddd] border-[#009da5]/42"
                                : "bg-transparent text-[#7ab8b8] border-[#254848] hover:border-[#009da5]/30 hover:text-[#9dd4d4]"
                            }`}
                          >
                            {/* Radio dot */}
                            <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-150 ${
                              active ? "border-[#009da5]" : "border-[#3d6868]"
                            }`}>
                              {active && <div className="w-1.5 h-1.5 rounded-full bg-[#009da5]" />}
                            </div>
                            {opt.label}
                          </button>
                        );
                      })}
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
              w-full h-11 rounded-xl font-semibold text-[13px] tracking-wide
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
