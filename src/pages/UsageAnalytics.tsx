import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { RefreshCw, TrendingUp, Activity, Zap, CalendarIcon } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, Sector } from "recharts";
import { toast } from "sonner";
import { format, subDays, subWeeks, subMonths, startOfWeek, startOfMonth, isWithinInterval, startOfDay, endOfDay, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval } from "date-fns";
import { AppSidebar } from "@/components/AppSidebar";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

type TimePeriod = "daily" | "weekly" | "monthly" | "quarterly" | "custom";

interface CreditData {
  apollo_credits: number;
  aleads_credits: number;
  lusha_credits: number;
  created_at: string;
}

interface EnrichmentData {
  enrichment_limit: number;
  enrichment_used: number;
}

// Helper function to get platform names based on admin status
const getPlatformNames = (isAdmin: boolean) => ({
  apollo: isAdmin ? "Apollo" : "Platform A",
  aleads: isAdmin ? "A-Leads" : "Platform B",
  lusha: isAdmin ? "Lusha" : "Platform C",
});

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
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [enrichmentData, setEnrichmentData] = useState<EnrichmentData>({ enrichment_limit: 0, enrichment_used: 0 });

  const dateRangeRef = useRef<DateRange | undefined>(dateRange);
  useEffect(() => {
    dateRangeRef.current = dateRange;
  }, [dateRange]);

  const onPieEnter = useCallback((_: any, index: number) => {
    setActivePieIndex(index);
  }, []);

  const onPieLeave = useCallback(() => {
    setActivePieIndex(undefined);
  }, []);

  // Reset active pie index when mouse leaves the chart container
  const handleChartMouseLeave = useCallback(() => {
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

      // Check admin status and get enrichment data
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      setIsAdmin(roleData?.role === "admin");

      // Fetch enrichment data from profiles
      const { data: profileData } = await supabase
        .from("profiles")
        .select("enrichment_limit, enrichment_used")
        .eq("id", user.id)
        .single();
      
      if (profileData) {
        setEnrichmentData({
          enrichment_limit: profileData.enrichment_limit ?? 0,
          enrichment_used: profileData.enrichment_used ?? 0,
        });
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

  const platformNames = getPlatformNames(isAdmin);

  const getPieChartData = () => {
    const totals = getTotalCredits();
    return [
      { name: platformNames.apollo, value: totals.apollo, color: COLORS.apollo },
      { name: platformNames.aleads, value: totals.aleads, color: COLORS.aleads },
      { name: platformNames.lusha, value: totals.lusha, color: COLORS.lusha },
    ];
  };

  const getBarChartData = () => {
    const now = new Date();
    
    // Handle custom date range
    if (timePeriod === "custom" && dateRange?.from && dateRange?.to) {
      const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
      const periods: { date: string; Apollo: number; "A-Leads": number; Lusha: number; sortDate: Date }[] = [];
      
      // Group by appropriate interval based on range size
      const dayCount = days.length;
      
      if (dayCount <= 14) {
        // Show daily for up to 2 weeks
        days.forEach(day => {
          periods.push({
            date: format(day, "MMM d"),
            Apollo: 0,
            "A-Leads": 0,
            Lusha: 0,
            sortDate: day,
          });
        });
        
        creditData.forEach((item) => {
          const date = new Date(item.created_at);
          periods.forEach((period) => {
            if (format(date, "MMM d yyyy") === format(period.sortDate, "MMM d yyyy")) {
              period.Apollo += item.apollo_credits;
              period["A-Leads"] += item.aleads_credits;
              period.Lusha += item.lusha_credits;
            }
          });
        });
      } else if (dayCount <= 90) {
        // Show weekly for up to 3 months
        const weeks = eachWeekOfInterval({ start: dateRange.from, end: dateRange.to });
        weeks.forEach(week => {
          periods.push({
            date: format(week, "MMM d"),
            Apollo: 0,
            "A-Leads": 0,
            Lusha: 0,
            sortDate: week,
          });
        });
        
        creditData.forEach((item) => {
          const date = new Date(item.created_at);
          const itemWeekStart = startOfWeek(date);
          periods.forEach((period) => {
            if (format(itemWeekStart, "MMM d yyyy") === format(period.sortDate, "MMM d yyyy")) {
              period.Apollo += item.apollo_credits;
              period["A-Leads"] += item.aleads_credits;
              period.Lusha += item.lusha_credits;
            }
          });
        });
      } else {
        // Show monthly for longer ranges
        const months = eachMonthOfInterval({ start: dateRange.from, end: dateRange.to });
        months.forEach(month => {
          periods.push({
            date: format(month, "MMM yyyy"),
            Apollo: 0,
            "A-Leads": 0,
            Lusha: 0,
            sortDate: month,
          });
        });
        
        creditData.forEach((item) => {
          const date = new Date(item.created_at);
          periods.forEach((period) => {
            if (format(date, "MMM yyyy") === period.date) {
              period.Apollo += item.apollo_credits;
              period["A-Leads"] += item.aleads_credits;
              period.Lusha += item.lusha_credits;
            }
          });
        });
      }
      
      return periods.map(({ date, Apollo, "A-Leads": ALeads, Lusha }) => ({
        date,
        Apollo,
        "A-Leads": ALeads,
        Lusha,
      }));
    }
    
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

  // Calculate period totals for the selected time range
  const periodTotals = useMemo(() => {
    const barData = getBarChartData();
    return barData.reduce(
      (acc, curr) => ({
        apollo: acc.apollo + curr.Apollo,
        aleads: acc.aleads + curr["A-Leads"],
        lusha: acc.lusha + curr.Lusha,
      }),
      { apollo: 0, aleads: 0, lusha: 0 }
    );
  }, [creditData, timePeriod, dateRange]);

  const periodGrandTotal = periodTotals.apollo + periodTotals.aleads + periodTotals.lusha;

  const getPeriodLabel = () => {
    if (timePeriod === "custom" && dateRange?.from && dateRange?.to) {
      return `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d, yyyy")}`;
    }
    switch (timePeriod) {
      case "daily": return "Last 5 Days";
      case "weekly": return "Last 5 Weeks";
      case "monthly": return "Last 6 Months";
      case "quarterly": return "Last 4 Quarters";
      default: return "";
    }
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
                <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">Usage Analytics</h1>
                  <p className="text-xs text-muted-foreground mt-0.5">
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
              className="border-primary/30 text-foreground hover:bg-primary/10 hover:border-primary/50 transition-all duration-300 text-xs"
            >
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {/* Enrichment Contacts Remaining Card */}
          {enrichmentData.enrichment_limit > 0 && (
            <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card/90 animate-fade-in" style={{ animationDelay: "0.03s" }}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Enriched Contacts Remaining</p>
                    <p className="text-3xl font-bold text-foreground mt-1">
                      {Math.max(0, enrichmentData.enrichment_limit - enrichmentData.enrichment_used).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-primary/10">
                    <Activity className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Used: {enrichmentData.enrichment_used.toLocaleString()}</span>
                    <span>Limit: {enrichmentData.enrichment_limit.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full transition-all duration-500",
                        enrichmentData.enrichment_used / enrichmentData.enrichment_limit > 0.9 
                          ? "bg-destructive" 
                          : enrichmentData.enrichment_used / enrichmentData.enrichment_limit > 0.7 
                            ? "bg-yellow-500" 
                            : "bg-gradient-to-r from-primary to-accent"
                      )}
                      style={{ width: `${Math.min((enrichmentData.enrichment_used / enrichmentData.enrichment_limit) * 100, 100)}%` }}
                    />
                  </div>
                  {enrichmentData.enrichment_used / enrichmentData.enrichment_limit > 0.9 && (
                    <p className="text-xs text-destructive font-medium">⚠️ Almost at limit - contact admin for more</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-in" style={{ animationDelay: "0.05s" }}>
            <Card className="border-border/40 bg-gradient-to-br from-card to-card/80 hover:border-primary/30 transition-all duration-300 group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total Credits</p>
                    <p className="text-xl font-bold text-foreground mt-0.5">{grandTotal.toLocaleString()}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-primary/10 group-hover:bg-primary/15 transition-colors">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {[
              { name: platformNames.apollo, value: totals.apollo, color: COLORS.apollo, icon: Zap },
              { name: platformNames.aleads, value: totals.aleads, color: COLORS.aleads, icon: Activity },
              { name: platformNames.lusha, value: totals.lusha, color: COLORS.lusha, icon: TrendingUp },
            ].map((item, index) => (
              <Card 
                key={item.name} 
                className="border-border/40 bg-gradient-to-br from-card to-card/80 hover:border-border/60 transition-all duration-300 group"
                style={{ animationDelay: `${0.1 + index * 0.05}s` }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{item.name}</p>
                      <p className="text-xl font-bold text-foreground mt-0.5">{item.value.toLocaleString()}</p>
                    </div>
                    <div 
                      className="p-2.5 rounded-lg transition-all duration-300 group-hover:scale-105"
                      style={{ backgroundColor: `${item.color}20` }}
                    >
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Pie Chart Card */}
            <Card className="lg:col-span-4 border-border/40 bg-gradient-to-br from-card via-card to-card/90 backdrop-blur-sm animate-fade-in overflow-hidden relative" style={{ animationDelay: "0.15s" }}>
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-accent to-primary opacity-60" />
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-base text-foreground flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Credit Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="space-y-3" onMouseLeave={handleChartMouseLeave}>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart onMouseLeave={handleChartMouseLeave}>
                      <Pie
                        activeIndex={activePieIndex}
                        activeShape={renderActiveShape}
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
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
                          borderRadius: "10px",
                          boxShadow: "0 8px 32px -4px rgb(0 0 0 / 0.3)",
                          color: "hsl(var(--foreground))",
                          padding: "10px 14px",
                          fontSize: "12px",
                        }}
                        itemStyle={{ color: "hsl(var(--foreground))", fontWeight: 500, fontSize: "12px" }}
                        labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600, fontSize: "12px" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  
                  {/* Legend */}
                  <div className="space-y-2">
                    {[
                      { name: platformNames.apollo, value: totals.apollo, color: COLORS.apollo },
                      { name: platformNames.aleads, value: totals.aleads, color: COLORS.aleads },
                      { name: platformNames.lusha, value: totals.lusha, color: COLORS.lusha },
                    ].map((item, index) => {
                      const percentage = grandTotal > 0 ? ((item.value / grandTotal) * 100).toFixed(1) : "0";
                      return (
                        <div 
                          key={item.name}
                          className={cn(
                            "flex items-center justify-between p-2.5 rounded-lg transition-all duration-300",
                            "hover:bg-muted/50 cursor-pointer group",
                            activePieIndex === index && "bg-muted/50"
                          )}
                          onMouseEnter={() => setActivePieIndex(index)}
                          onMouseLeave={() => setActivePieIndex(undefined)}
                        >
                          <div className="flex items-center gap-2.5">
                            <div 
                              className="w-2.5 h-2.5 rounded-full transition-transform group-hover:scale-125" 
                              style={{ backgroundColor: item.color, boxShadow: `0 0 8px ${item.color}50` }} 
                            />
                            <span className="text-xs font-medium text-foreground">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{percentage}%</span>
                            <span className="text-xs font-bold text-foreground min-w-[2.5rem] text-right">
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
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-accent via-primary to-accent opacity-60" />
              <CardHeader className="flex flex-col gap-3 pb-3 pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="text-base text-foreground flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    Usage Over Time
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Select value={timePeriod} onValueChange={(value) => setTimePeriod(value as TimePeriod)}>
                      <SelectTrigger className="w-28 bg-muted/20 border-border/40 text-foreground hover:bg-muted/30 transition-colors text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily" className="text-xs">Daily</SelectItem>
                        <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
                        <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
                        <SelectItem value="quarterly" className="text-xs">Quarterly</SelectItem>
                        <SelectItem value="custom" className="text-xs">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {timePeriod === "custom" && (
                      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              "h-8 justify-start text-left font-normal text-xs bg-muted/20 border-border/40 hover:bg-muted/30",
                              !dateRange && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-1.5 h-3 w-3" />
                            {dateRange?.from ? (
                              dateRange.to ? (
                                <>
                                  {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}
                                </>
                              ) : (
                                format(dateRange.from, "MMM d, yyyy")
                              )
                            ) : (
                              <span>Pick dates</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-popover border-border rounded-lg" align="end">
                          <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={dateRange?.from}
                            selected={dateRange}
                            onSelect={(_range, selectedDay) => {
                              if (!selectedDay) return;

                              const prev = dateRangeRef.current;
                              const prevFrom = prev?.from;
                              const prevTo = prev?.to;

                              let nextRange: DateRange;

                              // Start a fresh selection if there's no start date yet
                              // OR if a full range is already selected.
                              if (!prevFrom || (prevFrom && prevTo)) {
                                nextRange = { from: selectedDay, to: undefined };
                              } else if (selectedDay < prevFrom) {
                                // If the "to" click is earlier than "from", treat it as a new "from".
                                nextRange = { from: selectedDay, to: undefined };
                              } else {
                                // Complete the range.
                                nextRange = { from: prevFrom, to: selectedDay };
                              }

                              setDateRange(nextRange);

                              // Only close after the second click that completes the range.
                              if (prevFrom && !prevTo && selectedDay >= prevFrom) {
                                setIsCalendarOpen(false);
                              }
                            }}
                            numberOfMonths={2}
                            disabled={(date) => date > new Date()}
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </div>
                
                {/* Period Summary */}
                <div className="flex flex-wrap items-center gap-4 pt-1 pb-1 px-3 bg-muted/20 rounded-lg border border-border/30">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Period:</span>
                    <span className="text-xs font-medium text-foreground">{getPeriodLabel()}</span>
                  </div>
                  <div className="h-4 w-px bg-border/50" />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total:</span>
                    <span className="text-xs font-bold text-primary">{periodGrandTotal.toLocaleString()}</span>
                  </div>
                  <div className="h-4 w-px bg-border/50 hidden sm:block" />
                  <div className="flex items-center gap-3 flex-wrap">
                    {[
                      { name: platformNames.apollo, value: periodTotals.apollo, color: COLORS.apollo },
                      { name: platformNames.aleads, value: periodTotals.aleads, color: COLORS.aleads },
                      { name: platformNames.lusha, value: periodTotals.lusha, color: COLORS.lusha },
                    ].map((item) => (
                      <div key={item.name} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-[10px] text-muted-foreground">{item.name}:</span>
                        <span className="text-xs font-semibold text-foreground">{item.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-4">
                {barData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
                    <Activity className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-sm font-medium">No usage data yet</p>
                    <p className="text-xs opacity-70">Start using credits to see analytics</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={barData} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
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
                        tick={{ fill: "hsl(var(--foreground))", fontSize: 10, fontWeight: 500 }}
                        tickLine={false}
                        axisLine={{ stroke: "hsl(var(--border))", strokeOpacity: 0.3 }}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        width={35}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "10px",
                          boxShadow: "0 8px 32px -4px rgb(0 0 0 / 0.3)",
                          color: "hsl(var(--foreground))",
                          padding: "10px 14px",
                          fontSize: "12px",
                        }}
                        cursor={{ fill: "hsl(var(--accent))", opacity: 0.08 }}
                        itemStyle={{ color: "hsl(var(--foreground))", padding: "2px 0", fontSize: "11px" }}
                        labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600, marginBottom: "6px", fontSize: "12px" }}
                      />
                      <Legend 
                        wrapperStyle={{ paddingTop: "12px" }}
                        iconType="circle"
                        iconSize={6}
                        formatter={(value) => {
                          const nameMap: Record<string, string> = {
                            "Apollo": platformNames.apollo,
                            "A-Leads": platformNames.aleads,
                            "Lusha": platformNames.lusha,
                          };
                          return <span className="text-xs text-foreground ml-0.5">{nameMap[value] || value}</span>;
                        }}
                      />
                      <Bar 
                        dataKey="Apollo"
                        name={platformNames.apollo}
                        stackId="a" 
                        fill="url(#apolloGradient)" 
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar 
                        dataKey="A-Leads"
                        name={platformNames.aleads}
                        stackId="a" 
                        fill="url(#aleadsGradient)" 
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar 
                        dataKey="Lusha"
                        name={platformNames.lusha}
                        stackId="a" 
                        fill="url(#lushaGradient)" 
                        radius={[3, 3, 0, 0]}
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