/**
 * Global chart / KPI data-validation harness.
 *
 * Every percentage, stacked ranking and KPI strip rendered on the Integrated
 * MDA Supervisory dashboards is re-derived here straight from the KoboToolbox
 * submission records and compared against what the UI is about to display.
 * Any drift (double counting, wrong denominator, parts that do not sum to the
 * whole, percentages outside 0–100) is surfaced instead of silently shipped.
 *
 * Pure functions — no network, O(n) over the records.
 */

export type Severity = "error" | "warning";

export interface ValidationIssue {
  id: string;
  scope: string;
  message: string;
  severity: Severity;
}

export interface ValidationReport {
  /** Number of individual assertions evaluated. */
  checks: number;
  issues: ValidationIssue[];
  errors: number;
  warnings: number;
  ok: boolean;
}

/** Floating-point tolerance for percentage comparisons (percentage points). */
const EPS = 0.05;

export class ValidationCollector {
  private readonly list: ValidationIssue[] = [];
  private count = 0;

  private push(severity: Severity, scope: string, message: string) {
    this.list.push({ id: `${scope}:${this.list.length}`, scope, message, severity });
  }

  /** Categorical distribution must sum to the expected denominator. */
  distribution(scope: string, data: { name: string; value: number }[], expectedTotal?: number) {
    this.count += 1;
    const sum = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
    if (data.some((d) => !Number.isFinite(Number(d.value)) || Number(d.value) < 0)) {
      this.push("error", scope, "Contains negative or non-numeric category counts.");
    }
    const names = data.map((d) => String(d.name));
    if (new Set(names).size !== names.length) {
      this.push("error", scope, "Duplicate category labels — slices would be double counted.");
    }
    if (expectedTotal != null && Math.round(sum) > Math.round(expectedTotal)) {
      this.push(
        "error",
        scope,
        `Category counts sum to ${sum.toLocaleString()} but only ${expectedTotal.toLocaleString()} submissions answered — denominator mismatch.`,
      );
    }
    return this;
  }

  /** A displayed rate must equal numerator ÷ denominator. */
  rate(scope: string, numerator: number, denominator: number, displayedPct: number | null) {
    this.count += 1;
    if (denominator <= 0) {
      if (displayedPct != null) this.push("error", scope, "Rate shown with an empty denominator.");
      return this;
    }
    if (numerator > denominator) {
      this.push("error", scope, `Numerator (${numerator}) exceeds denominator (${denominator}).`);
    }
    if (displayedPct == null) return this;
    const expected = (numerator / denominator) * 100;
    if (displayedPct < -EPS || displayedPct > 100 + EPS) {
      this.push("error", scope, `Displayed percentage ${displayedPct.toFixed(2)}% is outside 0–100%.`);
    } else if (Math.abs(expected - displayedPct) > EPS) {
      this.push(
        "error",
        scope,
        `Displayed ${displayedPct.toFixed(2)}% but the submissions give ${expected.toFixed(2)}% (${numerator}/${denominator}).`,
      );
    }
    return this;
  }

  /** Parts of a stacked bar / ranking row must add up to that row's total. */
  stacked(scope: string, rows: { name: string; parts: number[]; total: number }[]) {
    this.count += 1;
    for (const r of rows) {
      const sum = r.parts.reduce((s, v) => s + (Number(v) || 0), 0);
      if (Math.abs(sum - r.total) > 0.5) {
        this.push(
          "error",
          scope,
          `${r.name}: stacked segments total ${sum.toLocaleString()} but the row reports ${r.total.toLocaleString()}.`,
        );
      }
    }
    return this;
  }

  /** Complementary percentages (e.g. offered + not offered) must reach 100%. */
  complementary(scope: string, a: number | null, b: number | null) {
    this.count += 1;
    if (a == null || b == null) return this;
    if (Math.abs(a + b - 100) > 0.5) {
      this.push("warning", scope, `Complementary shares total ${(a + b).toFixed(1)}% instead of 100%.`);
    }
    return this;
  }

  /** Monotonic relationship, e.g. swallowed can never exceed offered. */
  atMost(scope: string, smaller: number, larger: number, label: string) {
    this.count += 1;
    if (smaller - larger > 0.5) this.push("error", scope, label);
    return this;
  }

  /** Sample-size sanity for statistical strips. */
  sample(scope: string, n: number, clusters: number, deff: number) {
    this.count += 1;
    if (n > 0 && clusters === 0) this.push("error", scope, "Sample has records but no community clusters.");
    if (deff < 0.24) this.push("warning", scope, `Design effect ${deff.toFixed(2)} is implausibly low.`);
    if (clusters > 0 && clusters < 5 && n > 0) {
      this.push("warning", scope, `Only ${clusters} cluster(s) — estimates are indicative, not generalisable.`);
    }
    return this;
  }

  report(): ValidationReport {
    const errors = this.list.filter((i) => i.severity === "error").length;
    return {
      checks: this.count,
      issues: this.list,
      errors,
      warnings: this.list.length - errors,
      ok: errors === 0,
    };
  }
}

export const validate = () => new ValidationCollector();

export const EMPTY_REPORT: ValidationReport = { checks: 0, issues: [], errors: 0, warnings: 0, ok: true };

/** Merge several sub-reports (per panel) into one dashboard-wide report. */
export function mergeReports(...reports: ValidationReport[]): ValidationReport {
  const issues = reports.flatMap((r) => r.issues);
  const errors = issues.filter((i) => i.severity === "error").length;
  return {
    checks: reports.reduce((s, r) => s + r.checks, 0),
    issues,
    errors,
    warnings: issues.length - errors,
    ok: errors === 0,
  };
}
