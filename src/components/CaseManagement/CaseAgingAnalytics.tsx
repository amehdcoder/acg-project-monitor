import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { Clock, TrendingUp, Timer, Hourglass, CheckCircle2, AlertTriangle } from "lucide-react";
import { differenceInDays, differenceInHours, format, startOfMonth, subMonths } from "date-fns";

interface CaseAgingCase {
  id: string;
  name: string;
  status: "open" | "closed";
  openedAt: string;
  lastModifiedAt: string;
  closedAt?: string | null;
  caseTypeLabel: string;
  caseTypeId: string;
}

interface CaseAgingAnalyticsProps {
  cases: CaseAgingCase[];
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--primary) / 0.7)",
  "hsl(var(--primary) / 0.5)",
  "hsl(var(--primary) / 0.35)",
  "hsl(var(--primary) / 0.2)",
];

const AGING_BUCKETS = [
  { label: "0–7 days", min: 0, max: 7 },
  { label: "8–14 days", min: 8, max: 14 },
  { label: "15–30 days", min: 15, max: 30 },
  { label: "31–60 days", min: 31, max: 60 },
  { label: "61–90 days", min: 61, max: 90 },
  { label: "90+ days", min: 91, max: Infinity },
];

const CaseAgingAnalytics = ({ cases }: CaseAgingAnalyticsProps) => {
  const analytics = useMemo(() => {
    const now = new Date();
    const closedCases = cases.filter((c) => c.status === "closed" && c.closedAt);
    const openCases = cases.filter((c) => c.status === "open");

    // Time-to-close for closed cases
    const closeDurations = closedCases.map((c) =>
      differenceInDays(new Date(c.closedAt!), new Date(c.openedAt))
    );

    const avgTimeToClose =
      closeDurations.length > 0
        ? closeDurations.reduce((s, d) => s + d, 0) / closeDurations.length
        : 0;

    const medianTimeToClose =
      closeDurations.length > 0
        ? (() => {
            const sorted = [...closeDurations].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0
              ? sorted[mid]
              : (sorted[mid - 1] + sorted[mid]) / 2;
          })()
        : 0;

    const minTimeToClose = closeDurations.length > 0 ? Math.min(...closeDurations) : 0;
    const maxTimeToClose = closeDurations.length > 0 ? Math.max(...closeDurations) : 0;

    // Open case aging
    const openAgeDays = openCases.map((c) => differenceInDays(now, new Date(c.openedAt)));
    const avgOpenAge =
      openAgeDays.length > 0
        ? openAgeDays.reduce((s, d) => s + d, 0) / openAgeDays.length
        : 0;

    // Distribution buckets for closed cases
    const closedDistribution = AGING_BUCKETS.map((bucket) => ({
      name: bucket.label,
      count: closeDurations.filter((d) => d >= bucket.min && d <= bucket.max).length,
    }));

    // Open aging distribution
    const openDistribution = AGING_BUCKETS.map((bucket) => ({
      name: bucket.label,
      count: openAgeDays.filter((d) => d >= bucket.min && d <= bucket.max).length,
    }));

    // By case type
    const caseTypeIds = [...new Set(cases.map((c) => c.caseTypeId))];
    const byType = caseTypeIds.map((typeId) => {
      const typeCases = cases.filter((c) => c.caseTypeId === typeId);
      const closed = typeCases.filter((c) => c.status === "closed" && c.closedAt);
      const durations = closed.map((c) =>
        differenceInDays(new Date(c.closedAt!), new Date(c.openedAt))
      );
      const avg = durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : 0;
      return {
        name: typeCases[0]?.caseTypeLabel || typeId,
        avgDays: Math.round(avg * 10) / 10,
        closedCount: closed.length,
        openCount: typeCases.filter((c) => c.status === "open").length,
      };
    });

    // Monthly closure trend (last 6 months)
    const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
      const monthStart = startOfMonth(subMonths(now, 5 - i));
      const monthEnd = startOfMonth(subMonths(now, 4 - i));
      const monthLabel = format(monthStart, "MMM yyyy");

      const closedInMonth = closedCases.filter((c) => {
        const d = new Date(c.closedAt!);
        return d >= monthStart && d < (i === 5 ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : monthEnd);
      });

      const openedInMonth = cases.filter((c) => {
        const d = new Date(c.openedAt);
        return d >= monthStart && d < (i === 5 ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : monthEnd);
      });

      return {
        month: format(monthStart, "MMM"),
        opened: openedInMonth.length,
        closed: closedInMonth.length,
      };
    });

    // Status pie chart
    const statusPie = [
      { name: "Open", value: openCases.length },
      { name: "Closed", value: closedCases.length },
    ];

    return {
      totalCases: cases.length,
      openCount: openCases.length,
      closedCount: closedCases.length,
      avgTimeToClose: Math.round(avgTimeToClose * 10) / 10,
      medianTimeToClose: Math.round(medianTimeToClose * 10) / 10,
      minTimeToClose,
      maxTimeToClose,
      avgOpenAge: Math.round(avgOpenAge * 10) / 10,
      closedDistribution,
      openDistribution,
      byType,
      monthlyTrend,
      statusPie,
    };
  }, [cases]);

  if (cases.length === 0) {
    return (
      <Card className="border-0 shadow-card">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Timer className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <h3 className="font-semibold text-foreground">No Analytics Data</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Case aging analytics will appear once cases are created.
          </p>
        </CardContent>
      </Card>
    );
  }

  const formatDays = (days: number) => {
    if (days === 0) return "< 1 day";
    if (days === 1) return "1 day";
    return `${days} days`;
  };

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-0 shadow-card overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-primary/60" />
          <CardContent className="p-4 relative">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Avg Time to Close</p>
                <p className="font-display text-2xl font-bold text-foreground mt-1">
                  {analytics.avgTimeToClose}
                  <span className="text-sm font-normal text-muted-foreground ml-1">days</span>
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Median: {formatDays(analytics.medianTimeToClose)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-card overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-amber-400" />
          <CardContent className="p-4 relative">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Avg Open Age</p>
                <p className="font-display text-2xl font-bold text-foreground mt-1">
                  {analytics.avgOpenAge}
                  <span className="text-sm font-normal text-muted-foreground ml-1">days</span>
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                <Hourglass className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              {analytics.openCount} open case{analytics.openCount !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-card overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-400" />
          <CardContent className="p-4 relative">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Closure Rate</p>
                <p className="font-display text-2xl font-bold text-foreground mt-1">
                  {analytics.totalCases > 0
                    ? Math.round((analytics.closedCount / analytics.totalCases) * 100)
                    : 0}
                  <span className="text-sm font-normal text-muted-foreground ml-0.5">%</span>
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              {analytics.closedCount} of {analytics.totalCases} cases closed
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-card overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-500 to-rose-400" />
          <CardContent className="p-4 relative">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Longest Open</p>
                <p className="font-display text-2xl font-bold text-foreground mt-1">
                  {analytics.openDistribution.reduce((max, b) => {
                    if (b.count > 0) return b.name;
                    return max;
                  }, "N/A")}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Range: {formatDays(analytics.minTimeToClose)} – {formatDays(analytics.maxTimeToClose)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Case Duration Distribution (Closed) */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary" />
              Time-to-Close Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              How long closed cases took to resolve
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {analytics.closedCount === 0 ? (
              <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                No closed cases yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={analytics.closedDistribution} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [`${value} cases`, "Count"]}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Open Case Aging */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Hourglass className="h-4 w-4 text-amber-600" />
              Open Case Aging
            </CardTitle>
            <CardDescription className="text-xs">
              How long currently open cases have been active
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {analytics.openCount === 0 ? (
              <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                No open cases
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={analytics.openDistribution} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [`${value} cases`, "Count"]}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary) / 0.6)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Trend */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Monthly Case Flow
            </CardTitle>
            <CardDescription className="text-xs">
              Cases opened vs closed over the last 6 months
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={analytics.monthlyTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="openedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="closedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="opened"
                  stroke="hsl(var(--primary))"
                  fill="url(#openedGrad)"
                  strokeWidth={2}
                  name="Opened"
                />
                <Area
                  type="monotone"
                  dataKey="closed"
                  stroke="hsl(142, 71%, 45%)"
                  fill="url(#closedGrad)"
                  strokeWidth={2}
                  name="Closed"
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px" }}
                  iconType="circle"
                  iconSize={8}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Avg Duration by Case Type */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Avg Duration by Case Type
            </CardTitle>
            <CardDescription className="text-xs">
              Average days to close, grouped by case type
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {analytics.byType.length === 0 ? (
              <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                No data
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                {analytics.byType.map((ct) => {
                  const maxDays = Math.max(...analytics.byType.map((t) => t.avgDays), 1);
                  const pct = (ct.avgDays / maxDays) * 100;
                  return (
                    <div key={ct.name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground truncate max-w-[50%]">
                          {ct.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {ct.closedCount} closed
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {ct.openCount} open
                          </Badge>
                          <span className="text-xs font-semibold text-foreground w-16 text-right">
                            {ct.avgDays}d avg
                          </span>
                        </div>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CaseAgingAnalytics;
