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

export type Mapping = { observedColumn: string; modelOutput: string; weight?: number };
export type Dataset = { rows: Record<string, number | string>[]; timeColumn: string };
export type FitParam = { name: string; lower: number; upper: number; initial: number; fixed?: boolean };

function clip(x: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, x)); }

function computeResiduals(
  dataset: Dataset, mappings: Mapping[], predicted: Record<string, number[]>,
): { residuals: number[]; weights: number[] } {
  const residuals: number[] = [];
  const weights: number[] = [];
  for (const map of mappings) {
    const obsRaw = dataset.rows.map((r) => Number(r[map.observedColumn]));
    const pred = predicted[map.modelOutput] ?? [];
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

function lmFit(
  fitParams: FitParam[], fixedParams: Record<string, number>, odes: ODE[],
  init: Record<string, number>, times: number[], dataset: Dataset, mappings: Mapping[],
  opts: { maxIter: number; tol: number; maxStep: number },
) {
  const freeIdx: number[] = [];
  fitParams.forEach((p, i) => { if (!p.fixed) freeIdx.push(i); });
  let theta = freeIdx.map((i) => clip(fitParams[i].initial, fitParams[i].lower, fitParams[i].upper));
  let lambda = 1e-3;
  let prevSSE = Infinity;
  let iter = 0;
  let converged = false;
  let message = "Did not converge within max iterations";

  for (iter = 0; iter < opts.maxIter; iter++) {
    const { residuals: res, weights } = residualVector(theta, freeIdx, fitParams, fixedParams, odes, init, times, dataset, mappings, opts.maxStep);
    const sse = weightedSSE(res, weights);
    if (!isFinite(sse)) { message = "Numerical instability — try wider bounds or smaller step."; break; }

    const m = res.length, n = theta.length;
    const J: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      const orig = theta[j];
      const range = fitParams[freeIdx[j]].upper - fitParams[freeIdx[j]].lower;
      const h = Math.max(1e-6 * Math.max(1, Math.abs(orig)), 1e-8 * range);
      const tp = [...theta]; tp[j] = clip(orig + h, fitParams[freeIdx[j]].lower, fitParams[freeIdx[j]].upper);
      const { residuals: rp } = residualVector(tp, freeIdx, fitParams, fixedParams, odes, init, times, dataset, mappings, opts.maxStep);
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

    let accepted = false;
    for (let attempts = 0; !accepted && attempts < 10; attempts++) {
      const A: number[][] = JtWJ.map((row, i) => row.map((v, j) => i === j ? v * (1 + lambda) : v));
      const delta = solveLinear(A, JtWr);
      if (!delta) { lambda *= 10; continue; }
      const trial = theta.map((v, j) => clip(v + delta[j], fitParams[freeIdx[j]].lower, fitParams[freeIdx[j]].upper));
      const { residuals: rt, weights: wt } = residualVector(trial, freeIdx, fitParams, fixedParams, odes, init, times, dataset, mappings, opts.maxStep);
      const sseTrial = weightedSSE(rt, wt);
      if (sseTrial < sse) {
        theta = trial;
        lambda = Math.max(lambda / 10, 1e-12);
        accepted = true;
        if (Math.abs(prevSSE - sseTrial) / Math.max(1e-12, prevSSE) < opts.tol) {
          converged = true; message = "Converged: relative SSE change below tolerance"; iter++; prevSSE = sseTrial; break;
        }
        prevSSE = sseTrial;
      } else lambda *= 10;
    }
    if (converged) break;
    if (!accepted) { message = "Stalled — no improvement after 10 lambda increases"; break; }
  }
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
    multistarts = 5, maxIter = 80, tol = 1e-6, maxStep = 0.25,
    datasetShape = "single_timeseries", snapshotTime = 0, onProgress,
  } = opts;

  const equations = input.equations;
  const fitParams = input.fitParams;
  const fixedParams = input.fixedParams ?? {};
  const initialValues = input.initialValues;
  const mappings = input.mappings;
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
    if (!odes.find((o) => o.varName === m.modelOutput)) {
      warnings.push(`Model has no compartment named '${m.modelOutput}' — mapping is invalid.`);
    }
  }

  const times = datasetShape === "snapshot"
    ? [snapshotTime]
    : dataset.rows.map((r) => Number(r[dataset.timeColumn]));

  // Multistart — yield to UI between starts so the page stays responsive.
  const results: Awaited<ReturnType<typeof lmFit>>[] = [];
  const starts = Math.min(20, Math.max(1, multistarts));
  for (let s = 0; s < starts; s++) {
    onProgress?.(`Running optimization start ${s + 1} / ${starts}…`);
    const startParams: FitParam[] = fitParams.map((p) => {
      if (p.fixed || s === 0) return { ...p };
      const u = Math.random();
      return { ...p, initial: clip(p.lower + u * (p.upper - p.lower), p.lower, p.upper) };
    });
    const r = lmFit(startParams, fixedParams, odes, initialValues, times, dataset, mappings, { maxIter, tol, maxStep });
    results.push(r);
    // Yield to the event loop so React can paint progress.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  results.sort((a, b) => a.sse - b.sse);
  const best = results[0];
  const freeIdx = best.freeIdx;

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
