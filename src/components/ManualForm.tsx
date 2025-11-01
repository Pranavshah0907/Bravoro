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
  "Singapore", "Switzerland", "Sweden", "Norway", "Denmark", "Finland"
].sort();

const SENIORITY_LEVELS = [
  "C-Level", "VP", "Director", "Manager", "Senior", "Entry Level", "Intern"
];

const formSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required"),
  domain: z.string().trim().optional(),
  functions: z.array(z.string()).min(1, "At least one function must be selected"),
  geography: z.string().min(1, "Geography is required"),
  seniority: z.string().min(1, "Seniority level is required"),
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
  const [geography, setGeography] = useState("");
  const [seniority, setSeniority] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [searchId, setSearchId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<"processing" | "completed" | "error" | null>(null);

  useEffect(() => {
    // Load webhook URL from settings
    const loadWebhookUrl = async () => {
      const { data } = await supabase
        .from("webhook_settings")
        .select("webhook_url")
        .eq("user_id", userId)
        .single();
      
      if (data?.webhook_url) {
        setWebhookUrl(data.webhook_url);
      }
    };
    loadWebhookUrl();
  }, [userId]);

  const handleFunctionToggle = (func: string) => {
    setSelectedFunctions((prev) =>
      prev.includes(func) ? prev.filter((f) => f !== func) : [...prev, func]
    );
  };

  const isFormValid = () => {
    return companyName.trim() && selectedFunctions.length > 0 && geography && seniority && webhookUrl.trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Validate form
      formSchema.parse({
        companyName,
        domain,
        functions: selectedFunctions,
        geography,
        seniority,
      });

      if (!webhookUrl.trim()) {
        throw new Error("Webhook URL is required");
      }

      setLoading(true);

      // Save webhook URL if changed
      await supabase
        .from("webhook_settings")
        .upsert({
          user_id: userId,
          webhook_url: webhookUrl.trim(),
        });

      // Create search record
      const { data: search, error: searchError } = await supabase
        .from("searches")
        .insert({
          user_id: userId,
          search_type: "manual",
          company_name: companyName.trim(),
          domain: domain.trim() || null,
          functions: selectedFunctions,
          geography,
          seniority,
          status: "processing",
        })
        .select()
        .single();

      if (searchError) throw searchError;

      setSearchId(search.id);
      setProcessingStatus("processing");

      // Send to n8n webhook
      try {
        const response = await fetch(webhookUrl.trim(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            searchId: search.id,
            companyName: companyName.trim(),
            domain: domain.trim() || null,
            functions: selectedFunctions,
            geography,
            seniority,
            timestamp: new Date().toISOString(),
          }),
        });

        if (!response.ok) {
          throw new Error(`Webhook request failed with status ${response.status}`);
        }

        toast({
          title: "Request Submitted",
          description: "Your lead enrichment request is being processed",
        });
      } catch (webhookError: any) {
        // Update search status to error
        await supabase
          .from("searches")
          .update({
            status: "error",
            error_message: webhookError.message,
          })
          .eq("id", search.id);

        setProcessingStatus("error");
        throw webhookError;
      }
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
    setGeography("");
    setSeniority("");
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
            <Label htmlFor="webhook">n8n Webhook URL *</Label>
            <Input
              id="webhook"
              type="url"
              placeholder="https://your-n8n-instance.com/webhook/..."
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              required
            />
          </div>

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
            <Label htmlFor="domain">Domain Name (Optional)</Label>
            <Input
              id="domain"
              type="text"
              placeholder="acme.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Functions *</Label>
            <div className="space-y-2">
              {["Sales", "Marketing", "Accounting"].map((func) => (
                <div key={func} className="flex items-center space-x-2">
                  <Checkbox
                    id={func}
                    checked={selectedFunctions.includes(func)}
                    onCheckedChange={() => handleFunctionToggle(func)}
                  />
                  <Label htmlFor={func} className="font-normal cursor-pointer">
                    {func}
                  </Label>
                </div>
              ))}
            </div>
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

          <div className="space-y-2">
            <Label htmlFor="seniority">Seniority Level *</Label>
            <Select value={seniority} onValueChange={setSeniority} required>
              <SelectTrigger id="seniority">
                <SelectValue placeholder="Select seniority level" />
              </SelectTrigger>
              <SelectContent>
                {SENIORITY_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
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
