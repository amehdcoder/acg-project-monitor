/**
 * Household Survey Coverage — design-based coverage analysis for the
 * Integrated MDA Supervisory Checklist dashboard.
 *
 * Generalises the household/class respondent interviews to the whole population
 * of the Community → Ward → LGA → State using a cluster-sample ratio estimator
 * with Taylor-linearised 95% confidence intervals (see lib/isc/householdCoverage).
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle, BookOpen, CheckCircle2, Droplets, HeartPulse, Home,
  Info, Sigma, XCircle,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  COVERAGE_INDICATORS, coverageByLevel, estimateIndicator,
  pct, reasonBreakdown,
  type CoverageEstimate, type CoverageLevel, type IndicatorDef, type Row,
} from "@/lib/isc/householdCoverage";

const GOOD = "hsl(142,71%,38%)";
const BAD = "hsl(0,72%,48%)";
const WARN = "hsl(45,95%,45%)";
const INFO = "hsl(214,85%,48%)";

const toneFor = (est: CoverageEstimate, positive: boolean) => {
  const v = positive ? est.p : 1 - est.p;
  if (v >= 0.8) return GOOD;
  if (v >= 0.65) return WARN;
  return BAD;
};

const Empty = ({ label = "No household respondents yet" }: { label?: string }) => (
  <div className="h-[160px] flex items-center justify-center text-xs text-muted-foreground">{label}</div>
);

/** Headline card for one indicator with its 95% CI. */
function IndicatorCard({ ind, est }: { ind: IndicatorDef; est: CoverageEstimate }) {
  const color = toneFor(est, ind.positive);
  const lo = est.ciLow * 100, hi = est.ciHigh * 100, p = est.p * 100;
  return (
    <div
      className="rounded-xl border bg-card p-3 shadow-sm transition-transform duration-300 hover:-translate-y-0.5"
      title={`${ind.label} — ${ind.description} Numerator: households meeting this definition. Denominator: ${ind.denominator}.`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">
          {ind.label}
        </p>
        {ind.positive
          ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color }} />
          : <XCircle className="h-3.5 w-3.5 shrink-0" style={{ color }} />}
      </div>
      <p className="font-display text-2xl font-bold leading-none mt-1.5" style={{ color }}>
        {est.n ? pct(est.p) : "—"}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
        {est.n
          ? `95% confident the true value is between ${lo.toFixed(1)}% and ${hi.toFixed(1)}%`
          : "no respondent answered this question yet"}
      </p>
      {/* CI band */}
      <div className="relative mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="absolute h-full rounded-full opacity-35"
          style={{ left: `${Math.max(0, lo)}%`, width: `${Math.max(1, hi - lo)}%`, background: color }}
        />
        <div className="absolute h-full w-[2px]" style={{ left: `${Math.min(99.5, p)}%`, background: color }} />
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
        {ind.description}
      </p>
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
        <span className="font-medium text-foreground/80">{est.x.toLocaleString()}</span> of{" "}
        <span className="font-medium text-foreground/80">{est.n.toLocaleString()}</span>{" "}
        {ind.denominator.toLowerCase()} · {est.clusters} community cluster{est.clusters === 1 ? "" : "s"} ·
        design effect {est.deff.toFixed(2)} (clustering penalty on precision)
      </p>
      {est.lowPrecision && est.n > 0 && (
        <p className="mt-1 text-[10px] font-medium text-amber-700 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Indicative only — wide interval
        </p>
      )}
    </div>
  );
}

/** Coverage cell: point estimate + CI, coloured like the supervisory registers. */
function CoverageCell({ est, positive }: { est: CoverageEstimate; positive: boolean }) {
  if (!est.n) return <td className="px-2 py-1.5 text-right text-muted-foreground">—</td>;
  const color = toneFor(est, positive);
  return (
    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
      <span className="font-semibold" style={{ color }}>{pct(est.p)}</span>
      <span className="block text-[10px] text-muted-foreground">
        {(est.ciLow * 100).toFixed(1)}–{(est.ciHigh * 100).toFixed(1)}
      </span>
    </td>
  );
}

const TABLE_INDICATORS = ["epi_coverage", "offered", "not_offered", "not_swallowed", "improved_water", "improved_sanitation", "safe_wastewater"];

function MethodologyDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-[11px]">
          <BookOpen className="h-3.5 w-3.5 mr-1" /> Methodology
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Household coverage — statistical methodology</DialogTitle>
          <DialogDescription>
            How the sampled household interviews are generalised to all households in the
            community, ward, LGA and state for the selected MDA campaign type.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
          <p>
            <strong className="text-foreground">1. Sampling frame.</strong> The supervisory
            checklist is a two-stage cluster sample: monitors visit communities (primary
            sampling units), and within each community a small number of households/classes
            are interviewed (secondary units). Respondents in the same community are
            correlated, so pooling them as if they were a simple random sample would
            understate uncertainty and let large clusters dominate the estimate.
          </p>
          <p>
            <strong className="text-foreground">2. Point estimate.</strong> Coverage is the
            self-weighting ratio estimator <code>p = Σxᵢ / Σnᵢ</code> over clusters i, where
            xᵢ households met the indicator out of nᵢ assessed. Respondents for whom the
            question was skipped or not applicable are excluded from the denominator, so
            coverage is neither inflated (by dropping non-responders from the numerator only)
            nor deflated (by counting skips as failures).
          </p>
          <p>
            <strong className="text-foreground">3. Variance &amp; 95% CI.</strong> The
            between-cluster (Taylor-linearised) variance of the ratio is used:
            <code> var(p) = m/(m−1) · Σ(xᵢ − p·nᵢ)² / (Σnᵢ)²</code>. Intervals are computed on
            the logit scale with a Student-t multiplier (df = clusters − 1) and back-transformed,
            so they remain inside 0–100% even at extreme coverage. With a single cluster there
            is no between-cluster information, so a Wilson score interval is used and the row is
            flagged as indicative.
          </p>
          <p>
            <strong className="text-foreground">4. Design effect.</strong> DEFF = design
            variance ÷ simple-random-sample variance; the effective sample size is n / DEFF and
            the implied intra-cluster correlation is ρ = (DEFF − 1)/(n̄ − 1). Estimates based on
            fewer than 5 clusters, or with a margin of error wider than ±10 percentage points,
            are marked <em>indicative only</em> and should not be reported as the coverage of
            the whole administrative unit.
          </p>
          <p>
            <strong className="text-foreground">5. Indicator definitions.</strong>{" "}
            <em>Epidemiological coverage</em> = swallowed ÷ all respondents surveyed (those never
            offered count as not treated). <em>Uptake</em> = swallowed ÷ those actually offered.
            WASH indicators follow WHO/UNICEF JMP service-ladder logic: improved water (piped,
            borehole, protected well/spring, rainwater), improved sanitation (flush, pour-flush
            or pit latrine — open defecation excluded), and contained wastewater disposal
            (closed septic/sink system or contained pit).
          </p>
          <p>
            <strong className="text-foreground">6. Interpretation.</strong> Compare the lower
            confidence bound — not the point estimate — against the programme threshold
            (e.g. 65% epidemiological coverage for STH/schistosomiasis). If the lower bound sits
            below the threshold, coverage cannot be declared achieved at that administrative level.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function HouseholdCoverageAnalysis({
  respondents, campaignFilter,
}: { respondents: Row[]; campaignFilter?: string | null }) {
  const [level, setLevel] = useState<CoverageLevel>("Ward");
  const rows = respondents;

  const overall = useMemo(() => {
    const m: Record<string, CoverageEstimate> = {};
    for (const ind of COVERAGE_INDICATORS) m[ind.key] = estimateIndicator(rows, ind);
    return m;
  }, [rows]);

  const table = useMemo(() => coverageByLevel(rows, level), [rows, level]);

  const refusalReasons = useMemo(
    () => reasonBreakdown(rows, "Reason_respondent_DID_NOT_SWAL"),
    [rows],
  );
  const acceptReasons = useMemo(
    () => reasonBreakdown(rows, "Reason_respondent_SWALLOWED_th"),
    [rows],
  );

  const tableIndicators = TABLE_INDICATORS
    .map((k) => COVERAGE_INDICATORS.find((i) => i.key === k)!)
    .filter(Boolean);

  const medicine = COVERAGE_INDICATORS.filter((i) => i.group === "medicine");
  const wash = COVERAGE_INDICATORS.filter((i) => i.group === "wash");

  const epi = overall.epi_coverage;
  const totalClusters = epi?.clusters ?? 0;

  return (
    <Card className="overflow-hidden border-emerald-200/70">
      <CardHeader className="py-3 px-4 border-b bg-gradient-to-r from-emerald-50 to-sky-50 flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Home className="h-4 w-4 text-emerald-700" />
          Household Survey Coverage
          <Badge variant="outline" className="ml-1 font-normal text-[10px]">
            design-based · 95% CI
          </Badge>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[10px] font-medium">
            {campaignFilter
              ? `Campaign: ${campaignFilter}`
              : "All MDA campaign types (use the dashboard filter bar)"}
          </Badge>
          <MethodologyDialog />
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {rows.length === 0 ? (
          <Empty />
        ) : (
          <>
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground flex items-start gap-2">
              <Info className="h-3.5 w-3.5 mt-[1px] shrink-0 text-primary" />
              <span>
                {rows.length.toLocaleString()} household respondents interviewed across{" "}
                {totalClusters.toLocaleString()} community clusters. Coverage is estimated with a
                cluster-sample ratio estimator and generalised to all households in each unit —
                point estimates are shown with their 95% confidence interval, design effect (DEFF)
                and effective sample size.
              </span>
            </div>

            {/* Medicine coverage cards */}
            <div>
              <p className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                <HeartPulse className="h-3.5 w-3.5 text-rose-600" /> Medicine coverage &amp; uptake
              </p>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                {medicine.map((ind) => (
                  <IndicatorCard key={ind.key} ind={ind} est={overall[ind.key]} />
                ))}
              </div>
            </div>

            {/* WASH cards */}
            <div>
              <p className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                <Droplets className="h-3.5 w-3.5 text-sky-600" /> WASH infrastructure &amp; practice
              </p>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {wash.map((ind) => (
                  <IndicatorCard key={ind.key} ind={ind} est={overall[ind.key]} />
                ))}
              </div>
            </div>

            {/* Effective-sample summary */}
            {epi && epi.n > 0 && (
              <div className="grid gap-3 sm:grid-cols-4 text-[11px]">
                {[
                  { l: "Effective sample size", v: Math.round(epi.neff).toLocaleString(), s: `of ${epi.n.toLocaleString()} interviews` },
                  { l: "Design effect (DEFF)", v: epi.deff.toFixed(2), s: epi.deff > 2 ? "strong clustering" : "acceptable clustering" },
                  { l: "Intra-cluster correlation", v: epi.icc.toFixed(3), s: "ρ implied by DEFF" },
                  { l: "Margin of error", v: `±${epi.marginPct.toFixed(1)} pp`, s: "on epidemiological coverage" },
                ].map((k) => (
                  <div key={k.l} className="rounded-lg border bg-muted/20 px-3 py-2">
                    <p className="uppercase tracking-wide text-[10px] font-semibold text-muted-foreground">{k.l}</p>
                    <p className="font-display text-lg font-bold leading-tight">{k.v}</p>
                    <p className="text-[10px] text-muted-foreground">{k.s}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Generalised coverage table */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <Sigma className="h-3.5 w-3.5 text-primary" />
                  Coverage generalised by administrative level
                </p>
                <Tabs value={level} onValueChange={(v) => setLevel(v as CoverageLevel)}>
                  <TabsList className="h-7">
                    {(["State", "LGA", "Ward", "Community"] as CoverageLevel[]).map((l) => (
                      <TabsTrigger key={l} value={l} className="text-[11px] px-2.5 py-1">{l}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

              {table.length === 0 ? (
                <Empty label="No units at this level" />
              ) : (
                <div className="max-h-[460px] overflow-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60 sticky top-0 z-10">
                      <tr>
                        <th className="text-left px-2 py-2 font-semibold align-bottom">
                          {level}
                          <span className="block text-[9px] font-normal text-muted-foreground">
                            Administrative unit the estimate applies to
                          </span>
                        </th>
                        {level !== "State" && (
                          <th className="text-left px-2 py-2 font-semibold align-bottom">
                            Located within
                            <span className="block text-[9px] font-normal text-muted-foreground">
                              Parent LGA / State
                            </span>
                          </th>
                        )}
                        <th className="text-right px-2 py-2 font-semibold align-bottom" title="Number of distinct communities (primary sampling units) surveyed inside this unit. More clusters = a more generalisable estimate.">
                          Communities sampled
                          <span className="block text-[9px] font-normal text-muted-foreground">
                            Clusters (≥5 needed)
                          </span>
                        </th>
                        <th className="text-right px-2 py-2 font-semibold align-bottom" title="Total household / class respondents interviewed inside this unit.">
                          Households interviewed
                          <span className="block text-[9px] font-normal text-muted-foreground">Sample size (n)</span>
                        </th>
                        {tableIndicators.map((ind) => (
                          <th key={ind.key} className="text-right px-2 py-2 font-semibold whitespace-nowrap align-bottom" title={`${ind.label} — ${ind.description} Denominator: ${ind.denominator}.`}>
                            {ind.label}
                            <span className="block text-[9px] font-normal text-muted-foreground">
                              % of {ind.denominator.toLowerCase()} · 95% CI
                            </span>
                          </th>
                        ))}
                        <th className="text-left px-2 py-2 font-semibold align-bottom" title="Whether the estimate is precise enough to be reported as the coverage of the whole unit.">
                          Can this be generalised?
                          <span className="block text-[9px] font-normal text-muted-foreground">
                            Precision verdict
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.map((r) => {
                        const e = r.estimates.epi_coverage;
                        return (
                          <tr key={r.key} className="border-t hover:bg-muted/30">
                            <td className="px-2 py-1.5 font-medium whitespace-nowrap">{r.name}</td>
                            {level !== "State" && (
                              <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                                {[r.parent, r.grandParent].filter(Boolean).join(" · ") || "—"}
                              </td>
                            )}
                            <td className="px-2 py-1.5 text-right tabular-nums">{r.communities}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{r.respondents}</td>
                            {tableIndicators.map((ind) => (
                              <CoverageCell key={ind.key} est={r.estimates[ind.key]} positive={ind.positive} />
                            ))}
                            <td className="px-2 py-1.5">
                              {e.lowPrecision ? (
                                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-medium">
                                  Indicative
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-medium">
                                  Generalisable
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Each cell shows the design-based coverage with its 95% confidence interval below.
                Green ≥ 80%, amber 65–80%, red &lt; 65% (reversed for gap indicators). Rows marked
                <em> Indicative</em> have fewer than 5 community clusters or a margin of error wider
                than ±10 pp and must not be reported as the coverage of the whole unit.
              </p>
            </div>

            {/* Why households did / did not swallow */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5 text-rose-600" /> Reasons for NOT swallowing
                </p>
                {refusalReasons.length === 0 ? <Empty label="No refusals recorded" /> : (
                  <ResponsiveContainer width="100%" height={Math.max(180, refusalReasons.length * 34)}>
                    <BarChart data={refusalReasons} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {refusalReasons.map((_, i) => <Cell key={i} fill={BAD} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Reasons for swallowing
                </p>
                {acceptReasons.length === 0 ? <Empty label="No acceptance reasons recorded" /> : (
                  <ResponsiveContainer width="100%" height={Math.max(180, acceptReasons.length * 34)}>
                    <BarChart data={acceptReasons} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {acceptReasons.map((_, i) => <Cell key={i} fill={INFO} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
