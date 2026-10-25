import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, Download, Eye, Glasses, Scissors, Stethoscope, Accessibility, ScanEye, Plus, RefreshCw, FileSpreadsheet,
  CalendarRange, Building2, Pencil, Trash2, CloudOff, Loader2, Target, Activity,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import hero from "@/assets/eye-report/hero.jpg";
import {
  AGE_BANDS, MONTHS, aggregate, byMonth, normCsom, normSummary, pct, t, totals, vaTotal, type EyeReportRow,
} from "@/lib/eyeReport/definition";
import { deleteReport, loadReports } from "@/lib/eyeReport/store";
import { exportAggregated, exportDailyReport } from "@/lib/eyeReport/exportExcel";
import EyeDailyReportForm, { type EyeFacility } from "./EyeDailyReportForm";

interface Props { projectId: string; projectName?: string; facilities: EyeFacility[]; userId: string; canReport: boolean; canManage: boolean; onClose: () => void }

const C = { blue: "hsl(var(--eye-blue))", teal: "hsl(var(--eye-teal))", violet: "hsl(var(--eye-violet))", orange: "hsl(var(--eye-orange))", gold: "hsl(var(--eye-gold))", rose: "hsl(var(--eye-rose))", good: "hsl(var(--status-success))", deep: "hsl(var(--eye-deep))" };
const Sel = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className="h-10 w-full rounded-md border bg-background px-2 text-sm" />;

export default function EyeReportDashboard({ projectId, projectName, facilities, userId, canReport, canManage, onClose }: Props) {
  const [rows, setRows] = useState<EyeReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const [month, setMonth] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [lga, setLga] = useState("all");
  const [facility, setFacility] = useState("all");
  const [sex, setSex] = useState<"all" | "m" | "f">("all");
  const [csomOnly, setCsomOnly] = useState(false);
  const [form, setForm] = useState<{ open: boolean; existing?: EyeReportRow | null }>({ open: false });
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await loadReports(projectId);
    setRows(r.rows); setFromCache(r.fromCache); setLoading(false);
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  const years = useMemo(() => Array.from(new Set([String(thisYear), ...rows.map((r) => r.report_date.slice(0, 4))])).sort().reverse(), [rows, thisYear]);
  const lgas = useMemo(() => Array.from(new Set(rows.map((r) => r.lga).filter(Boolean) as string[])).sort(), [rows]);
  const facs = useMemo(() => Array.from(new Set(rows.filter((r) => lga === "all" || r.lga === lga).map((r) => r.facility_name))).sort(), [rows, lga]);

  const yearRows = useMemo(() => rows.filter((r) => (year === "all" || r.report_date.startsWith(year)) && (lga === "all" || r.lga === lga) && (facility === "all" || r.facility_name === facility) && (!csomOnly || r.csom)), [rows, year, lga, facility, csomOnly]);
  const filtered = useMemo(() => yearRows.filter((r) => (month === "all" || Number(r.report_date.slice(5, 7)) === Number(month)) && (!from || r.report_date >= from) && (!to || r.report_date <= to)), [yearRows, month, from, to]);

  const agg = aggregate(filtered); const S = agg.summary; const T = totals(S); const c = agg.csom;
  const pick = (x: { m: number; f: number }) => (sex === "all" ? t(x) : x[sex]);
  const monthly = byMonth(yearRows).map((a, i) => { const tt = totals(a.summary); return { month: MONTHS[i].slice(0, 3), Consulted: pick(tt.consulted), Surgeries: pick(tt.surgeries), Glasses: pick(tt.glasses), Lenses: pick(tt.lenses) }; });
  const ageSex = AGE_BANDS.map((b) => ({ band: b.label, Male: S.consult[b.key].m, Female: S.consult[b.key].f }));
  const outcomes = [{ name: "Good", value: c.discharge.presenting.good, fill: C.good }, { name: "Borderline", value: c.discharge.presenting.borderline, fill: C.gold }, { name: "Poor", value: c.discharge.presenting.poor, fill: C.rose }];
  const fuGood = pct(c.followup.presenting.good, vaTotal(c.followup.presenting));
  const facilityTable = useMemo(() => {
    const m = new Map<string, EyeReportRow[]>();
    for (const r of filtered) m.set(r.facility_name, [...(m.get(r.facility_name) ?? []), r]);
    return [...m.entries()].map(([name, list]) => { const a = aggregate(list); const tt = totals(a.summary); return { name, lga: list[0].lga, days: a.days, consulted: pick(tt.consulted), surgeries: pick(tt.surgeries), glasses: pick(tt.glasses), good: pct(a.csom.discharge.presenting.good, vaTotal(a.csom.discharge.presenting)) }; }).sort((a, b) => b.consulted - a.consulted);
  }, [filtered, sex]); // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = [
    { label: "Persons consulted", value: pick(T.consulted), sub: `${T.consulted.m} M · ${T.consulted.f} F`, icon: Stethoscope, cls: "from-eye-blue to-eye-deep" },
    { label: "Persons with disability", value: pick(S.pwd), sub: `${pct(t(S.pwd), t(T.consulted))}% of consulted`, icon: Accessibility, cls: "from-eye-violet to-eye-blue" },
    { label: "Cataract operated", value: pick(S.surgery.cataract), sub: `Glaucoma ${pick(S.surgery.glaucoma)} · Minor ${pick(S.surgery.minor)}`, icon: Scissors, cls: "from-eye-teal to-eye-deep" },
    { label: "Lenses prescribed", value: pick(T.lenses), sub: `DV ${t(S.lenses.dv)} · NV ${t(S.lenses.nv)} · BF ${t(S.lenses.bf)}`, icon: Eye, cls: "from-eye-violet to-eye-deep" },
    { label: "Glasses dispensed", value: pick(T.glasses), sub: `${pct(t(T.glasses), t(T.lenses))}% of lenses`, icon: Glasses, cls: "from-eye-orange to-eye-rose" },
    { label: "Surgeries after biometry", value: `${pct(c.biometry, c.surgeries)}%`, sub: `IOL ${pct(c.iol, c.surgeries)}% of ${c.surgeries}`, icon: Target, cls: "from-eye-teal to-eye-blue" },
    { label: "Good outcome at discharge", value: `${pct(c.discharge.presenting.good, vaTotal(c.discharge.presenting))}%`, sub: `Follow-up good ${fuGood}%`, icon: ScanEye, cls: "from-status-success to-eye-teal" },
    { label: "Reporting days", value: agg.days, sub: `${agg.reports} reports · ${agg.facilities} facilities`, icon: Activity, cls: "from-eye-gold to-eye-orange" },
  ];

  const periodLabel = [month !== "all" ? MONTHS[Number(month) - 1] : "", year === "all" ? "All years" : year, from || to ? `${from || "…"} to ${to || "…"}` : ""].filter(Boolean).join(" ");
  const doExport = async () => {
    if (filtered.length === 0) { toast.info("No reports match the current filters."); return; }
    setExporting(true);
    try { await exportAggregated(filtered, { projectName, facilityLabel: facility !== "all" ? facility : lga !== "all" ? `All facilities — ${lga} LGA` : "All facilities", periodLabel, filters: csomOnly ? "CSOM reports only" : undefined }); }
    catch { toast.error("Export failed"); } finally { setExporting(false); }
  };
  const remove = async (r: EyeReportRow) => {
    if (!confirm(`Delete the ${r.facility_name} report for ${r.report_date}?`)) return;
    try { await deleteReport(projectId, r.id); setRows((x) => x.filter((y) => y.id !== r.id)); toast.success("Report deleted"); } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  };

  if (form.open) return <EyeDailyReportForm projectId={projectId} projectName={projectName} facilities={facilities} mode={{ kind: "user", userId }} existing={form.existing} otherReports={rows} onClose={() => setForm({ open: false })} onSaved={() => void load()} />;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-eye-sky/50">
      <header className="relative overflow-hidden bg-eye-deep text-primary-foreground">
        <img src={hero} alt="" width={1600} height={640} className="absolute inset-0 h-full w-full object-cover object-right opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-r from-eye-deep via-eye-deep/90 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 py-6">
          <Button variant="ghost" size="sm" onClick={onClose} className="-ml-2 mb-2 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-eye-gold">Primary Eye Care · {projectName}</p>
          <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Eye Health Outputs & Outcomes</h1>
          <p className="mt-1 max-w-xl text-sm opacity-85">Daily facility reports, aggregated by month and year, with cataract surgery outcome monitoring.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {canReport && <Button onClick={() => setForm({ open: true })} className="bg-eye-gold text-eye-ink hover:bg-eye-gold/90"><Plus className="mr-1 h-4 w-4" /> New daily report</Button>}
            <Button onClick={doExport} disabled={exporting} variant="secondary">{exporting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />} Export Summary & CSOM</Button>
            <Button onClick={() => void load()} variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"><RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
            {fromCache && <span className="inline-flex items-center gap-1 rounded-full bg-eye-gold px-3 py-1 text-xs font-semibold text-eye-ink"><CloudOff className="h-3 w-3" /> Showing saved offline copy</span>}
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4 lg:grid-cols-8">
          <Sel aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)}><option value="all">All years</option>{years.map((y) => <option key={y}>{y}</option>)}</Sel>
          <Sel aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}><option value="all">All months</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Sel>
          <Input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10" />
          <Input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10" />
          <Sel aria-label="LGA" value={lga} onChange={(e) => { setLga(e.target.value); setFacility("all"); }}><option value="all">All LGAs</option>{lgas.map((l) => <option key={l}>{l}</option>)}</Sel>
          <Sel aria-label="Facility" value={facility} onChange={(e) => setFacility(e.target.value)}><option value="all">All facilities</option>{facs.map((l) => <option key={l}>{l}</option>)}</Sel>
          <Sel aria-label="Sex" value={sex} onChange={(e) => setSex(e.target.value as any)}><option value="all">Both sexes</option><option value="m">Male</option><option value="f">Female</option></Sel>
          <label className="flex h-10 items-center gap-2 rounded-md border px-2 text-sm"><input type="checkbox" checked={csomOnly} onChange={(e) => setCsomOnly(e.target.checked)} /> CSOM only</label>
        </div>
      </div>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k, i) => (
            <motion.div key={k.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className={`rounded-2xl bg-gradient-to-br ${k.cls} p-4 text-primary-foreground shadow-md`}>
              <k.icon className="h-5 w-5 opacity-90" />
              <p className="mt-2 text-2xl font-extrabold tabular-nums sm:text-3xl">{k.value}</p>
              <p className="text-xs font-semibold">{k.label}</p>
              <p className="mt-0.5 truncate text-[11px] opacity-80">{k.sub}</p>
            </motion.div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border bg-card p-4 shadow-sm lg:col-span-2">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><CalendarRange className="h-4 w-4 text-eye-blue" /> Monthly trend {year !== "all" ? year : ""}</h3>
            <div className="h-64"><ResponsiveContainer><LineChart data={monthly}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Legend />
              <Line dataKey="Consulted" stroke={C.blue} strokeWidth={3} dot={{ r: 3 }} /><Line dataKey="Surgeries" stroke={C.teal} strokeWidth={2.5} /><Line dataKey="Lenses" stroke={C.violet} strokeWidth={2} /><Line dataKey="Glasses" stroke={C.orange} strokeWidth={2} />
            </LineChart></ResponsiveContainer></div>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><ScanEye className="h-4 w-4 text-eye-teal" /> Visual outcome at discharge</h3>
            <div className="h-52"><ResponsiveContainer><PieChart><Pie data={outcomes} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={3}>{outcomes.map((o) => <Cell key={o.name} fill={o.fill} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div>
            <p className="text-center text-xs text-muted-foreground">WHO target: ≥ 80% good, &lt; 5% poor</p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Stethoscope className="h-4 w-4 text-eye-blue" /> Consultations by age & sex</h3>
            <div className="h-56"><ResponsiveContainer><BarChart data={ageSex}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="band" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="Male" fill={C.blue} radius={[6, 6, 0, 0]} /><Bar dataKey="Female" fill={C.orange} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><Target className="h-4 w-4 text-eye-teal" /> CSOM quality indicators</h3>
            {[["Surgeries after biometry", pct(c.biometry, c.surgeries), C.teal], ["Surgeries with IOL", pct(c.iol, c.surgeries), C.blue], ["Good outcome — discharge (presenting)", pct(c.discharge.presenting.good, vaTotal(c.discharge.presenting)), C.good], ["Good outcome — discharge (pinhole)", pct(c.discharge.pinhole.good, vaTotal(c.discharge.pinhole)), C.good], ["Good outcome — follow-up (presenting)", fuGood, C.violet], ["Good outcome — follow-up (BCVA)", pct(c.followup.bcva.good, vaTotal(c.followup.bcva)), C.violet], ["Poor outcome — follow-up", pct(c.followup.presenting.poor, vaTotal(c.followup.presenting)), C.rose]].map(([label, v, col]) => (
              <div key={label as string} className="mb-2.5">
                <div className="flex justify-between text-xs"><span className="font-medium">{label}</span><span className="font-bold">{v}%</span></div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted"><motion.div className="h-full rounded-full" style={{ background: col as string }} initial={{ width: 0 }} animate={{ width: `${Math.min(100, v as number)}%` }} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-card shadow-sm">
          <h3 className="flex items-center gap-2 border-b p-4 text-sm font-bold"><Building2 className="h-4 w-4 text-eye-blue" /> Facility performance</h3>
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead className="bg-eye-sky text-left text-xs uppercase tracking-wider text-eye-deep"><tr><th className="p-3">Facility</th><th className="p-3">LGA</th><th className="p-3 text-right">Days</th><th className="p-3 text-right">Consulted</th><th className="p-3 text-right">Surgeries</th><th className="p-3 text-right">Glasses</th><th className="p-3 text-right">Good discharge</th></tr></thead>
            <tbody>{facilityTable.map((r) => (<tr key={r.name} className="border-t"><td className="p-3 font-semibold">{r.name}</td><td className="p-3">{r.lga ?? "—"}</td><td className="p-3 text-right">{r.days}</td><td className="p-3 text-right font-bold">{r.consulted}</td><td className="p-3 text-right">{r.surgeries}</td><td className="p-3 text-right">{r.glasses}</td><td className="p-3 text-right">{r.good}%</td></tr>))}
              {facilityTable.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No reports for these filters yet.</td></tr>}</tbody>
          </table></div>
        </section>

        <section className="rounded-2xl border bg-card shadow-sm">
          <h3 className="flex items-center gap-2 border-b p-4 text-sm font-bold"><FileSpreadsheet className="h-4 w-4 text-eye-orange" /> Individual daily reports ({filtered.length})</h3>
          <div className="max-h-[480px] overflow-auto"><table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 bg-eye-deep text-left text-xs uppercase tracking-wider text-primary-foreground"><tr><th className="p-3">Date</th><th className="p-3">Facility</th><th className="p-3 text-right">Consulted</th><th className="p-3 text-right">Cataract</th><th className="p-3 text-right">Glasses</th><th className="p-3">CSOM</th><th className="p-3">Prepared by</th><th className="p-3 text-right">Actions</th></tr></thead>
            <tbody>{filtered.map((r, i) => { const s = normSummary(r.summary), tt = totals(s), cs = normCsom(r.csom); const mine = r.created_by === userId; return (
              <tr key={r.id} className={`border-t ${i % 2 ? "bg-eye-sky/30" : ""}`}>
                <td className="p-3 font-mono text-xs">{r.report_date}</td><td className="p-3 font-semibold">{r.facility_name}</td><td className="p-3 text-right font-bold">{t(tt.consulted)}</td><td className="p-3 text-right">{t(s.surgery.cataract)}</td><td className="p-3 text-right">{t(tt.glasses)}</td>
                <td className="p-3">{cs ? <span className="rounded-full bg-eye-mint px-2 py-0.5 text-xs font-semibold text-eye-teal">{cs.surgeries} surg.</span> : "—"}</td>
                <td className="p-3 text-xs">{r.prepared_by ?? r.collector_label ?? "—"}</td>
                <td className="p-3"><div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" aria-label="Download report" onClick={() => void exportDailyReport(r, projectName)}><Download className="h-4 w-4 text-eye-blue" /></Button>
                  {(canManage || (mine && canReport)) && <Button size="icon" variant="ghost" aria-label="Edit report" onClick={() => setForm({ open: true, existing: r })}><Pencil className="h-4 w-4" /></Button>}
                  {canManage && <Button size="icon" variant="ghost" aria-label="Delete report" onClick={() => void remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div></td>
              </tr>); })}</tbody>
          </table></div>
        </section>
      </main>
    </div>
  );
}
