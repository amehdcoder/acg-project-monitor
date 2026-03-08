import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TrendingUp, TrendingDown, Trophy, AlertTriangle } from "lucide-react";
import { DailyActivitySummary } from "@/hooks/useSupervisorDashboard";

interface Props {
  summary: DailyActivitySummary | null;
}

const DailyActivityChart = ({ summary }: Props) => {
  if (!summary) return null;

  const currentHour = new Date().getHours();

  // Only show hours 6 AM – 8 PM for cleaner view
  const chartData = summary.submissions_by_hour
    .filter(h => h.hour >= 6 && h.hour <= 20)
    .map(h => ({
      ...h,
      label: `${h.hour}:00`,
      isCurrent: h.hour === currentHour,
    }));

  return (
    <div className="space-y-4">
      {/* Submissions by Hour */}
      <Card className="border-0 shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-lg">Today's Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Performers */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-acg-gold" />
              Top Performers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.top_performers.length > 0 ? (
              <div className="space-y-2">
                {summary.top_performers.map((p, i) => (
                  <div key={p.user_id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        i === 0 ? "bg-acg-gold/20 text-acg-gold" :
                        i === 1 ? "bg-muted text-muted-foreground" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium">{p.name}</span>
                    </div>
                    <Badge variant="secondary" className="font-mono">{p.count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No submissions yet today</p>
            )}
          </CardContent>
        </Card>

        {/* Underperformers */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Needs Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.underperformers.length > 0 ? (
              <div className="space-y-2">
                {summary.underperformers.map((p) => (
                  <div key={p.user_id} className="flex items-center justify-between py-1.5">
                    <span className="text-sm">{p.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-mono text-muted-foreground">
                        {p.count}/{p.expected}
                      </span>
                      <TrendingDown className="h-3 w-3 text-amber-500" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">All enumerators on track</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DailyActivityChart;
