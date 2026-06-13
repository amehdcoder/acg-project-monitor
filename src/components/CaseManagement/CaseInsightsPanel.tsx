import { Card, CardContent } from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { AlertTriangle, PlusCircle, CheckCircle2, ArrowRight } from "lucide-react";

export interface InsightsData {
  casesByState: { state: string; count: number }[];
  followUpTrends: { label: string; completed: number; pending: number; overdue: number }[];
  recentActivity: { type: "overdue" | "registered" | "completed"; title: string; meta: string }[];
}

const activityIcon = {
  overdue: { Icon: AlertTriangle, color: "text-destructive" },
  registered: { Icon: PlusCircle, color: "text-primary" },
  completed: { Icon: CheckCircle2, color: "text-green-600 dark:text-green-400" },
};

const CaseInsightsPanel = ({ data }: { data: InsightsData }) => {
  const maxState = Math.max(1, ...data.casesByState.map((s) => s.count));

  return (
    <Card className="border border-border/60 shadow-card h-full">
      <CardContent className="p-4 space-y-5">
        <h3 className="font-display text-base font-semibold text-foreground">Insights</h3>

        {/* Cases by State (Top 5) */}
        <div className="rounded-xl border border-border/60 p-3.5">
          <p className="text-sm font-semibold text-foreground mb-3">Cases by State (Top 5)</p>
          <div className="space-y-2.5">
            {data.casesByState.map((s) => (
              <div key={s.state} className="flex items-center gap-2.5">
                <span className="w-20 shrink-0 text-xs text-muted-foreground truncate">{s.state}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70"
                    style={{ width: `${(s.count / maxState) * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-semibold text-foreground tabular-nums">
                  {s.count}
                </span>
              </div>
            ))}
          </div>
          <button className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            View full breakdown <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* Follow-up Trends */}
        <div className="rounded-xl border border-border/60 p-3.5">
          <p className="text-sm font-semibold text-foreground mb-1">Follow-up Trends</p>
          <div className="flex items-center gap-3 mb-2">
            {[
              { label: "Completed", color: "#10b981" },
              { label: "Pending", color: "#f59e0b" },
              { label: "Overdue", color: "#ef4444" },
            ].map((l) => (
              <span key={l.label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
          <div className="h-[140px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.followUpTrends} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} width={28} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="pending" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="overdue" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border border-border/60 p-3.5">
          <p className="text-sm font-semibold text-foreground mb-3">Recent Activity</p>
          <div className="space-y-3">
            {data.recentActivity.map((a, i) => {
              const { Icon, color } = activityIcon[a.type];
              return (
                <div key={i} className="flex items-start gap-2.5">
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground leading-snug">{a.title}</p>
                    <p className="text-[10px] text-muted-foreground">{a.meta}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            View all activity <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
};

export default CaseInsightsPanel;
