import { useMemo, useState } from "react";
import {
  ArrowLeft, HeartHandshake, HelpCircle, Download, Filter, Calendar, MapPin,
  Layers, Users, ChevronLeft, ChevronRight, Search, TrendingUp,
  TrendingDown, CheckCircle2, AlertTriangle, Ban, CircleDashed, FileText,
  RefreshCw, Sparkles, BarChart3, Eye, BookOpen, Unlock, GraduationCap,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ReferenceLine,
} from "recharts";
import MapVisualization from "@/components/MapVisualization/MapVisualization";
import { MapMarker } from "@/components/MapVisualization/types";
import { useSbcDashboard } from "@/hooks/useSbcDashboard";
import { useAuth } from "@/hooks/useAuth";
import {
  STATUS_META, achievementColor, formatByUnit,
  categoryLabel, indicatorLevelLabel, type SbcCategory, type SbcStatus,
} from "@/lib/sbc/definition";

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

const C = {
  bg: "#0a1628", panel: "#0f1f38", panel2: "#11253f", border: "#1c3a5e",
  borderSoft: "#16304f", text: "#e6eefb", sub: "#8aa2c4", primary: "#22d3ee", blue: "#3b82f6",
};

const fmt = (n: number) => n.toLocaleString();

export default function SBCDashboard({ projectId, onClose }: Props) {
  const [category, setCategory] = useState<SbcCategory | "all">("exposure");
  const {
    stats, statusDistribution, trend, topLocations, indicatorRows, points,
    dataQuality, loading, reload, simulate, setSimulate,
  } = useSbcDashboard(projectId, category);
  const { isOwnerLevel } = useAuth();

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const PER = 12;

  const filtered = useMemo(
    () => indicatorRows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase())),
    [indicatorRows, search],
  );
  const paged = filtered.slice(page * PER, page * PER + PER);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER));

  const markers: MapMarker[] = points.map((p) => ({
    id: p.id, lat: p.lat, lng: p.lng, title: p.label,
    description: `${p.pct}% achievement`, markerColor: achievementColor(p.pct),
  }));

  const navItems = [
    { label: "Exposure & Comprehension", icon: Eye, value: "exposure" },
    { label: "Knowledge & Skills", icon: BookOpen, value: "knowledge" },
    { label: "Motivation & Confidence", icon: HeartHandshake, value: "motivation" },
    { label: "Social Norms & Influence", icon: Users, value: "norms" },
    { label: "Barriers Reduction", icon: Unlock, value: "barriers" },
    { label: "Implementation Capacity", icon: GraduationCap, value: "capacity" },
  ];

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block" style={{ background: C.panel, borderRight: `1px solid ${C.borderSoft}`, minHeight: "100vh" }}>
          <div className="flex items-center gap-2 px-5 py-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "#13345a", color: C.primary }}>
              <HeartHandshake className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[15px] font-bold tracking-wide">SBC</p>
              <p className="text-[10px]" style={{ color: C.sub }}>Indicator & Data Mgmt</p>
            </div>
          </div>
          <p className="px-5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>Result Areas</p>
          {navItems.map((n) => (
            <button
              key={n.value}
              onClick={() => { setCategory(n.value as SbcCategory); setPage(0); }}
              className="flex w-full items-center gap-3 px-5 py-2.5 text-[13px] font-medium transition-colors"
              style={category === n.value ? { background: "#13345a", color: C.primary, borderLeft: `3px solid ${C.primary}` } : { color: C.sub }}
            >
              <n.icon className="h-4 w-4 shrink-0" /> {n.label}
            </button>
          ))}
          <button
            onClick={() => { setCategory("all"); setPage(0); }}
            className="flex w-full items-center gap-3 px-5 py-2.5 text-[13.5px] font-medium"
            style={category === "all" ? { background: "#13345a", color: C.primary, borderLeft: `3px solid ${C.primary}` } : { color: C.sub }}
          >
            <Layers className="h-4 w-4" /> All Result Areas
          </button>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6">
          {/* Header */}
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: C.primary }}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "#13345a", color: C.primary }}>
                <HeartHandshake className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold leading-tight">
                  {category === "all" ? "Social & Behaviour Change" : categoryLabel(category)} Dashboard
                </h1>
                <p className="text-[13px]" style={{ color: C.sub }}>Track performance across Social & Behaviour Change indicators</p>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {isOwnerLevel && (
                <button
                  onClick={() => setSimulate(!simulate)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium"
                  style={simulate ? { background: `${C.primary}22`, color: C.primary, border: `1px solid ${C.primary}55` } : { border: `1px solid ${C.border}`, color: C.sub }}
                >
                  <Sparkles className="h-4 w-4" /> {simulate ? "Simulating" : "Simulate"}
                </button>
              )}
              <button onClick={() => reload()} className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.sub }}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-[#06121f]" style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.blue})` }}>
                <Download className="h-4 w-4" /> Download
              </button>
            </div>
          </div>

          {/* Filters bar */}
          <div className="mb-5 flex flex-wrap gap-3">
            <FilterChip icon={Calendar} label="Reporting Period" value="May 2025" />
            <FilterChip icon={MapPin} label="Location" value="All Locations" />
            <FilterChip icon={Layers} label="Result Area" value={category === "all" ? "All" : categoryLabel(category)} />
            <FilterChip icon={Users} label="Responsible Officer" value="All Officers" />
            <div className="ml-auto flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px]" style={{ background: C.blue, color: "#fff" }}>
              <Filter className="h-4 w-4" /> Filters
            </div>
          </div>

          {/* KPI cards */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi icon={Users} label="People Reached" value={fmt(stats.peopleReached)} tint={C.primary} delta="+14.2%" up />
            <Kpi icon={CheckCircle2} label="Indicators On Track" value={String(stats.onTrack)} tint="#22c55e" delta={`${pct(stats.onTrack, stats.total)}% of total`} up />
            <Kpi icon={AlertTriangle} label="At Risk" value={String(stats.atRisk)} tint="#f59e0b" delta={`${pct(stats.atRisk, stats.total)}% of total`} />
            <Kpi icon={Ban} label="Behind Target" value={String(stats.behind)} tint="#ef4444" delta={`${pct(stats.behind, stats.total)}% of total`} down />
            <Kpi icon={CircleDashed} label="Draft / Pending" value={String(stats.draft)} tint={C.blue} delta={`${pct(stats.draft, stats.total)}% of total`} />
            <Kpi icon={TrendingUp} label="Avg Achievement" value={`${stats.avgAchievement}%`} tint={achievementColor(stats.avgAchievement)} delta="this period" up />
          </div>

          {/* Trend + Status + Top locations */}
          <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr_1fr]">
            <Panel title="Achievement Trend" sub="This period vs previous 6 periods">
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.borderSoft} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: C.sub }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: C.sub }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} formatter={(v: number) => `${v}%`} />
                  <ReferenceLine y={75} stroke={C.sub} strokeDasharray="5 5" />
                  <Line type="monotone" dataKey="achievement" stroke={C.primary} strokeWidth={2.5} dot={{ r: 3, fill: C.primary }} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Status Distribution" sub={`${stats.total} indicators`}>
              <div className="flex items-center gap-3">
                <ResponsiveContainer width="55%" height={200}>
                  <PieChart>
                    <Pie data={statusDistribution} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                      {statusDistribution.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {statusDistribution.map((d) => (
                    <div key={d.key} className="flex items-center justify-between text-[12.5px]">
                      <span className="flex items-center gap-2" style={{ color: C.text }}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} /> {d.name}
                      </span>
                      <span className="font-semibold">{d.value} ({pct(d.value, stats.total)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel title="Top Performing Locations">
              <div className="space-y-2.5">
                {topLocations.length === 0 && <p className="text-[13px]" style={{ color: C.sub }}>No data yet.</p>}
                {topLocations.map((l) => (
                  <div key={l.location} className="flex items-center gap-3">
                    <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: C.sub }} />
                    <span className="w-24 truncate text-[13px]">{l.location}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "#0a1c33" }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, l.achievement)}%`, background: achievementColor(l.achievement) }} />
                    </div>
                    <span className="w-10 text-right text-[12.5px] font-semibold" style={{ color: achievementColor(l.achievement) }}>{l.achievement}%</span>
                    <span className="w-10 text-right text-[11px]" style={{ color: C.sub }}>{l.onTrack}/{l.total}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* Data quality + map */}
          <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.4fr]">
            <Panel title="Data Quality Overview">
              <div className="flex items-center gap-5">
                <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
                  <svg viewBox="0 0 36 36" className="h-28 w-28 -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke={C.borderSoft} strokeWidth="3.5" />
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke={achievementColor(dataQuality.overall)} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(dataQuality.overall / 100) * 97.4} 97.4`} />
                  </svg>
                  <div className="absolute text-center">
                    <p className="text-xl font-bold" style={{ color: achievementColor(dataQuality.overall) }}>{dataQuality.overall}%</p>
                    <p className="text-[10px]" style={{ color: C.sub }}>Quality</p>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  {([
                    ["Completeness", dataQuality.completeness],
                    ["Timeliness", dataQuality.timeliness],
                    ["Accuracy", dataQuality.accuracy],
                    ["Consistency", dataQuality.consistency],
                    ["Validity", dataQuality.validity],
                  ] as [string, number][]).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-[12.5px]">
                      <CheckCircle2 className="h-3.5 w-3.5" style={{ color: achievementColor(v) }} />
                      <span className="w-24" style={{ color: C.text }}>{k}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "#0a1c33" }}>
                        <div className="h-full rounded-full" style={{ width: `${v}%`, background: achievementColor(v) }} />
                      </div>
                      <span className="w-9 text-right font-semibold">{v}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel title="Geospatial Distribution" sub={`${markers.length} reporting points`}>
              <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${C.borderSoft}` }}>
                <MapVisualization markers={markers} height="320px" showNigeriaBoundaries showLegend={false} />
              </div>
            </Panel>
          </div>

          {/* Indicator table */}
          <Panel
            title={`${category === "all" ? "All" : categoryLabel(category)} Indicators (${filtered.length})`}
            right={
              <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: C.panel2, border: `1px solid ${C.border}` }}>
                <Search className="h-3.5 w-3.5" style={{ color: C.sub }} />
                <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search indicators…" className="w-40 bg-transparent text-[13px] outline-none" style={{ color: C.text }} />
              </div>
            }
          >
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-[13px]">
                <thead>
                  <tr style={{ color: C.sub }} className="text-left text-[11px] uppercase tracking-wide">
                    <th className="px-2 py-2.5">ID</th>
                    <th className="px-2 py-2.5">Indicator Name</th>
                    <th className="px-2 py-2.5">Level</th>
                    <th className="px-2 py-2.5 text-right">Target</th>
                    <th className="px-2 py-2.5 text-right">Actual</th>
                    <th className="px-2 py-2.5">Achievement %</th>
                    <th className="px-2 py-2.5">Status</th>
                    <th className="px-2 py-2.5">Last Updated</th>
                    <th className="px-2 py-2.5 text-center">Ev.</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r) => {
                    const m = STATUS_META[r.status as SbcStatus];
                    return (
                      <tr key={r.id} className="border-t" style={{ borderColor: C.borderSoft }}>
                        <td className="px-2 py-2.5 font-mono text-[11.5px]" style={{ color: C.sub }}>{r.code}</td>
                        <td className="px-2 py-2.5 font-medium">{r.name}</td>
                        <td className="px-2 py-2.5">
                          <span className="rounded-md px-2 py-0.5 text-[11px]" style={{ background: C.panel2, color: C.sub }}>{indicatorLevelLabel(r.level)}</span>
                        </td>
                        <td className="px-2 py-2.5 text-right" style={{ color: C.sub }}>{formatByUnit(r.target, r.unit)}</td>
                        <td className="px-2 py-2.5 text-right font-medium">{formatByUnit(r.actual, r.unit)}</td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-9 font-semibold" style={{ color: achievementColor(r.pct) }}>{r.pct}%</span>
                            <div className="h-1.5 w-20 overflow-hidden rounded-full" style={{ background: "#0a1c33" }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.pct)}%`, background: achievementColor(r.pct) }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${m.color}22`, color: m.color }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} /> {m.label}
                          </span>
                        </td>
                        <td className="px-2 py-2.5" style={{ color: C.sub }}>{r.lastUpdated}</td>
                        <td className="px-2 py-2.5 text-center">
                          <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: C.sub }}><FileText className="h-3 w-3" /> {r.evidence}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {paged.length === 0 && (
                    <tr><td colSpan={9} className="px-2 py-8 text-center text-[13px]" style={{ color: C.sub }}>{loading ? "Loading…" : "No indicators reported yet. Submit the SBC form or enable Simulate."}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-[12px]" style={{ color: C.sub }}>
              <span>Showing {filtered.length === 0 ? 0 : page * PER + 1}–{Math.min(filtered.length, (page + 1) * PER)} of {filtered.length} indicators</span>
              <div className="flex items-center gap-2">
                <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="flex h-7 w-7 items-center justify-center rounded-lg disabled:opacity-40" style={{ border: `1px solid ${C.border}` }}><ChevronLeft className="h-4 w-4" /></button>
                <span className="font-semibold" style={{ color: C.text }}>{page + 1} / {totalPages}</span>
                <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="flex h-7 w-7 items-center justify-center rounded-lg disabled:opacity-40" style={{ border: `1px solid ${C.border}` }}><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          </Panel>
        </main>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

const Kpi = ({ icon: Icon, label, value, tint, delta, up, down }: { icon: any; label: string; value: string; tint: string; delta?: string; up?: boolean; down?: boolean }) => (
  <div className="relative overflow-hidden rounded-2xl p-4" style={{ background: `linear-gradient(135deg, ${tint}14, ${C.panel} 60%)`, border: `1px solid ${C.borderSoft}` }}>
    <span className="absolute inset-y-0 left-0 w-1" style={{ background: tint }} />
    <div className="flex items-center justify-between">
      <span className="text-[11.5px]" style={{ color: C.sub }}>{label}</span>
      <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${tint}22`, color: tint }}><Icon className="h-3.5 w-3.5" /></div>
    </div>
    <p className="mt-2 text-2xl font-bold" style={{ color: tint }}>{value}</p>
    {delta && (
      <p className="mt-0.5 flex items-center gap-1 text-[11px]" style={{ color: up ? "#22c55e" : down ? "#ef4444" : C.sub }}>
        {up && <TrendingUp className="h-3 w-3" />}{down && <TrendingDown className="h-3 w-3" />}{delta}
      </p>
    )}
  </div>
);

const Panel = ({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) => (
  <div className="rounded-2xl p-4 sm:p-5" style={{ background: C.panel, border: `1px solid ${C.borderSoft}` }}>
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <h3 className="text-[15px] font-bold">{title}</h3>
        {sub && <p className="text-[12px]" style={{ color: C.sub }}>{sub}</p>}
      </div>
      {right}
    </div>
    {children}
  </div>
);

const FilterChip = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
  <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: C.panel, border: `1px solid ${C.borderSoft}` }}>
    <Icon className="h-4 w-4" style={{ color: C.primary }} />
    <div>
      <p className="text-[10px] leading-tight" style={{ color: C.sub }}>{label}</p>
      <p className="text-[13px] font-medium leading-tight">{value}</p>
    </div>
  </div>
);
