import { useMemo, useState } from "react";
import {
  ArrowLeft, RefreshCw, Download, Users, Megaphone, ShieldCheck, MapPin,
  Landmark, TrendingUp, FileSpreadsheet, Moon, Sun, Layers, Gauge,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useIrfDashboard } from "@/hooks/useIrfDashboard";
import { useAcsmDuplicateOverrides } from "@/hooks/useAcsmDuplicateOverrides";
import DuplicateReviewPanel from "@/components/ACSM/DuplicateReviewPanel";
import { IRF_DASH_NAME } from "@/lib/irf/definition";
import { IRF_CATEGORY_FORMS } from "@/lib/irf/categoryForms";
import { IrfWatermark } from "@/components/IRF/IRFFormFiller";
import IrfKanoMap from "@/components/IRF/IrfKanoMap";
import OwnerSubmissionManager from "@/components/owner/OwnerSubmissionManager";
import IrfEvidenceLibrary from "@/components/IRF/IrfEvidenceLibrary";
import IrfTextInsights from "@/components/IRF/IrfTextInsights";
import IrfStatisticalPanel from "@/components/IRF/IrfStatisticalPanel";
import IrfFieldAnalysis from "@/components/IRF/IrfFieldAnalysis";
import IrfInterpretation from "@/components/IRF/IrfInterpretation";
import IrfSubmitterPanel from "@/components/IRF/IrfSubmitterPanel";

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

const fmt = (n: number) => new Intl.NumberFormat().format(Math.round(n || 0));
const chartText = "hsl(var(--foreground))";
const chartMuted = "hsl(var(--muted-foreground))";
const chartBorder = "hsl(var(--border))";
const chartTooltipStyle = { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: chartText };
const chartLegendStyle = { color: chartText, fontSize: 12 };
const num = (v: any) => (v == null || v === "" ? 0 : Number(v) || 0);

function Kpi({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) {
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="absolute right-0 top-0 h-full w-1" style={{ background: color }} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className="rounded-lg p-2 shrink-0" style={{ backgroundColor: `${color}1a` }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
      </div>
    </Card>
  );
}

export default function IRFDashboard({ projectId, onClose }: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const overrides = useAcsmDuplicateOverrides(projectId);
  const { rows, loading, reload, stats, genderSplit, ncBreakdown, trend, dataQuality, duplicates, points } =
    useIrfDashboard(projectId, overrides.irfMap);
  const [exporting, setExporting] = useState(false);

  const exportCsv = () => {
    setExporting(true);
    try {
      if (!rows.length) return;
      const cols = Object.keys(rows[0]);
      const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc((r as any)[c])).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `irf-reports-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  const monthlyData = useMemo(() => trend.map((t) => ({ ...t, label: t.month })), [trend]);

  // People reached per LGA (drives the Kano choropleth).
  const lgaValues = useMemo(() => {
    const out: Record<string, number> = {};
    rows.forEach((r) => {
      const lga = (r.lga || "").trim();
      if (!lga) return;
      out[lga] = (out[lga] || 0) + num(r.total_reach) + num(r.radio_estimated_reach) + num(r.attendance_men) + num(r.attendance_women);
    });
    return out;
  }, [rows]);

  // Submissions per standalone activity form.
  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach((r) => { const c = (r as any).form_category || "other"; counts[c] = (counts[c] || 0) + 1; });
    return IRF_CATEGORY_FORMS.map((f) => ({ name: f.short, value: counts[f.id] || 0, color: f.color }))
      .concat(counts["other"] ? [{ name: "Legacy / Other", value: counts["other"], color: "#64748b" }] : []);
  }, [rows]);

  // Outcome acceptance levels.
  const outcomeLevels = useMemo(() => {
    const base: Record<string, number> = { High: 0, Medium: 0, Low: 0 };
    rows.forEach((r) => { const o = (r as any).outcome_level; if (o && base[o] != null) base[o] += 1; });
    return [
      { name: "High", value: base.High, color: "#16a34a" },
      { name: "Medium", value: base.Medium, color: "#d97706" },
      { name: "Low", value: base.Low, color: "#dc2626" },
    ];
  }, [rows]);

  return (
    <div className="relative isolate min-h-screen w-full overflow-hidden bg-background text-foreground">
      <IrfWatermark />
      <div className="relative z-10 mx-auto w-full max-w-6xl pb-16">
        {/* Header */}
        <div className="sticky top-0 z-20 flex flex-wrap items-start gap-3 border-b bg-gradient-to-r from-[#0c2340] to-[#1a4a6e] px-4 py-3">
          <Button variant="ghost" size="icon" aria-label="Back to forms" onClick={onClose} className="text-white hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></Button>
          <div className="min-w-0 flex-[1_1_240px]">
            <h1 className="whitespace-normal break-words text-sm font-bold leading-tight text-white sm:text-lg">{IRF_DASH_NAME}</h1>
            <p className="truncate text-xs text-white/70">{stats.totalReports} reports · {stats.lgas} LGAs · Kano State · live updates on</p>
          </div>
          <Button variant="ghost" size="icon" aria-label={isDarkTheme ? "Light mode" : "Dark mode"} aria-pressed={isDarkTheme}
            onClick={() => setTheme(isDarkTheme ? "light" : "dark")} className="text-white hover:bg-white/10">
            {isDarkTheme ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Refresh dashboard" onClick={() => reload()} className="text-white hover:bg-white/10"><RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button variant="ghost" size="icon" aria-label="Export reports as CSV" onClick={exportCsv} disabled={exporting || !rows.length} className="text-white hover:bg-white/10"><Download className="h-5 w-5" /></Button>
          <OwnerSubmissionManager table="irf_reports" title="IRF reports" labelColumns={["lga", "ward", "state"]}
            filter={projectId ? { column: "project_id", value: projectId } : null} onChanged={reload} compact
            className="text-white border-white/30 hover:bg-white/10" />
        </div>

        {loading && !rows.length ? (
          <div className="relative z-10 flex h-64 items-center justify-center text-muted-foreground">Loading reports…</div>
        ) : !rows.length ? (
          <div className="relative z-10 flex h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <FileSpreadsheet className="h-10 w-10 opacity-40" />
            <p>No reports submitted yet.</p>
            <p className="text-xs">Submitted reports appear here instantly.</p>
          </div>
        ) : (
          <div className="relative z-10 space-y-5 p-4">
            {duplicates && duplicates.duplicateCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                <ShieldCheck className="h-4 w-4" />
                <span className="font-semibold">{fmt(duplicates.duplicateCount)} duplicate submission(s) flagged</span>
                <span>·</span>
                <span>{fmt(duplicates.uniqueCount)} unique of {fmt(duplicates.totalCount)} total reports</span>
              </div>
            )}

            <DuplicateReviewPanel projectId={projectId} />

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi icon={Users} label="People Reached" value={fmt(stats.peopleReached)} sub="Reach + attendance" color="#0891b2" />
              <Kpi icon={Landmark} label="Stakeholders Engaged" value={fmt(stats.stakeholdersEngaged)} sub="Advocacy contacts" color="#7c3aed" />
              <Kpi icon={Megaphone} label="Awareness Activities" value={fmt(stats.awarenessActivities)} sub="Broadcasts, IEC, dialogues" color="#ea580c" />
              <Kpi icon={ShieldCheck} label="Non-Compliance Resolved" value={`${stats.ncResolutionRate}%`} sub={`${fmt(stats.ncResolved)} of ${fmt(stats.ncTotal)} cases`} color="#dc2626" />
            </div>

            {/* Kano State coverage map */}
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 border-b p-4">
                <MapPin className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Kano State — People Reached by LGA</h3>
                <span className="ml-auto text-xs text-muted-foreground">{points.length} geo-tagged report(s)</span>
              </div>
              <div className="p-3">
                <IrfKanoMap lgaValues={lgaValues} points={points} />
              </div>
            </Card>

            {/* Activity forms + outcomes */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Layers className="h-4 w-4 text-primary" /> Submissions by Activity Form</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={categoryBreakdown} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartBorder} opacity={0.7} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: chartMuted }} axisLine={{ stroke: chartBorder }} tickLine={{ stroke: chartBorder }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: chartMuted }} axisLine={{ stroke: chartBorder }} tickLine={{ stroke: chartBorder }} />
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: chartText }} />
                    <Bar dataKey="value" name="Submissions" radius={[0, 4, 4, 0]}>
                      {categoryBreakdown.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Gauge className="h-4 w-4 text-primary" /> Key Outcome Acceptance</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={outcomeLevels} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {outcomeLevels.map((g) => <Cell key={g.name} fill={g.color} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: chartText }} /><Legend wrapperStyle={chartLegendStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Trend */}
            <Card className="p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><TrendingUp className="h-4 w-4 text-primary" /> Monthly Reach & Reports</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartBorder} opacity={0.7} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartMuted }} axisLine={{ stroke: chartBorder }} tickLine={{ stroke: chartBorder }} />
                  <YAxis tick={{ fontSize: 11, fill: chartMuted }} axisLine={{ stroke: chartBorder }} tickLine={{ stroke: chartBorder }} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: chartText }} />
                  <Legend wrapperStyle={chartLegendStyle} />
                  <Line type="monotone" dataKey="reach" name="People reached" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="reports" name="Reports" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            {/* Gender + NC + Data quality */}
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Dialogue Attendance</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={genderSplit} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {genderSplit.map((g) => <Cell key={g.name} fill={g.color} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: chartText }} /><Legend wrapperStyle={chartLegendStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Non-Compliance</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={ncBreakdown} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {ncBreakdown.map((g) => <Cell key={g.name} fill={g.color} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: chartText }} /><Legend wrapperStyle={chartLegendStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Data Quality</h3>
                <div className="flex h-[200px] flex-col items-center justify-center gap-2">
                  <div className="text-5xl font-bold" style={{ color: dataQuality >= 80 ? "#16a34a" : dataQuality >= 50 ? "#f59e0b" : "#dc2626" }}>{dataQuality}%</div>
                  <p className="text-center text-xs text-muted-foreground">Reports with complete identity (state, LGA, reporter, month)</p>
                </div>
              </Card>
            </div>

            {/* Dynamic executive interpretation of the dataset */}
            <IrfInterpretation rows={rows} stats={stats} duplicateCount={duplicates?.duplicateCount || 0} />

            {/* Robust statistical analysis of indicators */}
            <IrfStatisticalPanel rows={rows} />

            {/* McKinsey-style field-by-field response analysis */}
            <IrfFieldAnalysis rows={rows} />

            {/* Who is submitting: forms, counts, duplicates */}
            <IrfSubmitterPanel rows={rows} duplicateIds={duplicates?.duplicateIds || new Set()} />

            {/* Narrative & free-text intelligence */}
            <IrfTextInsights rows={rows} />

            {/* Collapsible evidence library: activity pictures + consent forms */}
            <IrfEvidenceLibrary rows={rows} />
          </div>
        )}
      </div>
    </div>
  );
}
