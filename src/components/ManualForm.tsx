import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Send, Sparkles, X } from "lucide-react";
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

export const ManualForm = ({ userId }: ManualFormProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [domain, setDomain] = useState("");
  const [selectedFunctions, setSelectedFunctions] = useState<string[]>([]);
  const [selectedSeniority, setSelectedSeniority] = useState<string[]>([]);
  const [seniorityInput, setSeniorityInput] = useState("");
  const seniorityInputRef = useRef<HTMLInputElement>(null);
  const [geography, setGeography] = useState("");
  const [resultsPerFunction, setResultsPerFunction] = useState<number>(10);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<"processing" | "completed" | "error" | "queued" | null>(null);

  const handleFunctionToggle = (func: string) => {
    setSelectedFunctions((prev) =>
      prev.includes(func) ? prev.filter((f) => f !== func) : [...prev, func]
    );
  };

  const addSeniorityTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !selectedSeniority.includes(trimmed)) {
      setSelectedSeniority((prev) => [...prev, trimmed]);
    }
    setSeniorityInput("");
  };

  const removeSeniorityTag = (tag: string) => {
    setSelectedSeniority((prev) => prev.filter((t) => t !== tag));
  };

  const handleSeniorityPresetClick = (level: string) => {
    if (selectedSeniority.includes(level)) {
      removeSeniorityTag(level);
    } else {
      addSeniorityTag(level);
    }
    seniorityInputRef.current?.focus();
  };

  const handleSeniorityKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && seniorityInput.trim()) {
      e.preventDefault();
      addSeniorityTag(seniorityInput);
    } else if (e.key === "Backspace" && !seniorityInput && selectedSeniority.length > 0) {
      setSelectedSeniority((prev) => prev.slice(0, -1));
    }
  };

  const handleSelectAllSeniorities = () => {
    if (selectedSeniority.length === SENIORITY_LEVELS.length) {
      setSelectedSeniority([]);
    } else {
      setSelectedSeniority([...SENIORITY_LEVELS]);
    }
  };

  const allSenioritiesSelected = selectedSeniority.length === SENIORITY_LEVELS.length;

  const isFormValid = () => {
    return companyName.trim() && domain.trim() && selectedSeniority.length > 0 && resultsPerFunction > 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Validate form
      formSchema.parse({
        companyName,
        domain,
        functions: selectedFunctions,
        seniority: selectedSeniority,
        geography,
        resultsPerFunction,
      });

      setLoading(true);

      // Create search record
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

      // Show processing status (backend will update to 'queued' if needed)
      setSearchId(search.id);
      setProcessingStatus("processing");

      // Trigger N8N webhook in background (don't await)
      supabase.functions.invoke(
        "trigger-n8n-webhook",
        {
          body: {
            searchId: search.id,
            entryType: 'manual_entry',
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
        }
      ).catch((webhookError) => {
        console.error("N8N webhook trigger failed:", webhookError);
      });

      toast({
        title: "Request Submitted",
        description: "Your lead enrichment request is being processed",
      });
    } catch (error: any) {
      toast({
        title: "Submission Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setCompanyName("");
    setDomain("");
    setSelectedFunctions([]);
    setSelectedSeniority([]);
    setGeography("");
    setResultsPerFunction(10);
    setSearchId(null);
    setProcessingStatus(null);
  };

  if (searchId && processingStatus) {
    return <ProcessingStatus searchId={searchId} onReset={handleReset} />;
  }

  return (
    <Card className="shadow-strong hover-lift border border-border backdrop-blur-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Single Search
        </CardTitle>
        <CardDescription className="text-base">
          Search and enrich contacts from a single company
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="company" className="text-foreground font-medium">Company Name *</Label>
              <Input
                id="company"
                type="text"
                placeholder="Acme Corporation"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                className="h-11 transition-all duration-300 focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="domain" className="text-foreground font-medium">Domain Name *</Label>
              <Input
                id="domain"
                type="text"
                placeholder="acme.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
                className="h-11 transition-all duration-300 focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-foreground font-medium">Functions (Select all that apply)</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-4 border border-border rounded-lg bg-muted/30 hover:bg-muted/40 transition-colors duration-300">
              {LINKEDIN_FUNCTIONS.map((func) => (
                <div key={func} className="flex items-center space-x-2 p-1 hover:bg-muted/50 rounded transition-colors duration-200">
                  <Checkbox
                    id={func}
                    checked={selectedFunctions.includes(func)}
                    onCheckedChange={() => handleFunctionToggle(func)}
                    className="border-primary/50 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <Label htmlFor={func} className="font-normal cursor-pointer text-sm">
                    {func}
                  </Label>
                </div>
              ))}
            </div>
            {selectedFunctions.length > 0 && (
              <p className="text-sm text-accent font-medium">
                ✓ Selected: {selectedFunctions.length} function(s)
              </p>
            )}
          </div>

          {/* Seniority Level — Tag Input */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Seniority Level *</Label>
              <button
                type="button"
                onClick={handleSelectAllSeniorities}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all duration-200 ${
                  allSenioritiesSelected
                    ? 'bg-primary/20 text-primary border border-primary/40'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border'
                }`}
              >
                {allSenioritiesSelected ? '✓ All Selected' : 'Select All'}
              </button>
            </div>

            {/* Tag input box */}
            <div
              className="min-h-[46px] flex flex-wrap gap-1.5 items-center px-3 py-2 border border-border rounded-lg bg-background cursor-text transition-all duration-200 focus-within:ring-2 focus-within:ring-primary/25 focus-within:border-primary"
              onClick={() => seniorityInputRef.current?.focus()}
            >
              {selectedSeniority.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/30 select-none"
                  style={{ animation: 'tagPop 0.15s cubic-bezier(0.34,1.56,0.64,1)' }}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeSeniorityTag(tag); }}
                    className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    aria-label={`Remove ${tag}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              <input
                ref={seniorityInputRef}
                type="text"
                value={seniorityInput}
                onChange={(e) => setSeniorityInput(e.target.value)}
                onKeyDown={handleSeniorityKeyDown}
                placeholder={selectedSeniority.length === 0 ? "Type a level & press Enter, or pick below…" : "Add more…"}
                className="flex-1 min-w-[140px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 py-0.5"
              />
            </div>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-1.5">
              {SENIORITY_LEVELS.map((level) => {
                const active = selectedSeniority.includes(level);
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => handleSeniorityPresetClick(level)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-95 ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.35)]'
                        : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {active ? `✓ ${level}` : level}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground/70">
              Click a level to add it as a tag · Type a custom level and press <kbd className="px-1 py-0.5 rounded text-[10px] bg-muted border border-border font-mono">Enter</kbd> · Press <kbd className="px-1 py-0.5 rounded text-[10px] bg-muted border border-border font-mono">⌫</kbd> to remove last tag
            </p>
          </div>

          <style>{`
            @keyframes tagPop {
              0% { transform: scale(0.7); opacity: 0; }
              100% { transform: scale(1); opacity: 1; }
            }
          `}</style>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="resultsPerFunction" className="text-foreground font-medium">Results Per Function *</Label>
              <Input
                id="resultsPerFunction"
                type="number"
                min="1"
                placeholder="10"
                value={resultsPerFunction}
                onChange={(e) => setResultsPerFunction(parseInt(e.target.value) || 0)}
                required
                className="h-11 transition-all duration-300 focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="geography" className="text-foreground font-medium">Country</Label>
              <Select value={geography} onValueChange={setGeography}>
                <SelectTrigger id="geography" className="h-11 transition-all duration-300 focus:ring-2 focus:ring-primary/20">
                  <SelectValue placeholder="Select a country" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 bg-gradient-to-r from-primary to-accent hover:opacity-90 hover-glow text-base font-medium transition-all text-primary-foreground"
            disabled={!isFormValid() || loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="mr-2 h-5 w-5" />
                Submit Request
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
