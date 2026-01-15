import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, TrendingUp, Activity, Zap } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, Sector } from "recharts";
import { toast } from "sonner";
import { format, subDays, subWeeks, subMonths, startOfWeek, startOfMonth } from "date-fns";
import { AppSidebar } from "@/components/AppSidebar";
import { cn } from "@/lib/utils";

type TimePeriod = "daily" | "weekly" | "monthly" | "quarterly";

interface CreditData {
  apollo_credits: number;
  aleads_credits: number;
  lusha_credits: number;
  created_at: string;
}

const COLORS = {
  apollo: "hsl(var(--chart-1))",
  aleads: "hsl(var(--chart-2))",
  lusha: "hsl(var(--chart-3))",
};

// Custom active shape for pie chart hover effect
const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius - 4}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        style={{
          filter: "drop-shadow(0 0 12px rgba(0, 157, 165, 0.4))",
          transition: "all 0.3s ease",
        }}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius - 2}
        outerRadius={outerRadius + 4}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.3}
      />
      <text x={cx} y={cy - 8} textAnchor="middle" fill="hsl(var(--foreground))" className="text-sm font-medium">
        {payload.name}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="hsl(var(--foreground))" className="text-lg font-bold">
        {value}
      </text>
      <text x={cx} y={cy + 28} textAnchor="middle" fill="hsl(var(--muted-foreground))" className="text-xs">
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    </g>
  );
};

const UsageAnalytics = () => {
  const navigate = useNavigate();
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("daily");
  const [creditData, setCreditData] = useState<CreditData[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activePieIndex, setActivePieIndex] = useState<number | undefined>(undefined);

  const onPieEnter = useCallback((_: any, index: number) => {
    setActivePieIndex(index);
  }, []);

  const onPieLeave = useCallback(() => {
    setActivePieIndex(undefined);
  }, []);

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
        aleads: acc.aleads + curr.aleads_credits,
        lusha: acc.lusha + curr.lusha_credits,
      }),
      { apollo: 0, aleads: 0, lusha: 0 }
    );
  };

  const getPieChartData = () => {
    const totals = getTotalCredits();
    return [
      { name: "Apollo", value: totals.apollo, color: COLORS.apollo },
      { name: "A-Leads", value: totals.aleads, color: COLORS.aleads },
      { name: "Lusha", value: totals.lusha, color: COLORS.lusha },
    ];
  };

  const getBarChartData = () => {
    const now = new Date();
    const limit = timePeriod === "daily" ? 5 : timePeriod === "weekly" ? 5 : timePeriod === "monthly" ? 6 : 4;
    
    const periods: { date: string; Apollo: number; "A-Leads": number; Lusha: number; sortDate: Date }[] = [];
    
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
        "A-Leads": 0,
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
          period["A-Leads"] += item.aleads_credits;
          period.Lusha += item.lusha_credits;
        }
      });
    });

    return periods.map(({ date, Apollo, "A-Leads": ALeads, Lusha }) => ({
      date,
      Apollo,
      "A-Leads": ALeads,
      Lusha,
    }));
  };

  const pieData = getPieChartData();
  const barData = getBarChartData();
  const totals = getTotalCredits();

  const grandTotal = totals.apollo + totals.aleads + totals.lusha;

  return (
    <div className="min-h-screen bg-background flex">
      <AppSidebar isAdmin={isAdmin} onSignOut={handleSignOut} />
      
      <main className="flex-1 ml-16 min-h-screen">
        {/* Background Effects */}
        <div className="fixed inset-0 ml-16 pointer-events-none overflow-hidden">
          <div 
            className="absolute -top-1/4 -right-1/4 w-[700px] h-[700px] rounded-full opacity-15"
            style={{
              background: "radial-gradient(circle, hsl(var(--primary) / 0.2) 0%, transparent 60%)",
            }}
          />
          <div 
            className="absolute bottom-0 left-1/4 w-[500px] h-[500px] rounded-full opacity-10"
            style={{
              background: "radial-gradient(circle, hsl(var(--accent) / 0.15) 0%, transparent 60%)",
            }}
          />
        </div>

        <div className="relative z-10 p-6 md:p-8 max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                  <Activity className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground">Usage Analytics</h1>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Last updated: {format(lastUpdate, "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
              </div>
            </div>
            <Button 
              onClick={fetchCreditData} 
              disabled={loading} 
              variant="outline" 
              size="sm" 
              className="border-primary/30 text-foreground hover:bg-primary/10 hover:border-primary/50 transition-all duration-300"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
              Refresh Data
            </Button>
          </div>

          {/* Stats Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in" style={{ animationDelay: "0.05s" }}>
            <Card className="border-border/40 bg-gradient-to-br from-card to-card/80 hover:border-primary/30 transition-all duration-300 group">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Credits</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{grandTotal.toLocaleString()}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-colors">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {[
              { name: "Apollo", value: totals.apollo, color: COLORS.apollo, icon: Zap },
              { name: "A-Leads", value: totals.aleads, color: COLORS.aleads, icon: Activity },
              { name: "Lusha", value: totals.lusha, color: COLORS.lusha, icon: TrendingUp },
            ].map((item, index) => (
              <Card 
                key={item.name} 
                className="border-border/40 bg-gradient-to-br from-card to-card/80 hover:border-border/60 transition-all duration-300 group"
                style={{ animationDelay: `${0.1 + index * 0.05}s` }}
              >
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{item.name}</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{item.value.toLocaleString()}</p>
                    </div>
                    <div 
                      className="p-3 rounded-xl transition-all duration-300 group-hover:scale-105"
                      style={{ backgroundColor: `${item.color}20` }}
                    >
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Pie Chart Card */}
            <Card className="lg:col-span-4 border-border/40 bg-gradient-to-br from-card via-card to-card/90 backdrop-blur-sm animate-fade-in overflow-hidden relative" style={{ animationDelay: "0.15s" }}>
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-primary opacity-60" />
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-foreground flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  Credit Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        activeIndex={activePieIndex}
                        activeShape={renderActiveShape}
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                        dataKey="value"
                        onMouseEnter={onPieEnter}
                        onMouseLeave={onPieLeave}
                        stroke="hsl(var(--background))"
                        strokeWidth={2}
                        style={{ cursor: "pointer" }}
                      >
                        {pieData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.color}
                            style={{
                              filter: activePieIndex === index ? "brightness(1.2)" : "brightness(1)",
                              transition: "all 0.3s ease",
                            }}
                          />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "12px",
                          boxShadow: "0 8px 32px -4px rgb(0 0 0 / 0.3)",
                          color: "hsl(var(--foreground))",
                          padding: "12px 16px",
                        }}
                        itemStyle={{ color: "hsl(var(--foreground))", fontWeight: 500 }}
                        labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  
                  {/* Legend */}
                  <div className="space-y-3 pt-2">
                    {[
                      { name: "Apollo", value: totals.apollo, color: COLORS.apollo },
                      { name: "A-Leads", value: totals.aleads, color: COLORS.aleads },
                      { name: "Lusha", value: totals.lusha, color: COLORS.lusha },
                    ].map((item, index) => {
                      const percentage = grandTotal > 0 ? ((item.value / grandTotal) * 100).toFixed(1) : "0";
                      return (
                        <div 
                          key={item.name}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg transition-all duration-300",
                            "hover:bg-muted/50 cursor-pointer group",
                            activePieIndex === index && "bg-muted/50"
                          )}
                          onMouseEnter={() => setActivePieIndex(index)}
                          onMouseLeave={() => setActivePieIndex(undefined)}
                        >
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-3 h-3 rounded-full transition-transform group-hover:scale-125" 
                              style={{ backgroundColor: item.color, boxShadow: `0 0 8px ${item.color}50` }} 
                            />
                            <span className="text-sm font-medium text-foreground">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-muted-foreground">{percentage}%</span>
                            <span className="text-sm font-bold text-foreground min-w-[3rem] text-right">
                              {item.value.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bar Chart Card */}
            <Card className="lg:col-span-8 border-border/40 bg-gradient-to-br from-card via-card to-card/90 backdrop-blur-sm animate-fade-in overflow-hidden relative" style={{ animationDelay: "0.2s" }}>
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent via-primary to-accent opacity-60" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg text-foreground flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  Usage Over Time
                </CardTitle>
                <Select value={timePeriod} onValueChange={(value) => setTimePeriod(value as TimePeriod)}>
                  <SelectTrigger className="w-32 bg-muted/20 border-border/40 text-foreground hover:bg-muted/30 transition-colors">
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
                  <div className="flex flex-col items-center justify-center h-[320px] text-muted-foreground">
                    <Activity className="h-12 w-12 mb-4 opacity-40" />
                    <p className="text-lg font-medium">No usage data yet</p>
                    <p className="text-sm opacity-70">Start using credits to see analytics</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={barData} margin={{ top: 20, right: 20, left: -10, bottom: 20 }}>
                      <defs>
                        <linearGradient id="apolloGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={1}/>
                          <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.7}/>
                        </linearGradient>
                        <linearGradient id="aleadsGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={1}/>
                          <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.7}/>
                        </linearGradient>
                        <linearGradient id="lushaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={1}/>
                          <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.7}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fill: "hsl(var(--foreground))", fontSize: 12, fontWeight: 500 }}
                        tickLine={false}
                        axisLine={{ stroke: "hsl(var(--border))", strokeOpacity: 0.3 }}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "12px",
                          boxShadow: "0 8px 32px -4px rgb(0 0 0 / 0.3)",
                          color: "hsl(var(--foreground))",
                          padding: "12px 16px",
                        }}
                        cursor={{ fill: "hsl(var(--accent))", opacity: 0.08 }}
                        itemStyle={{ color: "hsl(var(--foreground))", padding: "2px 0" }}
                        labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600, marginBottom: "8px" }}
                      />
                      <Legend 
                        wrapperStyle={{ paddingTop: "16px" }}
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => <span className="text-sm text-foreground ml-1">{value}</span>}
                      />
                      <Bar 
                        dataKey="Apollo" 
                        stackId="a" 
                        fill="url(#apolloGradient)" 
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar 
                        dataKey="A-Leads" 
                        stackId="a" 
                        fill="url(#aleadsGradient)" 
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar 
                        dataKey="Lusha" 
                        stackId="a" 
                        fill="url(#lushaGradient)" 
                        radius={[4, 4, 0, 0]}
                      />
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