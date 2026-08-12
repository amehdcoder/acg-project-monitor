/**
 * Configurable rounding rules for medicine allocation.
 *
 * The default ("exact") uses the largest-remainder method so distributed units
 * reconcile exactly with the entered total. Programme teams sometimes need to
 * dispatch in whole packs/cartons, which necessarily introduces a small
 * difference between the entered total and the distributed total — that
 * residual is reported so it can be explained and approved.
 */

export type RoundingMode = "exact" | "nearest" | "up" | "down";

export interface RoundingRule {
  mode: RoundingMode;
  /** Pack / carton size the community figure must be a multiple of. */
  step: number;
}

export const DEFAULT_ROUNDING: RoundingRule = { mode: "exact", step: 1 };

export const ROUNDING_LABELS: Record<RoundingMode, string> = {
  exact: "Exact (largest remainder — no residual)",
  nearest: "Round to nearest pack",
  up: "Round up to full pack",
  down: "Round down to full pack",
};

export const describeRounding = (r: RoundingRule) =>
  r.mode === "exact" || r.step <= 1
    ? "Exact largest-remainder apportionment — community totals reconcile exactly with ward and LGA totals."
    : `${ROUNDING_LABELS[r.mode]} of ${r.step} ${r.step === 1 ? "unit" : "units"} — community figures are multiples of ${r.step}; any residual is reported in the validation report.`;

export function applyRounding(value: number, rule: RoundingRule): number {
  const step = Math.max(1, Math.round(rule.step || 1));
  if (rule.mode === "exact" || step === 1) return Math.max(0, Math.round(value));
  const q = value / step;
  const k = rule.mode === "up" ? Math.ceil(q) : rule.mode === "down" ? Math.floor(q) : Math.round(q);
  return Math.max(0, k * step);
}

export interface Residual {
  scope: string;      // e.g. "Kano → Dala → Bakin Ruwa"
  level: "LGA" | "Ward";
  input: number;      // units the user entered / was apportioned
  distributed: number;
  diff: number;       // distributed - input
}

export function explainResidual(r: Residual, unit: string): string {
  const u = unit.toLowerCase();
  if (r.diff === 0) return `${r.scope}: reconciles exactly (${r.input.toLocaleString()} ${u}).`;
  const dir = r.diff > 0 ? "more than" : "less than";
  return `${r.scope}: ${r.distributed.toLocaleString()} ${u} distributed — ${Math.abs(r.diff).toLocaleString()} ${u} ${dir} the ${r.input.toLocaleString()} entered. Caused by the pack-rounding rule applied at community level.`;
}
