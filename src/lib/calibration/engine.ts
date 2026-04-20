// Client-side calibration engine for compartmental ODE models.
// Pure TypeScript: RK4 + bounded Levenberg–Marquardt + multistart + diagnostics.
// Runs in the browser (no edge function, no resource limits).

type Token = { type: string; value: string | number };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "(" || ch === ")") { tokens.push({ type: ch, value: ch }); i++; continue; }
    if ("+*/^".includes(ch)) { tokens.push({ type: "OP", value: ch }); i++; continue; }
    if (ch === "-") {
      const prev = tokens[tokens.length - 1];
      tokens.push({ type: "OP", value: !prev || prev.type === "(" || prev.type === "OP" ? "NEG" : "-" });
      i++; continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < expr.length && /[0-9.eE+\-]/.test(expr[i])) {
        if ((expr[i] === "-" || expr[i] === "+") && num.length > 0 && !/[eE]/.test(num[num.length - 1])) break;
        num += expr[i]; i++;
      }
      tokens.push({ type: "NUM", value: parseFloat(num) });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let id = "";
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) { id += expr[i]; i++; }
      tokens.push({ type: "ID", value: id });
      continue;
    }
    i++;
  }
  return tokens;
}

function evalExpr(tk: Token[], pos: { i: number }, vars: Record<string, number>): number {
  let l = evalTerm(tk, pos, vars);
  while (pos.i < tk.length) {
    const t = tk[pos.i];
    if (t.type === "OP" && (t.value === "+" || t.value === "-")) {
      pos.i++;
      const r = evalTerm(tk, pos, vars);
      l = t.value === "+" ? l + r : l - r;
    } else break;
  }
  return l;
}
function evalTerm(tk: Token[], pos: { i: number }, vars: Record<string, number>): number {
  let l = evalPower(tk, pos, vars);
  while (pos.i < tk.length) {
    const t = tk[pos.i];
    if (t.type === "OP" && (t.value === "*" || t.value === "/")) {
      pos.i++;
      const r = evalPower(tk, pos, vars);
      l = t.value === "*" ? l * r : l / r;
    } else break;
  }
  return l;
}
function evalPower(tk: Token[], pos: { i: number }, vars: Record<string, number>): number {
  let b = evalUnary(tk, pos, vars);
  while (pos.i < tk.length && tk[pos.i].type === "OP" && tk[pos.i].value === "^") {
    pos.i++;
    b = Math.pow(b, evalUnary(tk, pos, vars));
  }
  return b;
}
function evalUnary(tk: Token[], pos: { i: number }, vars: Record<string, number>): number {
  if (pos.i < tk.length && tk[pos.i].type === "OP" && tk[pos.i].value === "NEG") {
    pos.i++;
    return -evalAtom(tk, pos, vars);
  }
  return evalAtom(tk, pos, vars);
}
function evalAtom(tk: Token[], pos: { i: number }, vars: Record<string, number>): number {
  if (pos.i >= tk.length) return 0;
  const t = tk[pos.i];
  if (t.type === "NUM") { pos.i++; return t.value as number; }
  if (t.type === "ID") {
    const name = t.value as string; pos.i++;
    if (pos.i < tk.length && tk[pos.i].type === "(") {
      pos.i++;
      const arg = evalExpr(tk, pos, vars);
      if (pos.i < tk.length && tk[pos.i].type === ")") pos.i++;
      switch (name) {
        case "sqrt": return Math.sqrt(arg);
        case "exp": return Math.exp(arg);
        case "log": case "ln": return Math.log(arg);
        case "abs": return Math.abs(arg);
        case "sin": return Math.sin(arg);
        case "cos": return Math.cos(arg);
        default: return arg;
      }
    }
    return name in vars ? vars[name] : 0;
  }
  if (t.type === "(") {
    pos.i++;
    const v = evalExpr(tk, pos, vars);
    if (pos.i < tk.length && tk[pos.i].type === ")") pos.i++;
    return v;
  }
  pos.i++;
  return 0;
}

// Compile an expression once into a function that re-evaluates against vars.
function compile(expr: string): (vars: Record<string, number>) => number {
  const tk = tokenize(expr);
  return (vars: Record<string, number>) => {
    try {
      const r = evalExpr(tk, { i: 0 }, vars);
      return isFinite(r) ? r : 0;
    } catch { return 0; }
  };
}

export interface ODE { varName: string; rhs: string; fn: (vars: Record<string, number>) => number }
export function parseEquations(eqs: string[]): ODE[] {
  return eqs.map((eq) => {
    const norm = eq.replace(/<-/g, "=").trim();
    let m = norm.match(/^d(\w+)\/dt\s*=\s*(.+)$/);
    if (m) return { varName: m[1], rhs: m[2], fn: compile(m[2]) };
    m = norm.match(/^(\w+)'\s*=\s*(.+)$/);
    if (m) return { varName: m[1], rhs: m[2], fn: compile(m[2]) };
    const parts = norm.split("=");
    if (parts.length === 2) {
      const lhs = parts[0].trim();
      const vm = lhs.match(/d(\w+)/);
      if (vm) return { varName: vm[1], rhs: parts[1].trim(), fn: compile(parts[1].trim()) };
    }
    return { varName: `_v${Math.random().toString(36).slice(2, 5)}`, rhs: "0", fn: () => 0 };
  });
}

export function simulateAtTimes(
  odes: ODE[], params: Record<string, number>, init: Record<string, number>,
  times: number[], maxStep = 0.25,
): Record<string, number[]> {
  const vars = odes.map((o) => o.varName);
  const state: Record<string, number> = {};
  vars.forEach((v) => { state[v] = init[v] ?? 0; });
  const out: Record<string, number[]> = {};
  vars.forEach((v) => { out[v] = []; });

  const sortedTimes = [...times].sort((a, b) => a - b);
  let t = sortedTimes[0];

  const derivs = (st: Record<string, number>, tt: number): Record<string, number> => {
    const ev: Record<string, number> = { ...params, ...st, t: tt };
    const d: Record<string, number> = {};
    for (const ode of odes) d[ode.varName] = ode.fn(ev);
    return d;
  };

  for (let idx = 0; idx < sortedTimes.length; idx++) {
    const target = sortedTimes[idx];
    let guard = 0;
    while (t < target - 1e-12 && guard < 100000) {
      const dt = Math.min(maxStep, target - t);
      const k1 = derivs(state, t);
      const s2: Record<string, number> = {}; vars.forEach((v) => s2[v] = state[v] + 0.5 * dt * k1[v]);
      const k2 = derivs(s2, t + 0.5 * dt);
      const s3: Record<string, number> = {}; vars.forEach((v) => s3[v] = state[v] + 0.5 * dt * k2[v]);
      const k3 = derivs(s3, t + 0.5 * dt);
      const s4: Record<string, number> = {}; vars.forEach((v) => s4[v] = state[v] + dt * k3[v]);
      const k4 = derivs(s4, t + dt);
      vars.forEach((v) => {
        const next = state[v] + (dt / 6) * (k1[v] + 2 * k2[v] + 2 * k3[v] + k4[v]);
        state[v] = isFinite(next) ? Math.max(next, 0) : 0;
      });
      t += dt;
      guard++;
    }
    vars.forEach((v) => out[v].push(state[v]));
  }
  return out;
}

// A mapping links one observed column to ONE OR MORE model compartments whose
// (weighted) sum should reproduce the observation. `componentWeights` are
// non-negative coefficients applied to each modelOutput before summing; if
// omitted they default to 1 (i.e. simple sum). `weight` is the residual weight
// (importance of this observation in the overall loss).
export type Mapping = {
  observedColumn: string;
  modelOutputs: string[];           // one or more compartment names
  componentWeights?: number[];      // length = modelOutputs.length, default = all 1
  weight?: number;                  // residual weight in loss
};
export type Dataset = { rows: Record<string, number | string>[]; timeColumn: string };
export type FitParam = { name: string; lower: number; upper: number; initial: number; fixed?: boolean };

function clip(x: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, x)); }

// Combined predicted = Σ c_j * pred[output_j]
function combinedSeries(map: Mapping, predicted: Record<string, number[]>): number[] {
  const outs = map.modelOutputs ?? [];
  const cw = map.componentWeights && map.componentWeights.length === outs.length
    ? map.componentWeights : outs.map(() => 1);
  // Determine length from ANY available predicted series (not just outs[0]).
  // If outs[0] is missing from `predicted` (e.g. typo or unmatched name), the previous
  // logic returned an empty array, silently producing zero predictions and a useless fit.
  let T = 0;
  for (const o of outs) {
    const s = predicted[o];
    if (s && s.length > T) T = s.length;
  }
  if (T === 0) {
    const firstKey = Object.keys(predicted)[0];
    T = firstKey ? (predicted[firstKey]?.length ?? 0) : 0;
  }
  const out: number[] = new Array(T).fill(0);
  for (let j = 0; j < outs.length; j++) {
    const series = predicted[outs[j]] ?? [];
    const c = cw[j];
    for (let i = 0; i < T; i++) out[i] += c * (series[i] ?? 0);
  }
  return out;
}

function computeResiduals(
  dataset: Dataset, mappings: Mapping[], predicted: Record<string, number[]>,
): { residuals: number[]; weights: number[] } {
  const residuals: number[] = [];
  const weights: number[] = [];
  for (const map of mappings) {
    const obsRaw = dataset.rows.map((r) => Number(r[map.observedColumn]));
    const pred = combinedSeries(map, predicted);
    const w = map.weight ?? 1;
    for (let i = 0; i < obsRaw.length; i++) {
      const o = obsRaw[i];
      if (!isFinite(o)) continue;
      residuals.push(o - (pred[i] ?? 0));
      weights.push(w);
    }
  }
  return { residuals, weights };
}

// Smart, non-negative least-squares fit for component weights of one mapping
// against a candidate parameter set. Returns weights summing approximately to
// the best linear combination — used by the UI's "auto-assign" feature.
export function suggestComponentWeights(
  observed: number[],            // length = T (NaN allowed)
  componentSeries: number[][],   // [outputs][T]
): { weights: number[]; r2: number } {
  const T = observed.length;
  const k = componentSeries.length;
  if (k === 0) return { weights: [], r2: 0 };
  // Mask valid rows
  const mask: number[] = [];
  for (let i = 0; i < T; i++) if (isFinite(observed[i])) mask.push(i);
  const n = mask.length;
  if (n === 0) return { weights: componentSeries.map(() => 1 / k), r2: 0 };
  // Build A (n×k) and y (n)
  const A: number[][] = mask.map((i) => componentSeries.map((s) => s[i] ?? 0));
  const y: number[] = mask.map((i) => observed[i]);
  // Solve normal equations AtA w = At y, then project to non-negative.
  const AtA: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const Aty: number[] = new Array(k).fill(0);
  for (let a = 0; a < k; a++) {
    for (let b = 0; b < k; b++) {
      let s = 0; for (let i = 0; i < n; i++) s += A[i][a] * A[i][b];
      AtA[a][b] = s;
    }
    let s = 0; for (let i = 0; i < n; i++) s += A[i][a] * y[i];
    Aty[a] = s;
  }
  // Tikhonov regularize a touch to stabilize
  const ridge = 1e-8 * (AtA.reduce((m, r, i) => Math.max(m, Math.abs(r[i])), 0) || 1);
  for (let i = 0; i < k; i++) AtA[i][i] += ridge;
  let w = solveLinear(AtA, Aty);
  if (!w) w = componentSeries.map(() => 1 / k);
  // Clip to non-negative & renormalize so largest component ≈ 1 if all were near zero
  w = w.map((v) => (isFinite(v) && v > 0 ? v : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) w = componentSeries.map(() => 1 / k);
  // R² of the linear combination
  const yhat: number[] = mask.map((i, j) => {
    let s = 0; for (let a = 0; a < k; a++) s += w![a] * (A[j][a] ?? 0); return s;
  });
  const ymean = y.reduce((a, b) => a + b, 0) / n;
  let ss = 0, st = 0;
  for (let i = 0; i < n; i++) { ss += (y[i] - yhat[i]) ** 2; st += (y[i] - ymean) ** 2; }
  const r2 = st > 0 ? 1 - ss / st : 0;
  return { weights: w, r2 };
}

function weightedSSE(res: number[], w: number[]): number {
  let s = 0;
  for (let i = 0; i < res.length; i++) s += w[i] * res[i] * res[i];
  return s;
}

function residualVector(
  thetaFree: number[], freeIdx: number[], allFitParams: FitParam[],
  fixedParams: Record<string, number>, odes: ODE[], init: Record<string, number>,
  times: number[], dataset: Dataset, mappings: Mapping[], maxStep: number,
) {
  const params: Record<string, number> = { ...fixedParams };
  for (let k = 0; k < allFitParams.length; k++) params[allFitParams[k].name] = allFitParams[k].initial;
  for (let k = 0; k < freeIdx.length; k++) params[allFitParams[freeIdx[k]].name] = thetaFree[k];
  const pred = simulateAtTimes(odes, params, init, times, maxStep);
  return computeResiduals(dataset, mappings, pred);
}

function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
    if (Math.abs(M[piv][i]) < 1e-14) return null;
    [M[i], M[piv]] = [M[piv], M[i]];
    for (let k = i + 1; k < n; k++) {
      const f = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

function invertMatrix(A: number[][]): number[][] | null {
  const n = A.length;
  const M: number[][] = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
    if (Math.abs(M[piv][i]) < 1e-12) return null;
    [M[i], M[piv]] = [M[piv], M[i]];
    const d = M[i][i];
    for (let j = 0; j < 2 * n; j++) M[i][j] /= d;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const f = M[k][i];
      for (let j = 0; j < 2 * n; j++) M[k][j] -= f * M[i][j];
    }
  }
  return M.map((row) => row.slice(n));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scale-aware parameter transforms
// Wide-range positive parameters (>=1 decade) are fit in log-space to give the
// optimizer a balanced curvature view. Otherwise we fit in linear space.
// All public theta values are returned in linear space (untransformed).
// ─────────────────────────────────────────────────────────────────────────────
type Scale = "lin" | "log";
function scaleOf(p: FitParam): Scale {
  return p.lower > 0 && p.upper / p.lower >= 10 ? "log" : "lin";
}
function toX(p: FitParam, v: number): number {
  return scaleOf(p) === "log" ? Math.log(Math.max(v, p.lower)) : v;
}
function fromX(p: FitParam, x: number): number {
  return scaleOf(p) === "log" ? Math.exp(x) : x;
}
function boundsX(p: FitParam): { lo: number; hi: number } {
  return scaleOf(p) === "log"
    ? { lo: Math.log(p.lower), hi: Math.log(p.upper) }
    : { lo: p.lower, hi: p.upper };
}

function lmFit(
  fitParams: FitParam[], fixedParams: Record<string, number>, odes: ODE[],
  init: Record<string, number>, times: number[], dataset: Dataset, mappings: Mapping[],
  opts: { maxIter: number; tol: number; maxStep: number },
) {
  const freeIdx: number[] = [];
  fitParams.forEach((p, i) => { if (!p.fixed) freeIdx.push(i); });

  // Work in transformed space (log for wide-range positives, linear otherwise)
  const xBounds = freeIdx.map((i) => boundsX(fitParams[i]));
  let xTheta = freeIdx.map((i, k) => {
    const v = clip(fitParams[i].initial, fitParams[i].lower, fitParams[i].upper);
    return clip(toX(fitParams[i], v), xBounds[k].lo, xBounds[k].hi);
  });

  const evalAt = (xt: number[]) => {
    const linTheta = xt.map((x, k) => fromX(fitParams[freeIdx[k]], x));
    return residualVector(linTheta, freeIdx, fitParams, fixedParams, odes, init, times, dataset, mappings, opts.maxStep);
  };

  let lambda = 1e-3;
  let prevSSE = Infinity;
  let iter = 0;
  let converged = false;
  let message = "Did not converge within max iterations";
  let stallCount = 0;

  for (iter = 0; iter < opts.maxIter; iter++) {
    const { residuals: res, weights } = evalAt(xTheta);
    const sse = weightedSSE(res, weights);
    if (!isFinite(sse)) { message = "Numerical instability — try wider bounds or smaller step."; break; }

    const m = res.length, n = xTheta.length;
    const J: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      const orig = xTheta[j];
      const range = xBounds[j].hi - xBounds[j].lo;
      const h = Math.max(1e-6 * Math.max(1, Math.abs(orig)), 1e-8 * range);
      const tp = [...xTheta]; tp[j] = clip(orig + h, xBounds[j].lo, xBounds[j].hi);
      const { residuals: rp } = evalAt(tp);
      const dh = tp[j] - orig || h;
      for (let i = 0; i < m; i++) J[i][j] = (rp[i] - res[i]) / dh;
    }

    const JtWJ: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    const JtWr: number[] = new Array(n).fill(0);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        let s = 0; for (let i = 0; i < m; i++) s += weights[i] * J[i][a] * J[i][b];
        JtWJ[a][b] = s;
      }
      let s = 0; for (let i = 0; i < m; i++) s += weights[i] * J[i][a] * res[i];
      JtWr[a] = s;
    }

    // Marquardt-style scaled damping using diag(JtWJ) instead of plain identity:
    // adapts step size to per-parameter curvature, accelerates ill-conditioned fits.
    const diagJ = JtWJ.map((row, i) => Math.max(row[i], 1e-12));

    let accepted = false;
    for (let attempts = 0; !accepted && attempts < 12; attempts++) {
      const A: number[][] = JtWJ.map((row, i) => row.map((v, j) => i === j ? v + lambda * diagJ[i] : v));
      const delta = solveLinear(A, JtWr);
      if (!delta) { lambda *= 10; continue; }
      // Backtracking line search along the LM direction (helps when the model
      // is highly non-linear in some parameter directions).
      let alpha = 1;
      let bestTrial: number[] | null = null;
      let bestTrialSSE = Infinity;
      for (let ls = 0; ls < 6; ls++) {
        const trial = xTheta.map((v, j) => clip(v + alpha * delta[j], xBounds[j].lo, xBounds[j].hi));
        const { residuals: rt, weights: wt } = evalAt(trial);
        const sseTrial = weightedSSE(rt, wt);
        if (isFinite(sseTrial) && sseTrial < bestTrialSSE) { bestTrialSSE = sseTrial; bestTrial = trial; }
        if (sseTrial < sse) break;
        alpha *= 0.5;
      }
      if (bestTrial && bestTrialSSE < sse) {
        const rel = Math.abs(prevSSE - bestTrialSSE) / Math.max(1e-12, prevSSE);
        xTheta = bestTrial;
        lambda = Math.max(lambda / 7, 1e-12);
        accepted = true;
        prevSSE = bestTrialSSE;
        stallCount = 0;
        if (rel < opts.tol) {
          converged = true; message = "Converged: relative SSE change below tolerance"; iter++; break;
        }
      } else {
        lambda *= 7;
      }
    }
    if (converged) break;
    if (!accepted) {
      stallCount++;
      if (stallCount >= 2) { message = "Stalled — no improvement after step refinements"; break; }
    }
  }

  // Untransform theta back to linear/native parameter space
  const theta = xTheta.map((x, k) => fromX(fitParams[freeIdx[k]], x));
  return { theta, sse: prevSSE, iter, converged, message, freeIdx };
}

export interface CalibrationOptions {
  method?: "lm_bounded" | "least_squares" | "weighted_lsq";
  multistarts?: number;
  maxIter?: number;
  tol?: number;
  maxStep?: number;
  snapshotTime?: number;
  datasetShape?: "single_timeseries" | "multi_timeseries" | "snapshot" | "form_submissions";
  onProgress?: (msg: string) => void;
}

export interface CalibrationInputs {
  equations: string[];
  fitParams: FitParam[];
  fixedParams?: Record<string, number>;
  initialValues: Record<string, number>;
  dataset: Dataset;
  mappings: Mapping[];
}

export async function runCalibration(input: CalibrationInputs, opts: CalibrationOptions = {}) {
  const {
    multistarts = 8, maxIter = 150, tol = 1e-9, maxStep = 0.25,
    datasetShape = "single_timeseries", snapshotTime = 0, onProgress,
  } = opts;

  const equations = input.equations;
  const fitParams = input.fitParams;
  const fixedParams = input.fixedParams ?? {};
  const initialValues = input.initialValues;
  let mappings = input.mappings;
  const dataset = input.dataset;

  // Validation
  const errs: string[] = [];
  if (!equations?.length) errs.push("equations[] is required");
  if (!fitParams?.length) errs.push("fitParams[] is required");
  if (!dataset?.rows?.length) errs.push("dataset.rows[] is required");
  if (!mappings?.length) errs.push("mappings[] is required");
  for (const p of fitParams || []) {
    if (!isFinite(p.lower) || !isFinite(p.upper)) errs.push(`Bounds for ${p.name} must be finite`);
    if (p.lower >= p.upper) errs.push(`Bounds for ${p.name}: lower must be < upper`);
    if (p.initial < p.lower || p.initial > p.upper) errs.push(`Initial value for ${p.name} must be in [lower, upper]`);
  }
  if (errs.length) throw new Error("Validation failed: " + errs.join("; "));

  const odes = parseEquations(equations);

  // Data quality
  const warnings: string[] = [];
  if (datasetShape !== "snapshot") {
    const tcol = dataset.timeColumn;
    const cleanRows = dataset.rows.filter((r) => isFinite(Number(r[tcol])));
    cleanRows.sort((a, b) => Number(a[tcol]) - Number(b[tcol]));
    const skipped = dataset.rows.length - cleanRows.length;
    if (skipped > 0) warnings.push(`${skipped} non-numeric time values skipped.`);
    const ts = cleanRows.map((r) => Number(r[tcol]));
    const dups = ts.filter((t, i) => i > 0 && t === ts[i - 1]).length;
    if (dups > 0) warnings.push(`${dups} duplicate time points found.`);
    if (ts.length < 5) warnings.push("Fewer than 5 observed time points — fit is exploratory only.");
    dataset.rows = cleanRows;
  }
  if (fitParams.length > Math.max(2, Math.floor(dataset.rows.length / 3))) {
    warnings.push(`Fitting ${fitParams.length} parameters with only ${dataset.rows.length} observations risks overfitting.`);
  }
  for (const m of mappings) {
    const outs = m.modelOutputs ?? [];
    if (outs.length === 0) {
      warnings.push(`Mapping for '${m.observedColumn}' has no model outputs assigned.`);
    }
    for (const out of outs) {
      if (!odes.find((o) => o.varName === out)) {
        warnings.push(`Model has no compartment named '${out}' — mapping is invalid.`);
      }
    }
  }

  const times = datasetShape === "snapshot"
    ? [snapshotTime]
    : dataset.rows.map((r) => Number(r[dataset.timeColumn]));

  // ── Multistart with Latin Hypercube Sampling ──
  // LHS gives much better coverage of the parameter space than independent
  // uniform draws — every dimension is stratified into `starts` bins, each
  // visited exactly once. Combined with the seed-from-initial start (s=0),
  // this dramatically reduces the chance of missing the global minimum.
  const sampleStart = (p: FitParam, useRandom: boolean, stratum?: number, total?: number): number => {
    if (!useRandom) return clip(p.initial, p.lower, p.upper);
    // Latin Hypercube: stratum k of N draws u in [(k+rand)/N]
    const u = stratum != null && total
      ? (stratum + Math.random()) / total
      : Math.random();
    if (p.lower > 0 && p.upper / p.lower >= 10) {
      const lnLo = Math.log(p.lower), lnHi = Math.log(p.upper);
      return clip(Math.exp(lnLo + u * (lnHi - lnLo)), p.lower, p.upper);
    }
    return clip(p.lower + u * (p.upper - p.lower), p.lower, p.upper);
  };
  const results: Awaited<ReturnType<typeof lmFit>>[] = [];
  const starts = Math.min(40, Math.max(1, multistarts));

  // Build per-parameter shuffled stratum order so each dimension is visited
  // independently — proper Latin Hypercube design.
  const strataPerParam: number[][] = fitParams.map(() => {
    const arr = Array.from({ length: starts }, (_, k) => k);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  });

  for (let s = 0; s < starts; s++) {
    onProgress?.(`Running optimization start ${s + 1} / ${starts}…`);
    const startParams: FitParam[] = fitParams.map((p, idx) => {
      if (p.fixed) return { ...p };
      // First start uses user's initial guess; rest use LHS strata.
      return { ...p, initial: sampleStart(p, s !== 0, strataPerParam[idx][s], starts) };
    });
    const r = lmFit(startParams, fixedParams, odes, initialValues, times, dataset, mappings, { maxIter, tol, maxStep });
    results.push(r);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  results.sort((a, b) => a.sse - b.sse);
  let best = results[0];
  let freeIdx = best.freeIdx;

  // Helper: compute R² for the current best so the acceptance loop can decide
  // whether more polishing is worth the wall-clock budget.
  const computeR2 = (b: typeof best, mapsArg: Mapping[]): number => {
    const { residuals, weights: rw } = residualVector(b.theta, freeIdx, fitParams, fixedParams, odes, initialValues, times, dataset, mapsArg, maxStep);
    const sseLoc = weightedSSE(residuals, rw);
    const obs: number[] = [];
    for (const m of mapsArg) for (const r of dataset.rows) {
      const v = Number(r[m.observedColumn]); if (isFinite(v)) obs.push(v);
    }
    const mu = obs.reduce((a, b2) => a + b2, 0) / Math.max(1, obs.length);
    let ssTot = 0; for (const v of obs) ssTot += (v - mu) ** 2;
    return ssTot > 0 ? 1 - sseLoc / ssTot : 0;
  };

  // ── Iterative refinement loop (alternating weights ↔ parameters) ──
  // Now wrapped in an OUTER acceptance loop that targets R² ≥ 0.95. If the
  // fit is still weak after polishing, we trigger basin-hopping: large random
  // jumps from the current best to escape deep local minima, then re-polish.
  const TARGET_R2 = 0.95;
  const MAX_OUTER_ROUNDS = 4;
  const hasMultiComp = mappings.some((m) => (m.modelOutputs ?? []).length > 1);

  if (datasetShape !== "snapshot") {
    for (let outer = 0; outer < MAX_OUTER_ROUNDS; outer++) {
      const MAX_PASSES = hasMultiComp ? 6 : 4;
      let prevSSE = best.sse;
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        onProgress?.(`Polishing fit · round ${outer + 1} pass ${pass + 1}/${MAX_PASSES}…`);

        // 1. Refit non-negative component weights at current best theta.
        const paramsAtBest: Record<string, number> = { ...fixedParams };
        fitParams.forEach((p, i) => {
          const idx = freeIdx.indexOf(i);
          paramsAtBest[p.name] = idx >= 0 ? best.theta[idx] : p.initial;
        });
        const predAt = simulateAtTimes(odes, paramsAtBest, initialValues, times, maxStep);
        const refittedMappings: Mapping[] = mappings.map((m) => {
          const outs = m.modelOutputs ?? [];
          if (outs.length <= 1) return m;
          const obs = dataset.rows.map((r) => Number(r[m.observedColumn]));
          const compSeries = outs.map((o) => predAt[o] ?? new Array(obs.length).fill(0));
          const { weights: w, r2 } = suggestComponentWeights(obs, compSeries);
          if (!isFinite(r2) || w.length !== outs.length) return m;
          return { ...m, componentWeights: w };
        });

        // 2. Polish parameters with refreshed weights starting from current best.
        const polishStart: FitParam[] = fitParams.map((p, i) => {
          const idx = freeIdx.indexOf(i);
          return { ...p, initial: idx >= 0 ? best.theta[idx] : p.initial };
        });
        const polished = lmFit(polishStart, fixedParams, odes, initialValues, times, dataset, refittedMappings, { maxIter, tol, maxStep });
        if (polished.sse < best.sse - 1e-12) {
          best = polished;
          freeIdx = polished.freeIdx;
          mappings = refittedMappings;
        }
        const rel = Math.abs(prevSSE - best.sse) / Math.max(1e-12, prevSSE);
        if (rel < tol) break;
        prevSSE = best.sse;
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      // 3. Local perturbation polish (±2% jiggle).
      onProgress?.(`Final perturbation polish · round ${outer + 1}…`);
      for (let attempt = 0; attempt < 4; attempt++) {
        const jiggled: FitParam[] = fitParams.map((p, i) => {
          const idx = freeIdx.indexOf(i);
          const v = idx >= 0 ? best.theta[idx] : p.initial;
          const jitter = v * (1 + (Math.random() - 0.5) * 0.04);
          return { ...p, initial: clip(jitter, p.lower, p.upper) };
        });
        const r = lmFit(jiggled, fixedParams, odes, initialValues, times, dataset, mappings, { maxIter, tol, maxStep });
        if (r.sse < best.sse - 1e-12) { best = r; freeIdx = r.freeIdx; }
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      // 4. Check fit quality. If strong, stop. Otherwise basin-hop and retry.
      const r2Now = computeR2(best, mappings);
      if (r2Now >= TARGET_R2) {
        onProgress?.(`Strong fit reached (R²=${r2Now.toFixed(3)}).`);
        break;
      }
      if (outer === MAX_OUTER_ROUNDS - 1) break;

      // Basin-hopping: 4 large random jumps in transformed space, polish each.
      onProgress?.(`R²=${r2Now.toFixed(3)} — basin-hopping for a better minimum…`);
      const hops = 4;
      for (let h = 0; h < hops; h++) {
        const hopped: FitParam[] = fitParams.map((p, i) => {
          if (p.fixed) return { ...p };
          const idx = freeIdx.indexOf(i);
          const v = idx >= 0 ? best.theta[idx] : p.initial;
          // Jump in log-space if applicable, else linear, by up to ±50% of range.
          let candidate: number;
          if (p.lower > 0 && p.upper / p.lower >= 10) {
            const lv = Math.log(Math.max(v, p.lower));
            const span = (Math.log(p.upper) - Math.log(p.lower)) * 0.5;
            candidate = Math.exp(lv + (Math.random() - 0.5) * 2 * span);
          } else {
            const span = (p.upper - p.lower) * 0.5;
            candidate = v + (Math.random() - 0.5) * 2 * span;
          }
          return { ...p, initial: clip(candidate, p.lower, p.upper) };
        });
        const r = lmFit(hopped, fixedParams, odes, initialValues, times, dataset, mappings, { maxIter, tol, maxStep });
        if (r.sse < best.sse - 1e-12) { best = r; freeIdx = r.freeIdx; }
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  // Diagnostics
  onProgress?.("Computing diagnostics…");
  const { residuals: res, weights } = residualVector(best.theta, freeIdx, fitParams, fixedParams, odes, initialValues, times, dataset, mappings, maxStep);
  const n = res.length, k = freeIdx.length;
  const sse = weightedSSE(res, weights);
  const mse = sse / Math.max(1, n);
  const rmse = Math.sqrt(mse);
  let mae = 0; for (const r of res) mae += Math.abs(r); mae /= Math.max(1, n);

  const obsAll: number[] = [];
  for (const m of mappings) for (const r of dataset.rows) {
    const v = Number(r[m.observedColumn]); if (isFinite(v)) obsAll.push(v);
  }
  const obsMean = obsAll.reduce((a, b) => a + b, 0) / Math.max(1, obsAll.length);
  let ssTot = 0; for (const v of obsAll) ssTot += (v - obsMean) ** 2;
  const r2 = ssTot > 0 ? 1 - sse / ssTot : 0;
  const adjR2 = n - k - 1 > 0 ? 1 - (1 - r2) * (n - 1) / (n - k - 1) : null;
  const sigma2 = sse / Math.max(1, n);
  const logLik = sigma2 > 0 ? -0.5 * n * (Math.log(2 * Math.PI * sigma2) + 1) : 0;
  const aic = 2 * k - 2 * logLik;
  const bic = k * Math.log(Math.max(1, n)) - 2 * logLik;

  // Approximate covariance via JtJ at optimum
  const m = res.length;
  const J: number[][] = Array.from({ length: m }, () => new Array(k).fill(0));
  for (let j = 0; j < k; j++) {
    const orig = best.theta[j];
    const lo = fitParams[freeIdx[j]].lower, hi = fitParams[freeIdx[j]].upper;
    const h = Math.max(1e-6 * Math.max(1, Math.abs(orig)), 1e-8 * (hi - lo));
    const tp = [...best.theta]; tp[j] = clip(orig + h, lo, hi);
    const { residuals: rp } = residualVector(tp, freeIdx, fitParams, fixedParams, odes, initialValues, times, dataset, mappings, maxStep);
    const dh = tp[j] - orig || h;
    for (let i = 0; i < m; i++) J[i][j] = (rp[i] - res[i]) / dh;
  }
  const JtJ: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) {
    let s = 0; for (let i = 0; i < m; i++) s += J[i][a] * J[i][b];
    JtJ[a][b] = s;
  }
  const cov = invertMatrix(JtJ);
  const se: (number | null)[] = new Array(k).fill(null);
  let identifiabilityFlag: string | null = null;
  if (cov) {
    for (let i = 0; i < k; i++) {
      const v = cov[i][i] * sigma2;
      se[i] = v > 0 ? Math.sqrt(v) : null;
    }
  } else {
    identifiabilityFlag = "Information matrix is singular — parameters are not jointly identifiable from this data.";
  }
  const fitQuality: "strong" | "moderate" | "weak" = r2 >= 0.9 ? "strong" : r2 >= 0.6 ? "moderate" : "weak";

  // Calibrated parameter table
  const calibratedParameters = fitParams.map((p, i) => {
    const idx = freeIdx.indexOf(i);
    const isFree = idx >= 0;
    const value = isFree ? best.theta[idx] : p.initial;
    const seVal = isFree && se[idx] != null ? (se[idx] as number) : null;
    const ci = seVal != null ? { lower: value - 1.96 * seVal, upper: value + 1.96 * seVal, exploratory: true } : null;
    return {
      name: p.name, lower: p.lower, upper: p.upper, initial: p.initial,
      value, standardError: seVal, confidenceInterval: ci, fixed: !!p.fixed,
      atBound: isFree && (Math.abs(value - p.lower) < 1e-6 || Math.abs(value - p.upper) < 1e-6),
    };
  });

  // Predicted dense + at observed
  const params: Record<string, number> = { ...fixedParams };
  for (const p of calibratedParameters) params[p.name] = p.value;
  const denseTimes: number[] = [];
  if (datasetShape !== "snapshot") {
    const t0 = Math.min(...times), t1 = Math.max(...times), N = 200;
    for (let i = 0; i <= N; i++) denseTimes.push(t0 + (i / N) * (t1 - t0));
  } else denseTimes.push(times[0]);
  const predDense = simulateAtTimes(odes, params, initialValues, denseTimes, maxStep);
  const predAtObs = simulateAtTimes(odes, params, initialValues, times, maxStep);

  const idHints: string[] = [];
  if (identifiabilityFlag) idHints.push(identifiabilityFlag);
  for (const p of calibratedParameters) {
    if (p.atBound) idHints.push(`${p.name} converged to its bound — bounds may be too tight.`);
    if (p.standardError != null && Math.abs(p.value) > 0 && p.standardError / Math.abs(p.value) > 0.5) {
      idHints.push(`${p.name} is weakly identified (SE/|θ| > 50%).`);
    }
  }

  return {
    method: opts.method ?? "lm_bounded",
    datasetShape, multistarts: starts,
    iterations: best.iter, converged: best.converged, solverMessage: best.message,
    calibratedParameters,
    diagnostics: {
      sse, rmse, mae, r2, adjR2, aic, bic,
      nObservations: n, nFreeParams: k, fitQuality,
    },
    warnings, identifiabilityHints: idHints,
    observed: { times, mappings: mappings.map((mp) => ({ ...mp, values: dataset.rows.map((r) => Number(r[mp.observedColumn])) })) },
    predicted: {
      atObservedTimes: { times, series: predAtObs, mappings },
      dense: { times: denseTimes, series: predDense },
    },
    multistartResults: results.map((r) => ({ sse: r.sse, converged: r.converged, iter: r.iter })),
    reproducibility: {
      timestamp: new Date().toISOString(),
      equations, fixedParams, initialValues, mappings, datasetShape,
      method: opts.method ?? "lm_bounded", multistarts: starts, maxIter, tol, maxStep,
      nObservations: dataset.rows.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parameter importance via normalized local sensitivity:
//   Sᵢ = ‖∂y/∂pᵢ · pᵢ / ‖y‖‖₂   (finite-difference, ±5 % perturbation)
// Used by the Calibration UI to auto-pick which parameters to estimate.
// ─────────────────────────────────────────────────────────────────────────────
export interface ParameterImportance {
  name: string;
  sensitivity: number;       // normalized magnitude (0 = inert, 1 = most sensitive)
  rawScore: number;          // raw L2 sensitivity
  recommended: boolean;      // true if among the top-N influential
  suggestedLower: number;
  suggestedUpper: number;
  suggestedInitial: number;
}

export function suggestParameterImportance(
  equations: string[],
  parameters: { name: string; value: number }[],
  initialValues: Record<string, number>,
  mappings: Mapping[],
  dataset: Dataset,
  opts: { topN?: number; perturbation?: number } = {},
): ParameterImportance[] {
  const odes = parseEquations(equations);
  const baseParams: Record<string, number> = Object.fromEntries(parameters.map((p) => [p.name, p.value]));
  const tCol = dataset.timeColumn;
  const times = dataset.rows.map((r) => Number(r[tCol])).filter((v) => isFinite(v));
  if (times.length === 0) {
    return parameters.map((p) => buildSuggestion(p.name, p.value, 0, 0, false));
  }
  const maxStep = Math.max(0.01, (Math.max(...times) - Math.min(...times)) / Math.max(20, times.length));
  const basePred = simulateAtTimes(odes, baseParams, initialValues, times, maxStep);
  const baseY: number[] = [];
  for (const m of mappings) baseY.push(...combinedSeries(m, basePred));
  const yNorm = Math.sqrt(baseY.reduce((s, v) => s + v * v, 0)) || 1;

  const eps = opts.perturbation ?? 0.05;
  const raw: { name: string; value: number; score: number }[] = [];

  for (const p of parameters) {
    const h = Math.abs(p.value) > 1e-12 ? p.value * eps : eps;
    const up = { ...baseParams, [p.name]: p.value + h };
    const dn = { ...baseParams, [p.name]: p.value - h };
    let predUp: Record<string, number[]>; let predDn: Record<string, number[]>;
    try {
      predUp = simulateAtTimes(odes, up, initialValues, times, maxStep);
      predDn = simulateAtTimes(odes, dn, initialValues, times, maxStep);
    } catch { raw.push({ name: p.name, value: p.value, score: 0 }); continue; }
    const yUp: number[] = []; const yDn: number[] = [];
    for (const m of mappings) { yUp.push(...combinedSeries(m, predUp)); yDn.push(...combinedSeries(m, predDn)); }
    let sq = 0;
    for (let i = 0; i < yUp.length; i++) {
      const dy = (yUp[i] - yDn[i]) / (2 * h);          // central finite difference
      const norm = (dy * Math.abs(p.value)) / yNorm;    // dimensionless sensitivity
      sq += norm * norm;
    }
    raw.push({ name: p.name, value: p.value, score: Math.sqrt(sq) });
  }

  const maxScore = Math.max(1e-12, ...raw.map((r) => r.score));
  const ranked = [...raw].sort((a, b) => b.score - a.score);
  const defaultTopN = Math.max(1, Math.min(
    opts.topN ?? 5,
    Math.max(1, Math.floor(times.length / 3)),
  ));
  const recommendedNames = new Set(
    ranked.filter((r) => r.score > maxScore * 0.05).slice(0, defaultTopN).map((r) => r.name),
  );

  return raw.map((r) =>
    buildSuggestion(r.name, r.value, r.score, r.score / maxScore, recommendedNames.has(r.name)),
  );
}

function buildSuggestion(
  name: string, value: number, rawScore: number, sensitivity: number, recommended: boolean,
): ParameterImportance {
  // Smart bounds: positive params → [v/10, v*10]; zero → [0, 1]; negative → mirror.
  let lower: number, upper: number, initial: number;
  if (value === 0) { lower = 0; upper = 1; initial = 0.1; }
  else if (value > 0) { lower = value / 10; upper = value * 10; initial = value; }
  else { lower = value * 10; upper = value / 10; initial = value; }
  return {
    name, sensitivity, rawScore, recommended,
    suggestedLower: Number(lower.toPrecision(4)),
    suggestedUpper: Number(upper.toPrecision(4)),
    suggestedInitial: Number(initial.toPrecision(6)),
  };
}
