/**
 * Sensitivity Analysis Engine
 * ──────────────────────────────────────────────────────────────────────────
 * Pure-TS, in-browser sensitivity analysis for compartmental ODE models.
 *
 * Methods supported:
 *   - "oat"     One-at-a-time local sensitivity (finite differences)
 *   - "nsi"     Normalized Sensitivity Index   S = (∂Y/∂p)·(p/Y)
 *   - "lhs"     Latin Hypercube Sampling + PRCC (Partial Rank Corr Coeff)
 *   - "sobol"   Saltelli-style first-order & total-order Sobol indices
 *
 * Output metrics supported:
 *   - peak           Peak value (max over time) of selected compartment(s)
 *   - peak_time      Time of peak
 *   - final          Final value at t_end
 *   - cumulative     Trapezoidal integral over the time window
 *   - incidence_at   Value at a specific time-point
 *   - endemic        Mean over the last 10% of the time window
 *   - r0_proxy       Initial growth rate ln(I(t1)/I(t0))/(t1−t0) of target
 *
 * The engine reuses the local RK4 simulator already shipped with the app
 * (compatible signature with `localMathModelSimulation`).
 */

// ─────────────────────────────  TYPES  ──────────────────────────────────

export type SensitivityMethod = "oat" | "nsi" | "lhs" | "sobol";

export type OutputMetric =
  | "peak"
  | "peak_time"
  | "final"
  | "cumulative"
  | "incidence_at"
  | "endemic"
  | "r0_proxy";

export interface ParamRange {
  name: string;
  baseline: number;
  lower: number;
  upper: number;
  /** Free-text description ("transmission rate", "recovery rate"…) */
  description?: string;
}

export interface SensitivityConfig {
  method: SensitivityMethod;
  /** Compartment or list of compartments aggregated (sum) for the metric */
  targets: string[];
  metric: OutputMetric;
  /** For incidence_at metric — the time point of interest */
  metricTime?: number;
  /** Restrict analysis to a sub-window of the simulation */
  windowStart?: number;
  windowEnd?: number;
  /** Parameters to vary */
  params: ParamRange[];
  /** Sample count for global methods (LHS / Sobol) */
  samples?: number;
  /** Step fraction for OAT/NSI, default 0.05 (=±5%) */
  perturbation?: number;
}

export interface ModelSpec {
  equations: string[];
  baseParameters: Record<string, number>;
  initialValues: Record<string, number>;
  compartments: string[];
  timeConfig: { start: number; end: number; step: number };
}

export interface SensitivityRow {
  parameter: string;
  baseline: number;
  range: [number, number];
  index: number;        // dimensionless index (NSI / PRCC / Sobol Si)
  totalIndex?: number;  // Sobol total-order if available
  rank: number;
  direction: "+" | "−" | "0";
  /** Variation in output (% change vs baseline) when the parameter is varied */
  outputDelta?: number;
  pValue?: number;
  method: SensitivityMethod;
}

export interface TimeProfilePoint {
  t: number;
  /** map parameter -> normalized sensitivity at time t */
  values: Record<string, number>;
}

export interface SensitivityResult {
  method: SensitivityMethod;
  metric: OutputMetric;
  targets: string[];
  baselineOutput: number;
  rows: SensitivityRow[];
  /** Time-resolved normalized sensitivities (NSI only) */
  timeProfile?: TimeProfilePoint[];
  /** Raw LHS samples for scatter / further analysis */
  samples?: { params: Record<string, number>; output: number }[];
  /** Plain-language interpretation */
  interpretation: string;
  warnings: string[];
  computedAt: number;
  /** Sample count actually used (for global methods) */
  sampleCount?: number;
}

// ───────────────────────────  RK4 SIMULATOR  ─────────────────────────────
//   Light, fast, deterministic — same numerical path as
//   `localMathModelSimulation` but trimmed for repeated calls.
//
//   Returns a dense time grid `t` and per-compartment series.

interface SimResult {
  t: number[];
  series: Record<string, number[]>;
}

function buildSafeEval(rhs: string) {
  const expr = rhs
    .replace(/\bsqrt\b/g, "Math.sqrt")
    .replace(/\bexp\b/g, "Math.exp")
    .replace(/\blog\b/g, "Math.log")
    .replace(/\babs\b/g, "Math.abs")
    .replace(/\bsin\b/g, "Math.sin")
    .replace(/\bcos\b/g, "Math.cos")
    .replace(/\bpow\b/g, "Math.pow")
    .replace(/\^/g, "**");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  return new Function("vars", `with (vars) { return (${expr}); }`) as (
    v: Record<string, number>,
  ) => number;
}

function simulate(model: ModelSpec, paramOverrides: Record<string, number>): SimResult {
  const parsed = model.equations
    .map((eq) => {
      const m = eq.match(/d(\w+)\/dt\s*=\s*(.+)/);
      return m ? { name: m[1], fn: buildSafeEval(m[2]) } : null;
    })
    .filter(Boolean) as { name: string; fn: (v: Record<string, number>) => number }[];

  if (parsed.length === 0) return { t: [], series: {} };

  const params = { ...model.baseParameters, ...paramOverrides };
  const state: Record<string, number> = {};
  parsed.forEach((p) => (state[p.name] = model.initialValues[p.name] ?? 0));

  const { start, end, step } = model.timeConfig;
  const totalSteps = Math.max(1, Math.ceil((end - start) / step));
  const maxPoints = 400;
  const recordEvery = Math.max(1, Math.floor(totalSteps / maxPoints));

  const t: number[] = [start];
  const series: Record<string, number[]> = {};
  parsed.forEach((p) => (series[p.name] = [state[p.name]]));

  let time = start;
  const evalAll = (s: Record<string, number>, ti: number) => {
    const ctx = { ...params, ...s, t: ti };
    const out: Record<string, number> = {};
    for (const ode of parsed) {
      const v = ode.fn(ctx);
      out[ode.name] = Number.isFinite(v) ? v : 0;
    }
    return out;
  };

  for (let i = 0; i < totalSteps; i++) {
    const k1 = evalAll(state, time);
    const s2: Record<string, number> = {};
    for (const p of parsed) s2[p.name] = state[p.name] + 0.5 * step * k1[p.name];
    const k2 = evalAll(s2, time + 0.5 * step);
    const s3: Record<string, number> = {};
    for (const p of parsed) s3[p.name] = state[p.name] + 0.5 * step * k2[p.name];
    const k3 = evalAll(s3, time + 0.5 * step);
    const s4: Record<string, number> = {};
    for (const p of parsed) s4[p.name] = state[p.name] + step * k3[p.name];
    const k4 = evalAll(s4, time + step);

    for (const p of parsed) {
      const v =
        state[p.name] +
        (step / 6) * (k1[p.name] + 2 * k2[p.name] + 2 * k3[p.name] + k4[p.name]);
      state[p.name] = v < 0 ? 0 : v;
    }
    time = start + (i + 1) * step;

    if ((i + 1) % recordEvery === 0 || i === totalSteps - 1) {
      t.push(time);
      for (const p of parsed) series[p.name].push(state[p.name]);
    }
  }

  return { t, series };
}

// ─────────────────────────  METRIC EXTRACTION  ──────────────────────────

function aggregateTargets(sim: SimResult, targets: string[]): number[] {
  const valid = targets.filter((c) => sim.series[c]);
  if (valid.length === 0) return [];
  const len = sim.series[valid[0]].length;
  const out = new Array(len).fill(0);
  for (const c of valid) {
    const s = sim.series[c];
    for (let i = 0; i < len; i++) out[i] += s[i] ?? 0;
  }
  return out;
}

function windowIndices(t: number[], wStart?: number, wEnd?: number) {
  const lo = wStart === undefined ? 0 : Math.max(0, t.findIndex((x) => x >= wStart));
  let hi = t.length - 1;
  if (wEnd !== undefined) {
    for (let i = t.length - 1; i >= 0; i--) {
      if (t[i] <= wEnd) {
        hi = i;
        break;
      }
    }
  }
  return { lo: lo === -1 ? 0 : lo, hi };
}

function computeMetric(
  sim: SimResult,
  cfg: Pick<SensitivityConfig, "targets" | "metric" | "metricTime" | "windowStart" | "windowEnd">,
): number {
  const y = aggregateTargets(sim, cfg.targets);
  if (y.length === 0) return 0;
  const { lo, hi } = windowIndices(sim.t, cfg.windowStart, cfg.windowEnd);
  const ts = sim.t.slice(lo, hi + 1);
  const ys = y.slice(lo, hi + 1);

  switch (cfg.metric) {
    case "peak":
      return Math.max(...ys);
    case "peak_time": {
      let m = -Infinity;
      let mi = 0;
      for (let i = 0; i < ys.length; i++) if (ys[i] > m) { m = ys[i]; mi = i; }
      return ts[mi] ?? 0;
    }
    case "final":
      return ys[ys.length - 1] ?? 0;
    case "cumulative": {
      let s = 0;
      for (let i = 1; i < ys.length; i++) s += 0.5 * (ys[i] + ys[i - 1]) * (ts[i] - ts[i - 1]);
      return s;
    }
    case "incidence_at": {
      const target = cfg.metricTime ?? ts[Math.floor(ts.length / 2)];
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < ts.length; i++) {
        const d = Math.abs(ts[i] - target);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      return ys[bestIdx] ?? 0;
    }
    case "endemic": {
      const tail = Math.max(2, Math.floor(ys.length * 0.1));
      const slice = ys.slice(-tail);
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    }
    case "r0_proxy": {
      // Initial exponential growth rate of the target compartment.
      const i0 = 1;
      const i1 = Math.min(ys.length - 1, Math.max(2, Math.floor(ys.length * 0.05)));
      const a = ys[i0];
      const b = ys[i1];
      if (a <= 0 || b <= 0) return 0;
      return Math.log(b / a) / (ts[i1] - ts[i0] || 1);
    }
    default:
      return ys[ys.length - 1] ?? 0;
  }
}

// ──────────────────────────  STATISTICAL HELPERS  ────────────────────────

function rankArray(arr: number[]): number[] {
  const n = arr.length;
  const idx = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && idx[j + 1].v === idx[i].v) j++;
    const r = (i + j + 2) / 2; // average rank, 1-indexed
    for (let k = i; k <= j; k++) ranks[idx[k].i] = r;
    i = j + 1;
  }
  return ranks;
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
  const mx = sx / n, my = sy / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den > 0 ? num / den : 0;
}

/**
 * Approximate two-sided p-value for a Pearson correlation using the
 * Student-t transformation t = r·√((n−2)/(1−r²)).
 * Survival of |t| approximated via the standard-normal tail for n > 30
 * (good enough for ranking/significance flagging here).
 */
function pValueFromR(r: number, n: number): number {
  if (!Number.isFinite(r) || n < 4) return 1;
  const r2 = Math.min(0.999999, r * r);
  const t = Math.abs(r) * Math.sqrt((n - 2) / (1 - r2));
  // Normal tail (two-sided): erfc(|t|/√2)
  const z = t;
  const erfc = (x: number) => {
    // Abramowitz & Stegun approximation
    const tt = 1 / (1 + 0.3275911 * x);
    const y = 1 -
      (((((1.061405429 * tt - 1.453152027) * tt) + 1.421413741) * tt - 0.284496736) * tt + 0.254829592) * tt *
      Math.exp(-x * x);
    return 1 - y;
  };
  return Math.min(1, Math.max(0, erfc(z / Math.SQRT2)));
}

/**
 * Partial Rank Correlation Coefficient (PRCC) of column j of X against y,
 * controlling for all other columns of X. Inputs are *ranks*.
 *
 * Implementation: For each variable, regress the rank-vector on all *other*
 * rank-vectors using ordinary least squares (with intercept), and take the
 * residuals. The PRCC is the Pearson correlation of the residuals.
 */
function prccColumn(rankMatrix: number[][], rankY: number[], j: number): number {
  const n = rankY.length;
  const k = rankMatrix.length;
  // Build the "other variables" design matrix Z (n × (k))  with intercept
  const cols: number[][] = [new Array(n).fill(1)]; // intercept
  for (let c = 0; c < k; c++) if (c !== j) cols.push(rankMatrix[c]);

  // Solve OLS via normal equations (Z^T Z) β = Z^T v   for v = rankMatrix[j] and v = rankY.
  const p = cols.length;
  const ZtZ: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let a = 0; a < p; a++) {
    for (let b = a; b < p; b++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += cols[a][i] * cols[b][i];
      ZtZ[a][b] = s;
      ZtZ[b][a] = s;
    }
  }
  const solve = (rhs: number[]): number[] => {
    const A = ZtZ.map((row) => row.slice());
    const b = rhs.slice();
    // Gaussian elimination with partial pivoting
    for (let i = 0; i < p; i++) {
      let piv = i;
      for (let r = i + 1; r < p; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
      if (piv !== i) { [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]]; }
      const d = A[i][i] || 1e-12;
      for (let r = i + 1; r < p; r++) {
        const f = A[r][i] / d;
        for (let c = i; c < p; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    const x = new Array(p).fill(0);
    for (let i = p - 1; i >= 0; i--) {
      let s = b[i];
      for (let c = i + 1; c < p; c++) s -= A[i][c] * x[c];
      x[i] = s / (A[i][i] || 1e-12);
    }
    return x;
  };

  const Ztx = cols.map((c) => c.reduce((s, v, i) => s + v * rankMatrix[j][i], 0));
  const Zty = cols.map((c) => c.reduce((s, v, i) => s + v * rankY[i], 0));
  const betaX = solve(Ztx);
  const betaY = solve(Zty);

  const residX = new Array(n).fill(0);
  const residY = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let fx = 0, fy = 0;
    for (let a = 0; a < p; a++) { fx += cols[a][i] * betaX[a]; fy += cols[a][i] * betaY[a]; }
    residX[i] = rankMatrix[j][i] - fx;
    residY[i] = rankY[i] - fy;
  }
  return pearson(residX, residY);
}

// ─────────────────────  LATIN HYPERCUBE SAMPLING  ───────────────────────

function latinHypercube(params: ParamRange[], n: number): Record<string, number>[] {
  const rng = Math.random;
  const out: Record<string, number>[] = Array.from({ length: n }, () => ({}));
  for (const p of params) {
    const bins = Array.from({ length: n }, (_, i) => (i + rng()) / n);
    // Fisher-Yates shuffle
    for (let i = bins.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bins[i], bins[j]] = [bins[j], bins[i]];
    }
    const useLog = p.lower > 0 && p.upper / Math.max(p.lower, 1e-12) >= 100;
    for (let i = 0; i < n; i++) {
      const u = bins[i];
      const v = useLog
        ? Math.exp(Math.log(p.lower) + u * (Math.log(p.upper) - Math.log(p.lower)))
        : p.lower + u * (p.upper - p.lower);
      out[i][p.name] = v;
    }
  }
  return out;
}

// ──────────────────────────  ENGINE METHODS  ────────────────────────────

function runOAT(model: ModelSpec, cfg: SensitivityConfig): SensitivityResult {
  const warnings: string[] = [];
  const baselineSim = simulate(model, {});
  const Y0 = computeMetric(baselineSim, cfg);
  const pert = cfg.perturbation ?? 0.05;

  const rowsRaw: Omit<SensitivityRow, "rank">[] = [];

  for (const p of cfg.params) {
    const span = p.upper - p.lower;
    if (span <= 0) {
      warnings.push(`Skipped "${p.name}" — variation range collapses to a single value.`);
      continue;
    }
    const delta = Math.max(Math.abs(p.baseline) * pert, span * 0.01);
    const lo = Math.max(p.lower, p.baseline - delta);
    const hi = Math.min(p.upper, p.baseline + delta);
    const Ylo = computeMetric(simulate(model, { [p.name]: lo }), cfg);
    const Yhi = computeMetric(simulate(model, { [p.name]: hi }), cfg);

    // Central finite difference, normalized: (ΔY/Y0)·(p/Δp)
    const dY = (Yhi - Ylo);
    const dP = (hi - lo);
    const rawSlope = dP === 0 ? 0 : dY / dP;
    const nsi = (Y0 !== 0 && p.baseline !== 0) ? rawSlope * (p.baseline / Y0) : 0;

    const direction = nsi > 1e-6 ? "+" : nsi < -1e-6 ? "−" : "0";
    rowsRaw.push({
      parameter: p.name,
      baseline: p.baseline,
      range: [p.lower, p.upper],
      index: nsi,
      direction,
      outputDelta: Y0 !== 0 ? ((Yhi - Ylo) / Y0) * 100 : 0,
      method: cfg.method,
    });
  }

  rowsRaw.sort((a, b) => Math.abs(b.index) - Math.abs(a.index));
  const rows: SensitivityRow[] = rowsRaw.map((r, i) => ({ ...r, rank: i + 1 }));

  // Time-resolved NSI profile (only when method is NSI to avoid double-cost)
  let timeProfile: TimeProfilePoint[] | undefined;
  if (cfg.method === "nsi") {
    timeProfile = buildTimeProfile(model, cfg, baselineSim);
  }

  return {
    method: cfg.method,
    metric: cfg.metric,
    targets: cfg.targets,
    baselineOutput: Y0,
    rows,
    timeProfile,
    interpretation: buildInterpretation(rows, cfg, Y0),
    warnings,
    computedAt: Date.now(),
  };
}

function buildTimeProfile(
  model: ModelSpec,
  cfg: SensitivityConfig,
  baseSim: SimResult,
): TimeProfilePoint[] {
  const baseY = aggregateTargets(baseSim, cfg.targets);
  const t = baseSim.t;
  const sample = Math.max(1, Math.floor(t.length / 60)); // up to ~60 points
  const profile: TimeProfilePoint[] = [];
  for (let i = 0; i < t.length; i += sample) profile.push({ t: t[i], values: {} });

  const pert = cfg.perturbation ?? 0.05;
  for (const p of cfg.params) {
    if (p.upper - p.lower <= 0) continue;
    const delta = Math.max(Math.abs(p.baseline) * pert, (p.upper - p.lower) * 0.01);
    const hi = Math.min(p.upper, p.baseline + delta);
    const lo = Math.max(p.lower, p.baseline - delta);
    const yh = aggregateTargets(simulate(model, { [p.name]: hi }), cfg.targets);
    const yl = aggregateTargets(simulate(model, { [p.name]: lo }), cfg.targets);
    let k = 0;
    for (let i = 0; i < t.length; i += sample) {
      const y0 = baseY[i] || 0;
      const dY = (yh[i] - yl[i]) / (hi - lo);
      const nsi = y0 !== 0 && p.baseline !== 0 ? dY * (p.baseline / y0) : 0;
      profile[k++].values[p.name] = Number.isFinite(nsi) ? nsi : 0;
    }
  }
  return profile;
}

function runLHS_PRCC(model: ModelSpec, cfg: SensitivityConfig): SensitivityResult {
  const warnings: string[] = [];
  const validParams = cfg.params.filter((p) => p.upper > p.lower);
  for (const p of cfg.params) {
    if (p.upper <= p.lower) warnings.push(`Skipped "${p.name}" — empty variation range.`);
  }
  const N = Math.max(20, Math.min(cfg.samples ?? 200, 600));
  if ((cfg.samples ?? 200) > 600) warnings.push(`Sample count capped at 600 to keep the in-browser run responsive.`);

  const samples = latinHypercube(validParams, N);
  const outputs = new Array<number>(N);
  const samplesOut: { params: Record<string, number>; output: number }[] = new Array(N);

  for (let i = 0; i < N; i++) {
    const sim = simulate(model, samples[i]);
    outputs[i] = computeMetric(sim, cfg);
    samplesOut[i] = { params: samples[i], output: outputs[i] };
  }

  const Y0 = computeMetric(simulate(model, {}), cfg);
  const rankMatrix = validParams.map((p) => rankArray(samples.map((s) => s[p.name])));
  const rankY = rankArray(outputs);

  const rowsRaw: Omit<SensitivityRow, "rank">[] = validParams.map((p, j) => {
    const r = prccColumn(rankMatrix, rankY, j);
    return {
      parameter: p.name,
      baseline: p.baseline,
      range: [p.lower, p.upper],
      index: r,
      direction: r > 1e-3 ? "+" : r < -1e-3 ? "−" : "0",
      pValue: pValueFromR(r, N),
      method: cfg.method,
    };
  });

  rowsRaw.sort((a, b) => Math.abs(b.index) - Math.abs(a.index));
  const rows: SensitivityRow[] = rowsRaw.map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    method: cfg.method,
    metric: cfg.metric,
    targets: cfg.targets,
    baselineOutput: Y0,
    rows,
    samples: samplesOut,
    interpretation: buildInterpretation(rows, cfg, Y0),
    warnings,
    computedAt: Date.now(),
    sampleCount: N,
  };
}

/**
 * First-order & total-order Sobol indices via the Saltelli scheme.
 *  Total simulations: N · (2 + k)  — k = number of parameters.
 *  We cap N to keep this responsive in-browser.
 */
function runSobol(model: ModelSpec, cfg: SensitivityConfig): SensitivityResult {
  const warnings: string[] = [];
  const validParams = cfg.params.filter((p) => p.upper > p.lower);
  const k = validParams.length;
  if (k === 0) {
    return emptyResult(cfg, ["No parameters with non-empty variation ranges."]);
  }
  const N = Math.max(16, Math.min(cfg.samples ?? 64, 256));
  const totalSims = N * (2 + k);
  if (totalSims > 4000) warnings.push(`Sobol scheme requires ${totalSims} simulations — consider fewer parameters or samples.`);

  const A = latinHypercube(validParams, N);
  const B = latinHypercube(validParams, N);

  const evalAll = (mat: Record<string, number>[]) =>
    mat.map((row) => computeMetric(simulate(model, row), cfg));

  const yA = evalAll(A);
  const yB = evalAll(B);

  const meanY = (yA.reduce((s, v) => s + v, 0) + yB.reduce((s, v) => s + v, 0)) / (2 * N);
  const varY = (() => {
    const all = [...yA, ...yB];
    return all.reduce((s, v) => s + (v - meanY) ** 2, 0) / (all.length - 1 || 1);
  })();

  if (varY === 0) {
    warnings.push("Output variance is zero — model output insensitive to all selected parameters in this range.");
    return emptyResult(cfg, warnings);
  }

  const rowsRaw: Omit<SensitivityRow, "rank">[] = validParams.map((p, j) => {
    // C_j = A but column j taken from B
    const C: Record<string, number>[] = A.map((row, i) => ({ ...row, [p.name]: B[i][p.name] }));
    const yC = evalAll(C);
    let s1 = 0, st = 0;
    for (let i = 0; i < N; i++) {
      s1 += yB[i] * (yC[i] - yA[i]);
      st += (yA[i] - yC[i]) ** 2;
    }
    const Si = (s1 / N) / varY;
    const STi = (st / (2 * N)) / varY;
    return {
      parameter: p.name,
      baseline: p.baseline,
      range: [p.lower, p.upper],
      index: Math.max(0, Math.min(1, Si)),
      totalIndex: Math.max(0, Math.min(1, STi)),
      direction: "0",
      method: cfg.method,
    };
  });

  rowsRaw.sort((a, b) => (b.totalIndex ?? b.index) - (a.totalIndex ?? a.index));
  const rows: SensitivityRow[] = rowsRaw.map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    method: cfg.method,
    metric: cfg.metric,
    targets: cfg.targets,
    baselineOutput: meanY,
    rows,
    interpretation: buildSobolInterpretation(rows, cfg),
    warnings,
    computedAt: Date.now(),
    sampleCount: N,
  };
}

function emptyResult(cfg: SensitivityConfig, warnings: string[]): SensitivityResult {
  return {
    method: cfg.method,
    metric: cfg.metric,
    targets: cfg.targets,
    baselineOutput: 0,
    rows: [],
    interpretation: "No sensitivity could be computed.",
    warnings,
    computedAt: Date.now(),
  };
}

// ───────────────────────────  INTERPRETATION  ────────────────────────────

const METRIC_LABEL: Record<OutputMetric, string> = {
  peak: "peak prevalence",
  peak_time: "time to peak",
  final: "final value",
  cumulative: "cumulative burden",
  incidence_at: "incidence at the chosen time-point",
  endemic: "endemic equilibrium (tail mean)",
  r0_proxy: "initial growth rate (R₀ proxy)",
};

function buildInterpretation(
  rows: SensitivityRow[],
  cfg: SensitivityConfig,
  Y0: number,
): string {
  if (rows.length === 0) return "No varying parameters were available for analysis.";
  const top = rows.slice(0, 3);
  const metricLabel = METRIC_LABEL[cfg.metric];
  const targetLabel = cfg.targets.join(" + ");
  const lines = [
    `Baseline ${metricLabel} of ${targetLabel} is **${Y0.toExponential(3)}**.`,
    `Most influential parameter: **${top[0].parameter}** (index ${top[0].index.toFixed(3)}, direction ${top[0].direction === "+" ? "positive — increases the output" : top[0].direction === "−" ? "negative — decreases the output" : "negligible"}).`,
  ];
  if (top.length > 1) {
    lines.push(
      `Other high-leverage drivers: ${top.slice(1).map((r) => `${r.parameter} (${r.index.toFixed(3)})`).join(", ")}.`,
    );
  }
  if (cfg.method === "lhs") {
    const sig = rows.filter((r) => (r.pValue ?? 1) < 0.05).map((r) => r.parameter);
    if (sig.length) lines.push(`Significant PRCC at α=0.05: ${sig.join(", ")}.`);
  }
  lines.push(
    `Interpretation: parameters with the largest absolute index dominate ${metricLabel}; targeting them yields the strongest leverage on intervention design and uncertainty reduction.`,
  );
  return lines.join(" ");
}

function buildSobolInterpretation(rows: SensitivityRow[], cfg: SensitivityConfig): string {
  if (rows.length === 0) return "No Sobol indices could be computed.";
  const top = rows[0];
  const interactions = rows.filter((r) => (r.totalIndex ?? 0) - r.index > 0.1);
  const lines = [
    `Sobol analysis on ${METRIC_LABEL[cfg.metric]} of ${cfg.targets.join(" + ")}.`,
    `**${top.parameter}** dominates: first-order S₁ = ${top.index.toFixed(3)}, total-order Sᴛ = ${(top.totalIndex ?? 0).toFixed(3)}.`,
  ];
  if (interactions.length) {
    lines.push(
      `Strong interaction effects detected for: ${interactions.map((r) => r.parameter).join(", ")} (Sᴛ − S₁ > 0.1).`,
    );
  } else {
    lines.push(`Interaction effects are weak — first-order indices explain most of the output variance.`);
  }
  return lines.join(" ");
}

// ──────────────────────────────  ENTRY  ─────────────────────────────────

export function runSensitivity(model: ModelSpec, cfg: SensitivityConfig): SensitivityResult {
  if (cfg.params.length === 0) return emptyResult(cfg, ["No parameters selected."]);
  if (cfg.targets.length === 0) return emptyResult(cfg, ["No target compartments selected."]);

  switch (cfg.method) {
    case "oat":
    case "nsi":
      return runOAT(model, cfg);
    case "lhs":
      return runLHS_PRCC(model, cfg);
    case "sobol":
      return runSobol(model, cfg);
    default:
      return emptyResult(cfg, [`Unknown method: ${cfg.method}`]);
  }
}

// ──────────────────────────  COMPUTATIONAL BUDGET  ───────────────────────

export function estimateBudget(cfg: SensitivityConfig): {
  simulations: number;
  warning?: string;
} {
  const k = cfg.params.filter((p) => p.upper > p.lower).length;
  let sims = 0;
  switch (cfg.method) {
    case "oat":
      sims = 1 + k * 2;
      break;
    case "nsi":
      sims = 1 + k * 2 + k * 2; // baseline + perturb + time profile
      break;
    case "lhs":
      sims = (cfg.samples ?? 200) + 1;
      break;
    case "sobol":
      sims = (cfg.samples ?? 64) * (2 + k) + 1;
      break;
  }
  let warning: string | undefined;
  if (sims > 3000) warning = `This run will execute ~${sims} simulations and may take several seconds. Consider fewer parameters or samples.`;
  if (sims > 8000) warning = `Heavy workload (~${sims} simulations) — strongly recommend reducing parameters or samples.`;
  return { simulations: sims, warning };
}
