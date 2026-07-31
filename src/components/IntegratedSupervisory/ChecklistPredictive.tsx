/**
 * Predictive Modelling panel for the Integrated Supervisory Checklist.
 *
 *  • Campaign completion forecast (days from today, calendar date, 95% CI)
 *  • Scenario builder comparison
 *  • Full methodology disclosure
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { BrainCircuit, CalendarClock, FlaskConical, Gauge, Target } from "lucide-react";
import { resolveChecklistValue } from "./checklistSchema";
import {
  forecastCompletion, pct, type CoveragePoint,
} from "@/lib/isc/predictiveModels";
import ChecklistScenarioBuilder from "./ChecklistScenarioBuilder";

const norm = (v: unknown) => String(v ?? "").trim();
const lower = (v: unknown) => norm(v).toLowerCase();

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

          <Block title="Caveats">
            <p>
              Forecasts assume the current operating tempo and resourcing continue unchanged,
              and are intended for programme triage rather than contractual planning.
            </p>
          </Block>
        </div>
      </DialogContent>
    </Dialog>
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
    </div>
  );
}
