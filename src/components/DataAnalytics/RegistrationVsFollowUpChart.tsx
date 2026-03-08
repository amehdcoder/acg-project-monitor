import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, startOfWeek, startOfMonth, parseISO } from "date-fns";
import { Loader2 } from "lucide-react";

interface SubmissionRow {
  submitted_at: string;
  submission_type: string;
  project_id?: string;
}

const COLORS = {
  registration: "hsl(var(--primary))",
  follow_up: "hsl(var(--chart-2))",
  regular: "hsl(var(--chart-4))",
};

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-4))",
];

const RegistrationVsFollowUpChart = () => {
  const { user, isAdmin } = useAuth();
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    const fetchSubmissions = async () => {
      setLoading(true);
      try {
        let projectIds: string[] = [];
        if (isAdmin) {
          const { data } = await supabase.from("projects").select("id");
          projectIds = (data || []).map((p) => p.id);
        } else {
          const { data } = await supabase
            .from("user_project_assignments")
            .select("project_id")
            .eq("user_id", user.id);
          projectIds = (data || []).map((a) => a.project_id);
        }

        if (projectIds.length === 0) {
          setSubmissions([]);
          setLoading(false);
          return;
        }

        const { data: formData } = await supabase
          .from("forms")
          .select("id, project_id")
          .in("project_id", projectIds);

        if (!formData || formData.length === 0) {
          setSubmissions([]);
          setLoading(false);
          return;
        }

        const formIds = formData.map((f) => f.id);
        const formProjectMap: Record<string, string> = {};
        formData.forEach((f) => { formProjectMap[f.id] = f.project_id; });

        const { data: subs } = await supabase
          .from("form_submissions")
          .select("submitted_at, submission_type, form_id")
          .in("form_id", formIds)
          .eq("status", "sent")
          .not("submitted_at", "is", null)
          .order("submitted_at", { ascending: true });

        setSubmissions(
          (subs || []).map((s: any) => ({
            submitted_at: s.submitted_at,
            submission_type: s.submission_type || "regular",
            project_id: formProjectMap[s.form_id],
          }))
        );
      } catch (e) {
        console.error("Error fetching submission trends:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchSubmissions();
  }, [user?.id, isAdmin]);

  const { weeklyData, monthlyData, totals, pieData } = useMemo(() => {
    const weeklyBuckets: Record<string, { registration: number; follow_up: number; regular: number }> = {};
    const monthlyBuckets: Record<string, { registration: number; follow_up: number; regular: number }> = {};
    const totals = { registration: 0, follow_up: 0, regular: 0 };

    submissions.forEach((s) => {
      const date = parseISO(s.submitted_at);
      const weekKey = format(startOfWeek(date, { weekStartsOn: 1 }), "MMM d");
      const monthKey = format(startOfMonth(date), "MMM yyyy");
      const type = s.submission_type as keyof typeof totals;

      if (!weeklyBuckets[weekKey]) weeklyBuckets[weekKey] = { registration: 0, follow_up: 0, regular: 0 };
      if (!monthlyBuckets[monthKey]) monthlyBuckets[monthKey] = { registration: 0, follow_up: 0, regular: 0 };

      weeklyBuckets[weekKey][type] = (weeklyBuckets[weekKey][type] || 0) + 1;
      monthlyBuckets[monthKey][type] = (monthlyBuckets[monthKey][type] || 0) + 1;
      totals[type] = (totals[type] || 0) + 1;
    });

    const weeklyData = Object.entries(weeklyBuckets).map(([week, counts]) => ({ period: week, ...counts }));
    const monthlyData = Object.entries(monthlyBuckets).map(([month, counts]) => ({ period: month, ...counts }));

    const pieData = [
      { name: "Registrations", value: totals.registration },
      { name: "Follow-ups", value: totals.follow_up },
      { name: "Regular", value: totals.regular },
    ].filter((d) => d.value > 0);

    return { weeklyData, monthlyData, totals, pieData };
  }, [submissions]);

  if (loading) {
    return (
      <Card className="border-0 shadow-card">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const total = totals.registration + totals.follow_up + totals.regular;
  if (total === 0) return null;

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="font-display">Registration vs Follow-Up Trends</CardTitle>
            <CardDescription>
              Cross-project submission breakdown over time
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="default" className="text-xs gap-1">
              <span className="h-2 w-2 rounded-full bg-primary inline-block" />
              {totals.registration} Registrations
            </Badge>
            <Badge variant="secondary" className="text-xs gap-1">
              <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: COLORS.follow_up }} />
              {totals.follow_up} Follow-ups
            </Badge>
            {totals.regular > 0 && (
              <Badge variant="outline" className="text-xs gap-1">
                <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: COLORS.regular }} />
                {totals.regular} Regular
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="weekly" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-xs">
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          </TabsList>

          <TabsContent value="weekly" className="mt-4">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="registration"
                    stackId="1"
                    stroke={COLORS.registration}
                    fill={COLORS.registration}
                    fillOpacity={0.6}
                    name="Registrations"
                  />
                  <Area
                    type="monotone"
                    dataKey="follow_up"
                    stackId="1"
                    stroke={COLORS.follow_up}
                    fill={COLORS.follow_up}
                    fillOpacity={0.6}
                    name="Follow-ups"
                  />
                  {totals.regular > 0 && (
                    <Area
                      type="monotone"
                      dataKey="regular"
                      stackId="1"
                      stroke={COLORS.regular}
                      fill={COLORS.regular}
                      fillOpacity={0.4}
                      name="Regular"
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="monthly" className="mt-4">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Bar dataKey="registration" stackId="a" fill={COLORS.registration} name="Registrations" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="follow_up" stackId="a" fill={COLORS.follow_up} name="Follow-ups" radius={[4, 4, 0, 0]} />
                  {totals.regular > 0 && (
                    <Bar dataKey="regular" stackId="a" fill={COLORS.regular} name="Regular" radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="breakdown" className="mt-4">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col justify-center space-y-4">
                <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Registrations</span>
                    <span className="font-semibold text-foreground">{totals.registration}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Follow-ups</span>
                    <span className="font-semibold text-foreground">{totals.follow_up}</span>
                  </div>
                  {totals.regular > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Regular</span>
                      <span className="font-semibold text-foreground">{totals.regular}</span>
                    </div>
                  )}
                  <div className="border-t pt-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Total</span>
                    <span className="font-bold text-foreground">{total}</span>
                  </div>
                  {totals.registration > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Follow-up ratio: <span className="font-medium text-foreground">
                        {(totals.follow_up / totals.registration).toFixed(1)}
                      </span> follow-ups per registration
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default RegistrationVsFollowUpChart;
