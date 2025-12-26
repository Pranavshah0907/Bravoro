import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { toast } from "sonner";
import { format, subDays, subWeeks, subMonths, startOfWeek, startOfMonth } from "date-fns";
import { AppSidebar } from "@/components/AppSidebar";
import { cn } from "@/lib/utils";

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
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchCreditData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("Please log in to view analytics");
        navigate("/auth");
        return;
      }

      // Check admin status
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      setIsAdmin(roleData?.role === "admin");

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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
    navigate("/auth");
  };

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
    const now = new Date();
    const limit = timePeriod === "daily" ? 5 : timePeriod === "weekly" ? 5 : timePeriod === "monthly" ? 6 : 4;
    
    const periods: { date: string; Apollo: number; Cleon1: number; Lusha: number; sortDate: Date }[] = [];
    
    for (let i = limit - 1; i >= 0; i--) {
      let periodDate: Date;
      let dateLabel: string;
      
      switch (timePeriod) {
        case "daily":
          periodDate = subDays(now, i);
          dateLabel = format(periodDate, "MMM d");
          break;
        case "weekly":
          periodDate = subWeeks(now, i);
          const weekStart = startOfWeek(periodDate);
          dateLabel = format(weekStart, "MMM d");
          periodDate = weekStart;
          break;
        case "monthly":
          periodDate = subMonths(now, i);
          dateLabel = format(periodDate, "MMM yyyy");
          periodDate = startOfMonth(periodDate);
          break;
        case "quarterly":
          periodDate = subMonths(now, i * 3);
          const quarter = Math.floor(periodDate.getMonth() / 3) + 1;
          dateLabel = `Q${quarter} ${periodDate.getFullYear()}`;
          periodDate = new Date(periodDate.getFullYear(), Math.floor(periodDate.getMonth() / 3) * 3, 1);
          break;
        default:
          periodDate = subDays(now, i);
          dateLabel = format(periodDate, "MMM d");
      }
      
      periods.push({
        date: dateLabel,
        Apollo: 0,
        Cleon1: 0,
        Lusha: 0,
        sortDate: periodDate,
      });
    }
    
    creditData.forEach((item) => {
      const date = new Date(item.created_at);
      
      periods.forEach((period) => {
        let matches = false;
        
        switch (timePeriod) {
          case "daily":
            matches = format(date, "MMM d") === period.date && 
                     date.getFullYear() === period.sortDate.getFullYear();
            break;
          case "weekly":
            const itemWeekStart = startOfWeek(date);
            matches = format(itemWeekStart, "MMM d") === period.date &&
                     itemWeekStart.getFullYear() === period.sortDate.getFullYear();
            break;
          case "monthly":
            matches = format(date, "MMM yyyy") === period.date;
            break;
          case "quarterly":
            const itemQuarter = Math.floor(date.getMonth() / 3) + 1;
            const periodQuarter = Math.floor(period.sortDate.getMonth() / 3) + 1;
            matches = itemQuarter === periodQuarter && 
                     date.getFullYear() === period.sortDate.getFullYear();
            break;
        }
        
        if (matches) {
          period.Apollo += item.apollo_credits;
          period.Cleon1 += item.cleon1_credits;
          period.Lusha += item.lusha_credits;
        }
      });
    });

    return periods.map(({ date, Apollo, Cleon1, Lusha }) => ({
      date,
      Apollo,
      Cleon1,
      Lusha,
    }));
  };

  const pieData = getPieChartData();
  const barData = getBarChartData();
  const totals = getTotalCredits();

  return (
    <div className="min-h-screen bg-background flex">
      <AppSidebar isAdmin={isAdmin} onSignOut={handleSignOut} />
      
      <main className="flex-1 ml-16 min-h-screen">
        {/* Background Effects */}
        <div className="fixed inset-0 ml-16 pointer-events-none overflow-hidden">
          <div 
            className="absolute -top-1/4 -right-1/4 w-[600px] h-[600px] rounded-full opacity-20"
            style={{
              background: "radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)",
            }}
          />
        </div>

        <div className="relative z-10 p-6 md:p-8 max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">Usage Analytics</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Last Update: {format(lastUpdate, "MMM d yyyy 'at' hh:mm a")}
              </p>
            </div>
            <Button 
              onClick={fetchCreditData} 
              disabled={loading} 
              variant="outline" 
              size="sm" 
              className="border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Pie Chart Card */}
            <Card className="lg:col-span-4 border-border/50 bg-card/80 backdrop-blur-sm animate-fade-in" style={{ animationDelay: "0.1s" }}>
              <CardHeader>
                <CardTitle className="text-xl text-foreground">Total Credits</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        fill="#8884d8"
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          color: "hsl(var(--foreground))"
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="w-3 h-3 rounded-full mx-auto mb-2" style={{ backgroundColor: COLORS.apollo }} />
                      <p className="text-xs text-muted-foreground mb-1">Apollo</p>
                      <p className="text-xl font-bold text-foreground">{totals.apollo}</p>
                    </div>
                    <div className="text-center">
                      <div className="w-3 h-3 rounded-full mx-auto mb-2" style={{ backgroundColor: COLORS.cleon1 }} />
                      <p className="text-xs text-muted-foreground mb-1">Cleon1</p>
                      <p className="text-xl font-bold text-foreground">{totals.cleon1}</p>
                    </div>
                    <div className="text-center">
                      <div className="w-3 h-3 rounded-full mx-auto mb-2" style={{ backgroundColor: COLORS.lusha }} />
                      <p className="text-xs text-muted-foreground mb-1">Lusha</p>
                      <p className="text-xl font-bold text-foreground">{totals.lusha}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bar Chart Card */}
            <Card className="lg:col-span-8 border-border/50 bg-card/80 backdrop-blur-sm animate-fade-in" style={{ animationDelay: "0.2s" }}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl text-foreground">Usage Over Time</CardTitle>
                <Select value={timePeriod} onValueChange={(value) => setTimePeriod(value as TimePeriod)}>
                  <SelectTrigger className="w-32 bg-muted/30 border-border/50 text-foreground">
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
                {barData.length === 0 ? (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    No usage data available yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={barData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis 
                        dataKey="date" 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fill: "hsl(var(--foreground))", fontSize: 13 }}
                        tickLine={{ stroke: "hsl(var(--border))" }}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fill: "hsl(var(--foreground))", fontSize: 13 }}
                        tickLine={{ stroke: "hsl(var(--border))" }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          color: "hsl(var(--foreground))"
                        }}
                        cursor={{ fill: "hsl(var(--accent))", opacity: 0.1 }}
                      />
                      <Legend 
                        wrapperStyle={{ paddingTop: "20px" }}
                        iconType="circle"
                      />
                      <Bar dataKey="Apollo" stackId="a" fill={COLORS.apollo} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Cleon1" stackId="a" fill={COLORS.cleon1} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Lusha" stackId="a" fill={COLORS.lusha} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default UsageAnalytics;