import { useMemo, useState } from "react";
import {
  ArrowLeft, Loader2, RefreshCw, Users, GraduationCap, Stethoscope, ClipboardList,
  Eye, TrendingUp, AlertTriangle, Activity, MapPin, Download, Map as MapIcon, Target,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  PieChart, Pie, Legend, RadialBarChart, RadialBar,
  ScatterChart, Scatter, ZAxis, ReferenceLine, LabelList,
} from "recharts";
import { Button } from "@/components/ui/button";
import { useBmzDashboard } from "@/hooks/useBmzDashboard";
import { BMZ_GREEN, BMZ_TEAL, BMZ_DARK, readinessBand } from "@/lib/bmz/definition";
import JigawaLgaMap from "./JigawaLgaMap";
import { exportJigawaEyeHealthWorkbook } from "@/lib/bmz/bmzExcelExport";
import { toast } from "sonner";

interface Props {
  onClose: () => void;
}

const Kpi = ({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) => (
  <div className="rounded-2xl bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: `${color}1a`, color }}><Icon className="h-4 w-4" /></span>
    </div>
    <p className="mt-2 text-2xl font-black text-[#0b3d2e]">{value}</p>
    {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
  </div>
);

const Card = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
  <div className="rounded-2xl bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-center gap-2" style={{ color: BMZ_GREEN }}>
      <Icon className="h-4 w-4" /><h3 className="text-sm font-bold">{title}</h3>
    </div>
    {children}
  </div>
);

export default function BmzDashboard({ onClose }: Props) {
  const d = useBmzDashboard();
  const { stats } = d;

  const compGauge = useMemo(
    () => [{ name: "compliance", value: Math.round(stats.avgCompliance), fill: stats.avgBand.color }],
    [stats],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f1f6f4]">
      {/* Header */}
      <div className="shrink-0 px-4 pb-4 pt-4 text-white" style={{ background: `linear-gradient(150deg, ${BMZ_DARK}, ${BMZ_GREEN})` }}>
        <div className="flex items-center justify-between gap-2">
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex items-center gap-2 text-center">
            <Eye className="h-6 w-6" style={{ color: BMZ_TEAL }} />
            <div className="leading-tight">
              <p className="text-[11px] font-bold uppercase tracking-wide">Jigawa Eye Health Monitoring Dashboard</p>
              <p className="text-[10px]" style={{ color: BMZ_TEAL }}>BMZ Inclusive Eye Health Project</p>
            </div>
          </div>
          <button onClick={() => d.reload()} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><RefreshCw className={`h-4 w-4 ${d.loading ? "animate-spin" : ""}`} /></button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {d.loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading monitoring data…</div>
        ) : stats.total === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <ClipboardList className="h-10 w-10" />
            <p className="text-sm font-medium">No submitted monitoring visits yet.</p>
            <p className="text-xs">Completed checklists will appear here with live analytics.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-4 pb-8">
            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi icon={Users} label="Monitoring visits" value={String(stats.total)} sub={`${d.draftCount} draft(s)`} color={BMZ_GREEN} />
              <Kpi icon={GraduationCap} label="Trained on eye care" value={`${Math.round(stats.trainedPct)}%`} sub={`${stats.trained} of ${stats.total}`} color={BMZ_TEAL} />
              <Kpi icon={Stethoscope} label="Screening kits in use" value={`${Math.round(stats.kitsInUsePct)}%`} sub={`Posters ${Math.round(stats.postersInUsePct)}%`} color="#2563eb" />
              <Kpi icon={TrendingUp} label="Referral rate" value={`${stats.referralRate}%`} sub={`${stats.referralsMade} of ${stats.screened} screened`} color="#f59e0b" />
            </div>

            {/* Compliance gauge + activity coverage */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Card title="Average compliance index" icon={Activity}>
                <div className="relative h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart innerRadius="70%" outerRadius="100%" data={compGauge} startAngle={90} endAngle={-270}>
                      <RadialBar dataKey="value" cornerRadius={12} background={{ fill: "#eef2f0" }} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black text-[#0b3d2e]">{Math.round(stats.avgCompliance)}%</span>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: stats.avgBand.color }}>{stats.avgBand.label}</span>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-center text-[11px]">
                  <div className="rounded-lg bg-[#f1f6f4] p-2"><p className="font-bold text-[#0b3d2e]">{Math.round(stats.registerOkPct)}%</p><p className="text-muted-foreground">Registers up to date</p></div>
                  <div className="rounded-lg bg-[#f1f6f4] p-2"><p className="font-bold text-[#0b3d2e]">{Math.round(stats.referralOkPct)}%</p><p className="text-muted-foreground">Referral evidence</p></div>
                </div>
              </Card>

              <div className="md:col-span-2">
                <Card title="Primary activity coverage" icon={ClipboardList}>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={d.activities} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: any) => [`${v}%`, "Coverage"]} />
                      <Bar dataKey="pct" radius={[0, 6, 6, 0]} fill={BMZ_GREEN} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            </div>

            {/* Cadre performance + refresher + sex */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Card title="Visits & compliance by cadre" icon={Users}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d.byCadre} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="Visits" radius={[6, 6, 0, 0]}>
                      {d.byCadre.map((c) => <Cell key={c.key} fill={c.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-1 flex flex-wrap justify-center gap-3 text-[11px]">
                  {d.byCadre.map((c) => <span key={c.key} className="text-muted-foreground"><b style={{ color: c.color }}>{c.name}</b>: {c.compliance}%</span>)}
                </div>
              </Card>

              <Card title="Refresher training status" icon={GraduationCap}>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={d.refresherBreakdown} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {d.refresherBreakdown.map((r, i) => <Cell key={i} fill={r.color} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Card>

              <Card title="Respondents by sex" icon={Users}>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={d.bySex} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {d.bySex.map((r, i) => <Cell key={i} fill={r.color} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Availability + LGA */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Card title="Material availability" icon={Stethoscope}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d.availability} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip formatter={(v: any) => `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="in_use" stackId="a" name="In use" fill="#16a34a" />
                    <Bar dataKey="not_in_use" stackId="a" name="Not in use" fill="#f59e0b" />
                    <Bar dataKey="not_available" stackId="a" name="Not available" fill="#dc2626" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card title="Visits by LGA" icon={MapPin}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d.byLga} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Visits" radius={[6, 6, 0, 0]} fill={BMZ_TEAL} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Challenges */}
            {d.challenges.length > 0 && (
              <Card title="Reported challenges" icon={AlertTriangle}>
                <div className="space-y-2">
                  {d.challenges.map((c) => (
                    <div key={c.name}>
                      <div className="flex items-center justify-between text-xs"><span className="text-foreground">{c.name}</span><span className="font-semibold text-muted-foreground">{c.count} ({c.pct}%)</span></div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#eef2f0]"><div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: "#f59e0b" }} /></div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Flagged */}
            {d.flagged.length > 0 && (
              <Card title="Flagged visits needing support (compliance < 60%)" icon={AlertTriangle}>
                <div className="-mx-2 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="px-2 py-2">Community / Ward</th><th className="px-2 py-2">LGA</th><th className="px-2 py-2">Cadre</th>
                        <th className="px-2 py-2">Facility</th><th className="px-2 py-2">Kits</th><th className="px-2 py-2 text-right">Compliance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.flagged.map((f) => (
                        <tr key={f.id} className="border-b border-border/60">
                          <td className="px-2 py-2 font-medium text-foreground">{f.location}</td>
                          <td className="px-2 py-2">{f.lga}</td>
                          <td className="px-2 py-2">{f.cadre}</td>
                          <td className="px-2 py-2">{f.facility}</td>
                          <td className="px-2 py-2">{f.kits}</td>
                          <td className="px-2 py-2 text-right"><span className="rounded-full bg-[#fee2e2] px-2 py-0.5 font-bold text-[#dc2626]">{f.compliance}%</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
