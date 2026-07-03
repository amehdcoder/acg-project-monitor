import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Cell, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Activity, ChevronDown, Home, Users2, Percent, Sigma, FileText,
  Search, TrendingDown, TrendingUp, CheckCircle2, AlertTriangle, Target,
  SlidersHorizontal, RotateCcw, ChevronRight, X, AlertCircle, Loader2, Building2,
} from "lucide-react";
import { testAgainstBenchmark, type BenchmarkTest } from "@/lib/ces/coverageStats";

// ── Default benchmarks (user-configurable in the UI) ─────────────────────────
const DEFAULT_HH_BENCHMARK = 100; // Household reach target (%)
const DEFAULT_TX_BENCHMARK = 75;  // Therapeutic / treatment coverage target (%)

const EMERALD = "#10b981";
const RED = "#ef4444";
const AMBER = "#f59e0b";
const BLUE = "#2563eb";
const TEAL = "#14b8a6";
const SLATE = "#64748b";

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Minimal shape this analysis needs from a household visit point. */
export interface HCAPoint {
  id: string;
  community: string;
  state: string;
  lga: string;
  ward: string;
  status: string;
  eligible: number | null;
  treated: number | null;
  notes: string | null;
}

interface CommunityRow {
  key: string;
  community: string;
  lga: string;
  state: string;
  households: number;
  treatedHouseholds: number;
  eligible: number;
  treated: number;
  hhReachPct: number;       // treated households / households
  txCoveragePct: number;    // treated persons / eligible persons
  txTest: BenchmarkTest | null;
  hhTest: BenchmarkTest | null;
  notesCount: number;
  /** households with missing/zero eligible persons (excluded from tx coverage). */
  missingEligible: number;
  /** households with missing/zero treated persons. */
  missingTreated: number;
  visits: HCAPoint[];
}

// ── Notes thematic analysis ──────────────────────────────────────────────────
const STOPWORDS = new Set(
  ("the a an and or but to of in on at for with was were is are be been being this that these those it its as by from not no yes we they he she " +
   "i you them his her their our had has have do did does will would could should can may might because so if then than there here when where which who whom " +
   "household house members member during after before about into out up down over under again further once").split(" "),
);

const THEME_RULES: { label: string; tint: string; re: RegExp }[] = [
  { label: "Refusal / hesitancy", tint: RED, re: /refus|declin|reject|unwilling|reluctan|hesitan|distrust|fear|side\s*effect|rumou?r/i },
  { label: "Absence / not home", tint: SLATE, re: /absent|not\s*(at\s*)?home|away|travel|farm|market|nobody|locked|empty/i },
  { label: "Stock-out / commodity", tint: AMBER, re: /stock\s*out|no\s*(drug|medicine|commodit|tablet)|ran\s*out|insufficient|short(age)?|expired/i },
  { label: "Eligibility issues", tint: BLUE, re: /pregnan|breastfeed|sick|ill|too\s*young|under\s*age|too\s*old|ineligibl|exempt/i },
  { label: "Adverse reaction", tint: "#ec4899", re: /vomit|nausea|dizz|adverse|reaction|rash|swell|side\s*effect|complain/i },
  { label: "Positive / cooperative", tint: EMERALD, re: /cooperat|willing|happy|received|treated|complet|success|good|grateful/i },
];

function analyzeNotes(notes: string[]) {
  const themes = THEME_RULES.map((t) => ({ ...t, count: 0, samples: [] as string[] }));
  const wordFreq = new Map<string, number>();
  for (const raw of notes) {
    const n = raw.trim();
    if (!n) continue;
    for (const t of themes) {
      if (t.re.test(n)) {
        t.count++;
        if (t.samples.length < 3) t.samples.push(n.length > 140 ? n.slice(0, 137) + "…" : n);
      }
    }
    for (const w of n.toLowerCase().match(/[a-z]{3,}/g) || []) {
      if (STOPWORDS.has(w)) continue;
      wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
    }
  }
  const topWords = [...wordFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  const activeThemes = themes.filter((t) => t.count > 0).sort((a, b) => b.count - a.count);
  return { activeThemes, topWords, total: notes.filter((n) => n.trim()).length };
}

interface Props {
  points: HCAPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

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

function aggregate(visits: HCAPoint[], txBenchmark: number, hhBenchmark: number): CommunityRow[] {
  const map = new Map<string, CommunityRow>();
  for (const p of visits) {
    const key = `${norm(p.state)}|${norm(p.lga)}|${norm(p.community)}`;
    let r = map.get(key);
    if (!r) {
      r = {
        key, community: p.community || "Unspecified", lga: p.lga || "—", state: p.state || "—",
        households: 0, treatedHouseholds: 0, eligible: 0, treated: 0,
        hhReachPct: 0, txCoveragePct: 0, txTest: null, hhTest: null, notesCount: 0,
        missingEligible: 0, missingTreated: 0, visits: [],
      };
      map.set(key, r);
    }
    r.visits.push(p);
    r.households += 1;
    const treatedHH = norm(p.status) === "treated" || (p.treated ?? 0) > 0;
    if (treatedHH) r.treatedHouseholds += 1;
    r.eligible += Math.max(0, Number(p.eligible) || 0);
    r.treated += Math.max(0, Number(p.treated) || 0);
    if (!((p.eligible ?? 0) > 0)) r.missingEligible += 1;
    if (!((p.treated ?? 0) > 0)) r.missingTreated += 1;
    if (p.notes && p.notes.trim()) r.notesCount += 1;
  }
  const rows = [...map.values()].map((r) => {
    r.hhReachPct = r.households > 0 ? (r.treatedHouseholds / r.households) * 100 : 0;
    r.txCoveragePct = r.eligible > 0 ? (r.treated / r.eligible) * 100 : 0;
    r.txTest = r.eligible > 0 ? testAgainstBenchmark(r.treated, r.eligible, txBenchmark) : null;
    r.hhTest = r.households > 0 ? testAgainstBenchmark(r.treatedHouseholds, r.households, hhBenchmark) : null;
    return r;
  });
  return rows.sort((a, b) => a.txCoveragePct - b.txCoveragePct);
}

interface LgaRow {
  key: string;
  lga: string;
  state: string;
  communities: number;
  households: number;
  treatedHouseholds: number;
  eligible: number;
  treated: number;
  hhReachPct: number;
  txCoveragePct: number;
  txTest: BenchmarkTest | null;
  hhTest: BenchmarkTest | null;
  missingEligible: number;
  belowCommunities: number; // communities significantly below the tx benchmark
}

/** Aggregate household visits up to the LGA level (state-wide coverage insight). */
function aggregateLga(rows: CommunityRow[], txBenchmark: number, hhBenchmark: number): LgaRow[] {
  const map = new Map<string, LgaRow>();
  for (const c of rows) {
    const key = `${norm(c.state)}|${norm(c.lga)}`;
    let r = map.get(key);
    if (!r) {
      r = {
        key, lga: c.lga || "—", state: c.state || "—",
        communities: 0, households: 0, treatedHouseholds: 0, eligible: 0, treated: 0,
        hhReachPct: 0, txCoveragePct: 0, txTest: null, hhTest: null,
        missingEligible: 0, belowCommunities: 0,
      };
      map.set(key, r);
    }
    r.communities += 1;
    r.households += c.households;
    r.treatedHouseholds += c.treatedHouseholds;
    r.eligible += c.eligible;
    r.treated += c.treated;
    r.missingEligible += c.missingEligible;
    if (c.txTest?.ciBelow) r.belowCommunities += 1;
  }
  const out = [...map.values()].map((r) => {
    r.hhReachPct = r.households > 0 ? (r.treatedHouseholds / r.households) * 100 : 0;
    r.txCoveragePct = r.eligible > 0 ? (r.treated / r.eligible) * 100 : 0;
    r.txTest = r.eligible > 0 ? testAgainstBenchmark(r.treated, r.eligible, txBenchmark) : null;
    r.hhTest = r.households > 0 ? testAgainstBenchmark(r.treatedHouseholds, r.households, hhBenchmark) : null;
    return r;
  });
  return out.sort((a, b) => a.txCoveragePct - b.txCoveragePct);
}

// ── Community drill-down dialog ──────────────────────────────────────────────
function CommunityDrillDown({ row, txBenchmark, hhBenchmark, onClose }: {
  row: CommunityRow; txBenchmark: number; hhBenchmark: number; onClose: () => void;
}) {
  const notesInsight = useMemo(() => analyzeNotes(row.visits.map((p) => p.notes || "")), [row]);
  const kpis = [
    { label: "Households", value: row.households, icon: Home, tint: TEAL },
    { label: "Treated households", value: row.treatedHouseholds, icon: CheckCircle2, tint: EMERALD },
    { label: "Persons eligible", value: row.eligible, icon: Users2, tint: BLUE },
    { label: "Persons treated", value: row.treated, icon: Percent, tint: AMBER },
  ];
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[min(96vw,820px)] max-w-none overflow-y-auto p-0">
        <DialogHeader className="sticky top-0 z-10 rounded-t-lg p-4 text-white"
          style={{ background: "linear-gradient(135deg,#0c2340,#14b8a6)" }}>
          <DialogTitle className="text-base font-bold text-white">{row.community}</DialogTitle>
          <DialogDescription className="text-xs text-white/75">
            {row.lga} · {row.state} — community-only drill-down ({row.households} household record{row.households === 1 ? "" : "s"})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-lg border border-border p-3" style={{ background: `${k.tint}0d` }}>
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><k.icon className="h-3 w-3" />{k.label}</p>
                <p className="font-display text-xl font-bold" style={{ color: k.tint }}>{k.value.toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Calculations */}
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { name: "Therapeutic coverage", obs: row.txCoveragePct, test: row.txTest, benchmark: txBenchmark,
                formula: `${row.treated.toLocaleString()} treated ÷ ${row.eligible.toLocaleString()} eligible`, has: row.eligible > 0 },
              { name: "Household reach", obs: row.hhReachPct, test: row.hhTest, benchmark: hhBenchmark,
                formula: `${row.treatedHouseholds.toLocaleString()} ÷ ${row.households.toLocaleString()} households`, has: row.households > 0 },
            ].map((b) => {
              const tint = !b.test ? SLATE : b.test.ciBelow ? RED : b.test.ciAbove ? EMERALD : AMBER;
              return (
                <div key={b.name} className="rounded-xl border border-border p-3" style={{ background: `linear-gradient(135deg, ${tint}0d, transparent 70%)` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{b.name}</span>
                    <Verdict test={b.test} />
                  </div>
                  <p className="mt-1 font-display text-2xl font-bold" style={{ color: tint }}>{b.has ? `${b.obs.toFixed(1)}%` : "—"}</p>
                  <p className="text-[11px] text-muted-foreground">{b.formula}</p>
                  {b.test && (
                    <>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        95% CI: <strong className="text-foreground">{b.test.ci95[0].toFixed(1)}–{b.test.ci95[1].toFixed(1)}%</strong> · {b.test.pValue < 0.001 ? "p < 0.001" : `p = ${b.test.pValue.toFixed(3)}`} · vs {b.benchmark}%
                      </p>
                      <p className="mt-1 text-[11px] leading-snug text-foreground/80">{b.test.interpretation}</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {(row.missingEligible > 0 || row.missingTreated > 0) && (
            <p className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {row.missingEligible} record{row.missingEligible === 1 ? "" : "s"} with missing/zero Persons Eligible (excluded from coverage) · {row.missingTreated} with zero Persons Treated.
            </p>
          )}

          {/* Households table */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Households in this community</p>
            <div className="max-h-[280px] overflow-auto rounded-lg border border-border/60">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                  <tr className="text-left text-[11px] text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 text-right font-semibold">Eligible</th>
                    <th className="px-3 py-2 text-right font-semibold">Treated</th>
                    <th className="px-3 py-2 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {row.visits.map((v, i) => {
                    const badEl = !((v.eligible ?? 0) > 0);
                    const badTx = !((v.treated ?? 0) > 0);
                    return (
                      <tr key={v.id} className="border-t border-border/60 hover:bg-muted/40">
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 capitalize">{v.status || "—"}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${badEl ? "bg-amber-500/10 font-semibold text-amber-600 dark:text-amber-400" : ""}`}>
                          {v.eligible ?? "—"}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${badTx ? "bg-amber-500/10 font-semibold text-amber-600 dark:text-amber-400" : ""}`}>
                          {v.treated ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{v.notes?.trim() ? v.notes : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes analysis for this community */}
          {notesInsight.total > 0 ? (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Notes — thematic analysis ({notesInsight.total})</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {notesInsight.activeThemes.map((t) => (
                  <div key={t.label} className="rounded-lg border border-border p-2.5" style={{ background: `${t.tint}0d` }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-foreground">{t.label}</span>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${t.tint}1a`, color: t.tint }}>
                        {t.count} · {Math.round((t.count / notesInsight.total) * 100)}%
                      </span>
                    </div>
                    <ul className="mt-1 space-y-1">
                      {t.samples.map((s, i) => (
                        <li key={i} className="border-l-2 pl-2 text-[10px] italic text-muted-foreground" style={{ borderColor: `${t.tint}55` }}>“{s}”</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-[11px] text-muted-foreground">No free-text notes recorded for this community.</p>
          )}

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={onClose}><X className="mr-1.5 h-3.5 w-3.5" />Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function HouseholdCoverageAnalysis({ points, loading, error, onRetry }: Props) {
  const [search, setSearch] = useState("");
  const [txBenchmark, setTxBenchmark] = useState(DEFAULT_TX_BENCHMARK);
  const [hhBenchmark, setHhBenchmark] = useState(DEFAULT_HH_BENCHMARK);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  // Deduplicate visits by id — guards against any double-counting upstream.
  const visits = useMemo(() => {
    const seen = new Set<string>();
    const out: HCAPoint[] = [];
    for (const p of points) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }, [points]);

  const hasPersonData = useMemo(() => visits.some((p) => (p.eligible ?? 0) > 0), [visits]);

  // ── Validation guards ───────────────────────────────────────────────────────
  const dataQuality = useMemo(() => {
    let missingEligible = 0, missingTreated = 0, bothMissing = 0;
    for (const p of visits) {
      const badEl = !((p.eligible ?? 0) > 0);
      const badTx = !((p.treated ?? 0) > 0);
      if (badEl) missingEligible += 1;
      if (badTx) missingTreated += 1;
      if (badEl && badTx) bothMissing += 1;
    }
    const usable = visits.length - missingEligible; // contribute to therapeutic coverage
    return { missingEligible, missingTreated, bothMissing, usable, total: visits.length };
  }, [visits]);

  const communities = useMemo<CommunityRow[]>(
    () => aggregate(visits, txBenchmark, hhBenchmark),
    [visits, txBenchmark, hhBenchmark],
  );

  const lgas = useMemo<LgaRow[]>(
    () => aggregateLga(communities, txBenchmark, hhBenchmark),
    [communities, txBenchmark, hhBenchmark],
  );

  const lgaChartData = useMemo(
    () => lgas.filter((l) => l.eligible > 0).slice(0, 14).map((l) => ({
      name: l.lga.length > 16 ? l.lga.slice(0, 15) + "…" : l.lga,
      coverage: Math.round(l.txCoveragePct * 10) / 10,
      full: l.lga,
    })),
    [lgas],
  );

  // ── Programme-wide totals + benchmark tests ────────────────────────────────
  const overall = useMemo(() => {
    const households = visits.length;
    const treatedHH = visits.filter((p) => norm(p.status) === "treated" || (p.treated ?? 0) > 0).length;
    const eligible = visits.reduce((a, p) => a + Math.max(0, Number(p.eligible) || 0), 0);
    const treated = visits.reduce((a, p) => a + Math.max(0, Number(p.treated) || 0), 0);
    return {
      households, treatedHH, eligible, treated,
      hhReachPct: households > 0 ? (treatedHH / households) * 100 : 0,
      txCoveragePct: eligible > 0 ? (treated / eligible) * 100 : 0,
      hhTest: households > 0 ? testAgainstBenchmark(treatedHH, households, hhBenchmark) : null,
      txTest: eligible > 0 ? testAgainstBenchmark(treated, eligible, txBenchmark) : null,
    };
  }, [visits, txBenchmark, hhBenchmark]);

  const notesInsight = useMemo(() => analyzeNotes(visits.map((p) => p.notes || "")), [visits]);

  const filteredCommunities = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return communities;
    return communities.filter((c) => `${c.community} ${c.lga} ${c.state}`.toLowerCase().includes(q));
  }, [communities, search]);

  const selectedRow = useMemo(
    () => communities.find((c) => c.key === selectedKey) || null,
    [communities, selectedKey],
  );

  const chartData = useMemo(
    () => communities.filter((c) => c.eligible > 0).slice(0, 12).map((c) => ({
      name: c.community.length > 16 ? c.community.slice(0, 15) + "…" : c.community,
      coverage: Math.round(c.txCoveragePct * 10) / 10,
      full: c.community,
    })),
    [communities],
  );

  // ── Loading / error states ──────────────────────────────────────────────────
  if (loading) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          Loading household coverage analysis…
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div>
            <p className="text-sm font-semibold text-foreground">Couldn’t load household coverage data</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
          </div>
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Retry</Button>
          )}
        </CardContent>
      </Card>
    );
  }
  if (visits.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm"><Activity className="h-4 w-4 text-primary" />Household Coverage Analysis</CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center text-xs text-muted-foreground">
          No linked Household Coverage Survey data yet. As Coverage Evaluation 3D visits are captured against these communities, this analysis populates automatically.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header / programme summary ── */}
      <div className="overflow-hidden rounded-2xl text-white shadow-sm" style={{ background: "linear-gradient(160deg,#0c2340,#14b8a6)" }}>
        <div className="flex items-center gap-3 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10"><Sigma className="h-6 w-6" /></span>
          <div>
            <h3 className="font-display text-lg font-bold">Household Coverage Survey — Robust Analysis</h3>
            <p className="text-xs text-white/70">Coverage = (Persons Treated ÷ Persons Eligible) × 100% · benchmarked against {txBenchmark}% (treatment) &amp; {hhBenchmark}% (household reach)</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
          {[
            { label: "Households surveyed", value: overall.households.toLocaleString(), icon: Home },
            { label: "Persons eligible", value: overall.eligible.toLocaleString(), icon: Users2 },
            { label: "Persons treated", value: overall.treated.toLocaleString(), icon: CheckCircle2 },
            { label: "Communities", value: communities.length.toLocaleString(), icon: Percent },
          ].map((s) => (
            <div key={s.label} className="bg-[#0c2340]/40 px-4 py-3">
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/60"><s.icon className="h-3 w-3" />{s.label}</p>
              <p className="font-display text-xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Configurable benchmark thresholds ── */}
      <Section title="Benchmark thresholds" icon={SlidersHorizontal} tint={VIOLET_OR_BLUE} badge="configurable">
        <p className="mb-3 text-[11px] text-muted-foreground">
          Set the targets the statistical tests are run against. All coverage verdicts, charts and significance results below recompute instantly.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="tx-bm" className="text-[11px] text-muted-foreground">Therapeutic coverage benchmark (%)</Label>
            <Input id="tx-bm" type="number" min={0} max={100} value={txBenchmark}
              onChange={(e) => setTxBenchmark(clamp(Number(e.target.value)))}
              className="h-9 w-40" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hh-bm" className="text-[11px] text-muted-foreground">Household reach benchmark (%)</Label>
            <Input id="hh-bm" type="number" min={0} max={100} value={hhBenchmark}
              onChange={(e) => setHhBenchmark(clamp(Number(e.target.value)))}
              className="h-9 w-40" />
          </div>
          <Button variant="outline" size="sm" className="h-9"
            onClick={() => { setTxBenchmark(DEFAULT_TX_BENCHMARK); setHhBenchmark(DEFAULT_HH_BENCHMARK); }}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reset to {DEFAULT_TX_BENCHMARK}% / {DEFAULT_HH_BENCHMARK}%
          </Button>
        </div>
      </Section>

      {/* ── Data validation guards ── */}
      {(dataQuality.missingEligible > 0 || dataQuality.missingTreated > 0) && (
        <Section title="Data validation guards" icon={AlertTriangle} tint={AMBER}
          badge={`${dataQuality.missingEligible + dataQuality.missingTreated} flags`}>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Missing / zero Persons Eligible", value: dataQuality.missingEligible,
                hint: "Excluded from therapeutic coverage (cannot divide by zero)." },
              { label: "Missing / zero Persons Treated", value: dataQuality.missingTreated,
                hint: "Counted as 0 treated — lowers coverage where eligible > 0." },
              { label: "Both values missing", value: dataQuality.bothMissing,
                hint: "Contribute to household count only." },
            ].map((g) => (
              <div key={g.label} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="font-display text-2xl font-bold text-amber-600 dark:text-amber-400">{g.value.toLocaleString()}</p>
                <p className="text-[11px] font-semibold text-foreground">{g.label}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{g.hint}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-[11px] leading-snug text-foreground/80">
            Therapeutic coverage is computed over <strong>{dataQuality.usable.toLocaleString()}</strong> of {dataQuality.total.toLocaleString()} household records
            ({dataQuality.missingEligible.toLocaleString()} excluded for missing/zero eligibility). Excluded records do not affect the Coverage % or its
            significance test, but they reduce the effective sample size — widening confidence intervals and lowering statistical power. Highlighted cells in the
            register and drill-down mark exactly which records are affected.
          </p>
        </Section>
      )}

      {/* ── Statistical significance vs benchmarks ── */}
      <Section title="Statistical Significance vs Benchmarks" icon={Target} tint={BLUE}
        badge={`${txBenchmark}% & ${hhBenchmark}%`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { name: "Therapeutic coverage", test: overall.txTest, benchmark: txBenchmark,
              obs: overall.txCoveragePct, sub: `${overall.treated.toLocaleString()} treated of ${overall.eligible.toLocaleString()} eligible persons` },
            { name: "Household reach", test: overall.hhTest, benchmark: hhBenchmark,
              obs: overall.hhReachPct, sub: `${overall.treatedHH.toLocaleString()} of ${overall.households.toLocaleString()} households treated` },
          ].map((b) => {
            const t = b.test;
            const tint = !t ? SLATE : t.ciBelow ? RED : t.ciAbove ? EMERALD : AMBER;
            return (
              <div key={b.name} className="rounded-xl border border-border p-4" style={{ background: `linear-gradient(135deg, ${tint}0d, transparent 70%)` }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{b.name}</span>
                  <Verdict test={t} />
                </div>
                <p className="mt-1 font-display text-3xl font-bold" style={{ color: tint }}>{b.obs.toFixed(1)}%</p>
                <p className="text-[11px] text-muted-foreground">{b.sub}</p>
                {t && (
                  <>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>95% CI: <strong className="text-foreground">{t.ci95[0].toFixed(1)}–{t.ci95[1].toFixed(1)}%</strong></span>
                      <span>·</span>
                      <span>{t.pValue < 0.001 ? "p < 0.001" : `p = ${t.pValue.toFixed(3)}`}</span>
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-foreground/80">{t.interpretation}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {!hasPersonData && (
          <p className="mt-3 flex items-center gap-1.5 rounded-md bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Person-level eligible/treated counts were not recorded for these visits, so therapeutic coverage is based on household treatment flags only.
          </p>
        )}
      </Section>

      {/* ── Lowest coverage communities chart ── */}
      {chartData.length > 0 && (
        <Section title="Lowest-coverage communities" icon={TrendingDown} tint={RED} badge={`${txBenchmark}% line`}>
          <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 26)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 24, left: 8, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={96} />
              <RTooltip formatter={(v: any) => [`${v}%`, "Coverage"]} labelFormatter={(_, p: any) => p?.[0]?.payload?.full || ""} />
              <ReferenceLine x={txBenchmark} stroke={AMBER} strokeDasharray="4 4" label={{ value: `${txBenchmark}%`, fontSize: 10, fill: AMBER, position: "top" }} />
              <Bar dataKey="coverage" radius={[0, 4, 4, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.coverage < txBenchmark ? RED : EMERALD} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}

      {/* ── Household coverage summary by LGA ── */}
      <Section title="Household coverage summary by LGA" icon={Building2} tint={BLUE}
        badge={`${lgas.length} LGA${lgas.length === 1 ? "" : "s"}`}>
        <p className="mb-3 text-[11px] text-muted-foreground">
          State-wide roll-up: household visits aggregated to each LGA. Coverage = (Persons Treated ÷ Persons Eligible) × 100%,
          with a Wilson 95% confidence interval tested against the {txBenchmark}% therapeutic and {hhBenchmark}% household-reach benchmarks.
        </p>

        {lgaChartData.length > 0 && (
          <div className="mb-4">
            <ResponsiveContainer width="100%" height={Math.max(180, lgaChartData.length * 26)}>
              <BarChart data={lgaChartData} layout="vertical" margin={{ top: 5, right: 24, left: 8, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                <RTooltip formatter={(v: any) => [`${v}%`, "Coverage"]} labelFormatter={(_, p: any) => p?.[0]?.payload?.full || ""} />
                <ReferenceLine x={txBenchmark} stroke={AMBER} strokeDasharray="4 4" label={{ value: `${txBenchmark}%`, fontSize: 10, fill: AMBER, position: "top" }} />
                <Bar dataKey="coverage" radius={[0, 4, 4, 0]}>
                  {lgaChartData.map((d, i) => <Cell key={i} fill={d.coverage < txBenchmark ? RED : EMERALD} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="max-h-[440px] overflow-auto rounded-lg border border-border/60">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
              <tr className="text-left text-[11px] text-muted-foreground">
                <th className="px-3 py-2 font-semibold">LGA · State</th>
                <th className="px-3 py-2 text-right font-semibold">Comm.</th>
                <th className="px-3 py-2 text-right font-semibold">HH</th>
                <th className="px-3 py-2 text-right font-semibold">Eligible</th>
                <th className="px-3 py-2 text-right font-semibold">Treated</th>
                <th className="px-3 py-2 text-right font-semibold">Coverage</th>
                <th className="px-3 py-2 font-semibold">95% CI</th>
                <th className="px-3 py-2 font-semibold">vs {txBenchmark}%</th>
                <th className="px-3 py-2 text-right font-semibold">HH reach</th>
                <th className="px-3 py-2 font-semibold">vs {hhBenchmark}%</th>
              </tr>
            </thead>
            <tbody>
              {lgas.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">No LGA data yet.</td></tr>
              ) : lgas.map((l) => (
                <tr key={l.key} className="border-t border-border/60 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 font-semibold text-foreground">
                      {l.lga}
                      {l.belowCommunities > 0 && (
                        <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-600 dark:text-red-400"
                          title={`${l.belowCommunities} community/communities significantly below ${txBenchmark}%`}>
                          {l.belowCommunities} below
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{l.state}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.communities}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.households.toLocaleString()}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${l.missingEligible > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{l.eligible.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.treated.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums"
                    style={{ color: l.eligible === 0 ? SLATE : l.txCoveragePct < txBenchmark ? RED : EMERALD }}>
                    {l.eligible > 0 ? `${l.txCoveragePct.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {l.txTest ? `${l.txTest.ci95[0].toFixed(1)}–${l.txTest.ci95[1].toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-2"><Verdict test={l.txTest} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.hhReachPct.toFixed(0)}%</td>
                  <td className="px-3 py-2"><Verdict test={l.hhTest} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] italic text-muted-foreground">
          LGA coverage pools every household record in the LGA (design-consistent with the community rows). “Below”/“Above” means the whole
          Wilson 95% interval falls under/over the benchmark — a statistically significant gap at 95% confidence. The red “below” chip counts
          how many communities inside the LGA are themselves significantly under the {txBenchmark}% benchmark.
        </p>
      </Section>

      {/* ── Per-community coverage register ── */}

      <Section title="Per-community coverage register" icon={Home} tint={TEAL} badge={`${communities.length}`}>
        <p className="mb-2 text-[11px] text-muted-foreground">Click any community to drill into its households, calculations and notes.</p>
        <div className="mb-2 flex justify-end">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search community…" className="h-8 w-56 pl-8 text-xs" />
          </div>
        </div>
        <div className="max-h-[440px] overflow-auto rounded-lg border border-border/60">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
              <tr className="text-left text-[11px] text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Community · LGA</th>
                <th className="px-3 py-2 text-right font-semibold">HH</th>
                <th className="px-3 py-2 text-right font-semibold">Eligible</th>
                <th className="px-3 py-2 text-right font-semibold">Treated</th>
                <th className="px-3 py-2 text-right font-semibold">Coverage</th>
                <th className="px-3 py-2 font-semibold">vs {txBenchmark}%</th>
                <th className="px-3 py-2 text-right font-semibold">HH reach</th>
                <th className="px-3 py-2 font-semibold">vs {hhBenchmark}%</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredCommunities.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No communities match “{search}”.</td></tr>
              ) : filteredCommunities.map((c) => (
                <tr key={c.key} className="cursor-pointer border-t border-border/60 hover:bg-muted/40"
                  onClick={() => setSelectedKey(c.key)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedKey(c.key); } }}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 font-semibold text-foreground">
                      {c.community}
                      {(c.missingEligible > 0 || c.missingTreated > 0) && (
                        <AlertTriangle className="h-3 w-3 text-amber-500" aria-label="Has missing/zero values" />
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{c.lga} · {c.state}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.households}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${c.missingEligible > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{c.eligible}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.treated}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums"
                    style={{ color: c.eligible === 0 ? SLATE : c.txCoveragePct < txBenchmark ? RED : EMERALD }}>
                    {c.eligible > 0 ? `${c.txCoveragePct.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-2"><Verdict test={c.txTest} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.hhReachPct.toFixed(0)}%</td>
                  <td className="px-3 py-2"><Verdict test={c.hhTest} /></td>
                  <td className="px-3 py-2 text-right"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] italic text-muted-foreground">
          Verdicts use the Wilson 95% confidence interval: “Below”/“Above” means the entire interval falls under/over the benchmark (statistically significant at 95%).
          Amber values flag missing/zero eligibility.
        </p>
      </Section>

      {/* ── Household notes thematic analysis ── */}
      <Section title="Household notes — thematic analysis" icon={FileText} tint={AMBER}
        badge={`${notesInsight.total} notes`} defaultOpen={notesInsight.total > 0}>
        {notesInsight.total === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No free-text household notes were recorded.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {notesInsight.activeThemes.map((t) => (
                <div key={t.label} className="rounded-lg border border-border p-3" style={{ background: `${t.tint}0d` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{t.label}</span>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${t.tint}1a`, color: t.tint }}>
                      {t.count} · {Math.round((t.count / notesInsight.total) * 100)}%
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {t.samples.map((s, i) => (
                      <li key={i} className="border-l-2 pl-2 text-[11px] italic text-muted-foreground" style={{ borderColor: `${t.tint}55` }}>“{s}”</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {notesInsight.topWords.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Most frequent terms</p>
                <div className="flex flex-wrap gap-1.5">
                  {notesInsight.topWords.map(([w, n]) => (
                    <span key={w} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground"
                      style={{ fontSize: `${Math.min(14, 10 + n / 2)}px` }}>
                      {w} <span className="text-muted-foreground">×{n}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      {selectedRow && (
        <CommunityDrillDown row={selectedRow} txBenchmark={txBenchmark} hhBenchmark={hhBenchmark} onClose={() => setSelectedKey(null)} />
      )}
    </div>
  );
}

const VIOLET_OR_BLUE = "#8b5cf6";
