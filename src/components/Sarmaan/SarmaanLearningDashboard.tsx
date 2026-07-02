import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  RefreshCw,
  Users,
  Gauge,
  Radio,
  ShieldAlert,
  CheckCircle2,
  Clock,
  MessageSquare,
  Printer,
  MapPin,
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import type { FormGroup, Question } from "@/components/FormBuilder/types";
import { SARMAAN, SARMAAN_SERIES } from "./sarmaanBrand";

interface Props {
  form: { id: string; name: string; questions: unknown; settings: unknown };
  onClose: () => void;
}

interface Row {
  id: string;
  data: Record<string, unknown>;
  submitted_at: string | null;
  created_at: string;
}

function sectionsFrom(questions: unknown): FormGroup[] {
  if (Array.isArray(questions)) {
    const groups = questions.filter((r: unknown) => Array.isArray((r as FormGroup)?.questions));
    if (groups.length) return groups as FormGroup[];
  }
  return [];
}

const SCORE_FIELDS: { name: string; label: string }[] = [
  { name: "score_planning", label: "Planning" },
  { name: "score_stakeholder", label: "Stakeholder" },
  { name: "score_participation", label: "Participation" },
  { name: "score_noncompliance", label: "Non-compliance" },
  { name: "score_awareness", label: "Awareness" },
  { name: "score_evidence", label: "Evidence/MOV" },
  { name: "score_learning", label: "Learning" },
  { name: "score_followup", label: "Follow-up" },
];

export default function SarmaanLearningDashboard({ form, onClose }: Props) {
  const sections = useMemo(() => sectionsFrom(form.questions), [form.questions]);
  const questions = useMemo(() => sections.flatMap((s) => s.questions), [sections]);
  const nameToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of questions as Question[]) if (q.name) m.set(q.name, q.id);
    return m;
  }, [questions]);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("form_submissions")
      .select("id,data,submitted_at,created_at")
      .eq("form_id", form.id)
      .order("created_at", { ascending: false })
      .limit(2000);
    setRows((data || []) as unknown as Row[]);
    setLoading(false);
  }, [form.id]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`sarmaan-learning-${form.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "form_submissions", filter: `form_id=eq.${form.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [form.id, load]);

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

  // ---- Filters ----
  const [filters, setFilters] = useState<Record<string, string>>({});
  const filterDefs = [
    { field: "state", label: "State" },
    { field: "lga", label: "LGA" },
    { field: "type_of_visit", label: "Visit type" },
    { field: "overall_implementation_quality", label: "Implementation quality" },
  ];
  const optionsFor = (field: string) => {
    const s = new Set<string>();
    for (const r of rows) {
      const v = str(r, field);
      if (v) s.add(v);
    }
    return [...s].sort();
  };
  const filtered = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v && v !== "__all__");
    if (!active.length) return rows;
    return rows.filter((r) => active.every(([f, v]) => str(r, f) === v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filters]);

  // ---- Aggregations ----
  const totals = useMemo(() => {
    const n = filtered.length;
    const scores = filtered.map((r) => num(r, "total_score")).filter((x) => x > 0);
    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const reach = filtered.reduce((a, r) => a + num(r, "estimated_total_reached"), 0);
    const radio = filtered.reduce((a, r) => a + num(r, "radio_reach"), 0);
    const casesId = filtered.reduce((a, r) => a + num(r, "cases_identified"), 0);
    const casesResolved = filtered.reduce((a, r) => a + num(r, "cases_resolved"), 0);
    const casesPending = filtered.reduce((a, r) => a + num(r, "cases_pending"), 0);
    const dialogueSessions = filtered.reduce((a, r) => a + num(r, "num_dialogue_sessions"), 0);
    const women = filtered.reduce((a, r) => a + num(r, "num_women"), 0);
    const resRate = casesId ? Math.round((casesResolved / casesId) * 100) : 0;
    return { n, avgScore, reach, radio, casesId, casesResolved, casesPending, dialogueSessions, women, resRate };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const breakdown = (field: string, limit = 10) => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const raw = val(r, field);
      const vals = Array.isArray(raw) ? raw.map(String) : [str(r, field)];
      for (const v of vals) if (v) m.set(v, (m.get(v) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, value]) => ({ name, value }));
  };

  const scoreRadar = useMemo(
    () =>
      SCORE_FIELDS.map((f) => {
        const vals = filtered.map((r) => num(r, f.name)).filter((x) => x > 0);
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        return { metric: f.label, value: Math.round(avg * 10) / 10 };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered],
  );

  const communityRows = useMemo(() => {
    return filtered.slice(0, 60).map((r) => ({
      id: r.id,
      date: new Date(r.submitted_at || r.created_at).toLocaleDateString(),
      supervisor: str(r, "supervisor_name") || "—",
      lga: str(r, "lga") || "—",
      community: str(r, "community") || "—",
      visit: str(r, "type_of_visit") || "—",
      quality: str(r, "overall_implementation_quality") || "—",
      score: num(r, "total_score"),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const band = (score: number) =>
    score >= 65 ? { t: "Strong", c: SARMAAN.jade } :
    score >= 50 ? { t: "Good", c: SARMAAN.gold } :
    score >= 35 ? { t: "Weak", c: SARMAAN.coral } :
    { t: "Poor", c: "#B91C1C" };

  const avgBand = band(totals.avgScore);
  const hasFilters = Object.values(filters).some((v) => v && v !== "__all__");

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
      style={{ background: SARMAAN.cream, fontFamily: SARMAAN.bodyFont, color: SARMAAN.ink }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 shadow-md"
        style={{ background: `linear-gradient(90deg, ${SARMAAN.jadeDark}, ${SARMAAN.jade})` }}
      >
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-white/90 transition hover:bg-white/15"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold text-white" style={{ fontFamily: SARMAAN.headingFont }}>
            Learning Dashboard
          </div>
          <div className="text-[11px] text-white/80">Integrated Supervisory Checklist · live</div>
        </div>
        <button
          onClick={() => window.print()}
          className="hidden items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/25 sm:inline-flex"
        >
          <Printer className="h-4 w-4" /> Print / PDF
        </button>
        <button
          onClick={load}
          className="inline-flex items-center justify-center rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="mx-auto w-full max-w-6xl space-y-4 p-4">
        {/* Filters */}
        <div
          className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-3"
          style={{ borderColor: SARMAAN.line, background: SARMAAN.creamPanel }}
        >
          <span className="flex items-center gap-1 text-xs font-bold" style={{ color: SARMAAN.jadeDark }}>
            <MapPin className="h-3.5 w-3.5" /> Filters
          </span>
          {filterDefs.map((f) => (
            <div key={f.field}>
              <label className="mb-0.5 block text-[11px] font-semibold" style={{ color: SARMAAN.inkSoft }}>
                {f.label}
              </label>
              <select
                className="h-8 rounded-lg border bg-white px-2 text-xs"
                style={{ borderColor: SARMAAN.line }}
                value={filters[f.field] ?? "__all__"}
                onChange={(e) => setFilters((s) => ({ ...s, [f.field]: e.target.value }))}
              >
                <option value="__all__">All</option>
                {optionsFor(f.field).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          ))}
          {hasFilters && (
            <button
              onClick={() => setFilters({})}
              className="h-8 rounded-lg px-3 text-xs font-semibold"
              style={{ color: SARMAAN.coral }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Hero KPI band */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={<Gauge className="h-5 w-5" />} label="Supervision visits" value={totals.n.toLocaleString()} color={SARMAAN.jade} />
          <div
            className="rounded-2xl border p-4 shadow-sm"
            style={{ borderColor: SARMAAN.line, background: SARMAAN.creamPanel }}
          >
            <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: SARMAAN.inkSoft }}>
              <Gauge className="h-4 w-4" /> Avg total score /80
            </div>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-3xl font-extrabold" style={{ color: avgBand.c, fontFamily: SARMAAN.headingFont }}>
                {totals.avgScore.toFixed(1)}
              </span>
              <span
                className="mb-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                style={{ background: avgBand.c }}
              >
                {avgBand.t}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: SARMAAN.line }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (totals.avgScore / 80) * 100)}%`, background: avgBand.c }} />
            </div>
          </div>
          <Kpi icon={<Users className="h-5 w-5" />} label="Estimated people reached" value={totals.reach.toLocaleString()} color={SARMAAN.sky} />
          <Kpi icon={<MessageSquare className="h-5 w-5" />} label="Dialogue sessions" value={totals.dialogueSessions.toLocaleString()} color={SARMAAN.plum} />
        </div>

        {/* Non-compliance strip */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={<ShieldAlert className="h-5 w-5" />} label="Non-compliance cases" value={totals.casesId.toLocaleString()} color={SARMAAN.coral} />
          <Kpi icon={<CheckCircle2 className="h-5 w-5" />} label="Cases resolved" value={totals.casesResolved.toLocaleString()} color={SARMAAN.jade} />
          <Kpi icon={<Clock className="h-5 w-5" />} label="Cases pending" value={totals.casesPending.toLocaleString()} color="#B91C1C" />
          <Kpi icon={<ShieldAlert className="h-5 w-5" />} label="Resolution rate" value={`${totals.resRate}%`} color={SARMAAN.gold} />
        </div>

        {/* Charts row 1 */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Category score profile (avg /10)">
            {filtered.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={scoreRadar} outerRadius={90}>
                  <PolarGrid stroke={SARMAAN.line} />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: SARMAAN.inkSoft }} />
                  <PolarRadiusAxis domain={[0, 10]} tick={{ fontSize: 9, fill: SARMAAN.inkSoft }} />
                  <Radar dataKey="value" stroke={SARMAAN.jade} fill={SARMAAN.jade} fillOpacity={0.35} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </Panel>

          <Panel title="Implementation quality distribution">
            {filtered.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={breakdown("overall_implementation_quality")}>
                  <CartesianGrid strokeDasharray="3 3" stroke={SARMAAN.line} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: SARMAAN.inkSoft }} />
                  <YAxis tick={{ fontSize: 10, fill: SARMAAN.inkSoft }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {breakdown("overall_implementation_quality").map((_, i) => (
                      <Cell key={i} fill={SARMAAN_SERIES[i % SARMAAN_SERIES.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </Panel>
        </div>

        {/* Charts row 2: donuts */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Donut title="Evidence / MOV quality" data={breakdown("overall_evidence_quality")} />
          <Donut title="Visits by type" data={breakdown("type_of_visit")} />
          <Donut title="Action point status" data={breakdown("action_status")} />
        </div>

        {/* Charts row 3: bars */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Non-compliance root cause">
            <HBar data={breakdown("main_reason")} />
          </Panel>
          <Panel title="Most effective awareness channel">
            <HBar data={breakdown("most_effective_channel")} color={SARMAAN.sky} />
          </Panel>
          <Panel title="Visits by LGA">
            <HBar data={breakdown("lga", 12)} color={SARMAAN.jade} />
          </Panel>
          <Panel title="Challenge categories">
            <HBar data={breakdown("challenge_category", 12)} color={SARMAAN.coral} />
          </Panel>
        </div>

        {/* Radio reach note */}
        <div
          className="flex items-center gap-3 rounded-2xl border p-4"
          style={{ borderColor: SARMAAN.line, background: SARMAAN.creamPanel }}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ background: SARMAAN.gold }}>
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-extrabold" style={{ fontFamily: SARMAAN.headingFont }}>
              {totals.radio.toLocaleString()}
            </div>
            <div className="text-xs" style={{ color: SARMAAN.inkSoft }}>Estimated radio reach across broadcasts</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-lg font-extrabold" style={{ fontFamily: SARMAAN.headingFont, color: SARMAAN.plum }}>
              {totals.women.toLocaleString()}
            </div>
            <div className="text-xs" style={{ color: SARMAAN.inkSoft }}>Women engaged in dialogue</div>
          </div>
        </div>

        {/* Recent visits table */}
        <Panel title="Supervision visits">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left" style={{ color: SARMAAN.inkSoft }}>
                  <th className="p-2 font-semibold">Date</th>
                  <th className="p-2 font-semibold">Supervisor</th>
                  <th className="p-2 font-semibold">LGA</th>
                  <th className="p-2 font-semibold">Community</th>
                  <th className="p-2 font-semibold">Visit</th>
                  <th className="p-2 font-semibold">Quality</th>
                  <th className="p-2 text-right font-semibold">Score</th>
                </tr>
              </thead>
              <tbody>
                {communityRows.map((r) => {
                  const b = band(r.score);
                  return (
                    <tr key={r.id} className="border-t" style={{ borderColor: SARMAAN.line }}>
                      <td className="whitespace-nowrap p-2" style={{ color: SARMAAN.inkSoft }}>{r.date}</td>
                      <td className="p-2 font-medium">{r.supervisor}</td>
                      <td className="p-2">{r.lga}</td>
                      <td className="max-w-[160px] truncate p-2">{r.community}</td>
                      <td className="p-2">{r.visit}</td>
                      <td className="p-2">{r.quality}</td>
                      <td className="p-2 text-right">
                        {r.score > 0 ? (
                          <span className="rounded-full px-2 py-0.5 font-bold text-white" style={{ background: b.c }}>
                            {r.score}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {communityRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center" style={{ color: SARMAAN.inkSoft }}>
                      {loading ? "Loading submissions…" : "No supervision visits recorded yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="py-4 text-center text-[11px]" style={{ color: SARMAAN.inkSoft }}>
          SARMAAN Programme · Integrated Supervisory Checklist & Learning Dashboard
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm" style={{ borderColor: SARMAAN.line, background: SARMAAN.creamPanel }}>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold" style={{ color: SARMAAN.inkSoft }}>{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: color }}>
          {icon}
        </span>
      </div>
      <div className="mt-2 text-3xl font-extrabold" style={{ color, fontFamily: SARMAAN.headingFont }}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm" style={{ borderColor: SARMAAN.line, background: SARMAAN.creamPanel }}>
      <h3 className="mb-3 text-sm font-bold" style={{ fontFamily: SARMAAN.headingFont, color: SARMAAN.ink }}>{title}</h3>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="py-8 text-center text-xs" style={{ color: SARMAAN.inkSoft }}>No data yet.</p>;
}

function Donut({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <Panel title={title}>
      {data.length ? (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={74} paddingAngle={2}>
              {data.map((_, i) => <Cell key={i} fill={SARMAAN_SERIES[i % SARMAAN_SERIES.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      ) : <Empty />}
      {data.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {data.slice(0, 6).map((d, i) => (
            <span key={d.name} className="flex items-center gap-1 text-[10px]" style={{ color: SARMAAN.inkSoft }}>
              <span className="h-2 w-2 rounded-full" style={{ background: SARMAAN_SERIES[i % SARMAAN_SERIES.length] }} />
              {d.name}
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}

function HBar({ data, color = SARMAAN.gold }: { data: { name: string; value: number }[]; color?: string }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={SARMAAN.line} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: SARMAAN.inkSoft }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: SARMAAN.inkSoft }} />
        <Tooltip />
        <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
