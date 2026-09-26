// Pure-TypeScript neural detectors with hand-written backprop (no network,
// no external ML library) so they learn continuously on-device:
//   • DenoisingAutoencoder — compresses a row through a bottleneck and
//     reconstructs values + presence; cells that don't reconstruct are anomalies.
//   • ColumnTransformer — each column is a token; self-attention over the OTHER
//     columns predicts each value (leave-one-out), exposing cross-column breaks.
// Both use AdamW (decoupled weight decay), dropout, input corruption and
// gradient clipping as anti-overfitting measures.

export class Param {
  w: Float32Array; g: Float32Array; m: Float32Array; v: Float32Array;
  constructor(public size: number, scale: number, public decay = true, init = true) {
    this.w = new Float32Array(size); this.g = new Float32Array(size);
    this.m = new Float32Array(size); this.v = new Float32Array(size);
    if (init) for (let i = 0; i < size; i++) this.w[i] = randn() * scale;
  }
}
export function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class AdamW {
  t = 0;
  constructor(public params: Param[]) {}
  zero() { for (const p of this.params) p.g.fill(0); }
  step(lr: number, wd: number, scale: number, clip = 5) {
    let norm = 0;
    for (const p of this.params) for (let i = 0; i < p.size; i++) { p.g[i] *= scale; norm += p.g[i] * p.g[i]; }
    norm = Math.sqrt(norm);
    const k = norm > clip ? clip / norm : 1;
    this.t++;
    const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t);
    for (const p of this.params) for (let i = 0; i < p.size; i++) {
      const g = p.g[i] * k;
      p.m[i] = b1 * p.m[i] + (1 - b1) * g;
      p.v[i] = b2 * p.v[i] + (1 - b2) * g * g;
      p.w[i] -= lr * ((p.m[i] / c1) / (Math.sqrt(p.v[i] / c2) + 1e-8) + (p.decay ? wd * p.w[i] : 0));
    }
    return norm;
  }
}

class Dense {
  W: Param; b: Param; x!: Float32Array; y!: Float32Array;
  constructor(public nin: number, public nout: number, public tanh: boolean) {
    this.W = new Param(nin * nout, Math.sqrt(1 / nin));
    this.b = new Param(nout, 0, false);
  }
  forward(x: Float32Array) {
    const { nin, nout } = this, W = this.W.w, y = new Float32Array(nout);
    for (let o = 0; o < nout; o++) {
      let s = this.b.w[o]; const off = o * nin;
      for (let i = 0; i < nin; i++) s += W[off + i] * x[i];
      y[o] = this.tanh ? Math.tanh(s) : s;
    }
    this.x = x; this.y = y; return y;
  }
  backward(dy: Float32Array) {
    const { nin, nout } = this, W = this.W.w, gW = this.W.g, dx = new Float32Array(nin);
    for (let o = 0; o < nout; o++) {
      const dz = this.tanh ? dy[o] * (1 - this.y[o] * this.y[o]) : dy[o];
      if (dz === 0) continue;
      this.b.g[o] += dz; const off = o * nin;
      for (let i = 0; i < nin; i++) { gW[off + i] += dz * this.x[i]; dx[i] += W[off + i] * dz; }
    }
    return dx;
  }
  params() { return [this.W, this.b]; }
}

export class DenoisingAutoencoder {
  L: Dense[]; drop!: Float32Array; T: number;
  constructor(T: number) {
    this.T = T;
    const h = Math.min(64, Math.max(16, T)), z = Math.max(4, Math.round(T / 6));
    this.L = [new Dense(2 * T, h, true), new Dense(h, z, true), new Dense(z, h, true), new Dense(h, 2 * T, false)];
  }
  params() { return this.L.flatMap((l) => l.params()); }
  /** returns [recon(T), presenceLogit(T)] */
  forward(x: Float32Array, m: Uint8Array, dropout = 0) {
    const T = this.T, inp = new Float32Array(2 * T);
    for (let j = 0; j < T; j++) { inp[j] = m[j] ? x[j] : 0; inp[T + j] = m[j]; }
    const h1 = this.L[0].forward(inp);
    this.drop = new Float32Array(h1.length).fill(1);
    if (dropout > 0) for (let i = 0; i < h1.length; i++) { if (Math.random() < dropout) { this.drop[i] = 0; h1[i] = 0; } else { this.drop[i] = 1 / (1 - dropout); h1[i] *= this.drop[i]; } }
    return this.L[3].forward(this.L[2].forward(this.L[1].forward(h1)));
  }
  backward(dout: Float32Array) {
    let d = this.L[3].backward(dout);
    d = this.L[2].backward(d); d = this.L[1].backward(d);
    for (let i = 0; i < d.length; i++) d[i] *= this.drop[i];
    this.L[0].backward(d);
  }
}

export class ColumnTransformer {
  T: number; d = 16;
  a: Param; E: Param; Wq: Param; Wk: Param; Wv: Param; Wf: Param; bf: Param; U: Param; b: Param;
  // caches
  private c: any = {};
  constructor(T: number) {
    this.T = T; const d = this.d, s = 1 / Math.sqrt(d);
    this.a = new Param(d, 1); this.E = new Param(T * d, 0.3);
    this.Wq = new Param(d * d, s); this.Wk = new Param(d * d, s); this.Wv = new Param(d * d, s);
    this.Wf = new Param(d * d, s); this.bf = new Param(d, 0, false);
    this.U = new Param(T * d, 0.3); this.b = new Param(T, 0, false);
  }
  params() { return [this.a, this.E, this.Wq, this.Wk, this.Wv, this.Wf, this.bf, this.U, this.b]; }
  private mv(vec: Float32Array, vo: number, M: Float32Array, out: Float32Array, oo: number) {
    const d = this.d;
    for (let c = 0; c < d; c++) { let s = 0; for (let r = 0; r < d; r++) s += vec[vo + r] * M[r * d + c]; out[oo + c] = s; }
  }
  /** keys: columns allowed as context. Returns prediction for every column. */
  forward(x: Float32Array, keys: Uint8Array) {
    const T = this.T, d = this.d, inv = 1 / Math.sqrt(d);
    const E = this.E.w, H = new Float32Array(T * d), Q = new Float32Array(T * d), K = new Float32Array(T * d), V = new Float32Array(T * d);
    for (let i = 0; i < T; i++) {
      this.mv(E, i * d, this.Wq.w, Q, i * d);
      if (!keys[i]) continue;
      for (let r = 0; r < d; r++) H[i * d + r] = x[i] * this.a.w[r] + E[i * d + r];
      this.mv(H, i * d, this.Wk.w, K, i * d); this.mv(H, i * d, this.Wv.w, V, i * d);
    }
    const A = new Float32Array(T * T), O = new Float32Array(T * d), F = new Float32Array(T * d), y = new Float32Array(T);
    for (let j = 0; j < T; j++) {
      let mx = -Infinity;
      for (let i = 0; i < T; i++) {
        if (!keys[i] || i === j) continue;
        let s = 0; for (let r = 0; r < d; r++) s += Q[j * d + r] * K[i * d + r];
        s *= inv; A[j * T + i] = s; if (s > mx) mx = s;
      }
      if (mx === -Infinity) { /* no context */ }
      else {
        let sum = 0;
        for (let i = 0; i < T; i++) { if (!keys[i] || i === j) { A[j * T + i] = 0; continue; } const e = Math.exp(A[j * T + i] - mx); A[j * T + i] = e; sum += e; }
        for (let i = 0; i < T; i++) if (A[j * T + i]) { A[j * T + i] /= sum; const a = A[j * T + i]; for (let r = 0; r < d; r++) O[j * d + r] += a * V[i * d + r]; }
      }
      for (let c = 0; c < d; c++) { let s = this.bf.w[c]; for (let r = 0; r < d; r++) s += this.Wf.w[c * d + r] * O[j * d + r]; F[j * d + c] = Math.tanh(s); }
      let s = this.b.w[j]; for (let r = 0; r < d; r++) s += F[j * d + r] * this.U.w[j * d + r]; y[j] = s;
    }
    this.c = { x, keys, H, Q, K, V, A, O, F };
    return y;
  }
  backward(dy: Float32Array) {
    const T = this.T, d = this.d, inv = 1 / Math.sqrt(d);
    const { x, keys, H, Q, K, V, A, O, F } = this.c;
    const dQ = new Float32Array(T * d), dK = new Float32Array(T * d), dV = new Float32Array(T * d);
    const dO = new Float32Array(d), dA = new Float32Array(T), dz = new Float32Array(d);
    for (let j = 0; j < T; j++) {
      const g = dy[j]; if (!g) continue;
      this.b.g[j] += g;
      for (let r = 0; r < d; r++) { this.U.g[j * d + r] += g * F[j * d + r]; dz[r] = g * this.U.w[j * d + r] * (1 - F[j * d + r] * F[j * d + r]); }
      dO.fill(0);
      for (let c = 0; c < d; c++) { this.bf.g[c] += dz[c]; for (let r = 0; r < d; r++) { this.Wf.g[c * d + r] += dz[c] * O[j * d + r]; dO[r] += this.Wf.w[c * d + r] * dz[c]; } }
      let dot = 0;
      for (let i = 0; i < T; i++) { const a = A[j * T + i]; if (!a) { dA[i] = 0; continue; } let s = 0; for (let r = 0; r < d; r++) s += dO[r] * V[i * d + r]; dA[i] = s; dot += a * s; }
      for (let i = 0; i < T; i++) {
        const a = A[j * T + i]; if (!a) continue;
        const ds = a * (dA[i] - dot) * inv;
        for (let r = 0; r < d; r++) { dV[i * d + r] += a * dO[r]; dQ[j * d + r] += ds * K[i * d + r]; dK[i * d + r] += ds * Q[j * d + r]; }
      }
    }
    const E = this.E.w;
    for (let i = 0; i < T; i++) {
      for (let r = 0; r < d; r++) for (let c = 0; c < d; c++) {
        const dq = dQ[i * d + c]; if (dq) { this.Wq.g[r * d + c] += E[i * d + r] * dq; this.E.g[i * d + r] += this.Wq.w[r * d + c] * dq; }
      }
      if (!keys[i]) continue;
      for (let r = 0; r < d; r++) {
        let dh = 0;
        for (let c = 0; c < d; c++) {
          const dk = dK[i * d + c], dv = dV[i * d + c];
          this.Wk.g[r * d + c] += H[i * d + r] * dk; this.Wv.g[r * d + c] += H[i * d + r] * dv;
          dh += this.Wk.w[r * d + c] * dk + this.Wv.w[r * d + c] * dv;
        }
        this.a.g[r] += x[i] * dh; this.E.g[i * d + r] += dh;
      }
    }
  }
}

export function snapshot(params: Param[]) { return params.map((p) => Float32Array.from(p.w)); }
export function restore(params: Param[], snap: Float32Array[]) { params.forEach((p, i) => p.w.set(snap[i])); }
export function serialize(params: Param[]) { return params.map((p) => Array.from(p.w)); }
export function deserialize(params: Param[], data: number[][] | undefined) {
  if (!data || data.length !== params.length || data.some((a, i) => a.length !== params[i].size)) return false;
  params.forEach((p, i) => p.w.set(data[i])); return true;
}
