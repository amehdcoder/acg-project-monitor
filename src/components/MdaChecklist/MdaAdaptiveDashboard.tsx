/**
 * MDA Adaptive Insights Dashboard
 * ────────────────────────────────────────────────────────────────────────
 * A fully adaptive, beautifully-colorful analytics dashboard for the
 * Integrated MDA Supervisory Checklist. It is driven entirely by the form's
 * CURRENT structure (groups + questions) and the real submissions, so any
 * edit to the checklist in the Form Builder — adding, removing, renaming or
 * retyping a field — is mirrored here automatically with the right kind of
 * visualization for each question.
 *
 * Nothing is hard-coded to a specific field. The dashboard inspects each
 * question's type and computes the most insightful chart for it:
 *   • select_one / select_multiple / rank → category distribution (donut / bars)
 *   • yes-no style selects                → compliance gauge
 *   • number / integer / decimal / range  → KPI stats + distribution
 *   • date / time / datetime              → answered-over-time
 *   • media (image/audio/video/file/geo)  → capture-rate card
 *   • text / note / barcode               → response-rate card
 */
import { useMemo, useState, useEffect } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
  RadialBarChart, RadialBar, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Activity, Users2, MapPin, CheckCircle2, ClipboardList, Search,
  CalendarDays, TrendingUp, Gauge, ListChecks, Hash, Image as ImageIcon,
  Type as TypeIcon, Sparkles, FileSpreadsheet, FolderLock,
} from "lucide-react";
import { toast } from "sonner";
import { exportMdaDashboard } from "@/lib/mda/dashboardExport";
import { prepareMdaData, communityKey } from "@/lib/mda/dashboardData";
import { isMdaFollowUpGroup } from "@/lib/mdaFollowUp";
import MdaDrillDownSheet, { type DrillData } from "./MdaDrillDownSheet";

// ───────────────────────── Types ─────────────────────────
interface QOption { id?: string; label: string; value: string; }
interface FormQuestion {
  id: string;
  name?: string;
  label?: string;
  type?: string;
  options?: QOption[];
  questions?: FormQuestion[]; // when this is actually a group
}
interface MdaSubmission {
  id: string;
  projectId?: string | null;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  submitter?: string | null;
  submittedAt?: string | null;
  status?: string | null;
  data?: Record<string, any>;
}
interface ProjectLite { id: string; name: string; }
interface Props {
  submissions: MdaSubmission[];
  questions: FormQuestion[];
  formName?: string;
  formId?: string;
  /** The project this checklist instance belongs to. */
  projectId?: string;
  projects?: ProjectLite[];
}

// Vibrant, accessible categorical palette for data viz.
const PALETTE = [
  "#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899",
  "#8b5cf6", "#14b8a6", "#f97316", "#3b82f6", "#84cc16", "#e11d48",
];

// Human labels for the canonical follow-up module keys.
const FOLLOWUP_LABELS: Record<string, string> = {
  follow_up_on_mda_completion: "MDA Completion follow-up",
  follow_up_on_mda_commodities: "MDA Commodities follow-up",
  adverse_reaction_management: "Adverse Reactions follow-up",
};

const stripTags = (s?: string) => String(s || "").replace(/<[^>]*>/g, "").trim();
const norm = (v: any) => String(v ?? "").trim().toLowerCase();
const POSITIVE = new Set(["yes", "true", "1", "available", "present", "good", "done", "complete", "compliant", "adequate", "trained", "passed"]);
const NEGATIVE = new Set(["no", "false", "0", "none", "absent", "missing", "n/a", "na", "poor", "incomplete", "not done", "fail", "failed"]);

const NUMERIC_TYPES = new Set(["number", "integer", "decimal", "calculate", "range"]);
const CHOICE_TYPES = new Set(["select_one", "select_multiple", "rank", "acknowledge"]);
const MEDIA_TYPES = new Set(["image", "audio", "video", "file", "signature", "geopoint", "geotrace", "geoshape"]);
const DATE_TYPES = new Set(["date", "time", "datetime"]);

const toNum = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

// Flatten groups → ordered sections with their questions.
interface Section { name: string; label: string; questions: FormQuestion[]; }
function buildSections(questions: FormQuestion[]): Section[] {
  const sections: Section[] = [];
  let loose: FormQuestion[] = [];
  let idx = 0;
  for (const item of questions || []) {
    const isGroup = Array.isArray(item.questions) && !item.type;
    if (isGroup) {
      sections.push({
        name: item.name || item.id,
        label: stripTags(item.label) || `Section ${++idx}`,
        questions: (item.questions || []).filter((q) => q && q.type),
      });
    } else if (item.type) {
      loose.push(item);
    }
  }
  if (loose.length) sections.unshift({ name: "_general", label: "General", questions: loose });
  return sections.filter((s) => s.questions.length);
}

const keyFor = (q: FormQuestion) => q.name || q.id;
const optionLabel = (q: FormQuestion, val: string) =>
  stripTags(q.options?.find((o) => o.value === val || o.label === val)?.label) || val;

// ───────────────────────── Small UI atoms ─────────────────────────
function KpiTile({ icon: Icon, label, value, sub, tint, onClick }: any) {
  const clickable = typeof onClick === "function";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 text-left shadow-sm transition-all hover:shadow-md ${clickable ? "cursor-pointer hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-1" : ""}`}
      style={clickable ? ({ ["--tw-ring-color" as any]: tint }) : undefined}
    >
      <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-15" style={{ background: tint }} />
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white shadow" style={{ background: tint }}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="mt-3 font-display text-2xl font-bold text-foreground">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
        : clickable ? <div className="mt-0.5 text-[10px] font-medium" style={{ color: tint }}>Click to view submissions →</div> : null}
    </button>
  );
}

function ResponseBadge({ answered, total }: { answered: number; total: number }) {
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const tone = pct >= 80 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    : pct >= 40 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
    : "bg-rose-500/15 text-rose-600 dark:text-rose-400";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{pct}% answered</span>;
}

// ───────────────────────── Per-question chart ─────────────────────────
function QuestionCard({ q, submissions, color }: { q: FormQuestion; submissions: MdaSubmission[]; color: string }) {
  const key = keyFor(q);
  const type = (q.type || "").toLowerCase();
  const label = stripTags(q.label) || key;

  const values = useMemo(
    () => submissions.map((s) => s.data?.[key]).filter((v) => v !== undefined && v !== null && v !== ""),
    [submissions, key],
  );
  const answered = values.length;
  const total = submissions.length;

  // ---- Choice questions → distribution ----
  if (CHOICE_TYPES.has(type)) {
    const counts = new Map<string, number>();
    for (const v of values) {
      const arr = Array.isArray(v) ? v : String(v).includes(" ") && type === "select_multiple" ? String(v).split(/\s+/) : [v];
      for (const item of arr) {
        const lbl = optionLabel(q, String(item));
        counts.set(lbl, (counts.get(lbl) || 0) + 1);
      }
    }
    const dataArr = [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    // Yes/No → compliance gauge
    const looksBinary = dataArr.length > 0 && dataArr.length <= 3 &&
      dataArr.every((d) => POSITIVE.has(norm(d.name)) || NEGATIVE.has(norm(d.name)) || /partial|some|n\/?a/i.test(d.name));
    if (looksBinary) {
      const pos = dataArr.filter((d) => POSITIVE.has(norm(d.name))).reduce((a, b) => a + b.value, 0);
      const pct = answered ? Math.round((pos / answered) * 100) : 0;
      const tint = pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
      return (
        <ChartShell q={q} label={label} icon={Gauge} answered={answered} total={total}>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={120} height={120}>
              <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ name: "c", value: pct, fill: tint }]} startAngle={90} endAngle={-270}>
                <RadialBar background={{ fill: "hsl(var(--muted))" }} dataKey="value" cornerRadius={10} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div>
              <div className="font-display text-3xl font-bold" style={{ color: tint }}>{pct}%</div>
              <div className="text-xs text-muted-foreground">compliant / positive</div>
              <div className="mt-2 space-y-0.5">
                {dataArr.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="text-muted-foreground">{d.name}:</span>
                    <span className="font-semibold text-foreground">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ChartShell>
      );
    }

    if (dataArr.length === 0) return <EmptyCard q={q} label={label} answered={answered} total={total} />;

    // Few categories → donut; many → horizontal bars
    if (dataArr.length <= 6) {
      return (
        <ChartShell q={q} label={label} icon={ListChecks} answered={answered} total={total}>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={dataArr} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
                {dataArr.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <RTooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartShell>
      );
    }
    return (
      <ChartShell q={q} label={label} icon={ListChecks} answered={answered} total={total}>
        <ResponsiveContainer width="100%" height={Math.min(280, 40 + dataArr.length * 26)}>
          <BarChart data={dataArr.slice(0, 12)} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
            <RTooltip />
            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
              {dataArr.slice(0, 12).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartShell>
    );
  }

  // ---- Numeric questions → stats + distribution ----
  if (NUMERIC_TYPES.has(type)) {
    const nums = values.map(toNum).filter((n): n is number => n !== null);
    if (nums.length === 0) return <EmptyCard q={q} label={label} answered={answered} total={total} />;
    const sum = nums.reduce((a, b) => a + b, 0);
    const avg = sum / nums.length;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    // Build up to 8 histogram buckets
    const buckets = 6;
    const span = max - min || 1;
    const step = span / buckets;
    const hist = Array.from({ length: buckets }, (_, i) => ({
      name: max === min ? String(min) : `${(min + i * step).toFixed(step < 1 ? 1 : 0)}`,
      value: 0,
    }));
    for (const n of nums) {
      let idx = max === min ? 0 : Math.min(buckets - 1, Math.floor((n - min) / step));
      hist[idx].value++;
    }
    const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1));
    return (
      <ChartShell q={q} label={label} icon={Hash} answered={answered} total={total}>
        <div className="mb-2 grid grid-cols-4 gap-1.5 text-center">
          {[["Avg", fmt(avg)], ["Sum", fmt(sum)], ["Min", fmt(min)], ["Max", fmt(max)]].map(([k, v], i) => (
            <div key={k} className="rounded-lg py-1.5" style={{ background: `${PALETTE[i % PALETTE.length]}1a` }}>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
              <div className="text-sm font-bold text-foreground">{v}</div>
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={hist} margin={{ left: -20, right: 6 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
            <RTooltip />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={color} />
          </BarChart>
        </ResponsiveContainer>
      </ChartShell>
    );
  }

  // ---- Media / geo → capture rate ----
  if (MEDIA_TYPES.has(type)) {
    return (
      <ChartShell q={q} label={label} icon={ImageIcon} answered={answered} total={total}>
        <div className="flex flex-col items-center justify-center py-3">
          <div className="font-display text-3xl font-bold" style={{ color }}>{answered}</div>
          <div className="text-xs text-muted-foreground">of {total} visits captured this</div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${total ? (answered / total) * 100 : 0}%`, background: color }} />
          </div>
        </div>
      </ChartShell>
    );
  }

  // ---- Date/time → answered-over-time handled at the top; here just response rate ----
  // ---- Text / note / barcode / default → response rate ----
  return (
    <ChartShell q={q} label={label} icon={DATE_TYPES.has(type) ? CalendarDays : TypeIcon} answered={answered} total={total}>
      <div className="flex flex-col items-center justify-center py-3">
        <div className="font-display text-3xl font-bold" style={{ color }}>{answered}</div>
        <div className="text-xs text-muted-foreground">responses recorded</div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full" style={{ width: `${total ? (answered / total) * 100 : 0}%`, background: color }} />
        </div>
      </div>
    </ChartShell>
  );
}

function ChartShell({ q, label, icon: Icon, answered, total, children }: any) {
  return (
    <Card className="overflow-hidden border-border/60 transition-all hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold leading-tight">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="line-clamp-2">{label}</span>
          </CardTitle>
          <ResponseBadge answered={answered} total={total} />
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function EmptyCard({ q, label, answered, total }: any) {
  return (
    <ChartShell q={q} label={label} icon={Activity} answered={answered} total={total}>
      <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">No data yet</div>
    </ChartShell>
  );
}

// ───────────────────────── Main component ─────────────────────────
export default function MdaAdaptiveDashboard({
  submissions: allSubmissions,
  questions,
  formName,
  formId,
  projectId,
  projects = [],
}: Props) {
  const sections = useMemo(() => buildSections(questions), [questions]);
  const [activeSection, setActiveSection] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);

  // ── Project scope (persisted per form) ──
  const storageKey = `mda-dashboard-project:${formId || formName || "default"}`;
  // Projects that actually appear in this checklist's data (+ its own project).
  const availableProjects = useMemo(() => {
    const ids = new Set<string>();
    for (const s of allSubmissions) if (s.projectId) ids.add(String(s.projectId));
    if (projectId) ids.add(projectId);
    const nameOf = (id: string) => projects.find((p) => p.id === id)?.name || "This project";
    return [...ids].map((id) => ({ id, name: nameOf(id) }));
  }, [allSubmissions, projectId, projects]);

  const [activeProject, setActiveProject] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return saved;
    } catch { /* ignore */ }
    return projectId || "all";
  });

  // Default to the checklist's own project once it is known.
  useEffect(() => {
    if (activeProject === "all" && projectId) {
      let hasSaved = false;
      try { hasSaved = !!localStorage.getItem(storageKey); } catch { /* ignore */ }
      if (!hasSaved) setActiveProject(projectId);
    }
  }, [projectId, activeProject, storageKey]);

  const setProjectScope = (id: string) => {
    setActiveProject(id);
    try { localStorage.setItem(storageKey, id); } catch { /* ignore */ }
  };

  // Submissions scoped to the selected project.
  const submissions = useMemo(() => {
    if (activeProject === "all") return allSubmissions;
    return allSubmissions.filter((s) => !s.projectId || String(s.projectId) === activeProject);
  }, [allSubmissions, activeProject]);

  // Separate primary checklist visits from follow-up rows, and merge follow-up
  // answers back onto each community so charts reflect the latest responses.
  const prepared = useMemo(() => prepareMdaData(submissions, questions as any), [submissions, questions]);
  // The dataset every chart/KPI is computed from = accurate community visits.
  const visitRows = prepared.checklist;

  // ── Drill-down state ──
  const [drill, setDrill] = useState<DrillData | null>(null);

  // Names of follow-up questions + their linked source fields, so the drill-down
  // can flag answers that were updated during a follow-up.
  const followUpFields = useMemo(() => {
    const set = new Set<string>();
    const walk = (qs: any[]) => {
      for (const item of qs || []) {
        const isGroup = Array.isArray(item.questions) && !item.type;
        if (isGroup) {
          for (const q of item.questions || []) {
            if (q?.name && (q.linkedSourceField || item.followUpModule || isMdaFollowUpGroup?.(item))) {
              set.add(q.name);
              if (q.linkedSourceField) set.add(q.linkedSourceField);
            }
          }
          walk(item.questions || []);
        }
      }
    };
    walk(questions as any);
    return set;
  }, [questions]);

  // De-duplicate community visits (latest per community) for the drill-down.
  const communityVisits = useMemo(() => {
    const map = new Map<string, MdaSubmission>();
    for (const s of visitRows) {
      const k = communityKey(s as any);
      const prev = map.get(k);
      if (!prev || new Date(s.submittedAt || 0) > new Date(prev.submittedAt || 0)) map.set(k, s);
    }
    return [...map.values()];
  }, [visitRows]);

  const openDrill = (d: DrillData) => setDrill(d);

  const activeProjectName =
    activeProject === "all"
      ? "All projects"
      : availableProjects.find((p) => p.id === activeProject)?.name || "This project";

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportMdaDashboard(visitRows, questions, formName || "MDA Supervisory Checklist", activeProjectName);
      toast.success("Dashboard metrics exported to Excel");
    } catch (e) {
      console.error(e);
      toast.error("Failed to export dashboard metrics");
    } finally {
      setExporting(false);
    }
  };


  // Overview KPIs — computed ONLY from primary checklist visits (follow-up
  // rows are merged in, never double-counted), so figures never mislead.
  const kpis = useMemo(() => {
    const supervisors = new Set<string>();
    const states = new Set<string>();
    const lgas = new Set<string>();
    const wards = new Set<string>();
    let finalized = 0;
    for (const s of visitRows) {
      if (s.submitter) supervisors.add(String(s.submitter));
      const st = s.state || s.data?.state; if (st) states.add(norm(st));
      const lg = s.lga || s.data?.lga; if (lg) lgas.add(norm(lg));
      const wd = s.ward || s.data?.ward; if (wd) wards.add(`${norm(lg)}|${norm(wd)}`);
      if (norm(s.status) === "finalized" || norm(s.status) === "sent" || norm(s.status) === "submitted") finalized++;
    }
    return {
      total: visitRows.length,
      communities: prepared.communityCount,
      supervisors: supervisors.size,
      states: states.size,
      lgas: lgas.size,
      wards: wards.size,
      finalizedPct: visitRows.length ? Math.round((finalized / visitRows.length) * 100) : 0,
    };
  }, [visitRows, prepared.communityCount]);

  // Visits over time (from submittedAt) — primary visits only.
  const timeline = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const s of visitRows) {
      if (!s.submittedAt) continue;
      const d = new Date(s.submittedAt);
      if (isNaN(d.getTime())) continue;
      const k = d.toISOString().slice(0, 10);
      byDay.set(k, (byDay.get(k) || 0) + 1);
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, value]) => ({ date: date.slice(5), value }));
  }, [visitRows]);

  const visibleSections = useMemo(() => {
    let secs = activeSection === "all" ? sections : sections.filter((s) => s.name === activeSection);
    if (query.trim()) {
      const ql = query.toLowerCase();
      secs = secs
        .map((s) => ({ ...s, questions: s.questions.filter((q) => (stripTags(q.label) || keyFor(q)).toLowerCase().includes(ql)) }))
        .filter((s) => s.questions.length);
    }
    return secs;
  }, [sections, activeSection, query]);

  const totalQuestions = sections.reduce((a, s) => a + s.questions.length, 0);

  return (
    <Card className="border-border/60 bg-gradient-to-br from-card to-muted/30">
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow">
                <Sparkles className="h-4 w-4" />
              </span>
              Adaptive Insights Dashboard
            </CardTitle>
            <CardDescription>
              Live, auto-adapting analytics for <span className="font-medium text-foreground">{formName || "this checklist"}</span> —
              {" "}{totalQuestions} fields across {sections.length} sections. Edits to the form are mirrored here automatically.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-2 py-1">
              <FolderLock className="h-4 w-4 text-indigo-500" />
              <Select value={activeProject} onValueChange={setProjectScope}>
                <SelectTrigger className="h-8 w-[180px] border-0 bg-transparent px-1 text-xs shadow-none focus:ring-0">
                  <SelectValue placeholder="Project scope" />
                </SelectTrigger>
                <SelectContent>
                  {availableProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                  ))}
                  <SelectItem value="all" className="text-xs">All projects</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleExport} disabled={exporting || visitRows.length === 0} className="gap-2 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white hover:opacity-90">
              <FileSpreadsheet className="h-4 w-4" />
              {exporting ? "Exporting…" : "Export to Excel"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Accuracy note: explain exactly what the figures represent */}
        <div className="flex items-start gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
          <span>
            Figures below count <span className="font-semibold text-foreground">community checklist visits only</span>.
            {prepared.hasFollowUpGroups && (
              <> Follow-up submissions ({prepared.followUps.length}) are <span className="font-semibold text-foreground">merged</span> onto
              their community — the latest follow-up answer updates the linked question — and are never double-counted as visits.</>
            )}
          </span>
        </div>

        {/* Overview KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          <KpiTile icon={ClipboardList} label="Checklist Visits" value={kpis.total} tint="#6366f1"
            onClick={() => openDrill({ title: "Checklist Visits", tint: "#6366f1", subtitle: `${visitRows.length} supervisory visit(s)`, rows: visitRows })} />
          <KpiTile icon={MapPin} label="Communities" value={kpis.communities} tint="#0ea5e9"
            onClick={() => openDrill({ title: "Communities visited", tint: "#0ea5e9", subtitle: `${communityVisits.length} distinct communit${communityVisits.length === 1 ? "y" : "ies"}`, rows: communityVisits })} />
          <KpiTile icon={Users2} label="Supervisors" value={kpis.supervisors} tint="#06b6d4"
            onClick={() => openDrill({ title: "Supervisor submissions", tint: "#06b6d4", subtitle: `${kpis.supervisors} supervisor(s) across ${visitRows.length} visit(s)`, rows: visitRows })} />
          <KpiTile icon={MapPin} label="States" value={kpis.states} tint="#10b981"
            onClick={() => openDrill({ title: "Submissions by State", tint: "#10b981", subtitle: `${kpis.states} state(s)`, rows: visitRows })} />
          <KpiTile icon={MapPin} label="LGAs" value={kpis.lgas} tint="#f59e0b"
            onClick={() => openDrill({ title: "Submissions by LGA", tint: "#f59e0b", subtitle: `${kpis.lgas} LGA(s)`, rows: visitRows })} />
          <KpiTile icon={MapPin} label="Wards" value={kpis.wards} tint="#ec4899"
            onClick={() => openDrill({ title: "Submissions by Ward", tint: "#ec4899", subtitle: `${kpis.wards} ward(s)`, rows: visitRows })} />
          <KpiTile icon={CheckCircle2} label="Finalized" value={`${kpis.finalizedPct}%`} tint="#8b5cf6"
            onClick={() => openDrill({ title: "Finalized submissions", tint: "#8b5cf6", subtitle: "Visits marked finalized / sent / submitted", rows: visitRows.filter((s) => ["finalized", "sent", "submitted"].includes(norm(s.status))) })} />
        </div>

        {/* Follow-up coverage */}
        {prepared.hasFollowUpGroups && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {prepared.followUpCoverage.map((fc, i) => {
              const label = FOLLOWUP_LABELS[fc.canonical] || "Follow-up";
              const pct = kpis.communities ? Math.round((fc.communities / kpis.communities) * 100) : 0;
              const tint = PALETTE[i % PALETTE.length];
              return (
                <div key={fc.canonical} className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{label}</span>
                    <span className="text-xs font-semibold" style={{ color: tint }}>{pct}%</span>
                  </div>
                  <div className="mt-1 font-display text-xl font-bold text-foreground">
                    {fc.communities}<span className="text-sm font-normal text-muted-foreground"> / {kpis.communities} communities</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tint }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Visits over time */}
        {timeline.length > 1 && (
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-indigo-500" /> Supervisory Visits Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={timeline} margin={{ left: -20, right: 12 }}>
                  <defs>
                    <linearGradient id="mdaLine" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <RTooltip />
                  <Line type="monotone" dataKey="value" stroke="url(#mdaLine)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={activeSection} onValueChange={setActiveSection} className="w-full overflow-x-auto">
            <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/50">
              <TabsTrigger value="all" className="text-xs">All ({totalQuestions})</TabsTrigger>
              {sections.map((s) => (
                <TabsTrigger key={s.name} value={s.name} className="text-xs">
                  {s.label} ({s.questions.length})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative shrink-0 sm:w-56">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search fields…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 pl-9" />
          </div>
        </div>

        {/* Adaptive per-section insights */}
        {visitRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
            <Activity className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No submissions yet. Insights appear here as data is collected.</p>
          </div>
        ) : visibleSections.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No fields match your search.</div>
        ) : (
          visibleSections.map((section, si) => (
            <div key={section.name} className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-l-4 px-3 py-1 text-xs font-semibold" style={{ borderLeftColor: PALETTE[si % PALETTE.length] }}>
                  {section.label}
                </Badge>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {section.questions.map((q, qi) => (
                  <QuestionCard key={q.id || keyFor(q)} q={q} submissions={visitRows} color={PALETTE[(si + qi) % PALETTE.length]} />
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
