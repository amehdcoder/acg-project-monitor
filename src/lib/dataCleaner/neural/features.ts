// Feature space for the neural Data Cleaner brain.
// Numeric-like columns become model tokens (signed-log / day / year transforms,
// standardised by a cumulative running normaliser). Text columns are modelled by
// a cumulative frequency (density) model. No hand-written validation rules.
import type { ColumnDef, MdaConfig } from "../schemas";

export function toNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  if (v instanceof Date) return null;
  const s = String(v).trim().replace(/,/g, "").replace(/%$/, "");
  if (s === "") return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}
export function isBlank(v: any) {
  return v === null || v === undefined || String(v).trim() === "";
}
export function parseDate(v: any): Date | null {
  if (isBlank(v)) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

const EPOCH = Date.UTC(2000, 0, 1);
const DAY = 86400000;

export interface FeatureSpace {
  numeric: ColumnDef[];
  text: ColumnDef[];
}
export function featureSpace(config: MdaConfig): FeatureSpace {
  return {
    numeric: config.columns.filter((c) => c.type !== "text"),
    text: config.columns.filter((c) => c.type === "text"),
  };
}

/** Raw → model space (before standardisation). null = missing, NaN = unreadable. */
export function forward(col: ColumnDef, v: any): number | null {
  if (isBlank(v)) return null;
  if (col.type === "date") {
    const d = parseDate(v);
    return d ? (d.getTime() - EPOCH) / DAY : NaN;
  }
  const n = toNum(v);
  if (n === null) return NaN;
  if (col.type === "year") return n - 2000;
  return Math.sign(n) * Math.log1p(Math.abs(n));
}
export function inverse(col: ColumnDef, t: number): any {
  if (col.type === "date") return new Date(EPOCH + Math.round(t) * DAY).toISOString().slice(0, 10);
  if (col.type === "year") return Math.round(t + 2000);
  const n = Math.sign(t) * Math.expm1(Math.abs(t));
  if (col.type === "int" || col.type === "calc") return Math.max(0, Math.round(n));
  return +Math.max(0, n).toFixed(2);
}

export interface Encoded {
  t: Float32Array; // model-space values (0 where missing)
  m: Uint8Array; // 1 = present & readable
  bad: Uint8Array; // 1 = non-empty but unreadable
  hash: number;
}
export function encodeRow(space: FeatureSpace, row: Record<string, any>): Encoded {
  const T = space.numeric.length;
  const t = new Float32Array(T), m = new Uint8Array(T), bad = new Uint8Array(T);
  let h = 2166136261;
  space.numeric.forEach((c, j) => {
    const v = forward(c, row[c.key]);
    if (v === null) return;
    if (Number.isNaN(v)) { bad[j] = 1; return; }
    t[j] = v; m[j] = 1;
    h = Math.imul(h ^ Math.round(v * 1000), 16777619);
  });
  for (const c of space.text) {
    const s = String(row[c.key] ?? "");
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return { t, m, bad, hash: h >>> 0 };
}

/** Cumulative Welford normaliser — knowledge of scale grows with every row. */
export class Normaliser {
  n: Float64Array; mean: Float64Array; m2: Float64Array;
  constructor(T: number) { this.n = new Float64Array(T); this.mean = new Float64Array(T); this.m2 = new Float64Array(T); }
  update(e: Encoded) {
    for (let j = 0; j < e.t.length; j++) {
      if (!e.m[j]) continue;
      this.n[j]++;
      const d = e.t[j] - this.mean[j];
      this.mean[j] += d / this.n[j];
      this.m2[j] += d * (e.t[j] - this.mean[j]);
    }
  }
  std(j: number) { return this.n[j] > 1 ? Math.max(Math.sqrt(this.m2[j] / (this.n[j] - 1)), 0.05) : 1; }
  z(j: number, t: number) { const v = (t - this.mean[j]) / this.std(j); return v > 8 ? 8 : v < -8 ? -8 : v; }
  unz(j: number, z: number) { return z * this.std(j) + this.mean[j]; }
  toJSON() { return { n: Array.from(this.n), mean: Array.from(this.mean), m2: Array.from(this.m2) }; }
  static from(o: any, T: number) {
    const x = new Normaliser(T);
    if (o?.n?.length === T) { x.n.set(o.n); x.mean.set(o.mean); x.m2.set(o.m2); }
    return x;
  }
}

/** Cumulative categorical density model for text columns (incl. geo pairs). */
export class CategoryModel {
  counts: Record<string, Record<string, number>> = {};
  totals: Record<string, number> = {};
  private keyOf(row: Record<string, any>, col: string) { return String(row[col] ?? "").trim().toLowerCase(); }
  keys(space: FeatureSpace, row: Record<string, any>): [string, string][] {
    const out: [string, string][] = space.text.map((c) => [c.key, this.keyOf(row, c.key)]);
    const s = this.keyOf(row, "State"), l = this.keyOf(row, "LGA"), w = this.keyOf(row, "Ward");
    if (s && l) out.push(["State→LGA", `${s}|${l}`]);
    if (l && w) out.push(["LGA→Ward", `${l}|${w}`]);
    return out;
  }
  update(space: FeatureSpace, row: Record<string, any>) {
    for (const [c, k] of this.keys(space, row)) {
      if (!k) continue;
      (this.counts[c] ||= {})[k] = (this.counts[c][k] || 0) + 1;
      this.totals[c] = (this.totals[c] || 0) + 1;
    }
  }
  surprise(col: string, key: string) {
    const tot = this.totals[col] || 0;
    const K = Object.keys(this.counts[col] || {}).length + 1;
    const cnt = this.counts[col]?.[key] || 0;
    return -Math.log((cnt + 0.5) / (tot + 0.5 * K));
  }
  seen(col: string, key: string) { return (this.counts[col]?.[key] || 0) > 0; }
  mode(col: string): string | null {
    const c = this.counts[col]; if (!c) return null;
    let best: string | null = null, bn = 0;
    for (const [k, n] of Object.entries(c)) if (n > bn) { bn = n; best = k; }
    return best;
  }
}
