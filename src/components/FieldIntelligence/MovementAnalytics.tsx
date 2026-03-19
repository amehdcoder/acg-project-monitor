import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, TrendingUp, AlertTriangle, Clock, MapPin, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { format, subDays, differenceInMinutes } from "date-fns";

interface Props {
  projectId: string;
  formId: string;
  realtimeKey?: number;
}

const MovementAnalytics = ({ projectId, formId, realtimeKey }: Props) => {
  const [timeRange, setTimeRange] = useState("7d");
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [anomalies, setAnomalies] = useState<any[]>([]);

  const analyze = useCallback(async () => {
    setLoading(true);
    try {
      const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 1;
      const since = subDays(new Date(), days).toISOString();

      let userIds: string[];
      if (projectId) {
        const { data: assignments } = await supabase
          .from("user_project_assignments")
          .select("user_id")
          .eq("project_id", projectId);
        if (!assignments?.length) { setLoading(false); return; }
        userIds = assignments.map(a => a.user_id);
      } else {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("is_active", true)
          .limit(500);
        if (!profiles?.length) { setLoading(false); return; }
        userIds = profiles.map(p => p.user_id);
      }

      const userIds = assignments.map(a => a.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", userIds);

      const { data: activities } = await supabase
        .from("field_activity")
        .select("user_id, location, started_at, ended_at, within_geofence")
        .in("user_id", userIds)
        .gte("started_at", since)
        .order("started_at");

      const { data: submissions } = await supabase
        .from("form_submissions")
        .select("user_id, submitted_at, location")
        .in("user_id", userIds)
        .gte("submitted_at", since)
        .order("submitted_at");

      const profileMap = new Map(profiles?.map(p => [p.user_id, `${p.first_name} ${p.last_name}`]) || []);

      // Daily activity chart
      const dailyData: Record<string, { day: string; sessions: number; submissions: number }> = {};
      for (let i = 0; i < days; i++) {
        const d = format(subDays(new Date(), i), "MMM dd");
        dailyData[d] = { day: d, sessions: 0, submissions: 0 };
      }
      activities?.forEach(a => {
        const d = format(new Date(a.started_at), "MMM dd");
        if (dailyData[d]) dailyData[d].sessions++;
      });
      submissions?.forEach(s => {
        if (!s.submitted_at) return;
        const d = format(new Date(s.submitted_at), "MMM dd");
        if (dailyData[d]) dailyData[d].submissions++;
      });

      // Anomaly detection: rapid submissions, outside geofence, unusual hours
      const detected: any[] = [];
      const userSubmissions: Record<string, any[]> = {};
      submissions?.forEach(s => {
        if (!userSubmissions[s.user_id]) userSubmissions[s.user_id] = [];
        userSubmissions[s.user_id].push(s);
      });

      Object.entries(userSubmissions).forEach(([uid, subs]) => {
        // Rapid fire: >5 submissions in 10 minutes
        for (let i = 0; i < subs.length - 4; i++) {
          if (subs[i].submitted_at && subs[i + 4].submitted_at) {
            const diff = differenceInMinutes(new Date(subs[i + 4].submitted_at), new Date(subs[i].submitted_at));
            if (diff <= 10) {
              detected.push({
                type: "rapid_submissions",
                user: profileMap.get(uid) || uid,
                details: `5 submissions in ${diff} minutes`,
                severity: "high",
                time: subs[i].submitted_at,
              });
            }
          }
        }

        // Unusual hours (before 6am or after 10pm)
        subs.forEach(s => {
          if (!s.submitted_at) return;
          const hour = new Date(s.submitted_at).getHours();
          if (hour < 6 || hour > 22) {
            detected.push({
              type: "unusual_hours",
              user: profileMap.get(uid) || uid,
              details: `Submission at ${format(new Date(s.submitted_at), "h:mm a")}`,
              severity: "medium",
              time: s.submitted_at,
            });
          }
        });
      });

      // Geofence violations
      activities?.filter(a => a.within_geofence === false).forEach(a => {
        detected.push({
          type: "geofence_violation",
          user: profileMap.get(a.user_id) || a.user_id,
          details: "Activity outside geofenced area",
          severity: "high",
          time: a.started_at,
        });
      });

      setAnomalies(detected.slice(0, 20));

      // Per-user stats
      const userStats = userIds.map(uid => ({
        name: profileMap.get(uid) || uid.slice(0, 8),
        sessions: activities?.filter(a => a.user_id === uid).length || 0,
        submissions: submissions?.filter(s => s.user_id === uid).length || 0,
      })).sort((a, b) => b.submissions - a.submissions);

      setAnalytics({
        dailyChart: Object.values(dailyData).reverse(),
        userStats: userStats.slice(0, 15),
        totalSessions: activities?.length || 0,
        totalSubmissions: submissions?.length || 0,
        anomalyCount: detected.length,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [projectId, timeRange]);

  useEffect(() => { analyze(); }, [analyze, realtimeKey]);

  const severityColors: Record<string, string> = {
    high: "text-red-600 bg-red-50",
    medium: "text-amber-600 bg-amber-50",
    low: "text-blue-600 bg-blue-50",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />Movement & Activity Analytics
        </h3>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1d">Today</SelectItem>
            <SelectItem value="7d">7 Days</SelectItem>
            <SelectItem value="30d">30 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Card className="p-8 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></Card>
      ) : analytics ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10"><Activity className="h-5 w-5 text-primary" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Field Sessions</p>
                  <p className="text-2xl font-bold">{analytics.totalSessions}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10"><TrendingUp className="h-5 w-5 text-green-500" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Submissions</p>
                  <p className="text-2xl font-bold">{analytics.totalSubmissions}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10"><AlertTriangle className="h-5 w-5 text-red-500" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Anomalies Detected</p>
                  <p className="text-2xl font-bold">{analytics.anomalyCount}</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Daily Activity Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={analytics.dailyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="sessions" stroke="hsl(var(--primary))" strokeWidth={2} name="Sessions" />
                    <Line type="monotone" dataKey="submissions" stroke="#22c55e" strokeWidth={2} name="Submissions" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Collector Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={analytics.userStats} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="submissions" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Submissions" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Anomalies */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Anomalies & Trends ({anomalies.length})
              </CardTitle>
              <CardDescription>Unusual patterns detected in collector movement and activity</CardDescription>
            </CardHeader>
            <CardContent>
              {anomalies.length === 0 ? (
                <p className="text-sm text-muted-foreground">No anomalies detected in the selected time range</p>
              ) : (
                <div className="space-y-2">
                  {anomalies.map((a, i) => (
                    <div key={i} className="flex items-center justify-between border rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <Badge className={severityColors[a.severity]} variant="secondary">{a.severity}</Badge>
                        <div>
                          <p className="text-sm font-medium">{a.user}</p>
                          <p className="text-xs text-muted-foreground">{a.details}</p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(a.time), "MMM d, h:mm a")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
};

export default MovementAnalytics;
