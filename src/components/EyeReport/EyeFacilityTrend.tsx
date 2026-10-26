import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, MapPin, Map as MapIcon, TrendingUp, CalendarDays, Sparkles } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { aggregate, totals, t, type EyeReportRow } from "@/lib/eyeReport/definition";

const C = { blue: "hsl(var(--eye-blue))", teal: "hsl(var(--eye-teal))", violet: "hsl(var(--eye-violet))", orange: "hsl(var(--eye-orange))", gold: "hsl(var(--eye-gold))" };
type Grain = "day" | "week" | "month";

const weekStart = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); const w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return d.toISOString().slice(0, 10); };
const bucketOf = (iso: string, g: Grain) => (g === "day" ? iso : g === "week" ? weekStart(iso) : iso.slice(0, 7));
const nextBucket = (b: string, g: Grain) => {
  if (g === "month") { const [y, m] = b.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; }
  const d = new Date(`${b}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + (g === "day" ? 1 : 7)); return d.toISOString().slice(0, 10);
};
const fmt = (b: string, g: Grain) => {
  const d = new Date(g === "month" ? `${b}-01T00:00:00Z` : `${b}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", g === "month" ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });
};
const Sel = ({ icon: Icon, label, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { icon: typeof MapPin; label: string }) => (
  <label className="block">
    <span className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</span>
    <select {...p} className="h-10 w-full rounded-xl border-2 border-eye-blue/20 bg-background px-2 text-sm font-medium focus:border-eye-blue focus:outline-none disabled:opacity-50" />
  </label>
);

/** Submission trend for one State → LGA → facility at a time, animated as the selection changes. */
export default function EyeFacilityTrend({ rows }: { rows: EyeReportRow[] }) {
  const states = useMemo(() => [...new Set(rows.map((r) => r.state).filter(Boolean) as string[])].sort(), [rows]);
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [fac, setFac] = useState("");
  const [grain, setGrain] = useState<Grain>("week");
  const lgas = useMemo(() => [...new Set(rows.filter((r) => r.state === state).map((r) => r.lga).filter(Boolean) as string[])].sort(), [rows, state]);
  const facs = useMemo(() => [...new Set(rows.filter((r) => r.state === state && r.lga === lga).map((r) => r.facility_name))].sort(), [rows, state, lga]);

  // Pre-select the first available State → LGA → facility so the chart is never blank.
  useEffect(() => { if (!state && states[0]) setState(states[0]); }, [states, state]);
  useEffect(() => { if (state && !lgas.includes(lga)) setLga(lgas[0] ?? ""); }, [lgas, lga, state]);
  useEffect(() => { if (lga && !facs.includes(fac)) setFac(facs[0] ?? ""); }, [facs, fac, lga]);

  const facRows = useMemo(() => rows.filter((r) => r.state === state && r.lga === lga && r.facility_name === fac).sort((a, b) => a.report_date.localeCompare(b.report_date)), [rows, state, lga, fac]);
  const series = useMemo(() => {
    if (!facRows.length) return [];
    const by = new Map<string, EyeReportRow[]>();
    for (const r of facRows) { const k = bucketOf(r.report_date, grain); by.set(k, [...(by.get(k) ?? []), r]); }
    const out: { label: string; Submissions: number; Consulted: number; Surgeries: number }[] = [];
    let b = bucketOf(facRows[0].report_date, grain); const last = bucketOf(facRows[facRows.length - 1].report_date, grain);
    for (let i = 0; i < 400 && b <= last; i++, b = nextBucket(b, grain)) {
      const list = by.get(b) ?? []; const tt = totals(aggregate(list).summary);
      out.push({ label: fmt(b, grain), Submissions: new Set(list.map((r) => r.report_date)).size, Consulted: t(tt.consulted), Surgeries: t(tt.surgeries) });
    }
    return out;
  }, [facRows, grain]);
  const days = new Set(facRows.map((r) => r.report_date)).size;
  const peak = series.reduce((m, s) => Math.max(m, s.Submissions), 0);
  const gaps = series.filter((s) => s.Submissions === 0).length;
  const lastDate = facRows[facRows.length - 1]?.report_date;

  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-eye-blue via-eye-teal to-eye-orange" />
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-extrabold"><TrendingUp className="h-5 w-5 text-eye-teal" /> Facility submission trend</h3>
            <p className="text-xs text-muted-foreground">Pick a State, then an LGA, then a health facility to watch its reporting over time.</p>
          </div>
          <div className="inline-flex rounded-full bg-muted p-1 text-xs font-semibold">
            {(["day", "week", "month"] as Grain[]).map((g) => (
              <button key={g} onClick={() => setGrain(g)} className={`rounded-full px-3 py-1.5 capitalize transition-colors ${grain === g ? "bg-eye-blue text-primary-foreground shadow" : "text-muted-foreground"}`}>{g === "day" ? "Daily" : g === "week" ? "Weekly" : "Monthly"}</button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Sel icon={MapIcon} label="1 · State" value={state} onChange={(e) => setState(e.target.value)} disabled={!states.length}>{states.length ? states.map((s) => <option key={s}>{s}</option>) : <option value="">No reports yet</option>}</Sel>
          <Sel icon={MapPin} label="2 · LGA" value={lga} onChange={(e) => setLga(e.target.value)} disabled={!lgas.length}>{lgas.map((s) => <option key={s}>{s}</option>)}</Sel>
          <Sel icon={Building2} label="3 · Health facility" value={fac} onChange={(e) => setFac(e.target.value)} disabled={!facs.length}>{facs.map((s) => <option key={s}>{s}</option>)}</Sel>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={`${fac}|${grain}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }}>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { l: "Days reported", v: days, cls: "from-eye-blue to-eye-deep", I: CalendarDays },
                { l: `Busiest ${grain}`, v: peak, cls: "from-eye-teal to-eye-blue", I: Sparkles },
                { l: `${grain === "day" ? "Days" : grain === "week" ? "Weeks" : "Months"} with no report`, v: gaps, cls: gaps ? "from-eye-orange to-eye-rose" : "from-status-success to-eye-teal", I: TrendingUp },
                { l: "Last report", v: lastDate ? new Date(`${lastDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "—", cls: "from-eye-violet to-eye-blue", I: Building2 },
              ].map((k, i) => (
                <motion.div key={k.l} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.08 * i }} className={`rounded-xl bg-gradient-to-br ${k.cls} p-3 text-primary-foreground`}>
                  <k.I className="h-4 w-4 opacity-80" />
                  <p className="mt-1 text-xl font-extrabold tabular-nums">{k.v}</p>
                  <p className="text-[11px] font-semibold opacity-90">{k.l}</p>
                </motion.div>
              ))}
            </div>
            <div className="mt-4 h-72">
              {series.length ? (
                <ResponsiveContainer>
                  <ComposedChart data={series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="eyeSubFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.teal} stopOpacity={0.55} /><stop offset="100%" stopColor={C.teal} stopOpacity={0.03} /></linearGradient>
                      <linearGradient id="eyeSubStroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={C.blue} /><stop offset="100%" stopColor={C.teal} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="label" fontSize={11} minTickGap={16} />
                    <YAxis yAxisId="s" fontSize={11} allowDecimals={false} />
                    <YAxis yAxisId="p" orientation="right" fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12 }} />
                    <Legend />
                    <Area yAxisId="s" type="monotone" dataKey="Submissions" name="Days submitted" stroke="url(#eyeSubStroke)" strokeWidth={3.5} fill="url(#eyeSubFill)" dot={{ r: 3.5, fill: C.blue }} activeDot={{ r: 6 }} animationDuration={1400} animationEasing="ease-out" />
                    <Line yAxisId="p" type="monotone" dataKey="Consulted" stroke={C.orange} strokeWidth={2} dot={false} animationDuration={1800} animationBegin={300} />
                    <Line yAxisId="p" type="monotone" dataKey="Surgeries" stroke={C.violet} strokeWidth={2} strokeDasharray="5 4" dot={false} animationDuration={1800} animationBegin={500} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border-2 border-dashed text-sm text-muted-foreground">No submissions for this facility yet.</div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
