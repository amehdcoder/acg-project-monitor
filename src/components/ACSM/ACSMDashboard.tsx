import { useMemo, useState, useCallback, useEffect } from "react";
import { useTheme } from "next-themes";
import {
  ArrowLeft, Megaphone, Download, Filter, Calendar, MapPin,
  Layers, Users, ChevronLeft, ChevronRight, Search, TrendingUp,
  TrendingDown, CheckCircle2, AlertTriangle, Ban, CircleDashed, FileText,
  RefreshCw, Sparkles, ShieldCheck, BarChart3, Moon, Sun,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ReferenceLine,
} from "recharts";
import MapVisualization from "@/components/MapVisualization/MapVisualization";
import { MapMarker } from "@/components/MapVisualization/types";
import { useAcsmDashboard } from "@/hooks/useAcsmDashboard";
import { useAuth } from "@/hooks/useAuth";
import {
  ACSM_CATEGORIES, STATUS_META, achievementColor, formatByUnit,
  categoryLabel, indicatorLevelLabel, type AcsmCategory, type AcsmStatus,
} from "@/lib/acsm/definition";
import { useAcsmDuplicateOverrides } from "@/hooks/useAcsmDuplicateOverrides";
import { useAcsmKpiSync, type AcsmKpiPayload } from "@/hooks/useAcsmKpiSync";
import DuplicateReviewPanel from "@/components/ACSM/DuplicateReviewPanel";
import AcsmKpiSyncPanel from "@/components/ACSM/AcsmKpiSyncPanel";

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

export const ACSM_DASHBOARD_PALETTE = {
  dark: {
    bg: "#071426", panel: "#0d213a", panel2: "#112b49", border: "#3d5f86",
    borderSoft: "#29486e", text: "#f5f9ff", sub: "#b9c9df", primary: "#67e8f9", blue: "#60a5fa",
    track: "#17304f", buttonText: "#06121f", active: "#13345a",
  },
  light: {
    bg: "#f7fafc", panel: "#ffffff", panel2: "#eef6fb", border: "#c5d3e2",
    borderSoft: "#d5e0eb", text: "#172133", sub: "#4f6178", primary: "#0369a1", blue: "#1d4ed8",
    track: "#dbe7f3", buttonText: "#ffffff", active: "#e0f2fe",
  },
};

const PALETTE = ACSM_DASHBOARD_PALETTE;

type Palette = typeof ACSM_DASHBOARD_PALETTE.dark;

const fmt = (n: number) => n.toLocaleString();

export default function ACSMDashboard({ projectId, onClose }: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const C = isDark ? PALETTE.dark : PALETTE.light;
  const [category, setCategory] = useState<AcsmCategory | "all">("results_of_advocacy");
  const overrides = useAcsmDuplicateOverrides(projectId);
  const {
    stats, statusDistribution, trend, topLocations, indicatorRows, points,
    dataQuality, loading, reload, simulate, setSimulate, duplicateInfo,
  } = useAcsmDashboard(projectId, category, { acsmMap: overrides.acsmMap, irfMap: overrides.irfMap });
  const { isOwnerLevel, isAdmin } = useAuth();
  const kpiSync = useAcsmKpiSync(projectId);
  const autoSync = kpiSync.autoSync;

  const buildKpiPayload = useCallback((): AcsmKpiPayload => ({
    generatedAt: new Date().toISOString(),
    projectName: projectId || undefined,
    kpis: [
      { key: "people_benefiting", label: "People Benefiting", value: stats.peopleBenefiting, source: "linked" },
      { key: "indicators_total", label: "Total Indicators", value: stats.total, source: "linked" },
      { key: "on_track", label: "Indicators On Track", value: stats.onTrack, source: "linked" },
      { key: "at_risk", label: "Indicators At Risk", value: stats.atRisk, source: "linked" },
      { key: "behind", label: "Indicators Behind Target", value: stats.behind, source: "linked" },
      { key: "avg_achievement", label: "Average Achievement", value: stats.avgAchievement, unit: "%", source: "linked" },
      { key: "irf_contributing", label: "IRF Submissions Contributing", value: duplicateInfo.irfUnique, source: "irf" },
      { key: "duplicates_excluded", label: "Duplicates Excluded", value: duplicateInfo.total, source: "integrity" },
    ],
    indicators: indicatorRows.map((r) => ({
      code: r.code, name: r.name, category: r.category, level: r.level, unit: r.unit,
      target: r.target, actual: r.actual, pct: r.pct, status: r.status,
      officer: r.officer, lastUpdated: r.lastUpdated, source: (r as any)._source || "acsm",
    })),
    duplicates: {
      acsmDuplicates: duplicateInfo.acsmDuplicates, irfDuplicates: duplicateInfo.irfDuplicates,
      total: duplicateInfo.total, irfReports: duplicateInfo.irfReports, irfUnique: duplicateInfo.irfUnique,
      overriddenToUnique: [...overrides.acsmMap.values(), ...overrides.irfMap.values()].filter((d) => d === "unique").length,
      rejected: [...overrides.acsmMap.values(), ...overrides.irfMap.values()].filter((d) => d === "rejected").length,
    },
  }), [stats, indicatorRows, duplicateInfo, overrides.acsmMap, overrides.irfMap, projectId]);

  // Realtime auto-publish to Google Sheets → Looker Studio whenever the
  // deduplicated KPIs or admin duplicate decisions change.
  useEffect(() => {
    if (loading) return;
    autoSync(buildKpiPayload());
  }, [loading, buildKpiPayload, autoSync]);


  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const PER = 12;

  const filtered = useMemo(
    () => indicatorRows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase())),
    [indicatorRows, search],
  );
  const paged = filtered.slice(page * PER, page * PER + PER);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER));

  const markers: MapMarker[] = points
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => ({
      id: p.id, lat: p.lat, lng: p.lng, title: p.label,
      description: `${p.pct}% achievement`, markerColor: achievementColor(p.pct),
    }));

  const navIcons: Record<string, any> = {
    results_of_advocacy: Megaphone,
    capacities_for_advocacy: ShieldCheck,
    stakeholder_engagement: Users,
  };
  const navItems = ACSM_CATEGORIES.map((c) => ({
    label: c.short, icon: navIcons[c.value] || Layers, value: c.value,
  }));

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block" style={{ background: C.panel, borderRight: `1px solid ${C.borderSoft}`, minHeight: "100vh" }}>
          <div className="flex items-center gap-2 px-5 py-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: C.active, color: C.primary }}>
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[15px] font-bold tracking-wide">ACSM</p>
              <p className="text-[10px]" style={{ color: C.sub }}>Indicator & Data Mgmt</p>
            </div>
          </div>
          <p className="px-5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>Modules</p>
          {navItems.map((n) => (
            <button
              key={n.value}
              onClick={() => { setCategory(n.value as AcsmCategory); setPage(0); }}
              className="flex w-full items-center gap-3 px-5 py-2.5 text-[13.5px] font-medium transition-colors"
              style={category === n.value ? { background: C.active, color: C.primary, borderLeft: `3px solid ${C.primary}` } : { color: C.sub }}
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </button>
          ))}
          <button
            onClick={() => { setCategory("all"); setPage(0); }}
            className="flex w-full items-center gap-3 px-5 py-2.5 text-[13.5px] font-medium"
            style={category === "all" ? { background: C.active, color: C.primary, borderLeft: `3px solid ${C.primary}` } : { color: C.sub }}
          >
            <Layers className="h-4 w-4" /> All Modules
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: C.active, color: C.primary }}>
                <Megaphone className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold leading-tight">
                  {category === "all" ? "ACSM" : categoryLabel(category)} Dashboard
                </h1>
                <p className="text-[13px]" style={{ color: C.sub }}>Track performance across Advocacy, Communication & Social Mobilization indicators</p>
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
              <button
                type="button"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                aria-label={isDark ? "Switch Advocacy dashboard to light mode" : "Switch Advocacy dashboard to dark mode"}
                aria-pressed={isDark}
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ border: `1px solid ${C.border}`, color: C.sub }}
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button onClick={() => reload()} className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.sub }}>

                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold" style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.blue})`, color: C.buttonText }}>
                <Download className="h-4 w-4" /> Download
              </button>
            </div>
          </div>

          {/* IRF contribution + duplicate flagging banner */}
          {!simulate && (duplicateInfo.irfReports > 0 || duplicateInfo.total > 0) && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-[12.5px]"
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.sub }}>
              <span className="flex items-center gap-1.5 font-medium" style={{ color: C.primary }}>
                <Layers className="h-4 w-4" /> Linked sources
              </span>
              <span>
                {fmt(duplicateInfo.irfUnique)} LGA ACSM Focal Person IRF submission(s) contributing
              </span>
              {duplicateInfo.total > 0 && (
                <span className="flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold"
                  style={{ background: "#f59e0b22", color: "#fbbf24", border: "1px solid #f59e0b55" }}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {fmt(duplicateInfo.total)} duplicate submission(s) flagged & excluded from counts
                </span>
              )}
            </div>
          )}

          {/* Realtime sync + duplicate review */}
          <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AcsmKpiSyncPanel sync={kpiSync} getPayload={buildKpiPayload} canManage={isAdmin || isOwnerLevel} dark={isDark} />
            <DuplicateReviewPanel projectId={projectId} dark={isDark} />
          </div>

          {/* Filters bar */}
          <div className="mb-5 flex flex-wrap gap-3">
            <FilterChip icon={Calendar} label="Reporting Period" value="May 2025" palette={C} />
            <FilterChip icon={MapPin} label="Location" value="All Locations" palette={C} />
            <FilterChip icon={Layers} label="Category" value={category === "all" ? "All" : categoryLabel(category)} palette={C} />
            <FilterChip icon={Users} label="Responsible Officer" value="All Officers" palette={C} />
            <div className="ml-auto flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px]" style={{ background: C.blue, color: "#fff" }}>
              <Filter className="h-4 w-4" /> Filters
            </div>
          </div>

          {/* KPI cards */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi icon={Users} label="People Benefiting" value={fmt(stats.peopleBenefiting)} tint={C.primary} delta="+18.6%" up palette={C} />
            <Kpi icon={CheckCircle2} label="Indicators On Track" value={String(stats.onTrack)} tint="#22c55e" delta={`${pct(stats.onTrack, stats.total)}% of total`} up palette={C} />
            <Kpi icon={AlertTriangle} label="At Risk" value={String(stats.atRisk)} tint="#f59e0b" delta={`${pct(stats.atRisk, stats.total)}% of total`} palette={C} />
            <Kpi icon={Ban} label="Behind Target" value={String(stats.behind)} tint="#ef4444" delta={`${pct(stats.behind, stats.total)}% of total`} down palette={C} />
            <Kpi icon={CircleDashed} label="Draft / Pending" value={String(stats.draft)} tint={C.blue} delta={`${pct(stats.draft, stats.total)}% of total`} palette={C} />
            <Kpi icon={TrendingUp} label="Avg Achievement" value={`${stats.avgAchievement}%`} tint={achievementColor(stats.avgAchievement)} delta="this period" up palette={C} />
          </div>

          {/* Trend + Status + Top locations */}
          <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr_1fr]">
            <Panel title="Achievement Trend" sub="This period vs previous 6 periods" palette={C}>
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

            <Panel title="Status Distribution" sub={`${stats.total} indicators`} palette={C}>
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

            <Panel title="Top Performing Locations" palette={C}>
              <div className="space-y-2.5">
                {topLocations.length === 0 && <p className="text-[13px]" style={{ color: C.sub }}>No data yet.</p>}
                {topLocations.map((l) => (
                  <div key={l.location} className="flex items-center gap-3">
                    <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: C.sub }} />
                    <span className="w-24 truncate text-[13px]">{l.location}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: C.track }}>
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
            <Panel title="Data Quality Overview" palette={C}>
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
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: C.track }}>
                        <div className="h-full rounded-full" style={{ width: `${v}%`, background: achievementColor(v) }} />
                      </div>
                      <span className="w-9 text-right font-semibold">{v}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel title="Geospatial Distribution" sub={`${markers.length} reporting points`} palette={C}>
              <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${C.borderSoft}` }}>
                <MapVisualization markers={markers} height="320px" showNigeriaBoundaries showLegend={false} />
              </div>
            </Panel>
          </div>

          {/* Indicator table */}
          <Panel
            title={`${category === "all" ? "All" : categoryLabel(category)} Indicators (${filtered.length})`}
            palette={C}
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
                    const m = STATUS_META[r.status as AcsmStatus] ?? STATUS_META.draft_pending;
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
                            <div className="h-1.5 w-20 overflow-hidden rounded-full" style={{ background: C.track }}>
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
                    <tr><td colSpan={9} className="px-2 py-8 text-center text-[13px]" style={{ color: C.sub }}>{loading ? "Loading…" : "No indicators reported yet. Submit the ACSM form or enable Simulate."}</td></tr>
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

const Kpi = ({ icon: Icon, label, value, tint, delta, up, down, palette: C }: { icon: any; label: string; value: string; tint: string; delta?: string; up?: boolean; down?: boolean; palette: Palette }) => (
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

const Panel = ({ title, sub, right, children, palette: C }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; palette: Palette }) => (
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

const FilterChip = ({ icon: Icon, label, value, palette: C }: { icon: any; label: string; value: string; palette: Palette }) => (
  <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: C.panel, border: `1px solid ${C.borderSoft}` }}>
    <Icon className="h-4 w-4" style={{ color: C.primary }} />
    <div>
      <p className="text-[10px] leading-tight" style={{ color: C.sub }}>{label}</p>
      <p className="text-[13px] font-medium leading-tight">{value}</p>
    </div>
  </div>
);
