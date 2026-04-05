import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LabelList, Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Users, TrendingUp, MapPin, FileText, Calendar } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface StateSubmission {
  state: string;
  count: number;
}

interface DailyRate {
  date: string;
  count: number;
}

const FionetKPIBlock = ({
  label, value, color, icon: Icon,
}: {
  label: string; value: string | number; color: string; icon: React.ElementType;
}) => (
  <div className={`rounded-lg p-2.5 text-white text-center ${color}`}>
    <div className="flex items-center gap-1 justify-center mb-0.5">
      <Icon className="h-3 w-3" />
      <p className="text-[9px] sm:text-[10px] font-semibold leading-tight uppercase tracking-wide">{label}</p>
    </div>
    <p className="text-base sm:text-xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</p>
  </div>
);

const DashboardCharts = () => {
  const isMobile = useIsMobile();
  const [stateData, setStateData] = useState<StateSubmission[]>([]);
  const [dailyData, setDailyData] = useState<DailyRate[]>([]);
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);

  useEffect(() => {
    fetchChartData();
  }, []);

  const fetchChartData = async () => {
    const { data: submissions } = await supabase
      .from("form_submissions")
      .select("data, created_at, status")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (!submissions) return;

    setTotalSubmissions(submissions.length);

    const stateCounts: Record<string, number> = {};
    const dailyCounts: Record<string, number> = {};

    submissions.forEach(sub => {
      const d = sub.data as Record<string, any>;
      const state = d?.state || d?.State || d?.location_state || d?.admin_state;
      if (state && typeof state === "string") {
        stateCounts[state] = (stateCounts[state] || 0) + 1;
      }
      const day = sub.created_at.split("T")[0];
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    });

    setStateData(
      Object.entries(stateCounts)
        .map(([state, count]) => ({ state, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12)
    );

    const last7 = Object.entries(dailyCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, count]) => ({
        date: new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        count,
      }));
    setDailyData(last7);

    const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_active", true);
    setTotalUsers(count || 0);
  };

  const maxState = useMemo(() => Math.max(...stateData.map(s => s.count), 1), [stateData]);

  if (stateData.length === 0 && dailyData.length === 0) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Submissions by State - FIONET stacked style */}
      {stateData.length > 0 && (
        <Card className="border-0 shadow-card overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm sm:text-base flex items-center gap-2 text-[hsl(142,60%,35%)]">
              <MapPin className="h-4 w-4" />
              Submissions by State
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {/* FIONET KPI sidebar */}
              <div className="hidden sm:flex flex-col gap-1.5 w-24 flex-shrink-0">
                <FionetKPIBlock label="Total" value={totalSubmissions} color="bg-[hsl(142,60%,35%)]" icon={FileText} />
                <FionetKPIBlock label="States" value={stateData.length} color="bg-[hsl(142,50%,45%)]" icon={MapPin} />
                <FionetKPIBlock label="Users" value={totalUsers} color="bg-[hsl(142,40%,55%)]" icon={Users} />
              </div>
              {/* Legend */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-3 mb-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(142, 60%, 35%)" }} />
                    <span className="text-[10px] text-muted-foreground">Well Covered (≥70%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(142, 30%, 65%)" }} />
                    <span className="text-[10px] text-muted-foreground">Average (40-70%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(0, 70%, 50%)" }} />
                    <span className="text-[10px] text-muted-foreground">Low (&lt;40%)</span>
                  </div>
                </div>
                <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                  <div style={{ minWidth: Math.max(stateData.length * 60, 300), height: isMobile ? 200 : 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stateData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="state" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} angle={-25} textAnchor="end" height={45} />
                        <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Submissions">
                          <LabelList dataKey="count" position="top" fontSize={8} fill="hsl(var(--muted-foreground))" />
                          {stateData.map((entry, i) => {
                            const pct = entry.count / maxState;
                            const color = pct >= 0.7 ? "hsl(142, 60%, 35%)" : pct >= 0.4 ? "hsl(142, 30%, 65%)" : "hsl(0, 70%, 50%)";
                            return <Cell key={i} fill={color} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily Reporting Rate */}
      {dailyData.length > 0 && (
        <Card className="border-0 shadow-card overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm sm:text-base flex items-center gap-2 text-[hsl(142,60%,35%)]">
              <Calendar className="h-4 w-4" />
              Daily Reporting Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <div className="hidden sm:flex flex-col gap-1.5 w-24 flex-shrink-0">
                <FionetKPIBlock label="Today" value={dailyData[dailyData.length - 1]?.count || 0} color="bg-[hsl(142,60%,35%)]" icon={TrendingUp} />
                <FionetKPIBlock label="7-Day Avg" value={Math.round(dailyData.reduce((s, d) => s + d.count, 0) / Math.max(dailyData.length, 1))} color="bg-[hsl(142,50%,45%)]" icon={Calendar} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-3 mb-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(142, 60%, 35%)" }} />
                    <span className="text-[10px] text-muted-foreground">Submissions</span>
                  </div>
                </div>
                <div style={{ height: isMobile ? 200 : 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                      <Bar dataKey="count" fill="hsl(142, 60%, 35%)" radius={[4, 4, 0, 0]} name="Submissions">
                        <LabelList dataKey="count" position="top" fontSize={9} fill="hsl(var(--muted-foreground))" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DashboardCharts;
