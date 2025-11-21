import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { LogOut, Download, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import leapLogo from "@/assets/leap-logo.png";
import leapFont from "@/assets/leap-font.png";

interface Search {
  id: string;
  status: string;
  created_at: string;
  updated_at: string | null;
  result_url: string | null;
  error_message: string | null;
  excel_file_name: string | null;
  search_type: string;
  company_name: string | null;
  domain: string | null;
}

const Results = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [searches, setSearches] = useState<Search[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        fetchSearches(session.user.id);
      } else {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      const interval = setInterval(() => {
        fetchSearches(user.id);
      }, 10000); // Auto-refresh every 10 seconds

      return () => clearInterval(interval);
    }
  }, [user]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      setUser(session.user);
      await fetchSearches(session.user.id);
    } else {
      navigate("/auth");
    }
  };

  const fetchSearches = async (userId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("searches")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setSearches(data || []);
    } catch (error) {
      console.error("Error fetching searches:", error);
      toast({
        title: "Error",
        description: "Failed to fetch search results",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully",
    });
    navigate("/auth");
  };

  const handleDownload = async (path: string) => {
    try {
      // If result_url is a full URL (legacy/manual results), just open it
      if (path.startsWith("http://") || path.startsWith("https://")) {
        window.open(path, "_blank");
        toast({
          title: "Download Started",
          description: "Your file has been opened in a new tab",
        });
        return;
      }

      // Otherwise, treat it as a file name in the `results` storage bucket
      const { data, error } = await supabase.storage
        .from("results")
        .download(path);

      if (error) throw error;

      const blob = data;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = path.split("/").pop() || "result.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download Started",
        description: "Your file is being downloaded",
      });
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download Failed",
        description: "Failed to download the file",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "processing":
        return <Badge variant="default">Processing</Badge>;
      case "completed":
        return <Badge variant="default" className="bg-green-600">Completed</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredSearches = searches.filter(search => {
    if (filter === "all") return true;
    return search.status === filter;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-accent/5">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={leapLogo} alt="LEAP Logo" className="h-12 w-12" />
            <div>
              <img src={leapFont} alt="LEAP" className="h-8" />
              <p className="text-sm text-muted-foreground mt-1 tracking-wide">Lead Enrichment & Automation Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
              Back to Dashboard
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">Search Results</h1>
              <p className="text-muted-foreground mt-1">Track your enrichment requests</p>
            </div>
            <div className="flex items-center gap-4">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => user && fetchSearches(user.id)}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border/50 shadow-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && searches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredSearches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No searches found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSearches.map((search, index) => (
                    <TableRow key={search.id}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell>
                        <Badge variant={search.search_type === "bulk" ? "default" : "secondary"}>
                          {search.search_type === "bulk" ? "Bulk Upload" : "Manual Entry"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {search.search_type === "bulk" && search.excel_file_name ? (
                          <span className="text-sm">{search.excel_file_name}</span>
                        ) : search.company_name ? (
                          <span className="text-sm">{search.company_name}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{new Date(search.created_at).toLocaleString()}</TableCell>
                      <TableCell>{getStatusBadge(search.status)}</TableCell>
                      <TableCell className="text-right">
                        {search.status === "completed" && search.result_url ? (
                          <Button
                            size="sm"
                            onClick={() => handleDownload(search.result_url!)}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        ) : search.status === "error" && search.error_message ? (
                          <span className="text-sm text-destructive">{search.error_message}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Results;