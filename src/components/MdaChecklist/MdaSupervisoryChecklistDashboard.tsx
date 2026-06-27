/**
 * Integrated MDA Supervisory Checklist Dashboard — v2 (Bloomberg-class)
 * ────────────────────────────────────────────────────────────────────────
 * A professional, decision-support dashboard built around the COMMUNITY
 * CHECKLIST module as the spine, with longitudinal linkage to the three
 * follow-up modules captured later against the same community:
 *   • Follow-up on MDA Completion
 *   • Follow-up on MDA Commodities / Communities
 *   • Follow-up on Adverse Reactions
 *
 * Every metric is computed strictly from REAL captured fields. The dashboard
 * adopts the visual language of the Bloomberg School Enrolment Validation
 * Dashboard: a navy report header, tinted KPI tiles, a longitudinal funnel,
 * follow-up outcome panels, a per-community linkage register and a coverage
 * map — all driven by a comprehensive, professional filter bar.
 */
import { useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList, CheckCircle2, Pill, AlertTriangle, Flag, Activity,
  MapPin, CalendarClock, Users2, Search, RotateCcw, Download, Filter,
  ArrowRight, ShieldCheck, Map as MapIcon, Building2, Layers, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { prepareMdaData, communityKey } from "@/lib/mda/dashboardData";
import {
  getMdaFollowUpGroupName, isMdaFollowUpGroup,
  MDA_FOLLOWUP_COMPLETION, MDA_FOLLOWUP_COMMODITIES, MDA_FOLLOWUP_ADVERSE,
} from "@/lib/mdaFollowUp";
import { exportMdaDashboard } from "@/lib/mda/dashboardExport";
import MdaSupervisoryMap from "./MdaSupervisoryMap";
import JigawaSupervisoryMap from "./JigawaSupervisoryMap";
import FctSupervisoryMap from "./FctSupervisoryMap";
import HouseholdCoverageSurveyMap from "./HouseholdCoverageSurveyMap";
import MdaAdvancedAnalyses from "./MdaAdvancedAnalyses";

// ───────────────────────── Types ─────────────────────────
interface QOption { id?: string; label: string; value: string; }
interface FormQuestion {
  id: string; name?: string; label?: string; type?: string;
  options?: QOption[]; questions?: FormQuestion[];
}
interface MdaSubmission {
  id: string; projectId?: string | null;
  state?: string | null; lga?: string | null; ward?: string | null;
  submitter?: string | null; submittedAt?: string | null; status?: string | null;
  location?: { latitude?: number; longitude?: number } | null;
  data?: Record<string, any>;
}
interface Props {
  submissions: MdaSubmission[];
  questions: FormQuestion[];
  formName?: string;
  projectName?: string;
  projectId?: string | null;
  /** When true, data is served from the offline cache. */
  offline?: boolean;
}

// ───────────────────────── Palette ─────────────────────────
const NAVY = "#0c2340";
const BLUE = "#2563eb";
const TEAL = "#14b8a6";
const EMERALD = "#10b981";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const PINK = "#ec4899";
const VIOLET = "#8b5cf6";
const SLATE = "#64748b";

// ───────────────────────── Helpers ─────────────────────────
const stripTags = (s?: string) => String(s || "").replace(/<[^>]*>/g, "").trim();
const norm = (v: any) => String(v ?? "").trim().toLowerCase();
const POSITIVE = new Set(["yes", "true", "1", "available", "present", "good", "done", "complete", "completed", "compliant", "adequate", "trained", "passed", "okay"]);
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const fmt = (n: number) => n.toLocaleString();

const FU_LABELS: Record<string, string> = {
  [MDA_FOLLOWUP_COMPLETION]: "Follow-up on MDA Completion",
  [MDA_FOLLOWUP_COMMODITIES]: "Follow-up on MDA Commodities/Communities",
  [MDA_FOLLOWUP_ADVERSE]: "Follow-up on Adverse Reactions",
};
const FU_TINTS: Record<string, string> = {
  [MDA_FOLLOWUP_COMPLETION]: EMERALD,
  [MDA_FOLLOWUP_COMMODITIES]: TEAL,
  [MDA_FOLLOWUP_ADVERSE]: AMBER,
};

function yesStat(subs: MdaSubmission[], field: string) {
  let yes = 0, total = 0;
  for (const s of subs) {
    const v = s.data?.[field];
    if (v === undefined || v === null || v === "") continue;
    total++;
    if (POSITIVE.has(norm(v))) yes++;
  }
  return { yes, total, pct: pct(yes, total) };
}

function pickGeo(s: MdaSubmission, kind: "state" | "lga" | "ward" | "community"): string {
  const d = s.data || {};
  if (kind === "state") return stripTags(s.state || d.state || d.state_name) || "";
  if (kind === "lga") return stripTags(s.lga || d.lga || d.LGA || d.local_government || d.local_government_area) || "";
  if (kind === "ward") return stripTags(s.ward || d.ward || d.ward_name) || "";
  return stripTags(d.community || d.community_name || d.settlement_name || d.settlement) || "";
}

// ───────────────────────── Small UI atoms ─────────────────────────
function Kpi({ icon: Icon, label, value, sub, tint, bar }: {
  icon: any; label: string; value: string | number; sub?: string; tint: string; bar?: number;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
      style={{ background: `linear-gradient(135deg, ${tint}0d, transparent 70%)` }}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: tint }} aria-hidden />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</span>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${tint}1a`, color: tint }}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 font-display text-2xl font-bold tracking-tight" style={{ color: tint }}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
      {typeof bar === "number" && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, bar)}%`, background: tint }} />
        </div>
      )}
    </div>
  );
}

function Donut({ data, centerLabel, centerValue, height = 180, inner = 56, outer = 80 }: {
  data: { name: string; value: number; color: string }[]; centerLabel?: string; centerValue?: string;
  height?: number; inner?: number; outer?: number;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={total ? data : [{ name: "—", value: 1, color: "#e5e7eb" }]} dataKey="value" innerRadius={inner} outerRadius={outer} paddingAngle={total ? 2 : 0} stroke="none">
            {(total ? data : [{ color: "#e5e7eb" }]).map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          {total > 0 && <RTooltip />}
        </PieChart>
      </ResponsiveContainer>
      {centerValue && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" style={{ height }}>
          <span className="font-display text-2xl font-bold text-foreground">{centerValue}</span>
          {centerLabel && <span className="text-[10px] text-muted-foreground">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

function BarRow({ label, value, pctVal, color }: { label: string; value: number; pctVal: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-40 shrink-0 truncate text-muted-foreground" title={label}>{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pctVal}%`, background: color }} />
      </div>
      <span className="w-16 shrink-0 text-right font-semibold text-foreground">{value} ({pctVal}%)</span>
    </div>
  );
}

function Tag({ text, tint }: { text: string; tint: string }) {
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${tint}1a`, color: tint }}>
      {text}
    </span>
  );
}

const ALL = "__all__";

// ───────────────────────── Main ─────────────────────────
export default function MdaSupervisoryChecklistDashboard({ submissions, questions, formName, projectName, projectId, offline }: Props) {
  // ── Filter state ──────────────────────────────────────────────
  const [fState, setFState] = useState(ALL);
  const [fLga, setFLga] = useState(ALL);
  const [fWard, setFWard] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);
  const [fModule, setFModule] = useState(ALL);
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  // Module → question-name set (for classifying follow-up submissions).
  const moduleQuestions = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const item of questions || []) {
      const isGroup = Array.isArray(item.questions) && !item.type;
      if (!isGroup || !isMdaFollowUpGroup(item as any)) continue;
      const canonical = getMdaFollowUpGroupName(item as any);
      if (!canonical) continue;
      const set = map[canonical] || (map[canonical] = new Set());
      for (const q of item.questions || []) if (q?.name) set.add(q.name);
    }
    return map;
  }, [questions]);

  const classifyFollowUp = useMemo(() => {
    const entries = Object.entries(moduleQuestions);
    return (s: MdaSubmission): string | null => {
      const keys = Object.keys(s.data || {});
      let best: string | null = null;
      let bestHits = 0;
      for (const [canonical, names] of entries) {
        const hits = keys.filter((k) => names.has(k)).length;
        if (hits > bestHits) { bestHits = hits; best = canonical; }
      }
      return best;
    };
  }, [moduleQuestions]);

  // ── Filter option lists (from full dataset, geography is cascading) ──
  const states = useMemo(
    () => Array.from(new Set(submissions.map((s) => pickGeo(s, "state")).filter(Boolean))).sort(),
    [submissions],
  );
  const lgas = useMemo(() => {
    const pool = fState === ALL ? submissions : submissions.filter((s) => pickGeo(s, "state") === fState);
    return Array.from(new Set(pool.map((s) => pickGeo(s, "lga")).filter(Boolean))).sort();
  }, [submissions, fState]);
  const wards = useMemo(() => {
    const pool = submissions.filter(
      (s) => (fState === ALL || pickGeo(s, "state") === fState) && (fLga === ALL || pickGeo(s, "lga") === fLga),
    );
    return Array.from(new Set(pool.map((s) => pickGeo(s, "ward")).filter(Boolean))).sort();
  }, [submissions, fState, fLga]);

  // ── Apply geography / status / date / search filters to raw rows ──
  const filtered = useMemo(() => {
    const q = norm(search);
    const fromTs = fFrom ? new Date(fFrom + "T00:00:00").getTime() : null;
    const toTs = fTo ? new Date(fTo + "T23:59:59").getTime() : null;
    return submissions.filter((s) => {
      if (fState !== ALL && pickGeo(s, "state") !== fState) return false;
      if (fLga !== ALL && pickGeo(s, "lga") !== fLga) return false;
      if (fWard !== ALL && pickGeo(s, "ward") !== fWard) return false;
      if (fStatus !== ALL && norm(s.status) !== fStatus) return false;
      if (fromTs || toTs) {
        const t = s.submittedAt ? new Date(s.submittedAt).getTime() : null;
        if (t === null) return false;
        if (fromTs && t < fromTs) return false;
        if (toTs && t > toTs) return false;
      }
      if (q) {
        const hay = [
          pickGeo(s, "community"), pickGeo(s, "ward"), pickGeo(s, "lga"), pickGeo(s, "state"),
          stripTags(s.submitter || s.data?.supervisor_name),
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [submissions, fState, fLga, fWard, fStatus, fFrom, fTo, search]);

  const prepared = useMemo(() => prepareMdaData(filtered, questions as any), [filtered, questions]);
  const checklist = prepared.checklist;
  const followUps = prepared.followUps;
  const total = checklist.length;

  const filtersActive =
    fState !== ALL || fLga !== ALL || fWard !== ALL || fStatus !== ALL || fModule !== ALL || !!fFrom || !!fTo || !!search;
  const resetFilters = () => {
    setFState(ALL); setFLga(ALL); setFWard(ALL); setFStatus(ALL); setFModule(ALL);
    setFFrom(""); setFTo(""); setSearch("");
  };

  // ── Follow-ups grouped by community + module ──────────────────
  const fuByCommunity = useMemo(() => {
    const map = new Map<string, Map<string, MdaSubmission[]>>();
    for (const fu of followUps) {
      const canonical = classifyFollowUp(fu) || "other";
      const ck = communityKey(fu as any);
      const inner = map.get(ck) || new Map<string, MdaSubmission[]>();
      const arr = inner.get(canonical) || [];
      arr.push(fu);
      inner.set(canonical, arr);
      map.set(ck, inner);
    }
    // newest first within each module
    for (const inner of map.values())
      for (const arr of inner.values())
        arr.sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
    return map;
  }, [followUps, classifyFollowUp]);

  // ── Distinct communities supervised + funnel ──────────────────
  const primaryByCom = useMemo(() => {
    const m = new Map<string, MdaSubmission>();
    for (const s of checklist) {
      const k = communityKey(s as any);
      const prev = m.get(k);
      if (!prev || new Date(s.submittedAt || 0) > new Date(prev.submittedAt || 0)) m.set(k, s);
    }
    return m;
  }, [checklist]);

  const moduleCoverage = (canonical: string) => {
    let n = 0;
    for (const k of primaryByCom.keys()) if (fuByCommunity.get(k)?.has(canonical)) n++;
    return n;
  };
  const communitiesSupervised = primaryByCom.size;
  const covCompletion = useMemo(() => moduleCoverage(MDA_FOLLOWUP_COMPLETION), [primaryByCom, fuByCommunity]);
  const covCommodities = useMemo(() => moduleCoverage(MDA_FOLLOWUP_COMMODITIES), [primaryByCom, fuByCommunity]);
  const covAdverse = useMemo(() => moduleCoverage(MDA_FOLLOWUP_ADVERSE), [primaryByCom, fuByCommunity]);

  const funnel = [
    { label: "Community Checklist", icon: ClipboardList, value: communitiesSupervised, base: communitiesSupervised, tint: BLUE },
    { label: "MDA Completion follow-up", icon: CheckCircle2, value: covCompletion, base: communitiesSupervised, tint: EMERALD },
    { label: "Commodities follow-up", icon: Pill, value: covCommodities, base: communitiesSupervised, tint: TEAL },
    { label: "Adverse Reaction follow-up", icon: AlertTriangle, value: covAdverse, base: communitiesSupervised, tint: AMBER },
  ];

  // ── KPIs ──────────────────────────────────────────────────────
  const mdaCompleted = useMemo(() => {
    let done = 0, tot = 0;
    for (const s of checklist) {
      const v = s.data?.status_of_mda;
      if (v === undefined || v === null || v === "") continue;
      tot++; if (norm(v) === "completed") done++;
    }
    return { done, tot, pct: pct(done, tot) };
  }, [checklist]);
  const medicine = useMemo(() => yesStat(checklist, "commodities_available"), [checklist]);
  const redFlags = useMemo(() => checklist.filter((s) => norm(s.data?.risk_category) === "high").length, [checklist]);
  const aeManaged = useMemo(() => yesStat(followUps, "ae_been_managed"), [followUps]);

  // ── Follow-up outcome distributions ───────────────────────────
  const completionFus = followUps.filter((s) => classifyFollowUp(s) === MDA_FOLLOWUP_COMPLETION);
  const commoditiesFus = followUps.filter((s) => classifyFollowUp(s) === MDA_FOLLOWUP_COMMODITIES);
  const adverseFus = followUps.filter((s) => classifyFollowUp(s) === MDA_FOLLOWUP_ADVERSE);

  const mdaStatusDist = useMemo(() => {
    const order = ["Not Started", "Ongoing", "Halted", "Completed"];
    const colors: Record<string, string> = { "Not Started": SLATE, Ongoing: BLUE, Halted: RED, Completed: EMERALD };
    const counts = new Map<string, number>();
    for (const s of completionFus) {
      const v = s.data?.status_of_mda;
      if (!v) continue;
      const lbl = order.find((o) => norm(o) === norm(v)) || stripTags(String(v));
      counts.set(lbl, (counts.get(lbl) || 0) + 1);
    }
    return order.filter((o) => counts.has(o)).map((o) => ({ name: o, value: counts.get(o) || 0, color: colors[o] || SLATE }));
  }, [completionFus]);
  const mdaStatusTotal = mdaStatusDist.reduce((a, b) => a + b.value, 0);
  const mdaCompletedFu = mdaStatusDist.find((d) => d.name === "Completed")?.value || 0;

  const commodityDist = useMemo(() => {
    const counts = new Map<string, number>();
    let tot = 0;
    for (const s of commoditiesFus) {
      const v = s.data?.commodity_inadequate;
      if (!v) continue;
      const arr = Array.isArray(v) ? v : String(v).split(/\s+/);
      for (const item of arr) {
        const lbl = stripTags(String(item)).replace(/_/g, " ");
        if (!lbl) continue;
        counts.set(lbl, (counts.get(lbl) || 0) + 1); tot++;
      }
    }
    return [...counts.entries()].map(([name, value], i) => ({ name, value, pct: pct(value, tot), color: [TEAL, BLUE, AMBER, RED, VIOLET, PINK][i % 6] })).sort((a, b) => b.value - a.value);
  }, [commoditiesFus]);

  const aeTypes = useMemo(() => {
    const counts = new Map<string, number>();
    let tot = 0;
    for (const s of adverseFus) {
      const v = s.data?.adverse_reaction_type;
      if (!v) continue;
      const arr = Array.isArray(v) ? v : String(v).split(/\s+/);
      for (const item of arr) {
        const lbl = stripTags(String(item)).replace(/_/g, " ");
        if (!lbl) continue;
        counts.set(lbl, (counts.get(lbl) || 0) + 1); tot++;
      }
    }
    return [...counts.entries()].map(([name, value], i) => ({ name, value, pct: pct(value, tot), color: [AMBER, RED, VIOLET, PINK, BLUE, TEAL][i % 6] })).sort((a, b) => b.value - a.value);
  }, [adverseFus]);
  const aeOkay = useMemo(() => yesStat(adverseFus, "ae_person_okay"), [adverseFus]);

  // ── Trend (last 14 days) ──────────────────────────────────────
  const trend = useMemo(() => {
    const days: { date: string; key: string; checklist: number; followups: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      days.push({ date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), key: d.toISOString().slice(0, 10), checklist: 0, followups: 0 });
    }
    const idx = new Map(days.map((d) => [d.key, d]));
    for (const s of checklist) {
      const k = s.submittedAt ? new Date(s.submittedAt).toISOString().slice(0, 10) : null;
      const row = k && idx.get(k); if (row) row.checklist++;
    }
    for (const s of followUps) {
      const k = s.submittedAt ? new Date(s.submittedAt).toISOString().slice(0, 10) : null;
      const row = k && idx.get(k); if (row) row.followups++;
    }
    return days;
  }, [checklist, followUps]);

  // ── Longitudinal linkage register ─────────────────────────────
  const linkage = useMemo(() => {
    const statusLabel = (v: any) => {
      const map: Record<string, string> = { "not started": "Not Started", ongoing: "Ongoing", halted: "Halted", completed: "Completed" };
      return v ? map[norm(v)] || stripTags(String(v)) : "";
    };
    const rows = [...primaryByCom.entries()].map(([ck, s]) => {
      const inner = fuByCommunity.get(ck);
      const completionSub = inner?.get(MDA_FOLLOWUP_COMPLETION)?.[0];
      const commoditySub = inner?.get(MDA_FOLLOWUP_COMMODITIES)?.[0];
      const adverseSub = inner?.get(MDA_FOLLOWUP_ADVERSE)?.[0];
      const mdaStatus = statusLabel(completionSub?.data?.status_of_mda ?? s.data?.status_of_mda);
      return {
        id: s.id,
        community: pickGeo(s, "community") || "Unspecified",
        ward: pickGeo(s, "ward") || "—",
        lga: pickGeo(s, "lga") || "—",
        state: pickGeo(s, "state") || "—",
        supervisor: stripTags(s.submitter || s.data?.supervisor_name) || "—",
        visitDate: s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : "—",
        visitTs: s.submittedAt ? new Date(s.submittedAt).getTime() : 0,
        risk: stripTags(s.data?.risk_category) || "",
        mdaStatus,
        hasCompletion: !!completionSub,
        hasCommodities: !!commoditySub,
        hasAdverse: !!adverseSub,
        commodityIssue: commoditySub ? !POSITIVE.has(norm(commoditySub.data?.commodities_available ?? "yes")) || !!commoditySub.data?.commodity_inadequate : false,
        adverseManaged: adverseSub ? POSITIVE.has(norm(adverseSub.data?.ae_been_managed)) : null,
      };
    });
    rows.sort((a, b) => b.visitTs - a.visitTs);
    // Apply module filter to the register.
    if (fModule === MDA_FOLLOWUP_COMPLETION) return rows.filter((r) => r.hasCompletion);
    if (fModule === MDA_FOLLOWUP_COMMODITIES) return rows.filter((r) => r.hasCommodities);
    if (fModule === MDA_FOLLOWUP_ADVERSE) return rows.filter((r) => r.hasAdverse);
    return rows;
  }, [primaryByCom, fuByCommunity, fModule]);

  // ── Field worker accountability ───────────────────────────────
  const workers = useMemo(() => {
    const map = new Map<string, { name: string; subs: number; days: Set<string>; last: number }>();
    for (const s of checklist.concat(followUps)) {
      const name = stripTags(s.submitter || s.data?.supervisor_name) || "Unknown";
      const rec = map.get(name) || { name, subs: 0, days: new Set<string>(), last: 0 };
      rec.subs++;
      if (s.submittedAt) {
        rec.days.add(new Date(s.submittedAt).toISOString().slice(0, 10));
        rec.last = Math.max(rec.last, new Date(s.submittedAt).getTime());
      }
      map.set(name, rec);
    }
    return [...map.values()]
      .map((r) => ({ name: r.name, subs: r.subs, days: r.days.size, last: r.last ? new Date(r.last).toLocaleDateString() : "—" }))
      .sort((a, b) => b.subs - a.subs).slice(0, 12);
  }, [checklist, followUps]);

  // ── Map ───────────────────────────────────────────────────────
  const mapSubs = useMemo(
    () => checklist.map((s) => ({
      id: s.id, state: s.state, lga: s.lga, submitter: s.submitter,
      submittedAt: s.submittedAt, status: s.status,
      location: s.location || (() => {
        const g = s.data?.geolocation || s.data?.geopoint;
        if (typeof g === "string") {
          const m = g.match(/(-?\d+\.\d+)\s+(-?\d+\.\d+)/);
          if (m) return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };
        }
        return null;
      })(),
    })),
    [checklist],
  );
  const isJigawa = useMemo(() => {
    const n2 = (v: any) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/jigawa/i.test(formName || "")) return true;
    const jig = checklist.filter((s) => n2(pickGeo(s, "state")) === "jigawa").length;
    return jig > 0 && jig >= checklist.length * 0.6;
  }, [checklist, formName]);
  const isFct = useMemo(() => {
    const n2 = (v: any) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/endfund|\bfct\b|abuja|federalcapital/i.test(`${projectName || ""} ${formName || ""}`)) return true;
    const fctStates = new Set(["fct", "abuja", "federalcapitalterritory", "fctabuja"]);
    const fct = checklist.filter((s) => fctStates.has(n2(pickGeo(s, "state")))).length;
    return fct > 0 && fct >= checklist.length * 0.6;
  }, [checklist, formName, projectName]);

  // ── Export ────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      await exportMdaDashboard(filtered as any, questions as any, formName || "Integrated MDA Supervisory Checklist", projectName);
      toast.success("Dashboard exported to Excel");
    } catch (e: any) {
      toast.error(e?.message || "Could not export dashboard");
    } finally {
      setExporting(false);
    }
  };

  // ── Empty state ───────────────────────────────────────────────
  if (submissions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No submissions yet. As supervisors send in the Integrated MDA Supervisory Checklist, this dashboard updates automatically.
        </CardContent>
      </Card>
    );
  }

  const completionCovPct = pct(covCompletion, communitiesSupervised);

  return (
    <div className="space-y-4">
      {/* ── Navy report header ── */}
      <div className="overflow-hidden rounded-2xl text-white shadow-sm" style={{ background: `linear-gradient(160deg, ${NAVY}, #163a63)` }}>
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <ShieldCheck className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-xl font-bold tracking-tight">Integrated MDA Supervisory Dashboard</h2>
              <p className="text-sm text-white/70">Community Checklist with longitudinal follow-up linkage · {formName || "MDA Supervisory Checklist"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleExport} disabled={exporting} className="h-9 border-0 bg-white/15 text-white hover:bg-white/25">
              {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
              Export Excel
            </Button>
          </div>
        </div>
        {/* Scope strip */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 bg-black/10 px-5 py-2.5 text-[11px] text-white/80">
          {[
            { icon: MapIcon, label: "States", value: states.length },
            { icon: Building2, label: "LGAs", value: lgas.length },
            { icon: Layers, label: "Wards", value: wards.length },
            { icon: MapPin, label: "Communities", value: communitiesSupervised },
            { icon: ClipboardList, label: "Checklist visits", value: total },
            { icon: Activity, label: "Follow-ups", value: followUps.length },
          ].map((c) => (
            <span key={c.label} className="flex items-center gap-1.5">
              <c.icon className="h-3.5 w-3.5 text-white/60" />
              <span className="font-semibold text-white">{fmt(c.value)}</span> {c.label}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-white/60" /> Generated {new Date().toLocaleString()}
          </span>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <Card>
        <CardContent className="p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
            <Filter className="h-3.5 w-3.5 text-primary" /> Filters
            {filtersActive && (
              <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" onClick={resetFilters}>
                <RotateCcw className="mr-1 h-3 w-3" /> Clear
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
            <Select value={fState} onValueChange={(v) => { setFState(v); setFLga(ALL); setFWard(ALL); }}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All states</SelectItem>
                {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fLga} onValueChange={(v) => { setFLga(v); setFWard(ALL); }}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="LGA" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All LGAs</SelectItem>
                {lgas.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fWard} onValueChange={setFWard}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Ward" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All wards</SelectItem>
                {wards.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any status</SelectItem>
                <SelectItem value="sent">Submitted</SelectItem>
                <SelectItem value="finalized">Finalized</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fModule} onValueChange={setFModule}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Follow-up module" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All modules</SelectItem>
                <SelectItem value={MDA_FOLLOWUP_COMPLETION}>MDA Completion</SelectItem>
                <SelectItem value={MDA_FOLLOWUP_COMMODITIES}>MDA Commodities</SelectItem>
                <SelectItem value={MDA_FOLLOWUP_ADVERSE}>Adverse Reactions</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="h-9 text-xs" aria-label="From date" />
            <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="h-9 text-xs" aria-label="To date" />
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search community…" className="h-9 pl-8 text-xs" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi icon={MapPin} label="Communities Supervised" value={fmt(communitiesSupervised)} sub={`${fmt(total)} checklist visits`} tint={BLUE} />
        <Kpi icon={CheckCircle2} label="MDA Completed" value={`${mdaCompleted.pct}%`} sub={`${fmt(mdaCompleted.done)} of ${fmt(mdaCompleted.tot)} reported`} tint={EMERALD} bar={mdaCompleted.pct} />
        <Kpi icon={Pill} label="Sufficient Medicine" value={`${medicine.pct}%`} sub={`${fmt(medicine.yes)} of ${fmt(medicine.total)}`} tint={TEAL} bar={medicine.pct} />
        <Kpi icon={Activity} label="Follow-up Coverage" value={`${completionCovPct}%`} sub={`${fmt(covCompletion)} communities followed up`} tint={VIOLET} bar={completionCovPct} />
        <Kpi icon={AlertTriangle} label="Adverse Cases Managed" value={aeManaged.total ? `${aeManaged.pct}%` : "—"} sub={`${fmt(aeManaged.yes)} of ${fmt(aeManaged.total)} cases`} tint={AMBER} bar={aeManaged.total ? aeManaged.pct : undefined} />
        <Kpi icon={Flag} label="Red-flag Sites" value={fmt(redFlags)} sub="high-risk visits" tint={RED} />
      </div>

      {/* ── Longitudinal funnel ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <ArrowRight className="h-4 w-4 text-primary" /> Longitudinal Linkage Funnel
            <span className="font-normal text-muted-foreground">— Community Checklist → follow-up outcomes</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {funnel.map((f, i) => {
              const p = pct(f.value, f.base);
              return (
                <div key={f.label} className="relative rounded-xl border border-border bg-card p-3" style={{ background: `linear-gradient(135deg, ${f.tint}0d, transparent 70%)` }}>
                  <div className="flex items-center justify-between">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${f.tint}1a`, color: f.tint }}><f.icon className="h-4 w-4" /></span>
                    {i > 0 && <span className="text-[11px] font-bold" style={{ color: f.tint }}>{p}%</span>}
                  </div>
                  <p className="mt-2 font-display text-2xl font-bold" style={{ color: f.tint }}>{fmt(f.value)}</p>
                  <p className="text-[11px] text-muted-foreground">{f.label}</p>
                  {i > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${p}%`, background: f.tint }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Follow-up outcome panels ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* MDA Completion */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><CheckCircle2 className="h-4 w-4" style={{ color: EMERALD }} />MDA Completion Outcomes</CardTitle>
          </CardHeader>
          <CardContent>
            {mdaStatusTotal ? (
              <>
                <Donut centerValue={`${pct(mdaCompletedFu, mdaStatusTotal)}%`} centerLabel="Completed" data={mdaStatusDist} />
                <div className="mt-2 space-y-1 text-xs">
                  {mdaStatusDist.map((d) => (
                    <div key={d.name} className="flex items-center justify-between">
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: d.color }} />{d.name}</span>
                      <span className="font-semibold">{d.value} ({pct(d.value, mdaStatusTotal)}%)</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="py-10 text-center text-xs text-muted-foreground">No MDA Completion follow-ups yet.</p>}
          </CardContent>
        </Card>

        {/* Commodities */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Pill className="h-4 w-4" style={{ color: TEAL }} />Commodities Follow-up</CardTitle>
          </CardHeader>
          <CardContent>
            {commodityDist.length ? (
              <div className="space-y-2 py-1">
                <p className="text-[11px] text-muted-foreground">Commodities reported inadequate ({fmt(commoditiesFus.length)} follow-ups)</p>
                {commodityDist.slice(0, 7).map((d) => (
                  <BarRow key={d.name} label={d.name} value={d.value} pctVal={d.pct} color={d.color} />
                ))}
              </div>
            ) : <p className="py-10 text-center text-xs text-muted-foreground">No commodity issues reported in follow-ups.</p>}
          </CardContent>
        </Card>

        {/* Adverse */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><AlertTriangle className="h-4 w-4" style={{ color: AMBER }} />Adverse Reactions</CardTitle>
          </CardHeader>
          <CardContent>
            {aeTypes.length || aeManaged.total ? (
              <div className="space-y-2 py-1">
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
                  <span className="text-muted-foreground">Cases managed</span>
                  <Tag text={`${aeManaged.yes}/${aeManaged.total} (${aeManaged.pct}%)`} tint={EMERALD} />
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
                  <span className="text-muted-foreground">Person reported okay</span>
                  <Tag text={`${aeOkay.yes}/${aeOkay.total} (${aeOkay.pct}%)`} tint={BLUE} />
                </div>
                {aeTypes.length > 0 && <p className="pt-1 text-[11px] text-muted-foreground">Reaction types reported</p>}
                {aeTypes.slice(0, 5).map((d) => <BarRow key={d.name} label={d.name} value={d.value} pctVal={d.pct} color={d.color} />)}
              </div>
            ) : <p className="py-10 text-center text-xs text-muted-foreground">No adverse reactions reported.</p>}
          </CardContent>
        </Card>
      </div>

      {/* ── Activity trend ── */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Supervision Activity Trend <span className="font-normal text-muted-foreground">(last 14 days)</span></CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <RTooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="checklist" name="Checklist visits" stroke={BLUE} strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="followups" name="Follow-ups" stroke={EMERALD} strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Insightful, conditionally-formatted analyses ── */}
      <MdaAdvancedAnalyses
        submissions={filtered as any}
        questions={questions as any}
        projectName={projectName}
        followUpFields={new Set(Object.values(moduleQuestions).flatMap((s) => Array.from(s)))}
        offline={offline}
      />

      {/* ── Longitudinal linkage register ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <ClipboardList className="h-4 w-4 text-primary" /> Community Longitudinal Register
            <span className="ml-auto text-xs font-normal text-muted-foreground">{fmt(linkage.length)} communit{linkage.length === 1 ? "y" : "ies"}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[460px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                <tr className="text-left text-[11px] text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Community</th>
                  <th className="px-3 py-2 font-semibold">Ward · LGA</th>
                  <th className="px-3 py-2 font-semibold">Visit</th>
                  <th className="px-3 py-2 font-semibold">MDA Completion</th>
                  <th className="px-3 py-2 font-semibold">Commodities</th>
                  <th className="px-3 py-2 font-semibold">Adverse</th>
                  <th className="px-3 py-2 font-semibold">Supervisor</th>
                </tr>
              </thead>
              <tbody>
                {linkage.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">No communities match the current filters.</td></tr>
                ) : linkage.map((r) => (
                  <tr key={r.id} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-foreground">{r.community}</div>
                      {r.risk && <span className="text-[10px]" style={{ color: norm(r.risk) === "high" ? RED : SLATE }}>{r.risk} risk</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.ward} · {r.lga}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.visitDate}</td>
                    <td className="px-3 py-2">
                      {r.hasCompletion
                        ? <Tag text={r.mdaStatus || "Done"} tint={norm(r.mdaStatus) === "completed" ? EMERALD : norm(r.mdaStatus) === "halted" ? RED : BLUE} />
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.hasCommodities
                        ? <Tag text={r.commodityIssue ? "Issue" : "OK"} tint={r.commodityIssue ? AMBER : EMERALD} />
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.hasAdverse
                        ? <Tag text={r.adverseManaged ? "Managed" : "Reported"} tint={r.adverseManaged ? EMERALD : RED} />
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.supervisor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Coverage map ── */}
      {isJigawa ? (
        <JigawaSupervisoryMap submissions={mapSubs} formName={formName} />
      ) : isFct ? (
        <FctSupervisoryMap submissions={mapSubs} formName={formName} />
      ) : (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-1.5 text-sm"><MapPin className="h-4 w-4 text-primary" />Supervision Coverage Map</CardTitle></CardHeader>
          <CardContent><MdaSupervisoryMap submissions={mapSubs} formName={formName} /></CardContent>
        </Card>
      )}

      {/* ── Household coverage survey map (Coverage Evaluation 3D outcomes) ── */}
      <HouseholdCoverageSurveyMap
        projectId={projectId}
        formName={formName}
        stateFilter={fState === ALL ? null : fState}
        dateFrom={fFrom ? fFrom + "T00:00:00" : null}
        dateTo={fTo ? fTo + "T23:59:59" : null}
      />


      {/* ── Field worker accountability ── */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-1.5 text-sm"><Users2 className="h-4 w-4 text-primary" />Field Worker Submissions</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                <tr className="text-left text-[11px] text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Field worker</th>
                  <th className="px-3 py-2 text-right font-semibold">Submissions</th>
                  <th className="px-3 py-2 text-right font-semibold">Days worked</th>
                  <th className="px-3 py-2 text-right font-semibold">Last active</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <tr key={w.name} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="px-3 py-2 font-medium text-foreground">{w.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(w.subs)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(w.days)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">{w.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
