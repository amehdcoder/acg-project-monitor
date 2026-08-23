/**
 * Amehnities AI — in-browser Transformer language model over app activity.
 *
 * A complete decoder-only Transformer (pre-LayerNorm, multi-head causal
 * self-attention, GELU feed-forward, learned token + positional embeddings,
 * Adam optimiser) implemented in plain typed arrays and trained INSIDE a Web
 * Worker so the UI thread never blocks. The model consumes the live token
 * stream produced from Amehnities app data/activity and learns to predict the
 * next event token, continuously, in real time.
 *
 * Protocol
 *   → { type: "init",   cfg }                 build / rebuild the model
 *   → { type: "tokens", tokens, vocabSize }   append streamed activity tokens
 *   → { type: "run",    running }             start/pause the training loop
 *   → { type: "grow" }                        scale capacity up (more params)
 *   → { type: "budget", ms }                  compute budget per animation tick
 *   → { type: "config", patch }               live hyper-parameter update (safe restart)
 *   → { type: "restart", fresh }              reset optimiser / re-initialise weights
 *   → { type: "checkpoint" }                  export weights + optimiser + training state
 *   → { type: "load", ckpt }                  restore a previously exported checkpoint
 *   ← { type: "telemetry", ... }              metrics + attention + activations
 */

type Cfg = {
  dModel: number;
  nHeads: number;
  nLayers: number;
  dFF: number;
  ctx: number;
  vocab: number;
  lr: number;
  batch: number;
};

const DEFAULT_CFG: Cfg = { dModel: 64, nHeads: 4, nLayers: 4, dFF: 256, ctx: 32, vocab: 256, lr: 3e-3, batch: 1 };

const CHECKPOINT_VERSION = 1;

/* ------------------------------------------------------------------ utils */

let seed = 1337;
const rand = () => {
  // xorshift32 — deterministic, fast
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return ((seed >>> 0) / 4294967296);
};
const randn = () => {
  const u = Math.max(rand(), 1e-7), v = Math.max(rand(), 1e-7);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

class Tensor {
  v: Float32Array; g: Float32Array; m: Float32Array; s: Float32Array;
  constructor(public size: number, scale = 0) {
    this.v = new Float32Array(size);
    this.g = new Float32Array(size);
    this.m = new Float32Array(size);
    this.s = new Float32Array(size);
    if (scale > 0) for (let i = 0; i < size; i++) this.v[i] = randn() * scale;
  }
}

/** C[M x N] = A[M x K] @ B[K x N] (+bias broadcast over rows) */
function matmul(A: Float32Array, B: Float32Array, M: number, K: number, N: number, out: Float32Array, bias?: Float32Array) {
  for (let m = 0; m < M; m++) {
    const ao = m * K, co = m * N;
    if (bias) out.set(bias, co); else out.fill(0, co, co + N);
    for (let k = 0; k < K; k++) {
      const a = A[ao + k];
      if (a === 0) continue;
      const bo = k * N;
      for (let n = 0; n < N; n++) out[co + n] += a * B[bo + n];
    }
  }
}

/** dA[M x K] += dC[M x N] @ B^T ; dB[K x N] += A^T @ dC ; dBias += colsum(dC) */
function matmulBackward(
  A: Float32Array, B: Float32Array, dC: Float32Array,
  M: number, K: number, N: number,
  dA: Float32Array | null, dB: Float32Array | null, dBias?: Float32Array,
) {
  for (let m = 0; m < M; m++) {
    const ao = m * K, co = m * N;
    if (dBias) for (let n = 0; n < N; n++) dBias[n] += dC[co + n];
    for (let k = 0; k < K; k++) {
      const bo = k * N;
      const a = A[ao + k];
      let acc = 0;
      if (dB && a !== 0) {
        for (let n = 0; n < N; n++) { const d = dC[co + n]; acc += d * B[bo + n]; dB[bo + n] += a * d; }
      } else {
        for (let n = 0; n < N; n++) acc += dC[co + n] * B[bo + n];
      }
      if (dA) dA[ao + k] += acc;
    }
  }
}

const GELU_C = Math.sqrt(2 / Math.PI);
const gelu = (x: number) => 0.5 * x * (1 + Math.tanh(GELU_C * (x + 0.044715 * x * x * x)));
const geluGrad = (x: number) => {
  const t = Math.tanh(GELU_C * (x + 0.044715 * x * x * x));
  return 0.5 * (1 + t) + 0.5 * x * (1 - t * t) * GELU_C * (1 + 3 * 0.044715 * x * x);
};

/* ------------------------------------------------------------------ model */

type Layer = {
  g1: Tensor; b1: Tensor;
  Wq: Tensor; bq: Tensor; Wk: Tensor; bk: Tensor; Wv: Tensor; bv: Tensor; Wo: Tensor; bo: Tensor;
  g2: Tensor; b2: Tensor;
  W1: Tensor; bf1: Tensor; W2: Tensor; bf2: Tensor;
};

type Cache = {
  x: Float32Array; ln1: Float32Array; mu1: Float32Array; iv1: Float32Array;
  q: Float32Array; k: Float32Array; v: Float32Array; att: Float32Array; ctxv: Float32Array;
  x1: Float32Array; ln2: Float32Array; mu2: Float32Array; iv2: Float32Array;
  pre: Float32Array; act: Float32Array; x2: Float32Array;
};

class Transformer {
  cfg: Cfg;
  emb!: Tensor; pos!: Tensor; gF!: Tensor; bF!: Tensor; head!: Tensor; headB!: Tensor;
  layers: Layer[] = [];
  params: Tensor[] = [];
  step = 0;

  constructor(cfg: Cfg, prev?: Transformer) {
    this.cfg = cfg;
    const { dModel: D, dFF, ctx, vocab, nLayers } = cfg;
    const sc = 0.02;
    this.emb = new Tensor(vocab * D, sc);
    this.pos = new Tensor(ctx * D, sc);
    this.gF = new Tensor(D); this.gF.v.fill(1);
    this.bF = new Tensor(D);
    this.head = new Tensor(D * vocab, sc);
    this.headB = new Tensor(vocab);
    for (let l = 0; l < nLayers; l++) {
      const L: Layer = {
        g1: new Tensor(D), b1: new Tensor(D),
        Wq: new Tensor(D * D, sc), bq: new Tensor(D),
        Wk: new Tensor(D * D, sc), bk: new Tensor(D),
        Wv: new Tensor(D * D, sc), bv: new Tensor(D),
        Wo: new Tensor(D * D, sc / Math.sqrt(2 * nLayers)), bo: new Tensor(D),
        g2: new Tensor(D), b2: new Tensor(D),
        W1: new Tensor(D * dFF, sc), bf1: new Tensor(dFF),
        W2: new Tensor(dFF * D, sc / Math.sqrt(2 * nLayers)), bf2: new Tensor(D),
      };
      L.g1.v.fill(1); L.g2.v.fill(1);
      this.layers.push(L);
    }
    this.params = [this.emb, this.pos, this.gF, this.bF, this.head, this.headB];
    for (const L of this.layers) this.params.push(...Object.values(L) as Tensor[]);

    // Warm-start from the previous (smaller) model wherever shapes still line up
    // so scaling capacity up never throws away what the network already learned.
    if (prev) {
      const mine = this.params, theirs = prev.params;
      for (let i = 0; i < Math.min(mine.length, theirs.length); i++) {
        if (mine[i].size === theirs[i].size) {
          mine[i].v.set(theirs[i].v); mine[i].m.set(theirs[i].m); mine[i].s.set(theirs[i].s);
        }
      }
      this.step = prev.step;
    }
  }

  get paramCount() { return this.params.reduce((a, t) => a + t.size, 0); }

  zeroGrad() { for (const p of this.params) p.g.fill(0); }

  /** Forward pass over one sequence of token ids. Returns loss + caches. */
  forward(tokens: Int32Array, targets: Int32Array) {
    const { dModel: D, nHeads: H, dFF, nLayers } = this.cfg;
    const T = tokens.length, hd = D / H, scale = 1 / Math.sqrt(hd);
    const caches: Cache[] = [];

    let x = new Float32Array(T * D);
    for (let t = 0; t < T; t++) {
      const eo = tokens[t] * D, po = t * D, xo = t * D;
      for (let d = 0; d < D; d++) x[xo + d] = this.emb.v[eo + d] + this.pos.v[po + d];
    }

    for (let l = 0; l < nLayers; l++) {
      const L = this.layers[l];
      const ln1 = new Float32Array(T * D), mu1 = new Float32Array(T), iv1 = new Float32Array(T);
      layerNorm(x, L.g1.v, L.b1.v, T, D, ln1, mu1, iv1);
      const q = new Float32Array(T * D), k = new Float32Array(T * D), v = new Float32Array(T * D);
      matmul(ln1, L.Wq.v, T, D, D, q, L.bq.v);
      matmul(ln1, L.Wk.v, T, D, D, k, L.bk.v);
      matmul(ln1, L.Wv.v, T, D, D, v, L.bv.v);

      const att = new Float32Array(H * T * T);
      const ctxv = new Float32Array(T * D);
      for (let h = 0; h < H; h++) {
        const off = h * hd, ab = h * T * T;
        for (let i = 0; i < T; i++) {
          let max = -Infinity;
          const row = ab + i * T;
          for (let j = 0; j <= i; j++) {
            let s = 0;
            for (let d = 0; d < hd; d++) s += q[i * D + off + d] * k[j * D + off + d];
            s *= scale; att[row + j] = s; if (s > max) max = s;
          }
          let sum = 0;
          for (let j = 0; j <= i; j++) { const e = Math.exp(att[row + j] - max); att[row + j] = e; sum += e; }
          const inv = 1 / (sum || 1);
          for (let j = 0; j <= i; j++) {
            const a = att[row + j] * inv; att[row + j] = a;
            for (let d = 0; d < hd; d++) ctxv[i * D + off + d] += a * v[j * D + off + d];
          }
        }
      }
      const attnOut = new Float32Array(T * D);
      matmul(ctxv, L.Wo.v, T, D, D, attnOut, L.bo.v);
      const x1 = new Float32Array(T * D);
      for (let i = 0; i < T * D; i++) x1[i] = x[i] + attnOut[i];

      const ln2 = new Float32Array(T * D), mu2 = new Float32Array(T), iv2 = new Float32Array(T);
      layerNorm(x1, L.g2.v, L.b2.v, T, D, ln2, mu2, iv2);
      const pre = new Float32Array(T * dFF);
      matmul(ln2, L.W1.v, T, D, dFF, pre, L.bf1.v);
      const act = new Float32Array(T * dFF);
      for (let i = 0; i < T * dFF; i++) act[i] = gelu(pre[i]);
      const ff = new Float32Array(T * D);
      matmul(act, L.W2.v, T, dFF, D, ff, L.bf2.v);
      const x2 = new Float32Array(T * D);
      for (let i = 0; i < T * D; i++) x2[i] = x1[i] + ff[i];

      caches.push({ x, ln1, mu1, iv1, q, k, v, att, ctxv, x1, ln2, mu2, iv2, pre, act, x2 });
      x = x2;
    }

    const lnF = new Float32Array(T * D), muF = new Float32Array(T), ivF = new Float32Array(T);
    layerNorm(x, this.gF.v, this.bF.v, T, D, lnF, muF, ivF);
    const V = this.cfg.vocab;
    const logits = new Float32Array(T * V);
    matmul(lnF, this.head.v, T, D, V, logits, this.headB.v);

    let loss = 0;
    const dLogits = new Float32Array(T * V);
    for (let t = 0; t < T; t++) {
      const o = t * V;
      let max = -Infinity;
      for (let c = 0; c < V; c++) if (logits[o + c] > max) max = logits[o + c];
      let sum = 0;
      for (let c = 0; c < V; c++) { const e = Math.exp(logits[o + c] - max); dLogits[o + c] = e; sum += e; }
      const inv = 1 / sum;
      const y = targets[t];
      loss += -Math.log(Math.max(dLogits[o + y] * inv, 1e-9));
      for (let c = 0; c < V; c++) dLogits[o + c] = (dLogits[o + c] * inv - (c === y ? 1 : 0)) / T;
    }
    loss /= T;


    return { loss, caches, lnF, muF, ivF, dLogits, xFinal: x, T };
  }

  backward(tokens: Int32Array, fwd: ReturnType<Transformer["forward"]>) {
    const { dModel: D, nHeads: H, dFF, nLayers, vocab: V } = this.cfg;
    const { caches, lnF, muF, ivF, dLogits, xFinal, T } = fwd;
    const hd = D / H, scale = 1 / Math.sqrt(hd);

    const dLnF = new Float32Array(T * D);
    matmulBackward(lnF, this.head.v, dLogits, T, D, V, dLnF, this.head.g, this.headB.g);
    let dx = layerNormBackward(dLnF, xFinal, this.gF.v, this.gF.g, this.bF.g, muF, ivF, T, D);

    for (let l = nLayers - 1; l >= 0; l--) {
      const L = this.layers[l], C = caches[l];
      // FFN branch
      const dff = new Float32Array(T * dFF);
      matmulBackward(C.act, L.W2.v, dx, T, dFF, D, dff, L.W2.g, L.bf2.g);
      for (let i = 0; i < T * dFF; i++) dff[i] *= geluGrad(C.pre[i]);
      const dLn2 = new Float32Array(T * D);
      matmulBackward(C.ln2, L.W1.v, dff, T, D, dFF, dLn2, L.W1.g, L.bf1.g);
      const dx1 = layerNormBackward(dLn2, C.x1, L.g2.v, L.g2.g, L.b2.g, C.mu2, C.iv2, T, D);
      for (let i = 0; i < T * D; i++) dx1[i] += dx[i]; // residual

      // Attention branch
      const dCtx = new Float32Array(T * D);
      matmulBackward(C.ctxv, L.Wo.v, dx1, T, D, D, dCtx, L.Wo.g, L.bo.g);
      const dq = new Float32Array(T * D), dk = new Float32Array(T * D), dv = new Float32Array(T * D);
      for (let h = 0; h < H; h++) {
        const off = h * hd, ab = h * T * T;
        for (let i = 0; i < T; i++) {
          const row = ab + i * T;
          const dA = new Float32Array(i + 1);
          for (let j = 0; j <= i; j++) {
            let acc = 0;
            for (let d = 0; d < hd; d++) {
              const gd = dCtx[i * D + off + d];
              acc += gd * C.v[j * D + off + d];
              dv[j * D + off + d] += C.att[row + j] * gd;
            }
            dA[j] = acc;
          }
          let dot = 0;
          for (let j = 0; j <= i; j++) dot += dA[j] * C.att[row + j];
          for (let j = 0; j <= i; j++) {
            const ds = C.att[row + j] * (dA[j] - dot) * scale;
            for (let d = 0; d < hd; d++) {
              dq[i * D + off + d] += ds * C.k[j * D + off + d];
              dk[j * D + off + d] += ds * C.q[i * D + off + d];
            }
          }
        }
      }
      const dLn1 = new Float32Array(T * D);
      matmulBackward(C.ln1, L.Wq.v, dq, T, D, D, dLn1, L.Wq.g, L.bq.g);
      matmulBackward(C.ln1, L.Wk.v, dk, T, D, D, dLn1, L.Wk.g, L.bk.g);
      matmulBackward(C.ln1, L.Wv.v, dv, T, D, D, dLn1, L.Wv.g, L.bv.g);
      const dxIn = layerNormBackward(dLn1, C.x, L.g1.v, L.g1.g, L.b1.g, C.mu1, C.iv1, T, D);
      for (let i = 0; i < T * D; i++) dxIn[i] += dx1[i];
      dx = dxIn;
    }

    for (let t = 0; t < T; t++) {
      const eo = tokens[t] * D, po = t * D, xo = t * D;
      for (let d = 0; d < D; d++) { this.emb.g[eo + d] += dx[xo + d]; this.pos.g[po + d] += dx[xo + d]; }
    }
  }

  adam() {
    this.step++;
    const { lr } = this.cfg;
    const b1 = 0.9, b2 = 0.999, eps = 1e-8;
    const c1 = 1 - Math.pow(b1, this.step), c2 = 1 - Math.pow(b2, this.step);
    // global grad-norm clipping keeps real-time streaming updates stable
    let sq = 0;
    for (const p of this.params) for (let i = 0; i < p.size; i++) sq += p.g[i] * p.g[i];
    const norm = Math.sqrt(sq);
    const clip = norm > 1 ? 1 / norm : 1;
    for (const p of this.params) {
      for (let i = 0; i < p.size; i++) {
        const g = p.g[i] * clip;
        p.m[i] = b1 * p.m[i] + (1 - b1) * g;
        p.s[i] = b2 * p.s[i] + (1 - b2) * g * g;
        p.v[i] -= lr * (p.m[i] / c1) / (Math.sqrt(p.s[i] / c2) + eps);
      }
    }
    return norm;
  }
}

function layerNorm(x: Float32Array, g: Float32Array, b: Float32Array, T: number, D: number, out: Float32Array, mu: Float32Array, iv: Float32Array) {
  for (let t = 0; t < T; t++) {
    const o = t * D;
    let m = 0; for (let d = 0; d < D; d++) m += x[o + d]; m /= D;
    let vv = 0; for (let d = 0; d < D; d++) { const c = x[o + d] - m; vv += c * c; } vv /= D;
    const inv = 1 / Math.sqrt(vv + 1e-5);
    mu[t] = m; iv[t] = inv;
    for (let d = 0; d < D; d++) out[o + d] = (x[o + d] - m) * inv * g[d] + b[d];
  }
}

function layerNormBackward(dOut: Float32Array, x: Float32Array, g: Float32Array, dg: Float32Array, db: Float32Array, mu: Float32Array, iv: Float32Array, T: number, D: number) {
  const dx = new Float32Array(T * D);
  for (let t = 0; t < T; t++) {
    const o = t * D, inv = iv[t], m = mu[t];
    let s1 = 0, s2 = 0;
    for (let d = 0; d < D; d++) {
      const xh = (x[o + d] - m) * inv;
      const go = dOut[o + d];
      dg[d] += go * xh; db[d] += go;
      const gx = go * g[d];
      s1 += gx; s2 += gx * xh;
    }
    for (let d = 0; d < D; d++) {
      const xh = (x[o + d] - m) * inv;
      dx[o + d] = (dOut[o + d] * g[d] - s1 / D - xh * s2 / D) * inv;
    }
  }
  return dx;
}

/* --------------------------------------------------------------- training */

let model: Transformer | null = null;
let cfg: Cfg = { ...DEFAULT_CFG };
let stream: number[] = [];
let running = false;
let budgetMs = 12;
let lossEMA = 0;
let lossHistory: number[] = [];
let tokensSeen = 0;
let lastTelemetry = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Rolling training-metric series (one sample per telemetry post). */
export interface MetricSample {
  at: number; step: number; loss: number; gradNorm: number;
  tokensPerSec: number; stepsPerSec: number; entropy: number; tokensSeen: number;
}
let metrics: MetricSample[] = [];
let gradNormEMA = 0;
let tokensPerSec = 0;
let stepsPerSec = 0;
let winTokens = 0, winSteps = 0, winStart = 0;

function build(next: Partial<Cfg>, fresh = false) {
  const prev = fresh ? null : model;
  cfg = { ...cfg, ...next };
  cfg.dModel = Math.max(cfg.nHeads, cfg.dModel - (cfg.dModel % cfg.nHeads));
  cfg.ctx = Math.max(8, Math.min(128, Math.round(cfg.ctx)));
  cfg.batch = Math.max(1, Math.min(16, Math.round(cfg.batch)));
  cfg.lr = Math.max(1e-5, Math.min(0.05, cfg.lr));
  model = new Transformer(cfg, prev ?? undefined);
  lastFwd = null; lastTokens = null;
  postTelemetry(true);
}

function sampleWindow(): { x: Int32Array; y: Int32Array } | null {
  const T = cfg.ctx;
  if (stream.length < T + 1) return null;
  const start = Math.floor(rand() * (stream.length - T - 1));
  const x = new Int32Array(T), y = new Int32Array(T);
  for (let i = 0; i < T; i++) { x[i] = stream[start + i] % cfg.vocab; y[i] = stream[start + i + 1] % cfg.vocab; }
  return { x, y };
}

function tick() {
  timer = null;
  if (!running || !model) return;
  const t0 = performance.now();
  let steps = 0;
  const B = Math.max(1, cfg.batch);
  while (performance.now() - t0 < budgetMs) {
    model.zeroGrad();
    let used = 0, batchLoss = 0;
    for (let b = 0; b < B; b++) {
      const w = sampleWindow();
      if (!w) break;
      const fwd = model.forward(w.x, w.y);
      model.backward(w.x, fwd);
      batchLoss += fwd.loss;
      lastFwd = fwd; lastTokens = w.x;
      used++;
    }
    if (!used) break;
    if (used > 1) { const inv = 1 / used; for (const p of model.params) for (let i = 0; i < p.size; i++) p.g[i] *= inv; }
    const gn = model.adam();
    gradNormEMA = gradNormEMA === 0 ? gn : gradNormEMA * 0.9 + gn * 0.1;
    const loss = batchLoss / used;
    lossEMA = lossEMA === 0 ? loss : lossEMA * 0.95 + loss * 0.05;
    tokensSeen += cfg.ctx * used;
    winTokens += cfg.ctx * used;
    winSteps++;
    steps++;
  }
  const now = performance.now();
  if (!winStart) winStart = t0;
  const elapsed = now - winStart;
  if (elapsed > 900) {
    tokensPerSec = (winTokens * 1000) / elapsed;
    stepsPerSec = (winSteps * 1000) / elapsed;
    winTokens = 0; winSteps = 0; winStart = now;
  }
  if (now - lastTelemetry > 250) { postTelemetry(); lastTelemetry = now; }
  // yield generously so the UI thread and the rest of the app stay smooth
  timer = setTimeout(tick, steps > 0 ? 24 : 400);
}

let lastFwd: ReturnType<Transformer["forward"]> | null = null;
let lastTokens: Int32Array | null = null;

function postTelemetry(structural = false) {
  if (!model) return;
  const { nLayers, nHeads, ctx, dModel } = cfg;
  if (lossEMA > 0) {
    lossHistory.push(lossEMA);
    if (lossHistory.length > 180) lossHistory = lossHistory.slice(-180);
  }

  // Attention: mean over heads for each layer, down-sampled to <= 24x24
  const attention: number[][] = [];
  const headEntropy: number[] = [];
  if (lastFwd) {
    const T = lastFwd.T;
    const S = Math.min(T, 24);
    for (let l = 0; l < nLayers; l++) {
      const att = lastFwd.caches[l].att;
      const map = new Array(S * S).fill(0);
      for (let h = 0; h < nHeads; h++) {
        let ent = 0;
        for (let i = 0; i < T; i++) for (let j = 0; j <= i; j++) {
          const a = att[h * T * T + i * T + j];
          if (a > 1e-6) ent -= a * Math.log(a);
          const si = Math.floor(i * S / T), sj = Math.floor(j * S / T);
          map[si * S + sj] += a / nHeads;
        }
        headEntropy.push(ent / T);
      }
      attention.push(map);
    }
  }

  // Per-layer activation energy — drives the pulse intensity in the 3D view
  const layerEnergy: number[] = [];
  if (lastFwd) {
    for (let l = 0; l < nLayers; l++) {
      const a = lastFwd.caches[l].x2;
      let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i];
      layerEnergy.push(Math.sqrt(s / a.length));
    }
  }

  // Weight-norm fingerprint per layer (Q/K/V/O and FFN) for the heat strip
  const weightNorms = model.layers.map((L) => {
    const n = (t: Tensor) => { let s = 0; for (let i = 0; i < t.size; i++) s += t.v[i] * t.v[i]; return Math.sqrt(s / t.size); };
    return { q: n(L.Wq), k: n(L.Wk), v: n(L.Wv), o: n(L.Wo), ff: (n(L.W1) + n(L.W2)) / 2 };
  });

  // Next-token prediction over the live stream (top 5)
  let top: { id: number; p: number }[] = [];
  if (lastFwd && lastTokens) {
    const V = cfg.vocab, T = lastFwd.T;
    const lnF = lastFwd.lnF;
    const logits = new Float32Array(V);
    for (let c = 0; c < V; c++) {
      let s = model.headB.v[c];
      for (let d = 0; d < dModel; d++) s += lnF[(T - 1) * dModel + d] * model.head.v[d * V + c];
      logits[c] = s;
    }
    let max = -Infinity; for (let c = 0; c < V; c++) if (logits[c] > max) max = logits[c];
    let sum = 0; const ps = new Float32Array(V);
    for (let c = 0; c < V; c++) { ps[c] = Math.exp(logits[c] - max); sum += ps[c]; }
    top = Array.from(ps, (p, id) => ({ id, p: p / sum })).sort((a, b) => b.p - a.p).slice(0, 5);
  }

  const meanEntropy = headEntropy.length
    ? headEntropy.reduce((a, b) => a + b, 0) / headEntropy.length
    : (metrics.length ? metrics[metrics.length - 1].entropy : 0);
  if (lossEMA > 0) {
    metrics.push({
      at: Date.now(), step: model.step, loss: lossEMA, gradNorm: gradNormEMA,
      tokensPerSec, stepsPerSec, entropy: meanEntropy, tokensSeen,
    });
    if (metrics.length > 240) metrics = metrics.slice(-240);
  }

  (self as unknown as Worker).postMessage({
    type: "telemetry",
    structural,
    cfg,
    params: model.paramCount,
    step: model.step,
    loss: lossEMA,
    perplexity: Math.exp(Math.min(lossEMA, 20)),
    lossHistory,
    attention,
    headEntropy,
    layerEnergy,
    weightNorms,
    top,
    tokensSeen,
    streamSize: stream.length,
    ctx,
    gradNorm: gradNormEMA,
    tokensPerSec,
    stepsPerSec,
    entropy: meanEntropy,
    metrics,
  });
}

/* ------------------------------------------------------------------ query */

/**
 * Autoregressively roll the model forward from the tail of the live stream and
 * report each predicted token with its probability plus the attention row that
 * produced it (the "evidence" behind the prediction).
 */
function runQuery(id: string, steps: number) {
  const post = (payload: Record<string, unknown>) =>
    (self as unknown as Worker).postMessage({ type: "query", id, ...payload });
  if (!model || stream.length < 2) { post({ error: "The model has not seen enough activity yet." }); return; }
  const T = cfg.ctx, V = cfg.vocab, D = cfg.dModel;
  const ctxTokens: number[] = stream.slice(-T).map((t) => t % V);
  while (ctxTokens.length < T) ctxTokens.unshift(0);
  const prompt = [...ctxTokens];
  const out: { id: number; p: number; entropy: number; alternatives: { id: number; p: number }[] }[] = [];
  let evidence: { token: number; weight: number }[] = [];

  for (let s = 0; s < steps; s++) {
    const x = new Int32Array(T);
    for (let i = 0; i < T; i++) x[i] = ctxTokens[ctxTokens.length - T + i];
    const fwd = model.forward(x, x);
    const logits = new Float32Array(V);
    for (let c = 0; c < V; c++) {
      let acc = model.headB.v[c];
      for (let d = 0; d < D; d++) acc += fwd.lnF[(T - 1) * D + d] * model.head.v[d * V + c];
      logits[c] = acc;
    }
    let max = -Infinity; for (let c = 0; c < V; c++) if (logits[c] > max) max = logits[c];
    let sum = 0; const ps = new Float32Array(V);
    for (let c = 0; c < V; c++) { ps[c] = Math.exp(logits[c] - max); sum += ps[c]; }
    let ent = 0;
    for (let c = 0; c < V; c++) { ps[c] /= sum; if (ps[c] > 1e-9) ent -= ps[c] * Math.log(ps[c]); }
    const ranked = Array.from(ps, (p, tid) => ({ id: tid, p })).sort((a, b) => b.p - a.p);
    out.push({ id: ranked[0].id, p: ranked[0].p, entropy: ent, alternatives: ranked.slice(0, 4) });

    if (s === 0) {
      // attention paid by the final position, averaged over heads of the last block
      const last = fwd.caches[cfg.nLayers - 1].att;
      const Tt = fwd.T, i = Tt - 1;
      const w = new Array(Tt).fill(0);
      for (let h = 0; h < cfg.nHeads; h++) for (let j = 0; j <= i; j++) w[j] += last[h * Tt * Tt + i * Tt + j] / cfg.nHeads;
      evidence = w.map((weight, j) => ({ token: x[j], weight }))
        .sort((a, b) => b.weight - a.weight).slice(0, 6);
    }
    ctxTokens.push(ranked[0].id);
  }
  post({ prompt: prompt.slice(-12), predictions: out, evidence, step: model.step, loss: lossEMA });
}

/* ------------------------------------------------------------- checkpoint */

function exportCheckpoint(includeOptimizer: boolean) {
  if (!model) return;
  const total = model.paramCount;
  const weights = new Float32Array(total);
  const m = includeOptimizer ? new Float32Array(total) : null;
  const v = includeOptimizer ? new Float32Array(total) : null;
  let off = 0;
  const shapes: { size: number }[] = [];
  for (const p of model.params) {
    weights.set(p.v, off);
    if (m && v) { m.set(p.m, off); v.set(p.s, off); }
    shapes.push({ size: p.size });
    off += p.size;
  }
  const payload: Record<string, unknown> = {
    type: "checkpoint",
    version: CHECKPOINT_VERSION,
    createdAt: new Date().toISOString(),
    cfg: { ...cfg },
    step: model.step,
    tokensSeen,
    lossEMA,
    lossHistory: [...lossHistory],
    streamSize: stream.length,
    paramCount: total,
    shapes,
    weights,
    optimizer: includeOptimizer ? { m, v } : null,
  };
  const transfer: ArrayBuffer[] = [weights.buffer];
  if (m && v) transfer.push(m.buffer, v.buffer);
  (self as unknown as Worker).postMessage(payload, transfer);
}

function loadCheckpoint(ckpt: any) {
  if (!ckpt?.cfg || !ckpt?.weights) return;
  build({ ...DEFAULT_CFG, ...ckpt.cfg }, true);
  if (!model) return;
  const weights: Float32Array = ckpt.weights instanceof Float32Array ? ckpt.weights : new Float32Array(ckpt.weights);
  if (weights.length !== model.paramCount) { postTelemetry(true); return; }
  const om = ckpt.optimizer?.m ? new Float32Array(ckpt.optimizer.m) : null;
  const ov = ckpt.optimizer?.v ? new Float32Array(ckpt.optimizer.v) : null;
  let off = 0;
  for (const p of model.params) {
    p.v.set(weights.subarray(off, off + p.size));
    if (om) p.m.set(om.subarray(off, off + p.size));
    if (ov) p.s.set(ov.subarray(off, off + p.size));
    off += p.size;
  }
  model.step = ckpt.step || 0;
  tokensSeen = ckpt.tokensSeen || 0;
  lossEMA = ckpt.lossEMA || 0;
  lossHistory = Array.isArray(ckpt.lossHistory) ? ckpt.lossHistory.slice(-180) : [];
  postTelemetry(true);
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data || {};
  switch (msg.type) {
    case "init":
      stream = [];
      lossEMA = 0; lossHistory = []; tokensSeen = 0; lastFwd = null; metrics = [];
      build(msg.cfg || {});
      break;
    case "tokens": {
      if (msg.vocabSize && msg.vocabSize > cfg.vocab) build({ vocab: Math.min(4096, Math.ceil(msg.vocabSize * 1.5)) });
      if (msg.replace) stream = [];
      stream.push(...(msg.tokens as number[]));
      if (stream.length > 20000) stream = stream.slice(-20000);
      break;
    }
    case "query":
      runQuery(String(msg.id ?? "q"), Math.max(1, Math.min(24, msg.steps ?? 6)));
      break;
    case "run":
      running = !!msg.running;
      if (running && !timer) timer = setTimeout(tick, 0);
      break;
    case "budget":
      budgetMs = Math.max(2, Math.min(40, msg.ms || 12));
      break;
    case "grow": {
      const nLayers = Math.min(12, cfg.nLayers + (cfg.dModel >= 128 ? 1 : 0));
      const dModel = cfg.dModel < 128 ? cfg.dModel * 2 : cfg.dModel;
      const nHeads = Math.min(12, dModel >= 128 ? cfg.nHeads + 2 : cfg.nHeads);
      build({ dModel, nHeads: dModel % nHeads === 0 ? nHeads : cfg.nHeads, nLayers, dFF: dModel * 4 });
      break;
    }
    case "config": {
      const patch = (msg.patch || {}) as Partial<Cfg>;
      const structural = patch.ctx !== undefined && patch.ctx !== cfg.ctx;
      if (structural) {
        // ctx changes the positional table — rebuild, warm-starting everything else
        build(patch);
      } else {
        cfg = { ...cfg, ...patch };
        cfg.lr = Math.max(1e-5, Math.min(0.05, cfg.lr));
        cfg.batch = Math.max(1, Math.min(16, Math.round(cfg.batch)));
        postTelemetry(true);
      }
      break;
    }
    case "restart": {
      lossEMA = 0; lossHistory = []; tokensSeen = 0; lastFwd = null; lastTokens = null; metrics = []; gradNormEMA = 0;
      build(msg.patch || {}, msg.fresh !== false);
      break;
    }
    case "checkpoint":
      exportCheckpoint(msg.includeOptimizer !== false);
      break;
    case "load":
      loadCheckpoint(msg.ckpt);
      break;
    case "shrink": {
      const dModel = Math.max(32, cfg.dModel / 2);
      build({ dModel, nHeads: Math.max(2, Math.min(cfg.nHeads, dModel / 16)), nLayers: Math.max(2, cfg.nLayers - 1), dFF: dModel * 4 });
      break;
    }
  }
};

export {};
