import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  RefreshCw,
  Printer,
  LayoutGrid,
  CheckSquare,
  Users,
  MessageSquare,
  Scale,
  Radio,
  FileCheck2,
  AlertOctagon,
  BookOpen,
  ClipboardList,
  Settings,
  HelpCircle,
  MessageCircle,
  Info,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import {
  ScatterChart,
  Scatter,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  ReferenceLine,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import OwnerSubmissionManager from "@/components/owner/OwnerSubmissionManager";
import type { FormGroup, Question } from "@/components/FormBuilder/types";
import { NAVY, DASHBOARD_NAV, qualityBand } from "./sarmaanBrand";


interface Props {
  form: { id: string; name: string; questions: unknown; settings: unknown };
  onClose: () => void;
}

interface Row {
  id: string;
  data: Record<string, unknown>;
  submitted_at: string | null;
  created_at: string;
  user_id: string | null;
}

function sectionsFrom(questions: unknown): FormGroup[] {
  if (Array.isArray(questions)) {
    const groups = questions.filter((r: unknown) => Array.isArray((r as FormGroup)?.questions));
    if (groups.length) return groups as FormGroup[];
  }
  return [];
}

export default function SarmaanLearningDashboard({ form, onClose }: Props) {
  const { isOwner } = useAuth();
  const sections = useMemo(() => sectionsFrom(form.questions), [form.questions]);
  const questions = useMemo(() => sections.flatMap((s) => s.questions), [sections]);
  const nameToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of questions as Question[]) if (q.name) m.set(q.name, q.id);
    return m;
  }, [questions]);

  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [nav, setNav] = useState<string>(DASHBOARD_NAV[0]);
  // Realtime feedback: connection state, last refresh time, and a transient
  // "flash" pulse whenever a live change is applied so updates feel instant.
  const [live, setLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [flash, setFlash] = useState(false);

  const load = useCallback(async (opts?: { live?: boolean }) => {
    if (!opts?.live) setLoading(true);
    const { data } = await supabase
      .from("form_submissions")
      .select("id,data,submitted_at,created_at,user_id")
      .eq("form_id", form.id)
      .order("created_at", { ascending: false })
      .limit(4000);
    const list = (data || []) as unknown as Row[];
    setRows(list);
    // Resolve submitter names (supervisor identity is captured from the session,
    // not as a manual question) so the visits table shows the real supervisor.
    const ids = [...new Set(list.map((r) => r.user_id).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", ids);
      const map: Record<string, string> = {};
      (profs as any[] | null)?.forEach((p) => {
        map[p.user_id] = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || "";
      });
      setProfiles(map);
    }
    setLoading(false);
    setHasLoadedOnce(true);
    setLastUpdated(Date.now());
    if (opts?.live) {
      setFlash(true);
      window.setTimeout(() => setFlash(false), 1200);
    }
  }, [form.id]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`sarmaan-dash-${form.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "form_submissions", filter: `form_id=eq.${form.id}` },
        () => load({ live: true }),
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => { supabase.removeChannel(ch); };
  }, [form.id, load]);

  // "Updated Ns ago" ticker.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => forceTick((n) => n + 1), 15000);
    return () => window.clearInterval(t);
  }, []);

  const val = (r: Row, name: string): unknown => {
    const id = nameToId.get(name);
    return id ? r.data?.[id] : undefined;
  };
  const num = (r: Row, name: string): number => {
    const n = Number(val(r, name));
    return Number.isFinite(n) ? n : 0;
  };
  const str = (r: Row, name: string): string => {
    const v = val(r, name);
    if (v == null || v === "") return "";
    return Array.isArray(v) ? v.join(", ") : String(v);
  };
  // Meta fields (e.g. __section_label) live directly on the submission payload.
  const meta = (r: Row, key: string): string => {
    const v = r.data?.[key];
    return v == null ? "" : String(v);
  };

  // ---- Filters (mapped to real checklist questions + module meta) ----
  const [filters, setFilters] = useState<Record<string, string>>({});
  const filterDefs = [
    { field: "state", label: "State" },
    { field: "lga", label: "LGA" },
    { field: "ward", label: "Ward" },
    { field: "type_of_visit", label: "Visit Type" },
    { field: "__section_label", label: "Module", isMeta: true },
    { field: "overall_implementation_quality", label: "Quality" },
  ];
  const readField = (r: Row, field: string, isMeta?: boolean) => (isMeta ? meta(r, field) : str(r, field));
  const optionsFor = (field: string, isMeta?: boolean) => {
    const s = new Set<string>();
    for (const r of rows) { const v = readField(r, field, isMeta); if (v) s.add(v); }
    return [...s].sort();
  };
  const filtered = useMemo(() => {
    const active = filterDefs
      .map((d) => [d.field, filters[d.field], d.isMeta] as const)
      .filter(([, v]) => v && v !== "__all__");
    if (!active.length) return rows;
    return rows.filter((r) => active.every(([f, v, m]) => readField(r, f, m) === v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filters]);

  // ---- Quality helpers (ynp questions store yes / partly / no → 2 / 1 / 0) ----
  const yesCount = (name: string) => filtered.filter((r) => /^yes$/i.test(str(r, name))).length;
  const qualPct = (names: string[]) => {
    let sum = 0, n = 0;
    for (const r of filtered) for (const nm of names) {
      const v = str(r, nm).toLowerCase();
      if (v === "yes") { sum += 2; n++; }
      else if (v === "partly") { sum += 1; n++; }
      else if (v === "no") { n++; }
    }
    return n ? Math.round((sum / (n * 2)) * 100) : 0;
  };
  const mapPct = (name: string, table: Record<string, number>) => {
    let sum = 0, n = 0;
    for (const r of filtered) {
      const key = str(r, name).toLowerCase();
      if (key && key in table) { sum += table[key]; n++; }
    }
    return n ? Math.round(sum / n) : 0;
  };

  // ---- Aggregations (all derived from live submissions) ----
  const agg = useMemo(() => {
    const scores = filtered.map((r) => num(r, "total_score")).filter((x) => x > 0);
    const avgScorePct = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length / 80) * 100) : 0;
    const reach = filtered.reduce((a, r) => a + num(r, "estimated_total_reached"), 0);
    const casesId = filtered.reduce((a, r) => a + num(r, "cases_identified"), 0);
    const casesResolved = filtered.reduce((a, r) => a + num(r, "cases_resolved"), 0);
    const casesPending = filtered.reduce((a, r) => a + num(r, "cases_pending"), 0);
    const resRate = casesId ? Math.round((casesResolved / casesId) * 100) : 0;

    // Activities completed — from Section L action status.
    const actionRows = filtered.filter((r) => str(r, "action_status"));
    const completed = actionRows.filter((r) => /complete/i.test(str(r, "action_status"))).length;
    const activitiesPct = actionRows.length ? Math.round((completed / actionRows.length) * 100) : 0;

    // MOV completeness — Section H overall MOV rating (fallback to score_evidence).
    let movPct = mapPct("mov_quality", { good: 100, fair: 50, poor: 0 });
    if (!movPct) {
      const ev = filtered.map((r) => num(r, "score_evidence")).filter((x) => x > 0);
      movPct = ev.length ? Math.min(100, Math.round((ev.reduce((a, b) => a + b, 0) / ev.length) * 10)) : 0;
    }

    // Community engagement — Section E engagement level + participation type.
    const engLevel = mapPct("engagement_level", { high: 100, medium: 60, low: 20 });
    const partType = mapPct("participation_type", { active: 100, moderate: 60, passive: 20 });
    const engParts = [engLevel, partType].filter((x) => x > 0);
    const engagementPct = engParts.length ? Math.round(engParts.reduce((a, b) => a + b, 0) / engParts.length) : 0;

    // Overdue action points — due date passed, status not completed.
    const today = new Date().toISOString().slice(0, 10);
    const overdue = filtered.filter((r) => {
      const due = str(r, "action_due_date");
      return due && due < today && !/complete/i.test(str(r, "action_status"));
    }).length;
    const dataQualityIssues = filtered.filter((r) => /poor/i.test(str(r, "mov_quality"))).length;

    return {
      n: filtered.length,
      avgScorePct, movPct, reach, engagementPct,
      casesId, casesResolved, casesPending, resRate,
      activitiesPct, overdue, dataQualityIssues,
      pendingCritical: casesPending,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  // ---- Per-LGA aggregates (coverage + scatter) ----
  const lgaAgg = useMemo(() => {
    const m = new Map<string, { count: number; scoreSum: number; scoreN: number; completeSum: number; completeN: number }>();
    for (const r of filtered) {
      const lga = str(r, "lga") || "Unspecified";
      const e = m.get(lga) ?? { count: 0, scoreSum: 0, scoreN: 0, completeSum: 0, completeN: 0 };
      e.count++;
      const s = num(r, "total_score");
      if (s > 0) { e.scoreSum += (s / 80) * 100; e.scoreN++; }
      const st = str(r, "action_status");
      if (st) { e.completeSum += /complete/i.test(st) ? 100 : 0; e.completeN++; }
      m.set(lga, e);
    }
    return [...m.entries()].map(([lga, e]) => ({
      lga,
      count: e.count,
      scoreN: e.scoreN,
      quality: e.scoreN ? Math.round(e.scoreSum / e.scoreN) : 0,
      completion: e.completeN ? Math.round(e.completeSum / e.completeN) : 0,
    }));
  }, [filtered]);

  const coverageData = useMemo(
    () => [...lgaAgg].sort((a, b) => b.count - a.count).slice(0, 10).map((l) => ({ name: l.lga, value: l.count })),
    [lgaAgg],
  );

  const scatter = useMemo(
    () => lgaAgg.filter((l) => l.scoreN !== 0 || l.completion > 0 || l.quality > 0)
      .map((l) => ({ x: l.completion, y: l.quality, z: Math.max(40, Math.min(200, l.count * 20)), name: l.lga })),
    [lgaAgg],
  );

  // ---- Submissions-over-time trend (real sparkline series) ----
  const trend = useMemo(() => {
    const days = 14;
    const buckets = new Array(days).fill(0);
    const now = Date.now();
    for (const r of filtered) {
      const t = new Date(r.submitted_at || r.created_at).getTime();
      const diff = Math.floor((now - t) / 86400000);
      if (diff >= 0 && diff < days) buckets[days - 1 - diff]++;
    }
    return buckets;
  }, [filtered]);

  const breakdown = (field: string, limit = 8) => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const raw = val(r, field);
      const vals = Array.isArray(raw) ? raw.map(String) : [str(r, field)];
      for (const v of vals) if (v) m.set(v, (m.get(v) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, value]) => ({ name, value }));
  };

  // ---- MOV data-quality distribution (real) ----
  const movDist = useMemo(() => {
    const t: Record<string, number> = { Good: 0, Fair: 0, Poor: 0 };
    for (const r of filtered) {
      const v = str(r, "mov_quality").toLowerCase();
      if (v === "good") t.Good++;
      else if (v === "fair") t.Fair++;
      else if (v === "poor") t.Poor++;
    }
    const total = t.Good + t.Fair + t.Poor;
    return { total, data: [{ name: "Good", value: t.Good }, { name: "Fair", value: t.Fair }, { name: "Poor", value: t.Poor }] };
  }, [filtered]);

  const lowQualityLgas = lgaAgg.filter((l) => l.scoreN !== 0 && l.quality < 50).length;

  // ---- Open-ended text response analysis (all free-text questions) ----
  const textAnalysis = useMemo(() => {
    const STOP = new Set([
      "the", "and", "for", "are", "was", "were", "with", "that", "this", "have", "has",
      "had", "not", "但", "from", "they", "them", "their", "there", "here", "will", "would",
      "been", "being", "than", "then", "into", "onto", "some", "such", "more", "most", "also",
      "which", "when", "what", "where", "who", "whom", "how", "why", "did", "does", "done",
      "you", "your", "our", "his", "her", "its", "all", "any", "can", "could", "should",
      "about", "very", "just", "like", "get", "got", "one", "two", "yes", "none", "nil",
      "over", "because", "during", "while", "each", "other", "these", "those", "still", "much",
    ]);
    const geoNames = new Set(["state", "lga", "ward", "flhf_name", "community", "settlement_name", "gps"]);
    const textQs = (questions as Question[]).filter(
      (q) => q.type === "text" && q.name && !geoNames.has(q.name),
    );
    return textQs
      .map((q) => {
        const responses: string[] = [];
        for (const r of filtered) {
          const v = str(r, q.name!).trim();
          if (v && !/^\d+([.,]\d+)?$/.test(v) && v.length > 1) responses.push(v);
        }
        const freq = new Map<string, number>();
        for (const resp of responses) {
          const words = resp.toLowerCase().match(/[a-z]{4,}/g) || [];
          const seen = new Set<string>();
          for (const w of words) {
            if (STOP.has(w) || seen.has(w)) continue;
            seen.add(w);
            freq.set(w, (freq.get(w) || 0) + 1);
          }
        }
        const keywords = [...freq.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([term, count]) => ({ term, count }));
        return {
          id: q.id,
          label: q.label || q.name!,
          count: responses.length,
          keywords,
          samples: responses.slice(0, 4),
        };
      })
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [filtered, questions]);



  const hasFilters = Object.values(filters).some((v) => v && v !== "__all__");
  const dq = qualityBand(agg.avgScorePct || 0);

  const kpis = [
    { icon: <CheckSquare className="h-5 w-5" />, label: "Activities Completed", value: `${agg.activitiesPct}%`, sub: `${agg.n} submissions`, color: NAVY.primary, band: "" },
    { icon: <ShieldCheck className="h-5 w-5" />, label: "Implementation Quality Score", value: `${agg.avgScorePct}%`, sub: dq.label, color: NAVY.teal, band: dq.label },
    { icon: <FileCheck2 className="h-5 w-5" />, label: "MOV Completeness", value: `${agg.movPct}%`, sub: qualityBand(agg.movPct).label, color: NAVY.good, band: qualityBand(agg.movPct).label },
    { icon: <Users className="h-5 w-5" />, label: "People Reached", value: agg.reach.toLocaleString(), sub: "estimated", color: NAVY.violet, band: "" },
    { icon: <MessageSquare className="h-5 w-5" />, label: "Community Engagement", value: `${agg.engagementPct}%`, sub: qualityBand(agg.engagementPct).label, color: "#0EA5A0", band: qualityBand(agg.engagementPct).label },
    { icon: <Scale className="h-5 w-5" />, label: "Non-Compliance Resolution", value: `${agg.resRate}%`, sub: qualityBand(agg.resRate).label, color: NAVY.warn, band: qualityBand(agg.resRate).label },
    { icon: <ClipboardList className="h-5 w-5" />, label: "Cases Resolved", value: agg.casesResolved.toLocaleString(), sub: `${agg.casesId} identified`, color: NAVY.good, band: "" },
    { icon: <AlertOctagon className="h-5 w-5" />, label: "Pending Critical Issues", value: agg.pendingCritical.toLocaleString(), sub: "High priority", color: NAVY.bad, band: "" },
  ];

  const navIcons = [LayoutGrid, CheckSquare, Users, MessageSquare, Scale, Radio, FileCheck2, AlertOctagon, BookOpen, ClipboardList];

  return (
    <div className="fixed inset-0 z-50 flex overflow-hidden" style={{ background: NAVY.canvas, fontFamily: NAVY.bodyFont, color: NAVY.ink }}>
      {/* sidebar */}
      <aside className="hidden w-[270px] shrink-0 flex-col md:flex" style={{ background: `linear-gradient(180deg, ${NAVY.sidebar} 0%, ${NAVY.sidebarDeep} 100%)`, color: NAVY.sidebarText }}>
        <div className="flex items-start gap-3 px-5 pb-4 pt-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: NAVY.teal }}>
            <LayoutGrid className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[14px] font-extrabold leading-tight" style={{ fontFamily: NAVY.headingFont }}>SARMAAN Programme Implementation</h1>
            <p className="mt-0.5 text-[11px] font-semibold" style={{ color: NAVY.teal }}>Learning & Improvement Dashboard</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {DASHBOARD_NAV.map((label, i) => {
            const Icon = navIcons[i] ?? LayoutGrid;
            const isActive = nav === label;
            return (
              <button key={label} onClick={() => setNav(label)} className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition"
                style={{ background: isActive ? NAVY.sidebarActive : "transparent", color: isActive ? "#fff" : NAVY.sidebarText }}>
                <Icon className="h-4 w-4 shrink-0" style={{ color: isActive ? NAVY.teal : NAVY.sidebarSub }} />
                <span className="min-w-0 flex-1 leading-snug">{label}</span>
              </button>
            );
          })}
        </nav>
        <div className="border-t px-3 py-3" style={{ borderColor: NAVY.sidebarLine }}>
          <button className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] font-semibold" style={{ color: NAVY.sidebarSub }}><Settings className="h-4 w-4" /> Settings</button>
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] font-semibold" style={{ color: NAVY.sidebarSub }}><HelpCircle className="h-4 w-4" /> Help & Resources</button>
          <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[11px]" style={{ background: "rgba(255,255,255,0.05)", color: NAVY.sidebarSub }}>
            <ShieldCheck className="h-4 w-4" style={{ color: NAVY.good }} /> Data Quality: {dq.label}
          </div>
        </div>
      </aside>

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* top filter bar */}
        <header className="flex flex-wrap items-end gap-3 border-b px-4 py-3" style={{ borderColor: NAVY.line, background: NAVY.panel }}>
          <button onClick={onClose} className="inline-flex items-center gap-1 self-center rounded-full px-2 py-1 text-sm font-semibold transition hover:bg-black/5" style={{ color: NAVY.inkSoft }}>
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          {filterDefs.map((f) => (
            <div key={f.field} className="min-w-[120px]">
              <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: NAVY.inkSoft }}>{f.label}</label>
              <select className="h-8 w-full rounded-lg border bg-white px-2 text-xs" style={{ borderColor: NAVY.line }}
                value={filters[f.field] ?? "__all__"} onChange={(e) => setFilters((s) => ({ ...s, [f.field]: e.target.value }))}>
                <option value="__all__">All {f.label}s</option>
                {optionsFor(f.field, f.isMeta).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-2 self-center">
            {hasFilters && <button onClick={() => setFilters({})} className="text-xs font-semibold" style={{ color: NAVY.bad }}>Clear</button>}
            <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:bg-black/5" style={{ borderColor: NAVY.line }}>
              <Printer className="h-4 w-4" /> Print
            </button>
            <LiveIndicator live={live} lastUpdated={lastUpdated} flash={flash} />
            {isOwner && (
              <OwnerSubmissionManager
                table="form_submissions"
                title="SARMAAN checklist submissions"
                labelColumns={["data.state", "data.lga", "status"]}
                filter={{ column: "form_id", value: form.id }}
                onChanged={() => load()}
                compact
              />
            )}
            <button onClick={() => load()} className="inline-flex items-center justify-center rounded-full p-2 transition hover:bg-black/5" aria-label="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} style={{ color: NAVY.inkSoft }} />
            </button>
          </div>
        </header>

        <div className={`min-h-0 flex-1 overflow-y-auto p-4 transition-shadow duration-700 ${flash ? "ring-2 ring-inset" : ""}`} style={flash ? { boxShadow: `inset 0 0 0 2px ${NAVY.teal}` } : undefined}>
          {/* first-load skeleton */}
          {loading && !hasLoadedOnce ? (
            <DashboardSkeleton />
          ) : (
          <>
          {/* KPI row */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-2xl border p-3.5 shadow-sm" style={{ borderColor: NAVY.line, background: NAVY.panel }}>
                <div className="flex items-start gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: k.color }}>{k.icon}</span>
                  <span className="text-[11px] font-semibold leading-tight" style={{ color: NAVY.inkSoft }}>{k.label}</span>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-[26px] font-extrabold leading-none" style={{ fontFamily: NAVY.headingFont }}>{k.value}</span>
                  {k.band && <span className="mb-0.5 text-[11px] font-bold" style={{ color: qualityBand(k.band === "Good" ? 80 : k.band === "Moderate" ? 60 : 40).color }}>{k.band}</span>}
                </div>
                <div className="mt-1 text-[11px]" style={{ color: NAVY.inkSoft }}>{k.sub}</div>
                <Sparkline color={k.color} series={trend} />
              </div>
            ))}
          </div>

          {/* charts row 1 */}
          <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
            <Panel title="Implementation Coverage by LGA" className="xl:col-span-2">
              {coverageData.length ? (
                <HBar data={coverageData} color={NAVY.teal} suffix=" submissions" />
              ) : (
                <Empty loading={loading} label="No submissions to map yet." />
              )}
            </Panel>
            <Panel title="Quality vs Completion (by LGA)" className="xl:col-span-2">
              {scatter.length ? (
                <ResponsiveContainer width="100%" height={230}>
                  <ScatterChart margin={{ top: 8, right: 8, bottom: 16, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={NAVY.line} />
                    <XAxis type="number" dataKey="x" name="Completion" domain={[0, 100]} tick={{ fontSize: 10, fill: NAVY.inkSoft }} label={{ value: "Activity Completion (%)", position: "bottom", fontSize: 10, fill: NAVY.inkSoft }} />
                    <YAxis type="number" dataKey="y" name="Quality" domain={[0, 100]} tick={{ fontSize: 10, fill: NAVY.inkSoft }} />
                    <ZAxis type="number" dataKey="z" range={[40, 200]} />
                    <ReferenceLine x={50} stroke={NAVY.line} /><ReferenceLine y={50} stroke={NAVY.line} />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v: any, n: any) => [`${v}%`, n]} labelFormatter={() => ""} />
                    <Scatter data={scatter} fill={NAVY.teal} fillOpacity={0.7} />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <Empty loading={loading} label="Quality scores appear once Section M is submitted." />
              )}
            </Panel>
            <Panel title="Critical Alerts" badge={String(agg.pendingCritical || 0)}>
              <ul className="space-y-2.5">
                <Alert color={NAVY.bad} title={`${agg.pendingCritical || 0} non-compliance cases pending`} sub="Require immediate attention" />
                <Alert color={NAVY.warn} title={`${lowQualityLgas} LGA(s) with low quality`} sub="Quality below 50%" />
                <Alert color={NAVY.warn} title={`${agg.overdue} overdue action point(s)`} sub="Past due date, not completed" />
                <Alert color={NAVY.primary} title={`${agg.dataQualityIssues} data quality issue(s)`} sub={`${agg.n} records reviewed`} />
              </ul>
            </Panel>
          </div>

          {/* funnels row */}
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <Panel title="Non-Compliance Resolution Funnel">
              <Funnel steps={[
                { label: "Cases Identified", value: agg.casesId },
                { label: "Cases Resolved", value: agg.casesResolved },
                { label: "Cases Pending", value: agg.casesPending },
              ]} colorFrom="#F59E0B" colorTo="#B45309" footer={`Resolution rate: ${agg.resRate}%`} />
            </Panel>
            <Panel title="Stakeholder Advocacy Funnel">
              <Funnel steps={[
                { label: "Advocacy Conducted", value: yesCount("advocacy_conducted") },
                { label: "Right Decision-Maker", value: yesCount("right_decision_maker") },
                { label: "Commitments Recorded", value: yesCount("commitments_recorded") },
                { label: "Responsibilities Assigned", value: yesCount("responsibilities_assigned") },
                { label: "Commitment Acted Upon", value: yesCount("commitment_acted") },
              ]} colorFrom="#A78BFA" colorTo="#6D28D9" footer={`Advocacy quality: ${qualPct(["right_decision_maker", "commitments_recorded", "responsibilities_assigned", "followup_agreed"])}%`} />
            </Panel>
          </div>

          {/* analysis row */}
          <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <Panel title="Top Bottlenecks (Section J)">
              {breakdown("challenge_category").length
                ? <HBar data={breakdown("challenge_category")} color={NAVY.primary} />
                : <Empty loading={loading} label="No challenge data submitted yet." />}
            </Panel>
            <Panel title="Non-Compliance Root Causes (Section F)">
              {breakdown("main_reason").length
                ? <HBar data={breakdown("main_reason")} color={NAVY.violet} />
                : <Empty loading={loading} label="No non-compliance cases submitted yet." />}
            </Panel>
            <Panel title="Learning to Action Funnel">
              <Funnel steps={[
                { label: "Lessons Captured", value: filtered.filter((r) => str(r, "most_important_lesson")).length },
                { label: "Evidence-Based", value: filtered.filter((r) => /evidence/i.test(str(r, "lesson_type"))).length },
                { label: "Actionable", value: yesCount("lesson_actionable") },
                { label: "Action Points Defined", value: filtered.filter((r) => str(r, "action_point")).length },
                { label: "Actions Completed", value: filtered.filter((r) => /complete/i.test(str(r, "action_status"))).length },
              ]} colorFrom={NAVY.teal} colorTo={NAVY.tealDeep} footer={`Learning quality: ${qualPct(["lesson_actionable"])}%`} />
            </Panel>
          </div>

          {/* open-ended text response analysis */}
          <div className="mt-4">
            <Panel title="Open-Ended Response Analysis">
              {textAnalysis.length ? (
                <>
                  <p className="mb-3 text-[11px]" style={{ color: NAVY.inkSoft }}>
                    Thematic summary of every free-text question — key terms are the most frequent
                    words across supervisor narratives, drawn entirely from live submissions.
                  </p>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {textAnalysis.map((t) => {
                      const maxK = Math.max(1, ...t.keywords.map((k) => k.count));
                      return (
                        <div key={t.id} className="rounded-xl border p-3" style={{ borderColor: NAVY.line, background: NAVY.canvas }}>
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: NAVY.teal }}>
                              <MessageCircle className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[12px] font-bold leading-snug" style={{ color: NAVY.ink }}>{t.label}</div>
                              <div className="text-[10.5px] font-semibold" style={{ color: NAVY.inkSoft }}>{t.count} response{t.count === 1 ? "" : "s"}</div>
                            </div>
                          </div>
                          {t.keywords.length > 0 && (
                            <div className="mt-2.5 space-y-1">
                              {t.keywords.map((k) => (
                                <div key={k.term} className="flex items-center gap-2">
                                  <span className="w-24 shrink-0 truncate text-[11px] font-medium" style={{ color: NAVY.ink }}>{k.term}</span>
                                  <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: NAVY.line }}>
                                    <div className="h-full rounded-full" style={{ width: `${(k.count / maxK) * 100}%`, background: NAVY.violet }} />
                                  </div>
                                  <span className="w-6 shrink-0 text-right text-[10.5px] font-bold" style={{ color: NAVY.inkSoft }}>{k.count}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {t.samples.length > 0 && (
                            <div className="mt-2.5 space-y-1 border-t pt-2" style={{ borderColor: NAVY.line }}>
                              {t.samples.map((s, i) => (
                                <p key={i} className="line-clamp-2 text-[11px] italic" style={{ color: NAVY.inkSoft }}>“{s}”</p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <Empty loading={loading} label="Free-text narratives will be analysed here as supervisors submit them." />
              )}
            </Panel>
          </div>


          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <Panel title="Supervision Submissions" className="lg:col-span-2">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left" style={{ color: NAVY.inkSoft }}>
                      <th className="p-2 font-semibold">Date</th>
                      <th className="p-2 font-semibold">Supervisor</th>
                      <th className="p-2 font-semibold">Module</th>
                      <th className="p-2 font-semibold">LGA</th>
                      <th className="p-2 font-semibold">Ward</th>
                      <th className="p-2 text-right font-semibold">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 40).map((r) => {
                      const score = num(r, "total_score");
                      return (
                        <tr key={r.id} className="border-t" style={{ borderColor: NAVY.line }}>
                          <td className="whitespace-nowrap p-2" style={{ color: NAVY.inkSoft }}>{new Date(r.submitted_at || r.created_at).toLocaleDateString()}</td>
                          <td className="p-2 font-medium">{(r.user_id && profiles[r.user_id]) || "—"}</td>
                          <td className="max-w-[150px] truncate p-2">{meta(r, "__section_label") || "—"}</td>
                          <td className="p-2">{str(r, "lga") || "—"}</td>
                          <td className="max-w-[140px] truncate p-2">{str(r, "ward") || "—"}</td>
                          <td className="p-2 text-right">{score > 0 ? <span className="rounded-full px-2 py-0.5 font-bold text-white" style={{ background: qualityBand((score / 80) * 100).color }}>{score}</span> : "—"}</td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center" style={{ color: NAVY.inkSoft }}>{loading ? "Loading submissions…" : "No supervision submissions recorded yet."}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
            <Panel title="MOV Data Quality (Section H)">
              {movDist.total ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={movDist.data} dataKey="value" innerRadius={48} outerRadius={78} paddingAngle={2}>
                        <Cell fill={NAVY.good} /><Cell fill={NAVY.gold} /><Cell fill={NAVY.bad} />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-1 flex flex-wrap justify-center gap-3 text-[11px]" style={{ color: NAVY.inkSoft }}>
                    <Legend color={NAVY.good} label={`Good (${Math.round((movDist.data[0].value / movDist.total) * 100)}%)`} />
                    <Legend color={NAVY.gold} label={`Fair (${Math.round((movDist.data[1].value / movDist.total) * 100)}%)`} />
                    <Legend color={NAVY.bad} label={`Poor (${Math.round((movDist.data[2].value / movDist.total) * 100)}%)`} />
                  </div>
                </>
              ) : (
                <Empty loading={loading} label="MOV ratings appear once Section H is submitted." />
              )}
            </Panel>
          </div>

          <div className="py-4 text-center text-[11px]" style={{ color: NAVY.inkSoft }}>
            SARMAAN Programme · Integrated Supervisory Checklist & Learning Dashboard · {agg.n} live submissions
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function timeAgo(ts: number): string {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function LiveIndicator({ live, lastUpdated, flash }: { live: boolean; lastUpdated: number; flash: boolean }) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition"
      style={{
        borderColor: live ? "rgba(16,185,129,0.35)" : NAVY.line,
        background: live ? "rgba(16,185,129,0.10)" : "transparent",
        color: live ? NAVY.good : NAVY.inkSoft,
      }}
      title={live ? "Realtime connected — updates apply instantly" : "Connecting to realtime…"}
    >
      <span className="relative flex h-2 w-2">
        {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: NAVY.good }} />}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: live ? NAVY.good : NAVY.inkSoft }} />
      </span>
      <span>{live ? "Live" : "Offline"}</span>
      <span className="font-medium normal-case tracking-normal" style={{ color: NAVY.inkSoft }}>· {flash ? "updating…" : timeAgo(lastUpdated)}</span>
    </div>
  );
}

function SkeletonBlock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse rounded-lg ${className ?? ""}`} style={{ background: "rgba(15,23,42,0.06)", ...style }} />;
}

function DashboardSkeleton() {
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl border p-3.5 shadow-sm" style={{ borderColor: NAVY.line, background: NAVY.panel }}>
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-8 w-8" />
              <SkeletonBlock className="h-3 flex-1" />
            </div>
            <SkeletonBlock className="mt-3 h-7 w-2/3" />
            <SkeletonBlock className="mt-2 h-2 w-1/2" />
            <SkeletonBlock className="mt-3 h-6 w-full" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
        <SkeletonBlock className="h-[260px] xl:col-span-2" />
        <SkeletonBlock className="h-[260px] xl:col-span-2" />
        <SkeletonBlock className="h-[260px]" />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <SkeletonBlock className="h-[220px]" />
        <SkeletonBlock className="h-[220px]" />
      </div>
      <p className="mt-6 text-center text-xs" style={{ color: NAVY.inkSoft }}>Loading live SARMAAN submissions…</p>
    </div>
  );
}



function Empty({ loading, label }: { loading: boolean; label: string }) {
  return <p className="flex h-[180px] items-center justify-center text-center text-xs" style={{ color: NAVY.inkSoft }}>{loading ? "Loading…" : label}</p>;
}

function Panel({ title, badge, className, children }: { title: string; badge?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${className ?? ""}`} style={{ borderColor: NAVY.line, background: NAVY.panel }}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[13px] font-bold" style={{ fontFamily: NAVY.headingFont, color: NAVY.ink }}>{title}</h3>
        <Info className="h-3.5 w-3.5" style={{ color: NAVY.inkSoft, opacity: 0.6 }} />
        {badge && <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white" style={{ background: NAVY.bad }}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function Sparkline({ color, series }: { color: string; series: number[] }) {
  const max = Math.max(1, ...series);
  const pts = series.map((v, i) => `${(i / Math.max(1, series.length - 1)) * 100},${28 - (v / max) * 24}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-2 h-6 w-full">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

function Alert({ color, title, sub }: { color: string; title: string; sub: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold leading-snug">{title}</div>
        <div className="text-[11px]" style={{ color: NAVY.inkSoft }}>{sub}</div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: NAVY.inkSoft, opacity: 0.5 }} />
    </li>
  );
}

function Funnel({ steps, colorFrom, colorTo, footer }: { steps: { label: string; value: number }[]; colorFrom: string; colorTo: string; footer: string }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  const allZero = steps.every((s) => !s.value);
  if (allZero) return <Empty loading={false} label="No data submitted for this funnel yet." />;
  return (
    <div>
      <div className="space-y-1.5">
        {steps.map((s, i) => {
          const w = 40 + (s.value / max) * 60;
          const t = i / Math.max(1, steps.length - 1);
          const color = mix(colorFrom, colorTo, t);
          const pct = i === 0 ? 100 : Math.round((s.value / (steps[0].value || 1)) * 100) || 0;
          return (
            <div key={s.label} className="flex items-center gap-2">
              <div className="mx-auto flex h-9 items-center justify-between rounded-md px-3 text-[12px] font-semibold text-white" style={{ width: `${w}%`, background: color }}>
                <span className="truncate">{s.label}</span>
              </div>
              <span className="w-14 shrink-0 text-right text-[12px] font-bold">{s.value.toLocaleString()}</span>
              <span className="w-10 shrink-0 text-right text-[11px]" style={{ color: NAVY.inkSoft }}>{pct}%</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-[11px] font-semibold" style={{ color: NAVY.warn }}>{footer}</div>
    </div>
  );
}

function HBar({ data, color, suffix }: { data: { name: string; value: number }[]; color: string; suffix?: string }) {
  if (!data.length) return <p className="py-8 text-center text-xs" style={{ color: NAVY.inkSoft }}>No data yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={NAVY.line} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: NAVY.inkSoft }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: NAVY.inkSoft }} />
        <Tooltip formatter={(v: any) => [`${v}${suffix ?? ""}`, "Count"]} />
        <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /> {label}</span>;
}

function mix(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
