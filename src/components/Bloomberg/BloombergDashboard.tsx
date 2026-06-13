import { useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, School, CheckCircle2, FileText, Users, TrendingUp, AlertTriangle, MapPin, Download, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";
import MapVisualization from "@/components/MapVisualization/MapVisualization";
import { MapMarker } from "@/components/MapVisualization/types";
import { useBloombergDashboard } from "@/hooks/useBloombergDashboard";
import { useAuth } from "@/hooks/useAuth";
import { exportSchoolTemplate, importSchoolTemplate } from "@/lib/bloomberg/schoolTemplate";
import { toast } from "sonner";
import bloombergLogo from "@/assets/bloomberg-eye-logo.png";

const NAVY = "#0c2340";
const BLUE = "#2563eb";
const TEAL = "#14b8a6";
const PINK = "#ec4899";

interface Props {
  onClose: () => void;
}

const fmt = (n: number) => n.toLocaleString();

const Kpi = ({ icon: Icon, label, value, tint, sub }: { icon: any; label: string; value: string; tint: string; sub?: string }) => (
  <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${tint}1a`, color: tint }}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
    <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
    {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
  </div>
);

export default function BloombergDashboard({ onClose }: Props) {
  const { stats, byState, points, loading, reload } = useBloombergDashboard();

  const markers: MapMarker[] = useMemo(
    () =>
      points.map((p, i) => ({
        id: `bbg-${i}`,
        lat: p.lat,
        lng: p.lng,
        title: p.name || "Validated school",
        description: p.status,
        markerColor: p.status === "sent" || p.status === "finalized" ? TEAL : "#f59e0b",
      })),
    [points],
  );

  const genderData = [
    { name: "Boys", value: stats.validatedMale, color: BLUE },
    { name: "Girls", value: stats.validatedFemale, color: PINK },
  ];

  const comparisonData = [
    { name: "Baseline (LEA)", value: stats.baselineTotal, color: "#94a3b8" },
    { name: "Validated", value: stats.validatedTotal, color: TEAL },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f4f6fb]">
      {/* Navy header */}
      <div className="shrink-0 px-4 py-4 text-white" style={{ background: `linear-gradient(160deg, ${NAVY}, #163a63)` }}>
        <div className="flex items-center justify-between gap-3">
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <img src={bloombergLogo} alt="Bloomberg School Eye Health" className="h-7 w-7 rounded" loading="lazy" width={28} height={28} />
            <span className="text-sm font-semibold leading-tight">Bloomberg School<br />Eye Health Project</span>
          </div>
          <Button size="sm" variant="secondary" onClick={reload} disabled={loading} className="h-9 bg-white/15 text-white hover:bg-white/25 border-0">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <h1 className="mt-3 text-2xl font-bold">Validation Dashboard</h1>
        <p className="text-sm text-white/70">Independent school enrolment validation — admin analytics</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={School} label="Total Schools" value={fmt(stats.totalSchools)} tint={NAVY} />
          <Kpi icon={CheckCircle2} label="Schools Validated" value={fmt(stats.validatedSchools)} tint={TEAL} sub={`${stats.coveragePct.toFixed(1)}% coverage`} />
          <Kpi icon={FileText} label="Submissions" value={fmt(stats.submittedCount)} tint={BLUE} sub={`${stats.draftCount} drafts`} />
          <Kpi icon={Users} label="Pupils Validated" value={fmt(stats.validatedTotal)} tint={PINK} />
          <Kpi icon={Users} label="Baseline (LEA)" value={fmt(stats.baselineTotal)} tint="#64748b" sub="for validated schools" />
          <Kpi
            icon={TrendingUp}
            label="Overall Variance"
            value={`${stats.overallPct >= 0 ? "+" : ""}${stats.overallPct.toFixed(1)}%`}
            tint={stats.overallPct < 0 ? "#ef4444" : TEAL}
            sub="validated vs baseline"
          />
          <Kpi icon={Users} label="Boys" value={fmt(stats.validatedMale)} tint={BLUE} />
          <Kpi icon={Users} label="Girls" value={fmt(stats.validatedFemale)} tint={PINK} />
        </div>

        {/* Map */}
        <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[#2563eb]" />
            <h3 className="text-sm font-semibold text-foreground">Validated Schools Across Nigeria</h3>
          </div>
          <MapVisualization markers={markers} height="420px" showNigeriaBoundaries showLegend={false} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Baseline vs Validated Enrolment</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {comparisonData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Gender Distribution (Validated)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={genderData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
                  {genderData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Submissions by state */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Submissions by State</h3>
          <ResponsiveContainer width="100%" height={Math.max(160, byState.length * 32)}>
            <BarChart data={byState} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
              <YAxis type="category" dataKey="state" width={110} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill={BLUE} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top discrepancies */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">Top Enrolment Discrepancies</h3>
          </div>
          {stats.discrepancies.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No validated schools with baseline data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">School</th>
                    <th className="py-2 px-3 text-right">Baseline</th>
                    <th className="py-2 px-3 text-right">Validated</th>
                    <th className="py-2 px-3 text-right">Diff</th>
                    <th className="py-2 pl-3 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.discrepancies.map((d, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">{d.school}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(d.baseline)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(d.validated)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums ${d.diff < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {d.diff >= 0 ? "+" : ""}{fmt(d.diff)}
                      </td>
                      <td className={`py-2 pl-3 text-right font-semibold tabular-nums ${Math.abs(d.pct) >= 20 ? "text-red-600" : "text-amber-600"}`}>
                        {d.pct >= 0 ? "+" : ""}{d.pct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
