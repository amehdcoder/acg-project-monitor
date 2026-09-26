/**
 * Data Cleaner "brain" — runs continuously off the main thread.
 * Learns what NORMAL treatment data looks like from every cleaned historical
 * dataset (cumulative corpus), keeps thinking (denoising re-training + corpus
 * self-review) even when no new data arrives, checkpoints its knowledge every
 * minute, and flags cells that don't reconstruct well.
 *
 * Anti-overfitting: 15% hash-stable holdout, AdamW weight decay, dropout,
 * input corruption, gradient clipping, best-validation snapshots with
 * restore + stronger regularisation when the train/val gap widens, uniform
 * replay over the whole corpus (no forgetting), and down-weighting of
 * historical rows the brain itself finds implausible.
 */
import { MDA_CONFIGS, type MdaTypeId } from "@/lib/dataCleaner/schemas";
import {
  featureSpace, encodeRow, inverse, isBlank, Normaliser, CategoryModel, type Encoded, type FeatureSpace,
} from "@/lib/dataCleaner/neural/features";
import {
  DenoisingAutoencoder, ColumnTransformer, AdamW, snapshot, restore, serialize, deserialize, randn,
} from "@/lib/dataCleaner/neural/models";
import { idbGet, idbSet, idbDel } from "@/lib/dataCleaner/neural/idb";
import type { BrainStats, ScoredRow, ScoredCell } from "@/lib/dataCleaner/neural/protocol";

const MAX_CORPUS = 20000;
const BASE_LR = 0.003;

interface Item { raw: Record<string, any>; e: Encoded; val: boolean; w: number }

let mda: MdaTypeId | null = null;
let space!: FeatureSpace;
let T = 0;
let norm!: Normaliser;
let cats!: CategoryModel;
let ae!: DenoisingAutoencoder;
let tf!: ColumnTransformer;
let opt!: AdamW;
let corpus: Item[] = [];
let temp: Item[] = []; // self-referenced bootstrap pool (current file) when history is thin
let best: { val: number; snap: Float32Array[] } = { val: Infinity, snap: [] };
let hp = { lr: BASE_LR, wd: 0.001, noise: 0.15, dropout: 0.1 };
let cal = { colScale: [] as number[], rowQ95: 1, rowQ995: 2, catScale: {} as Record<string, number>, ready: false };
let s = {
  steps: 0, trainLoss: 0, valLoss: 0, aeLoss: 0, tfLoss: 0, overfitEvents: 0, patience: 0,
  lastCheckpointAt: 0, lossHistory: [] as { t: number; train: number; val: number }[],
  log: [] as string[], sources: [] as { name: string; rows: number; at: string }[],
  newSinceMinute: 0, minuteStartVal: NaN, reviewedDown: 0,
};
let running = true, hidden = false;
let loopTimer: any = null;
let lastCustom: { columns: any[] } | undefined;

const post = (m: any) => (self as any).postMessage(m);
const log = (msg: string) => { s.log.unshift(`${new Date().toLocaleTimeString()} — ${msg}`); s.log = s.log.slice(0, 60); };

function hashVal(h: number) { return (h % 100) < 15; }

function mkItem(raw: Record<string, any>): Item {
  const e = encodeRow(space, raw);
  return { raw, e, val: hashVal(e.hash), w: 1 };
}

async function init(id: MdaTypeId, custom?: { columns: any[] }, serverCk?: any) {
  mda = id;
  const cfg = (custom ?? MDA_CONFIGS[id]) as any;
  space = featureSpace(cfg); T = space.numeric.length;
  ae = new DenoisingAutoencoder(T); tf = new ColumnTransformer(T);
  opt = new AdamW([...ae.params(), ...tf.params()]);
  norm = new Normaliser(T); cats = new CategoryModel();
  corpus = []; temp = []; best = { val: Infinity, snap: [] };
  hp = { lr: BASE_LR, wd: 0.001, noise: 0.15, dropout: 0.1 };
  s = { ...s, steps: 0, overfitEvents: 0, patience: 0, lossHistory: [], log: [], sources: [], newSinceMinute: 0, reviewedDown: 0 };
  cal.ready = false;
  const [rows, localCk] = await Promise.all([idbGet<any[]>(`corpus:${id}`), idbGet<any>(`ckpt:${id}`)]);
  // Prefer whichever copy (this device or the shared server brain) has learned more.
  const ck = serverCk && (!localCk || (serverCk.steps || 0) >= (localCk.steps || 0)) ? serverCk : localCk;
  for (const r of rows || []) { const it = mkItem(r.raw ?? r); it.w = r.w ?? 1; corpus.push(it); norm.update(it.e); cats.update(space, it.raw); }
  if (ck && ck.T === T) {
    deserialize([...ae.params(), ...tf.params()], ck.weights);
    if (ck.norm) norm = Normaliser.from(ck.norm, T);
    hp = { ...hp, ...(ck.hp || {}) }; s.steps = ck.steps || 0; s.overfitEvents = ck.overfitEvents || 0;
    s.lossHistory = ck.lossHistory || []; s.log = ck.log || []; s.sources = ck.sources || [];
    s.lastCheckpointAt = ck.at || 0;
    log(`Woke up with ${corpus.length.toLocaleString()} remembered rows and ${s.steps.toLocaleString()} prior learning steps.`);
  } else log(corpus.length ? `Loaded ${corpus.length} historical rows; starting to learn.` : "Brain is empty — feed it cleaned historical datasets.");
  best = { val: Infinity, snap: snapshot(opt.params) };
  if (pool().length) calibrate();
  startLoop();
}

function pool(): Item[] { return corpus.length >= 30 ? corpus : [...corpus, ...temp]; }

function sample(items: Item[], wantVal: boolean): Item | null {
  const cand = items.length;
  for (let k = 0; k < 20; k++) {
    const it = items[(Math.random() * cand) | 0];
    if (!it) return null;
    if (it.val !== wantVal && items.length > 20) continue;
    if (Math.random() > it.w) continue;
    return it;
  }
  return items[(Math.random() * cand) | 0] ?? null;
}

function zvec(e: Encoded) { const x = new Float32Array(T); for (let j = 0; j < T; j++) x[j] = e.m[j] ? norm.z(j, e.t[j]) : 0; return x; }

/** One training example through both detectors. Returns [aeLoss, tfLoss]. */
function trainOne(it: Item): [number, number] {
  const x = zvec(it.e), m = it.e.m;
  // corruption (denoising) — drop & jitter some present values
  const xin = new Float32Array(T), min = new Uint8Array(T);
  for (let j = 0; j < T; j++) {
    if (!m[j]) continue;
    if (Math.random() < hp.noise) continue;
    min[j] = 1; xin[j] = x[j] + randn() * hp.noise * 0.3;
  }
  const out = ae.forward(xin, min, hp.dropout);
  const dout = new Float32Array(2 * T); let la = 0, np = 0;
  for (let j = 0; j < T; j++) if (m[j]) np++;
  for (let j = 0; j < T; j++) {
    if (m[j]) { const d = out[j] - x[j]; la += d * d; dout[j] = (2 * d) / Math.max(1, np); }
    const p = 1 / (1 + Math.exp(-out[T + j]));
    la += (0.3 * -(m[j] ? Math.log(p + 1e-7) : Math.log(1 - p + 1e-7))) / T;
    dout[T + j] = (0.3 * (p - m[j])) / T;
  }
  ae.backward(dout);
  const y = tf.forward(xin, min);
  const dy = new Float32Array(T); let lt = 0;
  for (let j = 0; j < T; j++) if (m[j]) { const d = y[j] - x[j]; lt += d * d; dy[j] = (2 * d) / Math.max(1, np); }
  tf.backward(dy);
  return [la / Math.max(1, np), lt / Math.max(1, np)];
}

function evalOne(it: Item) {
  const x = zvec(it.e), m = it.e.m;
  const ya = ae.forward(x, m, 0), yt = tf.forward(x, m);
  let la = 0, lt = 0, n = 0;
  const errs = new Float32Array(T);
  for (let j = 0; j < T; j++) if (m[j]) { const a = (ya[j] - x[j]) ** 2, t = (yt[j] - x[j]) ** 2; la += a; lt += t; errs[j] = (a + t) / 2; n++; }
  return { la: la / Math.max(1, n), lt: lt / Math.max(1, n), errs, ya, yt, x };
}

function step(batch = 16) {
  const P = pool(); if (P.length < 8) return false;
  opt.zero(); let la = 0, lt = 0, n = 0;
  for (let b = 0; b < batch; b++) { const it = sample(P, false); if (!it) continue; const [a, t] = trainOne(it); la += a; lt += t; n++; }
  if (!n) return false;
  opt.step(hp.lr, hp.wd, 1 / n);
  s.steps++;
  const tl = (la + lt) / (2 * n);
  s.trainLoss = s.trainLoss ? s.trainLoss * 0.95 + tl * 0.05 : tl;
  s.aeLoss = la / n; s.tfLoss = lt / n;
  if (s.steps % 25 === 0) validate();
  if (s.steps % 200 === 0) calibrate();
  return true;
}

function valSet(): Item[] {
  const P = pool(); const v = P.filter((i) => i.val);
  return (v.length >= 10 ? v : P).slice(0, 256);
}

function validate() {
  const V = valSet(); if (!V.length) return;
  let tot = 0;
  for (const it of V) { const r = evalOne(it); tot += (r.la + r.lt) / 2; }
  const vl = tot / V.length; s.valLoss = vl;
  s.lossHistory.push({ t: s.steps, train: +s.trainLoss.toFixed(4), val: +vl.toFixed(4) });
  if (s.lossHistory.length > 300) s.lossHistory = s.lossHistory.filter((_, i) => i % 2 === 0);
  if (vl < best.val * 0.999) { best = { val: vl, snap: snapshot(opt.params) }; s.patience = 0; return; }
  s.patience++;
  const gap = vl / Math.max(s.trainLoss, 1e-6);
  if (s.patience >= 12 && gap > 1.25) {
    // Overfitting guard: roll back to best generalising weights, regularise harder.
    restore(opt.params, best.snap);
    hp.wd = Math.min(0.05, hp.wd * 1.6); hp.noise = Math.min(0.4, hp.noise + 0.04);
    hp.dropout = Math.min(0.35, hp.dropout + 0.03); hp.lr = Math.max(0.0002, hp.lr * 0.7);
    s.overfitEvents++; s.patience = 0;
    log(`Overfitting detected (val/train ${gap.toFixed(2)}×). Restored best weights; weight decay→${hp.wd.toFixed(4)}, noise→${hp.noise.toFixed(2)}.`);
  } else if (s.patience >= 20) {
    hp.lr = Math.max(0.0002, hp.lr * 0.8); s.patience = 0; // plateau → consolidate
  }
}

function q(arr: number[], p: number) { if (!arr.length) return 1; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; }

function calibrate() {
  const V = valSet(); if (!V.length) return;
  const per: number[][] = Array.from({ length: T }, () => []);
  const evals = V.map((it) => { const r = evalOne(it); for (let j = 0; j < T; j++) if (it.e.m[j]) per[j].push(r.errs[j]); return r; });
  cal.colScale = per.map((a) => Math.max(q(a, 0.99), 0.02));
  const rows = evals.map((r, i) => rowScore(r.errs, V[i].e.m));
  cal.rowQ95 = Math.max(q(rows, 0.95), 0.5); cal.rowQ995 = Math.max(q(rows, 0.995), cal.rowQ95 * 1.2);
  const catS: Record<string, number[]> = {};
  for (const it of V) for (const [c, k] of cats.keys(space, it.raw)) if (k) (catS[c] ||= []).push(cats.surprise(c, k));
  cal.catScale = Object.fromEntries(Object.entries(catS).map(([c, a]) => [c, q(a, 0.99)]));
  cal.ready = true;
}
function rowScore(errs: Float32Array, m: Uint8Array) {
  const sc: number[] = [];
  for (let j = 0; j < T; j++) if (m[j]) sc.push(errs[j] / (cal.colScale[j] || 1));
  sc.sort((a, b) => b - a);
  const top = sc.slice(0, 3); return top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
}

/** "Thinking" with no new data: review remembered rows; distrust implausible ones. */
function selfReview() {
  if (!cal.ready || corpus.length < 50) return;
  let down = 0;
  for (let k = 0; k < 200; k++) {
    const it = corpus[(Math.random() * corpus.length) | 0];
    const r = evalOne(it); const rs = rowScore(r.errs, it.e.m);
    const nw = rs > cal.rowQ995 ? 0.25 : rs > cal.rowQ95 ? 0.6 : 1;
    if (nw < it.w) down++;
    it.w = it.w * 0.7 + nw * 0.3;
  }
  s.reviewedDown += down;
}

async function checkpoint() {
  if (!mda) return;
  const at = Date.now();
  const drop = isFinite(s.minuteStartVal) ? s.minuteStartVal - s.valLoss : 0;
  log(`Knowledge update: ${s.newSinceMinute ? `absorbed ${s.newSinceMinute} new rows, ` : "no new data — kept thinking, "}val loss ${s.valLoss.toFixed(4)}${drop ? ` (${drop > 0 ? "↓" : "↑"}${Math.abs(drop).toFixed(4)})` : ""}.`);
  s.newSinceMinute = 0; s.minuteStartVal = s.valLoss;
  const ckData = {
    T, at, weights: serialize(best.snap.length && best.val <= s.valLoss ? (restoreTmp()) : opt.params).map((a) => a.map((v) => Math.round(v * 1e5) / 1e5)),
    norm: norm.toJSON(), hp, steps: s.steps, overfitEvents: s.overfitEvents,
    lossHistory: s.lossHistory.slice(-150), log: s.log.slice(0, 30), sources: s.sources.slice(0, 30),
  };
  await idbSet(`ckpt:${mda}`, ckData);
  post({ type: "checkpoint", data: ckData, steps: s.steps, valLoss: s.valLoss, corpusRows: corpus.length, columns: T });
  s.lastCheckpointAt = at;
}
// Persist the best-generalising weights, not merely the latest.
function restoreTmp() {
  const cur = snapshot(opt.params); restore(opt.params, best.snap);
  const out = opt.params.map((p) => ({ ...p, w: Float32Array.from(p.w) }));
  restore(opt.params, cur); return out as any;
}

let lastStats = 0, lastMinute = Date.now(), lastReview = Date.now();
function loop() {
  const budget = hidden ? 8 : 28, t0 = performance.now();
  if (running) while (performance.now() - t0 < budget) { if (!step()) break; }
  const now = Date.now();
  if (running && now - lastReview > 15000) { selfReview(); lastReview = now; }
  if (now - lastMinute > 60000) { lastMinute = now; checkpoint(); }
  if (now - lastStats > 1000) { lastStats = now; post({ type: "stats", stats: stats() }); }
  loopTimer = setTimeout(loop, hidden ? 400 : 70);
}
function startLoop() { if (loopTimer) clearTimeout(loopTimer); lastMinute = Date.now(); s.minuteStartVal = s.valLoss; loop(); }

function stats(): BrainStats {
  const P = pool();
  const state: BrainStats["state"] = P.length < 8 ? "cold" : !running ? "paused" : s.patience === 0 && s.overfitEvents && s.log[0]?.includes("Overfitting") ? "overfit-guard" : hp.lr < BASE_LR * 0.5 ? "consolidating" : "learning";
  return {
    mda: mda!, steps: s.steps, corpusRows: corpus.length, bootstrapRows: corpus.length >= 30 ? 0 : temp.length,
    trainRows: P.filter((i) => !i.val).length, valRows: P.filter((i) => i.val).length,
    trainLoss: s.trainLoss, valLoss: s.valLoss, bestVal: isFinite(best.val) ? best.val : 0, aeLoss: s.aeLoss, tfLoss: s.tfLoss,
    lr: hp.lr, weightDecay: hp.wd, noise: hp.noise, dropout: hp.dropout, overfitEvents: s.overfitEvents,
    lastCheckpointAt: s.lastCheckpointAt, lossHistory: s.lossHistory.slice(-150), log: s.log.slice(0, 25),
    sources: s.sources, state, ready: cal.ready, running, distrustedRows: s.reviewedDown, columns: T,
  };
}

async function addCorpus(rows: Record<string, any>[], source: string) {
  if (!mda) return;
  let added = 0;
  const seen = new Set(corpus.map((c) => c.e.hash));
  for (const r of rows) {
    const it = mkItem(r);
    if (seen.has(it.e.hash) || !it.e.m.some((x) => x)) continue;
    seen.add(it.e.hash); corpus.push(it); norm.update(it.e); cats.update(space, r); added++;
  }
  if (corpus.length > MAX_CORPUS) corpus.splice(0, corpus.length - MAX_CORPUS);
  s.sources.unshift({ name: source, rows: added, at: new Date().toISOString() }); s.sources = s.sources.slice(0, 100);
  s.newSinceMinute += added;
  if (added) hp.lr = Math.max(hp.lr, BASE_LR * 0.5); // warm up again for new knowledge
  log(`Learned from "${source}": ${added} new cleaned rows (${rows.length - added} duplicates skipped). Memory: ${corpus.length.toLocaleString()} rows.`);
  await idbSet(`corpus:${mda}`, corpus.map((c) => ({ raw: c.raw, w: c.w })));
  post({ type: "stats", stats: stats() });
}

function scoreRows(rows: Record<string, any>[]): ScoredRow[] {
  if (corpus.length < 30) {
    // Self-referenced bootstrap: learn "normal" from the file itself (anomalies are the minority).
    temp = rows.map(mkItem);
    for (const it of temp) { norm.update(it.e); cats.update(space, it.raw); }
    const steps = Math.min(600, 150 + rows.length);
    for (let i = 0; i < steps; i++) step();
  }
  validate(); calibrate();
  const Tn = space.numeric;
  return rows.map((raw) => {
    const e = encodeRow(space, raw);
    const r = evalOne({ raw, e, val: false, w: 1 });
    const pres = ae.forward(r.x, e.m, 0);
    const cells: ScoredCell[] = [];
    const sugg = (j: number) => inverse(Tn[j], norm.unz(j, (r.ya[j] + r.yt[j]) / 2));
    for (let j = 0; j < T; j++) {
      const col = Tn[j].key, orig = raw[col];
      if (e.bad[j]) { cells.push({ col, kind: "unreadable", severity: "high", score: 3, original: orig, suggested: sugg(j), message: `"${orig}" could not be read as ${Tn[j].type}; the model reconstructs ≈ ${sugg(j)} from the rest of the row.` }); continue; }
      if (!e.m[j]) {
        const p = 1 / (1 + Math.exp(-pres[T + j]));
        if (p > 0.9) cells.push({ col, kind: "missing", severity: p > 0.98 ? "high" : "warning", score: p * 2, original: orig, suggested: sugg(j), message: `Blank, but ${Math.round(p * 100)}% of learned normal rows fill ${col}; model expects ≈ ${sugg(j)}.` });
        continue;
      }
      const sc = r.errs[j] / (cal.colScale[j] || 1);
      if (sc > 1) cells.push({
        col, kind: "reconstruction", severity: sc > 6 ? "critical" : sc > 2.5 ? "high" : "warning", score: sc,
        original: orig, suggested: sugg(j),
        message: `${col} = ${orig} does not reconstruct from the rest of the row (model expects ≈ ${sugg(j)}; error ${sc.toFixed(1)}× the learned normal).`,
      });
    }
    for (const [c, k] of cats.keys(space, raw)) {
      if (!k) continue;
      const su = cats.surprise(c, k), scale = cal.catScale[c] ?? su + 1;
      if (su > scale * 1.05) {
        const unseen = !cats.seen(c, k);
        const col = c.includes("→") ? c.split("→")[1] : c;
        const mode = !c.includes("→") ? cats.mode(c) : null;
        cells.push({ col, kind: "category", severity: unseen ? "high" : "warning", score: su / Math.max(scale, 0.1), original: raw[col], suggested: undefined, message: `${unseen ? "Never seen" : "Rare"} ${c} value "${isBlank(raw[col]) ? k : raw[col]}" compared with learned normal data${mode ? ` (most common: "${mode}")` : ""}.` });
      }
    }
    const rs = rowScore(r.errs, e.m);
    cells.sort((a, b) => b.score - a.score);
    return { rowScore: rs, rowQ95: cal.rowQ95, rowQ995: cal.rowQ995, cells };
  });
}

self.onmessage = async (ev: MessageEvent) => {
  const m = ev.data;
  try {
    if (m.type === "init") { lastCustom = m.config; await init(m.mda, m.config, m.serverCkpt); }
    else if (m.type === "checkpointNow") await checkpoint();
    else if (m.type === "addCorpus") await addCorpus(m.rows, m.source);
    else if (m.type === "score") post({ type: "scored", id: m.id, rows: scoreRows(m.rows) });
    else if (m.type === "setRunning") { running = m.on; post({ type: "stats", stats: stats() }); }
    else if (m.type === "hidden") hidden = m.hidden;
    else if (m.type === "reset" && mda) { await idbDel(`corpus:${mda}`); await idbDel(`ckpt:${mda}`); await init(mda, lastCustom); }
  } catch (e: any) {
    post({ type: "error", id: m.id, message: e?.message || String(e) });
  }
};
