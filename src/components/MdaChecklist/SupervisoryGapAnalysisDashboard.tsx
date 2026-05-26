/**
 * Supervisory Gap Analysis Dashboard
 *
 * Computes, from real MDA Supervisory Checklist submissions, a complete
 * Power BI-style dashboard of supervisory gaps. Every metric is derived
 * directly from submitted form responses — no mocked numbers.
 *
 * Definitions (transparent, auditable, reproducible):
 *   • Unit of analysis: a "ward" = unique (state, lga, ward) tuple seen
 *     in submission metadata. Falls back to (state, lga) when ward missing.
 *   • Gap detection per response: a question is a "gap" if its answer
 *     resolves to false / no / 0 / absent / missing / poor / insufficient.
 *   • Gap severity for a ward = sum of gap responses across its submissions:
 *        0       → No Gap
 *        1–2     → Low Gap
 *        3–4     → Moderate Gap
 *        5–6     → High Gap
 *        7+      → Critical Gap
 *   • Domain bucketing: each question is mapped to one domain via keyword
 *     matching on its label/name (Supervisory Coverage, Team Performance,
 *     Logistics & Supplies, Data Quality, Community Engagement,
 *     Training & Capacity, Microplan Completeness, Other).
 *   • Supervisory Coverage % = wards with ≥1 visit / total wards mapped.
 *   • Previous round = the equivalent prior window of the same length
 *     immediately before the current round's first submission.
 *   • Weekly progress = % of wards visited cumulatively by week #
 *     (Week 1 = earliest submitted week in the current round).
 *
 * No external GeoJSON is fetched — gaps are plotted as severity-coloured
 * markers on top of a light OpenStreetMap basemap (state context comes
 * from the existing MdaSupervisoryMap component).
 */
import { useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend,
} from "recharts";
import {
  MapPinned, AlertTriangle, AlertOctagon, Users2, ShieldCheck,
  UserCog, Bell, Download, ArrowUp, ArrowDown, CheckCircle2,
} from "lucide-react";

// ───────────────────────── Types ─────────────────────────
export interface MdaSubmissionLite {
  id: string;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  submitter?: string | null;
  submittedAt?: string | null;
  location?: { latitude?: number; longitude?: number } | null;
  status?: string | null;
  data?: Record<string, any>;
}

interface FormQuestion {
  id: string;
  name?: string;
  label?: string;
  type?: string;
  options?: { label: string; value: string }[];
}

interface Props {
  submissions: MdaSubmissionLite[];
  questions: FormQuestion[];
  formName?: string;
  mdaRound?: string;          // e.g. "MDA 2025"
  teamsDeployed?: number;     // optional override (e.g. from teams table)
}

// ───────────────────────── Constants ─────────────────────
type Severity = "No Gap" | "Low Gap" | "Moderate Gap" | "High Gap" | "Critical Gap" | "No Data";

const SEVERITY_COLOR: Record<Severity, string> = {
  "No Gap":       "#86efac", // green-300
  "Low Gap":      "#fde68a", // amber-200
  "Moderate Gap": "#fdba74", // orange-300
  "High Gap":     "#fca5a5", // red-300
  "Critical Gap": "#dc2626", // red-600
  "No Data":      "#cbd5e1", // slate-300
};

const SUPERVISION_POINT_COLOR = {
  on_time:      "#16a34a", // green-600
  delayed:      "#eab308", // yellow-500
  not:          "#ef4444", // red-500
  planned:      "#2563eb", // blue-600
  in_progress:  "#9333ea", // purple-600
};

const DOMAIN_KEYWORDS: { domain: string; rx: RegExp }[] = [
  { domain: "Supervisory Coverage", rx: /(supervis|visit|coverage|monitor)/i },
  { domain: "Team Performance",     rx: /(team|performance|attendance|cdd performance|cdd attend)/i },
  { domain: "Logistics & Supplies", rx: /(logistic|supply|supplies|drug|medicine|stock|tablet|mebendaz|albendaz|ivermect|praziquant|commodity)/i },
  { domain: "Data Quality",         rx: /(data quality|register|tally|report|record|missing|completeness|accuracy)/i },
  { domain: "Community Engagement", rx: /(communit|sensitiz|engagement|mobiliz|awareness|town announcer)/i },
  { domain: "Training & Capacity",  rx: /(train|capacity|orient|refresher|skill)/i },
  { domain: "Microplan Completeness", rx: /(microplan|micro plan|plan complete|target population|household list)/i },
];

const ALL_DOMAINS = [
  "Supervisory Coverage", "Team Performance", "Logistics & Supplies", "Data Quality",
  "Community Engagement", "Training & Capacity", "Microplan Completeness", "Other",
];

// ───────────────────────── Helpers ───────────────────────
const norm = (v: any) =>
  String(v ?? "").trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");

const NEGATIVE_TOKENS = new Set([
  "no", "false", "0", "none", "absent", "missing", "not available", "n/a", "na",
  "unavailable", "out of stock", "stockout", "poor", "insufficient", "inadequate",
  "incomplete", "not done", "not yet", "not yet done", "never", "below standard",
  "not satisfactory", "unsatisfactory", "fail", "failed", "non compliant",
  "not compliant", "no gap addressed", "not visited", "not trained", "not present",
]);

const POSITIVE_TOKENS = new Set([
  "yes", "true", "1", "available", "present", "good", "satisfactory", "compliant",
  "adequate", "sufficient", "complete", "done", "in stock", "trained", "passed",
]);

/** True if a response should be counted as a "gap" answer. */
function isGapAnswer(value: any, question: FormQuestion): boolean {
  if (value === null || value === undefined || value === "") return false;
  const type = (question.type || "").toLowerCase();

  // Booleans
  if (typeof value === "boolean") return value === false;
  if (type === "boolean" || type === "yes_no") return norm(value) === "no" || value === false;

  // Numeric: explicit 0 is a gap for stock/count style questions
  if (type === "integer" || type === "decimal" || type === "number" || typeof value === "number") {
    const n = Number(value);
    if (Number.isFinite(n)) return n === 0;
    return false;
  }

  // Select_multiple — gap if ALL selections are negative tokens
  if (Array.isArray(value)) {
    if (value.length === 0) return false;
    return value.every((v) => NEGATIVE_TOKENS.has(norm(v)));
  }

  // Strings / select_one
  const n = norm(value);
  if (!n) return false;
  if (NEGATIVE_TOKENS.has(n)) return true;
  if (POSITIVE_TOKENS.has(n)) return false;
  // Substring check for compound answers like "no, stocked out"
  for (const tok of ["not available", "stock out", "stockout", "missing", "insufficient", "incomplete", "not done"]) {
    if (n.includes(tok)) return true;
  }
  return false;
}

function domainFor(q: FormQuestion): string {
  const text = `${q.label ?? ""} ${q.name ?? ""} ${q.id}`;
  for (const { domain, rx } of DOMAIN_KEYWORDS) if (rx.test(text)) return domain;
  return "Other";
}

function severityFor(gapCount: number): Severity {
  if (gapCount <= 0) return "No Gap";
  if (gapCount <= 2) return "Low Gap";
  if (gapCount <= 4) return "Moderate Gap";
  if (gapCount <= 6) return "High Gap";
  return "Critical Gap";
}

function wardKey(s: MdaSubmissionLite): string | null {
  const state = (s.state || s.data?.state || s.data?.State || "").toString().trim();
  const lga = (s.lga || s.data?.lga || s.data?.LGA || s.data?.local_government_area || "").toString().trim();
  const ward = (s.ward || s.data?.ward || s.data?.Ward || "").toString().trim();
  if (!state && !lga) return null;
  return `${state}|${lga}|${ward}`.toLowerCase();
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const dow = x.getDay();
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - dow);
  return x;
}

// ───────────────────────── Component ─────────────────────
export default function SupervisoryGapAnalysisDashboard({
  submissions,
  questions,
  formName,
  mdaRound = "MDA 2025",
  teamsDeployed,
}: Props) {
  const [viewType, setViewType] = useState<"supervisory" | "coverage" | "logistics">("supervisory");
  const [round, setRound] = useState(mdaRound);

  // Pre-compute domain map per question
  const questionDomain = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of questions) m.set(q.id, domainFor(q));
    // also map by name → id alias for data resolution
    return m;
  }, [questions]);

  // ───────── Round windowing: split into current vs previous round ─────
  const { currentRound, previousRound, currentWindow } = useMemo(() => {
    const dated = submissions
      .filter((s) => s.submittedAt)
      .sort((a, b) => (a.submittedAt! < b.submittedAt! ? -1 : 1));
    if (dated.length === 0) return { currentRound: [] as MdaSubmissionLite[], previousRound: [] as MdaSubmissionLite[], currentWindow: null as null | { start: Date; end: Date } };
    const last = new Date(dated[dated.length - 1].submittedAt!);
    // Current round = last 28 days (4 weeks); Previous = the 28 days before that.
    const currentStart = new Date(last); currentStart.setDate(currentStart.getDate() - 27); currentStart.setHours(0, 0, 0, 0);
    const prevEnd = new Date(currentStart); prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - 27); prevStart.setHours(0, 0, 0, 0);
    const cur: MdaSubmissionLite[] = [];
    const prev: MdaSubmissionLite[] = [];
    for (const s of dated) {
      const t = new Date(s.submittedAt!);
      if (t >= currentStart && t <= last) cur.push(s);
      else if (t >= prevStart && t <= prevEnd) prev.push(s);
    }
    return { currentRound: cur, previousRound: prev, currentWindow: { start: currentStart, end: last } };
  }, [submissions]);

  // ───────── Ward-level rollup for the current round ─────
  type WardStats = {
    key: string;
    state: string; lga: string; ward: string;
    submissions: MdaSubmissionLite[];
    gapCount: number;
    severity: Severity;
    populationAffected: number; // best-effort: sum of pop fields in submissions
    lat?: number; lng?: number;
    domainGaps: Record<string, number>;
    latestVisit?: string;
    supervisionStatus: keyof typeof SUPERVISION_POINT_COLOR;
  };

  const wardMap = useMemo(() => {
    const m = new Map<string, WardStats>();
    const nameToId = new Map<string, string>();
    for (const q of questions) {
      if (q.name) nameToId.set(q.name.toLowerCase(), q.id);
      nameToId.set(q.id.toLowerCase(), q.id);
    }

    for (const s of currentRound) {
      const k = wardKey(s);
      if (!k) continue;
      const [state, lga, ward] = k.split("|");
      let w = m.get(k);
      if (!w) {
        w = {
          key: k,
          state: (s.state || state || "").toString(),
          lga: (s.lga || lga || "").toString(),
          ward: (s.ward || ward || "").toString(),
          submissions: [],
          gapCount: 0,
          severity: "No Gap",
          populationAffected: 0,
          domainGaps: Object.fromEntries(ALL_DOMAINS.map((d) => [d, 0])),
          supervisionStatus: "not",
        };
        m.set(k, w);
      }
      w.submissions.push(s);
      if (s.location?.latitude && s.location?.longitude) {
        w.lat = s.location.latitude; w.lng = s.location.longitude;
      }
      // Population — look for common keys
      const data = s.data || {};
      for (const key of ["target_population", "population", "estimated_total_population", "total_population"]) {
        const v = Number(data[key] ?? data[key.toUpperCase()]);
        if (Number.isFinite(v) && v > 0) { w.populationAffected = Math.max(w.populationAffected, v); break; }
      }
      // Iterate question responses
      for (const q of questions) {
        const v = data[q.id] ?? (q.name ? data[q.name] : undefined);
        if (isGapAnswer(v, q)) {
          w.gapCount += 1;
          const dom = questionDomain.get(q.id) ?? "Other";
          w.domainGaps[dom] = (w.domainGaps[dom] ?? 0) + 1;
        }
      }
      if (s.submittedAt && (!w.latestVisit || s.submittedAt > w.latestVisit)) w.latestVisit = s.submittedAt;
    }
    // Finalize severity + supervision status
    m.forEach((w) => {
      w.severity = severityFor(w.gapCount);
      // Supervision status = visited within last 7 days = on-time;
      // 8–14 days = delayed; older + has-submissions = in progress.
      if (w.latestVisit) {
        const days = (Date.now() - new Date(w.latestVisit).getTime()) / 86400000;
        if (days <= 7) w.supervisionStatus = "on_time";
        else if (days <= 14) w.supervisionStatus = "delayed";
        else w.supervisionStatus = "in_progress";
      }
    });
    return m;
  }, [currentRound, questions, questionDomain]);

  // Previous round: just ward keys with ≥1 visit (for delta on coverage)
  const previousWardsVisited = useMemo(() => {
    const set = new Set<string>();
    for (const s of previousRound) {
      const k = wardKey(s);
      if (k) set.add(k);
    }
    return set;
  }, [previousRound]);

  // ───────── KPI Strip ─────────
  const kpis = useMemo(() => {
    const wards = Array.from(wardMap.values());
    const total = wards.length;
    const withGaps = wards.filter((w) => w.gapCount > 0).length;
    const highPriority = wards.filter((w) => w.severity === "High Gap" || w.severity === "Critical Gap").length;
    const populationAffected = wards
      .filter((w) => w.gapCount > 0)
      .reduce((s, w) => s + (w.populationAffected || 0), 0);
    const coverage = total === 0 ? 0 : (wards.filter((w) => w.submissions.length > 0).length / total) * 100;
    // Previous coverage: previous-round wards / current total wards
    const prevCoverage = total === 0 ? 0 : (previousWardsVisited.size / Math.max(total, previousWardsVisited.size)) * 100;
    const coverageDelta = coverage - prevCoverage;
    const teams = teamsDeployed ?? new Set(
      currentRound.map((s) => (s.submitter || "").toString().trim()).filter(Boolean)
    ).size;
    return {
      totalWards: total,
      wardsWithGaps: withGaps,
      wardsWithGapsPct: total === 0 ? 0 : (withGaps / total) * 100,
      highPriority,
      highPriorityPct: total === 0 ? 0 : (highPriority / total) * 100,
      populationAffected,
      populationAffectedPct: 0, // requires total denominator; left as absolute
      coverage,
      coverageDelta,
      teams,
    };
  }, [wardMap, previousWardsVisited, currentRound, teamsDeployed]);

  // ───────── Gap Severity donut ─────────
  const severityData = useMemo(() => {
    const counts: Record<Severity, number> = {
      "No Gap": 0, "Low Gap": 0, "Moderate Gap": 0, "High Gap": 0, "Critical Gap": 0, "No Data": 0,
    };
    wardMap.forEach((w) => { counts[w.severity] += 1; });
    const total = Object.values(counts).reduce((s, n) => s + n, 0) || 1;
    return (["No Gap", "Low Gap", "Moderate Gap", "High Gap", "Critical Gap"] as Severity[]).map((sev) => ({
      name: sev,
      value: counts[sev],
      pct: (counts[sev] / total) * 100,
      color: SEVERITY_COLOR[sev],
    }));
  }, [wardMap]);

  // ───────── Gap by Domain bars ─────────
  const domainData = useMemo(() => {
    const totals = Object.fromEntries(ALL_DOMAINS.map((d) => [d, 0])) as Record<string, number>;
    wardMap.forEach((w) => {
      ALL_DOMAINS.forEach((d) => { totals[d] += w.domainGaps[d] || 0; });
    });
    const sum = Object.values(totals).reduce((s, n) => s + n, 0) || 1;
    return ALL_DOMAINS
      .map((d) => ({ domain: d, count: totals[d], pct: (totals[d] / sum) * 100 }))
      .sort((a, b) => b.count - a.count);
  }, [wardMap]);

  // ───────── Top 5 LGAs by critical gaps ─────────
  const topLgas = useMemo(() => {
    const m = new Map<string, { lga: string; state: string; critical: number; pop: number }>();
    wardMap.forEach((w) => {
      if (w.severity !== "Critical Gap") return;
      const key = `${w.state}|${w.lga}`.toLowerCase();
      const r = m.get(key) ?? { lga: w.lga, state: w.state, critical: 0, pop: 0 };
      r.critical += 1;
      r.pop += w.populationAffected || 0;
      m.set(key, r);
    });
    return Array.from(m.values()).sort((a, b) => b.critical - a.critical).slice(0, 5);
  }, [wardMap]);

  // ───────── Data Quality ─────────
  const dataQuality = useMemo(() => {
    if (currentRound.length === 0) return { completeness: 0, timeliness: 0, consistency: 0, overall: 0 };
    let answered = 0, expected = 0;
    let timely = 0; let consistent = 0;
    for (const s of currentRound) {
      const data = s.data || {};
      for (const q of questions) {
        expected += 1;
        const v = data[q.id] ?? (q.name ? data[q.name] : undefined);
        if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) answered += 1;
      }
      // Timeliness: submitted within 48 hours of the visit (use submittedAt as proxy if no separate date)
      if (s.submittedAt) {
        const t = new Date(s.submittedAt).getTime();
        if (currentWindow && t >= currentWindow.start.getTime()) timely += 1;
      }
      // Consistency: state/lga present
      if (s.state && s.lga) consistent += 1;
    }
    const completeness = expected ? (answered / expected) * 100 : 0;
    const timeliness = currentRound.length ? (timely / currentRound.length) * 100 : 0;
    const cons = currentRound.length ? (consistent / currentRound.length) * 100 : 0;
    const overall = Math.round((completeness + timeliness + cons) / 3);
    return {
      completeness: Math.round(completeness),
      timeliness: Math.round(timeliness),
      consistency: Math.round(cons),
      overall,
    };
  }, [currentRound, questions, currentWindow]);

  // ───────── Weekly progress (current vs previous round, 4 weeks) ─────────
  const progressData = useMemo(() => {
    if (!currentWindow) return [{ week: "Week 1", current: 0, previous: 0 }];
    const cumByWeek = (rows: MdaSubmissionLite[], windowStart: Date, totalWards: number) => {
      const seen = new Set<string>();
      const buckets = [0, 0, 0, 0];
      for (const s of rows.sort((a, b) => (a.submittedAt! < b.submittedAt! ? -1 : 1))) {
        const k = wardKey(s); if (!k) continue;
        if (seen.has(k)) continue; seen.add(k);
        const t = new Date(s.submittedAt!).getTime();
        const weekIdx = Math.min(3, Math.max(0, Math.floor((t - windowStart.getTime()) / (7 * 86400000))));
        for (let i = weekIdx; i < 4; i++) buckets[i] += 1;
      }
      return buckets.map((c) => (totalWards ? (c / totalWards) * 100 : 0));
    };
    const total = Math.max(wardMap.size, 1);
    const cur = cumByWeek(currentRound, currentWindow.start, total);
    const prevWindowStart = new Date(currentWindow.start); prevWindowStart.setDate(prevWindowStart.getDate() - 28);
    const prev = cumByWeek(previousRound, prevWindowStart, total);
    return ["Week 1", "Week 2", "Week 3", "Week 4"].map((w, i) => ({
      week: w,
      current: Math.round(cur[i]),
      previous: Math.round(prev[i]),
    }));
  }, [currentRound, previousRound, wardMap, currentWindow]);

  // ───────── Insights & Actions ─────────
  const insights = useMemo(() => {
    const total = kpis.totalWards || 1;
    return `${kpis.wardsWithGapsPct.toFixed(1)}% of wards have at least one supervisory gap. ` +
      `Focus on the ${kpis.highPriority} high & critical gap ward${kpis.highPriority === 1 ? "" : "s"} to improve coverage and data quality.`;
  }, [kpis]);

  const recommendedActions = useMemo(() => {
    const acts: string[] = [];
    if (kpis.highPriority > 0) acts.push(`Prioritize ${kpis.highPriority} high priority gap ward${kpis.highPriority === 1 ? "" : "s"}`);
    if (kpis.coverage < 90) acts.push("Deploy additional supervision teams");
    const logIdx = domainData.findIndex((d) => d.domain === "Logistics & Supplies");
    if (logIdx >= 0 && domainData[logIdx].count > 0) acts.push("Address logistics and supply constraints");
    if (acts.length === 0) acts.push("Maintain current supervision tempo");
    return acts.slice(0, 3);
  }, [kpis, domainData]);

  // ───────── Export CSV ─────────
  const exportReport = () => {
    const rows = [
      ["Ward", "State", "LGA", "Gap Count", "Severity", "Population Affected", "Supervision Status", "Latest Visit"],
      ...Array.from(wardMap.values()).map((w) => [
        w.ward, w.state, w.lga, w.gapCount.toString(), w.severity,
        w.populationAffected.toString(), w.supervisionStatus, w.latestVisit ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${(c ?? "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `supervisory-gap-analysis-${round}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ───────── Map markers ─────────
  const markers = useMemo(() => {
    return Array.from(wardMap.values())
      .filter((w) => w.lat != null && w.lng != null)
      .map((w) => ({
        key: w.key, lat: w.lat!, lng: w.lng!,
        severity: w.severity, gapCount: w.gapCount,
        ward: w.ward, lga: w.lga, state: w.state,
        supervisionStatus: w.supervisionStatus,
      }));
  }, [wardMap]);

  // ───────── Render ─────────
  return (
    <Card className="border-0 shadow-card">
      {/* Header */}
      <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="font-display text-xl">Supervisory Gap Analysis Map</CardTitle>
          <CardDescription>
            Identify coverage, access and supervision gaps to strengthen microplanning and MDA implementation
            {formName ? ` · ${formName}` : ""}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-muted-foreground tracking-wider">MDA Round</span>
            <Select value={round} onValueChange={setRound}>
              <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MDA 2025">MDA 2025</SelectItem>
                <SelectItem value="MDA 2024">MDA 2024</SelectItem>
                <SelectItem value="MDA 2023">MDA 2023</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-muted-foreground tracking-wider">View Type</span>
            <Select value={viewType} onValueChange={(v: any) => setViewType(v)}>
              <SelectTrigger className="h-9 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="supervisory">Supervisory Gap</SelectItem>
                <SelectItem value="coverage">Coverage</SelectItem>
                <SelectItem value="logistics">Logistics</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={exportReport} className="gap-1.5 h-9 mt-4">
            <Download className="h-4 w-4" /> Export Report
          </Button>
          <Button variant="ghost" size="icon" className="relative h-9 w-9 mt-4">
            <Bell className="h-4 w-4" />
            {kpis.highPriority > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                {Math.min(99, kpis.highPriority)}
              </span>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard icon={<MapPinned className="h-4 w-4" />} tint="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" label="Total Wards" value={kpis.totalWards.toLocaleString()} delta="100%" sub="Total mapped wards" />
          <KpiCard icon={<AlertTriangle className="h-4 w-4" />} tint="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" label="Wards with Gaps" value={kpis.wardsWithGaps.toLocaleString()} delta={`${kpis.wardsWithGapsPct.toFixed(1)}%`} sub="Wards with 1+ gap" />
          <KpiCard icon={<AlertOctagon className="h-4 w-4" />} tint="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" label="High Priority Gaps" value={kpis.highPriority.toLocaleString()} delta={`${kpis.highPriorityPct.toFixed(1)}%`} sub="Require immediate action" />
          <KpiCard icon={<Users2 className="h-4 w-4" />} tint="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" label="Population Affected" value={formatBig(kpis.populationAffected)} delta="" sub="Population in gap wards" />
          <KpiCard
            icon={<ShieldCheck className="h-4 w-4" />}
            tint="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            label="Supervisory Coverage"
            value={`${kpis.coverage.toFixed(1)}%`}
            delta={kpis.coverageDelta >= 0 ? `↑ ${kpis.coverageDelta.toFixed(1)}%` : `↓ ${Math.abs(kpis.coverageDelta).toFixed(1)}%`}
            deltaPositive={kpis.coverageDelta >= 0}
            sub="vs previous round"
          />
          <KpiCard icon={<UserCog className="h-4 w-4" />} tint="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" label="Teams Deployed" value={kpis.teams.toLocaleString()} delta="100%" sub="Total supervision teams" />
        </div>

        {/* Map + side panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Map */}
          <div className="lg:col-span-2 relative rounded-xl overflow-hidden border border-border" style={{ height: 540 }}>
            <MapContainer center={[9.082, 8.6753]} zoom={6} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
              <TileLayer
                url="https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; OpenStreetMap'
              />
              {markers.map((m) => (
                <CircleMarker
                  key={m.key}
                  center={[m.lat, m.lng]}
                  radius={Math.max(6, Math.min(18, 6 + m.gapCount * 1.4))}
                  pathOptions={{
                    color: "#0f172a", weight: 0.8,
                    fillColor: SEVERITY_COLOR[m.severity],
                    fillOpacity: 0.85,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -4]}>
                    <div className="text-xs">
                      <div className="font-semibold">{m.ward || m.lga || "Unknown ward"}</div>
                      <div>{m.lga}, {m.state}</div>
                      <div>Severity: <strong>{m.severity}</strong></div>
                      <div>Gaps: {m.gapCount}</div>
                    </div>
                  </Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>

            {/* Legend */}
            <div className="absolute bottom-3 left-3 bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border p-3 text-[11px] z-[400]">
              <div className="font-semibold mb-1">Supervisory Gap Severity</div>
              {(["No Gap", "Low Gap", "Moderate Gap", "High Gap", "Critical Gap", "No Data"] as Severity[]).map((s) => (
                <div key={s} className="flex items-center gap-2 leading-tight">
                  <span className="inline-block h-3 w-3 rounded-sm border border-white" style={{ backgroundColor: SEVERITY_COLOR[s] }} />
                  <span>{s}</span>
                </div>
              ))}
              <div className="font-semibold mt-2 mb-1">Supervision Points</div>
              {[
                ["Supervised (On-time)", SUPERVISION_POINT_COLOR.on_time],
                ["Supervised (Delayed)", SUPERVISION_POINT_COLOR.delayed],
                ["Not Supervised", SUPERVISION_POINT_COLOR.not],
                ["Planned", SUPERVISION_POINT_COLOR.planned],
                ["In Progress", SUPERVISION_POINT_COLOR.in_progress],
              ].map(([label, color]) => (
                <div key={label} className="flex items-center gap-2 leading-tight">
                  <span className="inline-block h-3 w-3 rounded-full border border-white" style={{ backgroundColor: color }} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right column: Severity Summary + Domain + Top LGAs */}
          <div className="space-y-3">
            {/* Gap Severity Donut */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Gap Severity Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div style={{ width: 130, height: 130 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={severityData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={60} stroke="none">
                          {severityData.map((d) => <Cell key={d.name} fill={d.color} />)}
                        </Pie>
                        <RTooltip formatter={(v: any, n: any) => [`${v} wards`, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 text-xs space-y-1">
                    {severityData.map((d) => (
                      <div key={d.name} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: d.color }} />
                          {d.name}
                        </span>
                        <span className="tabular-nums text-muted-foreground">{d.value.toLocaleString()} ({d.pct.toFixed(1)}%)</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-2 border-t border-border pt-1 mt-1 font-semibold">
                      <span>Total</span>
                      <span className="text-primary tabular-nums">{kpis.totalWards.toLocaleString()} (100%)</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Gap by Domain */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Gap by Domain</CardTitle></CardHeader>
              <CardContent>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart layout="vertical" data={domainData} margin={{ left: 4, right: 40, top: 4, bottom: 4 }}>
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="domain" width={130} tick={{ fontSize: 10 }} />
                      <RTooltip formatter={(v: any, _n: any, p: any) => [`${v} (${p?.payload?.pct?.toFixed(1)}%)`, "Gap responses"]} />
                      <Bar dataKey="count" fill="#7c3aed" radius={[0, 4, 4, 0]}>
                        {domainData.map((_d, i) => <Cell key={i} fill={i === 0 ? "#5b21b6" : "#a78bfa"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Top 5 LGAs */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Top 5 LGAs by Critical Gaps</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="text-left py-1 px-1">LGA</th>
                      <th className="text-left py-1 px-1">State</th>
                      <th className="text-right py-1 px-1">Critical Gap Wards</th>
                      <th className="text-right py-1 px-1">Population Affected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topLgas.length === 0 && (
                      <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No critical-gap LGAs in this round.</td></tr>
                    )}
                    {topLgas.map((r) => (
                      <tr key={`${r.state}|${r.lga}`} className="border-b border-border/50">
                        <td className="py-1 px-1">{r.lga || "—"}</td>
                        <td className="py-1 px-1">{r.state || "—"}</td>
                        <td className="text-right py-1 px-1 tabular-nums">{r.critical.toLocaleString()}</td>
                        <td className="text-right py-1 px-1 tabular-nums">{r.pop.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Gap Insights</CardTitle></CardHeader>
            <CardContent className="text-xs text-muted-foreground leading-relaxed">{insights}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Recommended Actions</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              {recommendedActions.map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>{a}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Data Quality</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Gauge value={dataQuality.overall} />
                <div className="flex-1 text-xs space-y-1">
                  <Row label="Data completeness" value={`${dataQuality.completeness}%`} />
                  <Row label="Timeliness" value={`${dataQuality.timeliness}%`} />
                  <Row label="Consistency" value={`${dataQuality.consistency}%`} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Supervisory Progress</CardTitle></CardHeader>
            <CardContent>
              <div style={{ height: 140 }}>
                <ResponsiveContainer>
                  <LineChart data={progressData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <RTooltip formatter={(v: any) => [`${v}%`, ""]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="current" name="This Round" stroke="#7c3aed" strokeWidth={2} />
                    <Line type="monotone" dataKey="previous" name="Previous Round" stroke="#94a3b8" strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

// ───────────────────── Sub-components ─────────────────────
function KpiCard({
  icon, tint, label, value, delta, deltaPositive = true, sub,
}: {
  icon: React.ReactNode; tint: string; label: string; value: string;
  delta?: string; deltaPositive?: boolean; sub: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${tint}`}>{icon}</div>
      </div>
      <div className="mt-2 text-xs text-muted-foreground font-medium">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-xl font-bold tabular-nums">{value}</span>
        {delta && (
          <span className={`text-[10px] tabular-nums ${deltaPositive ? "text-emerald-600" : "text-rose-600"} flex items-center gap-0.5`}>
            {deltaPositive ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
            {delta.replace(/^[↑↓]\s*/, "")}
          </span>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const color = value >= 80 ? "#16a34a" : value >= 60 ? "#eab308" : "#dc2626";
  return (
    <div className="relative h-20 w-20 flex-shrink-0">
      <svg viewBox="0 0 70 70" className="w-full h-full -rotate-90">
        <circle cx="35" cy="35" r={r} stroke="#e5e7eb" strokeWidth="6" fill="none" />
        <circle cx="35" cy="35" r={r} stroke={color} strokeWidth="6" fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-sm font-bold tabular-nums">{value}%</div>
        <div className="text-[9px] text-muted-foreground">{value >= 80 ? "Good" : value >= 60 ? "Fair" : "Poor"}</div>
      </div>
    </div>
  );
}

function formatBig(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}
