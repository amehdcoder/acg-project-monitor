import { useEffect, useMemo, useState } from "react";
import { Building2, MapPin, Map as MapIcon, TrendingUp } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import type { EyeReportRow } from "@/lib/eyeReport/definition";
import { FACILITY_TREND_DEFAULTS, buildFacilityTrend, filterFacilityTrend, type TrendGrain } from "@/lib/eyeReport/facilityTrend";

const C = { blue: "hsl(var(--eye-blue))", teal: "hsl(var(--eye-teal))", orange: "hsl(var(--eye-orange))", grid: "hsl(var(--border))", text: "hsl(var(--muted-foreground))", paper: "hsl(var(--card))", ink: "hsl(var(--card-foreground))" };
const formatDate = (date: string, grain: TrendGrain, full = false) => new Date(`${date}${grain === "month" ? "-01" : ""}T00:00:00Z`).toLocaleDateString("en-GB", { ...(grain !== "month" ? { day: "numeric" as const } : {}), month: "short", ...(full || grain === "month" ? { year: "numeric" as const } : {}), timeZone: "UTC" });
const Selector = ({ icon: Icon, label, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { icon: typeof MapPin; label: string }) => (
  <label className="block min-w-0">
    <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</span>
    <select {...props} className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" />
  </label>
);

export default function EyeFacilityTrend({ rows }: { rows: EyeReportRow[] }) {
  const [state, setState] = useState(FACILITY_TREND_DEFAULTS.state);
  const [lga, setLga] = useState(FACILITY_TREND_DEFAULTS.lga);
  const [facility, setFacility] = useState(FACILITY_TREND_DEFAULTS.facility);
  const [grain, setGrain] = useState<TrendGrain>(FACILITY_TREND_DEFAULTS.grain);
  const states = useMemo(() => [...new Set(rows.map(r => r.state).filter(Boolean) as string[])].sort(), [rows]);
  const lgas = useMemo(() => [...new Set(filterFacilityTrend(rows, state, "", "").map(r => r.lga).filter(Boolean) as string[])].sort(), [rows, state]);
  const facilities = useMemo(() => [...new Set(filterFacilityTrend(rows, state, lga, "").map(r => r.facility_name).filter(Boolean))].sort(), [rows, state, lga]);
  useEffect(() => { if (state && !states.includes(state)) setState(""); }, [state, states]);
  useEffect(() => { if (lga && !lgas.includes(lga)) setLga(""); }, [lga, lgas]);
  useEffect(() => { if (facility && !facilities.includes(facility)) setFacility(""); }, [facility, facilities]);
  const selected = useMemo(() => filterFacilityTrend(rows, state, lga, facility), [rows, state, lga, facility]);
  const series = useMemo(() => buildFacilityTrend(selected, grain), [selected, grain]);
  const dates = useMemo(() => [...new Set(selected.map(r => r.report_date))].sort(), [selected]);
  const peak = series.reduce((value, point) => Math.max(value, point.Submissions), 0);
  const lastDate = dates.at(-1);
  const gapLabel = grain === "day" ? "Days without a report" : grain === "week" ? "Weeks without a report" : "Months without a report";
  return <section aria-label="Facility submission trend" className="border-y border-border bg-card py-5 sm:py-6">
    <div className="px-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold"><TrendingUp className="h-5 w-5 text-eye-blue" />Facility submission trend</h3>
          <p className="mt-1 text-sm text-muted-foreground">{state || "All States"} · {lga || "All LGAs"} · {facility || "All health facilities"}</p>
        </div>
        <div role="group" aria-label="Trend interval" className="flex rounded-md border border-border p-0.5">
          {(["day", "week", "month"] as TrendGrain[]).map(g => <Button key={g} size="sm" variant={grain === g ? "secondary" : "ghost"} aria-pressed={grain === g} onClick={() => setGrain(g)} className="h-8 rounded-sm px-3 text-xs">{g === "day" ? "Daily" : g === "week" ? "Weekly" : "Monthly"}</Button>)}
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Selector icon={MapIcon} label="State" value={state} onChange={e => { setState(e.target.value); setLga(""); setFacility(""); }}><option value="">All States</option>{states.map(s => <option key={s}>{s}</option>)}</Selector>
        <Selector icon={MapPin} label="LGA" value={lga} onChange={e => { setLga(e.target.value); setFacility(""); }}><option value="">All LGAs</option>{lgas.map(s => <option key={s}>{s}</option>)}</Selector>
        <Selector icon={Building2} label="Health facility" value={facility} onChange={e => setFacility(e.target.value)}><option value="">All health facilities</option>{facilities.map(s => <option key={s}>{s}</option>)}</Selector>
      </div>
      <dl className="my-6 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-border py-4 sm:grid-cols-4">
        {[
          { label: "Facility submissions", value: selected.length.toLocaleString() },
          { label: `Peak ${grain === "day" ? "daily" : grain === "week" ? "weekly" : "monthly"} submissions`, value: peak.toLocaleString() },
          { label: gapLabel, value: series.filter(s => !s.Submissions).length.toLocaleString() },
          { label: "Latest report", value: lastDate ? formatDate(lastDate, "day", true) : "—" },
        ].map(k => <div key={k.label}><dt className="text-xs text-muted-foreground">{k.label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-foreground">{k.value}</dd></div>)}
      </dl>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>Facility submissions · left axis</span><span>Consultations / surgeries · right axis</span></div>
      <div className="h-72 w-full sm:h-80" aria-label="Facility submissions, consultations and surgeries over time">
        {series.length ? <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 10, right: 0, left: 0, bottom: 8 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="date" tickFormatter={date => formatDate(date, grain)} tick={{ fontSize: 11, fill: C.text }} axisLine={{ stroke: C.grid }} tickLine={false} minTickGap={36} tickMargin={12} />
            <YAxis yAxisId="submissions" width={38} tick={{ fontSize: 11, fill: C.text }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis yAxisId="patients" orientation="right" width={42} tick={{ fontSize: 11, fill: C.text }} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={n => Intl.NumberFormat("en", { notation: "compact" }).format(n)} />
            <Tooltip labelFormatter={date => formatDate(String(date), grain, true)} contentStyle={{ background: C.paper, borderColor: C.grid, color: C.ink, borderRadius: 4, fontSize: 12 }} formatter={(value: number) => value.toLocaleString()} />
            <Line yAxisId="submissions" dataKey="Submissions" name="Facility submissions" type="linear" stroke={C.blue} strokeWidth={3} dot={series.length <= 45 ? { r: 2.5 } : false} activeDot={{ r: 5 }} isAnimationActive={false} />
            <Line yAxisId="patients" dataKey="Consulted" name="Consultations" type="linear" stroke={C.teal} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line yAxisId="patients" dataKey="Surgeries" type="linear" stroke={C.orange} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer> : <div className="flex h-full items-center justify-center border border-dashed border-border text-sm text-muted-foreground">No submissions in this selection.</div>}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-3 text-xs">
        <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-eye-blue" />Facility submissions</span>
        <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-eye-teal" />Consultations</span>
        <span className="flex items-center gap-2"><span className="w-5 border-t-2 border-dashed border-eye-orange" />Surgeries</span>
        <span className="text-muted-foreground">{dates.length ? `${formatDate(dates[0], "day", true)} – ${formatDate(lastDate || dates[0], "day", true)}` : "No reporting dates"}</span>
      </div>
    </div>
  </section>;
}
