import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Cell, ReferenceLine, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Activity, ChevronDown, Home, Users2, Percent, Sigma, Pill, Ruler,
  TrendingDown, TrendingUp, CheckCircle2, AlertTriangle, Target, ShieldAlert,
  RotateCcw, Loader2, Smile, Lightbulb, HeartPulse, MapPinned, Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { testAgainstBenchmark, type BenchmarkTest } from "@/lib/ces/coverageStats";
import MdaCoverageMatrix from "./MdaCoverageMatrix";
import RepeatHcsDuplicates from "./RepeatHcsDuplicates";
import { labelPillStyle } from "@/lib/lgaColors";

/* ─────────────────────────── palette ─────────────────────────── */
const EMERALD = "#10b981";
const RED = "#ef4444";
const AMBER = "#f59e0b";
const BLUE = "#2563eb";
const TEAL = "#14b8a6";
const PURPLE = "#7c3aed";
const SLATE = "#64748b";
const NAVY = "#0c2340";
const NAVY_SOFT = "#173a63";

const DEFAULT_TX_BENCHMARK = 75; // therapeutic coverage target (%)
/** Household reach target is a fixed, non-editable 100% threshold. */
const HH_BENCHMARK = 100; // household reach target (%) — static, uneditable

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

/* ─────────────────────────── record shape ─────────────────────────── */
interface PersonRow { offered?: string; swallowed?: string }
interface HouseholdRecord {
  cdd_came?: string;
  anyone_treated?: string;
  // New validated numeric keys from the Repeat Household Coverage Survey form.
  eligible_persons?: number;
  offered_drugs?: number;
  actually_swallowed?: number;
  // Legacy keys (kept for backward compatibility with older submissions).
  eligible_count?: number;
  offered_count?: number;
  swallowed_count?: number;
  people?: PersonRow[];
  side_effects?: string;
  side_effects_detail?: string;
  ae_reported?: boolean;
  f1_asked_height?: string;
  f3_satisfied?: string;
  f4_why?: string;
  suggestions?: string;
  gps?: { lat: number; lng: number } | null;
}
interface SurveyRow {
  id: string;
  state: string | null;
  lga: string | null;
  ward: string | null;
  flhf_name: string | null;
  community_name: string | null;
  settlement_name: string | null;
  user_id: string | null;
  target_households: number | null;
  completed_households: number | null;
  shortfall_reason: string | null;
  households: HouseholdRecord[] | null;
  created_at: string;
}

/* ─────────────────────────── metrics ─────────────────────────── */
/** First finite, non-negative value among the supplied candidate keys. */
const firstNum = (h: HouseholdRecord, keys: (keyof HouseholdRecord)[]) => {
  for (const k of keys) {
    const n = Number(h[k] as any);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
};

/** Eligible persons in the household — the therapeutic-coverage denominator. */
const personsEligible = (h: HouseholdRecord) =>
  Math.max(0, Math.round(firstNum(h, ["eligible_persons", "eligible_count"])));

const personsOffered = (h: HouseholdRecord) => {
  const raw = Math.max(
    0,
    Math.round(Math.max(firstNum(h, ["offered_drugs", "offered_count"]), (h.people || []).filter((p) => norm(p.offered) === "y").length)),
  );
  // The form strictly enforces offered ≤ eligible; clamp defensively for older rows.
  const elig = personsEligible(h);
  return elig > 0 ? Math.min(raw, elig) : raw;
};
/**
 * Treated (swallowed) persons can never exceed the eligible persons in the
 * household — clamp to the eligible count to keep therapeutic coverage ≤ 100%
 * and prevent impossible >100% aggregates at community/LGA level.
 */
const personsSwallowed = (h: HouseholdRecord) => {
  const raw = Math.max(
    0,
    Math.round(Math.max(firstNum(h, ["actually_swallowed", "swallowed_count"]), (h.people || []).filter((p) => norm(p.swallowed) === "y").length)),
  );
  const elig = personsEligible(h);
  return elig > 0 ? Math.min(raw, elig) : Math.min(raw, personsOffered(h));
};


interface GeoRow {
  key: string; label: string; sub: string;
  households: number;
  cddYes: number; treatedYes: number;
  eligible: number; offered: number; swallowed: number;
  txTest: BenchmarkTest | null;
  hhTest: BenchmarkTest | null;
}

function aggregateGeo(surveys: SurveyRow[], level: "community" | "lga", txB: number, hhB: number): GeoRow[] {
  const map = new Map<string, GeoRow>();
  for (const s of surveys) {
    const key = level === "lga"
      ? `${norm(s.state)}|${norm(s.lga)}`
      : `${norm(s.state)}|${norm(s.lga)}|${norm(s.community_name)}`;
    let r = map.get(key);
    if (!r) {
      r = {
        key,
        label: level === "lga" ? (s.lga || "—") : (s.community_name || "Unspecified"),
        sub: level === "lga" ? (s.state || "—") : `${s.lga || "—"} · ${s.ward || "—"} · ${s.flhf_name || "—"}`,
        households: 0, cddYes: 0, treatedYes: 0, eligible: 0, offered: 0, swallowed: 0, txTest: null, hhTest: null,
      };
      map.set(key, r);
    }
    for (const h of s.households || []) {
      r.households += 1;
      if (norm(h.cdd_came) === "yes") r.cddYes += 1;
      if (norm(h.anyone_treated) === "yes") r.treatedYes += 1;
      r.eligible += personsEligible(h);
      r.offered += personsOffered(h);
      r.swallowed += personsSwallowed(h);
    }
  }
  const rows = [...map.values()].map((r) => {
    // Therapeutic coverage = swallowed ÷ eligible persons (fall back to offered
    // only for legacy rows that never captured an eligible count).
    const denom = r.eligible > 0 ? r.eligible : r.offered;
    r.txTest = denom > 0 ? testAgainstBenchmark(r.swallowed, denom, txB) : null;
    r.hhTest = r.households > 0 ? testAgainstBenchmark(r.cddYes, r.households, hhB) : null;
    return r;
  });
  return rows.sort((a, b) => pct(a.swallowed, a.eligible > 0 ? a.eligible : a.offered) - pct(b.swallowed, b.eligible > 0 ? b.eligible : b.offered));
}


/* Rich tooltip: shows the full geography name plus its LGA · Ward · FLHF path. */
function GeoChartTooltip({ active, payload, txBenchmark }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="text-xs font-bold text-foreground">{row.fullName || row.name}</div>
      {row.sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{row.sub}</div>}
      <div className="mt-1.5 space-y-0.5">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: (row.tx ?? 0) < txBenchmark ? RED : EMERALD }} />
          <span className="text-muted-foreground">Therapeutic</span>
          <span className="ml-auto font-semibold tabular-nums text-foreground">{row.tx}%</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: BLUE }} />
          <span className="text-muted-foreground">Household reach</span>
          <span className="ml-auto font-semibold tabular-nums text-foreground">{row.reach}%</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── free-text themes ─────────────────────────── */
const THEME_RULES: { label: string; tint: string; re: RegExp }[] = [
  { label: "Refusal / hesitancy", tint: RED, re: /refus|declin|reject|unwilling|reluctan|distrust|fear|rumou?r/i },
  { label: "Absence / not home", tint: SLATE, re: /absent|not\s*(at\s*)?home|away|travel|farm|market|locked|nobody/i },
  { label: "Stock-out / commodity", tint: AMBER, re: /stock\s*out|no\s*(drug|medicine|tablet)|ran\s*out|insufficient|short(age)?|expired/i },
  { label: "Timing / access", tint: BLUE, re: /time|early|late|hour|reach|distance|far|access|schedule/i },
  { label: "Sensitisation / awareness", tint: PURPLE, re: /awaren|sensiti|inform|announc|educat|mobiliz|town\s*crier/i },
  { label: "Adverse / side effects", tint: "#ec4899", re: /vomit|nausea|dizz|adverse|reaction|rash|swell|side\s*effect/i },
  { label: "Positive / satisfied", tint: EMERALD, re: /good|happy|satisf|grateful|well\s*done|cooperat|success/i },
];
function analyzeText(texts: string[]) {
  const themes = THEME_RULES.map((t) => ({ ...t, count: 0, samples: [] as string[] }));
  let total = 0;
  for (const raw of texts) {
    const n = (raw || "").trim();
    if (!n) continue;
    total += 1;
    for (const t of themes) if (t.re.test(n)) {
      t.count++;
      if (t.samples.length < 3) t.samples.push(n.length > 130 ? n.slice(0, 127) + "…" : n);
    }
  }
  return { active: themes.filter((t) => t.count > 0).sort((a, b) => b.count - a.count), total };
}

/* ─────────────────────────── UI helpers ─────────────────────────── */
function Section({ title, icon: Icon, tint, defaultOpen = true, badge, children }: {
  title: string; icon: any; tint: string; defaultOpen?: boolean; badge?: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${tint}1a`, color: tint }}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold text-foreground">{title}</span>
            {badge && <Badge variant="secondary" className="ml-1 text-[10px]">{badge}</Badge>}
            <ChevronDown className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function Verdict({ test }: { test: BenchmarkTest | null }) {
  if (!test) return <span className="text-muted-foreground">—</span>;
  const tint = test.ciBelow ? RED : test.ciAbove ? EMERALD : AMBER;
  const Icon = test.ciBelow ? TrendingDown : test.ciAbove ? TrendingUp : Target;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: `${tint}1a`, color: tint }} title={test.interpretation}>
      <Icon className="h-3 w-3" />
      {test.ciBelow ? "Below" : test.ciAbove ? "Above" : "At target"}
    </span>
  );
}

function Kpi({ label, value, sub, icon: Icon, tint }: { label: string; value: string; sub?: string; icon: any; tint: string }) {
  return (
    <div className="rounded-xl border border-border p-3" style={{ background: `linear-gradient(135deg, ${tint}12, transparent 70%)` }}>
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><Icon className="h-3 w-3" />{label}</p>
      <p className="font-display text-2xl font-bold" style={{ color: tint }}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function DistBar({ title, icon: Icon, tint, data }: {
  title: string; icon: any; tint: string; data: { label: string; count: number; color: string }[];
}) {
  const total = data.reduce((a, d) => a + d.count, 0);
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground"><Icon className="h-3.5 w-3.5" style={{ color: tint }} />{title}</p>
      {total === 0 ? (
        <p className="text-[11px] text-muted-foreground">No responses recorded.</p>
      ) : (
        <div className="space-y-2">
          {data.map((d) => {
            const p = pct(d.count, total);
            return (
              <div key={d.label}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-foreground">{d.label}</span>
                  <span className="tabular-nums text-muted-foreground">{d.count} · {p.toFixed(0)}%</span>
                </div>
                <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${p}%`, background: d.color }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── component ─────────────────────────── */
interface Props {
  projectId?: string | null;
  stateFilter?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export default function RepeatHcsAnalysis({ projectId, stateFilter, dateFrom, dateTo }: Props) {
  const [rows, setRows] = useState<SurveyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [txBenchmark, setTxBenchmark] = useState(DEFAULT_TX_BENCHMARK);
  const hhBenchmark = HH_BENCHMARK; // fixed 100% household reach target — not user-editable
  const [geoLevel, setGeoLevel] = useState<"lga" | "community">("lga");
  const [commSearch, setCommSearch] = useState("");
  const [commSort, setCommSort] = useState<"count-desc" | "count-asc" | "name">("count-desc");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let q = supabase
          .from("household_coverage_surveys" as any)
          .select("id,state,lga,ward,flhf_name,community_name,settlement_name,user_id,target_households,completed_households,shortfall_reason,households,created_at")
          .order("created_at", { ascending: false })
          .limit(2000);
        if (projectId) q = q.eq("project_id", projectId);
        if (stateFilter) q = q.eq("state", stateFilter);
        if (dateFrom) q = q.gte("created_at", dateFrom);
        if (dateTo) q = q.lte("created_at", dateTo);
        const { data, error } = await q;
        if (error) throw error;
        if (!cancelled) setRows((data as any) || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load coverage survey data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, stateFilter, dateFrom, dateTo, reloadKey]);

  const analysis = useMemo(() => {
    const allHh: HouseholdRecord[] = rows.flatMap((r) => r.households || []);
    const totalHh = allHh.length;
    const cddYes = allHh.filter((h) => norm(h.cdd_came) === "yes").length;
    const treatedYes = allHh.filter((h) => norm(h.anyone_treated) === "yes").length;
    const eligible = allHh.reduce((a, h) => a + personsEligible(h), 0);
    const offered = allHh.reduce((a, h) => a + personsOffered(h), 0);
    const swallowed = allHh.reduce((a, h) => a + personsSwallowed(h), 0);

    // Therapeutic Coverage Rate = actually_swallowed ÷ eligible_persons.
    // Fall back to offered only for legacy rows lacking an eligible count.
    const txDenom = eligible > 0 ? eligible : offered;
    const txTest = txDenom > 0 ? testAgainstBenchmark(swallowed, txDenom, txBenchmark) : null;
    const hhTest = totalHh > 0 ? testAgainstBenchmark(cddYes, totalHh, hhBenchmark) : null;

    const count = (key: keyof HouseholdRecord, val: string) => allHh.filter((h) => norm(h[key] as any) === val).length;

    const satisfaction = [
      { label: "Very satisfied", count: count("f3_satisfied", "very"), color: EMERALD },
      { label: "Satisfied", count: count("f3_satisfied", "satisfied"), color: TEAL },
      { label: "Not satisfied", count: count("f3_satisfied", "not"), color: RED },
      { label: "No opinion", count: count("f3_satisfied", "noopinion"), color: SLATE },
    ];
    const height = [
      { label: "Asked (dose-pole used)", count: count("f1_asked_height", "yes"), color: EMERALD },
      { label: "Not asked", count: count("f1_asked_height", "no"), color: RED },
      { label: "Not applicable", count: count("f1_asked_height", "na"), color: SLATE },
    ];
    const sideEffects = [
      { label: "Reported side effects", count: count("side_effects", "yes"), color: RED },
      { label: "No side effects", count: count("side_effects", "no"), color: EMERALD },
      { label: "Don't know", count: count("side_effects", "dontknow"), color: SLATE },
    ];
    const cdd = [
      { label: "CDD visited", count: cddYes, color: EMERALD },
      { label: "No visit", count: count("cdd_came", "no"), color: RED },
      { label: "Don't know", count: count("cdd_came", "dontknow"), color: SLATE },
    ];

    const aeYes = allHh.filter((h) => norm(h.side_effects) === "yes");
    const aeReported = aeYes.filter((h) => h.ae_reported).length;

    const satisfiedPct = pct(
      count("f3_satisfied", "very") + count("f3_satisfied", "satisfied"),
      satisfaction.reduce((a, d) => a + d.count, 0),
    );

    const suggestions = analyzeText(allHh.map((h) => h.suggestions || ""));
    const reasons = analyzeText([
      ...allHh.map((h) => h.f4_why || ""),
      ...rows.map((r) => r.shortfall_reason || ""),
    ]);
    const aeDetails = analyzeText(aeYes.map((h) => h.side_effects_detail || ""));

    const geoRows = aggregateGeo(rows, geoLevel, txBenchmark, hhBenchmark);
    // Plot EVERY geography (all LGAs, or all communities) — never a subset.
    const chartRows = geoRows.map((r) => ({
      name: r.label.length > 16 ? r.label.slice(0, 15) + "…" : r.label,
      fullName: r.label,
      sub: r.sub,
      tx: Math.round(Math.min(100, pct(r.swallowed, r.eligible > 0 ? r.eligible : r.offered)) * 10) / 10,
      reach: Math.round(pct(r.cddYes, r.households) * 10) / 10,
    }));

    // Households sampled per community (colourful read-out).
    const commMap = new Map<string, { label: string; sub: string; count: number }>();
    for (const s of rows) {
      const key = `${norm(s.state)}|${norm(s.lga)}|${norm(s.community_name)}`;
      let c = commMap.get(key);
      if (!c) {
        c = { label: s.community_name || "Unspecified", sub: `${s.lga || "—"} · ${s.ward || "—"} · ${s.flhf_name || "—"}`, count: 0 };
        commMap.set(key, c);
      }
      c.count += (s.households || []).length;
    }
    const communitySampled = [...commMap.values()].sort((a, b) => b.count - a.count);

    return {
      communitySampled,
      totalSurveys: rows.length, totalHh, cddYes, treatedYes, eligible, offered, swallowed,
      reachPct: pct(cddYes, totalHh),
      txPct: Math.min(100, pct(swallowed, txDenom)),
      treatPct: pct(treatedYes, totalHh),
      txTest, hhTest, satisfaction, height, sideEffects, cdd,
      aeCount: aeYes.length, aeReported, satisfiedPct,
      suggestions, reasons, aeDetails, geoRows, chartRows,
      communities: new Set(rows.map((r) => `${norm(r.state)}|${norm(r.lga)}|${norm(r.community_name)}`)).size,
      lgas: new Set(rows.map((r) => `${norm(r.state)}|${norm(r.lga)}`)).size,
    };
  }, [rows, txBenchmark, hhBenchmark, geoLevel]);

  if (loading) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin opacity-60" />
        Loading Repeat Household Coverage Survey analytics…
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-7 w-7 text-amber-500" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setReloadKey((k) => k + 1)}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Retry
        </Button>
      </Card>
    );
  }
  if (analysis.totalHh === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        <Home className="mx-auto mb-2 h-7 w-7 opacity-40" />
        No Repeat Household Coverage Survey records captured yet for this scope.
      </Card>
    );
  }

  const a = analysis;

  return (
    <div className="space-y-3">
      {/* Header + benchmark controls */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b bg-gradient-to-r from-teal-500/10 to-cyan-500/10 p-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${TEAL}1a`, color: TEAL }}>
            <Sigma className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Repeat Household Coverage Survey — Statistical Analysis</h3>
            <p className="text-[11px] text-muted-foreground">Therapeutic & household coverage with 95% CIs, plus a robust read-out of every survey question.</p>
          </div>
          <div className="ml-auto flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-[10px] text-muted-foreground">Therapeutic target %</Label>
              <Input type="number" value={txBenchmark} min={1} max={100}
                onChange={(e) => setTxBenchmark(Math.max(1, Math.min(100, Number(e.target.value) || 0)))}
                className="h-8 w-20" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Reach target %</Label>
              <div className="flex h-8 w-20 items-center justify-center gap-1 rounded-md border border-border bg-muted/60 text-sm font-semibold text-foreground"
                title="Household reach benchmark is fixed at 100% and cannot be changed.">
                <Target className="h-3.5 w-3.5 text-emerald-600" />
                {HH_BENCHMARK}%
              </div>
            </div>
          </div>
        </div>

        <CardContent className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Surveys" value={a.totalSurveys.toLocaleString()} sub={`${a.communities} communities · ${a.lgas} LGAs`} icon={MapPinned} tint={SLATE} />
          <Kpi label="Households" value={a.totalHh.toLocaleString()} icon={Home} tint={TEAL} />
          <Kpi label="Household reach" value={`${a.reachPct.toFixed(1)}%`} sub={`${a.cddYes}/${a.totalHh} visited by CDD`} icon={Users2} tint={BLUE} />
          <Kpi label="Therapeutic Coverage Rate" value={`${a.txPct.toFixed(1)}%`} sub={`${a.swallowed.toLocaleString()}/${(a.eligible > 0 ? a.eligible : a.offered).toLocaleString()} swallowed ÷ eligible`} icon={Pill} tint={EMERALD} />
          <Kpi label="Households treated" value={`${a.treatPct.toFixed(1)}%`} sub={`${a.treatedYes}/${a.totalHh}`} icon={CheckCircle2} tint={AMBER} />
          <Kpi label="Satisfaction" value={`${a.satisfiedPct.toFixed(0)}%`} sub="satisfied or very" icon={Smile} tint={PURPLE} />
        </CardContent>
      </Card>

      {/* Coverage inference */}
      <Section title="Coverage Inference (95% Confidence Intervals)" icon={Percent} tint={EMERALD} badge={`n=${a.totalHh}`}>
        <div className="grid gap-3 pt-3 sm:grid-cols-2">
          {[
            { name: "Therapeutic coverage", obs: a.txPct, test: a.txTest, benchmark: txBenchmark, formula: `${a.swallowed.toLocaleString()} swallowed ÷ ${a.offered.toLocaleString()} offered`, has: a.offered > 0 },
            { name: "Household reach", obs: a.reachPct, test: a.hhTest, benchmark: hhBenchmark, formula: `${a.cddYes.toLocaleString()} CDD-visited ÷ ${a.totalHh.toLocaleString()} households`, has: a.totalHh > 0 },
          ].map((b) => {
            const tint = !b.test ? SLATE : b.test.ciBelow ? RED : b.test.ciAbove ? EMERALD : AMBER;
            return (
              <div key={b.name} className="rounded-xl border border-border p-3" style={{ background: `linear-gradient(135deg, ${tint}0d, transparent 70%)` }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{b.name}</span>
                  <Verdict test={b.test} />
                </div>
                <p className="mt-1 font-display text-3xl font-bold" style={{ color: tint }}>{b.has ? `${b.obs.toFixed(1)}%` : "—"}</p>
                <p className="text-[11px] text-muted-foreground">{b.formula}</p>
                {b.test && (
                  <>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      95% CI: <strong className="text-foreground">{b.test.ci95[0].toFixed(1)}–{b.test.ci95[1].toFixed(1)}%</strong> · {b.test.pValue < 0.001 ? "p < 0.001" : `p = ${b.test.pValue.toFixed(3)}`} · vs {b.benchmark}% target
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-foreground/80">{b.test.interpretation}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Geographic breakdown */}
      <Section title="Coverage by Geography" icon={MapPinned} tint={BLUE} badge={`${a.geoRows.length} ${geoLevel === "lga" ? "LGAs" : "communities"}`}>
        <div className="flex items-center gap-2 pt-3">
          {(["lga", "community"] as const).map((lvl) => (
            <button key={lvl} type="button" onClick={() => setGeoLevel(lvl)}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${geoLevel === lvl ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
              {lvl === "lga" ? "By LGA" : "By Community"}
            </button>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto">
          <div style={{ height: 256, minWidth: Math.max(560, a.chartRows.length * (geoLevel === "lga" ? 56 : 68)) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={a.chartRows} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={54} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
              <RTooltip content={<GeoChartTooltip txBenchmark={txBenchmark} />} />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                payload={[
                  { value: `Therapeutic coverage ≥ ${txBenchmark}% target`, type: "square", id: "tx-ok", color: EMERALD },
                  { value: `Therapeutic coverage < ${txBenchmark}% target`, type: "square", id: "tx-low", color: RED },
                  { value: "Household reach", type: "square", id: "reach", color: BLUE },
                  { value: `${txBenchmark}% target line`, type: "plainline", id: "target", color: EMERALD, payload: { strokeDasharray: "4 4" } as any },
                ]}
              />

              <ReferenceLine y={txBenchmark} stroke={EMERALD} strokeDasharray="4 4" />
              <Bar dataKey="tx" name="Therapeutic coverage" radius={[3, 3, 0, 0]}>
                {a.chartRows.map((r, i) => <Cell key={i} fill={r.tx < txBenchmark ? RED : EMERALD} />)}
              </Bar>
              <Bar dataKey="reach" name="Household reach" fill={BLUE} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>
        <div className="mt-3 max-h-[360px] overflow-auto rounded-lg border border-border/60 shadow-sm">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10" style={{ background: `linear-gradient(135deg, ${NAVY}, ${NAVY_SOFT})` }}>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-white">
                <th className="px-3 py-2">{geoLevel === "lga" ? "LGA" : "Community"}</th>
                <th className="px-3 py-2 text-right">HH</th>
                <th className="px-3 py-2 text-right">Reach</th>
                <th className="px-3 py-2 text-right">Therapeutic</th>
                <th className="px-3 py-2">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {a.geoRows.map((r, i) => {
                const reachV = pct(r.cddYes, r.households);
                const txV = pct(r.swallowed, r.offered);
                const txOk = txV >= txBenchmark;
                const reachOk = reachV >= hhBenchmark;
                return (
                <tr key={r.key} className={`border-t border-border/60 hover:bg-primary/5 ${i % 2 ? "bg-muted/40" : ""}`}>
                  <td className="px-3 py-2">
                    <span className="inline-block max-w-[220px] truncate rounded-md px-2 py-0.5 text-[11px] font-semibold align-middle" style={labelPillStyle(r.label)}>{r.label}</span>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{r.sub}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.households}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-block rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums" style={{ background: `${(reachOk ? EMERALD : AMBER)}1a`, color: reachOk ? EMERALD : AMBER }}>
                      {reachV.toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.offered > 0 ? (
                      <span className="inline-block rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums" style={{ background: `${(txOk ? EMERALD : RED)}1a`, color: txOk ? EMERALD : RED }}>
                        {txV.toFixed(0)}%
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2"><Verdict test={r.txTest} /></td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Full ward-level coverage matrix (LGA × Ward) */}
      <MdaCoverageMatrix surveys={rows as any} txTarget={txBenchmark} />

      {/* Duplicate submissions — side-by-side comparison with owner delete */}
      <RepeatHcsDuplicates surveys={rows as any} onDeleted={() => setReloadKey((k) => k + 1)} />


      {/* Households sampled per community */}
      <Section title="Households Sampled per Community" icon={Home} tint={TEAL} defaultOpen={false} badge={`${a.communitySampled.length} communities`}>
        {(() => {
          const s = commSearch.trim().toLowerCase();
          let list = s
            ? a.communitySampled.filter((c) => `${c.label} ${c.sub}`.toLowerCase().includes(s))
            : a.communitySampled;
          list = [...list].sort((x, y) =>
            commSort === "name" ? x.label.localeCompare(y.label)
              : commSort === "count-asc" ? x.count - y.count
              : y.count - x.count);
          const max = a.communitySampled[0]?.count || 1;
          return (
            <div className="pt-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[180px] flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={commSearch} onChange={(e) => setCommSearch(e.target.value)}
                    placeholder="Search community, ward or LGA…" className="h-8 pl-8 text-xs" />
                </div>
                <div className="flex items-center gap-1">
                  {([["count-desc", "Most HH"], ["count-asc", "Least HH"], ["name", "A–Z"]] as const).map(([k, lbl]) => (
                    <button key={k} type="button" onClick={() => setCommSort(k)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${commSort === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-muted-foreground">{list.length} shown</span>
              </div>
              {list.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No communities match your search.</p>
              ) : (
                <div className="space-y-2">
                  {list.map((c, i) => {
                    const p = pct(c.count, max);
                    const tint = [TEAL, BLUE, EMERALD, PURPLE, AMBER][i % 5];
                    return (
                      <div key={`${c.label}-${i}`} className="rounded-lg border border-border/60 p-2.5"
                        style={{ background: `linear-gradient(135deg, ${tint}0d, transparent 70%)` }}>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="min-w-0">
                            <span className="font-semibold text-foreground">{c.label}</span>
                            <span className="ml-1.5 text-muted-foreground">{c.sub}</span>
                          </span>
                          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
                            style={{ background: `${tint}1a`, color: tint }}>
                            {c.count.toLocaleString()} HH
                          </span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(4, p)}%`, background: tint }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </Section>



      {/* Question distributions */}
      <Section title="Survey Question Read-out" icon={Activity} tint={PURPLE}>
        <div className="grid gap-3 pt-3 sm:grid-cols-2">
          <DistBar title="Q1 — Did a CDD/drug distributor visit?" icon={Users2} tint={BLUE} data={a.cdd} />
          <DistBar title="F1 — Height measured before dosing (dose-pole quality)" icon={Ruler} tint={EMERALD} data={a.height} />
          <DistBar title="F2 — Satisfaction with distribution" icon={Smile} tint={PURPLE} data={a.satisfaction} />
          <DistBar title="Q5 — Side effects experienced" icon={HeartPulse} tint={RED} data={a.sideEffects} />
        </div>
      </Section>

      {/* Safety */}
      <Section title="Adverse Event Signal" icon={ShieldAlert} tint={RED} badge={`${a.aeCount} flagged`}>
        <div className="grid gap-2 pt-3 sm:grid-cols-3">
          <Kpi label="Households w/ side effects" value={a.aeCount.toLocaleString()} sub={`${pct(a.aeCount, a.totalHh).toFixed(1)}% of households`} icon={HeartPulse} tint={RED} />
          <Kpi label="Reported to facility" value={a.aeReported.toLocaleString()} sub={a.aeCount > 0 ? `${pct(a.aeReported, a.aeCount).toFixed(0)}% of AE cases` : "—"} icon={CheckCircle2} tint={EMERALD} />
          <Kpi label="Un-reported AE gap" value={(a.aeCount - a.aeReported).toLocaleString()} sub="need follow-up" icon={AlertTriangle} tint={AMBER} />
        </div>
        {a.aeDetails.total > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {a.aeDetails.active.map((t) => (
              <div key={t.label} className="rounded-lg border border-border p-2.5" style={{ background: `${t.tint}0d` }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-foreground">{t.label}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${t.tint}1a`, color: t.tint }}>{t.count}</span>
                </div>
                <ul className="mt-1 space-y-1">{t.samples.map((s, i) => <li key={i} className="text-[10px] italic text-muted-foreground">“{s}”</li>)}</ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Free-text intelligence */}
      <Section title="Community Voice — Suggestions & Reasons" icon={Lightbulb} tint={AMBER} badge={`${a.suggestions.total + a.reasons.total} responses`}>
        <div className="grid gap-4 pt-3 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-[11px] font-semibold text-muted-foreground">Improvement suggestions ({a.suggestions.total})</p>
            {a.suggestions.total === 0 ? <p className="text-[11px] text-muted-foreground">No suggestions recorded.</p> : (
              <div className="space-y-2">{a.suggestions.active.map((t) => (
                <div key={t.label} className="rounded-lg border border-border p-2.5" style={{ background: `${t.tint}0d` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-foreground">{t.label}</span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${t.tint}1a`, color: t.tint }}>{t.count} · {Math.round(pct(t.count, a.suggestions.total))}%</span>
                  </div>
                  <ul className="mt-1 space-y-1">{t.samples.map((s, i) => <li key={i} className="text-[10px] italic text-muted-foreground">“{s}”</li>)}</ul>
                </div>
              ))}</div>
            )}
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold text-muted-foreground">Satisfaction reasons & shortfalls ({a.reasons.total})</p>
            {a.reasons.total === 0 ? <p className="text-[11px] text-muted-foreground">No reasons recorded.</p> : (
              <div className="space-y-2">{a.reasons.active.map((t) => (
                <div key={t.label} className="rounded-lg border border-border p-2.5" style={{ background: `${t.tint}0d` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-foreground">{t.label}</span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${t.tint}1a`, color: t.tint }}>{t.count} · {Math.round(pct(t.count, a.reasons.total))}%</span>
                  </div>
                  <ul className="mt-1 space-y-1">{t.samples.map((s, i) => <li key={i} className="text-[10px] italic text-muted-foreground">“{s}”</li>)}</ul>
                </div>
              ))}</div>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
