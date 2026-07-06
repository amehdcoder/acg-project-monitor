import { useState } from "react";
import {
  Brain, Dices, Sigma, Network, MessagesSquare, TrendingUp,
  Loader2, ChevronDown, Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAdvancedAnalytics } from "@/hooks/useAdvancedAnalytics";
import type { AdvancedAnalyticsOptions } from "@/lib/advancedAnalytics";
import type { NarrativeQuestion, NarrativeSubmission } from "@/lib/narrativeInsights";

interface Props {
  submissions: NarrativeSubmission[];
  questions: NarrativeQuestion[];
  options?: AdvancedAnalyticsOptions;
  accent?: string;
  className?: string;
}

const Bar = ({ value, accent }: { value: number; accent: string }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
    <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: accent }} />
  </div>
);

const Block = ({
  icon: Icon, title, subtitle, accent, children,
}: {
  icon: typeof Brain; title: string; subtitle: string; accent: string; children: React.ReactNode;
}) => (
  <section className="rounded-lg border bg-card/50 p-3">
    <div className="mb-1.5 flex items-center gap-2">
      <Icon className="h-4 w-4" style={{ color: accent }} />
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <span className="ml-auto hidden text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">{subtitle}</span>
    </div>
    {children}
  </section>
);

export default function AdvancedAnalyticsPanel({
  submissions, questions, options, accent = "#7C3AED", className,
}: Props) {
  const { result: a, computing } = useAdvancedAnalytics(submissions || [], questions || [], options);
  const [showAssumptions, setShowAssumptions] = useState(false);

  if (!a && computing) {
    return (
      <Card className={`overflow-hidden border-l-4 ${className || ""}`} style={{ borderLeftColor: accent }}>
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: accent }} />
          Modelling the collected data…
        </div>
      </Card>
    );
  }
  if (!a || !a.hasData) return null;

  return (
    <Card className={`overflow-hidden border-l-4 ${className || ""}`} style={{ borderLeftColor: accent }}>
      <div className="flex items-center gap-2 border-b p-4" style={{ background: `linear-gradient(90deg, ${accent}1a, transparent)` }}>
        <Brain className="h-4 w-4" style={{ color: accent }} />
        <h3 className="text-sm font-semibold text-foreground">Advanced Analytics &amp; Modelling</h3>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          {computing ? (
            <><Loader2 className="h-3 w-3 animate-spin" /> Refreshing</>
          ) : (
            <span className="hidden sm:inline">Updates in real-time</span>
          )}
        </span>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-2">
        {/* Hypothesis testing */}
        {a.hypothesis.map((h, i) => (
          <Block key={i} icon={Sigma} title={`Hypothesis test — ${h.metric}`} subtitle="ANOVA / 95% CI" accent={accent}>
            <p className="text-sm leading-relaxed text-foreground">{h.interpretation}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {h.groupsTested > 0 ? `${h.groupsTested} LGA groups • ` : ""}
              {h.significant ? "Statistically significant (p < 0.05)" : "Not statistically significant"}
            </p>
          </Block>
        ))}

        {/* Random Forest */}
        {a.randomForest && (
          <Block icon={TrendingUp} title="Random Forest — key drivers" subtitle={`n=${a.randomForest.sampleSize}`} accent={accent}>
            <p className="mb-2 text-sm leading-relaxed text-foreground">{a.randomForest.interpretation}</p>
            <ul className="space-y-1.5">
              {a.randomForest.drivers.map((d, i) => (
                <li key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate pr-2 text-foreground">{d.label}</span>
                    <span>{Math.round(d.importance)}%</span>
                  </div>
                  <Bar value={d.importance} accent={accent} />
                </li>
              ))}
            </ul>
          </Block>
        )}

        {/* Monte Carlo */}
        {a.monteCarlo && (
          <Block icon={Dices} title="Monte Carlo — likely outcomes" subtitle={`${a.monteCarlo.runs.toLocaleString()} runs`} accent={accent}>
            <p className="text-sm leading-relaxed text-foreground">{a.monteCarlo.interpretation}</p>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="rounded bg-muted px-2 py-0.5">
                90% band: {a.monteCarlo.isRate && a.monteCarlo.p95 <= 1
                  ? `${Math.round(a.monteCarlo.p05 * 100)}%–${Math.round(a.monteCarlo.p95 * 100)}%`
                  : `${a.monteCarlo.p05.toFixed(1)}–${a.monteCarlo.p95.toFixed(1)}`}
              </span>
              <span className="rounded bg-muted px-2 py-0.5">
                P(benchmark) = {Math.round(a.monteCarlo.probAbove.probability * 100)}%
              </span>
            </div>
          </Block>
        )}

        {/* Grounded Theory */}
        {a.groundedTheory && (
          <Block icon={Network} title="Grounded Theory — emerging themes" subtitle={`${a.groundedTheory.documents} responses`} accent={accent}>
            <p className="mb-2 text-sm leading-relaxed text-foreground">{a.groundedTheory.interpretation}</p>
            <div className="flex flex-wrap gap-1.5">
              {a.groundedTheory.categories.map((c, i) => (
                <span key={i} className="rounded-full border px-2 py-0.5 text-[11px] text-foreground" style={{ borderColor: `${accent}66` }}>
                  {c.name} ({c.codes.length})
                </span>
              ))}
            </div>
          </Block>
        )}

        {/* Discourse Analysis */}
        {a.discourse && (
          <Block icon={MessagesSquare} title="Discourse Analysis — how it's expressed" subtitle={`${a.discourse.documents} narratives`} accent={accent}>
            <p className="mb-2 text-sm leading-relaxed text-foreground">{a.discourse.interpretation}</p>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">Positive {a.discourse.sentiment.positive}%</span>
              <span className="rounded bg-red-50 px-2 py-0.5 text-red-700 dark:bg-red-950/40 dark:text-red-400">Negative {a.discourse.sentiment.negative}%</span>
              <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">Agency: {a.discourse.agency}</span>
              <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">Framing: {a.discourse.framing}</span>
            </div>
          </Block>
        )}
      </div>

      {/* Statistical assumptions & sample size (collapsed by default) */}
      <div className="border-t">
        <button
          type="button"
          onClick={() => setShowAssumptions((s) => !s)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left"
          aria-expanded={showAssumptions}
        >
          <Info className="h-4 w-4" style={{ color: accent }} />
          <span className="text-sm font-semibold text-foreground">Statistical assumptions &amp; sample size</span>
          <ChevronDown className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${showAssumptions ? "rotate-180" : ""}`} />
        </button>
        {showAssumptions && (
          <div className="space-y-3 px-4 pb-4 text-xs leading-relaxed text-muted-foreground">
            {a.hypothesis.length > 0 && (
              <p>
                <strong className="text-foreground">Hypothesis tests.</strong> Group differences use a one-way ANOVA
                across LGAs; the overall mean uses a Student-t 95% confidence interval. Assumptions: each record is an
                independent observation, values are roughly normally distributed within groups, and only LGAs with at
                least 2 records are compared. Sample sizes:{" "}
                {a.hypothesis.map((h, i) => (
                  <span key={i}>{i > 0 ? "; " : ""}{h.metric} across {h.groupsTested} LGA group{h.groupsTested === 1 ? "" : "s"}</span>
                ))}. Results are significant when p &lt; 0.05.
              </p>
            )}
            {a.monteCarlo && (
              <p>
                <strong className="text-foreground">Monte Carlo probabilities.</strong> {a.monteCarlo.runs.toLocaleString()} bootstrap
                resamples are drawn (with replacement) from the collected {a.monteCarlo.metric.toLowerCase()} values.
                It assumes the observed data is representative of near-future conditions and that records are exchangeable.
                Reported figures are the mean, the 5th–95th percentile band, and the probability of meeting the benchmark.
              </p>
            )}
            {a.randomForest && (
              <p>
                <strong className="text-foreground">Random Forest.</strong> An ensemble of 40 bootstrapped
                variance-reduction trees (random feature subsets) built on {a.randomForest.sampleSize} complete records.
                Importance is each field's share of explained variation in {a.randomForest.target.toLowerCase()} — it
                indicates association and priority, not proven causation.
              </p>
            )}
            {(a.groundedTheory || a.discourse) && (
              <p>
                <strong className="text-foreground">Text analytics.</strong> Grounded Theory (open → axial coding) and
                Discourse Analysis run on{" "}
                {a.groundedTheory?.documents ?? a.discourse?.documents} free-text responses. They summarise recurring
                concepts and tone; with small corpora treat them as directional signals, not definitive conclusions.
              </p>
            )}
          </div>
        )}
      </div>

      <p className="border-t px-4 py-3 text-[11px] text-muted-foreground">
        Modelling runs locally on the submissions feeding this dashboard and refreshes automatically as new data arrives (throttled + cached to keep the dashboard responsive). Interpretations are decision-support guidance, not a substitute for field judgement.
      </p>
    </Card>
  );
}
