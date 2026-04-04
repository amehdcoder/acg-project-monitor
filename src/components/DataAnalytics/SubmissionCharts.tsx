import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LabelList,
} from "recharts";
import type { FormAnalytics, LocationAnalytics } from "@/hooks/useDataAnalytics";
import { useIsMobile } from "@/hooks/use-mobile";
import { Users, MapPin, FileText, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";

interface SubmissionChartsProps {
  formAnalytics: FormAnalytics[];
  locationAnalytics: LocationAnalytics[];
  loading?: boolean;
}

// FIONET-style KPI sidebar card
const KPISidebarCard = ({
  label, value, color, icon: Icon,
}: {
  label: string; value: string | number; color: string; icon: React.ElementType;
}) => (
  <div className={`rounded-lg p-3 text-white text-center ${color}`}>
    <div className="flex items-center gap-1.5 justify-center mb-1">
      <Icon className="h-3.5 w-3.5" />
      <p className="text-[10px] sm:text-xs font-semibold leading-tight uppercase tracking-wide">{label}</p>
    </div>
    <p className="text-lg sm:text-2xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</p>
  </div>
);

// Stacked percentage bar chart like FIONET dashboards
const StackedPercentageChart = ({
  data,
  title,
  categories,
  colors,
}: {
  data: { name: string; [key: string]: string | number }[];
  title: string;
  categories: { key: string; label: string }[];
  colors: string[];
}) => {
  const isMobile = useIsMobile();

  return (
    <div className="w-full">
      <h3 className="text-sm font-semibold text-primary mb-3">{title}</h3>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3">
        {categories.map((cat, i) => (
          <div key={cat.key} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[i] }} />
            <span className="text-[10px] sm:text-xs text-muted-foreground">{cat.label}</span>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto -mx-2 px-2" style={{ WebkitOverflowScrolling: "touch" }}>
        <div style={{ minWidth: Math.max(data.length * 80, 400), height: isMobile ? 240 : 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => [`${value}%`, name]}
              />
              {categories.map((cat, i) => (
                <Bar key={cat.key} dataKey={cat.key} stackId="a" fill={colors[i]} name={cat.label} radius={i === categories.length - 1 ? [3, 3, 0, 0] : undefined}>
                  <LabelList
                    dataKey={cat.key}
                    position="center"
                    fill="#fff"
                    fontSize={9}
                    fontWeight={600}
                    formatter={(v: number) => v >= 8 ? `${v}%` : ""}
                  />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const SubmissionCharts = ({ formAnalytics, locationAnalytics, loading }: SubmissionChartsProps) => {
  const isMobile = useIsMobile();

  // Compute KPIs from data
  const kpis = useMemo(() => {
    const totalSubmissions = formAnalytics.reduce((s, f) => s + f.total_submissions, 0);
    const currentCycle = formAnalytics.reduce((s, f) => s + f.current_cycle_submissions, 0);
    const totalStates = locationAnalytics.length;
    const topState = locationAnalytics[0];
    return { totalSubmissions, currentCycle, totalStates, topState };
  }, [formAnalytics, locationAnalytics]);

  // Build stacked bar data for forms: current cycle vs historical
  const formChartData = useMemo(() => {
    return formAnalytics.slice(0, 12).map(f => {
      const total = f.total_submissions || 1;
      const currentPct = Math.round((f.current_cycle_submissions / total) * 100);
      const historicalPct = 100 - currentPct;
      return {
        name: f.name.length > 14 ? f.name.slice(0, 12) + "…" : f.name,
        "Current Cycle": currentPct,
        "Historical": historicalPct,
        _total: total,
      };
    });
  }, [formAnalytics]);

  // Build stacked bar data for locations: categorize by volume
  const locationChartData = useMemo(() => {
    if (locationAnalytics.length === 0) return [];
    const maxSub = Math.max(...locationAnalytics.map(l => l.total_submissions));
    return locationAnalytics.slice(0, 12).map(l => {
      const pctOfMax = Math.round((l.total_submissions / maxSub) * 100);
      const highPct = pctOfMax >= 70 ? pctOfMax : 0;
      const medPct = pctOfMax >= 40 && pctOfMax < 70 ? pctOfMax : 0;
      const lowPct = pctOfMax < 40 ? pctOfMax : 0;
      return {
        name: l.state.length > 10 ? l.state.slice(0, 8) + "…" : l.state,
        "Well Covered (≥70%)": highPct,
        "Average (40-70%)": medPct,
        "Low Coverage (<40%)": lowPct,
        _total: l.total_submissions,
      };
    });
  }, [locationAnalytics]);

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2].map(i => (
          <Card key={i} className="border-0 shadow-card animate-pulse">
            <CardHeader><div className="h-6 w-40 bg-muted rounded" /></CardHeader>
            <CardContent><div className="h-64 bg-muted rounded" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Submissions by Form - FIONET style */}
      <Card className="border-0 shadow-card overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-base sm:text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Submissions by Form
          </CardTitle>
        </CardHeader>
        <CardContent>
          {formAnalytics.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No form data available</p>
          ) : (
            <div className="flex gap-4">
              {/* KPI Sidebar */}
              <div className="hidden sm:flex flex-col gap-2 w-28 flex-shrink-0">
                <KPISidebarCard label="Total Submissions" value={kpis.totalSubmissions} color="bg-[hsl(142,60%,35%)]" icon={FileText} />
                <KPISidebarCard label="Current Cycle" value={kpis.currentCycle} color="bg-[hsl(142,50%,45%)]" icon={TrendingUp} />
                <KPISidebarCard label="Active Forms" value={formAnalytics.length} color="bg-[hsl(142,40%,55%)]" icon={CheckCircle} />
                {kpis.currentCycle > 0 && (
                  <KPISidebarCard
                    label="Cycle Rate"
                    value={`${Math.round((kpis.currentCycle / Math.max(kpis.totalSubmissions, 1)) * 100)}%`}
                    color="bg-primary"
                    icon={TrendingUp}
                  />
                )}
              </div>
              {/* Chart */}
              <div className="flex-1 min-w-0">
                <StackedPercentageChart
                  data={formChartData}
                  title="Proportion of Current Cycle vs Historical Submissions"
                  categories={[
                    { key: "Current Cycle", label: "Current Cycle" },
                    { key: "Historical", label: "Historical" },
                  ]}
                  colors={["hsl(142, 60%, 35%)", "hsl(142, 30%, 65%)"]}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submissions by Location - FIONET style with coverage tiers */}
      <Card className="border-0 shadow-card overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-base sm:text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Submissions by Location (State)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {locationAnalytics.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No location data available</p>
          ) : (
            <div className="flex gap-4">
              {/* KPI Sidebar */}
              <div className="hidden sm:flex flex-col gap-2 w-28 flex-shrink-0">
                <KPISidebarCard label="States Covered" value={kpis.totalStates} color="bg-[hsl(142,60%,35%)]" icon={MapPin} />
                {kpis.topState && (
                  <KPISidebarCard label="Top State" value={kpis.topState.state} color="bg-[hsl(142,50%,45%)]" icon={TrendingUp} />
                )}
                <KPISidebarCard
                  label="Total Submissions"
                  value={locationAnalytics.reduce((s, l) => s + l.total_submissions, 0)}
                  color="bg-[hsl(142,40%,55%)]"
                  icon={Users}
                />
                {locationAnalytics.some(l => l.total_submissions < 10) && (
                  <KPISidebarCard label="Low Coverage" value={locationAnalytics.filter(l => l.total_submissions < 10).length} color="bg-destructive" icon={AlertTriangle} />
                )}
              </div>
              {/* Chart */}
              <div className="flex-1 min-w-0">
                <StackedPercentageChart
                  data={locationChartData}
                  title="Coverage Level by State"
                  categories={[
                    { key: "Well Covered (≥70%)", label: "Well Covered (≥70%)" },
                    { key: "Average (40-70%)", label: "Averagely Covered (40-70%)" },
                    { key: "Low Coverage (<40%)", label: "Poorly Covered (<40%)" },
                  ]}
                  colors={["hsl(142, 60%, 35%)", "hsl(45, 80%, 50%)", "hsl(0, 70%, 50%)"]}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SubmissionCharts;
