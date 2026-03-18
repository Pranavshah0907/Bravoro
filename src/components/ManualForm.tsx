import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Send, Zap, X, ChevronDown, Check, Search } from "lucide-react";
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

const formSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required"),
  domain: z.string().trim().min(1, "Domain name is required"),
  functions: z.array(z.string()),
  seniority: z.array(z.string()).min(1, "At least one seniority level must be selected"),
  geography: z.string(),
  resultsPerFunction: z.number().min(1, "Results per function must be at least 1"),
});

interface ManualFormProps { userId: string; }

// ── Design tokens (black + electric teal) ─────────────────────────────────────
// Black base:   #060d0d  (card)  |  #0a1414  (input)  |  #0d1c1c  (elevated)
// Teal primary: #009da5          |  Teal bright: #58dddd
// Border rest:  #102828          |  Border focus: #009da5
// Text:         #edfafa (primary) | #009da5 (teal-tinted secondary) | #3d8080 (hint)

// ── Sub-components ────────────────────────────────────────────────────────────

const FieldLabel = ({
  children,
  required,
  hint,
  action,
}: {
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
  action?: React.ReactNode;
}) => (
  <div className="flex items-center justify-between mb-2.5">
    <div className="flex items-baseline gap-2">
      <span className="text-[13px] font-semibold text-[#edfafa] tracking-wide uppercase letter-spacing-wider">
        {children}
        {required && <span className="text-[#58dddd] ml-0.5">*</span>}
      </span>
      {hint && <span className="text-[11px] text-[#2e6666] normal-case tracking-normal font-normal">{hint}</span>}
    </div>
    {action}
  </div>
);

const Tag = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <span className="tag-bubble inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11.5px] font-semibold bg-[#009da5]/12 text-[#58dddd] border border-[#009da5]/40 select-none whitespace-nowrap">
    {label}
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onRemove(); }}
      className="rounded-full p-0.5 hover:bg-[#009da5]/25 transition-colors duration-150 focus-visible:outline-none text-[#58dddd]/70 hover:text-[#58dddd]"
    >
      <X className="h-2.5 w-2.5" />
    </button>
  </span>
);

const TagBox = ({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) => (
  <div
    onClick={onClick}
    className={`
      min-h-[48px] flex flex-wrap gap-1.5 items-center px-3.5 py-2.5
      border border-[#102828] rounded-xl
      bg-[#0a1414]
      cursor-text
      transition-all duration-200
      focus-within:border-[#009da5] focus-within:shadow-[0_0_0_3px_#009da520,0_0_20px_#009da510]
      hover:border-[#1a3838]
      ${className}
    `}
  >
    {children}
  </div>
);

const HintLine = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] text-[#2e5c5c] mt-2 leading-relaxed">{children}</p>
);

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] bg-[#0d1c1c] border border-[#102828] font-mono text-[#3d8080] leading-none">
    {children}
  </kbd>
);

const Divider = () => (
  <div className="relative h-px">
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#102828] to-transparent" />
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
export const ManualForm = ({ userId }: ManualFormProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [domain, setDomain] = useState("");
  const [geography, setGeography] = useState("");
  const [resultsPerFunction, setResultsPerFunction] = useState<number>(10);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<"processing"|"completed"|"error"|"queued"|null>(null);

  // Functions state
  const [selectedFunctions, setSelectedFunctions] = useState<string[]>([]);
  const [functionInput, setFunctionInput] = useState("");
  const [functionDropdownOpen, setFunctionDropdownOpen] = useState(false);
  const [functionSearch, setFunctionSearch] = useState("");
  const functionDropdownRef = useRef<HTMLDivElement>(null);
  const functionInputRef = useRef<HTMLInputElement>(null);

  // Seniority state
  const [selectedSeniority, setSelectedSeniority] = useState<string[]>([]);
  const [seniorityInput, setSeniorityInput] = useState("");
  const seniorityInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (functionDropdownRef.current && !functionDropdownRef.current.contains(e.target as Node)) {
        setFunctionDropdownOpen(false);
        setFunctionSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Functions helpers
  const addFunctionTag = (tag: string) => {
    const v = tag.trim();
    if (v && !selectedFunctions.includes(v)) setSelectedFunctions(p => [...p, v]);
    setFunctionInput("");
  };
  const removeFunctionTag = (tag: string) => setSelectedFunctions(p => p.filter(t => t !== tag));
  const toggleFunctionFromDropdown = (func: string) => {
    selectedFunctions.includes(func) ? removeFunctionTag(func) : addFunctionTag(func);
  };
  const handleFunctionKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && functionInput.trim()) {
      e.preventDefault(); addFunctionTag(functionInput);
    } else if (e.key === "Backspace" && !functionInput && selectedFunctions.length > 0) {
      setSelectedFunctions(p => p.slice(0, -1));
    } else if (e.key === "Escape") {
      setFunctionDropdownOpen(false);
    }
  };
  const filteredFunctions = LINKEDIN_FUNCTIONS.filter(f =>
    f.toLowerCase().includes(functionSearch.toLowerCase())
  );

  // Seniority helpers
  const addSeniorityTag = (tag: string) => {
    const v = tag.trim();
    if (v && !selectedSeniority.includes(v)) setSelectedSeniority(p => [...p, v]);
    setSeniorityInput("");
  };
  const removeSeniorityTag = (tag: string) => setSelectedSeniority(p => p.filter(t => t !== tag));
  const handleSeniorityPresetClick = (level: string) => {
    selectedSeniority.includes(level) ? removeSeniorityTag(level) : addSeniorityTag(level);
    seniorityInputRef.current?.focus();
  };
  const handleSeniorityKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && seniorityInput.trim()) {
      e.preventDefault(); addSeniorityTag(seniorityInput);
    } else if (e.key === "Backspace" && !seniorityInput && selectedSeniority.length > 0) {
      setSelectedSeniority(p => p.slice(0, -1));
    }
  };
  const handleSelectAllSeniorities = () => {
    selectedSeniority.length === SENIORITY_LEVELS.length
      ? setSelectedSeniority([])
      : setSelectedSeniority([...SENIORITY_LEVELS]);
  };
  const allSenioritiesSelected = selectedSeniority.length === SENIORITY_LEVELS.length;

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

      supabase.functions.invoke("trigger-n8n-webhook", {
        body: {
          searchId: search.id, entryType: "manual_entry",
          searchData: {
            search_id: search.id, company_name: companyName.trim(), domain: domain.trim(),
            functions: selectedFunctions, seniority: selectedSeniority, geography,
            results_per_function: resultsPerFunction, user_id: userId, search_type: "manual",
          },
        },
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
  };

  if (searchId && processingStatus) {
    return <ProcessingStatus searchId={searchId} onReset={handleReset} />;
  }

  return (
    <>
      <style>{`
        @keyframes tagPop {
          0%   { transform: scale(0.6) translateY(4px); opacity: 0; }
          100% { transform: scale(1)   translateY(0);   opacity: 1; }
        }
        .tag-bubble { animation: tagPop 0.16s cubic-bezier(0.34,1.56,0.64,1); }

        @keyframes dropDown {
          0%   { opacity: 0; transform: translateY(-8px) scaleY(0.94); }
          100% { opacity: 1; transform: translateY(0)   scaleY(1); }
        }
        .fn-dropdown { animation: dropDown 0.16s cubic-bezier(0.22,1,0.36,1); transform-origin: top; }

        .mf-input::placeholder { color: #2e5c5c; }
        .mf-input::-webkit-input-placeholder { color: #2e5c5c; }

        .chip-active-glow {
          box-shadow: 0 0 0 1px #009da5, 0 0 14px #009da530, inset 0 1px 0 #58dddd30;
        }
        .submit-glow:not(:disabled):hover {
          box-shadow: 0 0 30px #009da540, 0 0 60px #009da520;
        }
        .card-glow-top {
          background: radial-gradient(ellipse 60% 120px at 50% 0%, #009da512, transparent);
        }
      `}</style>

      {/* ── Card ── */}
      <div className="relative rounded-2xl overflow-hidden border border-[#102828] bg-[#060d0d] shadow-[0_20px_80px_#000000a0,0_0_0_1px_#0d2222]">

        {/* Top glow atmosphere */}
        <div className="card-glow-top absolute inset-x-0 top-0 h-32 pointer-events-none" />

        {/* Accent line */}
        <div className="h-[1.5px] w-full bg-gradient-to-r from-transparent via-[#009da5] to-transparent opacity-70" />

        {/* Header */}
        <div className="px-8 pt-7 pb-6 relative">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#009da5]/10 border border-[#009da5]/25 shadow-[0_0_20px_#009da520]">
              <Zap className="h-4.5 w-4.5 text-[#58dddd]" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-white tracking-tight leading-tight">Single Search</h2>
              <p className="text-[12.5px] text-[#3d8080] mt-0.5 font-medium">Enrich contacts from a specific company</p>
            </div>
          </div>
        </div>

        {/* Form body */}
        <div className="px-8 pb-8 space-y-6">

          {/* ── Company + Domain ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Company Name</FieldLabel>
              <input
                type="text"
                placeholder="Acme Corporation"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                required
                className="mf-input w-full h-11 px-3.5 rounded-xl border border-[#102828] bg-[#0a1414] text-[13.5px] text-[#edfafa] outline-none transition-all duration-200 focus:border-[#009da5] focus:shadow-[0_0_0_3px_#009da520,0_0_20px_#009da510] hover:border-[#1a3838]"
              />
            </div>
            <div>
              <FieldLabel required>Domain</FieldLabel>
              <input
                type="text"
                placeholder="acme.com"
                value={domain}
                onChange={e => setDomain(e.target.value)}
                required
                className="mf-input w-full h-11 px-3.5 rounded-xl border border-[#102828] bg-[#0a1414] text-[13.5px] text-[#edfafa] outline-none transition-all duration-200 focus:border-[#009da5] focus:shadow-[0_0_0_3px_#009da520,0_0_20px_#009da510] hover:border-[#1a3838]"
              />
            </div>
          </div>

          <Divider />

          {/* ── Functions ── */}
          <div>
            <FieldLabel hint="optional">Functions</FieldLabel>
            <div className="relative" ref={functionDropdownRef}>

              {/* Pill box */}
              <TagBox className="pr-10" onClick={() => functionInputRef.current?.focus()}>
                {selectedFunctions.map(tag => (
                  <Tag key={tag} label={tag} onRemove={() => removeFunctionTag(tag)} />
                ))}
                <input
                  ref={functionInputRef}
                  type="text"
                  value={functionInput}
                  onChange={e => setFunctionInput(e.target.value)}
                  onKeyDown={handleFunctionKeyDown}
                  onFocus={() => setFunctionDropdownOpen(true)}
                  placeholder={selectedFunctions.length === 0
                    ? "Choose all that apply from the dropdown or type a functionality"
                    : "Add more…"}
                  className="mf-input flex-1 min-w-[180px] bg-transparent text-[13px] text-[#edfafa] outline-none py-0.5"
                />
              </TagBox>

              {/* Chevron */}
              <button
                type="button"
                onClick={() => { setFunctionDropdownOpen(v => !v); functionInputRef.current?.focus(); }}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all duration-200 focus-visible:outline-none ${
                  functionDropdownOpen
                    ? "text-[#58dddd] rotate-180 bg-[#009da5]/10"
                    : "text-[#3d8080] hover:text-[#58dddd] hover:bg-[#009da5]/10"
                }`}
              >
                <ChevronDown className="h-4 w-4 transition-transform duration-200" />
              </button>

              {/* Dropdown panel */}
              {functionDropdownOpen && (
                <div className="fn-dropdown absolute top-[calc(100%+6px)] left-0 right-0 z-50 rounded-xl border border-[#102828] bg-[#060d0d] shadow-[0_16px_48px_#000000c0,0_0_0_1px_#0d2222] overflow-hidden">

                  {/* Search */}
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[#102828] bg-[#0a1414]/60">
                    <Search className="h-3.5 w-3.5 text-[#3d8080] shrink-0" />
                    <input
                      type="text"
                      value={functionSearch}
                      onChange={e => setFunctionSearch(e.target.value)}
                      placeholder="Search functions…"
                      className="mf-input flex-1 bg-transparent text-[13px] text-[#edfafa] outline-none"
                    />
                    {functionSearch && (
                      <button type="button" onClick={() => setFunctionSearch("")} className="text-[#2e5c5c] hover:text-[#3d8080] transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* List */}
                  <div className="max-h-52 overflow-y-auto py-1 px-1.5">
                    {filteredFunctions.length === 0 ? (
                      <p className="px-3 py-5 text-xs text-center text-[#2e5c5c]">No match for "{functionSearch}"</p>
                    ) : (
                      filteredFunctions.map(func => {
                        const active = selectedFunctions.includes(func);
                        return (
                          <button
                            key={func}
                            type="button"
                            onClick={() => toggleFunctionFromDropdown(func)}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-[13px] rounded-lg text-left transition-all duration-150 ${
                              active
                                ? "bg-[#009da5]/10 text-[#58dddd]"
                                : "text-[#7ab8b8] hover:bg-[#0d1c1c] hover:text-[#edfafa]"
                            }`}
                          >
                            <div className={`w-[15px] h-[15px] rounded-[4px] border flex items-center justify-center shrink-0 transition-all duration-150 ${
                              active ? "bg-[#009da5] border-[#009da5]" : "border-[#1a3838]"
                            }`}>
                              {active && <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />}
                            </div>
                            {func}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Footer */}
                  {selectedFunctions.length > 0 && (
                    <div className="border-t border-[#102828] px-3.5 py-2 flex items-center justify-between bg-[#0a1414]/50">
                      <span className="text-[11px] text-[#3d8080] font-medium">
                        {selectedFunctions.length} selected
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedFunctions([])}
                        className="text-[11px] text-[#2e5c5c] hover:text-red-400 transition-colors font-medium"
                      >
                        Clear all
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <HintLine>
              Pick from the list · Or type a custom function and press <Kbd>Enter</Kbd> · <Kbd>⌫</Kbd> removes the last tag
            </HintLine>
          </div>

          <Divider />

          {/* ── Seniority ── */}
          <div>
            <FieldLabel
              required
              action={
                <button
                  type="button"
                  onClick={handleSelectAllSeniorities}
                  className={`text-[11px] px-3 py-1 rounded-lg font-semibold border transition-all duration-200 ${
                    allSenioritiesSelected
                      ? "bg-[#009da5]/15 text-[#58dddd] border-[#009da5]/50 shadow-[0_0_10px_#009da520]"
                      : "bg-transparent text-[#3d8080] border-[#102828] hover:border-[#009da5]/40 hover:text-[#58dddd]"
                  }`}
                >
                  {allSenioritiesSelected ? "✓ All selected" : "Select all"}
                </button>
              }
            >
              Seniority Level
            </FieldLabel>

            {/* Pill box */}
            <TagBox onClick={() => seniorityInputRef.current?.focus()}>
              {selectedSeniority.map(tag => (
                <Tag key={tag} label={tag} onRemove={() => removeSeniorityTag(tag)} />
              ))}
              <input
                ref={seniorityInputRef}
                type="text"
                value={seniorityInput}
                onChange={e => setSeniorityInput(e.target.value)}
                onKeyDown={handleSeniorityKeyDown}
                placeholder={selectedSeniority.length === 0 ? "Type a level & press Enter, or pick below…" : "Add more…"}
                className="mf-input flex-1 min-w-[160px] bg-transparent text-[13px] text-[#edfafa] outline-none py-0.5"
              />
            </TagBox>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {SENIORITY_LEVELS.map(level => {
                const active = selectedSeniority.includes(level);
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => handleSeniorityPresetClick(level)}
                    className={`px-3 py-[5px] rounded-full text-[11.5px] font-semibold border transition-all duration-200 focus-visible:outline-none active:scale-95 ${
                      active
                        ? "bg-[#009da5] text-black border-[#009da5] chip-active-glow"
                        : "bg-transparent text-[#009da5]/70 border-[#102828] hover:border-[#009da5]/50 hover:text-[#58dddd] hover:bg-[#009da5]/5"
                    }`}
                  >
                    {active ? `✓ ${level}` : level}
                  </button>
                );
              })}
            </div>

            <HintLine>
              Click a level to toggle it · Type a custom level and press <Kbd>Enter</Kbd> · <Kbd>⌫</Kbd> removes the last tag
            </HintLine>
          </div>

          <Divider />

          {/* ── Results + Country ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel required hint="per function">Results</FieldLabel>
              <input
                type="number"
                min="1"
                placeholder="10"
                value={resultsPerFunction}
                onChange={e => setResultsPerFunction(parseInt(e.target.value) || 0)}
                required
                className="mf-input w-full h-11 px-3.5 rounded-xl border border-[#102828] bg-[#0a1414] text-[13.5px] text-[#edfafa] outline-none transition-all duration-200 focus:border-[#009da5] focus:shadow-[0_0_0_3px_#009da520,0_0_20px_#009da510] hover:border-[#1a3838]"
              />
            </div>
            <div>
              <FieldLabel hint="optional">Country</FieldLabel>
              <Select value={geography} onValueChange={setGeography}>
                <SelectTrigger className="h-11 rounded-xl border border-[#102828] bg-[#0a1414] text-[13.5px] text-[#edfafa] outline-none transition-all duration-200 hover:border-[#1a3838] focus:border-[#009da5] focus:ring-0 focus:shadow-[0_0_0_3px_#009da520] data-[placeholder]:text-[#2e5c5c]">
                  <SelectValue placeholder="Select a country" className="text-[#2e5c5c]" />
                </SelectTrigger>
                <SelectContent className="bg-[#060d0d] border border-[#102828] rounded-xl shadow-[0_16px_48px_#000000c0] text-[#edfafa]">
                  {COUNTRIES.map(country => (
                    <SelectItem
                      key={country}
                      value={country}
                      className="text-[13px] text-[#7ab8b8] rounded-lg hover:bg-[#0d1c1c] hover:text-[#edfafa] focus:bg-[#009da5]/10 focus:text-[#58dddd] cursor-pointer"
                    >
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Submit ── */}
          <button
            type="button"
            onClick={handleSubmit as any}
            disabled={!isFormValid() || loading}
            className="submit-glow w-full h-12 rounded-xl font-bold text-[13.5px] tracking-wide transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.99] relative overflow-hidden"
            style={{
              background: isFormValid() && !loading
                ? "linear-gradient(135deg, #009da5 0%, #00bfc8 50%, #58dddd 100%)"
                : "#0a1414",
              color: isFormValid() && !loading ? "#000" : "#2e5c5c",
              border: `1px solid ${isFormValid() && !loading ? "#009da5" : "#102828"}`,
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Send className="h-4 w-4" />
                Submit Request
              </span>
            )}
          </button>

        </div>
      </div>
    </>
  );
};
