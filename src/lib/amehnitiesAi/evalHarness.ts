/**
 * evalHarness — the promotion gate for the Amehnities SLM.
 *
 * Standard small-language-model practice: a training run is never trusted just
 * because it finished. A *holdout* slice of the imported dataset is withheld
 * from training, the model is benchmarked on it immediately before and after
 * the run, and the new weights are only promoted (persisted + versioned) when
 * the key metrics did not regress beyond the configured tolerance.
 *
 * Everything here is pure and deterministic — the worker supplies the scores,
 * this module only splits data and judges the verdict.
 */
import type { TrainingExample } from "./trainingDataset";

/** A single benchmark measurement returned by the worker's forward-only scorer. */
export interface BenchmarkSample {
  at: number;
  step: number;
  loss: number;
  perplexity: number;
  accuracy: number;
  top5: number;
  confidence: number;
  windows: number;
}

/* --------------------------------------------------------------- splitting */

export interface HoldoutSplit {
  train: TrainingExample[];
  holdout: TrainingExample[];
  /** Fraction actually held out after the minimums were applied. */
  ratio: number;
}

/** Never withhold so much that the run has nothing left to learn from. */
export const MIN_TRAIN_EXAMPLES = 4;
export const DEFAULT_HOLDOUT_RATIO = 0.15;
export const MAX_HOLDOUT_EXAMPLES = 64;

/**
 * Deterministic, evenly-spaced holdout split.
 *
 * A strided selection (rather than a random sample) means the holdout covers
 * the whole file — beginning, middle and end — so a dataset that is sorted by
 * topic cannot produce a benchmark drawn from one topic only.
 */
export function holdoutSplit(
  examples: TrainingExample[],
  ratio = DEFAULT_HOLDOUT_RATIO,
): HoldoutSplit {
  const all = examples.filter((e) => (e.prompt + e.completion).trim().length > 0);
  if (all.length <= MIN_TRAIN_EXAMPLES) return { train: all, holdout: [], ratio: 0 };

  const wanted = Math.max(
    1,
    Math.min(
      MAX_HOLDOUT_EXAMPLES,
      all.length - MIN_TRAIN_EXAMPLES,
      Math.round(all.length * Math.max(0.02, Math.min(0.5, ratio))),
    ),
  );
  const stride = all.length / wanted;
  const held = new Set<number>();
  for (let i = 0; i < wanted; i++) held.add(Math.min(all.length - 1, Math.floor(i * stride + stride / 2)));

  const train: TrainingExample[] = [];
  const holdout: TrainingExample[] = [];
  all.forEach((ex, i) => (held.has(i) ? holdout : train).push(ex));
  return { train, holdout, ratio: holdout.length / all.length };
}

/* ------------------------------------------------------------------- gate */

export interface GateThresholds {
  /** Allowed relative increase in holdout loss (0.02 = 2% worse is tolerated). */
  maxLossIncrease: number;
  /** Allowed absolute drop in top-1 accuracy (0.02 = 2 points). */
  maxAccuracyDrop: number;
  /** Allowed absolute drop in top-5 hit rate. */
  maxTop5Drop: number;
  /** Allowed absolute drop in mean target confidence. */
  maxConfidenceDrop: number;
  /** Any holdout loss above this is treated as divergence regardless of delta. */
  maxAbsoluteLoss: number;
}

export const DEFAULT_GATE: GateThresholds = {
  maxLossIncrease: 0.02,
  maxAccuracyDrop: 0.02,
  maxTop5Drop: 0.03,
  maxConfidenceDrop: 0.05,
  maxAbsoluteLoss: 12,
};

export interface GateCheck {
  metric: "loss" | "perplexity" | "accuracy" | "top5" | "confidence";
  label: string;
  before: number;
  after: number;
  /** Signed change, positive meaning "the number went up". */
  delta: number;
  /** True when this check did not breach its threshold. */
  passed: boolean;
  detail: string;
}

export interface GateVerdict {
  /** False blocks promotion — the caller must roll back. */
  promote: boolean;
  /** True when there was no usable holdout, so the gate could not judge. */
  skipped: boolean;
  reason: string;
  checks: GateCheck[];
  before: BenchmarkSample | null;
  after: BenchmarkSample | null;
  thresholds: GateThresholds;
}

const pctDelta = (before: number, after: number) =>
  before > 0 ? (after - before) / before : after > 0 ? 1 : 0;

const f = (n: number, d = 4) => (Number.isFinite(n) ? n.toFixed(d) : "—");
const p = (n: number) => `${(n * 100).toFixed(1)}%`;

/**
 * Judge a training run. Promotion is blocked when holdout loss rises past
 * tolerance, when accuracy/top-5/confidence fall past tolerance, or when the
 * model diverged outright.
 */
export function evaluateGate(
  before: BenchmarkSample | null,
  after: BenchmarkSample | null,
  thresholds: Partial<GateThresholds> = {},
): GateVerdict {
  const t = { ...DEFAULT_GATE, ...thresholds };

  if (!before || !after) {
    return {
      promote: true,
      skipped: true,
      reason:
        "No holdout benchmark was available (the dataset was too small to withhold examples, or the model was not ready to score). The run was promoted without a gate.",
      checks: [],
      before,
      after,
      thresholds: t,
    };
  }

  const lossRel = pctDelta(before.loss, after.loss);
  const checks: GateCheck[] = [
    {
      metric: "loss",
      label: "Holdout loss",
      before: before.loss,
      after: after.loss,
      delta: after.loss - before.loss,
      passed: lossRel <= t.maxLossIncrease && after.loss <= t.maxAbsoluteLoss,
      detail: `${f(before.loss)} → ${f(after.loss)} (${lossRel >= 0 ? "+" : ""}${(lossRel * 100).toFixed(2)}%, tolerance +${(t.maxLossIncrease * 100).toFixed(0)}%)`,
    },
    {
      metric: "perplexity",
      label: "Holdout perplexity",
      before: before.perplexity,
      after: after.perplexity,
      delta: after.perplexity - before.perplexity,
      // Perplexity is reported for transparency; loss already gates it.
      passed: true,
      detail: `${f(before.perplexity, 2)} → ${f(after.perplexity, 2)}`,
    },
    {
      metric: "accuracy",
      label: "Top-1 accuracy",
      before: before.accuracy,
      after: after.accuracy,
      delta: after.accuracy - before.accuracy,
      passed: after.accuracy >= before.accuracy - t.maxAccuracyDrop,
      detail: `${p(before.accuracy)} → ${p(after.accuracy)} (tolerance −${(t.maxAccuracyDrop * 100).toFixed(0)} pts)`,
    },
    {
      metric: "top5",
      label: "Top-5 hit rate",
      before: before.top5,
      after: after.top5,
      delta: after.top5 - before.top5,
      passed: after.top5 >= before.top5 - t.maxTop5Drop,
      detail: `${p(before.top5)} → ${p(after.top5)} (tolerance −${(t.maxTop5Drop * 100).toFixed(0)} pts)`,
    },
    {
      metric: "confidence",
      label: "Target confidence",
      before: before.confidence,
      after: after.confidence,
      delta: after.confidence - before.confidence,
      passed: after.confidence >= before.confidence - t.maxConfidenceDrop,
      detail: `${p(before.confidence)} → ${p(after.confidence)} (tolerance −${(t.maxConfidenceDrop * 100).toFixed(0)} pts)`,
    },
  ];

  const failed = checks.filter((c) => !c.passed);
  const promote = failed.length === 0;
  return {
    promote,
    skipped: false,
    reason: promote
      ? `Promoted: every holdout metric held within tolerance on ${after.windows} scoring window${after.windows === 1 ? "" : "s"}.`
      : `Blocked: ${failed.map((c) => c.label.toLowerCase()).join(", ")} regressed beyond tolerance. The model was rolled back to the pre-run snapshot.`,
    checks,
    before,
    after,
    thresholds: t,
  };
}

/** One-line summary for toasts and the run log. */
export function describeVerdict(v: GateVerdict): string {
  if (v.skipped) return "gate skipped (no holdout)";
  const loss = v.checks.find((c) => c.metric === "loss");
  const acc = v.checks.find((c) => c.metric === "accuracy");
  return `${v.promote ? "promoted" : "blocked"} · loss ${f(loss?.before ?? 0)}→${f(loss?.after ?? 0)} · acc ${p(acc?.before ?? 0)}→${p(acc?.after ?? 0)}`;
}
