import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listDonorGrants, loadDonorDashboard, choroplethCells, mergeMonthly, reportCsv,
  type DonorAggregates, type DonorActivityItem, type DonorGrant, type DonorReport,
} from "@/lib/donorPortal";
import type { ProjectLogframe } from "@/lib/programmeModule/logframe";
import { flatIndicators } from "@/lib/programmeModule/logframe";
import NigeriaChoropleth from "@/components/Dashboard/ops/NigeriaChoropleth";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Users, HeartHandshake, Stethoscope, Home, ArrowRightLeft, MessageSquareHeart, LogOut, Download, FileText } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function downloadReportCsv(report: DonorReport, projectName: string) {
  const blob = new Blob([reportCsv(report)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName.replace(/\s+/g, "-")}-report-${report.period_label.replace(/\s+/g, "-")}${report.report_year ? `-${report.report_year}` : ""}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type Section = "overview" | "report" | "logframe" | "activity";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "report", label: "Programme Report" },
  { key: "logframe", label: "Logframe" },
  { key: "activity", label: "Field Activity" },
];

const PIE_COLORS = ["hsl(var(--donor-blue))", "hsl(var(--donor-navy-2))", "hsl(var(--health-teal))", "hsl(var(--chart-secondary))", "hsl(var(--status-warning))"];

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString();

export default function DonorPortal({ userId }: { userId: string }) {
  const [grants, setGrants] = useState<DonorGrant[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [agg, setAgg] = useState<DonorAggregates | null>(null);
  const [activity, setActivity] = useState<DonorActivityItem[]>([]);
  const [reports, setReports] = useState<DonorReport[]>([]);
  const [logframe, setLogframe] = useState<ProjectLogframe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDonorGrants(userId)
      .then((g) => { setGrants(g); const saved = localStorage.getItem(`donor-project:${userId}`); setProjectId(g.find(item => item.project_id === saved)?.project_id ?? g[0]?.project_id ?? null); })
      .catch((e) => setError(e.message));
  }, [userId]);

  useEffect(() => {
    if (!projectId) return;
    localStorage.setItem(`donor-project:${userId}`, projectId);
    setError(null);
    let active = true;
    setAgg(null); setActivity([]); setReports([]); setLogframe(null);
    const refresh = () => loadDonorDashboard(projectId)
      .then(({ aggregates, activity, reports, logframe }) => {
        if (!active) return;
        setAgg(aggregates); setActivity(activity); setReports(reports); setLogframe(logframe); setError(null);
      })
      .catch((e) => { if (active) setError(e.message); });
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, [projectId, userId]);

  const cells = useMemo(() => (agg ? choroplethCells(agg) : new Map()), [agg]);
  const project = grants?.find((g) => g.project_id === projectId);
  const indicatorLookup = useMemo(() => new Map(logframe ? flatIndicators(logframe.objectives).map(i => [i.code, i]) : []), [logframe]);

  if (error) {
    return (
      <main className="donor-portal flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="donor-heading text-xl">Something went wrong</h1>
        <p className="max-w-md text-sm opacity-70">{error}</p>
      </main>
    );
  }

  if (grants && grants.length === 0) {
    return (
      <main className="donor-portal flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="donor-eyebrow">Amehnities · Donor Portal</p>
        <h1 className="donor-heading text-2xl">No project access yet</h1>
        <p className="max-w-md text-sm opacity-70">
          Your donor account is ready. Ask the programme team to connect your organisation to its project.
        </p>
        <Button variant="outline" onClick={() => void supabase.auth.signOut()}>Sign out</Button>
      </main>
    );
  }

  return (
    <main className="donor-portal min-h-[100dvh]">
      <header className="donor-topbar sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="donor-eyebrow">Amehnities · Donor Portal</p>
            <h1 className="donor-heading truncate text-lg sm:text-xl">{project?.project?.name ?? "Loading…"}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {grants && grants.length > 1 && (
              <Select value={projectId ?? ""} onValueChange={setProjectId}><SelectTrigger className="w-48" aria-label="Switch project"><SelectValue /></SelectTrigger><SelectContent>{grants.map(g => <SelectItem key={g.id} value={g.project_id}>{g.project?.name ?? "Project"}</SelectItem>)}</SelectContent></Select>
            )}
            <Button variant="ghost" size="sm" onClick={() => void supabase.auth.signOut()} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6" aria-label="Portal sections">
          {SECTIONS.map((s) => (
            <Button variant="ghost"
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`donor-nav ${section === s.key ? "donor-nav-active" : ""}`}
            >
              {s.label}
            </Button>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {section === "overview" && agg && (
          <>
            <section className="border-b border-border pb-5"><p className="donor-eyebrow">Programme intelligence</p><h2 className="donor-heading mt-2 text-2xl">Your impact, in focus</h2><p className="mt-2 text-sm opacity-70">{project?.organization || "Project portfolio"} · {reports.length} submitted reports · {Object.keys(agg.by_state).length} states reached</p></section>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi icon={<Users />} label="People reached" value={fmt(agg.total_beneficiaries)} />
              <Kpi icon={<HeartHandshake />} label="Active in care" value={fmt(agg.active_beneficiaries)} />
              <Kpi icon={<Stethoscope />} label="Services delivered" value={fmt(agg.total_services)} />
              <Kpi icon={<Home />} label="Home visits" value={fmt(agg.home_visits_completed)} />
              <Kpi icon={<ArrowRightLeft />} label="Referrals" value={fmt(agg.referrals_total)} />
              <Kpi icon={<MessageSquareHeart />} label="Community feedback" value={fmt(agg.feedback_total)} />
            </section>

            <section aria-label="Programme risks" className="border-y border-border py-5">
              <h2 className="donor-heading mb-4 text-lg">Care continuity & programme risks</h2>
              <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                <div><p className="donor-eyebrow">Referral completion</p><p className="donor-kpi-number mt-2">{agg.referral_completion_pct == null ? "—" : `${agg.referral_completion_pct}%`}</p><p className="mt-2 text-xs opacity-70">{fmt(agg.referrals_completed)} completed / {fmt(agg.referrals_total)} recorded</p></div>
                <div><p className="text-sm font-medium text-status-warning">Overdue follow-ups</p><p className="donor-kpi-number mt-2">{fmt(agg.overdue_followups)}</p><p className="mt-2 text-xs opacity-70">Active care appointments past due</p></div>
                <div><p className="text-sm font-medium text-status-danger">Overdue home visits</p><p className="donor-kpi-number mt-2">{fmt(agg.overdue_home_visits)}</p><p className="mt-2 text-xs opacity-70">Dispatched visits awaiting completion</p></div>
                <div><p className="text-sm font-medium">Recorded risk levels</p><ul className="mt-2 space-y-1 text-sm">{Object.entries(agg.risk_by_level ?? {}).map(([level, count]) => <li key={level} className="flex justify-between gap-2"><span className="capitalize">{level}</span><span className="font-semibold">{fmt(count)}</span></li>)}</ul></div>
              </div>
            </section>

            {reports.length > 0 && (
              <section className="donor-card flex flex-wrap items-center gap-3 p-4 sm:p-6">
                <div className="donor-kpi-icon"><FileText /></div>
                <div className="min-w-0 flex-1">
                  <p className="donor-eyebrow">Latest programme report</p>
                  <p className="donor-heading text-base">
                    {reports[0].period_label}{reports[0].report_year ? ` · ${reports[0].report_year}` : ""}
                  </p>
                  <p className="text-xs opacity-70">
                    {reports[0].entries.length} indicators ·{" "}
                    {new Date(reports[0].created_at).toLocaleDateString()}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSection("report")}>
                  View reports
                </Button>
              </section>
            )}

            <section className="donor-card p-4 sm:p-6">
              <h2 className="donor-heading mb-1 text-lg">Where people are reached</h2>
              <p className="mb-3 text-sm opacity-70">Beneficiaries by Local Government Area — deeper blue means more people reached.</p>
              <NigeriaChoropleth cells={cells} height={440} showBasemap={false} showStreetView={false} />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="donor-card p-4 sm:p-6">
                <h2 className="donor-heading mb-3 text-lg">Registrations over time</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={mergeMonthly(agg.registrations_by_month)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--donor-border))" />
                    <XAxis dataKey="month" fontSize={11} />
                    <YAxis fontSize={11} allowDecimals={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="count" stroke="hsl(var(--donor-blue))" fill="hsl(var(--donor-blue) / 0.18)" name="Registrations" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="donor-card p-4 sm:p-6">
                <h2 className="donor-heading mb-3 text-lg">Services over time</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={mergeMonthly(agg.services_by_month)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--donor-border))" />
                    <XAxis dataKey="month" fontSize={11} />
                    <YAxis fontSize={11} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--donor-navy-2))" radius={[4, 4, 0, 0]} name="Services" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <Breakdown title="By sex" data={agg.by_sex} />
              <Breakdown title="By age band" data={agg.by_age_band} ordered={["0-4", "5-14", "15-24", "25-49", "50-64", "65+"]} />
              <div className="donor-card p-4 sm:p-6">
                <h3 className="donor-heading mb-3 text-base">Inclusion</h3>
                <p className="donor-kpi-number">{fmt(agg.with_disability)}</p>
                <p className="text-sm opacity-70">people with disability (Washington Group classification) among those reached</p>
              </div>
            </section>

            <section className="donor-card p-4 sm:p-6">
              <h2 className="donor-heading mb-3 text-lg">Services by component</h2>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={Object.entries(agg.services_by_component).map(([name, value]) => ({ name, value }))}
                    dataKey="value" nameKey="name" outerRadius={90} label>
                    {Object.keys(agg.services_by_component).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </section>
            <section className="border-t border-border pt-5"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="donor-heading text-lg">Latest field activity</h2><Button variant="link" onClick={() => setSection("activity")}>View all</Button></div><ol className="donor-timeline">{activity.slice(0, 5).map((a, i) => <li key={i} className="donor-timeline-item"><span className={`donor-dot donor-dot-${a.kind}`} /><div><p className="text-sm font-medium">{a.summary}</p><p className="text-xs opacity-60">{[a.component, a.lga, a.state].filter(Boolean).join(" · ")} · {new Date(a.occurred_at).toLocaleDateString()}</p></div></li>)}</ol>{activity.length === 0 && <p className="text-sm opacity-70">No field activity recorded yet.</p>}</section>
          </>
        )}

        {section === "report" && (
          <section className="space-y-4">
            <h2 className="donor-heading text-xl">Programme Report</h2>
            {reports.length === 0 && <p className="donor-card p-6 text-sm opacity-70">No reports have been submitted for this project yet.</p>}
            {reports.map((r) => (
              <article key={r.id} className="donor-card p-4 sm:p-6">
                <header className="mb-3 flex flex-wrap items-center gap-2">
                  <h3 className="donor-heading text-lg">{r.period_label}{r.report_year ? ` · ${r.report_year}` : ""}</h3>
                  {r.status && <span className="donor-chip">{r.status}</span>}
                  <span className="ml-auto flex items-center gap-2">
                    <time className="text-xs opacity-60">{new Date(r.created_at).toLocaleDateString()}</time>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadReportCsv(r, project?.project?.name ?? "project")}
                      aria-label={`Download ${r.period_label} report as CSV`}
                    >
                      <Download className="mr-1 h-3.5 w-3.5" /> CSV
                    </Button>
                  </span>
                </header>
                {r.notes && <p className="mb-3 text-sm opacity-80">{r.notes}</p>}
                {r.entries.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="donor-table">
                      <thead>
                        <tr><th>Indicator</th><th className="text-right">Value</th><th>Disaggregation</th><th>Risk / note</th></tr>
                      </thead>
                      <tbody>
                        {r.entries.map((e, i) => (
                          <tr key={i}>
                            <td className="font-medium"><span className="donor-chip">{e.indicator_code}</span><p className="mt-1">{indicatorLookup.get(e.indicator_code)?.title}</p></td>
                            <td className="text-right donor-kpi-number !text-base">{fmt(e.value)}{indicatorLookup.get(e.indicator_code)?.isPercent ? "%" : ""}</td>
                            <td className="text-xs opacity-80">
                              {e.disaggregation
                                ? Object.entries(e.disaggregation).map(([k, v]) => `${k}: ${v}`).join(" · ")
                                : "—"}
                            </td>
                            <td className="text-xs opacity-80">{e.risk ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm opacity-60">No indicator values recorded in this report.</p>
                )}
              </article>
            ))}
          </section>
        )}

        {section === "logframe" && logframe && (
          <section className="space-y-5">
            <header className="donor-card p-5 sm:p-7">
              <p className="donor-eyebrow">Logical Framework · {logframe.project.id}</p>
              <h2 className="donor-heading mt-1 text-xl sm:text-2xl">{logframe.project.name}</h2>
              <p className="mt-2 max-w-3xl text-sm italic opacity-80">{logframe.project.impact}</p>
            </header>
            {logframe.objectives.map((obj) => (
              <article key={obj.key} className={`donor-card donor-objective-${obj.tone} p-5 sm:p-7`}>
                <h3 className="donor-heading text-lg">{obj.title}</h3>
                <p className="mt-1 text-sm opacity-80">{obj.statement}</p>
                <div className="mt-4 space-y-4">
                  {obj.results.map((res) => (
                    <div key={res.key} className="donor-result">
                      <h4 className="font-semibold">{res.title}</h4>
                      <ul className="mt-2 space-y-2">
                        {res.indicators.map((ind) => (
                          <li key={ind.code} className="donor-indicator">
                            <span className="donor-chip">{ind.code}</span>
                            <span className="flex-1 text-sm">{ind.title}</span>
                            {ind.totalTarget && <span className="text-xs font-semibold opacity-70">Target: {ind.totalTarget}{ind.isPercent ? "%" : ""}</span>}
                          </li>
                        ))}
                        {res.activities.map(activity => <li key={activity.code} className="donor-indicator"><span className="donor-chip">{activity.code}</span><div className="flex-1"><p className="text-sm font-medium">{activity.title}</p><p className="text-xs opacity-70">{activity.indicator}</p></div></li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>
        )}

        {section === "activity" && (
          <section className="space-y-3">
            <h2 className="donor-heading text-xl">Field Activity</h2>
            <p className="text-sm opacity-70">Recent programme activity, without any personal details.</p>
            {activity.length === 0 && <p className="donor-card p-6 text-sm opacity-70">No field activity recorded yet.</p>}
            <ol className="donor-timeline">
              {activity.map((a, i) => (
                <li key={i} className="donor-timeline-item">
                  <span className={`donor-dot donor-dot-${a.kind}`} aria-hidden />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{a.summary}</p>
                    <p className="text-xs opacity-60">
                      {[a.component, a.lga, a.state].filter(Boolean).join(" · ")}
                      {a.occurred_at && ` · ${new Date(a.occurred_at).toLocaleString()}`}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="donor-card donor-kpi p-4">
      <div className="donor-kpi-icon">{icon}</div>
      <p className="donor-kpi-number">{value}</p>
      <p className="text-xs opacity-70">{label}</p>
    </div>
  );
}

function Breakdown({ title, data, ordered }: { title: string; data: Record<string, number>; ordered?: string[] }) {
  const entries = ordered
    ? ordered.filter((k) => data[k] != null).map((k) => [k, data[k]] as const)
    : Object.entries(data);
  const total = entries.reduce((s, [, n]) => s + n, 0) || 1;
  return (
    <div className="donor-card p-4 sm:p-6">
      <h3 className="donor-heading mb-3 text-base">{title}</h3>
      <ul className="space-y-2">
        {entries.map(([k, n]) => (
          <li key={k}>
            <div className="flex justify-between text-xs"><span>{k}</span><span className="font-semibold">{fmt(n)}</span></div>
            <div className="donor-bar"><div className="donor-bar-fill" style={{ width: `${(n / total) * 100}%` }} /></div>
          </li>
        ))}
        {entries.length === 0 && <li className="text-xs opacity-60">No data yet.</li>}
      </ul>
    </div>
  );
}
