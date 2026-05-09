import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, LabelList, Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface ProjectKPI {
  projectId: string;
  project: string;
  totalForms: number;
  submissions: number;
  pendingSync: number;
  syncRate: number;
}

const COLORS = {
  totalForms: "hsl(220, 70%, 50%)",
  submissions: "hsl(142, 60%, 40%)",
  pendingSync: "hsl(30, 85%, 52%)",
  syncRate: "hsl(262, 60%, 55%)",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg text-xs">
      <p className="font-semibold text-foreground mb-1.5 text-sm">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ background: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold text-foreground ml-auto">
            {entry.dataKey === "syncRate" ? `${entry.value}%` : entry.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
};

interface DashboardKPIChartProps {
  onProjectClick?: (projectId: string | null, projectName?: string | null) => void;
  selectedProjectId?: string | null;
}

const DashboardKPIChart = ({ onProjectClick, selectedProjectId }: DashboardKPIChartProps) => {
  const isMobile = useIsMobile();
  const [data, setData] = useState<ProjectKPI[]>([]);
  const [totals, setTotals] = useState({ forms: 0, subs: 0, pending: 0, rate: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("dss-kpi-chart-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedProjectId]);


  const fetchData = async () => {
    try {
      const [formsRes, projectsRes] = await Promise.all([
        supabase.from("forms").select("id, project_id"),
        supabase.from("projects").select("id, name"),
      ]);

      // Paginated fetch so large projects don't get silently capped at 1000
      const PAGE = 1000;
      let allSubs: any[] = [];
      let from = 0;
      while (true) {
        const { data: page, error } = await supabase
          .from("form_submissions")
          .select("form_id, status, synced_at")
          .range(from, from + PAGE - 1);
        if (error || !page || page.length === 0) break;
        allSubs = allSubs.concat(page);
        if (page.length < PAGE) break;
        from += PAGE;
      }

      const forms = formsRes.data;
      const projects = projectsRes.data;
      const submissions = allSubs;

      if (!forms || !projects || !submissions) { setLoading(false); return; }

      const projectMap = new Map(projects.map(p => [p.id, p.name]));
      const formProjectMap = new Map(forms.map(f => [f.id, f.project_id]));

      const projectKPIs: Record<string, { forms: Set<string>; subs: number; synced: number; pending: number }> = {};
      for (const form of forms) {
        const pid = form.project_id;
        if (!projectKPIs[pid]) projectKPIs[pid] = { forms: new Set(), subs: 0, synced: 0, pending: 0 };
        projectKPIs[pid].forms.add(form.id);
      }
      for (const sub of submissions) {
        const pid = formProjectMap.get(sub.form_id);
        if (!pid || !projectKPIs[pid]) continue;
        projectKPIs[pid].subs++;
        if (sub.status === "sent" && sub.synced_at) projectKPIs[pid].synced++;
        if (sub.status === "draft" || !sub.synced_at) projectKPIs[pid].pending++;
      }

      const chartData: ProjectKPI[] = Object.entries(projectKPIs)
        .map(([pid, kpi]) => {
          const fullName = projectMap.get(pid) || "Unknown";
          return {
            projectId: pid,
            project: fullName.length > 18 ? fullName.slice(0, 16) + "…" : fullName,
            totalForms: kpi.forms.size,
            submissions: kpi.subs,
            pendingSync: kpi.pending,
            syncRate: kpi.subs > 0 ? Math.round((kpi.synced / kpi.subs) * 100) : 0,
          };
        })
        .sort((a, b) => b.submissions - a.submissions);

      setData(chartData);

      // Summary tiles: scope to selectedProjectId when a project filter is active
      const summaryData = selectedProjectId
        ? chartData.filter(d => d.projectId === selectedProjectId)
        : chartData;
      const totalForms = summaryData.reduce((s, d) => s + d.totalForms, 0);
      const totalSubs = summaryData.reduce((s, d) => s + d.submissions, 0);
      const totalPending = summaryData.reduce((s, d) => s + d.pendingSync, 0);
      const totalSynced = summaryData.reduce((s, d) => s + d.syncRate * d.submissions / 100, 0);
      const avgRate = totalSubs > 0 ? Math.round((totalSynced / totalSubs) * 100) : 0;
      setTotals({ forms: totalForms, subs: totalSubs, pending: totalPending, rate: avgRate });

    } catch (err) {
      console.error("Error fetching KPI chart data:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-card">
        <CardContent className="p-6">
          <div className="h-64 bg-muted animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const selectedProjectName = selectedProjectId ? data.find(d => d.projectId === selectedProjectId)?.project : null;

  const handleBarClick = (chartEvent: any) => {
    if (!onProjectClick) return;
    const clickedEntry = chartEvent?.activePayload?.[0]?.payload as ProjectKPI | undefined;
    if (clickedEntry) {
      onProjectClick(
        selectedProjectId === clickedEntry.projectId ? null : clickedEntry.projectId,
        selectedProjectId === clickedEntry.projectId ? null : clickedEntry.project,
      );
    }
  };

  return (
    <Card className="border-0 shadow-card overflow-hidden">
      <div className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(220,70%,45%)] px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary-foreground">
            <BarChart3 className="h-4 w-4" />
            <span className="font-display text-sm font-bold tracking-wide uppercase">
              Project KPI Overview
            </span>
          </div>
          {selectedProjectName && (
            <button
              onClick={() => onProjectClick?.(null, null)}
              className="text-[10px] text-primary-foreground/70 hover:text-primary-foreground underline transition-colors"
            >
              Clear filter: {selectedProjectName}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-0 border-b border-border">
        {[
          { label: "Total Forms", value: totals.forms, color: COLORS.totalForms },
          { label: "Submissions", value: totals.subs, color: COLORS.submissions },
          { label: "Pending Sync", value: totals.pending, color: COLORS.pendingSync },
          { label: "Sync Rate", value: `${totals.rate}%`, color: COLORS.syncRate },
        ].map((item) => (
          <div key={item.label} className="p-3 text-center border-r last:border-r-0 border-border">
            <div className="flex items-center justify-center gap-1.5 mb-0.5">
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
              <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {item.label}
              </p>
            </div>
            <p className="font-display text-lg sm:text-xl font-bold text-foreground">
              {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
            </p>
          </div>
        ))}
      </div>

      <CardContent className="p-4 pt-3">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <BarChart3 className="h-10 w-10 mb-2 opacity-40" />
            <p className="text-sm">No project data yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, data.length * 55 + 60)}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 5, right: 30, left: isMobile ? 10 : 20, bottom: 5 }}
              barCategoryGap="20%"
              barGap={2}
              onClick={handleBarClick}
              style={{ cursor: onProjectClick ? "pointer" : undefined }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis
                dataKey="project"
                type="category"
                width={isMobile ? 80 : 130}
                tick={{ fontSize: isMobile ? 9 : 11, fill: "hsl(var(--foreground))" }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="square" iconSize={10} />
              <Bar dataKey="totalForms" name="Total Forms" fill={COLORS.totalForms} radius={[0, 3, 3, 0]} barSize={isMobile ? 10 : 14}>
                {data.map((entry) => (
                  <Cell key={`tf-${entry.projectId}`} opacity={!selectedProjectId || entry.projectId === selectedProjectId ? 1 : 0.3} />
                ))}
                <LabelList dataKey="totalForms" position="right" style={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              </Bar>
              <Bar dataKey="submissions" name="Submissions" fill={COLORS.submissions} radius={[0, 3, 3, 0]} barSize={isMobile ? 10 : 14}>
                {data.map((entry) => (
                  <Cell key={`sub-${entry.projectId}`} opacity={!selectedProjectId || entry.projectId === selectedProjectId ? 1 : 0.3} />
                ))}
                <LabelList dataKey="submissions" position="right" style={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              </Bar>
              <Bar dataKey="pendingSync" name="Pending Sync" fill={COLORS.pendingSync} radius={[0, 3, 3, 0]} barSize={isMobile ? 10 : 14}>
                {data.map((entry) => (
                  <Cell key={`ps-${entry.projectId}`} opacity={!selectedProjectId || entry.projectId === selectedProjectId ? 1 : 0.3} />
                ))}
                <LabelList dataKey="pendingSync" position="right" style={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              </Bar>
              <Bar dataKey="syncRate" name="Sync Rate (%)" fill={COLORS.syncRate} radius={[0, 3, 3, 0]} barSize={isMobile ? 10 : 14}>
                {data.map((entry) => (
                  <Cell key={`sr-${entry.projectId}`} opacity={!selectedProjectId || entry.projectId === selectedProjectId ? 1 : 0.3} />
                ))}
                <LabelList dataKey="syncRate" position="right" formatter={(v: number) => `${v}%`} style={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default DashboardKPIChart;
