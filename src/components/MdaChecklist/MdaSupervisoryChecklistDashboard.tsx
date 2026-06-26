/**
 * Integrated MDA Supervisory Checklist Dashboard
 * ────────────────────────────────────────────────────────────────────────
 * A faithful, decision-support dashboard matching the approved layout.
 * Every metric is computed strictly from the REAL fields captured by the
 * Integrated MDA Supervisory Checklist + its linked follow-up modules, so as
 * submissions arrive the dashboard updates accurately and insightfully.
 *
 * Items the current checklist cannot compute are intentionally omitted (and
 * the user has been informed) so the dashboard never misinforms:
 *   • "of N planned" denominators (no planned-target field is captured)
 *   • "Top Halt Reasons" (only a free-text follow-up comment exists)
 *   • Commodities Yes/No tri-rows (replaced with the real "commodity
 *     previously inadequate" distribution)
 *   • Corrective-action Status/Priority (replaced with the visit Risk Category)
 *
 * The dashboard ADDS: follow-up insights and a Field Worker Submissions panel
 * (submissions per user + the distinct days they worked).
 */
import { useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users2, CheckCircle2, Pill, ClipboardList, AlertTriangle, Flag,
  ShieldCheck, HeartHandshake, MapPin, CalendarClock, ListChecks,
} from "lucide-react";
import { prepareMdaData } from "@/lib/mda/dashboardData";
import MdaSupervisoryMap from "./MdaSupervisoryMap";

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
}

// ───────────────────────── Helpers ─────────────────────────
const stripTags = (s?: string) => String(s || "").replace(/<[^>]*>/g, "").trim();
const norm = (v: any) => String(v ?? "").trim().toLowerCase();
const POSITIVE = new Set(["yes", "true", "1", "available", "present", "good", "done", "complete", "completed", "compliant", "adequate", "trained", "passed", "okay"]);
const toNum = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

const PALETTE = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

const isYesNoQuestion = (q: FormQuestion) => {
  if (q.type !== "select_one") return false;
  const vals = (q.options || []).map((o) => norm(o.value || o.label));
  return vals.includes("yes") && vals.includes("no");
};

const isFollowUpGroup = (g: FormQuestion) =>
  /follow-?up|adverse reaction management/i.test(stripTags(g.label));

// Count yes/no answers for one field across submissions → {yes,total}
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

// ───────────────────────── Small UI atoms ─────────────────────────
function Kpi({ icon: Icon, label, value, sub, tint, bar }: {
  icon: any; label: string; value: string | number; sub?: string; tint: string; bar?: number;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow" style={{ background: tint }}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-semibold leading-tight text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2 font-display text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      {typeof bar === "number" && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, bar)}%`, background: tint }} />
          </div>
          <span className="text-[10px] font-semibold text-muted-foreground">{bar}%</span>
        </div>
      )}
    </div>
  );
}

function Donut({ data, centerLabel, centerValue }: {
  data: { name: string; value: number; color: string }[]; centerLabel?: string; centerValue?: string;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={170}>
        <PieChart>
          <Pie data={total ? data : [{ name: "—", value: 1, color: "#e5e7eb" }]} dataKey="value" innerRadius={52} outerRadius={75} paddingAngle={total ? 2 : 0} stroke="none">
            {(total ? data : [{ color: "#e5e7eb" }]).map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          {total > 0 && <RTooltip />}
        </PieChart>
      </ResponsiveContainer>
      {centerValue && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
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
      <span className="w-40 shrink-0 truncate text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pctVal}%`, background: color }} />
      </div>
      <span className="w-14 shrink-0 text-right font-semibold text-foreground">{value} ({pctVal}%)</span>
    </div>
  );
}

// ───────────────────────── Main ─────────────────────────
export default function MdaSupervisoryChecklistDashboard({ submissions, questions, formName }: Props) {
  const prepared = useMemo(() => prepareMdaData(submissions, questions as any), [submissions, questions]);
  const checklist = prepared.checklist;
  const followUps = prepared.followUps;
  const total = checklist.length;

  // Sections (non follow-up groups with yes/no questions) → average compliance
  const sectionPerf = useMemo(() => {
    const rows: { label: string; pct: number }[] = [];
    for (const item of questions || []) {
      const isGroup = Array.isArray(item.questions) && !item.type;
      if (!isGroup || isFollowUpGroup(item)) continue;
      const yn = (item.questions || []).filter(isYesNoQuestion);
      if (!yn.length) continue;
      let yes = 0, tot = 0;
      for (const q of yn) {
        const st = yesStat(checklist, q.name || q.id);
        yes += st.yes; tot += st.total;
      }
      if (tot > 0) rows.push({ label: stripTags(item.label), pct: pct(yes, tot) });
    }
    return rows;
  }, [questions, checklist]);

  const avgSectionCompliance = sectionPerf.length
    ? Math.round(sectionPerf.reduce((a, b) => a + b.pct, 0) / sectionPerf.length) : 0;

  // KPIs ----------------------------------------------------
  const registers = useMemo(() => yesStat(checklist, "registers_available"), [checklist]);
  const medicine = useMemo(() => yesStat(checklist, "commodities_available"), [checklist]);
  const inclusion = useMemo(() => yesStat(checklist, "gender_inclusion"), [checklist]);
  const mdaCompleted = useMemo(() => {
    let done = 0, tot = 0;
    for (const s of checklist) {
      const v = s.data?.status_of_mda;
      if (v === undefined || v === null || v === "") continue;
      tot++;
      if (norm(v) === "completed") done++;
    }
    return { done, tot, pct: pct(done, tot) };
  }, [checklist]);
  const redFlags = useMemo(
    () => checklist.filter((s) => norm(s.data?.risk_category) === "high").length,
    [checklist],
  );
  const aeFollowedUp = useMemo(() => {
    const managed = followUps.filter((s) => POSITIVE.has(norm(s.data?.ae_been_managed))).length;
    const withAe = followUps.filter((s) => s.data?.adverse_reaction_type).length;
    return { managed, withAe, pct: pct(managed, withAe) };
  }, [followUps]);

  // Checklist completion (by submission status) -------------
  const completion = useMemo(() => {
    let completed = 0, inProgress = 0, notStarted = 0;
    for (const s of checklist) {
      const st = norm(s.status);
      if (st === "finalized" || st === "sent") completed++;
      else if (st === "draft") inProgress++;
      else notStarted++;
    }
    return { completed, inProgress, notStarted };
  }, [checklist]);
  const completionPct = pct(completion.completed, total);

  // Supervision status trend (last 7 days) -----------------
  const trend = useMemo(() => {
    const days: { date: string; key: string; completed: number; inProgress: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      days.push({ date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), key: d.toISOString().slice(0, 10), completed: 0, inProgress: 0 });
    }
    const idx = new Map(days.map((d) => [d.key, d]));
    for (const s of checklist) {
      if (!s.submittedAt) continue;
      const k = new Date(s.submittedAt).toISOString().slice(0, 10);
      const row = idx.get(k);
      if (!row) continue;
      if (norm(s.status) === "draft") row.inProgress++; else row.completed++;
    }
    return days;
  }, [checklist]);

  // Map submissions ----------------------------------------
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

  // Follow-up: MDA Completion status distribution ----------
  const mdaStatusDist = useMemo(() => {
    const order = ["Not Started", "Ongoing", "Halted", "Completed"];
    const colors: Record<string, string> = { "Not Started": "#94a3b8", Ongoing: "#3b82f6", Halted: "#ef4444", Completed: "#10b981" };
    const counts = new Map<string, number>();
    for (const s of followUps) {
      const v = s.data?.status_of_mda;
      if (!v) continue;
      const lbl = order.find((o) => norm(o) === norm(v)) || String(v);
      counts.set(lbl, (counts.get(lbl) || 0) + 1);
    }
    return order.filter((o) => counts.has(o)).map((o) => ({ name: o, value: counts.get(o) || 0, color: colors[o] || "#64748b" }));
  }, [followUps]);
  const mdaStatusTotal = mdaStatusDist.reduce((a, b) => a + b.value, 0);
  const mdaCompletedFu = mdaStatusDist.find((d) => d.name === "Completed")?.value || 0;

  // Follow-up: Commodity previously inadequate -------------
  const commodityDist = useMemo(() => {
    const counts = new Map<string, number>();
    let tot = 0;
    for (const s of followUps) {
      const v = s.data?.commodity_inadequate;
      if (!v) continue;
      const arr = Array.isArray(v) ? v : String(v).split(/\s+/);
      for (const item of arr) {
        const lbl = stripTags(String(item)).replace(/_/g, " ");
        counts.set(lbl, (counts.get(lbl) || 0) + 1);
        tot++;
      }
    }
    return [...counts.entries()].map(([name, value]) => ({ name, value, pct: pct(value, tot) })).sort((a, b) => b.value - a.value);
  }, [followUps]);

  // Follow-up: Adverse reaction types / management ---------
  const aeTypes = useMemo(() => {
    const counts = new Map<string, number>();
    let tot = 0;
    for (const s of followUps) {
      const v = s.data?.adverse_reaction_type;
      if (!v) continue;
      const arr = Array.isArray(v) ? v : String(v).split(/\s+/);
      for (const item of arr) {
        const lbl = stripTags(String(item)).replace(/_/g, " ");
        counts.set(lbl, (counts.get(lbl) || 0) + 1);
        tot++;
      }
    }
    return [...counts.entries()].map(([name, value], i) => ({ name, value, pct: pct(value, tot), color: PALETTE[i % PALETTE.length] })).sort((a, b) => b.value - a.value);
  }, [followUps]);
  const aeManaged = useMemo(() => yesStat(followUps, "ae_been_managed"), [followUps]);
  const aeOkay = useMemo(() => yesStat(followUps, "ae_person_okay"), [followUps]);

  // Community engagement (available fields only) -----------
  const engagement = useMemo(() => [
    { label: "Town announcer / crier used", ...yesStat(checklist, "town_announcer_used") },
    { label: "Community leaders involved", ...yesStat(checklist, "community_leaders_involved") },
    { label: "Both sexes equitably reached", ...yesStat(checklist, "gender_inclusion") },
  ].filter((r) => r.total > 0), [checklist]);
  const engagementScore = engagement.length ? Math.round(engagement.reduce((a, b) => a + b.pct, 0) / engagement.length) : 0;

  // Cross-cutting checks (available fields only) -----------
  const crossCutting = useMemo(() => [
    { label: "Both sexes equitably reached", ...yesStat(checklist, "gender_inclusion") },
    { label: "PWD / elderly considered", ...yesStat(checklist, "pwd_considered") },
    { label: "Proper waste disposal", ...yesStat(checklist, "waste_disposal_proper") },
  ].filter((r) => r.total > 0), [checklist]);
  const crossScore = crossCutting.length ? Math.round(crossCutting.reduce((a, b) => a + b.pct, 0) / crossCutting.length) : 0;

  // Data quality (completeness of required-ish fields) -----
  const dataQuality = useMemo(() => {
    const requiredFields = ["supervisor_name", "state", "lga", "ward", "community", "geolocation", "registers_available", "implementation_score", "risk_category"];
    let filled = 0, slots = 0;
    for (const s of checklist) {
      for (const f of requiredFields) {
        slots++;
        const v = s.data?.[f] ?? (s as any)[f];
        if (v !== undefined && v !== null && String(v).trim() !== "") filled++;
      }
    }
    return pct(filled, slots);
  }, [checklist]);

  // Corrective actions tracker -----------------------------
  const corrective = useMemo(() =>
    checklist
      .filter((s) => stripTags(s.data?.issues_identified) || stripTags(s.data?.corrective_actions))
      .map((s) => ({
        id: s.id,
        issue: stripTags(s.data?.issues_identified) || stripTags(s.data?.corrective_actions),
        person: stripTags(s.data?.responsible_person) || "—",
        deadline: s.data?.action_deadline ? new Date(s.data.action_deadline).toLocaleDateString() : "—",
        risk: stripTags(s.data?.risk_category) || "—",
        community: stripTags(s.data?.community) || s.lga || "—",
      }))
      .slice(0, 12),
    [checklist],
  );

  // Field worker submissions & days worked -----------------
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
      .sort((a, b) => b.subs - a.subs);
  }, [checklist, followUps]);

  // ───────────────────────── Render ─────────────────────────
  if (total === 0 && followUps.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No submissions yet. As supervisors send in the Integrated MDA Supervisory Checklist, this dashboard updates automatically.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-card p-4">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground sm:text-xl">Integrated MDA Supervisory Checklist Dashboard</h2>
          <p className="text-xs text-muted-foreground">Real-time monitoring & supervision intelligence for integrated MDA activities</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Live</Badge>
          <div className="flex flex-col items-center">
            <Donut data={[{ name: "Done", value: completionPct, color: "#10b981" }, { name: "Rest", value: 100 - completionPct, color: "#e5e7eb" }]} />
          </div>
        </div>
      </div>

      {/* Top KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi icon={ClipboardList} label="Supervision Visits Completed" value={total} sub={`${prepared.communityCount} communities`} tint="#3b82f6" />
        <Kpi icon={CheckCircle2} label="Sites with MDA Completed" value={mdaCompleted.done} sub={`of ${mdaCompleted.tot} reported`} tint="#10b981" bar={mdaCompleted.pct} />
        <Kpi icon={Pill} label="Sites with Sufficient Medicine" value={medicine.yes} sub={`of ${medicine.total} answered`} tint="#06b6d4" bar={medicine.pct} />
        <Kpi icon={ListChecks} label="Sites with Registers Available" value={registers.yes} sub={`of ${registers.total} answered`} tint="#8b5cf6" bar={registers.pct} />
        <Kpi icon={AlertTriangle} label="Adverse Reaction Cases Followed up" value={aeFollowedUp.managed} sub={`of ${aeFollowedUp.withAe} cases`} tint="#f59e0b" bar={aeFollowedUp.pct} />
        <Kpi icon={Flag} label="Red-flag Sites" value={redFlags} sub="high-risk visits" tint="#ef4444" />
        <Kpi icon={ShieldCheck} label="Section Compliance (avg.)" value={`${avgSectionCompliance}%`} sub="across sections" tint="#3b82f6" bar={avgSectionCompliance} />
      </div>

      {/* Section perf + completion + trend */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Section Performance <span className="font-normal text-muted-foreground">(avg compliance %)</span></CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {sectionPerf.length ? sectionPerf.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-44 shrink-0 truncate text-muted-foreground">{r.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.pct >= 80 ? "#10b981" : r.pct >= 60 ? "#f59e0b" : "#ef4444" }} />
                </div>
                <span className="w-10 shrink-0 text-right font-semibold text-foreground">{r.pct}%</span>
              </div>
            )) : <p className="py-6 text-center text-xs text-muted-foreground">No yes/no section questions answered yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Checklist Completion Score</CardTitle></CardHeader>
          <CardContent>
            <Donut centerValue={`${completionPct}%`} centerLabel="Completed" data={[
              { name: "Completed", value: completion.completed, color: "#10b981" },
              { name: "In Progress", value: completion.inProgress, color: "#3b82f6" },
              { name: "Not Started", value: completion.notStarted, color: "#ef4444" },
            ]} />
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex items-center justify-between"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Completed</span><span className="font-semibold">{completion.completed}</span></div>
              <div className="flex items-center justify-between"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />In Progress</span><span className="font-semibold">{completion.inProgress}</span></div>
              <div className="flex items-center justify-between"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Not Started</span><span className="font-semibold">{completion.notStarted}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Supervision Status Trend <span className="font-normal text-muted-foreground">(last 7 days)</span></CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <RTooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="completed" name="Completed" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="inProgress" name="In Progress" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Coverage map */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><MapPin className="h-4 w-4" />Supervision Coverage Map</CardTitle></CardHeader>
        <CardContent>
          <MdaSupervisoryMap submissions={mapSubs} formName={formName} />
        </CardContent>
      </Card>

      {/* Follow-up insights */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Follow-up on MDA Completion</CardTitle></CardHeader>
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
            ) : <p className="py-8 text-center text-xs text-muted-foreground">No MDA completion follow-ups yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Follow-up: Commodity Previously Inadequate</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {commodityDist.length ? commodityDist.map((d, i) => (
              <BarRow key={d.name} label={d.name} value={d.value} pctVal={d.pct} color={PALETTE[i % PALETTE.length]} />
            )) : <p className="py-8 text-center text-xs text-muted-foreground">No commodity follow-ups yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Follow-up on Adverse Reactions</CardTitle></CardHeader>
          <CardContent>
            {aeTypes.length ? (
              <>
                <Donut data={aeTypes.map((d) => ({ name: d.name, value: d.value, color: d.color }))} />
                <div className="mt-2 space-y-1 text-xs">
                  {aeTypes.map((d) => (
                    <div key={d.name} className="flex items-center justify-between">
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: d.color }} />{d.name}</span>
                      <span className="font-semibold">{d.value} ({d.pct}%)</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-emerald-500/10 p-2"><div className="text-muted-foreground">Managed</div><div className="font-display text-lg font-bold text-emerald-600">{aeManaged.pct}%</div><div className="text-[10px] text-muted-foreground">{aeManaged.yes}/{aeManaged.total}</div></div>
                  <div className="rounded-lg bg-blue-500/10 p-2"><div className="text-muted-foreground">Satisfied/OK now</div><div className="font-display text-lg font-bold text-blue-600">{aeOkay.pct}%</div><div className="text-[10px] text-muted-foreground">{aeOkay.yes}/{aeOkay.total}</div></div>
                </div>
              </>
            ) : <p className="py-8 text-center text-xs text-muted-foreground">No adverse-reaction follow-ups yet.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Engagement / cross-cutting / data quality */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><HeartHandshake className="h-4 w-4" />Community Engagement Score <Badge variant="secondary" className="ml-auto">{engagementScore}%</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {engagement.length ? engagement.map((r) => <BarRow key={r.label} label={r.label} value={r.yes} pctVal={r.pct} color="#10b981" />) : <p className="py-6 text-center text-xs text-muted-foreground">No data yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><ListChecks className="h-4 w-4" />Cross-cutting Checks <Badge variant="secondary" className="ml-auto">{crossScore}%</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {crossCutting.length ? crossCutting.map((r) => <BarRow key={r.label} label={r.label} value={r.yes} pctVal={r.pct} color="#3b82f6" />) : <p className="py-6 text-center text-xs text-muted-foreground">No data yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><ShieldCheck className="h-4 w-4" />Data Quality Score</CardTitle></CardHeader>
          <CardContent>
            <Donut centerValue={`${dataQuality}%`} centerLabel="Completeness" data={[{ name: "Complete", value: dataQuality, color: dataQuality >= 80 ? "#10b981" : dataQuality >= 60 ? "#f59e0b" : "#ef4444" }, { name: "Missing", value: 100 - dataQuality, color: "#e5e7eb" }]} />
            <p className="mt-1 text-center text-[11px] text-muted-foreground">Completeness of key supervisory fields across all visits</p>
          </CardContent>
        </Card>
      </div>

      {/* Corrective actions + field workers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Corrective Actions Tracker</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {corrective.length ? (
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Issue / Action</th>
                  <th className="py-1.5 pr-2 font-medium">Responsible</th>
                  <th className="py-1.5 pr-2 font-medium">Deadline</th>
                  <th className="py-1.5 font-medium">Risk</th>
                </tr></thead>
                <tbody>
                  {corrective.map((c) => (
                    <tr key={c.id} className="border-b border-border/40">
                      <td className="py-1.5 pr-2"><div className="max-w-[200px] truncate">{c.issue}</div><div className="text-[10px] text-muted-foreground">{c.community}</div></td>
                      <td className="py-1.5 pr-2">{c.person}</td>
                      <td className="py-1.5 pr-2">{c.deadline}</td>
                      <td className="py-1.5"><Badge variant="outline" className={norm(c.risk) === "high" ? "border-red-500 text-red-600" : norm(c.risk) === "medium" ? "border-amber-500 text-amber-600" : "border-emerald-500 text-emerald-600"}>{c.risk}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="py-8 text-center text-xs text-muted-foreground">No corrective actions recorded.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><Users2 className="h-4 w-4" />Field Worker Submissions & Days Worked</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {workers.length ? (
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Supervisor</th>
                  <th className="py-1.5 pr-2 font-medium text-right">Submissions</th>
                  <th className="py-1.5 pr-2 font-medium text-right">Days Worked</th>
                  <th className="py-1.5 font-medium text-right">Last Active</th>
                </tr></thead>
                <tbody>
                  {workers.map((w) => (
                    <tr key={w.name} className="border-b border-border/40">
                      <td className="py-1.5 pr-2 font-medium text-foreground">{w.name}</td>
                      <td className="py-1.5 pr-2 text-right">{w.subs}</td>
                      <td className="py-1.5 pr-2 text-right"><span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3 text-muted-foreground" />{w.days}</span></td>
                      <td className="py-1.5 text-right text-muted-foreground">{w.last}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="py-8 text-center text-xs text-muted-foreground">No submissions yet.</p>}
          </CardContent>
        </Card>
      </div>

      <p className="px-1 text-[10px] text-muted-foreground">
        All figures are computed live from submitted Integrated MDA Supervisory Checklist data and its follow-up modules.
      </p>
    </div>
  );
}
