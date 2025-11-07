import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Send } from "lucide-react";
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
  functions: z.array(z.string()).min(1, "At least one function must be selected"),
  seniority: z.array(z.string()).min(1, "At least one seniority level must be selected"),
  geography: z.string().min(1, "Geography is required"),
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
  const [geography, setGeography] = useState("");
  const [resultsPerFunction, setResultsPerFunction] = useState<number>(10);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<"processing" | "completed" | "error" | null>(null);

  const handleFunctionToggle = (func: string) => {
    setSelectedFunctions((prev) =>
      prev.includes(func) ? prev.filter((f) => f !== func) : [...prev, func]
    );
  };

  const handleSeniorityToggle = (level: string) => {
    setSelectedSeniority((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]
    );
  };

  const isFormValid = () => {
    return companyName.trim() && domain.trim() && selectedFunctions.length > 0 && selectedSeniority.length > 0 && geography && resultsPerFunction > 0;
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

      // Trigger N8N webhook
      try {
        const { error: webhookError } = await supabase.functions.invoke(
          "trigger-n8n-webhook",
          {
            body: {
              searchData: {
                id: search.id,
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
        );

        if (webhookError) {
          console.error("N8N webhook error:", webhookError);
        }
      } catch (webhookError) {
        console.error("N8N webhook trigger failed:", webhookError);
      }

      setSearchId(search.id);
      setProcessingStatus("processing");

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
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle>Manual Lead Entry</CardTitle>
        <CardDescription>
          Fill in the details below to submit a lead enrichment request
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="company">Company Name *</Label>
            <Input
              id="company"
              type="text"
              placeholder="Acme Corporation"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="domain">Domain Name *</Label>
            <Input
              id="domain"
              type="text"
              placeholder="acme.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              required
            />
          </div>

          <div className="space-y-3">
            <Label>Functions * (Select all that apply)</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-3 border rounded-lg bg-muted/20">
              {LINKEDIN_FUNCTIONS.map((func) => (
                <div key={func} className="flex items-center space-x-2">
                  <Checkbox
                    id={func}
                    checked={selectedFunctions.includes(func)}
                    onCheckedChange={() => handleFunctionToggle(func)}
                  />
                  <Label htmlFor={func} className="font-normal cursor-pointer text-sm">
                    {func}
                  </Label>
                </div>
              ))}
            </div>
            {selectedFunctions.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Selected: {selectedFunctions.length} function(s)
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label>Seniority Level * (Select all that apply)</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-3 border rounded-lg bg-muted/20">
              {SENIORITY_LEVELS.map((level) => (
                <div key={level} className="flex items-center space-x-2">
                  <Checkbox
                    id={level}
                    checked={selectedSeniority.includes(level)}
                    onCheckedChange={() => handleSeniorityToggle(level)}
                  />
                  <Label htmlFor={level} className="font-normal cursor-pointer text-sm">
                    {level}
                  </Label>
                </div>
              ))}
            </div>
            {selectedSeniority.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Selected: {selectedSeniority.length} seniority level(s)
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="resultsPerFunction">Results Per Function *</Label>
            <Input
              id="resultsPerFunction"
              type="number"
              min="1"
              placeholder="10"
              value={resultsPerFunction}
              onChange={(e) => setResultsPerFunction(parseInt(e.target.value) || 0)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="geography">Geography *</Label>
            <Select value={geography} onValueChange={setGeography} required>
              <SelectTrigger id="geography">
                <SelectValue placeholder="Select a country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((country) => (
                  <SelectItem key={country} value={country}>
                    {country}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!isFormValid() || loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
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
  );
};
