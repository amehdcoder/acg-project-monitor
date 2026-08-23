/**
 * Evidence & pattern intelligence for the Integrated MDA Supervisory Checklist.
 *
 * Four analytical engines, all computed locally from the synced KoboToolbox
 * checklist records (no server round-trip, no AI dependency):
 *
 *  1. DAILY NEW EVIDENCE LEDGER  — what each field day surfaced that no earlier
 *     day had ever shown, stacked until corroboration makes an identity
 *     undeniable.
 *  2. COMPLETION REGRESSION      — multiple (logistic) regression predicting why
 *     Status of MDA is NOT "Completed", plus one-vs-completed models for the
 *     specific failure states (Not started / Ongoing / Halted).
 *  3. GEOGRAPHIC POST-MORTEM     — What worked / What failed / Why for every
 *     State, LGA and Ward.
 *  4. SIGNAL vs NOISE            — strips loud, low-evidence decoys and keeps
 *     only statistically undeniable facts.
 */

import { resolveChecklistValue } from "@/components/IntegratedSupervisory/checklistSchema";

export type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ utils */

const label = (field: string, v: unknown) =>
  String(resolveChecklistValue(field, v) ?? "").trim();

const POSITIVE = /^(yes|available|correct|sufficient|trained|displayed|complete|present|received|conducted)/i;
const NEGATIVE = /^(no\b|not\b|none|unavailable|incorrect|insufficient|never|absent)/i;

/** Tri-state read of a Yes/No-style checklist field: 1, 0 or null (unknown). */
function tri(field: string, v: unknown): number | null {
  const s = label(field, v) || String(v ?? "").trim();
  if (!s) return null;
  if (POSITIVE.test(s)) return 1;
  if (NEGATIVE.test(s)) return 0;
  return null;
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 based erf). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}
const twoSidedP = (z: number) => 2 * (1 - normalCdf(Math.abs(z)));

/** Two-proportion z-test. */
export function twoProportionTest(x1: number, n1: number, x2: number, n2: number) {
  if (n1 < 1 || n2 < 1) return { z: 0, p: 1, diff: 0 };
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pool = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pool * (1 - pool) * (1 / n1 + 1 / n2));
  if (!se) return { z: 0, p: 1, diff: p1 - p2 };
  const z = (p1 - p2) / se;
  return { z, p: twoSidedP(z), diff: p1 - p2 };
}

/** Wilson 95% confidence interval for a proportion. */
export function wilson(x: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.959964;
  const p = x / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - s) / d), Math.min(1, (c + s) / d)];
}

/* ----------------------------------------------------- predictor catalogue */

export interface PredictorDef {
  key: string;
  /** Plain-language name of the *risk* direction used by the model. */
  label: string;
  /** Human explanation of what a positive coefficient means. */
  meaning: string;
  /** 1 = risk factor present, 0 = absent, null = not answered. */
  read: (p: Row) => number | null;
}

/** Every predictor is coded as a RISK indicator (1 = the bad condition). */
export const PREDICTORS: PredictorDef[] = [
  {
    key: "no_inventory",
    label: "No medicine inventory at the site",
    meaning: "Medicine inventory was not available when the monitor visited",
    read: (p) => { const t = tri("Is_Medicine_Inventory_Availabl", p.Is_Medicine_Inventory_Availabl); return t == null ? null : 1 - t; },
  },
  {
    key: "insufficient_medicine",
    label: "CDD medicine stock insufficient",
    meaning: "The CDD did not hold enough medicine to treat the community",
    read: (p) => { const t = tri("Does_CDI_CDD_have_sufficient_d", p.Does_CDI_CDD_have_sufficient_d); return t == null ? null : 1 - t; },
  },
  {
    key: "no_register",
    label: "Treatment register missing",
    meaning: "No treatment register was available at the community",
    read: (p) => { const t = tri("Is_Treatment_Register_Availabl", p.Is_Treatment_Register_Availabl); return t == null ? null : 1 - t; },
  },
  {
    key: "register_wrong",
    label: "Register entries incorrect",
    meaning: "Register entries failed the monitor's correctness check",
    read: (p) => { const t = tri("Are_entries_in_Register_CORRECT", p.Are_entries_in_Register_CORRECT); return t == null ? null : 1 - t; },
  },
  {
    key: "no_census",
    label: "Census update not done",
    meaning: "The pre-MDA census update had not been conducted",
    read: (p) => { const t = tri("Has_Census_Update_been_conducted", p.Has_Census_Update_been_conducted); return t == null ? null : 1 - t; },
  },
  {
    key: "no_cdds",
    label: "No CDDs in the community",
    meaning: "The community had no community-directed distributors in place",
    read: (p) => { const t = tri("Are_there_trained_CDDs_Commun", p.Are_there_trained_CDDs_Commun); return t == null ? null : 1 - t; },
  },
  {
    key: "cdd_untrained",
    label: "CDD not trained",
    meaning: "The CDD had not received MDA training before the campaign",
    read: (p) => { const t = tri("Has_CDI_CDD_been_trained", p.Has_CDI_CDD_been_trained); return t == null ? null : 1 - t; },
  },
  {
    key: "no_stipend",
    label: "CDD stipend not paid",
    meaning: "The CDD had not received a stipend at the time of the visit",
    read: (p) => { const t = tri("Did_CDI_CDD_receive_stipends", p.Did_CDI_CDD_receive_stipends); return t == null ? null : 1 - t; },
  },
  {
    key: "no_dose_pole",
    label: "Dose pole unavailable",
    meaning: "No dose pole was available for height-based dosing",
    read: (p) => { const t = tri("Is_Dose_Pole_Available", p.Is_Dose_Pole_Available); return t == null ? null : 1 - t; },
  },
  {
    key: "dose_pole_skill_gap",
    label: "CDD cannot use the dose pole",
    meaning: "The CDD could not demonstrate correct dose-pole use",
    read: (p) => { const t = tri("Does_CDI_CDD_Know_how_to_use_Dose_Pole", p.Does_CDI_CDD_Know_how_to_use_Dose_Pole); return t == null ? null : 1 - t; },
  },
  {
    key: "no_posters",
    label: "No NTD mobilisation posters",
    meaning: "No NTD posters were displayed anywhere in the community",
    read: (p) => { const t = tri("Are_any_NTD_posters_the_School_Community", p.Are_any_NTD_posters_the_School_Community); return t == null ? null : 1 - t; },
  },
  {
    key: "sae",
    label: "SAE complaint reported",
    meaning: "A serious adverse event complaint was recorded in the community",
    read: (p) => tri("Any_SAE_Complain", p.Any_SAE_Complain),
  },
  {
    key: "not_commenced",
    label: "Treatment never commenced",
    meaning: "Treatment had not commenced in the community at the time of visit",
    read: (p) => { const t = tri("has_treatment_commenced", p.has_treatment_commenced); return t == null ? null : 1 - t; },
  },
];

/* ------------------------------------------------------- outcome handling */

export type MdaClass = "Completed" | "Not started" | "Ongoing" | "Halted" | "Unknown";

export function mdaClass(p: Row): MdaClass {
  const s = label("Status_of_MDA", p.Status_of_MDA) || String(p.Status_of_MDA ?? "");
  if (!s) return "Unknown";
  if (/complete/i.test(s)) return "Completed";
  if (/halt|stopp|suspend|paus/i.test(s)) return "Halted";
  if (/not\s*start|yet\s*to|no[t]?\s*commenc/i.test(s)) return "Not started";
  if (/ongoing|on-?going|progress|started|commenc/i.test(s)) return "Ongoing";
  return "Unknown";
}

/* ------------------------------------------- 2. logistic regression engine */

export interface RegressionTerm {
  key: string;
  label: string;
  meaning: string;
  coef: number;
  se: number;
  z: number;
  p: number;
  oddsRatio: number;
  ciLow: number;
  ciHigh: number;
  /** Share of analysed records where the risk factor was present. */
  prevalence: number;
  /** Failure rate when present vs absent (descriptive support). */
  failWhenPresent: number;
  failWhenAbsent: number;
  n: number;
  significant: boolean;
  /** Variance inflation factor (multicollinearity check). */
  vif: number;
  /** Records where the risk condition was present (drill-down evidence). */
  rowsPresent: Row[];
  /** Records where the risk condition was absent. */
  rowsAbsent: Row[];
}

export interface RegressionResult {
  n: number;
  events: number;
  baseRate: number;
  terms: RegressionTerm[];
  pseudoR2: number;
  accuracy: number;
  converged: boolean;
  note?: string;
  /** All records entering the model (drill-down evidence). */
  rows: Row[];
  diagnostics: RegressionDiagnostics | null;
}

export interface DiagnosticCheck {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  value: string;
  explanation: string;
}

export interface CalibrationBin {
  bin: number;
  n: number;
  predicted: number;
  observed: number;
}

export interface RegressionDiagnostics {
  /** Events per variable — ≥10 is the classic rule of thumb. */
  epv: number;
  maxVif: number;
  /** Share of predictor cells that had to be mean-imputed. */
  imputedShare: number;
  separation: boolean;
  calibration: CalibrationBin[];
  /** Hosmer–Lemeshow goodness-of-fit. High p = well calibrated. */
  hlChiSq: number;
  hlDf: number;
  hlP: number;
  brier: number;
  auc: number;
  checks: DiagnosticCheck[];
}

function invert(m: number[][]): number[][] | null {
  const n = m.length;
  const a = m.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    if (Math.abs(a[piv][c]) < 1e-10) return null;
    [a[c], a[piv]] = [a[piv], a[c]];
    const d = a[c][c];
    for (let j = 0; j < 2 * n; j++) a[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c];
      if (!f) continue;
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((r) => r.slice(n));
}

/** Ridge-regularised IRLS logistic regression (intercept in column 0). */
function fitLogistic(X: number[][], y: number[], ridge = 1e-3) {
  const n = X.length;
  const k = X[0].length;
  let beta = new Array(k).fill(0);
  let converged = false;

  for (let iter = 0; iter < 60; iter++) {
    const mu = X.map((row) => {
      const eta = row.reduce((s, v, j) => s + v * beta[j], 0);
      return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta))));
    });
    // Gradient and Hessian
    const grad = new Array(k).fill(0);
    const H: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < n; i++) {
      const w = Math.max(mu[i] * (1 - mu[i]), 1e-6);
      const r = y[i] - mu[i];
      for (let j = 0; j < k; j++) {
        grad[j] += X[i][j] * r;
        for (let l = 0; l <= j; l++) H[j][l] += X[i][j] * X[i][l] * w;
      }
    }
    for (let j = 0; j < k; j++) {
      for (let l = 0; l < j; l++) H[l][j] = H[j][l];
      H[j][j] += ridge;
      if (j > 0) grad[j] -= ridge * beta[j];
    }
    const Hinv = invert(H);
    if (!Hinv) break;
    let maxStep = 0;
    const next = beta.slice();
    for (let j = 0; j < k; j++) {
      const step = Hinv[j].reduce((s, v, l) => s + v * grad[l], 0);
      next[j] += step;
      maxStep = Math.max(maxStep, Math.abs(step));
    }
    beta = next;
    if (maxStep < 1e-7) { converged = true; break; }
  }

  // Covariance for standard errors
  const mu = X.map((row) => {
    const eta = row.reduce((s, v, j) => s + v * beta[j], 0);
    return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta))));
  });
  const H: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < X.length; i++) {
    const w = Math.max(mu[i] * (1 - mu[i]), 1e-6);
    for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) H[j][l] += X[i][j] * X[i][l] * w;
  }
  for (let j = 0; j < k; j++) H[j][j] += ridge;
  const cov = invert(H);
  const se = beta.map((_, j) => (cov ? Math.sqrt(Math.max(cov[j][j], 0)) : NaN));

  // Fit statistics
  const eps = 1e-9;
  const ll = y.reduce((s, yi, i) => s + (yi ? Math.log(mu[i] + eps) : Math.log(1 - mu[i] + eps)), 0);
  const base = y.reduce((s, v) => s + v, 0) / Math.max(y.length, 1);
  const ll0 = y.reduce((s, yi) => s + (yi ? Math.log(base + eps) : Math.log(1 - base + eps)), 0);
  const pseudoR2 = ll0 === 0 ? 0 : Math.max(0, Math.min(1, 1 - ll / ll0));
  const accuracy = y.reduce((s, yi, i) => s + ((mu[i] >= 0.5 ? 1 : 0) === yi ? 1 : 0), 0) / Math.max(y.length, 1);

  return { beta, se, pseudoR2, accuracy, converged };
}

/**
 * Multiple logistic regression predicting a NON-completed MDA status.
 *
 * @param target `"any"` models every non-completed status against Completed;
 *               otherwise the specified failure state vs Completed.
 */
export function runCompletionRegression(parents: Row[], target: "any" | MdaClass = "any"): RegressionResult {
  const usable = parents.filter((p) => {
    const c = mdaClass(p);
    if (c === "Unknown") return false;
    return target === "any" ? true : c === "Completed" || c === target;
  });

  const y = usable.map((p) => (mdaClass(p) === "Completed" ? 0 : 1));
  const events = y.reduce((s, v) => s + v, 0);
  const n = usable.length;

  // Keep predictors with enough answered records and real variation.
  const active = PREDICTORS.map((d) => {
    const vals = usable.map((p) => d.read(p));
    const answered = vals.filter((v) => v != null) as number[];
    const present = answered.filter((v) => v === 1).length;
    const mean = answered.length ? answered.reduce((s, v) => s + v, 0) / answered.length : 0;
    return { d, vals, answered: answered.length, present, mean };
  }).filter((c) => c.answered >= Math.max(8, n * 0.15) && c.present >= 3 && c.present < c.answered);

  if (n < 12 || events === 0 || events === n || active.length === 0) {
    return {
      n, events, baseRate: n ? events / n : 0, terms: [], pseudoR2: 0, accuracy: 0, converged: false,
      rows: usable, diagnostics: null,
      note:
        n < 12
          ? "Not enough completed checklists yet — the model needs at least 12 records with a recorded MDA status."
          : events === 0
            ? "Every record with a status is Completed — there is nothing to explain yet."
            : events === n
              ? "No community has reached Completed yet, so the model has no contrast to learn from."
              : "No supervisory factor varies enough yet to enter the model.",
    };
  }

  // Design matrix, mean-imputed for unanswered items.
  const X = usable.map((_, i) => [1, ...active.map((c) => (c.vals[i] == null ? c.mean : (c.vals[i] as number)))]);
  const fit = fitLogistic(X, y);
  const vifs = computeVIF(X.map((r) => r.slice(1)));

  const terms: RegressionTerm[] = active.map((c, j) => {
    const coef = fit.beta[j + 1];
    const se = fit.se[j + 1];
    const z = se && Number.isFinite(se) ? coef / se : 0;
    const p = twoSidedP(z);
    let failP = 0, nP = 0, failA = 0, nA = 0;
    usable.forEach((row, i) => {
      const v = c.vals[i];
      if (v == null) return;
      if (v === 1) { nP++; failP += y[i]; } else { nA++; failA += y[i]; }
    });
    return {
      key: c.d.key,
      label: c.d.label,
      meaning: c.d.meaning,
      coef, se, z, p,
      oddsRatio: Math.exp(coef),
      ciLow: Math.exp(coef - 1.959964 * se),
      ciHigh: Math.exp(coef + 1.959964 * se),
      prevalence: c.answered ? c.present / c.answered : 0,
      failWhenPresent: nP ? failP / nP : 0,
      failWhenAbsent: nA ? failA / nA : 0,
      n: c.answered,
      significant: p < 0.05,
      vif: vifs[j] ?? 1,
      rowsPresent: usable.filter((_, i) => c.vals[i] === 1),
      rowsAbsent: usable.filter((_, i) => c.vals[i] === 0),
    };
  }).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

  const predicted = X.map((row) => {
    const eta = row.reduce((s2, v, j) => s2 + v * fit.beta[j], 0);
    return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta))));
  });
  const imputed = active.reduce((s2, c) => s2 + c.vals.filter((v) => v == null).length, 0);
  const diagnostics = buildDiagnostics({
    y, predicted, terms, converged: fit.converged,
    imputedShare: imputed / Math.max(active.length * n, 1),
  });

  return {
    n, events, baseRate: events / n, terms,
    pseudoR2: fit.pseudoR2, accuracy: fit.accuracy, converged: fit.converged,
    rows: usable, diagnostics,
  };
}

/* ------------------------------------------------- regression diagnostics */

/** Upper-tail p-value of a chi-square statistic (regularized incomplete gamma Q). */
export function chiSquareP(x: number, df: number): number {
  if (!isFinite(x) || x <= 0 || df <= 0) return 1;
  const a = df / 2;
  const xx = x / 2;
  const lg = lnGamma(a);
  if (xx < a + 1) {
    // series expansion for P(a, x)
    let ap = a, sum = 1 / a, del = sum;
    for (let i = 0; i < 500; i++) {
      ap++; del *= xx / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    const P = sum * Math.exp(-xx + a * Math.log(xx) - lg);
    return Math.min(1, Math.max(0, 1 - P));
  }
  // continued fraction for Q(a, x)
  let b = xx + 1 - a, c = 1e30, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2; d = an * d + b; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  const Q = Math.exp(-xx + a * Math.log(xx) - lg) * h;
  return Math.min(1, Math.max(0, Q));
}

function lnGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Variance inflation factors from the predictor block (no intercept column). */
export function computeVIF(cols: number[][]): number[] {
  const n = cols.length;
  const k = n ? cols[0].length : 0;
  if (k < 2) return new Array(k).fill(1);
  const mean = Array.from({ length: k }, (_, j) => cols.reduce((s, r) => s + r[j], 0) / n);
  const sd = Array.from({ length: k }, (_, j) =>
    Math.sqrt(cols.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / Math.max(n - 1, 1)));
  const corr: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let a = 0; a < k; a++) {
    for (let b2 = 0; b2 < k; b2++) {
      if (!sd[a] || !sd[b2]) { corr[a][b2] = a === b2 ? 1 : 0; continue; }
      const cov = cols.reduce((s, r) => s + (r[a] - mean[a]) * (r[b2] - mean[b2]), 0) / Math.max(n - 1, 1);
      corr[a][b2] = cov / (sd[a] * sd[b2]);
    }
  }
  for (let a = 0; a < k; a++) corr[a][a] += 1e-8;
  const inv = invert(corr);
  if (!inv) return new Array(k).fill(NaN);
  return Array.from({ length: k }, (_, j) => Math.max(1, inv[j][j]));
}

function buildDiagnostics(args: {
  y: number[];
  predicted: number[];
  terms: RegressionTerm[];
  converged: boolean;
  imputedShare: number;
}): RegressionDiagnostics {
  const { y, predicted, terms, converged, imputedShare } = args;
  const events = y.reduce((s, v) => s + v, 0);
  const epv = terms.length ? Math.min(events, y.length - events) / terms.length : 0;
  const maxVif = terms.reduce((m, t) => Math.max(m, Number.isFinite(t.vif) ? t.vif : 0), 0);
  const separation = terms.some((t) => Math.abs(t.coef) > 5 || t.ciHigh > 500 || (t.ciLow > 0 && t.ciLow < 1e-3));

  // Calibration: order by predicted risk, split into up to 10 equal bins.
  const idx = predicted.map((p, i) => i).sort((a, b2) => predicted[a] - predicted[b2]);
  const g = Math.max(2, Math.min(10, Math.floor(y.length / 10) || 2));
  const calibration: CalibrationBin[] = [];
  let hl = 0;
  for (let b2 = 0; b2 < g; b2++) {
    const slice = idx.slice(Math.floor((b2 * idx.length) / g), Math.floor(((b2 + 1) * idx.length) / g));
    if (!slice.length) continue;
    const exp = slice.reduce((s, i) => s + predicted[i], 0);
    const obs = slice.reduce((s, i) => s + y[i], 0);
    const nb = slice.length;
    const pbar = exp / nb;
    if (pbar > 0 && pbar < 1) hl += ((obs - exp) ** 2) / (nb * pbar * (1 - pbar));
    calibration.push({ bin: calibration.length + 1, n: nb, predicted: pbar, observed: obs / nb });
  }
  const hlDf = Math.max(1, calibration.length - 2);
  const hlP = chiSquareP(hl, hlDf);

  const brier = y.reduce((s, yi, i) => s + (predicted[i] - yi) ** 2, 0) / Math.max(y.length, 1);

  // AUC via rank statistic.
  const pos = y.map((v, i) => (v === 1 ? predicted[i] : null)).filter((v): v is number => v != null);
  const neg = y.map((v, i) => (v === 0 ? predicted[i] : null)).filter((v): v is number => v != null);
  let auc = 0.5;
  if (pos.length && neg.length) {
    let wins = 0;
    for (const a of pos) for (const b2 of neg) wins += a > b2 ? 1 : a === b2 ? 0.5 : 0;
    auc = wins / (pos.length * neg.length);
  }

  const checks: DiagnosticCheck[] = [
    {
      key: "epv",
      label: "Events per variable",
      status: epv >= 10 ? "pass" : epv >= 5 ? "warn" : "fail",
      value: epv.toFixed(1),
      explanation:
        "At least 10 outcomes per predictor keeps the odds ratios stable. Below 5 the coefficients can swing wildly with one extra record.",
    },
    {
      key: "vif",
      label: "Multicollinearity (max VIF)",
      status: maxVif < 5 ? "pass" : maxVif < 10 ? "warn" : "fail",
      value: Number.isFinite(maxVif) ? maxVif.toFixed(2) : "n/a",
      explanation:
        "VIF under 5 means the predictors carry independent information. Above 10 two factors are effectively the same measurement and their individual odds ratios cannot be separated.",
    },
    {
      key: "separation",
      label: "Complete separation",
      status: separation ? "warn" : "pass",
      value: separation ? "Detected" : "None",
      explanation:
        "Separation happens when a factor perfectly predicts the outcome; ridge regularisation keeps the fit finite, but the affected odds ratio should be read as directional only.",
    },
    {
      key: "convergence",
      label: "Model convergence",
      status: converged ? "pass" : "warn",
      value: converged ? "Converged" : "Iteration limit",
      explanation: "The IRLS solver reached a stable solution; otherwise the estimates are the best available approximation.",
    },
    {
      key: "hl",
      label: "Calibration (Hosmer–Lemeshow)",
      status: hlP >= 0.05 ? "pass" : "warn",
      value: `χ²=${hl.toFixed(2)}, ${hlP < 0.001 ? "p<0.001" : `p=${hlP.toFixed(3)}`}`,
      explanation:
        "A high p-value means predicted risk matches observed failure rates across risk bands — the model is honest about how likely non-completion really is.",
    },
    {
      key: "auc",
      label: "Discrimination (AUC)",
      status: auc >= 0.7 ? "pass" : auc >= 0.6 ? "warn" : "fail",
      value: auc.toFixed(3),
      explanation:
        "Probability the model scores a genuinely failing community higher than a completed one. 0.5 is a coin toss, 0.7+ is useful.",
    },
    {
      key: "missing",
      label: "Imputed answers",
      status: imputedShare < 0.1 ? "pass" : imputedShare < 0.25 ? "warn" : "fail",
      value: `${Math.round(imputedShare * 100)}%`,
      explanation:
        "Unanswered checklist items are filled with the factor's average. The more imputation, the more the effects are pulled toward zero.",
    },
  ];

  return { epv, maxVif, imputedShare, separation, calibration, hlChiSq: hl, hlDf, hlP, brier, auc, checks };
}

/* -------------------------------------------- 1. daily new-evidence ledger */

export interface EvidenceFact {
  /** Stable signature so the same fact is never double-counted. */
  id: string;
  theme: string;
  statement: string;
  place: string;
  severity: "critical" | "warning" | "positive";
  firstSeen: string;
  lastSeen: string;
  days: string[];
  occurrences: number;
  /** Corroborated on ≥2 separate field days with ≥3 observations. */
  undeniable: boolean;
  /** Exact submissions that asserted this finding (drill-down evidence). */
  rows: Row[];
  /** Per-day corroboration notes, oldest first. */
  notes: { day: string; count: number }[];
}

export interface EvidenceDay {
  day: string;
  submissions: number;
  newFacts: number;
  repeatFacts: number;
  cumulative: number;
  facts: EvidenceFact[];
}

export interface EvidenceLedger {
  days: EvidenceDay[];
  facts: EvidenceFact[];
  undeniable: EvidenceFact[];
  emerging: EvidenceFact[];
  latestDay: string | null;
}

const dayOf = (p: Row): string | null => {
  const raw = (p._end ?? p._submission_time ?? p.end) as string | undefined;
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const place = (p: Row) =>
  [p.COMMUNITIES, p.Ward, p.LGA, p.State].map((v) => String(v ?? "").trim()).filter(Boolean).join(", ") || "Unspecified location";

/** Facts a single checklist submission asserts. */
function factsOf(p: Row): { theme: string; statement: string; severity: EvidenceFact["severity"] }[] {
  const out: { theme: string; statement: string; severity: EvidenceFact["severity"] }[] = [];
  for (const d of PREDICTORS) {
    if (d.read(p) === 1) {
      out.push({
        theme: d.label,
        statement: d.meaning,
        severity: d.key === "sae" || d.key === "not_commenced" || d.key === "insufficient_medicine" ? "critical" : "warning",
      });
    }
  }
  const cls = mdaClass(p);
  if (cls === "Halted") out.push({ theme: "MDA halted", statement: "The MDA was reported as halted in this community", severity: "critical" });
  if (cls === "Not started") out.push({ theme: "MDA not started", statement: "The MDA had not started in this community", severity: "critical" });
  if (cls === "Completed") out.push({ theme: "MDA completed", statement: "The MDA was verified as completed in this community", severity: "positive" });
  return out;
}

export function buildEvidenceLedger(parents: Row[]): EvidenceLedger {
  const byDay = new Map<string, Row[]>();
  for (const p of parents) {
    const d = dayOf(p);
    if (!d) continue;
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(p);
  }
  const days = [...byDay.keys()].sort();
  const registry = new Map<string, EvidenceFact>();
  const rows: EvidenceDay[] = [];
  let cumulative = 0;

  for (const day of days) {
    const subs = byDay.get(day)!;
    let newFacts = 0, repeatFacts = 0;
    const todaysNew: EvidenceFact[] = [];
    for (const p of subs) {
      const where = place(p);
      for (const f of factsOf(p)) {
        const id = `${f.theme}@@${where}`.toLowerCase();
        const prev = registry.get(id);
        if (!prev) {
          const fact: EvidenceFact = {
            id, theme: f.theme, statement: f.statement, place: where, severity: f.severity,
            firstSeen: day, lastSeen: day, days: [day], occurrences: 1, undeniable: false,
            rows: [p], notes: [{ day, count: 1 }],
          };
          registry.set(id, fact);
          todaysNew.push(fact);
          newFacts++;
        } else {
          prev.occurrences++;
          prev.lastSeen = day;
          if (!prev.days.includes(day)) prev.days.push(day);
          prev.rows.push(p);
          const note = prev.notes.find((nn) => nn.day === day);
          if (note) note.count++; else prev.notes.push({ day, count: 1 });
          repeatFacts++;
        }
      }
    }
    cumulative += newFacts;
    rows.push({ day, submissions: subs.length, newFacts, repeatFacts, cumulative, facts: todaysNew });
  }

  const facts = [...registry.values()];
  for (const f of facts) f.undeniable = f.days.length >= 2 && f.occurrences >= 3;
  facts.sort((a, b) => b.occurrences - a.occurrences || b.days.length - a.days.length);

  return {
    days: rows,
    facts,
    undeniable: facts.filter((f) => f.undeniable),
    emerging: facts.filter((f) => !f.undeniable && f.firstSeen === (days[days.length - 1] ?? "")),
    latestDay: days[days.length - 1] ?? null,
  };
}

/* ------------------------------------------ 3. geographic post-mortem */

export interface GeoVerdict {
  unit: string;
  parent: string;
  level: "State" | "LGA" | "Ward";
  n: number;
  completed: number;
  rate: number;
  ciLow: number;
  ciHigh: number;
  lift: number;
  /** Significance of the difference against every other unit at this level. */
  p: number;
  verdict: "Worked" | "Failed" | "Mixed" | "Too few records";
  worked: { label: string; rate: number; n: number }[];
  failed: { label: string; rate: number; gap: number; n: number }[];
  why: string;
}

const UNIT_KEYS: Record<GeoVerdict["level"], string[]> = {
  State: ["State"],
  LGA: ["State", "LGA"],
  Ward: ["State", "LGA", "Ward"],
};

export function buildGeoVerdicts(parents: Row[], level: GeoVerdict["level"], minN = 3): GeoVerdict[] {
  const keys = UNIT_KEYS[level];
  const scored = parents.filter((p) => mdaClass(p) !== "Unknown");
  const groups = new Map<string, Row[]>();
  for (const p of scored) {
    const path = keys.map((k) => String(p[k] ?? "").trim()).filter(Boolean);
    if (path.length !== keys.length) continue;
    const id = path.join(" › ");
    (groups.get(id) ?? groups.set(id, []).get(id)!).push(p);
  }

  const totalN = scored.length;
  const totalC = scored.filter((p) => mdaClass(p) === "Completed").length;
  const overall = totalN ? totalC / totalN : 0;

  const out: GeoVerdict[] = [];
  for (const [id, rows] of groups) {
    const n = rows.length;
    const completed = rows.filter((p) => mdaClass(p) === "Completed").length;
    const rate = n ? completed / n : 0;
    const [ciLow, ciHigh] = wilson(completed, n);
    const { p } = twoProportionTest(completed, n, totalC - completed, Math.max(totalN - n, 1));

    // Factor-level diagnosis within this unit.
    const worked: GeoVerdict["worked"] = [];
    const failed: GeoVerdict["failed"] = [];
    for (const d of PREDICTORS) {
      const vals = rows.map((r) => d.read(r)).filter((v) => v != null) as number[];
      if (vals.length < Math.max(2, Math.ceil(n * 0.4))) continue;
      const riskRate = vals.reduce((s, v) => s + v, 0) / vals.length;
      if (riskRate >= 0.4) failed.push({ label: d.label, rate: riskRate, gap: riskRate, n: vals.length });
      else if (riskRate <= 0.1) worked.push({ label: d.label.replace(/^No\s+/i, "").replace(/\bnot\b\s*/i, ""), rate: 1 - riskRate, n: vals.length });
    }
    failed.sort((a, b) => b.gap - a.gap);
    worked.sort((a, b) => b.rate - a.rate);

    const verdict: GeoVerdict["verdict"] =
      n < minN ? "Too few records"
        : rate >= 0.8 ? "Worked"
          : rate <= 0.4 ? "Failed"
            : "Mixed";

    const why =
      n < minN
        ? `Only ${n} checklist${n === 1 ? "" : "s"} recorded — no defensible conclusion yet.`
        : failed.length
          ? `${Math.round(rate * 100)}% completion. Binding constraint: ${failed[0].label.toLowerCase()} in ${Math.round(failed[0].rate * 100)}% of visits${failed[1] ? `, followed by ${failed[1].label.toLowerCase()} (${Math.round(failed[1].rate * 100)}%)` : ""}.`
          : `${Math.round(rate * 100)}% completion with no supervisory factor failing in 40%+ of visits — execution held up.`;

    out.push({
      unit: id.split(" › ").slice(-1)[0],
      parent: id.split(" › ").slice(0, -1).join(" › "),
      level, n, completed, rate, ciLow, ciHigh,
      lift: rate - overall, p, verdict,
      worked: worked.slice(0, 4),
      failed: failed.slice(0, 4),
      why,
    });
  }

  return out.sort((a, b) => b.n - a.n || b.rate - a.rate);
}

/* ---------------------------------------------- 4. signal vs noise filter */

export interface DistilledFact {
  statement: string;
  detail: string;
  n: number;
  effect: number;
  p: number;
  kind: "fact" | "decoy";
  /** Why a claim was discarded (decoys only). */
  discardReason?: string;
}

export interface Distillation {
  facts: DistilledFact[];
  decoys: DistilledFact[];
  screened: number;
  minSample: number;
}

/**
 * Strips emotive, low-evidence claims: every candidate factor must clear a
 * sample-size floor, a ≥15-point effect size and a 5% significance test before
 * it is allowed to be called a fact.
 */
export function distillFacts(parents: Row[], minSample = 20): Distillation {
  const scored = parents.filter((p) => mdaClass(p) !== "Unknown");
  const facts: DistilledFact[] = [];
  const decoys: DistilledFact[] = [];

  for (const d of PREDICTORS) {
    let nP = 0, failP = 0, nA = 0, failA = 0;
    for (const p of scored) {
      const v = d.read(p);
      if (v == null) continue;
      const fail = mdaClass(p) === "Completed" ? 0 : 1;
      if (v === 1) { nP++; failP += fail; } else { nA++; failA += fail; }
    }
    const n = nP + nA;
    if (!nP || !nA) {
      decoys.push({
        statement: d.label,
        detail: `Observed on only one side (${nP} present / ${nA} absent) — no comparison possible.`,
        n, effect: 0, p: 1, kind: "decoy", discardReason: "No contrast group",
      });
      continue;
    }
    const { p: pv, diff } = twoProportionTest(failP, nP, failA, nA);
    const detail = `Non-completion ${Math.round((failP / nP) * 100)}% when present vs ${Math.round((failA / nA) * 100)}% when absent (n=${n}).`;
    if (n < minSample) {
      decoys.push({ statement: d.label, detail, n, effect: diff, p: pv, kind: "decoy", discardReason: `Sample too small (n=${n} < ${minSample})` });
    } else if (Math.abs(diff) < 0.15) {
      decoys.push({ statement: d.label, detail, n, effect: diff, p: pv, kind: "decoy", discardReason: `Effect too small (${Math.round(Math.abs(diff) * 100)} pts < 15 pts)` });
    } else if (pv >= 0.05) {
      decoys.push({ statement: d.label, detail, n, effect: diff, p: pv, kind: "decoy", discardReason: `Not statistically distinguishable from chance (p=${pv.toFixed(2)})` });
    } else {
      facts.push({
        statement: `${d.label} moves non-completion by ${diff > 0 ? "+" : ""}${Math.round(diff * 100)} points`,
        detail, n, effect: diff, p: pv, kind: "fact",
      });
    }
  }

  facts.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  decoys.sort((a, b) => b.n - a.n);
  return { facts, decoys, screened: PREDICTORS.length, minSample };
}
