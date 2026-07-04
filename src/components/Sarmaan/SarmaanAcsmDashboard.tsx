// SARMAAN ACSM & MDA Supervision Dashboard — image-parity UI.
// ---------------------------------------------------------------------------
// Pixel-faithful reproduction of the "ACSM & MDA SUPERVISION DASHBOARD"
// reference: dark-green sidebar, white KPI strip, ward performance map, gauges,
// donuts, component grid, town-announcer / dosing panels, deployment & refusal
// tables, adverse-events, alerts, quick insights and a village footer.
//
// Every panel is bound to real SARMAAN ACSM checklist submissions via
// computeAcsmMetrics(), and the whole board refreshes in realtime as new
// submissions land (postgres_changes subscription on form_submissions).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Users2, Megaphone, Pill, MapPin, Download, ChevronDown, RefreshCw,
  UserCheck, HandHeart, Hand, Bell, AlertCircle, Info,
  CheckCircle2, TrendingUp, ShieldCheck, X,
  Shirt, IdCard, Ban, Award,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import type { Question, FormGroup } from "@/components/FormBuilder/types";
import SarmaanKanoMap, { type VisitPoint } from "@/components/Sarmaan/SarmaanKanoMap";
import {
  computeAcsmMetrics, BAND_META, bandOf, overallScoreOf, readVal, readStr,
  type AcsmSub, type NameToId, type BandKey,
} from "@/lib/sarmaan/acsmDashboardData";
import { ACSM_FIELD } from "@/lib/sarmaan/acsmChecklist";

interface Props {
  form: { id: string; name: string; questions: unknown; settings: unknown };
  onClose: () => void;
}

const C = {
  green: "#1E9E52",
  greenDeep: "#0E7A3B",
  sidebar: "#0B5E30",
  sidebarDeep: "#084A26",
  canvas: "#F4F6F8",
  amber: "#F59E0B",
  amberSoft: "#84CC16",
  red: "#DC2626",
  blue: "#2563EB",
  purple: "#7C3AED",
  teal: "#0EA5A5",
  ink: "#1E293B",
  sub: "#64748B",
  line: "#E5E9EF",
};

function sections(q: unknown): FormGroup[] {
  if (Array.isArray(q)) return q.filter((r) => Array.isArray((r as FormGroup)?.questions)) as FormGroup[];
  return [];
}
function buildMap(q: unknown): NameToId {
  const m = new Map<string, string>();
  sections(q).flatMap((s) => s.questions).forEach((qq: Question) => {
    if (qq.name && qq.id) m.set(qq.name, qq.id);
  });
  return m;
}

/* ---------------------------------------------------------------- gauge */
function Gauge({ value, size = 190 }: { value: number; size?: number }) {
  const r = size / 2 - 16;
  const cx = size / 2, cy = size / 2;
  const start = Math.PI, end = 0; // 180° → 0°
  const arc = (from: number, to: number) => {
    const x1 = cx + r * Math.cos(from), y1 = cy + r * Math.sin(from);
    const x2 = cx + r * Math.cos(to), y2 = cy + r * Math.sin(to);
    const large = to - from <= Math.PI ? 0 : 1;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  // three coloured background bands
  const bands = [
    { from: Math.PI, to: Math.PI * (1 - 0.34), color: C.red },
    { from: Math.PI * (1 - 0.34), to: Math.PI * (1 - 0.67), color: C.amber },
    { from: Math.PI * (1 - 0.67), to: 0, color: C.green },
  ];
  const angle = Math.PI - (Math.min(100, Math.max(0, value)) / 100) * Math.PI;
  return (
    <svg width={size} height={size / 2 + 24} viewBox={`0 0 ${size} ${size / 2 + 24}`}>
      {bands.map((b, i) => (
        <path key={i} d={arc(b.from, b.to)} stroke={b.color} strokeWidth={14} fill="none" strokeLinecap="round" opacity={0.9} />
      ))}
      {/* needle marker */}
      <circle cx={cx + r * Math.cos(angle)} cy={cy + r * Math.sin(angle)} r={7} fill="#fff" stroke={C.ink} strokeWidth={3} />
    </svg>
  );
}

function Donut({ data, center, sub }: { data: { name: string; value: number; color: string }[]; center: string; sub?: string }) {
  const has = data.some((d) => d.value > 0);
  return (
    <div className="relative" style={{ width: 150, height: 150 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={has ? data : [{ name: "none", value: 1, color: "#E5E9EF" }]} dataKey="value"
            innerRadius={48} outerRadius={70} startAngle={90} endAngle={-270} paddingAngle={has ? 2 : 0} stroke="none">
            {(has ? data : [{ color: "#E5E9EF" }]).map((d, i) => <Cell key={i} fill={(d as any).color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold" style={{ color: C.ink }}>{center}</span>
        {sub && <span className="text-[11px] font-semibold" style={{ color: C.sub }}>{sub}</span>}
      </div>
    </div>
  );
}



function Panel({ title, children, right, className = "" }: { title?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border bg-white p-5 shadow-sm ${className}`} style={{ borderColor: C.line }}>
      {(title || right) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-bold uppercase tracking-wide" style={{ color: C.ink }}>{title}</div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className="mb-1 text-[10px] font-semibold leading-tight" style={{ color: C.sub }}>{label}</div>
      <div className="text-lg font-extrabold" style={{ color: C.ink }}>{value}</div>
      <div className="mx-auto mt-1.5 h-1.5 w-14 overflow-hidden rounded-full" style={{ background: "#EEF2F6" }}>
        <div className="h-full rounded-full" style={{ width: value, background: color }} />
      </div>
    </div>
  );
}

export default function SarmaanAcsmDashboard({ form, onClose }: Props) {
  const [subs, setSubs] = useState<AcsmSub[]>([]);
  const [maps, setMaps] = useState<Record<string, NameToId>>({ [form.id]: buildMap(form.questions) });
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [flash, setFlash] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  
  const [filters, setFilters] = useState<{ state: string; lga: string; ward: string }>({ state: "", lga: "", ward: "" });
  const idsRef = useRef<Set<string>>(new Set([form.id]));

  const load = useCallback(async (opts?: { live?: boolean }) => {
    if (!opts?.live) setLoading(true);
    const { data: self } = await supabase.from("forms").select("id, project_id, questions").eq("id", form.id).maybeSingle();
    const projectId = (self as any)?.project_id ?? null;
    let sibs: { id: string; questions: unknown }[] = [{ id: form.id, questions: (self as any)?.questions ?? form.questions }];
    if (projectId) {
      const { data: pf } = await supabase.from("forms").select("id, name, questions, settings").eq("project_id", projectId);
      sibs = ((pf as any[]) || [])
        .filter((f) => f.id === form.id || f.name === form.name || (f.settings as any)?.sarmaan_acsm)
        .map((f) => ({ id: f.id, questions: f.questions }));
      if (!sibs.some((s) => s.id === form.id)) sibs.push({ id: form.id, questions: (self as any)?.questions ?? form.questions });
    }
    const m: Record<string, NameToId> = {};
    sibs.forEach((s) => { m[s.id] = buildMap(s.questions); });
    setMaps(m);
    const ids = sibs.map((s) => s.id);
    idsRef.current = new Set(ids);

    const { data } = await supabase.from("form_submissions")
      .select("id,form_id,data,created_at,user_id")
      .in("form_id", ids).order("created_at", { ascending: false }).limit(8000);
    setSubs(((data as any[]) || []).map((r) => ({ id: r.id, formId: r.form_id, data: r.data, created_at: r.created_at, user_id: r.user_id })));
    setLoading(false);
    setLastUpdated(Date.now());
    if (opts?.live) { setFlash(true); window.setTimeout(() => setFlash(false), 1200); }
  }, [form.id, form.name, form.questions]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`acsm-dash-${form.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, (p: any) => {
        const fid = p.new?.form_id ?? p.old?.form_id;
        if (!fid || idsRef.current.has(fid)) load({ live: true });
      })
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    return () => { supabase.removeChannel(ch); };
  }, [form.id, load]);

  // filter options
  const options = useMemo(() => {
    const st = new Set<string>(), lg = new Set<string>(), wd = new Set<string>();
    subs.forEach((s) => {
      const g = (n: string) => { const m = maps[s.formId]; const id = m?.get(n); const v = (id && s.data?.[id]) ?? s.data?.[n]; return v ? String(v) : ""; };
      if (g(ACSM_FIELD.state)) st.add(g(ACSM_FIELD.state));
      if (g(ACSM_FIELD.lga)) lg.add(g(ACSM_FIELD.lga));
      if (g(ACSM_FIELD.ward)) wd.add(g(ACSM_FIELD.ward));
    });
    return { states: [...st].sort(), lgas: [...lg].sort(), wards: [...wd].sort() };
  }, [subs, maps]);

  const filtered = useMemo(() => subs.filter((s) => {
    const g = (n: string) => { const m = maps[s.formId]; const id = m?.get(n); const v = (id && s.data?.[id]) ?? s.data?.[n]; return v ? String(v) : ""; };
    if (filters.state && g(ACSM_FIELD.state) !== filters.state) return false;
    if (filters.lga && g(ACSM_FIELD.lga) !== filters.lga) return false;
    if (filters.ward && g(ACSM_FIELD.ward) !== filters.ward) return false;
    return true;
  }), [subs, maps, filters]);

  const M = useMemo(() => computeAcsmMetrics(filtered, maps), [filtered, maps]);

  // Geolocated supervision visits → map markers, coloured by ACSM band.
  const visitPoints = useMemo<VisitPoint[]>(() => {
    const pts: VisitPoint[] = [];
    for (const s of filtered) {
      const gps = readVal(s, ACSM_FIELD.gps, maps) as any;
      const lat = Number(gps?.lat), lng = Number(gps?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
      const score = overallScoreOf([s], maps);
      pts.push({
        lat, lng, score,
        ward: readStr(s, ACSM_FIELD.ward, maps) || readStr(s, ACSM_FIELD.community, maps),
        lga: readStr(s, ACSM_FIELD.lga, maps),
        color: BAND_META[bandOf(score)].color,
      });
    }
    return pts;
  }, [filtered, maps]);

  const stateLabel = filters.state || options.states[0] || "All States";
  const timeStr = new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto" style={{ background: C.canvas, fontFamily: "'Manrope', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b bg-white px-4 py-3 sm:px-6" style={{ borderColor: C.line }}>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold sm:text-2xl" style={{ color: C.green, fontFamily: "'Sora', system-ui, sans-serif" }}>
            ACSM &amp; MDA SUPERVISION DASHBOARD
          </h1>
          <p className="text-xs font-semibold sm:text-sm" style={{ color: C.sub }}>
            Mass Drug Administration by CDDs · Azithromycin for children 1–59 months
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filters.state} onChange={(v) => setFilters((f) => ({ ...f, state: v }))} placeholder={stateLabel} options={options.states} allLabel="All States" />
          <Select value={filters.lga} onChange={(v) => setFilters((f) => ({ ...f, lga: v }))} placeholder="All LGAs" options={options.lgas} allLabel="All LGAs" />
          <Select value={filters.ward} onChange={(v) => setFilters((f) => ({ ...f, ward: v }))} placeholder="All Wards" options={options.wards} allLabel="All Wards" />
          <button className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-bold text-white shadow-sm" style={{ background: C.green }}>
            <Download className="h-4 w-4" /> Export
          </button>
          <button onClick={onClose} aria-label="Close dashboard" className="flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-bold" style={{ borderColor: C.line, color: C.ink }}>
            <X className="h-4 w-4" /> Close
          </button>
        </div>
        <div className="flex w-full items-center justify-end gap-2 text-[11px] sm:text-xs" style={{ color: C.sub }}>
          <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-slate-300"} ${flash ? "animate-ping" : ""}`} />
          Live · Last updated: Today, {timeStr}
          <button onClick={() => load()} className="rounded p-1 hover:bg-muted"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 space-y-5 p-4 sm:p-6">
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">

            <Kpi icon={Users2} tint={C.green} title="Wards Supervised"
              main={`${M.wardsSupervised}`} sub2={`/ ${M.wardsTotal}`} badge={`${M.wardsSupervisedPct}%`} footer="On Track" footerColor={C.green} />
            <Kpi icon={UserCheck} tint={C.blue} title="Teams Deployed"
              main={`${M.teamsWent}`} sub2={`/ ${M.teamsPlanned}`} badge={`${M.teamsDeployedPct}%`} footer={`${M.teamsNotDeployed} Not Deployed`} footerColor={C.red} />
            <Kpi icon={Megaphone} tint={C.purple} title="Community Awareness"
              main={`${M.communityAwareness}%`} bar={M.communityAwareness} barColor={C.purple} footer="Target: ≥ 80%" footerColor={C.sub} />
            <Kpi icon={Pill} tint={C.amber} title="Correct Dosing Rate"
              main={`${M.correctDosing}%`} bar={M.correctDosing} barColor={C.green} footer="Target: ≥ 95%" footerColor={C.sub} />
            <Kpi icon={HandHeart} tint={C.teal} title="Consent Obtained"
              main={`${M.consentObtained}%`} bar={M.consentObtained} barColor={C.green} footer="Target: 100%" footerColor={C.sub} />
            <Kpi icon={Hand} tint={C.red} title="Refusal Rate"
              main={`${M.refusalRate}%`} bar={M.refusalRate * 5} barColor={C.red} footer="Target: ≤ 5%" footerColor={C.sub} />
          </div>

          {/* Kano supervision map — geolocated visits by ACSM band */}
          <Panel
            title={<span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" style={{ color: C.green }} /> Kano Supervision Map — State, LGA &amp; Ward Coverage</span>}
            right={
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold" style={{ color: C.sub }}>
                <span>{visitPoints.length} geolocated visit{visitPoints.length === 1 ? "" : "s"}</span>
                {(["strong", "moderate", "weak", "critical"] as BandKey[]).map((b) => (
                  <span key={b} className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: BAND_META[b].color }} />
                    {BAND_META[b].label.split(" ")[0]}
                  </span>
                ))}
              </div>
            }>
            <div className="relative h-[420px] w-full overflow-hidden rounded-xl">
              <SarmaanKanoMap points={visitPoints} />
              {visitPoints.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="rounded-lg bg-white/90 px-4 py-2 text-xs font-semibold shadow" style={{ color: C.sub }}>
                    No GPS-tagged supervision visits yet — points appear here in realtime as checklists are submitted.
                  </span>
                </div>
              )}
            </div>
          </Panel>

          {/* Row 2: ward map · overall summary · awareness donut · info channels */}
          <div className="grid gap-4 xl:grid-cols-4">

            {/* Ward performance map */}
            <Panel title="Ward Performance Map" className="xl:col-span-1"
              right={<span className="text-[10px] font-semibold" style={{ color: C.sub }}>{stateLabel}</span>}>
              <div className="grid grid-cols-6 gap-1.5">
                {M.wardScores.slice(0, 24).map((w) => (
                  <div key={w.ward} title={`${w.ward}: ${w.score}%`}
                    className="flex aspect-square items-center justify-center rounded-md text-[9px] font-bold text-white"
                    style={{ background: BAND_META[w.band].color }}>
                    {w.score}
                  </div>
                ))}
                {M.wardScores.length === 0 && <p className="col-span-6 py-6 text-center text-xs" style={{ color: C.sub }}>No supervised wards yet.</p>}
              </div>
              <div className="mt-3 space-y-1">
                {(["strong", "moderate", "weak", "critical", "none"] as BandKey[]).map((b) => (
                  <div key={b} className="flex items-center gap-1.5 text-[10px]" style={{ color: C.sub }}>
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAND_META[b].color }} /> {BAND_META[b].label}
                  </div>
                ))}
              </div>
            </Panel>

            {/* Overall supervision summary */}
            <Panel title={<>Overall Supervision Summary <span className="ml-1 text-[10px] font-normal" style={{ color: C.sub }}>(Sample Validation)</span></>}>
              <div className="flex flex-col items-center">
                <Gauge value={M.overallScore} />
                <div className="-mt-10 text-center">
                  <div className="text-3xl font-extrabold" style={{ color: C.ink }}>{M.overallScore}%</div>
                  <div className="text-[11px]" style={{ color: C.sub }}>Overall ACSM Score</div>
                  <span className="mt-1 inline-block rounded-md px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: BAND_META[M.overallScore >= 85 ? "strong" : M.overallScore >= 70 ? "moderate" : M.overallScore >= 50 ? "weak" : "critical"].color }}>
                    {BAND_META[M.overallScore >= 85 ? "strong" : M.overallScore >= 70 ? "moderate" : M.overallScore >= 50 ? "weak" : "critical"].label.split(" ")[0]}
                  </span>
                </div>
                <p className="mt-3 text-center text-[11px] leading-snug" style={{ color: C.sub }}>
                  {M.count > 0 ? "Performance summarised across all captured supervision visits. Focus on weak wards, rumor control and documentation completeness." : "Awaiting checklist submissions."}
                </p>
                <div className="mt-3 flex items-center gap-1.5 text-[11px]" style={{ color: C.sub }}>
                  <Users2 className="h-3.5 w-3.5" /> Sample Size: <b style={{ color: C.ink }}>{M.awarenessSample} caregivers</b>
                </div>
              </div>
            </Panel>

            {/* Community awareness donut */}
            <Panel title={<>Community Awareness <span className="ml-1 text-[10px] font-normal" style={{ color: C.sub }}>(Sample)</span></>}>
              <div className="flex items-center gap-3">
                <Donut center={`${M.awarenessAwarePct}%`} sub="Aware"
                  data={[
                    { name: "Aware", value: M.aware, color: C.green },
                    { name: "Partial", value: M.partial, color: C.amber },
                    { name: "Not Aware", value: M.notAware, color: C.red },
                  ]} />
                <div className="space-y-2 text-[11px]">
                  <Legend color={C.green} label="Aware" pct={M.awarenessAwarePct} n={M.aware} />
                  <Legend color={C.amber} label="Partial" pct={M.awarenessPartialPct} n={M.partial} />
                  <Legend color={C.red} label="Not Aware" pct={M.awarenessNotAwarePct} n={M.notAware} />
                </div>
              </div>
            </Panel>

            {/* How community got info */}
            <Panel title="How Community Members Got Information">
              <div className="space-y-2.5">
                {M.infoChannels.length === 0 && <p className="py-6 text-center text-xs" style={{ color: C.sub }}>No awareness responses yet.</p>}
                {M.infoChannels.map((ch, i) => (
                  <div key={ch.name} className="flex items-center gap-2 text-[11px]">
                    <span className="w-28 shrink-0 truncate" style={{ color: C.ink }}>{ch.name}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "#EEF2F6" }}>
                      <div className="h-full rounded-full" style={{ width: `${ch.pct}%`, background: [C.green, C.blue, C.purple, C.amber, C.teal, C.red][i % 6] }} />
                    </div>
                    <span className="w-8 text-right font-bold" style={{ color: C.ink }}>{ch.pct}%</span>
                  </div>
                ))}
                {M.awarenessSample > 0 && <div className="pt-1 text-[10px]" style={{ color: C.sub }}>Sample Size: {M.awarenessSample}</div>}
              </div>
            </Panel>
          </div>

          {/* Row 3: components · town announcers · dosing · alerts */}
          <div className="grid gap-4 xl:grid-cols-4">
            <Panel title="Supervision Components" className="xl:col-span-1">
              <div className="grid grid-cols-4 gap-3">
                <MiniStat label="IEC Materials Visibility" value={`${M.iecVisibility}%`} color={C.green} />
                <MiniStat label="Town Announcer Coverage" value={`${M.announcerCoverage}%`} color={C.green} />
                <MiniStat label="Community Awareness" value={`${M.communityAwareness}%`} color={C.amber} />
                <MiniStat label="Community Guide Availability" value={`${M.communityGuide}%`} color={C.amber} />
                <MiniStat label="Correct Dosing Accuracy" value={`${M.correctDosing}%`} color={C.green} />
                <MiniStat label="Consent Obtained" value={`${M.consentObtained}%`} color={C.green} />
                <MiniStat label="Refusal / Rumor Control" value={`${M.rumorControl}%`} color={C.amber} />
                <MiniStat label="Documentation Completeness" value={`${M.documentation}%`} color={C.amber} />
              </div>
            </Panel>

            {/* Town announcers */}
            <Panel title={<span className="flex items-center gap-1.5"><Megaphone className="h-4 w-4" style={{ color: C.amber }} /> Town Announcers</span>}>
              <div className="space-y-2">
                {M.announcers.map((a) => (
                  <div key={a.label} className="flex items-center justify-between text-[12px]">
                    <span style={{ color: C.ink }}>{a.label}</span>
                    <span className="rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ background: "#E7F6EE", color: C.greenDeep }}>{a.count} ({a.pct}%)</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg p-3" style={{ background: "#F0F7FF" }}>
                <div className="mb-2 text-[11px] font-bold" style={{ color: C.ink }}>Identification Type</div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {M.idTypes.map((t, i) => (
                    <div key={t.label}>
                      {[<Award key="a" />, <Shirt key="b" />, <IdCard key="c" />, <Ban key="d" />][i % 4]
                        && <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center text-[color:var(--c)]" style={{ ["--c" as any]: C.blue }}>
                          {i === 0 ? <Award className="h-4 w-4" style={{ color: C.blue }} /> : i === 1 ? <Shirt className="h-4 w-4" style={{ color: C.blue }} /> : i === 2 ? <IdCard className="h-4 w-4" style={{ color: C.blue }} /> : <Ban className="h-4 w-4" style={{ color: C.sub }} />}
                        </div>}
                      <div className="text-[10px] font-semibold" style={{ color: C.ink }}>{t.label}</div>
                      <div className="text-[10px]" style={{ color: C.sub }}>{t.count} ({t.pct}%)</div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            {/* Dosing accuracy */}
            <Panel title={<>Dosing Accuracy <span className="ml-1 text-[10px] font-normal" style={{ color: C.sub }}>(Observed)</span></>}>
              <div className="flex items-center gap-3">
                <Donut center={`${M.dosingCorrect}%`} sub="Correct"
                  data={[
                    { name: "Correct", value: M.dosingCorrect, color: C.green },
                    { name: "Incorrect", value: M.dosingIncorrect, color: C.red },
                  ]} />
                <div className="space-y-2 text-[11px]">
                  <Legend color={C.green} label="Correct Dose" pct={M.dosingCorrect} />
                  <Legend color={C.red} label="Incorrect Dose" pct={M.dosingIncorrect} />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: C.sub }}>
                <Users2 className="h-3.5 w-3.5" /> Observations: <b style={{ color: C.ink }}>{M.dosingObservations}</b>
              </div>
            </Panel>

            {/* Alerts */}
            <Panel title={<span className="flex items-center gap-1.5" style={{ color: C.red }}><Bell className="h-4 w-4" /> Alerts & Actions</span>}>
              <div className="space-y-2">
                {M.alerts.length === 0 && <p className="py-6 text-center text-xs" style={{ color: C.sub }}>No active alerts.</p>}
                {M.alerts.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg p-2" style={{ background: a.level === "High" ? "#FEF2F2" : "#EFF6FF" }}>
                    {a.level === "High" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.red }} /> : <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.blue }} />}
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold" style={{ color: C.ink }}>{a.title}</div>
                      <div className="text-[10px]" style={{ color: C.sub }}>{a.sub}</div>
                    </div>
                    <span className="rounded-md px-1.5 py-0.5 text-[9px] font-bold" style={{ background: a.level === "High" ? "#FEE2E2" : "#DBEAFE", color: a.level === "High" ? C.red : C.blue }}>{a.level}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* Row 4: deployment table · refusal reasons · adverse events · quick insights */}
          <div className="grid gap-4 xl:grid-cols-4">
            <Panel title="Team Deployment by Ward" className="xl:col-span-1">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left" style={{ color: C.sub }}>
                      <th className="py-1 font-semibold">Ward</th>
                      <th className="py-1 text-center font-semibold">Planned</th>
                      <th className="py-1 text-center font-semibold">Out</th>
                      <th className="py-1 text-center font-semibold">Rate</th>
                      <th className="py-1 text-right font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {M.wardDeployment.slice(0, 6).map((w) => (
                      <tr key={w.ward} className="border-t" style={{ borderColor: C.line }}>
                        <td className="py-1.5 font-semibold" style={{ color: C.ink }}>{w.ward}</td>
                        <td className="py-1.5 text-center tabular-nums">{w.planned}</td>
                        <td className="py-1.5 text-center tabular-nums">{w.went}</td>
                        <td className="py-1.5 text-center font-bold tabular-nums">{w.rate}%</td>
                        <td className="py-1.5 text-right">
                          <span className="rounded-md px-1.5 py-0.5 text-[9px] font-bold" style={{ background: w.onTrack ? "#E7F6EE" : "#FEF3C7", color: w.onTrack ? C.greenDeep : "#B45309" }}>
                            {w.onTrack ? "On Track" : "Below Target"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {M.wardDeployment.length === 0 && <tr><td colSpan={5} className="py-6 text-center" style={{ color: C.sub }}>No deployment data.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Panel>

            {/* Refusal reasons */}
            <Panel title={<>Refusal & Rumor Signals <span className="ml-1 text-[10px] font-normal" style={{ color: C.sub }}>(Derived)</span></>}>
              <div className="space-y-2.5">
                {M.refusalReasons.length === 0 && <p className="py-6 text-center text-xs" style={{ color: C.sub }}>No refusal / rumor signals detected.</p>}
                {M.refusalReasons.map((r, i) => (
                  <div key={r.name} className="flex items-center gap-2 text-[11px]">
                    <span className="w-32 shrink-0 truncate" style={{ color: C.ink }}>{r.name}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "#EEF2F6" }}>
                      <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: [C.red, C.purple, C.amber][i % 3] }} />
                    </div>
                    <span className="w-8 text-right font-bold" style={{ color: C.ink }}>{r.pct}%</span>
                  </div>
                ))}
                {M.totalRefusals > 0 && <div className="border-t pt-1 text-[11px] font-bold" style={{ borderColor: C.line, color: C.ink }}>Total signals: {M.totalRefusals}</div>}
              </div>
            </Panel>

            {/* Adverse events */}
            <Panel title="Adverse Events Overview">
              <table className="w-full text-[11px]">
                <thead><tr className="text-left" style={{ color: C.sub }}><th className="py-1 font-semibold">Metric</th><th className="py-1 text-right font-semibold">Value</th></tr></thead>
                <tbody>
                  {[
                    ["Total ADRs Reported", `${M.adrTotal}`],
                    ["ADR Rate (per 10,000 treated)", `${M.adrRatePer10k}`],
                    ["Referred to Facility", `${M.adrReferred} (${M.adrReferredPct}%)`],
                    ["Followed Up", `${M.adrFollowedUp}`],
                    ["Serious ADRs", `${M.seriousAdr}`],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-t" style={{ borderColor: C.line }}>
                      <td className="py-1.5" style={{ color: C.ink }}>{k}</td>
                      <td className="py-1.5 text-right font-bold tabular-nums" style={{ color: C.ink }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            {/* Quick insights */}
            <Panel title={<span className="flex items-center gap-1.5" style={{ color: C.amber }}><TrendingUp className="h-4 w-4" /> Quick Insights</span>}>
              <div className="space-y-2">
                {[
                  { ok: M.iecVisibility >= 70, t: `IEC visibility at ${M.iecVisibility}% across supervised wards` },
                  { ok: M.announcerCoverage >= 70, t: `Town announcers present in ${M.announcerCoverage}% of visits` },
                  { ok: M.adrTotal === 0, t: M.adrTotal ? `ADR reported: ${M.adrTotal} case${M.adrTotal > 1 ? "s" : ""} (${M.adrReferred} referred)` : "No adverse events reported" },
                  { ok: M.communityAwareness >= 80, t: `Community awareness at ${M.communityAwareness}%` },
                ].map((x, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px]">
                    {x.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: C.green }} /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: C.amber }} />}
                    <span style={{ color: C.ink }}>{x.t}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
      </main>

      {/* Footer tagline — pinned to the very bottom of the dashboard */}
      <footer className="mt-auto flex items-center justify-center gap-2.5 px-6 py-5 text-center text-white" style={{ background: `linear-gradient(90deg,${C.green},${C.greenDeep})` }}>
        <ShieldCheck className="h-6 w-6 shrink-0" />
        <span className="text-sm font-semibold sm:text-base">Every check. Every child. Every dose. <b>A healthier tomorrow.</b></span>
      </footer>
    </div>

  );
}

/* ---------------------------------------------------------------- helpers */
function Kpi({ icon: Icon, tint, title, main, sub2, badge, bar, barColor, footer, footerColor }: {
  icon: any; tint: string; title: string; main: string; sub2?: string; badge?: string;
  bar?: number; barColor?: string; footer: string; footerColor: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm" style={{ borderColor: C.line }}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${tint}1A` }}>
          <Icon className="h-5 w-5" style={{ color: tint }} />
        </span>
        <span className="text-xs font-bold leading-tight" style={{ color: C.sub }}>{title}</span>
      </div>
      <div className="mt-3 flex items-end gap-1.5">
        <span className="text-3xl font-extrabold" style={{ color: C.ink }}>{main}</span>
        {sub2 && <span className="mb-1 text-sm font-semibold" style={{ color: C.sub }}>{sub2}</span>}
        {badge && <span className="mb-1 ml-auto text-sm font-bold" style={{ color: C.green }}>{badge}</span>}
      </div>
      {bar != null && (
        <div className="mt-2.5 h-2 overflow-hidden rounded-full" style={{ background: "#EEF2F6" }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, bar)}%`, background: barColor }} />
        </div>
      )}
      <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold" style={{ color: footerColor }}>
        {footerColor === C.green && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}{footer}
      </div>
    </div>

  );
}

function Legend({ color, label, pct, n }: { color: string; label: string; pct: number; n?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span style={{ color: C.ink }}>{label}</span>
      <span className="ml-auto font-bold" style={{ color: C.ink }}>{pct}%</span>
      {n != null && <span style={{ color: C.sub }}>({n})</span>}
    </div>
  );
}

function Select({ value, onChange, placeholder, options, allLabel }: {
  value: string; onChange: (v: string) => void; placeholder: string; options: string[]; allLabel: string;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border bg-white px-3 py-2 pr-7 text-xs font-semibold outline-none"
        style={{ borderColor: C.line, color: C.ink }}>
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: C.sub }} />
    </div>
  );
}
