import { useMemo, useState } from "react";
import {
  ArrowLeft, RefreshCw, Download, Users, Megaphone, ShieldCheck, MapPin,
  Landmark, TrendingUp, FileSpreadsheet,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useIrfDashboard } from "@/hooks/useIrfDashboard";
import { IRF_DASH_NAME } from "@/lib/irf/definition";
import { IrfWatermark } from "@/components/IRF/IRFFormFiller";

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

const fmt = (n: number) => new Intl.NumberFormat().format(Math.round(n || 0));

function Kpi({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) {
  return (
    <Card className="p-4">
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
  const { rows, loading, reload, stats, sectionTotals, genderSplit, ncBreakdown, topLgas, trend, dataQuality } =
    useIrfDashboard(projectId);
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

  const monthlyData = useMemo(
    () => trend.map((t) => ({ ...t, label: t.month })),
    [trend],
  );

  return (
    <div className="relative mx-auto w-full max-w-6xl pb-16">
      <IrfWatermark />
      {/* Header */}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b bg-gradient-to-r from-[#0c2340] to-[#1a4a6e] px-4 py-3">
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-white sm:text-lg">{IRF_DASH_NAME}</h1>
          <p className="truncate text-xs text-white/70">{stats.totalReports} reports · {stats.lgas} LGAs · live updates on</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => reload()} className="text-white hover:bg-white/10"><RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} /></Button>
        <Button variant="ghost" size="icon" onClick={exportCsv} disabled={exporting || !rows.length} className="text-white hover:bg-white/10"><Download className="h-5 w-5" /></Button>
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
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={Users} label="People Reached" value={fmt(stats.peopleReached)} sub="Reach + attendance" color="#0891b2" />
            <Kpi icon={Landmark} label="Stakeholders Engaged" value={fmt(stats.stakeholdersEngaged)} sub="Advocacy contacts" color="#7c3aed" />
            <Kpi icon={Megaphone} label="Awareness Activities" value={fmt(stats.awarenessActivities)} sub="Broadcasts, IEC, dialogues" color="#ea580c" />
            <Kpi icon={ShieldCheck} label="Non-Compliance Resolved" value={`${stats.ncResolutionRate}%`} sub={`${fmt(stats.ncResolved)} of ${fmt(stats.ncTotal)} cases`} color="#dc2626" />
          </div>

          {/* Trend + Section totals */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><TrendingUp className="h-4 w-4 text-primary" /> Monthly Reach & Reports</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="reach" name="People reached" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="reports" name="Reports" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">Activity by Section</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={sectionTotals} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Total" radius={[0, 4, 4, 0]}>
                    {sectionTotals.map((s) => <Cell key={s.id} fill={s.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Gender + NC + Top LGAs */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">Dialogue Attendance</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={genderSplit} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {genderSplit.map((g) => <Cell key={g.name} fill={g.color} />)}
                  </Pie>
                  <Tooltip /><Legend />
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
                  <Tooltip /><Legend />
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

          {/* Top LGAs table */}
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b p-4"><MapPin className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-foreground">Top LGAs by Reach</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">LGA</th>
                    <th className="px-4 py-2 font-medium text-right">Reports</th>
                    <th className="px-4 py-2 font-medium text-right">People Reached</th>
                    <th className="px-4 py-2 font-medium text-right">Stakeholders</th>
                  </tr>
                </thead>
                <tbody>
                  {topLgas.map((l) => (
                    <tr key={l.lga} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2 font-medium text-foreground">{l.lga}</td>
                      <td className="px-4 py-2 text-right">{fmt(l.reports)}</td>
                      <td className="px-4 py-2 text-right">{fmt(l.reach)}</td>
                      <td className="px-4 py-2 text-right">{fmt(l.stakeholders)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
