import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Send, Sparkles, X, ChevronDown, Check, Search } from "lucide-react";
import { ProcessingStatus } from "./ProcessingStatus";
import { z } from "zod";

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Germany", "France",
  "India", "China", "Japan", "Brazil", "Mexico", "Spain", "Italy", "Netherlands",
  "Singapore", "Switzerland", "Sweden", "Norway", "Denmark", "Finland", "Belgium",
  "Austria", "Ireland", "Poland", "Czech Republic", "Portugal", "Greece", "Hungary",
  "Romania", "South Korea", "Malaysia", "Thailand", "Indonesia", "Philippines",
  "Vietnam", "United Arab Emirates", "Saudi Arabia", "Israel", "Turkey", "Egypt",
  "South Africa", "Nigeria", "Kenya", "Argentina", "Chile", "Colombia", "Peru"
].sort();

const SENIORITY_LEVELS = [
  "Owner", "Partner", "C-Suite (CXO)", "VP", "SVP", "EVP", "Director",
  "Senior Manager", "Manager", "Team Lead", "Senior", "Mid-Level",
  "Entry Level", "Intern", "Training"
];

const LINKEDIN_FUNCTIONS = [
  "Accounting", "Administrative", "Arts and Design", "Business Development",
  "Community and Social Services", "Consulting", "Education", "Engineering",
  "Entrepreneurship", "Finance", "Healthcare Services", "Human Resources",
  "Information Technology", "Legal", "Marketing", "Media and Communication",
  "Military and Protective Services", "Operations", "Product Management",
  "Program and Project Management", "Purchasing", "Quality Assurance",
  "Real Estate", "Research", "Sales", "Support"
].sort();

const formSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required"),
  domain: z.string().trim().min(1, "Domain name is required"),
  functions: z.array(z.string()),
  seniority: z.array(z.string()).min(1, "At least one seniority level must be selected"),
  geography: z.string(),
  resultsPerFunction: z.number().min(1, "Results per function must be at least 1"),
});

interface ManualFormProps {
  userId: string;
}

// ─── Reusable Tag Bubble ─────────────────────────────────────────────────────
const Tag = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <span className="tag-bubble inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/35 select-none whitespace-nowrap">
    {label}
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onRemove(); }}
      className="rounded-full hover:bg-primary/25 p-0.5 transition-colors duration-150 focus-visible:outline-none"
      aria-label={`Remove ${label}`}
    >
      <X className="h-2.5 w-2.5" />
    </button>
  </span>
);

// ─── Section label with optional hint ────────────────────────────────────────
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
  <div className="flex items-center justify-between mb-2">
    <div className="flex items-baseline gap-1.5">
      <Label className="text-sm font-semibold text-foreground tracking-tight">
        {children}
        {required && <span className="text-primary ml-0.5">*</span>}
      </Label>
      {hint && <span className="text-xs text-muted-foreground/60">{hint}</span>}
    </div>
    {action}
  </div>
);

// ─── Tag input wrapper (the shared "pill box" container) ──────────────────────
const TagInputBox = ({
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
      min-h-[46px] flex flex-wrap gap-1.5 items-center px-3 py-2
      border border-border rounded-xl
      bg-[hsl(202_35%_17%)]
      cursor-text
      transition-all duration-200
      focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/60
      hover:border-border/80
      ${className}
    `}
  >
    {children}
  </div>
);

// ─── Hint line beneath inputs ─────────────────────────────────────────────────
const HintLine = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] text-muted-foreground/55 mt-1.5 leading-relaxed">{children}</p>
);

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex items-center px-1 py-0.5 rounded text-[10px] bg-muted/60 border border-border/60 font-mono leading-none">
    {children}
  </kbd>
);

// ─────────────────────────────────────────────────────────────────────────────

export const ManualForm = ({ userId }: ManualFormProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Form fields
  const [companyName, setCompanyName] = useState("");
  const [domain, setDomain] = useState("");
  const [geography, setGeography] = useState("");
  const [resultsPerFunction, setResultsPerFunction] = useState<number>(10);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<"processing" | "completed" | "error" | "queued" | null>(null);

  // ── Functions tag-input state ──
  const [selectedFunctions, setSelectedFunctions] = useState<string[]>([]);
  const [functionInput, setFunctionInput] = useState("");
  const [functionDropdownOpen, setFunctionDropdownOpen] = useState(false);
  const [functionSearch, setFunctionSearch] = useState("");
  const functionDropdownRef = useRef<HTMLDivElement>(null);
  const functionInputRef = useRef<HTMLInputElement>(null);

  // ── Seniority tag-input state ──
  const [selectedSeniority, setSelectedSeniority] = useState<string[]>([]);
  const [seniorityInput, setSeniorityInput] = useState("");
  const seniorityInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
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

  // ── Functions helpers ──
  const addFunctionTag = (tag: string) => {
    const v = tag.trim();
    if (v && !selectedFunctions.includes(v)) setSelectedFunctions((p) => [...p, v]);
    setFunctionInput("");
  };
  const removeFunctionTag = (tag: string) => setSelectedFunctions((p) => p.filter((t) => t !== tag));
  const toggleFunctionFromDropdown = (func: string) => {
    if (selectedFunctions.includes(func)) removeFunctionTag(func);
    else addFunctionTag(func);
  };
  const handleFunctionKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && functionInput.trim()) {
      e.preventDefault();
      addFunctionTag(functionInput);
    } else if (e.key === "Backspace" && !functionInput && selectedFunctions.length > 0) {
      setSelectedFunctions((p) => p.slice(0, -1));
    } else if (e.key === "Escape") {
      setFunctionDropdownOpen(false);
    }
  };
  const filteredFunctions = LINKEDIN_FUNCTIONS.filter((f) =>
    f.toLowerCase().includes(functionSearch.toLowerCase())
  );

  // ── Seniority helpers ──
  const addSeniorityTag = (tag: string) => {
    const v = tag.trim();
    if (v && !selectedSeniority.includes(v)) setSelectedSeniority((p) => [...p, v]);
    setSeniorityInput("");
  };
  const removeSeniorityTag = (tag: string) => setSelectedSeniority((p) => p.filter((t) => t !== tag));
  const handleSeniorityPresetClick = (level: string) => {
    if (selectedSeniority.includes(level)) removeSeniorityTag(level);
    else addSeniorityTag(level);
    seniorityInputRef.current?.focus();
  };
  const handleSeniorityKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && seniorityInput.trim()) {
      e.preventDefault();
      addSeniorityTag(seniorityInput);
    } else if (e.key === "Backspace" && !seniorityInput && selectedSeniority.length > 0) {
      setSelectedSeniority((p) => p.slice(0, -1));
    }
  };
  const handleSelectAllSeniorities = () => {
    if (selectedSeniority.length === SENIORITY_LEVELS.length) setSelectedSeniority([]);
    else setSelectedSeniority([...SENIORITY_LEVELS]);
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
          user_id: userId,
          search_type: "manual",
          company_name: companyName.trim(),
          domain: domain.trim(),
          functions: selectedFunctions,
          seniority: selectedSeniority,
          geography,
          results_per_function: resultsPerFunction,
          status: "processing",
        })
        .select()
        .single();

      if (searchError) throw searchError;

      setSearchId(search.id);
      setProcessingStatus("processing");

      supabase.functions.invoke("trigger-n8n-webhook", {
        body: {
          searchId: search.id,
          entryType: "manual_entry",
          searchData: {
            search_id: search.id,
            company_name: companyName.trim(),
            domain: domain.trim(),
            functions: selectedFunctions,
            seniority: selectedSeniority,
            geography,
            results_per_function: resultsPerFunction,
            user_id: userId,
            search_type: "manual",
          },
        },
      }).catch((err) => console.error("N8N webhook trigger failed:", err));

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
          0%   { transform: scale(0.65); opacity: 0; }
          100% { transform: scale(1);    opacity: 1; }
        }
        .tag-bubble { animation: tagPop 0.14s cubic-bezier(0.34,1.56,0.64,1); }

        @keyframes dropDown {
          0%   { opacity: 0; transform: translateY(-6px) scaleY(0.96); }
          100% { opacity: 1; transform: translateY(0)  scaleY(1); }
        }
        .dropdown-panel { animation: dropDown 0.14s cubic-bezier(0.22,1,0.36,1); transform-origin: top; }
      `}</style>

      <Card className="border border-border/60 bg-card shadow-[0_8px_40px_hsl(202_55%_5%/0.5)] rounded-2xl overflow-hidden">
        {/* ── Card header with gradient accent line ── */}
        <div className="h-px w-full bg-gradient-to-r from-primary/0 via-primary/60 to-primary/0" />
        <CardHeader className="px-8 pt-7 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 border border-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-foreground tracking-tight">Single Search</CardTitle>
              <CardDescription className="text-sm text-muted-foreground mt-0.5">
                Enrich contacts from a specific company
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-8 pb-8">
          <form onSubmit={handleSubmit} className="space-y-7">

            {/* ── Row 1: Company + Domain ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <FieldLabel required>Company Name</FieldLabel>
                <Input
                  id="company"
                  type="text"
                  placeholder="Acme Corporation"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  className="h-11 rounded-xl border-border/70 bg-[hsl(202_35%_17%)] text-sm placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all duration-200"
                />
              </div>
              <div>
                <FieldLabel required>Domain</FieldLabel>
                <Input
                  id="domain"
                  type="text"
                  placeholder="acme.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  required
                  className="h-11 rounded-xl border-border/70 bg-[hsl(202_35%_17%)] text-sm placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all duration-200"
                />
              </div>
            </div>

            {/* ── Divider ── */}
            <div className="h-px bg-border/40" />

            {/* ── Functions — Tag input + dropdown ── */}
            <div>
              <FieldLabel hint="(optional)">Functions</FieldLabel>
              <div className="relative" ref={functionDropdownRef}>
                {/* Pill box */}
                <TagInputBox
                  className="pr-10"
                  onClick={() => functionInputRef.current?.focus()}
                >
                  {selectedFunctions.map((tag) => (
                    <Tag key={tag} label={tag} onRemove={() => removeFunctionTag(tag)} />
                  ))}
                  <input
                    ref={functionInputRef}
                    type="text"
                    value={functionInput}
                    onChange={(e) => setFunctionInput(e.target.value)}
                    onKeyDown={handleFunctionKeyDown}
                    onFocus={() => setFunctionDropdownOpen(true)}
                    placeholder={
                      selectedFunctions.length === 0
                        ? "Choose all that apply from the dropdown or type a functionality"
                        : "Add more…"
                    }
                    className="flex-1 min-w-[180px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/45 py-0.5 text-foreground"
                  />
                </TagInputBox>

                {/* Dropdown chevron toggle */}
                <button
                  type="button"
                  onClick={() => { setFunctionDropdownOpen((v) => !v); functionInputRef.current?.focus(); }}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200 focus-visible:outline-none ${functionDropdownOpen ? "rotate-180 text-primary" : ""}`}
                  aria-label="Toggle functions dropdown"
                >
                  <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                </button>

                {/* Dropdown panel */}
                {functionDropdownOpen && (
                  <div className="dropdown-panel absolute top-[calc(100%+6px)] left-0 right-0 z-50 rounded-xl border border-border/70 bg-popover shadow-[0_8px_32px_hsl(202_55%_5%/0.6)] overflow-hidden">
                    {/* Search bar inside dropdown */}
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50 bg-muted/20">
                      <Search className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                      <input
                        type="text"
                        value={functionSearch}
                        onChange={(e) => setFunctionSearch(e.target.value)}
                        placeholder="Search functions…"
                        className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground/50"
                      />
                      {functionSearch && (
                        <button type="button" onClick={() => setFunctionSearch("")} className="text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {/* Options list */}
                    <div className="max-h-52 overflow-y-auto py-1 px-1">
                      {filteredFunctions.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-center text-muted-foreground/50">No functions match "{functionSearch}"</p>
                      ) : (
                        filteredFunctions.map((func) => {
                          const active = selectedFunctions.includes(func);
                          return (
                            <button
                              key={func}
                              type="button"
                              onClick={() => toggleFunctionFromDropdown(func)}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg text-left transition-colors duration-150 ${
                                active
                                  ? "bg-primary/10 text-primary"
                                  : "text-foreground/80 hover:bg-muted/50 hover:text-foreground"
                              }`}
                            >
                              <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all duration-150 ${
                                active ? "bg-primary border-primary" : "border-border/60"
                              }`}>
                                {active && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                              </div>
                              {func}
                            </button>
                          );
                        })
                      )}
                    </div>

                    {/* Footer summary */}
                    {selectedFunctions.length > 0 && (
                      <div className="border-t border-border/40 px-3 py-2 flex items-center justify-between bg-muted/10">
                        <span className="text-xs text-muted-foreground/70">
                          {selectedFunctions.length} selected
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedFunctions([])}
                          className="text-xs text-muted-foreground/60 hover:text-destructive transition-colors duration-150"
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

            {/* ── Divider ── */}
            <div className="h-px bg-border/40" />

            {/* ── Seniority Level — Tag input + preset chips ── */}
            <div>
              <FieldLabel
                required
                action={
                  <button
                    type="button"
                    onClick={handleSelectAllSeniorities}
                    className={`text-[11px] px-2.5 py-1 rounded-lg font-medium border transition-all duration-200 ${
                      allSenioritiesSelected
                        ? "bg-primary/15 text-primary border-primary/40"
                        : "bg-muted/40 text-muted-foreground border-border/60 hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {allSenioritiesSelected ? "✓ All selected" : "Select all"}
                  </button>
                }
              >
                Seniority Level
              </FieldLabel>

              {/* Pill box */}
              <TagInputBox onClick={() => seniorityInputRef.current?.focus()}>
                {selectedSeniority.map((tag) => (
                  <Tag key={tag} label={tag} onRemove={() => removeSeniorityTag(tag)} />
                ))}
                <input
                  ref={seniorityInputRef}
                  type="text"
                  value={seniorityInput}
                  onChange={(e) => setSeniorityInput(e.target.value)}
                  onKeyDown={handleSeniorityKeyDown}
                  placeholder={selectedSeniority.length === 0 ? "Type a level & press Enter, or pick below…" : "Add more…"}
                  className="flex-1 min-w-[160px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/45 py-0.5 text-foreground"
                />
              </TagInputBox>

              {/* Preset chips */}
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {SENIORITY_LEVELS.map((level) => {
                  const active = selectedSeniority.includes(level);
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => handleSeniorityPresetClick(level)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95 ${
                        active
                          ? "bg-primary text-primary-foreground border-primary shadow-[0_0_10px_hsl(var(--primary)/0.3)]"
                          : "bg-muted/40 text-muted-foreground border-border/60 hover:border-primary/50 hover:text-foreground hover:bg-muted/70"
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

            {/* ── Divider ── */}
            <div className="h-px bg-border/40" />

            {/* ── Row 2: Results per function + Country ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <FieldLabel required hint="per function">Results</FieldLabel>
                <Input
                  id="resultsPerFunction"
                  type="number"
                  min="1"
                  placeholder="10"
                  value={resultsPerFunction}
                  onChange={(e) => setResultsPerFunction(parseInt(e.target.value) || 0)}
                  required
                  className="h-11 rounded-xl border-border/70 bg-[hsl(202_35%_17%)] text-sm placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all duration-200"
                />
              </div>

              <div>
                <FieldLabel hint="(optional)">Country</FieldLabel>
                <Select value={geography} onValueChange={setGeography}>
                  <SelectTrigger
                    id="geography"
                    className="h-11 rounded-xl border-border/70 bg-[hsl(202_35%_17%)] text-sm focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all duration-200 data-[placeholder]:text-muted-foreground/50"
                  >
                    <SelectValue placeholder="Select a country" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border/70 rounded-xl shadow-[0_8px_32px_hsl(202_55%_5%/0.6)]">
                    {COUNTRIES.map((country) => (
                      <SelectItem key={country} value={country} className="rounded-lg text-sm">
                        {country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Submit ── */}
            <Button
              type="submit"
              className="w-full h-12 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold text-sm tracking-wide hover:opacity-90 hover:shadow-[0_0_24px_hsl(var(--primary)/0.4)] active:scale-[0.99] transition-all duration-200 disabled:opacity-40"
              disabled={!isFormValid() || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Submit Request
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
};
