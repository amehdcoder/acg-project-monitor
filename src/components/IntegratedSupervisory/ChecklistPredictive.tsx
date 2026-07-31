/**
 * Predictive Modelling panel for the Integrated Supervisory Checklist.
 *
 *  • Campaign completion forecast (days from today, calendar date, 95% CI)
 *  • Hierarchical disease-prevalence estimates (State → LGA → Ward) with 95% CI,
 *    observed-prevalence entry and empirical-Bayes model refinement
 *  • Full methodology disclosure
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  BrainCircuit, CalendarClock, ChevronDown, ChevronRight, FlaskConical,
  Gauge, Microscope, Target, TrendingUp,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ErrorBar, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { resolveChecklistValue } from "./checklistSchema";
import {
  estimatePrevalence, forecastCompletion, pct, DISEASE_PRIORS, DEFAULT_PRIOR,
  type CoveragePoint, type ObservedRecord, type PrevalenceInput, type PrevalenceUnit,
} from "@/lib/isc/predictiveModels";
import ChecklistScenarioBuilder from "./ChecklistScenarioBuilder";

const OBS_KEY = "isc.observedPrevalence";

const norm = (v: unknown) => String(v ?? "").trim();
const lower = (v: unknown) => norm(v).toLowerCase();

function loadObservations(): ObservedRecord[] {
  try {
    const raw = window.localStorage.getItem(OBS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// ── Methodology ─────────────────────────────────────────────────────────────

const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-1.5">
    <h4 className="text-sm font-semibold text-foreground">{title}</h4>
    <div className="space-y-1.5 text-[12px] leading-relaxed text-muted-foreground">{children}</div>
  </section>
);
const Formula = ({ children }: { children: React.ReactNode }) => (
  <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 px-3 py-2 text-[11px] text-foreground">{children}</pre>
);

function MethodologyDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <FlaskConical className="h-3.5 w-3.5" /> Methodology
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" /> Predictive modelling methodology
          </DialogTitle>
          <DialogDescription>
            All estimators run locally on the filtered checklist records — no AI inference
            and no network calls. Every figure below is reproducible by hand.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          <Block title="1. Campaign completion timeline — recency-weighted velocity model">
            <p>
              Geographic coverage is the cumulative count of <em>distinct</em> communities
              (deduplicated within State|LGA|Ward) visited to date. A weighted least-squares
              regression of cumulative coverage <em>y</em> on elapsed days <em>x</em> estimates
              the campaign's field velocity:
            </p>
            <Formula>{`wᵢ = 0.5^((t_last − tᵢ) / 7)        (7-day half-life)
β  = Σwᵢ(xᵢ − x̄)(yᵢ − ȳ) ⁄ Σwᵢ(xᵢ − x̄)²
SE(β) = √( Σwᵢ(yᵢ − ŷᵢ)² ⁄ (n−2) ⁄ Σwᵢ(xᵢ − x̄)² )`}</Formula>
            <p>
              Recency weights ensure the forecast tracks current throughput rather than the
              ramp-up phase. The raw velocity is then adjusted by two operational covariates
              taken from the checklist itself:
            </p>
            <Formula>{`offeredRate    = respondents answering "Yes" to
                 "Were you OFFERED the medicine(s)" ÷ respondents
haltedShare    = checklists with Status of MDA ∈ {Halted, Not Started} ÷ checklists

adjustment = (0.55 + 0.45 × offeredRate) × (1 − 0.35 × haltedShare)
v_eff      = β × adjustment`}</Formula>
            <p>
              Poor medicine-offer performance and a large halted/not-started backlog both
              depress effective throughput, so the adjustment bounds the drag at 55% of the
              observed regression slope in the worst case.
            </p>
            <Formula>{`remaining      = communitiesTargeted − communitiesVisited
days           = remaining ⁄ v_eff
CI(v)          = (β ± t₀.₉₇₅,(n−2) × SE(β)) × adjustment
days_optimistic = remaining ⁄ v_upper
days_pessimistic = remaining ⁄ v_lower
completion date = today() + days`}</Formula>
            <p>
              The 95% interval on the completion date is obtained by inverting the 95%
              confidence interval of the velocity — a wide band signals volatile field
              throughput or few submission days.
            </p>
          </Block>

          <Block title="2. Disease prevalence — hierarchical estimator with Wilson intervals">
            <p>
              Diseases are taken from <strong>MDA Campaign Type</strong>; each respondent
              interview is attributed to the campaign type of its parent checklist and to the
              State, LGA and Ward of that visit. A respondent is classified as{" "}
              <em>untreated</em> when they were not offered the medicine(s) or did not swallow
              them.
            </p>
            <Formula>{`untreatedRate = untreated respondents ⁄ respondents (per unit)
prior(d)      = endemic untreated-population baseline for disease d
p̂_raw        = prior(d) × (0.35 + 0.65 × untreatedRate)`}</Formula>
            <p>
              The 0.35 floor encodes residual prevalence retained by a fully treated
              population in the season following MDA; a fully untreated population regresses
              to the endemic baseline. The 95% interval is a <strong>Wilson score
              interval</strong> on the untreated proportion, propagated through the same
              transformation (Wilson is used in preference to Wald because ward-level
              sample sizes are small):
            </p>
            <Formula>{`centre = (p + z²/2n) ⁄ (1 + z²/n)
margin = z ⁄ (1 + z²/n) × √( p(1−p)/n + z²/4n² )      z = 1.96
CI(p̂) = prior(d) × (0.35 + 0.65 × [centre ∓ margin]) × κ`}</Formula>
          </Block>

          <Block title="3. Learning from observed prevalence — empirical-Bayes calibration">
            <p>
              When a real-world observed prevalence is entered for any administrative level,
              the model records the log-ratio between observation and model output and uses it
              as a calibration signal for all subsequent analyses:
            </p>
            <Formula>{`rᵢ = ln( observedᵢ ⁄ p̂_rawᵢ )        wᵢ = √nᵢ
κ_unit = exp( Σwᵢrᵢ ⁄ (Σwᵢ + k) )     k = 2  (shrinkage pseudo-count)`}</Formula>
            <p>
              The shrinkage constant <em>k</em> keeps a single small-sample observation from
              overwhelming the model: with little evidence κ stays near 1, and it converges to
              the observed ratio as evidence accumulates. Observations also propagate upward
              (Ward → LGA → State → disease-global) at 60% and 40% weight respectively, so
              unvisited siblings inherit a partially-pooled correction — a standard
              partial-pooling / hierarchical shrinkage design. Where a unit has no observation
              of its own, κ is composed down the hierarchy with a 0.35 decay per level.
            </p>
            <p>
              Refinement is therefore incremental and monotone: each new observation reduces
              the residual |observed − predicted| shown in the table, and the refined estimates
              are applied immediately to every subsequent State, LGA and Ward analysis.
            </p>
          </Block>

          <Block title="Caveats">
            <p>
              Prevalence estimates are model-based inferences from supervisory coverage data,
              not from clinical diagnosis; they are intended for programme triage and should be
              validated with prevalence surveys. Forecasts assume the current operating tempo
              and resourcing continue unchanged.
            </p>
          </Block>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Observed-prevalence entry ───────────────────────────────────────────────

function ObservedDialog({
  unit, onSave,
}: { unit: PrevalenceUnit; onSave: (value: number | null) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(unit.observed != null ? String(unit.observed * 100) : "");
  useEffect(() => { if (open) setDraft(unit.observed != null ? String(unit.observed * 100) : ""); }, [open, unit.observed]);
  const label = [unit.state, unit.lga, unit.ward].filter(Boolean).join(" › ");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={unit.observed != null ? "secondary" : "outline"} size="sm" className="h-7 px-2 text-[11px]">
          {unit.observed != null ? pct(unit.observed) : "Enter"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Observed prevalence</DialogTitle>
          <DialogDescription>
            {unit.disease} — {label}. Enter the prevalence measured on the ground (%). The
            model learns from this value and refines all subsequent estimates.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="observed-prevalence">Observed prevalence (%)</Label>
          <Input
            id="observed-prevalence"
            type="number" min={0} max={100} step="0.1" inputMode="decimal"
            placeholder="e.g. 12.5"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Current model estimate: <strong>{pct(unit.predicted)}</strong> (95% CI {pct(unit.low)} – {pct(unit.high)}, n={unit.n}).
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => { onSave(null); setOpen(false); }}>Clear</Button>
          <Button
            onClick={() => {
              const n = Number(draft);
              onSave(draft.trim() === "" || !Number.isFinite(n) || n < 0 ? null : Math.min(n, 100) / 100);
              setOpen(false);
            }}
          >
            Save &amp; refine model
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Prevalence cascade rows ─────────────────────────────────────────────────

function UnitRow({
  unit, depth, expandable, expanded, onToggle, onObserve,
}: {
  unit: PrevalenceUnit; depth: number; expandable: boolean; expanded: boolean;
  onToggle: () => void; onObserve: (v: number | null) => void;
}) {
  const name = unit.ward || unit.lga || unit.state;
  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="px-2 py-1.5" style={{ paddingLeft: 8 + depth * 18 }}>
        <div className="flex items-center gap-1">
          {expandable ? (
            <button type="button" onClick={onToggle} className="text-muted-foreground hover:text-foreground" aria-label="Toggle">
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : <span className="w-3.5" />}
          <span className={depth === 0 ? "font-semibold" : depth === 1 ? "font-medium" : ""}>{name}</span>
          <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px] uppercase">{unit.level}</Badge>
        </div>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{unit.n.toLocaleString()}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{pct(unit.n ? unit.untreated / unit.n : 0)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{pct(unit.predicted)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{pct(unit.low)} – {pct(unit.high)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {unit.factor === 1 ? <span className="text-muted-foreground">—</span> : `×${unit.factor.toFixed(2)}`}
      </td>
      <td className="px-2 py-1.5 text-right">
        {unit.residual != null && <span className="mr-2 text-[10px] text-muted-foreground">Δ {pct(unit.residual)}</span>}
        <ObservedDialog unit={unit} onSave={onObserve} />
      </td>
    </tr>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────

export default function ChecklistPredictive({
  parents, respondents, geoTarget,
}: {
  parents: Record<string, unknown>[];
  respondents: Record<string, unknown>[];
  geoTarget: number | null;
}) {
  const [observations, setObservations] = useState<ObservedRecord[]>(loadObservations);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [disease, setDisease] = useState<string>("");

  const persist = (next: ObservedRecord[]) => {
    setObservations(next);
    try { window.localStorage.setItem(OBS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const setObserved = (u: PrevalenceUnit, value: number | null) => {
    const id = `${u.disease}::${u.key}`;
    const rest = observations.filter((o) => o.id !== id);
    persist(value == null ? rest : [...rest, {
      id, disease: u.disease, key: u.key, level: u.level, value,
      updatedAt: new Date().toISOString(),
    }]);
  };

  // Parent lookup for respondent → geography / campaign attribution.
  const parentByKey = useMemo(() => {
    const m = new Map<string, Record<string, unknown>>();
    for (const p of parents) m.set(`${p._uuid ?? ""}|${p._id ?? ""}`, p);
    return m;
  }, [parents]);

  // ── Completion forecast inputs
  const coveragePoints = useMemo<CoveragePoint[]>(() => {
    const byDay = new Map<string, Set<string>>();
    for (const p of parents) {
      const day = norm(p._submission_time).slice(0, 10);
      const community = lower(p.COMMUNITIES);
      if (!day || !community) continue;
      const key = `${lower(p.State)}|${lower(p.LGA)}|${lower(p.Ward)}|${community}`;
      const set = byDay.get(day) ?? new Set<string>();
      set.add(key);
      byDay.set(day, set);
    }
    const days = [...byDay.keys()].sort();
    const seen = new Set<string>();
    return days.map((date) => {
      for (const k of byDay.get(date)!) seen.add(k);
      return { date, cumulative: seen.size };
    });
  }, [parents]);

  const offeredRate = useMemo(() => {
    let yesCount = 0, total = 0;
    for (const r of respondents) {
      const label = lower(resolveChecklistValue("Were_you_OFFERED_the_medicine_s", r.Were_you_OFFERED_the_medicine_s) || r.Were_you_OFFERED_the_medicine_s);
      if (!label) continue;
      total++;
      if (label.startsWith("yes")) yesCount++;
    }
    return total ? yesCount / total : 0;
  }, [respondents]);

  const statusShares = useMemo(() => {
    let halted = 0, completed = 0, total = 0;
    for (const p of parents) {
      const label = lower(resolveChecklistValue("Status_of_MDA", p.Status_of_MDA) || p.Status_of_MDA);
      if (!label) continue;
      total++;
      if (/halt|not\s*start|stopp|suspend/.test(label)) halted++;
      if (/complet/.test(label)) completed++;
    }
    return { halted: total ? halted / total : 0, completed: total ? completed / total : 0, total };
  }, [parents]);

  const forecast = useMemo(
    () => forecastCompletion({
      points: coveragePoints,
      target: geoTarget,
      offeredRate,
      haltedShare: statusShares.halted,
      completedShare: statusShares.completed,
    }),
    [coveragePoints, geoTarget, offeredRate, statusShares],
  );

  // ── Prevalence inputs
  const prevalenceRows = useMemo<PrevalenceInput[]>(() => {
    const rows: PrevalenceInput[] = [];
    for (const r of respondents) {
      const p = parentByKey.get(`${r.parent_uuid ?? ""}|${r.parent_id ?? ""}`);
      if (!p) continue;
      const dis = resolveChecklistValue("MDA_Campaign_Type", p.MDA_Campaign_Type) || norm(p.MDA_Campaign_Type);
      if (!dis) continue;
      const offered = lower(resolveChecklistValue("Were_you_OFFERED_the_medicine_s", r.Were_you_OFFERED_the_medicine_s) || r.Were_you_OFFERED_the_medicine_s);
      const swallowed = lower(resolveChecklistValue("swallow", r.swallow) || r.swallow);
      const untreated = !(offered.startsWith("yes") && swallowed.startsWith("yes"));
      rows.push({
        disease: dis,
        state: norm(p.State), lga: norm(p.LGA), ward: norm(p.Ward),
        untreated,
      });
    }
    return rows;
  }, [respondents, parentByKey]);

  const units = useMemo(() => estimatePrevalence(prevalenceRows, observations), [prevalenceRows, observations]);

  const diseases = useMemo(
    () => [...new Set(units.map((u) => u.disease))].sort(),
    [units],
  );
  const activeDisease = disease && diseases.includes(disease) ? disease : diseases[0] ?? "";

  const forDisease = useMemo(() => units.filter((u) => u.disease === activeDisease), [units, activeDisease]);
  const states = useMemo(() => forDisease.filter((u) => u.level === "state"), [forDisease]);
  const childrenOf = (key: string, level: "lga" | "ward") =>
    forDisease.filter((u) => u.level === level && u.key.startsWith(key + "|"));

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const chartData = useMemo(
    () => states.map((s) => ({
      name: s.state,
      value: s.predicted * 100,
      err: [(s.predicted - s.low) * 100, (s.high - s.predicted) * 100] as [number, number],
    })),
    [states],
  );

  const learnedCount = observations.filter((o) => o.disease === activeDisease).length;

  return (
    <div className="space-y-4">
      {/* ── Completion forecast ── */}
      <Card className="overflow-hidden border-primary/30">
        <CardHeader className="py-3 px-4 border-b bg-muted/40 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-primary" /> Predictive Modelling — MDA Campaign Completion Timeline
          </CardTitle>
          <MethodologyDialog />
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {!forecast || forecast.warning ? (
            <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
              {forecast?.warning ?? "No submissions available to model."}
            </div>
          ) : null}

          {forecast && !forecast.warning && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-[hsl(214,80%,40%)] p-4 text-white shadow-card">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <CalendarClock className="h-4 w-4" />
                  <p className="text-[11px] font-semibold uppercase tracking-wide">Projected completion</p>
                </div>
                <p className="font-display text-2xl font-bold leading-none">{forecast.days.toLocaleString()} days</p>
                <p className="mt-1.5 text-[11px] font-medium text-white/85">{forecast.date}</p>
              </div>
              <div className="rounded-xl bg-[hsl(160,55%,35%)] p-4 text-white shadow-card">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Target className="h-4 w-4" />
                  <p className="text-[11px] font-semibold uppercase tracking-wide">95% confidence band</p>
                </div>
                <p className="font-display text-lg font-bold leading-tight">
                  {forecast.daysLow}–{forecast.daysHigh} days
                </p>
                <p className="mt-1.5 text-[11px] font-medium text-white/85">{forecast.dateLow} → {forecast.dateHigh}</p>
              </div>
              <div className="rounded-xl bg-[hsl(265,50%,48%)] p-4 text-white shadow-card">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Gauge className="h-4 w-4" />
                  <p className="text-[11px] font-semibold uppercase tracking-wide">Effective velocity</p>
                </div>
                <p className="font-display text-2xl font-bold leading-none">{forecast.adjVelocity.toFixed(2)}</p>
                <p className="mt-1.5 text-[11px] font-medium text-white/85">
                  communities/day · R² {forecast.rSquared.toFixed(2)}
                </p>
              </div>
            </div>
          )}

          {forecast && (
            <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              <p>Coverage: <strong className="text-foreground">{forecast.target ? pct(forecast.coverage) : "—"}</strong> ({forecast.covered.toLocaleString()} of {forecast.target ? forecast.target.toLocaleString() : "?"} communities)</p>
              <p>Medicines offered: <strong className="text-foreground">{pct(offeredRate)}</strong> of respondents</p>
              <p>Halted / not started: <strong className="text-foreground">{pct(statusShares.halted)}</strong> of checklists</p>
              <p>Performance adjustment: <strong className="text-foreground">×{forecast.adjustment.toFixed(2)}</strong> on raw velocity {forecast.rawVelocity.toFixed(2)}/day</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Scenario builder ── */}
      <ChecklistScenarioBuilder
        points={coveragePoints}
        target={geoTarget}
        baseline={{ offeredRate, haltedShare: statusShares.halted, completedShare: statusShares.completed }}
      />

      {/* ── Prevalence modelling ── */}
      <Card className="overflow-hidden">
        <CardHeader className="py-3 px-4 border-b bg-muted/40 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Microscope className="h-4 w-4 text-primary" /> Predicted Disease Prevalence (95% CI)
          </CardTitle>
          <Badge variant={learnedCount ? "secondary" : "outline"} className="text-[10px]">
            {learnedCount ? `${learnedCount} observation${learnedCount === 1 ? "" : "s"} learned` : "Model uncalibrated"}
          </Badge>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {diseases.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
              No respondent interviews with an MDA Campaign Type are available for modelling.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {diseases.map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={d === activeDisease ? "default" : "outline"}
                    className="h-7 px-2.5 text-[11px]"
                    onClick={() => setDisease(d)}
                  >
                    {d}
                  </Button>
                ))}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Endemic baseline prior for <strong>{activeDisease}</strong>:{" "}
                {pct(DISEASE_PRIORS[activeDisease] ?? DEFAULT_PRIOR)} · estimates derive from the
                untreated share of respondents (not offered or did not swallow the medicine(s))
                and are calibrated by any observed prevalence entered below.
              </p>

              {chartData.length > 0 && (
                <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 46)}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 32 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${Number(v).toFixed(1)}%`, "Predicted prevalence"]} />
                    <Bar dataKey="value" fill="hsl(265,55%,55%)" radius={[0, 4, 4, 0]} maxBarSize={28}>
                      <ErrorBar dataKey="err" width={5} strokeWidth={1.5} stroke="hsl(215,25%,35%)" direction="x" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}

              <div className="max-h-[460px] overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-muted/60">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold">State › LGA › Ward</th>
                      <th className="px-2 py-2 text-right font-semibold">n</th>
                      <th className="px-2 py-2 text-right font-semibold">Untreated</th>
                      <th className="px-2 py-2 text-right font-semibold">Predicted</th>
                      <th className="px-2 py-2 text-right font-semibold">95% CI</th>
                      <th className="px-2 py-2 text-right font-semibold">κ</th>
                      <th className="px-2 py-2 text-right font-semibold">Observed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {states.map((s) => {
                      const lgas = childrenOf(s.key, "lga");
                      const sOpen = expanded.has(s.key);
                      return (
                        <>
                          <UnitRow
                            key={s.key} unit={s} depth={0} expandable={lgas.length > 0}
                            expanded={sOpen} onToggle={() => toggle(s.key)}
                            onObserve={(v) => setObserved(s, v)}
                          />
                          {sOpen && lgas.map((l) => {
                            const wards = childrenOf(l.key, "ward");
                            const lOpen = expanded.has(l.key);
                            return (
                              <>
                                <UnitRow
                                  key={l.key} unit={l} depth={1} expandable={wards.length > 0}
                                  expanded={lOpen} onToggle={() => toggle(l.key)}
                                  onObserve={(v) => setObserved(l, v)}
                                />
                                {lOpen && wards.map((w) => (
                                  <UnitRow
                                    key={w.key} unit={w} depth={2} expandable={false}
                                    expanded={false} onToggle={() => {}}
                                    onObserve={(v) => setObserved(w, v)}
                                  />
                                ))}
                              </>
                            );
                          })}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" />
                κ is the learned calibration multiplier. Entering an observed prevalence updates κ
                immediately and refines every subsequent State, LGA and Ward estimate.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
