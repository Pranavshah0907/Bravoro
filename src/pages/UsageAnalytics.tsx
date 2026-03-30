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
  cognism_credits: number;
  theirstack_credits: number;
  created_at: string;
}


// Helper function to get platform names based on admin status
// Platform A = Cognism, B = Apollo, C = ALeads, D = Lusha, Job Search = Theirstack
const getPlatformNames = (isAdmin: boolean) => ({
  cognism: isAdmin ? "Cognism" : "Platform A",
  apollo: isAdmin ? "Apollo" : "Platform B",
  aleads: isAdmin ? "ALeads" : "Platform C",
  lusha: isAdmin ? "Lusha" : "Platform D",
  theirstack: isAdmin ? "Theirstack" : "Job Search Platform",
});

const COLORS = {
  cognism: "#8b5cf6",
  apollo: "#06b6d4",
  aleads: "#10b981",
  lusha: "#3b82f6",
  theirstack: "#f59e0b",
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
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [activePieIndex, setActivePieIndex] = useState<number | undefined>(undefined);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

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
      setIsDeveloper(user.email === "pranavshah0907@gmail.com");

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
        cognism: acc.cognism + (curr.cognism_credits ?? 0),
        apollo: acc.apollo + curr.apollo_credits,
        aleads: acc.aleads + curr.aleads_credits,
        lusha: acc.lusha + curr.lusha_credits,
        theirstack: acc.theirstack + (curr.theirstack_credits ?? 0),
      }),
      { cognism: 0, apollo: 0, aleads: 0, lusha: 0, theirstack: 0 }
    );
  };

  const platformNames = getPlatformNames(isAdmin);


  const getBarChartData = () => {
    const now = new Date();
    type PeriodEntry = { date: string; Cognism: number; Apollo: number; ALeads: number; Lusha: number; Theirstack: number; sortDate: Date };

    // Handle custom date range
    if (timePeriod === "custom" && dateRange?.from && dateRange?.to) {
      const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
      const periods: PeriodEntry[] = [];

      // Group by appropriate interval based on range size
      const dayCount = days.length;

      if (dayCount <= 14) {
        // Show daily for up to 2 weeks
        days.forEach(day => {
          periods.push({ date: format(day, "MMM d"), Cognism: 0, Apollo: 0, ALeads: 0, Lusha: 0, Theirstack: 0, sortDate: day });
        });

        creditData.forEach((item) => {
          const date = new Date(item.created_at);
          periods.forEach((period) => {
            if (format(date, "MMM d yyyy") === format(period.sortDate, "MMM d yyyy")) {
              period.Cognism += item.cognism_credits ?? 0;
              period.Apollo += item.apollo_credits;
              period.ALeads += item.aleads_credits;
              period.Lusha += item.lusha_credits;
              period.Theirstack += item.theirstack_credits ?? 0;
            }
          });
        });
      } else if (dayCount <= 90) {
        // Show weekly for up to 3 months
        const weeks = eachWeekOfInterval({ start: dateRange.from, end: dateRange.to });
        weeks.forEach(week => {
          periods.push({ date: format(week, "MMM d"), Cognism: 0, Apollo: 0, ALeads: 0, Lusha: 0, Theirstack: 0, sortDate: week });
        });

        creditData.forEach((item) => {
          const date = new Date(item.created_at);
          const itemWeekStart = startOfWeek(date);
          periods.forEach((period) => {
            if (format(itemWeekStart, "MMM d yyyy") === format(period.sortDate, "MMM d yyyy")) {
              period.Cognism += item.cognism_credits ?? 0;
              period.Apollo += item.apollo_credits;
              period.ALeads += item.aleads_credits;
              period.Lusha += item.lusha_credits;
              period.Theirstack += item.theirstack_credits ?? 0;
            }
          });
        });
      } else {
        // Show monthly for longer ranges
        const months = eachMonthOfInterval({ start: dateRange.from, end: dateRange.to });
        months.forEach(month => {
          periods.push({ date: format(month, "MMM yyyy"), Cognism: 0, Apollo: 0, ALeads: 0, Lusha: 0, Theirstack: 0, sortDate: month });
        });

        creditData.forEach((item) => {
          const date = new Date(item.created_at);
          periods.forEach((period) => {
            if (format(date, "MMM yyyy") === period.date) {
              period.Cognism += item.cognism_credits ?? 0;
              period.Apollo += item.apollo_credits;
              period.ALeads += item.aleads_credits;
              period.Lusha += item.lusha_credits;
              period.Theirstack += item.theirstack_credits ?? 0;
            }
          });
        });
      }

      return periods.map(({ date, Cognism, Apollo, ALeads, Lusha, Theirstack }) => ({ date, Cognism, Apollo, ALeads, Lusha, Theirstack }));
    }

    const limit = timePeriod === "daily" ? 7 : timePeriod === "weekly" ? 5 : timePeriod === "monthly" ? 6 : 4;

    const periods: PeriodEntry[] = [];

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

      periods.push({ date: dateLabel, Cognism: 0, Apollo: 0, ALeads: 0, Lusha: 0, Theirstack: 0, sortDate: periodDate });
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
          period.Cognism += item.cognism_credits ?? 0;
          period.Apollo += item.apollo_credits;
          period.ALeads += item.aleads_credits;
          period.Lusha += item.lusha_credits;
          period.Theirstack += item.theirstack_credits ?? 0;
        }
      });
    });

    return periods.map(({ date, Cognism, Apollo, ALeads, Lusha, Theirstack }) => ({ date, Cognism, Apollo, ALeads, Lusha, Theirstack }));
  };

  // Calculate period totals for the selected time range
  const periodTotals = useMemo(() => {
    const barData = getBarChartData();
    return barData.reduce(
      (acc, curr) => ({
        cognism: acc.cognism + curr.Cognism,
        apollo: acc.apollo + curr.Apollo,
        aleads: acc.aleads + curr.ALeads,
        lusha: acc.lusha + curr.Lusha,
        theirstack: acc.theirstack + curr.Theirstack,
      }),
      { cognism: 0, apollo: 0, aleads: 0, lusha: 0, theirstack: 0 }
    );
  }, [creditData, timePeriod, dateRange]);

  const periodGrandTotal = periodTotals.cognism + periodTotals.apollo + periodTotals.aleads + periodTotals.lusha + periodTotals.theirstack;

  const getPeriodLabel = () => {
    if (timePeriod === "custom" && dateRange?.from && dateRange?.to) {
      return `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d, yyyy")}`;
    }
    switch (timePeriod) {
      case "daily": return "Last 7 Days";
      case "weekly": return "Last 5 Weeks";
      case "monthly": return "Last 6 Months";
      case "quarterly": return "Last 4 Quarters";
      default: return "";
    }
  };

  const barData = getBarChartData();
  const totals = getTotalCredits();
  const grandTotal = totals.cognism + totals.apollo + totals.aleads + totals.lusha + totals.theirstack;

  // Billing cycle = 1st of current month → today
  const billingCycleStart = startOfMonth(new Date());
  const billingCycleData = creditData.filter(item => new Date(item.created_at) >= billingCycleStart);
  const billingCyclePlatformTotals = billingCycleData.reduce(
    (acc, item) => ({
      cognism: acc.cognism + (item.cognism_credits ?? 0),
      apollo: acc.apollo + item.apollo_credits,
      aleads: acc.aleads + item.aleads_credits,
      lusha: acc.lusha + item.lusha_credits,
      theirstack: acc.theirstack + (item.theirstack_credits ?? 0),
    }),
    { cognism: 0, apollo: 0, aleads: 0, lusha: 0, theirstack: 0 }
  );
  const billingCycleTotal = billingCyclePlatformTotals.cognism + billingCyclePlatformTotals.apollo + billingCyclePlatformTotals.aleads + billingCyclePlatformTotals.lusha + billingCyclePlatformTotals.theirstack;
  const billingCycleDateLabel = `${format(billingCycleStart, "MMM d")} – ${format(new Date(), "MMM d, yyyy")}`;

  // Pie chart reflects the currently selected bar chart period
  const pieData = [
    { name: platformNames.cognism, value: periodTotals.cognism, color: COLORS.cognism },
    { name: platformNames.apollo, value: periodTotals.apollo, color: COLORS.apollo },
    { name: platformNames.aleads, value: periodTotals.aleads, color: COLORS.aleads },
    { name: platformNames.lusha, value: periodTotals.lusha, color: COLORS.lusha },
    { name: platformNames.theirstack, value: periodTotals.theirstack, color: COLORS.theirstack },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      <AppSidebar isAdmin={isAdmin} isDeveloper={isDeveloper} onSignOut={handleSignOut} />

      <main className="flex-1 ml-16 min-h-screen">
        {/* Background Effects — same as Dashboard */}
        <div className="fixed inset-0 ml-16 pointer-events-none overflow-hidden">
          <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full opacity-25" style={{
            background: "radial-gradient(ellipse, #009da5 0%, transparent 65%)",
            filter: "blur(60px)",
            animation: "float 22s ease-in-out infinite",
          }} />
          <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full" style={{
            background: "radial-gradient(circle, #58dddd 0%, transparent 65%)",
            filter: "blur(80px)",
            opacity: 0.15,
            animation: "float 18s ease-in-out infinite reverse",
          }} />
        </div>

        <div className="relative z-10 p-6 md:p-8 max-w-7xl mx-auto space-y-10">
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

          {/* Stats Section */}
          <div className="space-y-3 animate-fade-in" style={{ animationDelay: "0.05s" }}>
            {/* Billing cycle header — outside the tiles */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-[3px] h-5 rounded-full bg-primary" />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">Total Credits</span>
                  <span className="text-muted-foreground/35 select-none">·</span>
                  <span className="text-xs font-medium text-primary">Billing Cycle</span>
                  <span className="text-muted-foreground/35 select-none">·</span>
                  <span className="text-xs text-muted-foreground">{billingCycleDateLabel}</span>
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-foreground tabular-nums leading-none">{billingCycleTotal.toLocaleString()}</span>
                <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-medium">credits</span>
              </div>
            </div>

            {/* Separator */}
            <div className="h-px bg-gradient-to-r from-primary/40 via-border/60 to-transparent" />

            {/* Platform breakdown tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { name: platformNames.cognism, value: billingCyclePlatformTotals.cognism, color: COLORS.cognism },
                { name: platformNames.apollo, value: billingCyclePlatformTotals.apollo, color: COLORS.apollo },
                { name: platformNames.aleads, value: billingCyclePlatformTotals.aleads, color: COLORS.aleads },
                { name: platformNames.lusha, value: billingCyclePlatformTotals.lusha, color: COLORS.lusha },
                { name: platformNames.theirstack, value: billingCyclePlatformTotals.theirstack, color: COLORS.theirstack },
              ].map((item, index) => (
                <Card
                  key={item.name}
                  className="border-border/40 bg-gradient-to-br from-card to-card/80 hover:border-border/60 transition-all duration-300 group"
                  style={{ animationDelay: `${0.08 + index * 0.04}s` }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{item.name}</p>
                        <p className="text-xl font-bold text-foreground mt-0.5 tabular-nums">{item.value.toLocaleString()}</p>
                      </div>
                      <div
                        className="p-2.5 rounded-lg transition-transform duration-300 group-hover:scale-110"
                        style={{ backgroundColor: `${item.color}20` }}
                      >
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Charts section */}
          <div className="space-y-3">
            {/* Section header */}
            <div className="flex items-center gap-3">
              <div className="w-[3px] h-5 rounded-full bg-accent" />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-foreground">Usage Breakdown</span>
                <span className="text-muted-foreground/35 select-none">·</span>
                <span className="text-xs text-muted-foreground">Credit distribution &amp; usage over time</span>
              </div>
            </div>
            <div className="h-px bg-gradient-to-r from-accent/40 via-border/60 to-transparent" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Pie Chart Card */}
            <Card className="lg:col-span-4 border-border/40 bg-gradient-to-br from-card via-card to-card/90 backdrop-blur-sm animate-fade-in overflow-hidden relative flex flex-col" style={{ animationDelay: "0.15s" }}>
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-accent to-primary opacity-60" />
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-base text-foreground flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Credit Distribution
                  <span className="text-[10px] font-normal text-muted-foreground ml-1">({getPeriodLabel()})</span>
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
                      { name: platformNames.cognism, value: periodTotals.cognism, color: COLORS.cognism },
                      { name: platformNames.apollo, value: periodTotals.apollo, color: COLORS.apollo },
                      { name: platformNames.aleads, value: periodTotals.aleads, color: COLORS.aleads },
                      { name: platformNames.lusha, value: periodTotals.lusha, color: COLORS.lusha },
                      { name: platformNames.theirstack, value: periodTotals.theirstack, color: COLORS.theirstack },
                    ].map((item, index) => {
                      const percentage = periodGrandTotal > 0 ? ((item.value / periodGrandTotal) * 100).toFixed(1) : "0";
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
            <Card className="lg:col-span-8 border-border/40 bg-gradient-to-br from-card via-card to-card/90 backdrop-blur-sm animate-fade-in overflow-hidden relative flex flex-col" style={{ animationDelay: "0.2s" }}>
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
                      { name: platformNames.cognism, value: periodTotals.cognism, color: COLORS.cognism },
                      { name: platformNames.apollo, value: periodTotals.apollo, color: COLORS.apollo },
                      { name: platformNames.aleads, value: periodTotals.aleads, color: COLORS.aleads },
                      { name: platformNames.lusha, value: periodTotals.lusha, color: COLORS.lusha },
                      { name: platformNames.theirstack, value: periodTotals.theirstack, color: COLORS.theirstack },
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
              <CardContent className="pb-4 flex-1 flex flex-col min-h-0">
                {barData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 min-h-[280px] text-muted-foreground">
                    <Activity className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-sm font-medium">No usage data yet</p>
                    <p className="text-xs opacity-70">Start using credits to see analytics</p>
                  </div>
                ) : (
                  <div className="flex-1 min-h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                      <defs>
                        <linearGradient id="cognismGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLORS.cognism} stopOpacity={1}/>
                          <stop offset="100%" stopColor={COLORS.cognism} stopOpacity={0.7}/>
                        </linearGradient>
                        <linearGradient id="apolloGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLORS.apollo} stopOpacity={1}/>
                          <stop offset="100%" stopColor={COLORS.apollo} stopOpacity={0.7}/>
                        </linearGradient>
                        <linearGradient id="aleadsGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLORS.aleads} stopOpacity={1}/>
                          <stop offset="100%" stopColor={COLORS.aleads} stopOpacity={0.7}/>
                        </linearGradient>
                        <linearGradient id="lushaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLORS.lusha} stopOpacity={1}/>
                          <stop offset="100%" stopColor={COLORS.lusha} stopOpacity={0.7}/>
                        </linearGradient>
                        <linearGradient id="theirstackGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLORS.theirstack} stopOpacity={1}/>
                          <stop offset="100%" stopColor={COLORS.theirstack} stopOpacity={0.7}/>
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
                            "Cognism": platformNames.cognism,
                            "Apollo": platformNames.apollo,
                            "ALeads": platformNames.aleads,
                            "Lusha": platformNames.lusha,
                            "Theirstack": platformNames.theirstack,
                          };
                          return <span className="text-xs text-foreground ml-0.5">{nameMap[value] || value}</span>;
                        }}
                      />
                      <Bar
                        dataKey="Cognism"
                        name={platformNames.cognism}
                        stackId="a"
                        fill="url(#cognismGradient)"
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="Apollo"
                        name={platformNames.apollo}
                        stackId="a"
                        fill="url(#apolloGradient)"
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="ALeads"
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
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="Theirstack"
                        name={platformNames.theirstack}
                        stackId="a"
                        fill="url(#theirstackGradient)"
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          </div>{/* end Charts section */}
        </div>
      </main>
    </div>
  );
};

export default UsageAnalytics;