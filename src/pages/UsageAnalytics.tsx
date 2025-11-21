import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, ArrowLeft } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { toast } from "sonner";
import { format, subDays, startOfDay, endOfDay, subWeeks, subMonths, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from "date-fns";

type TimePeriod = "daily" | "weekly" | "monthly" | "quarterly";

interface CreditData {
  apollo_credits: number;
  cleon1_credits: number;
  lusha_credits: number;
  created_at: string;
}

const COLORS = {
  apollo: "hsl(var(--chart-1))",
  cleon1: "hsl(var(--chart-2))",
  lusha: "hsl(var(--chart-3))",
};

const UsageAnalytics = () => {
  const navigate = useNavigate();
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("daily");
  const [creditData, setCreditData] = useState<CreditData[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);

  const fetchCreditData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("Please log in to view analytics");
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("credit_usage")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) throw error;

      setCreditData(data || []);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Error fetching credit data:", error);
      toast.error("Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCreditData();
  }, []);

  const getTotalCredits = () => {
    return creditData.reduce(
      (acc, curr) => ({
        apollo: acc.apollo + curr.apollo_credits,
        cleon1: acc.cleon1 + curr.cleon1_credits,
        lusha: acc.lusha + curr.lusha_credits,
      }),
      { apollo: 0, cleon1: 0, lusha: 0 }
    );
  };

  const getPieChartData = () => {
    const totals = getTotalCredits();
    return [
      { name: "Apollo", value: totals.apollo, color: COLORS.apollo },
      { name: "Cleon1", value: totals.cleon1, color: COLORS.cleon1 },
      { name: "Lusha", value: totals.lusha, color: COLORS.lusha },
    ];
  };

  const getBarChartData = () => {
    if (creditData.length === 0) return [];

    const now = new Date();
    let groupedData: { [key: string]: { apollo: number; cleon1: number; lusha: number } } = {};

    creditData.forEach((item) => {
      const date = new Date(item.created_at);
      let key: string;

      switch (timePeriod) {
        case "daily":
          key = format(date, "MMM d");
          break;
        case "weekly":
          key = `Week of ${format(startOfWeek(date), "MMM d")}`;
          break;
        case "monthly":
          key = format(date, "MMM yyyy");
          break;
        case "quarterly":
          const quarter = Math.floor(date.getMonth() / 3) + 1;
          key = `Q${quarter} ${date.getFullYear()}`;
          break;
        default:
          key = format(date, "MMM d");
      }

      if (!groupedData[key]) {
        groupedData[key] = { apollo: 0, cleon1: 0, lusha: 0 };
      }

      groupedData[key].apollo += item.apollo_credits;
      groupedData[key].cleon1 += item.cleon1_credits;
      groupedData[key].lusha += item.lusha_credits;
    });

    return Object.entries(groupedData).map(([date, credits]) => ({
      date,
      Apollo: credits.apollo,
      Cleon1: credits.cleon1,
      Lusha: credits.lusha,
    }));
  };

  const pieData = getPieChartData();
  const barData = getBarChartData();
  const totals = getTotalCredits();

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Usage Analytics</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Last Update: {format(lastUpdate, "MMM d yyyy 'at' hh:mm a")}
              </p>
            </div>
          </div>
          <Button onClick={fetchCreditData} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart Card */}
          <Card>
            <CardHeader>
              <CardTitle>Total Credits by Service</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-8">
                <ResponsiveContainer width="60%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      fill="#8884d8"
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Apollo</p>
                    <p className="text-2xl font-bold text-foreground">{totals.apollo}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cleon1</p>
                    <p className="text-2xl font-bold text-foreground">{totals.cleon1}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Lusha</p>
                    <p className="text-2xl font-bold text-foreground">{totals.lusha}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bar Chart Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Usage Over Time</CardTitle>
              <Select value={timePeriod} onValueChange={(value) => setTimePeriod(value as TimePeriod)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Apollo" fill={COLORS.apollo} />
                  <Bar dataKey="Cleon1" fill={COLORS.cleon1} />
                  <Bar dataKey="Lusha" fill={COLORS.lusha} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default UsageAnalytics;
