/**
 * Household Survey Coverage & Administrative Level Analytics.
 *
 * Design-based coverage analysis for the Integrated MDA Supervisory Checklist
 * dashboard. Every figure on this panel is derived live from the synced
 * KoboToolbox respondent records through `useKoboCoverageAnalytics`, then
 * re-validated for mathematical consistency before it is rendered.
 */
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle, ArrowDown, ArrowUp, BookOpen, CheckCircle2, ChevronLeft, ChevronRight,
  Droplets, HeartPulse, Home, Info, Search, Sigma, Siren, XCircle,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  COVERAGE_INDICATORS, pct,
  type CoverageEstimate, type CoverageLevel, type IndicatorDef, type Row,
} from "@/lib/isc/householdCoverage";
import { resolveChecklistValue } from "./checklistSchema";
import { InfoBarH } from "./charts/InfographicCharts";
import ChartRecordsDialog, { type ChartDrillSpec } from "./ChartRecordsDialog";
import { useKoboCoverageAnalytics, type AdminUnitRow, type WashRisk } from "@/hooks/useKoboCoverageAnalytics";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import DataIntegrityBadge from "./DataIntegrityBadge";

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

/** Heat colour relative to the campaign's programme target (green ≥ target, amber within 10 pp, red below). */
const heatFor = (p: number | null, target = 80) =>
  p == null ? "hsl(var(--muted-foreground))" : p >= target ? GOOD : p >= target - 10 ? WARN : BAD;

const RISK_META: Record<WashRisk, { label: string; cls: string } | null> = {
  critical: { label: "Critical Transmission Hotspot", cls: "bg-rose-100 text-rose-800 border-rose-200" },
  reinfection: { label: "High Re-Infection Risk Zone", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  controlled: { label: "Controlled / Maintenance Zone", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  watch: { label: "Watch — coverage below target", cls: "bg-sky-100 text-sky-800 border-sky-200" },
  none: null,
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
      <div className="relative mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="absolute h-full rounded-full opacity-35"
          style={{ left: `${Math.max(0, lo)}%`, width: `${Math.max(1, hi - lo)}%`, background: color }}
        />
        <div className="absolute h-full w-[2px]" style={{ left: `${Math.min(99.5, p)}%`, background: color }} />
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{ind.description}</p>
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
            question was skipped or not applicable are excluded from the denominator.
          </p>
          <p>
            <strong className="text-foreground">3. Variance &amp; 95% CI.</strong> The
            between-cluster (Taylor-linearised) variance of the ratio is used:
            <code> var(p) = m/(m−1) · Σ(xᵢ − p·nᵢ)² / (Σnᵢ)²</code>. Intervals are computed on
            the logit scale with a Student-t multiplier (df = clusters − 1) and back-transformed.
          </p>
          <p>
            <strong className="text-foreground">4. Design effect.</strong> DEFF = design
            variance ÷ simple-random-sample variance; effective sample size = n / DEFF and the
            implied intra-cluster correlation is ρ = (DEFF − 1)/(n̄ − 1). The margin of error is
            <code> 1.96 · √(p(1−p)·DEFF / n)</code>. Estimates from fewer than 5 clusters, or with
            a margin wider than ±10 pp, are flagged <em>Indicative / Low Power</em>.
          </p>
          <p>
            <strong className="text-foreground">5. Indicator definitions.</strong>{" "}
            <em>Epidemiological coverage</em> = swallowed ÷ all respondents surveyed.{" "}
            <em>Uptake</em> = swallowed ÷ those actually offered. <em>Unmet need</em> = 100% −
            offered rate. WASH indicators follow WHO/UNICEF JMP service-ladder logic.
          </p>
          <p>
            <strong className="text-foreground">6. Consistency checks.</strong> Every percentage,
            stacked segment and KPI on this panel is re-derived from the raw submissions and
            compared with the rendered value; discrepancies appear in the data-integrity badge.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type SortKey = "name" | "clusters" | "households" | "coverage" | "gap";

export default function HouseholdCoverageAnalysis({
  respondents, campaignFilter,
}: { respondents: Row[]; campaignFilter?: string | null }) {
  const [level, setLevel] = useState<CoverageLevel>("Ward");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "households", dir: "desc" });
  const debouncedSearch = useDebouncedValue(search, 300);

  const analytics = useKoboCoverageAnalytics(respondents, { campaign: campaignFilter ?? null });
  const { stats, overall, validation, showClusterAlert, refusalReasons, acceptReasons, rows } = analytics;

  const [drill, setDrill] = useState<ChartDrillSpec | null>(null);

  /** Open the record drill-down for a clicked reason bar. */
  const openReasonDrill = (title: string, field: string, category: string, color: string) => {
    const matches = rows.filter((r) => {
      const v = r[field];
      if (v == null || v === "") return false;
      return (resolveChecklistValue(field, v) || String(v)) === category;
    });
    setDrill({ title, category, color, rows: matches as Record<string, unknown>[] });
  };

  const levelRows = useMemo(() => analytics.levelTable(level), [analytics, level]);

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const base = q
      ? levelRows.filter((r) => `${r.name} ${r.parentPath}`.toLowerCase().includes(q))
      : levelRows;
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (r: AdminUnitRow) => {
      switch (sort.key) {
        case "name": return r.name.toLowerCase();
        case "clusters": return r.clusters;
        case "coverage": return r.coveragePct ?? -1;
        case "gap": return (r.coveragePct ?? 0) - 80;
        default: return r.households;
      }
    };
    return [...base].sort((a, b) => {
      const x = val(a), y = val(b);
      if (typeof x === "string" || typeof y === "string") return String(x).localeCompare(String(y)) * dir;
      return (Number(x) - Number(y)) * dir;
    });
  }, [levelRows, debouncedSearch, sort]);

  const page = useTablePagination(filteredRows, 15);
  // Keep the table anchored when the level or query changes (no layout jump).
  useEffect(() => { page.resetPage(); }, [level, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const medicine = COVERAGE_INDICATORS.filter((i) => i.group === "medicine");
  const wash = COVERAGE_INDICATORS.filter((i) => i.group === "wash");
  const epi = overall.epi_coverage;

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  const SortHead = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`px-2 py-2 font-semibold align-bottom whitespace-nowrap ${className}`}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-primary" onClick={() => toggleSort(k)}>
        {children}
        {sort.key === k && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <Card className="overflow-hidden border-emerald-200/70">
      <CardHeader className="py-3 px-4 border-b bg-gradient-to-r from-emerald-50 to-sky-50 flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Home className="h-4 w-4 text-emerald-700" />
          Household Survey Coverage &amp; Administrative Level Analytics
          <Badge variant="outline" className="ml-1 font-normal text-[10px]">design-based · 95% CI</Badge>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[10px] font-medium">
            {campaignFilter ? `Campaign: ${campaignFilter}` : "All MDA campaign types (use the dashboard filter bar)"}
          </Badge>
          <DataIntegrityBadge report={validation} label="Coverage analytics integrity" />
          <MethodologyDialog />
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {rows.length === 0 ? (
          <Empty />
        ) : (
          <>
            {/* A. Actionable dynamic narrative banner */}
            {showClusterAlert && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900">
                <Siren className="mt-[2px] h-4 w-4 shrink-0 text-amber-600" />
                <p>
                  <strong>Systemic Clustering Detected (ICC ρ = {stats.icc.toFixed(3)}, DEFF = {stats.deff.toFixed(2)}):</strong>{" "}
                  Coverage gap of {stats.gapPct.toFixed(1)}% ({stats.gapCount.toLocaleString()} households) is concentrated
                  across {stats.unreachedClusterCount.toLocaleString()} unreached community clusters.{" "}
                  <strong>Priority:</strong> Deploy mop-up teams to underperforming clusters in {stats.lowestLgaName}.
                </p>
              </div>
            )}

            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground flex items-start gap-2">
              <Info className="h-3.5 w-3.5 mt-[1px] shrink-0 text-primary" />
              <span>
                {stats.totalN.toLocaleString()} household / class respondents interviewed across{" "}
                {stats.clusters.toLocaleString()} community clusters
                {campaignFilter ? ` for the ${campaignFilter} campaign` : " across all MDA campaign types"}.{" "}
                Offered {stats.offeredPct.toFixed(1)}% · Epidemiological coverage {stats.swallowedPct.toFixed(1)}% ·
                Uptake {stats.uptakePct.toFixed(1)}% · Unmet need {stats.unmetNeedPct.toFixed(1)}%.
              </span>
            </div>

            {/* Medicine coverage cards */}
            <div>
              <p className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                <HeartPulse className="h-3.5 w-3.5 text-rose-600" /> Medicine coverage &amp; uptake
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {medicine.map((ind) => <IndicatorCard key={ind.key} ind={ind} est={overall[ind.key]} />)}
              </div>
            </div>

            {/* WASH cards */}
            <div>
              <p className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                <Droplets className="h-3.5 w-3.5 text-sky-600" /> WASH infrastructure &amp; practice
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {wash.map((ind) => <IndicatorCard key={ind.key} ind={ind} est={overall[ind.key]} />)}
              </div>
            </div>

            {/* B. Statistical sampling strip (live) */}
            {epi && epi.n > 0 && (
              <div className="grid gap-3 sm:grid-cols-4 text-[11px]">
                {[
                  { l: "Effective sample size", v: stats.effectiveSample.toLocaleString(), s: `The ${epi.n.toLocaleString()} interviews carry only as much statistical information as this many independent households.` },
                  { l: "Design effect (DEFF)", v: stats.deff.toFixed(2), s: stats.deff > 2 ? "Strong clustering — widen the sample across more communities." : "Acceptable clustering versus a random household sample." },
                  { l: "Intra-cluster correlation (ICC ρ)", v: stats.icc.toFixed(3), s: "Similarity between households in the same community: 0 = independent, 1 = identical answers." },
                  { l: "Margin of error", v: `±${stats.marginOfError.toFixed(1)} pp`, s: "Half-width of the 95% interval on treatment (swallowed) coverage, in percentage points." },
                ].map((k) => (
                  <div key={k.l} className="rounded-lg border bg-muted/20 px-3 py-2">
                    <p className="uppercase tracking-wide text-[10px] font-semibold text-muted-foreground">{k.l}</p>
                    <p className="font-display text-lg font-bold leading-tight">{k.v}</p>
                    <p className="text-[10px] text-muted-foreground">{k.s}</p>
                  </div>
                ))}
              </div>
            )}

            {/* C. Administrative aggregation table */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <Sigma className="h-3.5 w-3.5 text-primary" />
                  Coverage generalised by administrative level
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={`Search ${level.toLowerCase()}…`}
                      className="h-7 w-[180px] pl-7 text-[11px]"
                    />
                  </div>
                  <Tabs value={level} onValueChange={(v) => setLevel(v as CoverageLevel)}>
                    <TabsList className="h-7">
                      {(["State", "LGA", "Ward", "Community"] as CoverageLevel[]).map((l) => (
                        <TabsTrigger key={l} value={l} className="text-[11px] px-2.5 py-1">{l}</TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              </div>

              <div className="min-h-[240px]">
                {filteredRows.length === 0 ? (
                  <Empty label="No units match this level / search" />
                ) : (
                  <div className="overflow-auto rounded-md border">
                    <table className="w-full min-w-[1080px] text-xs">
                      <thead className="bg-muted/60 sticky top-0 z-10">
                        <tr>
                          <SortHead k="name" className="text-left">
                            {level}
                            <span className="block text-[9px] font-normal text-muted-foreground">Administrative unit</span>
                          </SortHead>
                          {level !== "State" && (
                            <th className="text-left px-2 py-2 font-semibold align-bottom whitespace-nowrap">
                              Located within
                              <span className="block text-[9px] font-normal text-muted-foreground">Parent hierarchy</span>
                            </th>
                          )}
                          <SortHead k="clusters" className="text-right">
                            Communities sampled
                            <span className="block text-[9px] font-normal text-muted-foreground">Clusters (≥5 needed)</span>
                          </SortHead>
                          <SortHead k="households" className="text-right">
                            Households interviewed
                            <span className="block text-[9px] font-normal text-muted-foreground">Sample size (n)</span>
                          </SortHead>
                          <SortHead k="coverage" className="text-right">
                            Epidemiological coverage
                            <span className="block text-[9px] font-normal text-muted-foreground">% swallowed · 95% CI</span>
                          </SortHead>
                          <th className="text-right px-2 py-2 font-semibold align-bottom whitespace-nowrap">
                            Programme target
                            <span className="block text-[9px] font-normal text-muted-foreground">By campaign type</span>
                          </th>
                          <SortHead k="gap" className="text-right">
                            Distance to target
                            <span className="block text-[9px] font-normal text-muted-foreground">vs. campaign threshold</span>
                          </SortHead>
                          <th className="text-left px-2 py-2 font-semibold align-bottom whitespace-nowrap">
                            WASH risk classification
                            <span className="block text-[9px] font-normal text-muted-foreground">Coverage × WASH cross-analysis</span>
                          </th>
                          <th className="text-left px-2 py-2 font-semibold align-bottom whitespace-nowrap">
                            Data quality
                            <span className="block text-[9px] font-normal text-muted-foreground">Precision verdict</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.paginatedData.map((r) => {
                          const gap = r.coveragePct == null ? null : r.coveragePct - r.targetPct;
                          const risk = RISK_META[r.washRisk];
                          const under = r.coveragePct != null && r.coveragePct < r.targetPct;
                          return (
                            <tr
                              key={r.key}
                              className={`border-t hover:bg-muted/30 ${under ? "bg-rose-50/40" : ""}`}
                              title={under && r.topReason ? `Primary reported reason for non-coverage: ${r.topReason}` : undefined}
                            >
                              <td className="px-2 py-1.5 font-medium whitespace-nowrap">{r.name}</td>
                              {level !== "State" && (
                                <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{r.parentPath}</td>
                              )}
                              <td className="px-2 py-1.5 text-right tabular-nums">{r.clusters}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{r.households}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                                {r.coveragePct == null ? <span className="text-muted-foreground">—</span> : (
                                  <>
                                    <span className="font-semibold" style={{ color: heatFor(r.coveragePct, r.targetPct) }}>
                                      {r.coveragePct.toFixed(1)}%
                                    </span>
                                    <span className="block text-[10px] text-muted-foreground">
                                      {r.ciLow.toFixed(1)}–{r.ciHigh.toFixed(1)}
                                    </span>
                                  </>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-right whitespace-nowrap" title={r.targetLabel}>
                                <span className="font-semibold tabular-nums">{r.targetPct}%</span>
                                <span className="block max-w-[150px] truncate text-[10px] text-muted-foreground">
                                  {r.mixedTargets ? "Mixed campaigns · strictest" : r.targetLabel}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                                {gap == null ? "—" : (
                                  <span className="font-semibold" style={{ color: gap >= 0 ? GOOD : BAD }}>
                                    {gap >= 0 ? "+" : ""}{gap.toFixed(1)} pp
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5">
                                {risk ? (
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] font-medium ${risk.cls}`}
                                    title={`WASH access ${r.washPct == null ? "—" : `${r.washPct.toFixed(1)}%`} · open defecation ${r.openDefecationPct == null ? "—" : `${r.openDefecationPct.toFixed(1)}%`}`}
                                  >
                                    {risk.label}
                                  </Badge>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-2 py-1.5">
                                {r.lowPower ? (
                                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-medium">
                                    Indicative / Low Power
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
              </div>

              {page.totalPages > 1 && (
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    Showing {page.startIndex + 1}–{Math.min(page.startIndex + page.pageSize, page.totalItems)} of{" "}
                    {page.totalItems.toLocaleString()} {level.toLowerCase()}s
                  </span>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-6 w-6" disabled={!page.hasPrev} onClick={page.prevPage}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="tabular-nums">{page.currentPage} / {page.totalPages}</span>
                    <Button size="icon" variant="outline" className="h-6 w-6" disabled={!page.hasNext} onClick={page.nextPage}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground">
                Programme coverage targets follow the campaign type: <strong>65%</strong> for Lymphatic
                Filariasis, <strong>75%</strong> for Schistosomiasis / Soil Transmitted Helminths and{" "}
                <strong>80%</strong> for Onchocerciasis Only or Trachoma. Units mixing campaign types are
                scored against the strictest applicable threshold. Coverage is heat-mapped green at or above
                target, amber within 10 pp of target, red below that. Rows marked
                <em> Indicative / Low Power</em> have fewer than 5 community clusters or a margin of error
                wider than ±10 pp. Hover an underperforming row to see the primary reported reason for
                non-coverage. WASH risk combines coverage with improved water + sanitation access
                (high coverage / low WASH = re-infection risk; low coverage / low WASH = transmission hotspot).
              </p>
            </div>

            {/* Why households did / did not swallow */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5 text-rose-600" /> Reasons for NOT swallowing
                </p>
                {refusalReasons.length === 0 ? <Empty label="No refusals recorded" /> : (
                  <InfoBarH
                    data={refusalReasons}
                    color={BAD}
                    axisLabel="Number of respondents"
                    onSelect={(name) => openReasonDrill("Reasons for NOT swallowing", "Reason_respondent_DID_NOT_SWAL", name, BAD)}
                  />
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">Click a bar to see the respondent records behind it.</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Reasons for swallowing
                </p>
                {acceptReasons.length === 0 ? <Empty label="No acceptance reasons recorded" /> : (
                  <InfoBarH
                    data={acceptReasons}
                    color={INFO}
                    axisLabel="Number of respondents"
                    onSelect={(name) => openReasonDrill("Reasons for swallowing", "Reason_respondent_SWALLOWED_th", name, INFO)}
                  />
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">Click a bar to see the respondent records behind it.</p>
              </div>
            </div>

            <ChartRecordsDialog spec={drill} onClose={() => setDrill(null)} />

          </>
        )}
      </CardContent>
    </Card>
  );
}
