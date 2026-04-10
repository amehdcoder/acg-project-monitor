import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LabelList, Cell, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Users, TrendingUp, MapPin, FileText, Calendar, FolderOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ProjectFormData {
  project_id: string;
  project_name: string;
  forms: { form_id: string; form_name: string; count: number }[];
  total: number;
}

interface StateSubmission {
  state: string;
  count: number;
}

const FionetKPIBlock = ({
  label, value, color, subLabel,
}: {
  label: string; value: string | number; color: string; subLabel?: string;
}) => (
  <div className={`rounded-lg p-3 text-white text-center ${color} shadow-md`}>
    <p className="text-[9px] sm:text-[10px] font-semibold leading-tight uppercase tracking-wider opacity-90">{label}</p>
    <p className="text-lg sm:text-2xl font-bold mt-0.5">{typeof value === "number" ? value.toLocaleString() : value}</p>
    {subLabel && <p className="text-[8px] opacity-75 mt-0.5">{subLabel}</p>}
  </div>
);

const DashboardCharts = () => {
  const isMobile = useIsMobile();
  const [stateData, setStateData] = useState<StateSubmission[]>([]);
  const [projectData, setProjectData] = useState<ProjectFormData[]>([]);
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchChartData();
  }, []);

  const fetchChartData = async () => {
    // Fetch submissions with form info
    const { data: submissions } = await supabase
      .from("form_submissions")
      .select("form_id, data, created_at, status, synced_at")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (!submissions) return;

    setTotalSubmissions(submissions.length);
    setSyncedCount(submissions.filter(s => s.status === "sent" && s.synced_at).length);

    // Fetch forms with project info
    const formIds = [...new Set(submissions.map(s => s.form_id))];
    const { data: forms } = await supabase
      .from("forms")
      .select("id, name, project_id")
      .in("id", formIds);

    const { data: projects } = await supabase
      .from("projects")
      .select("id, name");

    const formMap = new Map(forms?.map(f => [f.id, f]) || []);
    const projectMap = new Map(projects?.map(p => [p.id, p.name]) || []);

    // Build project -> form -> count hierarchy
    const projectFormCounts: Record<string, Record<string, number>> = {};
    const stateCounts: Record<string, number> = {};

    submissions.forEach(sub => {
      const form = formMap.get(sub.form_id);
      if (form) {
        const pid = form.project_id;
        if (!projectFormCounts[pid]) projectFormCounts[pid] = {};
        projectFormCounts[pid][sub.form_id] = (projectFormCounts[pid][sub.form_id] || 0) + 1;
      }
      const d = sub.data as Record<string, any>;
      const state = d?.state || d?.State || d?.location_state || d?.admin_state;
      if (state && typeof state === "string") {
        stateCounts[state] = (stateCounts[state] || 0) + 1;
      }
    });

    const pData: ProjectFormData[] = Object.entries(projectFormCounts).map(([pid, formCounts]) => ({
      project_id: pid,
      project_name: projectMap.get(pid) || "Unknown Project",
      forms: Object.entries(formCounts).map(([fid, count]) => ({
        form_id: fid,
        form_name: formMap.get(fid)?.name || "Unknown Form",
        count,
      })).sort((a, b) => b.count - a.count),
      total: Object.values(formCounts).reduce((s, c) => s + c, 0),
    })).sort((a, b) => b.total - a.total);

    setProjectData(pData);

    setStateData(
      Object.entries(stateCounts)
        .map(([state, count]) => ({ state, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12)
    );

    const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_active", true);
    setTotalUsers(count || 0);
  };

  const maxState = useMemo(() => Math.max(...stateData.map(s => s.count), 1), [stateData]);
  const syncRate = totalSubmissions > 0 ? Math.round((syncedCount / totalSubmissions) * 100) : 0;

  if (stateData.length === 0 && projectData.length === 0) return null;

  const toggleProject = (pid: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  // Build stacked bar data for project comparison
  const projectBarData = projectData.map(p => ({
    name: p.project_name.length > 12 ? p.project_name.slice(0, 12) + "…" : p.project_name,
    total: p.total,
    pct: totalSubmissions > 0 ? Math.round((p.total / totalSubmissions) * 100) : 0,
  }));

  const PROJECT_COLORS = [
    "hsl(142, 60%, 35%)", "hsl(142, 50%, 45%)", "hsl(142, 40%, 55%)",
    "hsl(142, 30%, 65%)", "hsl(30, 80%, 50%)", "hsl(0, 70%, 50%)",
    "hsl(210, 60%, 50%)", "hsl(280, 50%, 50%)",
  ];

  return (
    <div className="space-y-4">
      {/* Project Submissions Breakdown - FIONET Style */}
      {projectData.length > 0 && (
        <Card className="border-0 shadow-card overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm sm:text-base flex items-center gap-2 text-[hsl(142,60%,35%)]">
              <FolderOpen className="h-4 w-4" />
              Submissions by Project
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {/* FIONET KPI sidebar */}
              <div className="hidden sm:flex flex-col gap-1.5 w-28 flex-shrink-0">
                <FionetKPIBlock label="Total Submissions" value={totalSubmissions} color="bg-[hsl(142,60%,35%)]" />
                <FionetKPIBlock label="Sync Rate" value={`${syncRate}%`} color={syncRate >= 80 ? "bg-[hsl(142,50%,45%)]" : syncRate >= 50 ? "bg-[hsl(30,80%,50%)]" : "bg-[hsl(0,70%,50%)]"} />
                <FionetKPIBlock label="Projects" value={projectData.length} color="bg-[hsl(142,40%,55%)]" />
                <FionetKPIBlock label="Active Users" value={totalUsers} color="bg-[hsl(210,50%,50%)]" />
              </div>

              <div className="flex-1 min-w-0">
                {/* Legend */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {projectData.slice(0, 6).map((p, i) => (
                    <div key={p.project_id} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: PROJECT_COLORS[i % PROJECT_COLORS.length] }} />
                      <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{p.project_name}</span>
                    </div>
                  ))}
                </div>

                {/* Bar chart */}
                <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                  <div style={{ minWidth: Math.max(projectBarData.length * 80, 300), height: isMobile ? 200 : 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={projectBarData} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} angle={-15} textAnchor="end" height={50} />
                        <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                          formatter={(value: number, name: string) => [value.toLocaleString(), "Submissions"]}
                        />
                        <Bar dataKey="total" radius={[4, 4, 0, 0]} name="Submissions">
                          <LabelList
                            dataKey="pct"
                            position="top"
                            fontSize={9}
                            fill="hsl(var(--muted-foreground))"
                            formatter={(v: number) => `${v}%`}
                          />
                          {projectBarData.map((_, i) => (
                            <Cell key={i} fill={PROJECT_COLORS[i % PROJECT_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Drill-down: expandable project -> forms */}
                <div className="mt-3 space-y-1.5">
                  {projectData.map((project, i) => (
                    <Collapsible
                      key={project.project_id}
                      open={expandedProjects.has(project.project_id)}
                      onOpenChange={() => toggleProject(project.project_id)}
                    >
                      <CollapsibleTrigger asChild>
                        <button className="flex w-full items-center justify-between rounded-lg p-2.5 text-left transition-colors hover:bg-muted/70 bg-muted/40">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: PROJECT_COLORS[i % PROJECT_COLORS.length] }} />
                            <span className="text-xs font-medium truncate">{project.project_name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="secondary" className="font-mono text-[10px] h-5">
                              {project.total.toLocaleString()}
                            </Badge>
                            <Badge
                              className={`text-[10px] h-5 ${
                                (project.total / Math.max(totalSubmissions, 1)) >= 0.3
                                  ? "bg-[hsl(142,60%,35%)] text-white"
                                  : (project.total / Math.max(totalSubmissions, 1)) >= 0.15
                                  ? "bg-[hsl(30,80%,50%)] text-white"
                                  : "bg-[hsl(0,70%,50%)] text-white"
                              }`}
                            >
                              {Math.round((project.total / Math.max(totalSubmissions, 1)) * 100)}%
                            </Badge>
                            {expandedProjects.has(project.project_id) ? (
                              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-5 pt-1 space-y-1">
                        {project.forms.map(form => {
                          const formPct = Math.round((form.count / Math.max(project.total, 1)) * 100);
                          return (
                            <div key={form.form_id} className="flex items-center justify-between rounded-md p-2 bg-card border border-border/50">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <span className="text-[11px] font-medium truncate">{form.form_name}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${formPct}%`,
                                      backgroundColor: formPct >= 50 ? "hsl(142,60%,35%)" : formPct >= 25 ? "hsl(30,80%,50%)" : "hsl(0,70%,50%)",
                                    }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground w-8 text-right">{form.count}</span>
                              </div>
                            </div>
                          );
                        })}
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submissions by State - FIONET stacked style */}
      <div className="grid gap-4 lg:grid-cols-2">
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
                <div className="hidden sm:flex flex-col gap-1.5 w-24 flex-shrink-0">
                  <FionetKPIBlock label="Total" value={totalSubmissions} color="bg-[hsl(142,60%,35%)]" />
                  <FionetKPIBlock label="States" value={stateData.length} color="bg-[hsl(142,50%,45%)]" />
                </div>
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
        <DailyReportingCard />
      </div>
    </div>
  );
};

const DailyReportingCard = () => {
  const isMobile = useIsMobile();
  const [dailyData, setDailyData] = useState<{ date: string; count: number }[]>([]);

  useEffect(() => {
    (async () => {
      const { data: submissions } = await supabase
        .from("form_submissions")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (!submissions) return;
      const dailyCounts: Record<string, number> = {};
      submissions.forEach(sub => {
        const day = sub.created_at.split("T")[0];
        dailyCounts[day] = (dailyCounts[day] || 0) + 1;
      });
      setDailyData(
        Object.entries(dailyCounts)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-7)
          .map(([date, count]) => ({
            date: new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
            count,
          }))
      );
    })();
  }, []);

  if (dailyData.length === 0) return null;

  return (
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
            <FionetKPIBlock label="Today" value={dailyData[dailyData.length - 1]?.count || 0} color="bg-[hsl(142,60%,35%)]" />
            <FionetKPIBlock label="7-Day Avg" value={Math.round(dailyData.reduce((s, d) => s + d.count, 0) / Math.max(dailyData.length, 1))} color="bg-[hsl(142,50%,45%)]" />
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
  );
};

export default DashboardCharts;
