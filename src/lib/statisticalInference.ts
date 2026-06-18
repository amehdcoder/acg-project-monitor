/**
 * Lightweight, dependency-free statistical inference helpers used by the
 * Bloomberg Validation Dashboard to decide whether the enrolment
 * variance observed across States / LGAs is *statistically significant*
 * at the 95% confidence level — rather than just noise.
 *
 * Everything runs locally (no AI, no network) and is O(n) over the sample,
 * so it stays fast even on very large datasets.
 */

// ---- Core distributions ---------------------------------------------------

/** Natural log of the gamma function (Lanczos approximation). */
function lgamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized incomplete beta function I_x(a, b) — continued fraction. */
function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lgamma(a + b) - lgamma(a) - lgamma(b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b + lbeta) / a;

  // Lentz's algorithm for the continued fraction.
  let f = 1, c = 1, d = 0;
  const TINY = 1e-30;
  for (let i = 0; i <= 200; i++) {
    const m = Math.floor(i / 2);
    let numerator: number;
    if (i === 0) numerator = 1;
    else if (i % 2 === 0) numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));

    d = 1 + numerator * d;
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d;
    c = 1 + numerator / c;
    if (Math.abs(c) < TINY) c = TINY;
    const cd = c * d;
    f *= cd;
    if (Math.abs(1 - cd) < 1e-10) break;
  }
  const result = front * (f - 1);
  return x < (a + 1) / (a + b + 2) ? result : 1 - result;
}

/** Two-tailed p-value for a Student-t statistic with df degrees of freedom. */
export function tTestPValue(t: number, df: number): number {
  if (!isFinite(t) || df <= 0) return 1;
  const x = df / (df + t * t);
  return Math.min(1, betai(df / 2, 0.5, x));
}

/** Upper-tail p-value for an F statistic (df1, df2) — used by one-way ANOVA. */
export function fTestPValue(f: number, df1: number, df2: number): number {
  if (!isFinite(f) || f <= 0 || df1 <= 0 || df2 <= 0) return 1;
  const x = df2 / (df2 + df1 * f);
  return Math.min(1, betai(df2 / 2, df1 / 2, x));
}

/** Two-tailed critical t value at 95% confidence for a given df. */
export function tCritical95(df: number): number {
  if (df <= 0) return Infinity;
  // Compact lookup for small df; normal approximation beyond.
  const table: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
    8: 2.306, 9: 2.262, 10: 2.228, 12: 2.179, 15: 2.131, 20: 2.086,
    25: 2.06, 30: 2.042, 40: 2.021, 60: 2.0, 120: 1.98,
  };
  if (table[df]) return table[df];
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  for (const k of keys) if (df < k) return table[k];
  return 1.96;
}

// ---- High-level helpers ---------------------------------------------------

export interface MeanCI {
  n: number;
  mean: number;
  sd: number;
  se: number;
  ciLow: number;
  ciHigh: number;
  /** true when the 95% CI excludes 0 → the variance is statistically significant. */
  significant: boolean;
  pValue: number;
}

/**
 * 95% confidence interval for the mean of a sample (e.g. per-school percent
 * variance within a State/LGA). Significance = the CI does not contain 0,
 * i.e. the difference from the baseline is unlikely to be due to chance.
 */
export function meanConfidenceInterval(values: number[]): MeanCI | null {
  const n = values.length;
  if (n === 0) return null;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (n === 1) {
    return { n, mean, sd: 0, se: 0, ciLow: mean, ciHigh: mean, significant: false, pValue: 1 };
  }
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  const se = sd / Math.sqrt(n);
  const df = n - 1;
  const tc = tCritical95(df);
  const ciLow = mean - tc * se;
  const ciHigh = mean + tc * se;
  const tStat = se > 0 ? mean / se : 0;
  const pValue = se > 0 ? tTestPValue(tStat, df) : 1;
  const significant = se > 0 && (ciLow > 0 || ciHigh < 0);
  return { n, mean, sd, se, ciLow, ciHigh, significant, pValue };
}

export interface AnovaResult {
  groups: number;
  n: number;
  fStat: number;
  dfBetween: number;
  dfWithin: number;
  pValue: number;
  /** eta-squared effect size (0–1). */
  etaSquared: number;
  significant: boolean;
}

/**
 * One-way ANOVA across groups (e.g. each State's per-school variance sample)
 * to test whether the differences *between* groups are statistically
 * significant overall at the 95% level.
 */
export function oneWayAnova(groups: number[][]): AnovaResult | null {
  const valid = groups.filter((g) => g.length > 0);
  const k = valid.length;
  const N = valid.reduce((s, g) => s + g.length, 0);
  if (k < 2 || N <= k) return null;

  const grandMean = valid.flat().reduce((s, v) => s + v, 0) / N;
  let ssBetween = 0;
  let ssWithin = 0;
  valid.forEach((g) => {
    const m = g.reduce((s, v) => s + v, 0) / g.length;
    ssBetween += g.length * (m - grandMean) ** 2;
    g.forEach((v) => (ssWithin += (v - m) ** 2));
  });

  const dfBetween = k - 1;
  const dfWithin = N - k;
  const msBetween = ssBetween / dfBetween;
  const msWithin = ssWithin / dfWithin;
  const fStat = msWithin > 0 ? msBetween / msWithin : 0;
  const pValue = fTestPValue(fStat, dfBetween, dfWithin);
  const ssTotal = ssBetween + ssWithin;
  const etaSquared = ssTotal > 0 ? ssBetween / ssTotal : 0;
  return {
    groups: k,
    n: N,
    fStat,
    dfBetween,
    dfWithin,
    pValue,
    etaSquared,
    significant: pValue < 0.05,
  };
}

/** Format a p-value compactly for display. */
export function formatP(p: number): string {
  if (p < 0.001) return "p < 0.001";
  return `p = ${p.toFixed(3)}`;
}
