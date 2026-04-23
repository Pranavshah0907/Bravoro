import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { invokeEdgeFunction } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ExternalLink } from "lucide-react";

const AVAILABLE_CRMS = [{ value: "pipedrive", label: "Pipedrive" }];

const HELP_URLS: Record<string, string> = {
  pipedrive: "https://support.pipedrive.com/en/article/how-can-i-find-my-personal-api-key",
};

interface Props {
  onConnected: () => void;
  defaultCrm?: string;
}

export function ConnectForm({ onConnected, defaultCrm }: Props) {
  const [crmType, setCrmType] = useState(defaultCrm ?? "pipedrive");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const { data, error } = await invokeEdgeFunction<{ ok: boolean; error?: string; accountDisplayName?: string }>(
        "crm-test-connection",
        { body: { crm_type: crmType, token } }
      );
      if (error) {
        setFormError(error.message);
        return;
      }
      if (!data?.ok) {
        setFormError(data?.error ?? "Connection failed.");
        return;
      }
      toast({
        title: "Connected",
        description: data.accountDisplayName ?? "CRM connected successfully.",
      });
      setToken("");
      onConnected();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your CRM</CardTitle>
        <CardDescription>
          Connect to stop re-enriching contacts you already have. Bravoro will check your CRM before spending credits.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="crm">CRM</Label>
            <Select value={crmType} onValueChange={setCrmType}>
              <SelectTrigger id="crm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_CRMS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="token">API token</Label>
            <Input
              id="token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your API token"
              disabled={submitting}
              required
            />
            <a
              href={HELP_URLS[crmType]}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              Where do I find my token?
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {formError && (
            <p className="text-sm text-destructive" role="alert">{formError}</p>
          )}
          <Button type="submit" disabled={submitting || !token}>
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing connection…</>
            ) : (
              "Connect"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
