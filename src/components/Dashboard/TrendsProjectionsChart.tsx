import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceDot, Legend,
} from "recharts";
import { TrendingUp, AlertTriangle, Award } from "lucide-react";
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

      if (!submissions || submissions.length === 0) return;

      // Count by day for last 14 days
      const dailyCounts: Record<string, number> = {};
      const now = new Date();
      
      // Initialize last 14 days
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0];
        dailyCounts[key] = 0;
      }

      submissions.forEach((s: any) => {
        const day = s.created_at.split("T")[0];
        if (day in dailyCounts) dailyCounts[day]++;
      });

      const sortedDays = Object.entries(dailyCounts)
        .sort(([a], [b]) => a.localeCompare(b));

      // Calculate 7-day moving average
      const values = sortedDays.map(([_, count]) => count);
      const movingAvg: (number | null)[] = values.map((_, i) => {
        if (i < 6) return null;
        const slice = values.slice(i - 6, i + 1);
        return Math.round(slice.reduce((a, b) => a + b, 0) / 7 * 10) / 10;
      });

      // Simple 3-day forecast using linear regression on last 7 days
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

      // Detect anomalies (spike or drop > 2x avg)
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

      // Add 3 forecast days
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
    }
  };

  if (chartData.length === 0) return null;

  return (
    <Card className="border border-border/30 shadow-card bg-card/95 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-sm sm:text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            Trends & Projections
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {anomalies.length > 0 && (
              <Badge variant="outline" className="text-[9px] h-5 border-amber-500/50 text-amber-600">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                {anomalies.length}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: isMobile ? 220 : 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 11,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="line" iconSize={10} />

              {/* Submissions bars as area */}
              <Line
                type="monotone"
                dataKey="submissions"
                stroke="hsl(142, 60%, 35%)"
                strokeWidth={2}
                dot={{ r: 3, fill: "hsl(142, 60%, 35%)" }}
                activeDot={{ r: 5 }}
                name="Submissions"
                connectNulls={false}
              />
              
              {/* 7-day average */}
              <Line
                type="monotone"
                dataKey="avg7"
                stroke="hsl(142, 50%, 55%)"
                strokeWidth={2}
                strokeDasharray="none"
                dot={false}
                name="7-Day Average"
                connectNulls
              />
              
              {/* 3-day forecast */}
              <Line
                type="monotone"
                dataKey="forecast"
                stroke="hsl(0, 70%, 55%)"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3, fill: "hsl(0, 70%, 55%)" }}
                name="3-Day Forecast"
                connectNulls
              />

              {/* Anomaly markers */}
              {anomalies.map((a) => {
                const point = chartData.find((d) => d.date === a.date);
                if (!point) return null;
                return (
                  <ReferenceDot
                    key={a.date}
                    x={point.label}
                    y={point.submissions}
                    r={6}
                    fill={a.type === "spike" ? "hsl(142, 60%, 35%)" : "hsl(0, 70%, 55%)"}
                    stroke="white"
                    strokeWidth={2}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default TrendsProjectionsChart;
