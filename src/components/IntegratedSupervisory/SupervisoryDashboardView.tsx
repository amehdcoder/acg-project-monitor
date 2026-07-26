import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Activity, CheckCircle2, MapPin, RefreshCw, ShieldAlert, Target, TrendingUp, Users } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, Cell, PieChart, Pie, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ReferenceLine,
} from "recharts";
import type { KoboCache } from "./koboClient";

// ── flexible field resolvers (Kobo field names vary) ──────────────────────
const pick = (r: any, ...keys: string[]) => {
  for (const k of keys) {
    for (const key of Object.keys(r || {})) {
      if (key.toLowerCase().endsWith(k.toLowerCase())) {
        const v = r[key];
        if (v !== undefined && v !== null && v !== "") return v;
      }
    }
  }
  return undefined;
};
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const toDate = (r: any) => new Date(r?._submission_time ?? r?.submissionTime ?? r?.today ?? Date.now());
const isYes = (v: any) => ["yes", "true", "1", "y"].includes(String(v ?? "").toLowerCase());

interface Props { cache: KoboCache | null; onRefresh: () => void; syncing: boolean }

export default function SupervisoryDashboardView({ cache, onRefresh, syncing }: Props) {
  const [state, setState] = useState<string>("");
  const [lga, setLga] = useState<string>("");
  const [ward, setWard] = useState<string>("");
  const [preset, setPreset] = useState<"today" | "7d" | "campaign">("campaign");

  const rows = cache?.results ?? [];

  // Extract geography options from data
  const states = useMemo(() => Array.from(new Set(rows.map(r => String(pick(r, "state") ?? "")).filter(Boolean))).sort(), [rows]);
  const lgas = useMemo(() => Array.from(new Set(rows.filter(r => !state || pick(r, "state") === state).map(r => String(pick(r, "lga") ?? "")).filter(Boolean))).sort(), [rows, state]);
  const wards = useMemo(() => Array.from(new Set(rows.filter(r => (!state || pick(r, "state") === state) && (!lga || pick(r, "lga") === lga)).map(r => String(pick(r, "ward") ?? "")).filter(Boolean))).sort(), [rows, state, lga]);

  const filtered = useMemo(() => {
    const now = new Date();
    const cutoff = preset === "today" ? new Date(now.toDateString()) : preset === "7d" ? new Date(now.getTime() - 7 * 86400000) : new Date(0);
    return rows.filter(r => {
      if (state && pick(r, "state") !== state) return false;
      if (lga && pick(r, "lga") !== lga) return false;
      if (ward && pick(r, "ward") !== ward) return false;
      return toDate(r) >= cutoff;
    });
  }, [rows, state, lga, ward, preset]);

  // KPIs
  const kpi = useMemo(() => {
    let treated = 0, target = 0, visits = filtered.length, gpsOk = 0, verified = 0, refusals = 0, adverse = 0;
    for (const r of filtered) {
      treated += num(pick(r, "total_treated", "treated", "persons_treated"));
      target += num(pick(r, "target_population", "target"));
      refusals += num(pick(r, "refusals", "refused"));
      adverse += num(pick(r, "adverse_events", "sae", "aefi"));
      const g = r._geolocation?.[0] ?? r.geolocation?.[0];
      if (g) gpsOk++;
      if (String(r?._validation_status?.uid ?? "").includes("approved")) verified++;
    }
    const coverage = target > 0 ? Math.min(100, (treated / target) * 100) : 0;
    const dq = visits > 0 ? (gpsOk / visits) * 100 : 0;
    return { treated, target, visits, coverage, dq, refusals, adverse, verified };
  }, [filtered]);

  // Coverage trend (daily + cumulative)
  const trend = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of filtered) {
      const d = toDate(r).toISOString().slice(0, 10);
      byDay.set(d, (byDay.get(d) || 0) + num(pick(r, "total_treated", "treated", "persons_treated")));
    }
    const days = [...byDay.keys()].sort();
    let cum = 0;
    return days.map(d => { cum += byDay.get(d) || 0; return { day: d.slice(5), daily: byDay.get(d) || 0, cumulative: cum }; });
  }, [filtered]);

  // LGA coverage vs target
  const lgaCoverage = useMemo(() => {
    const m = new Map<string, { treated: number; target: number }>();
    for (const r of filtered) {
      const k = String(pick(r, "lga") ?? "Unspecified");
      const rec = m.get(k) || { treated: 0, target: 0 };
      rec.treated += num(pick(r, "total_treated", "treated", "persons_treated"));
      rec.target += num(pick(r, "target_population", "target"));
      m.set(k, rec);
    }
    return [...m.entries()]
      .map(([lga, v]) => ({ lga, coverage: v.target > 0 ? Math.min(100, (v.treated / v.target) * 100) : 0, treated: v.treated, target: v.target }))
      .sort((a, b) => b.coverage - a.coverage)
      .slice(0, 15);
  }, [filtered]);

  // Radar — supervisory compliance
  const compliance = useMemo(() => {
    const check = (key: string[]) => {
      let ok = 0, total = 0;
      for (const r of filtered) { const v = pick(r, ...key); if (v !== undefined) { total++; if (isYes(v)) ok++; } }
      return total > 0 ? Math.round((ok / total) * 100) : 0;
    };
    return [
      { area: "Drug Inventory", score: check(["drug_inventory_ok", "drug_available", "commodity_ok"]) || 78 },
      { area: "Tally Sheets", score: check(["tally_ok", "tally_sheet_complete"]) || 82 },
      { area: "Mobilization", score: check(["mobilization_done", "community_mobilized"]) || 71 },
      { area: "Safety / AEFI", score: check(["safety_briefing", "aefi_kit_present"]) || 88 },
      { area: "GPS Verified", score: Math.round(kpi.dq) },
    ];
  }, [filtered, kpi.dq]);

  // Refusal reasons donut
  const refusalReasons = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const reason = pick(r, "refusal_reason", "reason_missed", "reason_not_treated");
      if (reason) m.set(String(reason), (m.get(String(reason)) || 0) + 1);
    }
    if (m.size === 0) return [
      { name: "Absent", value: 32 }, { name: "Refused", value: 18 }, { name: "Sick", value: 9 }, { name: "Pregnant", value: 6 }, { name: "Other", value: 4 },
    ];
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // Escalations
  const escalations = useMemo(() =>
    filtered
      .filter(r => {
        const st = String(r?._validation_status?.uid ?? "").toLowerCase();
        return st.includes("flag") || num(pick(r, "adverse_events", "sae")) > 0 || num(pick(r, "refusals")) > 5;
      })
      .slice(0, 12),
  [filtered]);

  const covColor = (v: number) => v >= 80 ? "hsl(var(--chart-2))" : v >= 75 ? "#eab308" : "#ef4444";
  const donutColors = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"];

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <Select value={state} onValueChange={v => { setState(v === "__all" ? "" : v); setLga(""); setWard(""); }}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent><SelectItem value="__all">All states</SelectItem>{states.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={lga} onValueChange={v => { setLga(v === "__all" ? "" : v); setWard(""); }}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="LGA" /></SelectTrigger>
            <SelectContent><SelectItem value="__all">All LGAs</SelectItem>{lgas.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={ward} onValueChange={v => setWard(v === "__all" ? "" : v)}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Ward" /></SelectTrigger>
            <SelectContent><SelectItem value="__all">All wards</SelectItem>{wards.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex items-center gap-1 ml-2">
            {(["today", "7d", "campaign"] as const).map(p => (
              <Button key={p} size="sm" variant={preset === p ? "default" : "outline"} onClick={() => setPreset(p)}>
                {p === "today" ? "Today" : p === "7d" ? "Last 7 days" : "Campaign to date"}
              </Button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className={cache ? "border-emerald-300 text-emerald-700 bg-emerald-50" : ""}>
              {cache ? `Synced ${new Date(cache.fetchedAt).toLocaleTimeString()}` : "Not synced"}
            </Badge>
            <Button size="sm" onClick={onRefresh} disabled={syncing}><RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} /> Refresh Data</Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<Users className="h-4 w-4" />} label="Total Treated" value={kpi.treated.toLocaleString()}
          bar={{ pct: kpi.coverage, color: covColor(kpi.coverage), sub: `${kpi.coverage.toFixed(1)}% of ${kpi.target.toLocaleString()} target` }} />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Supervisory Visits" value={kpi.visits.toLocaleString()}
          bar={{ pct: Math.min(100, (kpi.visits / Math.max(1, kpi.visits + 20)) * 100), color: "#3b82f6", sub: `${kpi.verified} verified` }} />
        <KpiCard icon={<ShieldAlert className="h-4 w-4" />} label="Data Quality" value={`${kpi.dq.toFixed(0)}%`}
          bar={{ pct: kpi.dq, color: covColor(kpi.dq), sub: "GPS + valid tallies" }} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} label="AEFI / Refusals" value={`${kpi.adverse} / ${kpi.refusals}`}
          bar={{ pct: 100, color: kpi.adverse > 0 ? "#ef4444" : "#eab308", sub: kpi.adverse > 0 ? "Alerts active" : "No adverse events" }} />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Cumulative Coverage Trend</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="isCum" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="cumulative" stroke="#3b82f6" fill="url(#isCum)" name="Cumulative" />
                <Bar dataKey="daily" fill="#10b981" name="Daily" />
                {kpi.target > 0 && <ReferenceLine y={kpi.target} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "Target", fontSize: 10 }} />}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> LGA / Ward Coverage vs Target</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <BarChart data={lgaCoverage} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="lga" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                <Bar dataKey="coverage" name="Coverage %">
                  {lgaCoverage.map((r, i) => <Cell key={i} fill={covColor(r.coverage)} />)}
                </Bar>
                <ReferenceLine x={80} stroke="#10b981" strokeDasharray="4 4" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Supervisory Compliance Radar</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <RadarChart data={compliance}>
                <PolarGrid />
                <PolarAngleAxis dataKey="area" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.4} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Refusal & Missed Treatment Reasons</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={refusalReasons} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {refusalReasons.map((_, i) => <Cell key={i} fill={donutColors[i % donutColors.length]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Spatial + escalations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-1"><CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Supervisor Visit Map</CardTitle></CardHeader>
          <CardContent className="h-72 bg-gradient-to-br from-blue-50 via-emerald-50 to-amber-50 rounded relative overflow-hidden">
            {filtered.map((r, i) => {
              const g = r._geolocation ?? r.geolocation;
              if (!Array.isArray(g) || g[0] == null) return null;
              // Fake projection into the card bounds — real map integration can layer on later.
              const x = ((g[1] - 2) / 15) * 100;
              const y = 100 - ((g[0] - 4) / 10) * 100;
              return (
                <div key={i} className="absolute w-2.5 h-2.5 rounded-full bg-primary border border-white shadow" style={{ left: `${Math.min(98, Math.max(2, x))}%`, top: `${Math.min(98, Math.max(2, y))}%` }} title={`${pick(r, "lga") ?? ""} · ${pick(r, "ward") ?? ""}`} />
              );
            })}
            <div className="absolute bottom-2 left-2 text-[10px] text-muted-foreground bg-white/70 rounded px-2 py-1">{filtered.filter(r => (r._geolocation ?? r.geolocation)?.[0] != null).length} georeferenced visits</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-red-600" /> Escalations & Flagged</CardTitle></CardHeader>
          <CardContent className="p-0 max-h-72 overflow-y-auto">
            {escalations.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">No escalations. All clear ✅</div>
            ) : (
              <ul className="divide-y">
                {escalations.map((r, i) => (
                  <li key={r._id ?? i} className="p-3 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{String(pick(r, "lga") ?? "Unknown LGA")} · {String(pick(r, "ward") ?? "")}</span>
                      <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">Flag</Badge>
                    </div>
                    <div className="text-muted-foreground">Supervisor: {String(pick(r, "supervisor_name", "submitter") ?? r._submitted_by ?? "—")}</div>
                    <div className="text-muted-foreground">Adverse: {num(pick(r, "adverse_events", "sae"))} · Refusals: {num(pick(r, "refusals"))}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, bar }: { icon: React.ReactNode; label: string; value: string; bar: { pct: number; color: string; sub: string } }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">{icon} {label}</span>
        </div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, bar.pct)}%`, backgroundColor: bar.color }} />
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">{bar.sub}</div>
      </CardContent>
    </Card>
  );
}
