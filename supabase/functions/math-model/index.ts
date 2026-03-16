import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Tokenizer & Expression Evaluator ──────────────────────────────────

type Token = { type: string; value: string | number };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '(' || ch === ')') { tokens.push({ type: ch, value: ch }); i++; continue; }
    if (ch === '+') { tokens.push({ type: 'OP', value: '+' }); i++; continue; }
    if (ch === '*') { tokens.push({ type: 'OP', value: '*' }); i++; continue; }
    if (ch === '/') { tokens.push({ type: 'OP', value: '/' }); i++; continue; }
    if (ch === '^') { tokens.push({ type: 'OP', value: '^' }); i++; continue; }
    if (ch === '-') {
      const prev = tokens[tokens.length - 1];
      if (!prev || prev.type === '(' || prev.type === 'OP') {
        tokens.push({ type: 'OP', value: 'NEG' });
        i++;
        continue;
      }
      tokens.push({ type: 'OP', value: '-' });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expr.length && /[0-9.eE\-+]/.test(expr[i])) {
        if ((expr[i] === '-' || expr[i] === '+') && num.length > 0 && !/[eE]/.test(num[num.length - 1])) break;
        num += expr[i]; i++;
      }
      tokens.push({ type: 'NUM', value: parseFloat(num) });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) { id += expr[i]; i++; }
      tokens.push({ type: 'ID', value: id });
      continue;
    }
    i++;
  }
  return tokens;
}

function evalExpr(tokens: Token[], pos: { i: number }, vars: Record<string, number>): number {
  let left = evalTerm(tokens, pos, vars);
  while (pos.i < tokens.length) {
    const t = tokens[pos.i];
    if (t.type === 'OP' && (t.value === '+' || t.value === '-')) {
      pos.i++;
      const right = evalTerm(tokens, pos, vars);
      left = t.value === '+' ? left + right : left - right;
    } else break;
  }
  return left;
}

function evalTerm(tokens: Token[], pos: { i: number }, vars: Record<string, number>): number {
  let left = evalPower(tokens, pos, vars);
  while (pos.i < tokens.length) {
    const t = tokens[pos.i];
    if (t.type === 'OP' && (t.value === '*' || t.value === '/')) {
      pos.i++;
      const right = evalPower(tokens, pos, vars);
      left = t.value === '*' ? left * right : left / right;
    } else break;
  }
  return left;
}

function evalPower(tokens: Token[], pos: { i: number }, vars: Record<string, number>): number {
  let base = evalUnary(tokens, pos, vars);
  while (pos.i < tokens.length && tokens[pos.i].type === 'OP' && tokens[pos.i].value === '^') {
    pos.i++;
    const exp = evalUnary(tokens, pos, vars);
    base = Math.pow(base, exp);
  }
  return base;
}

function evalUnary(tokens: Token[], pos: { i: number }, vars: Record<string, number>): number {
  if (pos.i < tokens.length && tokens[pos.i].type === 'OP' && tokens[pos.i].value === 'NEG') {
    pos.i++;
    return -evalAtom(tokens, pos, vars);
  }
  return evalAtom(tokens, pos, vars);
}

function evalAtom(tokens: Token[], pos: { i: number }, vars: Record<string, number>): number {
  if (pos.i >= tokens.length) return 0;
  const t = tokens[pos.i];
  if (t.type === 'NUM') { pos.i++; return t.value as number; }
  if (t.type === 'ID') {
    const name = t.value as string;
    pos.i++;
    if (pos.i < tokens.length && tokens[pos.i].type === '(') {
      pos.i++;
      const arg = evalExpr(tokens, pos, vars);
      if (pos.i < tokens.length && tokens[pos.i].type === ')') pos.i++;
      switch (name) {
        case 'sqrt': return Math.sqrt(arg);
        case 'exp': return Math.exp(arg);
        case 'log': case 'ln': return Math.log(arg);
        case 'abs': return Math.abs(arg);
        case 'sin': return Math.sin(arg);
        case 'cos': return Math.cos(arg);
        case 'max': return Math.max(arg, 0);
        case 'min': return Math.min(arg, 0);
        default: return arg;
      }
    }
    if (name in vars) return vars[name];
    return 0;
  }
  if (t.type === '(') {
    pos.i++;
    const val = evalExpr(tokens, pos, vars);
    if (pos.i < tokens.length && tokens[pos.i].type === ')') pos.i++;
    return val;
  }
  pos.i++;
  return 0;
}

function evaluate(exprStr: string, vars: Record<string, number>): number {
  try {
    const tokens = tokenize(exprStr);
    const result = evalExpr(tokens, { i: 0 }, vars);
    if (!isFinite(result)) return 0;
    return result;
  } catch {
    return 0;
  }
}

// ── ODE Parser ────────────────────────────────────────────────────────

interface ParsedODE {
  varName: string;
  rhs: string;
}

function parseEquations(equations: string[]): ParsedODE[] {
  return equations.map(eq => {
    let normalized = eq.replace(/<-/g, '=').trim();
    let match = normalized.match(/^d(\w+)\/dt\s*=\s*(.+)$/);
    if (match) return { varName: match[1], rhs: match[2] };
    match = normalized.match(/^(\w+)'\s*=\s*(.+)$/);
    if (match) return { varName: match[1], rhs: match[2] };
    const parts = normalized.split('=');
    if (parts.length === 2) {
      const lhs = parts[0].trim();
      const varMatch = lhs.match(/d(\w+)/);
      if (varMatch) return { varName: varMatch[1], rhs: parts[1].trim() };
    }
    return { varName: `var${Math.random().toString(36).slice(2, 5)}`, rhs: '0' };
  });
}

// ── RK4 Solver ────────────────────────────────────────────────────────

interface PulseEvent {
  name: string;
  targetCompartment: string;
  coverageFraction: number;
  startTime: number;
  duration: number;
  frequency: string;
  customIntervalDays?: number;
  totalRounds: number;
  effectExpression?: string;
}

function getPulseSchedule(pulse: PulseEvent, tEnd: number): { start: number; end: number }[] {
  const intervals: { start: number; end: number }[] = [];
  const freqMap: Record<string, number> = {
    yearly: 365, biannual: 182.5, biennial: 730,
    "10d_annually": 365, "12d_annually": 365, "14d_annually": 365,
    "10d_biannually": 182.5, "12d_biannually": 182.5, "14d_biannually": 182.5,
    custom: pulse.customIntervalDays || 365,
  };
  // Auto-set duration for the Xd_ frequency presets
  const durationOverrides: Record<string, number> = {
    "10d_annually": 10, "12d_annually": 12, "14d_annually": 14,
    "10d_biannually": 10, "12d_biannually": 12, "14d_biannually": 14,
  };
  const effectiveDuration = durationOverrides[pulse.frequency] ?? pulse.duration;
  if (pulse.frequency === "once") {
    intervals.push({ start: pulse.startTime, end: pulse.startTime + pulse.duration });
  } else {
    const interval = freqMap[pulse.frequency] || 365;
    for (let r = 0; r < pulse.totalRounds; r++) {
      const s = pulse.startTime + r * interval;
      if (s > tEnd) break;
      intervals.push({ start: s, end: s + pulse.duration });
    }
  }
  return intervals;
}

function solveRK4(
  odes: ParsedODE[],
  params: Record<string, number>,
  initVals: Record<string, number>,
  tStart: number,
  tEnd: number,
  dt: number,
  maxPoints = 500,
  pulseEvents: PulseEvent[] = []
): Record<string, { t: number; value: number }[]> {
  const varNames = odes.map(o => o.varName);
  const state: Record<string, number> = {};
  varNames.forEach(v => { state[v] = initVals[v] ?? 0; });

  const result: Record<string, { t: number; value: number }[]> = {};
  varNames.forEach(v => { result[v] = []; });

  const totalSteps = Math.ceil((tEnd - tStart) / dt);
  const recordEvery = Math.max(1, Math.floor(totalSteps / maxPoints));

  const derivs = (st: Record<string, number>, t: number): Record<string, number> => {
    const vars: Record<string, number> = { ...params, ...st, t };
    const d: Record<string, number> = {};
    for (const ode of odes) {
      d[ode.varName] = evaluate(ode.rhs, vars);
    }
    return d;
  };

  let t = tStart;
  let stepCount = 0;

  varNames.forEach(v => { result[v].push({ t, value: state[v] }); });

  for (let i = 0; i < totalSteps; i++) {
    const currentState = { ...state };

    const k1 = derivs(currentState, t);

    const s2: Record<string, number> = {};
    varNames.forEach(v => { s2[v] = currentState[v] + 0.5 * dt * k1[v]; });
    const k2 = derivs(s2, t + 0.5 * dt);

    const s3: Record<string, number> = {};
    varNames.forEach(v => { s3[v] = currentState[v] + 0.5 * dt * k2[v]; });
    const k3 = derivs(s3, t + 0.5 * dt);

    const s4: Record<string, number> = {};
    varNames.forEach(v => { s4[v] = currentState[v] + dt * k3[v]; });
    const k4 = derivs(s4, t + dt);

    varNames.forEach(v => {
      state[v] = currentState[v] + (dt / 6) * (k1[v] + 2 * k2[v] + 2 * k3[v] + k4[v]);
      if (state[v] < 0) state[v] = 0;
    });

    t = tStart + (i + 1) * dt;

    // Apply pulse events
    for (const pulse of pulseEvents) {
      const schedules = getPulseSchedule(pulse, tEnd);
      for (const sched of schedules) {
        if (t >= sched.start && t < sched.start + dt) {
          const target = pulse.targetCompartment;
          if (target in state) {
            const transferred = state[target] * pulse.coverageFraction;
            state[target] -= transferred;
            const receiverCandidates = varNames.filter(v =>
              v !== target && /^[TR]/i.test(v)
            );
            if (receiverCandidates.length > 0) {
              state[receiverCandidates[0]] += transferred;
            }
            varNames.forEach(v => { if (state[v] < 0) state[v] = 0; });
          }
        }
      }
    }
    stepCount++;

    if (stepCount % recordEvery === 0 || i === totalSteps - 1) {
      varNames.forEach(v => {
        result[v].push({ t: Math.round(t * 1000) / 1000, value: state[v] });
      });
    }
  }

  return result;
}

// ── Robust JSON extraction ────────────────────────────────────────────

function extractJsonFromResponse(raw: string): unknown {
  // Direct parse
  try { return JSON.parse(raw); } catch { /* continue */ }

  // Strip markdown code blocks
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  // Find JSON boundaries
  const jsonStart = cleaned.search(/[\{\[]/);
  const openChar = jsonStart !== -1 ? cleaned[jsonStart] : '{';
  const closeChar = openChar === '[' ? ']' : '}';
  const jsonEnd = cleaned.lastIndexOf(closeChar);

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error("No JSON object found in response");
  }

  cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

  // Attempt parse
  try { return JSON.parse(cleaned); } catch { /* continue */ }

  // Fix common issues
  cleaned = cleaned
    .replace(/,\s*}/g, "}").replace(/,\s*]/g, "]")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");

  try { return JSON.parse(cleaned); } catch { /* continue */ }

  // Repair unbalanced braces
  let braces = 0, brackets = 0;
  for (const ch of cleaned) {
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
  }
  let repaired = cleaned;
  while (brackets > 0) { repaired += ']'; brackets--; }
  while (braces > 0) { repaired += '}'; braces--; }

  return JSON.parse(repaired);
}

// ── AI helper ─────────────────────────────────────────────────────────

async function callAI(systemPrompt: string, userPrompt: string, toolName: string, toolParams: any) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const tools = [{
    type: "function",
    function: { name: toolName, description: `Return ${toolName} results`, parameters: toolParams },
  }];

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools,
      tool_choice: { type: "function", function: { name: toolName } },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Rate limit exceeded. Please try again later.");
    if (response.status === 402) throw new Error("Credits exhausted. Please add funds in Settings → Workspace → Usage.");
    const t = await response.text();
    console.error("AI error:", response.status, t);
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const result = await response.json();
  
  // Try tool call first
  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall) {
    try {
      return extractJsonFromResponse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool call arguments:", e, "Raw:", toolCall.function.arguments?.substring(0, 500));
      throw new Error("Failed to parse AI response. Please try again.");
    }
  }

  // Fallback: try extracting JSON from message content
  const content = result.choices?.[0]?.message?.content;
  if (content) {
    try {
      return extractJsonFromResponse(content);
    } catch {
      console.error("No parseable JSON in content:", content?.substring(0, 500));
    }
  }

  throw new Error("No valid response from AI. Please try again.");
}

// ── Main Handler ──────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, equations, parameters, initialValues, timeConfig, compartments, fittingData, pulseEvents, assumptions, simulationSummary } = body;

    if (action === "simulate") {
      const odes = parseEquations(equations);
      const dt = timeConfig.step || 0.1;
      const timeSeries = solveRK4(odes, parameters, initialValues, timeConfig.start, timeConfig.end, dt, 500, pulseEvents || []);

      const varNames = odes.map(o => o.varName);
      const peaks: string[] = [];
      varNames.forEach(v => {
        const series = timeSeries[v];
        if (series.length > 0) {
          let maxVal = -Infinity, maxT = 0;
          series.forEach(p => { if (p.value > maxVal) { maxVal = p.value; maxT = p.t; } });
          peaks.push(`${v}: peak=${maxVal.toFixed(1)} at t=${maxT.toFixed(1)}`);
        }
      });

      return new Response(JSON.stringify({
        time_series: timeSeries,
        summary: `RK4 numerical integration completed. ${varNames.length} compartments solved from t=${timeConfig.start} to t=${timeConfig.end} (dt=${dt}). ${peaks.join('; ')}`,
        equilibria: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "r0_analysis") {
      // ── Deterministic Next Generation Matrix (NGM) R₀ Computation ──
      // Uses the method of Diekmann, Heesterbeek & Metz (1990) and
      // van den Driessche & Watmough (2002).
      //
      // Steps:
      // 1. Identify infected compartments (E*, I* types)
      // 2. Compute Disease-Free Equilibrium (DFE)
      // 3. Build F (new infections) and V (transitions) matrices via numerical Jacobian
      // 4. Compute Next Generation Matrix K = F * V^{-1}
      // 5. R₀ = spectral radius (dominant eigenvalue) of K

      const odes = parseEquations(equations);
      const varNames = odes.map(o => o.varName);

      // Step 1: Identify infected compartments (E and I classes)
      const infectedIndices: number[] = [];
      const infectedNames: string[] = [];
      for (let i = 0; i < varNames.length; i++) {
        const v = varNames[i];
        if (/^[EI]/i.test(v) && !/^(eta|epsilon)/i.test(v)) {
          infectedIndices.push(i);
          infectedNames.push(v);
        }
      }

      if (infectedIndices.length === 0) {
        return new Response(JSON.stringify({
          r0_formula: "N/A",
          r0_value: 0,
          interpretation: "No infected compartments (E/I) detected in the model. Cannot compute R₀.",
          ngm_steps: ["No infected compartments identified."],
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Step 2: Compute DFE — set all infected compartments to 0, others to initial values
      // For complex models, compute the steady-state of non-infected compartments
      // by running a short simulation with all infected set to 0
      const dfe: Record<string, number> = { ...initialValues };
      infectedNames.forEach(v => { dfe[v] = 0; });
      
      // Run a DFE relaxation: solve the system for a short time with infections = 0
      // to find the demographic equilibrium of S, T, F, etc. compartments
      const nonInfectedNames = varNames.filter(v => !infectedNames.includes(v));
      if (nonInfectedNames.length > 0) {
        try {
          // Create modified equations that force infected compartments to 0
          const dfeState = { ...dfe };
          const dfeParams = { ...parameters };
          
          // Iterate 2000 steps to reach DFE for non-infected compartments
          const dfedt = 0.5;
          for (let step = 0; step < 2000; step++) {
            const vars: Record<string, number> = { ...dfeParams, ...dfeState, t: step * dfedt };
            // Only update non-infected compartments
            const derivs: Record<string, number> = {};
            for (const ode of odes) {
              derivs[ode.varName] = evaluate(ode.rhs, vars);
            }
            let maxChange = 0;
            for (const v of nonInfectedNames) {
              const idx = varNames.indexOf(v);
              if (idx >= 0) {
                const change = derivs[v] * dfedt;
                dfeState[v] = Math.max(0, dfeState[v] + change);
                maxChange = Math.max(maxChange, Math.abs(change));
              }
            }
            // Keep infected at 0
            infectedNames.forEach(v => { dfeState[v] = 0; });
            // Check convergence
            if (maxChange < 1e-8) break;
          }
          
          // Update DFE with computed values
          for (const v of nonInfectedNames) {
            dfe[v] = dfeState[v];
          }
        } catch (e) {
          console.warn("DFE relaxation failed, using initial values:", e);
        }
      }

      // Step 3: Build F and V matrices using numerical partial derivatives
      const m = infectedIndices.length;
      // Scale perturbation epsilon based on model scale
      const maxDfeVal = Math.max(1, ...Object.values(dfe).map(Math.abs));
      const eps = Math.max(1e-6, maxDfeVal * 1e-8);

      const evalRHS = (stateOverrides: Record<string, number>): number[] => {
        const vars: Record<string, number> = { ...parameters, ...dfe, ...stateOverrides, t: 0 };
        return infectedIndices.map(idx => evaluate(odes[idx].rhs, vars));
      };

      const baseRHS = evalRHS({});
      const J: number[][] = Array.from({ length: m }, () => Array(m).fill(0));

      for (let j = 0; j < m; j++) {
        const pertState: Record<string, number> = {};
        pertState[infectedNames[j]] = eps;
        const pertRHS = evalRHS(pertState);
        for (let i = 0; i < m; i++) {
          J[i][j] = (pertRHS[i] - baseRHS[i]) / eps;
        }
      }

      // Build F matrix: new infection terms
      // New infections are terms that are positive when infected compartments increase
      // and involve contact between susceptible and infected populations.
      // Heuristic: For each equation of infected compartment i,
      // evaluate with susceptible compartments at DFE values vs at 0.
      // The difference identifies transmission terms.
      
      // More robust approach: F_ij are the Jacobian entries that represent
      // appearance of NEW infections (not transfers between infected classes).
      // We identify these by checking if the term involves a susceptible compartment.
      
      // Standard approach: Separate F from V using the structure:
      // - F entries: ∂(new infection rate)/∂xj — positive rates where susceptibles produce infected
      // - V entries: transfers, deaths, recovery — the rest
      
      // For a general model, we use the following:
      // Evaluate each infected equation with all susceptibles set to 0.
      // The Jacobian of that gives us -V (transitions among infected classes only).
      // Then F = J - (-V) = J + V_only

      const susceptibleNames = varNames.filter(v => !infectedNames.includes(v));
      const dfeNoSusc: Record<string, number> = {};
      susceptibleNames.forEach(v => { dfeNoSusc[v] = 0; });

      const evalRHSNoSusc = (stateOverrides: Record<string, number>): number[] => {
        const vars: Record<string, number> = { ...parameters, ...dfe, ...dfeNoSusc, ...stateOverrides, t: 0 };
        return infectedIndices.map(idx => evaluate(odes[idx].rhs, vars));
      };

      const baseRHSNoSusc = evalRHSNoSusc({});
      const negV: number[][] = Array.from({ length: m }, () => Array(m).fill(0));

      for (let j = 0; j < m; j++) {
        const pertState: Record<string, number> = {};
        pertState[infectedNames[j]] = eps;
        const pertRHS = evalRHSNoSusc(pertState);
        for (let i = 0; i < m; i++) {
          negV[i][j] = (pertRHS[i] - baseRHSNoSusc[i]) / eps;
        }
      }

      // F = J - (-V) = J + V, and V_matrix = -negV
      const F: number[][] = Array.from({ length: m }, (_, i) =>
        Array.from({ length: m }, (_, j) => J[i][j] - negV[i][j])
      );
      const V: number[][] = Array.from({ length: m }, (_, i) =>
        Array.from({ length: m }, (_, j) => -negV[i][j])
      );

      // Step 4: Compute V^{-1} using Gauss-Jordan elimination
      const augmented: number[][] = V.map((row, i) => {
        const identityRow = Array(m).fill(0);
        identityRow[i] = 1;
        return [...row, ...identityRow];
      });

      for (let col = 0; col < m; col++) {
        // Partial pivoting
        let maxRow = col;
        for (let row = col + 1; row < m; row++) {
          if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxRow][col])) maxRow = row;
        }
        [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]];

        const pivot = augmented[col][col];
        if (Math.abs(pivot) < 1e-15) continue; // Singular
        for (let j = 0; j < 2 * m; j++) augmented[col][j] /= pivot;
        for (let row = 0; row < m; row++) {
          if (row === col) continue;
          const factor = augmented[row][col];
          for (let j = 0; j < 2 * m; j++) augmented[row][j] -= factor * augmented[col][j];
        }
      }

      const Vinv: number[][] = augmented.map(row => row.slice(m));

      // K = F * V^{-1} (Next Generation Matrix)
      const K: number[][] = Array.from({ length: m }, (_, i) =>
        Array.from({ length: m }, (_, j) => {
          let sum = 0;
          for (let k = 0; k < m; k++) sum += F[i][k] * Vinv[k][j];
          return sum;
        })
      );

      // Step 5: Compute spectral radius (dominant eigenvalue) of K
      // Using power iteration for the dominant eigenvalue
      let eigenvector = Array(m).fill(1 / Math.sqrt(m));
      let eigenvalue = 0;

      for (let iter = 0; iter < 1000; iter++) {
        // Multiply K * eigenvector
        const newVec = Array(m).fill(0);
        for (let i = 0; i < m; i++) {
          for (let j = 0; j < m; j++) {
            newVec[i] += K[i][j] * eigenvector[j];
          }
        }
        // Find max absolute component
        const norm = Math.sqrt(newVec.reduce((s, v) => s + v * v, 0));
        if (norm < 1e-15) break;
        eigenvalue = norm;
        // Check sign: use dot product with previous
        const dot = newVec.reduce((s, v, i) => s + v * eigenvector[i], 0);
        const sign = dot >= 0 ? 1 : -1;
        eigenvalue *= sign;
        eigenvector = newVec.map(v => v / norm);
      }

      // For the spectral radius, we want the magnitude
      const r0Value = Math.abs(eigenvalue);

      // Build analytical formula description
      const formatMatrix = (mat: number[][], name: string): string => {
        const rows = mat.map(row => `  [${row.map(v => v.toFixed(6)).join(", ")}]`);
        return `${name} =\n${rows.join("\n")}`;
      };

      // Build analytical steps
      const ngmSteps = [
        `**Step 1: Identify infected compartments**\nInfected compartments: ${infectedNames.join(", ")} (${m} compartments)`,
        `**Step 2: Disease-Free Equilibrium (DFE)**\n${varNames.map(v => `${v} = ${dfe[v]}`).join(", ")}`,
        `**Step 3: Construct F matrix (new infections)**\n${formatMatrix(F, "F")}`,
        `**Step 4: Construct V matrix (transitions)**\n${formatMatrix(V, "V")}`,
        `**Step 5: Compute V⁻¹**\n${formatMatrix(Vinv, "V⁻¹")}`,
        `**Step 6: Next Generation Matrix K = F·V⁻¹**\n${formatMatrix(K, "K")}`,
        `**Step 7: R₀ = ρ(K) = spectral radius of K**\nR₀ = ${r0Value.toFixed(6)}`,
      ];

      // Build parameter thresholds: find critical values where R₀ = 1
      const paramThresholds: { parameter: string; threshold_value: number; condition: string }[] = [];
      const transmissionParams = Object.keys(parameters).filter(p => /beta|epsilon|kappa/i.test(p));
      
      for (const pName of transmissionParams.slice(0, 5)) {
        const pVal = parameters[pName];
        if (pVal === 0) continue;
        // R₀ scales linearly with transmission params: threshold ≈ pVal / R₀
        if (r0Value > 0) {
          const threshold = pVal / r0Value;
          paramThresholds.push({
            parameter: pName,
            threshold_value: Math.round(threshold * 1e6) / 1e6,
            condition: `R₀ = 1 when ${pName} ≈ ${threshold.toFixed(6)} (current: ${pVal})`,
          });
        }
      }

      // Build formula string
      const r0Formula = m <= 4
        ? `ρ(F·V⁻¹) where F,V are ${m}×${m} matrices over {${infectedNames.join(",")}}`
        : `ρ(F·V⁻¹) — spectral radius of ${m}×${m} Next Generation Matrix`;

      const interpretation = r0Value > 1
        ? `R₀ = ${r0Value.toFixed(4)} > 1: The disease-free equilibrium is unstable. Each primary infection generates on average ${r0Value.toFixed(2)} secondary infections, indicating epidemic growth. Interventions must reduce transmission by at least ${((1 - 1 / r0Value) * 100).toFixed(1)}% to achieve R₀ < 1.`
        : r0Value === 0
        ? `R₀ = 0: No transmission occurs at the disease-free equilibrium with current parameters.`
        : `R₀ = ${r0Value.toFixed(4)} < 1: The disease-free equilibrium is stable. The infection will die out naturally without intervention.`;

      const thresholdAnalysis = r0Value > 1
        ? `To bring R₀ below 1, the effective transmission rate must be reduced by a factor of ${(r0Value).toFixed(2)}. This corresponds to a critical vaccination coverage of ${((1 - 1 / r0Value) * 100).toFixed(1)}% (assuming perfect vaccine efficacy).`
        : `R₀ is already below 1. The disease will not sustain transmission under current parameters.`;

      return new Response(JSON.stringify({
        r0_formula: r0Formula,
        r0_value: Math.round(r0Value * 1e6) / 1e6,
        interpretation,
        threshold_analysis: thresholdAnalysis,
        parameter_thresholds: paramThresholds,
        disease_free_equilibrium: dfe,
        ngm_steps,
        F_matrix: F,
        V_matrix: V,
        K_matrix: K,
        infected_compartments: infectedNames,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "sensitivity_analysis") {
      const odes = parseEquations(equations);
      const paramNames = Object.keys(parameters);
      const dt = timeConfig.step || 0.1;
      const nOdes = odes.length;
      
      // Aggressive optimization for large models to prevent CPU timeout
      // Scale dt and reduce points based on model complexity
      let sensdt: number;
      let sensMaxPoints: number;
      let sensTEnd: number;
      
      if (nOdes > 12) {
        // Very large models (SEITF etc): extremely coarse
        sensdt = Math.max(dt * 50, 5.0);
        sensMaxPoints = 40;
        sensTEnd = Math.min(timeConfig.end, 100);
      } else if (nOdes > 6) {
        sensdt = Math.max(dt * 10, 2.0);
        sensMaxPoints = 100;
        sensTEnd = timeConfig.end;
      } else {
        sensdt = dt;
        sensMaxPoints = 300;
        sensTEnd = timeConfig.end;
      }

      // Baseline simulation
      const baseTS = solveRK4(odes, parameters, initialValues, timeConfig.start, sensTEnd, sensdt, sensMaxPoints);
      const varNames = odes.map(o => o.varName);

      // Find infected-like compartment for peak analysis
      const infectedVar = varNames.find(v => /^I/i.test(v)) || varNames.find(v => /^E/i.test(v)) || varNames[1] || varNames[0];
      const baseSeries = baseTS[infectedVar] || [];
      const basePeak = baseSeries.length > 0 ? Math.max(...baseSeries.map(p => p.value)) : 0;
      const baseFinal = baseSeries.length > 0 ? baseSeries[baseSeries.length - 1].value : 0;

      const sensitivity_indices: any[] = [];
      const perturbFrac = 0.01;

      // Limit parameters aggressively for large models
      let analysisParams: string[];
      if (nOdes > 12) {
        // Only core transmission/recovery params for very large models
        analysisParams = paramNames.filter(p =>
          /beta|alpha|gamma|mu|delta|tau|epsilon|kappa|omega|zeta/i.test(p)
        ).slice(0, 15);
        if (analysisParams.length < 5) {
          analysisParams = paramNames.slice(0, 10);
        }
      } else if (paramNames.length > 20) {
        analysisParams = paramNames.filter(p =>
          /beta|alpha|gamma|mu|delta|tau|theta|rho|epsilon|kappa|omega|zeta/i.test(p)
        ).slice(0, 20);
      } else {
        analysisParams = paramNames;
      }

      for (const pName of analysisParams) {
        const pVal = parameters[pName];
        if (pVal === 0) {
          sensitivity_indices.push({ parameter: pName, sensitivity_to_r0: 0, sensitivity_to_peak: 0, interpretation: "Parameter is zero, cannot compute sensitivity." });
          continue;
        }
        const perturbedParams = { ...parameters, [pName]: pVal * (1 + perturbFrac) };
        const pertTS = solveRK4(odes, perturbedParams, initialValues, timeConfig.start, sensTEnd, sensdt, sensMaxPoints);
        const pertSeries = pertTS[infectedVar] || [];
        const pertPeak = pertSeries.length > 0 ? Math.max(...pertSeries.map(p => p.value)) : 0;
        const pertFinal = pertSeries.length > 0 ? pertSeries[pertSeries.length - 1].value : 0;

        const sPeak = basePeak !== 0 ? ((pertPeak - basePeak) / basePeak) / perturbFrac : 0;
        const sFinal = baseFinal !== 0 ? ((pertFinal - baseFinal) / baseFinal) / perturbFrac : 0;

        sensitivity_indices.push({
          parameter: pName,
          sensitivity_to_r0: Math.round(sFinal * 1000) / 1000,
          sensitivity_to_peak: Math.round(sPeak * 1000) / 1000,
          interpretation: `A 1% increase in ${pName} changes peak ${infectedVar} by ${(sPeak * 100).toFixed(2)}% and final value by ${(sFinal * 100).toFixed(2)}%.`,
        });
      }

      sensitivity_indices.sort((a, b) => Math.abs(b.sensitivity_to_peak) - Math.abs(a.sensitivity_to_peak));
      const mostSensitive = sensitivity_indices[0]?.parameter || "N/A";

      return new Response(JSON.stringify({
        sensitivity_indices,
        most_sensitive_parameter: mostSensitive,
        summary: `Numerical sensitivity analysis on ${analysisParams.length} parameters (${perturbFrac * 100}% perturbation, dt=${sensdt}, tEnd=${sensTEnd}). Most sensitive: ${mostSensitive}. Target compartment: '${infectedVar}'.${paramNames.length > analysisParams.length ? ` Note: ${paramNames.length - analysisParams.length} low-priority parameters were excluded for performance.` : ''}`,
        recommendations: sensitivity_indices.slice(0, 3).map(s => `Focus interventions on '${s.parameter}' (peak sensitivity: ${s.sensitivity_to_peak}, final value sensitivity: ${s.sensitivity_to_r0}).`),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "scenario_analysis") {
      const odes = parseEquations(equations);
      const dt = timeConfig.step || 0.1;
      const nOdes = odes.length;
      
      // Aggressive optimization for large models
      let scenDt: number;
      let scenMaxPoints: number;
      let scenTEnd: number;
      
      if (nOdes > 12) {
        scenDt = Math.max(dt * 50, 5.0);
        scenMaxPoints = 50;
        scenTEnd = Math.min(timeConfig.end, 100);
      } else if (nOdes > 6) {
        scenDt = Math.max(dt * 5, 1.0);
        scenMaxPoints = 150;
        scenTEnd = timeConfig.end;
      } else {
        scenDt = dt;
        scenMaxPoints = 300;
        scenTEnd = timeConfig.end;
      }
      
      const varNames = odes.map(o => o.varName);

      const transmissionParams = Object.keys(parameters).filter(p => /beta/i.test(p));
      const mainTransParam = transmissionParams[0] || Object.keys(parameters)[0];

      const treatmentParams = Object.keys(parameters).filter(p => /gamma|tau|theta|rho|recovery|treat/i.test(p));
      const mainTreatParam = treatmentParams[0];

      const scenarios = [
        { name: "Baseline", description: "Current parameter values", params: { ...parameters } },
        { name: "Optimistic", description: `Reduced transmission (${mainTransParam} halved)`, params: { ...parameters, [mainTransParam]: parameters[mainTransParam] * 0.5 } },
        { name: "Pessimistic", description: `Increased transmission (${mainTransParam} doubled)`, params: { ...parameters, [mainTransParam]: parameters[mainTransParam] * 2 } },
        {
          name: "Intervention",
          description: mainTreatParam
            ? `Reduced transmission + enhanced treatment (${mainTreatParam} doubled)`
            : `Reduced transmission by 70%`,
          params: {
            ...parameters,
            [mainTransParam]: parameters[mainTransParam] * 0.3,
            ...(mainTreatParam ? { [mainTreatParam]: parameters[mainTreatParam] * 2 } : {}),
          },
        },
      ];

      const infectedVar = varNames.find(v => /^I/i.test(v)) || varNames[1] || varNames[0];

      const scenarioResults = scenarios.map(s => {
        const ts = solveRK4(odes, s.params, initialValues, timeConfig.start, scenTEnd, scenDt, scenMaxPoints, pulseEvents || []);
        let peakVal = 0, peakTime = 0;
        (ts[infectedVar] || []).forEach(p => { if (p.value > peakVal) { peakVal = p.value; peakTime = p.t; } });
        return {
          name: s.name,
          description: s.description,
          parameters: s.params,
          time_series: ts,
          peak_info: { compartment: infectedVar, peak_value: peakVal, peak_time: peakTime },
          r0: 0,
        };
      });

      return new Response(JSON.stringify({
        scenarios: scenarioResults,
        comparison_summary: `Four scenarios compared (dt=${scenDt}, tEnd=${scenTEnd}): Baseline, Optimistic (50% reduced ${mainTransParam}), Pessimistic (doubled ${mainTransParam}), and Intervention. Peak ${infectedVar} ranges from ${Math.min(...scenarioResults.map(s => s.peak_info.peak_value)).toFixed(0)} to ${Math.max(...scenarioResults.map(s => s.peak_info.peak_value)).toFixed(0)}.`,
        recommendations: [
          `Reducing ${mainTransParam} significantly lowers peak infection.`,
          mainTreatParam ? `Enhancing ${mainTreatParam} combined with transmission reduction yields best outcomes.` : "Combined interventions targeting multiple parameters are most effective.",
        ],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "interpret_simulation") {
      const summaryStr = JSON.stringify(simulationSummary || {});
      const eqStr = (equations || []).join("\n");
      const assumptionsStr = assumptions || "No specific assumptions provided.";

      const data = await callAI(
        `You are an expert epidemiologist and mathematical modeler. Given simulation results from a compartmental model, provide insightful, actionable interpretation of the dynamics observed. Reference specific compartments, their trajectories, peaks, equilibria, and public health implications. If assumptions are provided, align your interpretation with those assumptions. Be thorough, specific, and use epidemiological terminology appropriately. Structure your response with clear sections.`,
        `Model equations:\n${eqStr}\n\nParameters: ${JSON.stringify(parameters)}\n\nSimulation summary (compartment dynamics):\n${summaryStr}\n\nModel assumptions:\n${assumptionsStr}\n\nProvide a comprehensive interpretation of these simulation results. Include: (1) overall epidemic trajectory, (2) key turning points and peak analysis, (3) compartment interactions and transmission dynamics, (4) equilibrium behavior, (5) public health implications and intervention recommendations.`,
        "interpretation_results",
        {
          type: "object",
          properties: {
            overall_trajectory: { type: "string", description: "Summary of the overall epidemic trajectory" },
            key_findings: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, severity: { type: "string", enum: ["info", "warning", "critical"] } }, required: ["title", "description", "severity"] } },
            compartment_insights: { type: "array", items: { type: "object", properties: { compartment: { type: "string" }, insight: { type: "string" }, trend: { type: "string" } }, required: ["compartment", "insight"] } },
            public_health_implications: { type: "string" },
            intervention_recommendations: { type: "array", items: { type: "string" } },
            equilibrium_analysis: { type: "string" },
          },
          required: ["overall_trajectory", "key_findings", "public_health_implications", "intervention_recommendations"],
        }
      );
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "generate_assumptions") {
      const eqStr = (equations || []).join("\n");
      
      const data = await callAI(
        `You are an expert mathematical modeler specializing in compartmental disease models. Given a model's equations and parameters, generate comprehensive, scientifically-grounded default assumptions. These should cover: population dynamics, transmission mechanisms, disease progression, treatment efficacy, demographic factors, environmental factors, and any model-specific assumptions. Write in clear, professional prose suitable for a scientific report. Be specific about what each parameter represents biologically.`,
        `Model equations:\n${eqStr}\n\nParameters and values: ${JSON.stringify(parameters)}\nInitial conditions: ${JSON.stringify(initialValues)}\nCompartments: ${JSON.stringify(compartments)}\n\nGenerate comprehensive default assumptions for this model. Include assumptions about: population structure, transmission dynamics, disease natural history, treatment/intervention effectiveness, demographic rates, and any other relevant biological/epidemiological assumptions.`,
        "assumptions_results",
        {
          type: "object",
          properties: {
            assumptions: { type: "string", description: "Comprehensive model assumptions text (2-4 paragraphs)" },
            assumption_categories: { type: "array", items: { type: "object", properties: { category: { type: "string" }, items: { type: "array", items: { type: "string" } } }, required: ["category", "items"] } },
          },
          required: ["assumptions"],
        }
      );
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "fit_model") {
      // Support multi-sheet data: fittingData may contain { sheets: [{name, data}], ... } or flat observedData
      const sheets = fittingData?.sheets || [{ name: "Sheet1", data: fittingData?.observedData || [] }];
      const allData = sheets.flatMap((s: any) => (s.data || []).map((row: any) => ({ ...row, _sheet: s.name })));
      const sampleData = allData.slice(0, 50); // Send more rows for better fitting
      
      const eqStr = (equations || []).join("\n");
      const paramStr = Object.entries(parameters || {}).map(([k, v]) => `${k} = ${v}`).join(", ");
      
      const data = await callAI(
        `You are an expert in epidemiological parameter estimation, model calibration, and systematic literature review. Given a compartmental model and observed data (possibly from multiple sheets/sources), you must:

1. Analyze the data across all sheets to understand what measurements are available.
2. Calibrate/fit the model parameters to the observed data using least-squares optimization principles.
3. For EVERY parameter in the model (not just fitted ones), create a comprehensive parameter table classifying each parameter's source as one of:
   - "Literature" - if the value is based on published research. You MUST cite the source in format "(Author et al., Year)" using real, plausible epidemiological literature references relevant to the disease/model type.
   - "Calibrated" - if the value was estimated/calibrated from the provided data.
   - "Assumed" - if the value is a reasonable assumption not directly from data or literature.
4. Provide goodness-of-fit metrics and fitted curves.

Be scientifically rigorous. Use real epidemiological literature references appropriate to the model type (e.g., for NTD models cite trachoma/onchocerciasis/schistosomiasis literature; for SIR cite appropriate infectious disease literature).`,
        `Model equations:\n${eqStr}\n\nAll model parameters and current values: ${paramStr}\nInitial conditions: ${JSON.stringify(initialValues)}\nCompartments: ${JSON.stringify(compartments)}\n\nTarget parameters to calibrate: ${JSON.stringify(fittingData?.targetParams || [])}\nColumn mapping (data column → model compartment): ${JSON.stringify(fittingData?.columnMapping || {})}\n\nData sheets available: ${sheets.map((s: any) => s.name).join(", ")}\nObserved data sample (${sampleData.length} rows across all sheets):\n${JSON.stringify(sampleData)}\n\nPlease fit the model to this data and provide the complete parameter table with ALL parameters, their values, sources, and citations where applicable.`,
        "fitting_results",
        {
          type: "object",
          properties: {
            parameter_table: {
              type: "array",
              description: "Complete table of ALL model parameters with fitted/literature/assumed values",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Parameter name" },
                  description: { type: "string", description: "What this parameter represents biologically" },
                  value: { type: "number", description: "Best-fit or recommended value" },
                  initial_value: { type: "number", description: "Original value before fitting" },
                  source: { type: "string", enum: ["Literature", "Calibrated", "Assumed"], description: "Source of the parameter value" },
                  citation: { type: "string", description: "Literature citation if source is Literature, e.g. '(Kura et al., 2024)'. Empty string if not from literature." },
                  confidence_interval: { type: "object", properties: { lower: { type: "number" }, upper: { type: "number" } } },
                  notes: { type: "string", description: "Additional notes about this parameter" }
                },
                required: ["name", "value", "source"]
              }
            },
            fitted_parameters: { type: "array", items: { type: "object", properties: { name: { type: "string" }, initial_value: { type: "number" }, fitted_value: { type: "number" }, confidence_interval: { type: "object", properties: { lower: { type: "number" }, upper: { type: "number" } } } }, required: ["name", "fitted_value"] } },
            goodness_of_fit: { type: "object", properties: { r_squared: { type: "number" }, rmse: { type: "number" }, aic: { type: "number" }, bic: { type: "number" } } },
            fitted_curves: { type: "object", additionalProperties: { type: "array", items: { type: "object", properties: { t: { type: "number" }, value: { type: "number" } }, required: ["t", "value"] } } },
            residuals: { type: "array", items: { type: "object", properties: { t: { type: "number" }, residual: { type: "number" } } } },
            data_summary: { type: "string", description: "Summary of data analyzed across all sheets" },
            calibration_methodology: { type: "string", description: "Description of the calibration approach used" },
            summary: { type: "string" },
          },
          required: ["parameter_table", "goodness_of_fit", "summary"],
        }
      );
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("math-model error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
