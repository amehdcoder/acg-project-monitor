import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Cell, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Activity, ChevronDown, Home, Users2, Percent, Sigma, FileText,
  Search, TrendingDown, TrendingUp, CheckCircle2, AlertTriangle, Target,
} from "lucide-react";
import { testAgainstBenchmark, type BenchmarkTest } from "@/lib/ces/coverageStats";

// ── Benchmarks ──────────────────────────────────────────────────────────────
const HH_BENCHMARK = 100; // Household reach target (%)
const TX_BENCHMARK = 75;  // Therapeutic / treatment coverage target (%)

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
  txTest: BenchmarkTest | null; // vs 75%
  hhTest: BenchmarkTest | null; // vs 100%
  notesCount: number;
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

export default function HouseholdCoverageAnalysis({ points, loading }: Props) {
  const [search, setSearch] = useState("");

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

  const hasPersonData = useMemo(
    () => visits.some((p) => (p.eligible ?? 0) > 0),
    [visits],
  );

  // ── Per-community aggregation ──────────────────────────────────────────────
  const communities = useMemo<CommunityRow[]>(() => {
    const map = new Map<string, CommunityRow>();
    for (const p of visits) {
      const key = `${norm(p.state)}|${norm(p.lga)}|${norm(p.community)}`;
      let r = map.get(key);
      if (!r) {
        r = {
          key, community: p.community || "Unspecified", lga: p.lga || "—", state: p.state || "—",
          households: 0, treatedHouseholds: 0, eligible: 0, treated: 0,
          hhReachPct: 0, txCoveragePct: 0, txTest: null, hhTest: null, notesCount: 0,
        };
        map.set(key, r);
      }
      r.households += 1;
      const treatedHH = norm(p.status) === "treated" || (p.treated ?? 0) > 0;
      if (treatedHH) r.treatedHouseholds += 1;
      r.eligible += Math.max(0, Number(p.eligible) || 0);
      r.treated += Math.max(0, Number(p.treated) || 0);
      if (p.notes && p.notes.trim()) r.notesCount += 1;
    }
    const rows = [...map.values()].map((r) => {
      r.hhReachPct = r.households > 0 ? (r.treatedHouseholds / r.households) * 100 : 0;
      r.txCoveragePct = r.eligible > 0 ? (r.treated / r.eligible) * 100 : 0;
      r.txTest = r.eligible > 0 ? testAgainstBenchmark(r.treated, r.eligible, TX_BENCHMARK) : null;
      r.hhTest = r.households > 0 ? testAgainstBenchmark(r.treatedHouseholds, r.households, HH_BENCHMARK) : null;
      return r;
    });
    return rows.sort((a, b) => a.txCoveragePct - b.txCoveragePct);
  }, [visits]);

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
      hhTest: households > 0 ? testAgainstBenchmark(treatedHH, households, HH_BENCHMARK) : null,
      txTest: eligible > 0 ? testAgainstBenchmark(treated, eligible, TX_BENCHMARK) : null,
    };
  }, [visits]);

  // ── Notes thematic analysis ────────────────────────────────────────────────
  const notesInsight = useMemo(
    () => analyzeNotes(visits.map((p) => p.notes || "")),
    [visits],
  );

  const filteredCommunities = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return communities;
    return communities.filter((c) => `${c.community} ${c.lga} ${c.state}`.toLowerCase().includes(q));
  }, [communities, search]);

  // Chart: lowest 12 communities by therapeutic coverage.
  const chartData = useMemo(
    () => communities.filter((c) => c.eligible > 0).slice(0, 12).map((c) => ({
      name: c.community.length > 16 ? c.community.slice(0, 15) + "…" : c.community,
      coverage: Math.round(c.txCoveragePct * 10) / 10,
      full: c.community,
    })),
    [communities],
  );

  if (loading) {
    return (
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading household coverage analysis…</CardContent></Card>
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
            <p className="text-xs text-white/70">Coverage = (Persons Treated ÷ Persons Eligible) × 100% · benchmarked against {TX_BENCHMARK}% (treatment) &amp; {HH_BENCHMARK}% (household reach)</p>
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

      {/* ── Statistical significance vs benchmarks ── */}
      <Section title="Statistical Significance vs Benchmarks" icon={Target} tint={BLUE}
        badge={`${TX_BENCHMARK}% & ${HH_BENCHMARK}%`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { name: "Therapeutic coverage", test: overall.txTest, benchmark: TX_BENCHMARK,
              obs: overall.txCoveragePct, sub: `${overall.treated.toLocaleString()} treated of ${overall.eligible.toLocaleString()} eligible persons` },
            { name: "Household reach", test: overall.hhTest, benchmark: HH_BENCHMARK,
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
        <Section title="Lowest-coverage communities" icon={TrendingDown} tint={RED} badge={`${TX_BENCHMARK}% line`}>
          <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 26)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 24, left: 8, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={96} />
              <RTooltip formatter={(v: any) => [`${v}%`, "Coverage"]} labelFormatter={(_, p: any) => p?.[0]?.payload?.full || ""} />
              <ReferenceLine x={TX_BENCHMARK} stroke={AMBER} strokeDasharray="4 4" label={{ value: `${TX_BENCHMARK}%`, fontSize: 10, fill: AMBER, position: "top" }} />
              <Bar dataKey="coverage" radius={[0, 4, 4, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.coverage < TX_BENCHMARK ? RED : EMERALD} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}

      {/* ── Per-community coverage register ── */}
      <Section title="Per-community coverage register" icon={Home} tint={TEAL} badge={`${communities.length}`}>
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
                <th className="px-3 py-2 font-semibold">vs {TX_BENCHMARK}%</th>
                <th className="px-3 py-2 text-right font-semibold">HH reach</th>
                <th className="px-3 py-2 font-semibold">vs {HH_BENCHMARK}%</th>
              </tr>
            </thead>
            <tbody>
              {filteredCommunities.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No communities match “{search}”.</td></tr>
              ) : filteredCommunities.map((c) => (
                <tr key={c.key} className="border-t border-border/60 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-foreground">{c.community}</div>
                    <div className="text-[10px] text-muted-foreground">{c.lga} · {c.state}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.households}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.eligible}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.treated}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums"
                    style={{ color: c.eligible === 0 ? SLATE : c.txCoveragePct < TX_BENCHMARK ? RED : EMERALD }}>
                    {c.eligible > 0 ? `${c.txCoveragePct.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-2"><Verdict test={c.txTest} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.hhReachPct.toFixed(0)}%</td>
                  <td className="px-3 py-2"><Verdict test={c.hhTest} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] italic text-muted-foreground">
          Verdicts use the Wilson 95% confidence interval: “Below”/“Above” means the entire interval falls under/over the benchmark (statistically significant at 95%).
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
    </div>
  );
}
