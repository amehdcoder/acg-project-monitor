import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceDot, Legend,
} from "recharts";
import { TrendingUp, AlertTriangle } from "lucide-react";
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

const TrendsProjectionsChart = () => {
  const isMobile = useIsMobile();
  const [chartData, setChartData] = useState<DayData[]>([]);
  const [anomalies, setAnomalies] = useState<{ date: string; type: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrendsData();
    const channel = supabase
      .channel("dss-trends")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, fetchTrendsData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchTrendsData = async () => {
    try {
      const { data: submissions } = await supabase
        .from("form_submissions")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1000);

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

      const avgLast7 = yMean;
      const detectedAnomalies: { date: string; type: string }[] = [];

      const data: DayData[] = sortedDays.map(([date, count], i) => {
        if (count > avgLast7 * 2.5 && avgLast7 > 0) {
          detectedAnomalies.push({ date, type: "spike" });
        } else if (count < avgLast7 * 0.2 && avgLast7 > 2 && i > 6) {
          detectedAnomalies.push({ date, type: "drop" });
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

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm sm:text-base flex items-center gap-2 font-semibold text-foreground">
          <TrendingUp className="h-4 w-4 text-status-success" />
          Trends & Projections
        </h3>
        <div className="flex items-center gap-1.5">
          {anomalies.length > 0 && (
            <Badge variant="outline" className="text-[9px] h-5 border-status-warning/50 text-status-warning">
              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
              {anomalies.length}
            </Badge>
          )}
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
