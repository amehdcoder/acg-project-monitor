import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Target, Calendar, TrendingUp, Award, Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  subMonths,
  format,
  eachDayOfInterval,
  startOfDay,
  endOfDay,
} from "date-fns";

type Period = "this_week" | "last_week" | "this_month" | "last_month";

interface UserTargetSummary {
  userId: string;
  firstName: string;
  lastName: string;
  totalTarget: number;
  totalSubmitted: number;
  completionRate: number;
  dailyBreakdown: { date: string; target: number; submitted: number; rate: number }[];
}

const TargetCompletionReport = () => {
  const { isAdmin } = useAuth();
  const [period, setPeriod] = useState<Period>("this_week");
  const [loading, setLoading] = useState(false);
  const [summaries, setSummaries] = useState<UserTargetSummary[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>("all");
  const [forms, setForms] = useState<{ id: string; name: string }[]>([]);

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "this_week":
        return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
      case "last_week": {
        const lw = subWeeks(now, 1);
        return { from: startOfWeek(lw, { weekStartsOn: 1 }), to: endOfWeek(lw, { weekStartsOn: 1 }) };
      }
      case "this_month":
        return { from: startOfMonth(now), to: endOfMonth(now) };
      case "last_month": {
        const lm = subMonths(now, 1);
        return { from: startOfMonth(lm), to: endOfMonth(lm) };
      }
    }
  }, [period]);

  const fetchReport = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      // Get active targets
      let targetQuery = supabase
        .from("form_daily_targets")
        .select("user_id, form_id, daily_target")
        .eq("is_active", true);

      if (selectedFormId !== "all") {
        targetQuery = targetQuery.eq("form_id", selectedFormId);
      }

      const { data: targets } = await targetQuery;
      if (!targets || targets.length === 0) {
        setSummaries([]);
        setLoading(false);
        return;
      }

      const userIds = [...new Set(targets.map((t: any) => t.user_id))];
      const formIds = [...new Set(targets.map((t: any) => t.form_id))];

      // Get profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", userIds);

      const profileMap: Record<string, { firstName: string; lastName: string }> = {};
      (profiles || []).forEach((p: any) => {
        profileMap[p.user_id] = { firstName: p.first_name, lastName: p.last_name };
      });

      // Get submissions in date range
      const { data: submissions } = await supabase
        .from("form_submissions")
        .select("user_id, form_id, submitted_at")
        .in("user_id", userIds)
        .in("form_id", formIds)
        .eq("status", "sent")
        .gte("submitted_at", dateRange.from.toISOString())
        .lte("submitted_at", dateRange.to.toISOString());

      // Build daily breakdown per user
      const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to > new Date() ? new Date() : dateRange.to });

      // Aggregate user targets (sum across forms)
      const userTargetMap: Record<string, number> = {};
      targets.forEach((t: any) => {
        userTargetMap[t.user_id] = (userTargetMap[t.user_id] || 0) + t.daily_target;
      });

      // Count submissions per user per day
      const userDayCounts: Record<string, Record<string, number>> = {};
      (submissions || []).forEach((s: any) => {
        const dayKey = format(new Date(s.submitted_at), "yyyy-MM-dd");
        if (!userDayCounts[s.user_id]) userDayCounts[s.user_id] = {};
        userDayCounts[s.user_id][dayKey] = (userDayCounts[s.user_id][dayKey] || 0) + 1;
      });

      const results: UserTargetSummary[] = userIds.map((uid) => {
        const dailyTarget = userTargetMap[uid] || 0;
        const profile = profileMap[uid] || { firstName: "Unknown", lastName: "" };
        const dailyBreakdown = days.map((d) => {
          const dayKey = format(d, "yyyy-MM-dd");
          const submitted = userDayCounts[uid]?.[dayKey] || 0;
          return {
            date: format(d, "EEE dd"),
            target: dailyTarget,
            submitted,
            rate: dailyTarget > 0 ? Math.round((submitted / dailyTarget) * 100) : 0,
          };
        });

        const totalTarget = dailyTarget * days.length;
        const totalSubmitted = dailyBreakdown.reduce((s, d) => s + d.submitted, 0);
        const completionRate = totalTarget > 0 ? Math.round((totalSubmitted / totalTarget) * 100) : 0;

        return {
          userId: uid,
          firstName: profile.firstName,
          lastName: profile.lastName,
          totalTarget,
          totalSubmitted,
          completionRate,
          dailyBreakdown,
        };
      });

      results.sort((a, b) => b.completionRate - a.completionRate);
      setSummaries(results);
    } catch (e) {
      console.error("Failed to fetch target report:", e);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, dateRange, selectedFormId]);

  const fetchForms = useCallback(async () => {
    const { data } = await supabase
      .from("forms")
      .select("id, name")
      .eq("status", "active")
      .order("name");
    setForms(data || []);
  }, []);

  useEffect(() => {
    fetchForms();
  }, [fetchForms]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Aggregate chart data (team-level daily trends)
  const trendData = useMemo(() => {
    if (summaries.length === 0) return [];
    const dayCount = summaries[0]?.dailyBreakdown.length || 0;
    const result = [];
    for (let i = 0; i < dayCount; i++) {
      const dayLabel = summaries[0].dailyBreakdown[i].date;
      let totalTarget = 0;
      let totalSubmitted = 0;
      summaries.forEach((s) => {
        totalTarget += s.dailyBreakdown[i]?.target || 0;
        totalSubmitted += s.dailyBreakdown[i]?.submitted || 0;
      });
      result.push({
        date: dayLabel,
        Target: totalTarget,
        Submitted: totalSubmitted,
        Rate: totalTarget > 0 ? Math.round((totalSubmitted / totalTarget) * 100) : 0,
      });
    }
    return result;
  }, [summaries]);

  const teamAvg = useMemo(() => {
    if (summaries.length === 0) return 0;
    return Math.round(summaries.reduce((s, u) => s + u.completionRate, 0) / summaries.length);
  }, [summaries]);

  const topPerformers = summaries.filter((s) => s.completionRate >= 100);

  if (!isAdmin) return null;

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="font-display text-lg">Target Completion Report</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(dateRange.from, "MMM d")} – {format(dateRange.to, "MMM d, yyyy")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedFormId} onValueChange={setSelectedFormId}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="All Forms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Forms</SelectItem>
                {forms.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="last_week">Last Week</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : summaries.length === 0 ? (
          <div className="text-center py-12">
            <Target className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No active targets found for this period.</p>
          </div>
        ) : (
          <>
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border/50 p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{teamAvg}%</p>
                <p className="text-xs text-muted-foreground">Team Avg</p>
              </div>
              <div className="rounded-lg border border-border/50 p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{summaries.length}</p>
                <p className="text-xs text-muted-foreground">Users Tracked</p>
              </div>
              <div className="rounded-lg border border-border/50 p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{topPerformers.length}</p>
                <p className="text-xs text-muted-foreground">Met Target</p>
              </div>
              <div className="rounded-lg border border-border/50 p-3 text-center">
                <p className="text-2xl font-bold text-destructive">
                  {summaries.filter((s) => s.completionRate < 50).length}
                </p>
                <p className="text-xs text-muted-foreground">Below 50%</p>
              </div>
            </div>

            {/* Team Trend Chart */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Team Daily Trend
              </h3>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="Target" fill="hsl(var(--muted-foreground) / 0.3)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Submitted" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Completion Rate Line Chart */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Award className="h-4 w-4 text-acg-gold" />
                Daily Completion Rate (%)
              </h3>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} className="fill-muted-foreground" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Rate"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "hsl(var(--primary))" }}
                      name="Completion %"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Per-User Breakdown */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">User Breakdown</h3>
              <ScrollArea className="max-h-[350px] pr-1">
                <div className="space-y-2">
                  {summaries.map((u, idx) => (
                    <div
                      key={u.userId}
                      className="flex items-center gap-3 rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">
                            {u.firstName} {u.lastName}
                          </p>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 h-4 ${
                              u.completionRate >= 100
                                ? "bg-green-500/15 text-green-700 border-green-500/30"
                                : u.completionRate >= 75
                                ? "bg-blue-500/15 text-blue-700 border-blue-500/30"
                                : u.completionRate >= 50
                                ? "bg-amber-500/15 text-amber-700 border-amber-500/30"
                                : "bg-destructive/15 text-destructive border-destructive/30"
                            }`}
                          >
                            {u.completionRate}%
                          </Badge>
                        </div>
                        <Progress
                          value={Math.min(u.completionRate, 100)}
                          className="h-1.5 mt-1.5"
                        />
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-mono font-semibold">
                          {u.totalSubmitted}/{u.totalTarget}
                        </span>
                        <p className="text-[10px] text-muted-foreground">submissions</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TargetCompletionReport;
