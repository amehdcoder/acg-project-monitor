import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceDot, Legend,
} from "recharts";
import { TrendingUp, AlertTriangle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";

interface DayData {
  date: string;
  label: string;
  submissions: number;
  avg7: number | null;
  forecast: number | null;
  isForecast?: boolean;
}

interface TrendsProps {
  selectedProjectId?: string | null;
}

const TrendsProjectionsChart = ({ selectedProjectId }: TrendsProps) => {
  const isMobile = useIsMobile();
  const [chartData, setChartData] = useState<DayData[]>([]);
  const [anomalies, setAnomalies] = useState<{ date: string; type: string; value: number; avg: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [forecastSlope, setForecastSlope] = useState(0);

  useEffect(() => {
    fetchTrendsData();
    const channel = supabase
      .channel("dss-trends")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, fetchTrendsData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedProjectId]);

  const fetchTrendsData = async () => {
    try {
      let formIds: string[] | null = null;
      if (selectedProjectId) {
        const { data: forms } = await supabase.from("forms").select("id").eq("project_id", selectedProjectId);
        formIds = (forms || []).map(f => f.id);
        if (formIds.length === 0) { setChartData([]); setLoading(false); return; }
      }

      let query = supabase
        .from("form_submissions")
        .select("created_at, form_id")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (formIds) query = query.in("form_id", formIds);
      const { data: submissions } = await query;

      if (!submissions || submissions.length === 0) { setLoading(false); return; }

      const dailyCounts: Record<string, number> = {};
      const now = new Date();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dailyCounts[d.toISOString().split("T")[0]] = 0;
      }

      submissions.forEach((s: any) => {
        const day = s.created_at.split("T")[0];
        if (day in dailyCounts) dailyCounts[day]++;
      });

      const sortedDays = Object.entries(dailyCounts).sort(([a], [b]) => a.localeCompare(b));
      const values = sortedDays.map(([_, count]) => count);
      const movingAvg: (number | null)[] = values.map((_, i) => {
        if (i < 6) return null;
        const slice = values.slice(i - 6, i + 1);
        return Math.round(slice.reduce((a, b) => a + b, 0) / 7 * 10) / 10;
      });

      const lastWeek = values.slice(-7);
      const n = lastWeek.length;
      const xMean = (n - 1) / 2;
      const yMean = lastWeek.reduce((a, b) => a + b, 0) / n;
      let slope = 0;
      let denom = 0;
      lastWeek.forEach((y, x) => {
        slope += (x - xMean) * (y - yMean);
        denom += (x - xMean) * (x - xMean);
      });
      slope = denom > 0 ? slope / denom : 0;
      const intercept = yMean - slope * xMean;
      setForecastSlope(slope);

      const avgLast7 = yMean;
      const stdDev = Math.sqrt(lastWeek.reduce((s, v) => s + Math.pow(v - avgLast7, 2), 0) / n);
      const detectedAnomalies: { date: string; type: string; value: number; avg: number }[] = [];

      const data: DayData[] = sortedDays.map(([date, count], i) => {
        const zScore = stdDev > 0 ? (count - avgLast7) / stdDev : 0;
        if (zScore > 2 && avgLast7 > 0) {
          detectedAnomalies.push({ date, type: "spike", value: count, avg: Math.round(avgLast7 * 10) / 10 });
        } else if (zScore < -2 && avgLast7 > 2 && i > 6) {
          detectedAnomalies.push({ date, type: "drop", value: count, avg: Math.round(avgLast7 * 10) / 10 });
        }
        return {
          date,
          label: new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          submissions: count,
          avg7: movingAvg[i],
          forecast: null,
        };
      });

      for (let f = 1; f <= 3; f++) {
        const forecastDate = new Date(now);
        forecastDate.setDate(forecastDate.getDate() + f);
        const forecastVal = Math.max(0, Math.round(intercept + slope * (n - 1 + f)));
        data.push({
          date: forecastDate.toISOString().split("T")[0],
          label: forecastDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          submissions: 0,
          avg7: null,
          forecast: forecastVal,
          isForecast: true,
        });
      }

      setChartData(data);
      setAnomalies(detectedAnomalies);
    } catch (err) {
      console.error("Trends fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-[280px] rounded-lg w-full" />;
  }

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
        <TrendingUp className="h-8 w-8 opacity-30 mb-2" />
        <p className="text-sm">No trend data available yet</p>
      </div>
    );
  }

  const trendDirection = forecastSlope > 0.5 ? "upward" : forecastSlope < -0.5 ? "downward" : "stable";

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm sm:text-base flex items-center gap-2 font-semibold text-foreground">
          <TrendingUp className="h-4 w-4 text-status-success" />
          Trends & Projections
        </h3>
        <div className="flex items-center gap-1.5">
          {anomalies.length > 0 && (
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[9px] h-5 border-status-warning/50 text-status-warning cursor-help">
                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                    {anomalies.length} anomal{anomalies.length === 1 ? "y" : "ies"}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs p-3 space-y-1.5">
                  <p className="font-semibold">Statistical Anomaly Detection</p>
                  <p className="text-muted-foreground">
                    Days where submissions deviate more than <strong>2 standard deviations</strong> from the 7-day rolling average are flagged as anomalies.
                  </p>
                  <div className="border-t border-border pt-1.5 mt-1.5 space-y-1">
                    {anomalies.map((a, i) => (
                      <p key={i}>
                        <span className="font-medium">{new Date(a.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}:</span>{" "}
                        {a.type === "spike" ? "📈 Spike" : "📉 Drop"} — {a.value} submissions vs {a.avg} avg
                      </p>
                    ))}
                  </div>
                  <p className="text-muted-foreground italic">Investigate spikes for possible data dumping; drops may indicate field access issues or worker inactivity.</p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          )}
          <TooltipProvider>
            <UITooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] h-5 cursor-help gap-0.5">
                  <Info className="h-2.5 w-2.5" />
                  Forecast: {trendDirection}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs p-3 space-y-1.5">
                <p className="font-semibold">3-Day Forecast Methodology</p>
                <p className="text-muted-foreground">
                  Uses <strong>Ordinary Least Squares (OLS) linear regression</strong> fitted on the last 7 days of submission counts.
                </p>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                  <li>Slope (β₁) = Σ(xᵢ−x̄)(yᵢ−ȳ) / Σ(xᵢ−x̄)²</li>
                  <li>Intercept (β₀) = ȳ − β₁·x̄</li>
                  <li>Forecast(day) = β₀ + β₁ · day</li>
                </ul>
                <p className="text-muted-foreground">
                  Current slope: <strong>{forecastSlope > 0 ? "+" : ""}{forecastSlope.toFixed(2)}</strong> submissions/day.{" "}
                  {trendDirection === "upward" ? "Submissions are trending upward — good momentum." : trendDirection === "downward" ? "Submissions are declining — may need intervention." : "Submissions are relatively stable."}
                </p>
                <p className="text-muted-foreground italic">
                  Note: This is a short-term linear projection. Accuracy decreases for longer horizons or volatile data.
                </p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        </div>
      </div>
      <div style={{ height: isMobile ? 220 : 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 11,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="line" iconSize={10} />
            <Line type="monotone" dataKey="submissions" stroke="hsl(var(--chart-primary))" strokeWidth={2} dot={{ r: 3, fill: "hsl(var(--chart-primary))" }} activeDot={{ r: 5 }} name="Submissions" connectNulls={false} />
            <Line type="monotone" dataKey="avg7" stroke="hsl(var(--chart-secondary))" strokeWidth={2} dot={false} name="7-Day Average" connectNulls />
            <Line type="monotone" dataKey="forecast" stroke="hsl(var(--chart-danger))" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "hsl(var(--chart-danger))" }} name="3-Day Forecast" connectNulls />
            {anomalies.map((a) => {
              const point = chartData.find((d) => d.date === a.date);
              if (!point) return null;
              return (
                <ReferenceDot
                  key={a.date}
                  x={point.label}
                  y={point.submissions}
                  r={6}
                  fill={a.type === "spike" ? "hsl(var(--chart-primary))" : "hsl(var(--chart-danger))"}
                  stroke="white"
                  strokeWidth={2}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TrendsProjectionsChart;
