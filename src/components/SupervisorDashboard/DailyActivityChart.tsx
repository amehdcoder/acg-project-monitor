import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Clock } from "lucide-react";
import { DailyActivitySummary } from "@/hooks/useSupervisorDashboard";

interface Props {
  summary: DailyActivitySummary | null;
}

const DailyActivityChart = ({ summary }: Props) => {
  if (!summary) return null;

  const currentHour = new Date().getHours();

  const chartData = summary.submissions_by_hour
    .filter(h => h.hour >= 6 && h.hour <= 20)
    .map(h => ({
      ...h,
      label: `${h.hour}:00`,
      isCurrent: h.hour === currentHour,
    }));

  const peakHour = chartData.reduce((max, h) => h.count > max.count ? h : max, chartData[0]);

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="font-display text-base">Submissions by Hour</CardTitle>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {summary.total_submissions} total · Peak at {peakHour?.label || "—"} ({peakHour?.count || 0})
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                interval={1}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [value, "Submissions"]}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.isCurrent ? "hsl(var(--acg-gold))" : "hsl(var(--primary))"}
                    opacity={entry.hour > currentHour ? 0.3 : 0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default DailyActivityChart;
