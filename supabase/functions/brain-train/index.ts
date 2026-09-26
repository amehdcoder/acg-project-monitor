// Unattended Record quality brain trainer. Called every 30 minutes by the
// scheduler. For each shared brain that has already learned past a threshold,
// it resumes from the saved checkpoint, trains for a bounded time slice on the
// module's current beneficiary records, and saves the cumulative result.
// Returns only counts — no record data leaves this function.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { encodeRow, featureSpace, Normaliser, type ColumnDef, type Encoded } from "../_shared/brain/features.ts";
import { AdamW, ColumnTransformer, DenoisingAutoencoder, deserialize, randn, restore, serialize, snapshot } from "../_shared/brain/models.ts";

const MIN_STEPS = 5000;      // "learned to a certain level" before unattended training starts
const MAX_BRAINS = 3;        // bounded work per run
const SLICE_MS = 1200;       // training time per brain (keeps within the function CPU budget)
const SKIP = /phone|tel|mobile|nin|uuid|photo|image|url|signature|name|email|address|note|comment|^id$|_id$|password|code$/i;

// Must mirror flatten() in src/components/ProgrammeModule/BeneficiaryBrainPanel.tsx
function flatten(b: any): Record<string, any> {
  const r: Record<string, any> = {
    State: b.state ?? "", LGA: b.lga ?? "", Ward: b.ward ?? "", Village: b.village ?? "",
    Status: b.status ?? "", "Risk level": b.risk_level ?? "",
    Latitude: b.latitude, Longitude: b.longitude,
    "Registered on": b.created_at?.slice(0, 10), "Next follow-up": b.next_follow_up_date,
  };
  for (const [k, v] of Object.entries(b.profile || {})) {
    if (v === null || v === undefined || typeof v === "object" || SKIP.test(k)) continue;
    r[`p:${k}`] = v;
  }
  return r;
}

function trainBrain(ck: any, rows: Record<string, any>[]) {
  const columns: ColumnDef[] = String(ck.colSig || "").split("|").filter(Boolean).map((s) => {
    const i = s.lastIndexOf(":"); return { key: s.slice(0, i), type: s.slice(i + 1) };
  });
  const space = featureSpace({ columns } as any);
  const T = space.numeric.length;
  if (!T || T !== ck.T) return null;
  const ae = new DenoisingAutoencoder(T), tf = new ColumnTransformer(T);
  const opt = new AdamW([...ae.params(), ...tf.params()]);
  if (!deserialize(opt.params, ck.weights)) return null;
  const norm = Normaliser.from(ck.norm, T);
  const hp = { lr: 0.003, wd: 0.001, noise: 0.15, dropout: 0.1, ...(ck.hp || {}) };
  const items = rows.map((r) => encodeRow(space, r)).filter((e) => e.m.some((x) => x));
  if (items.length < 8) return null;
  const isVal = (e: Encoded) => (e.hash % 100) < 15;
  const train = items.filter((e) => !isVal(e)), val = items.filter(isVal);
  const V = (val.length >= 5 ? val : items).slice(0, 256), Tr = train.length >= 5 ? train : items;
  const zvec = (e: Encoded) => { const x = new Float32Array(T); for (let j = 0; j < T; j++) x[j] = e.m[j] ? norm.z(j, e.t[j]) : 0; return x; };
  const valLoss = () => {
    let tot = 0;
    for (const e of V) {
      const x = zvec(e), ya = ae.forward(x, e.m, 0), yt = tf.forward(x, e.m);
      let a = 0, t = 0, n = 0;
      for (let j = 0; j < T; j++) if (e.m[j]) { a += (ya[j] - x[j]) ** 2; t += (yt[j] - x[j]) ** 2; n++; }
      tot += (a + t) / 2 / Math.max(1, n);
    }
    return tot / V.length;
  };
  let best = valLoss(); const start = best; let bestSnap = snapshot(opt.params);
  let steps = 0; const t0 = Date.now(); let trainLoss = 0;
  while (Date.now() - t0 < SLICE_MS) {
    opt.zero(); let tl = 0;
    for (let b = 0; b < 16; b++) {
      const e = Tr[(Math.random() * Tr.length) | 0], x = zvec(e), m = e.m;
      const xin = new Float32Array(T), min = new Uint8Array(T); let np = 0;
      for (let j = 0; j < T; j++) { if (!m[j]) continue; np++; if (Math.random() < hp.noise) continue; min[j] = 1; xin[j] = x[j] + randn() * hp.noise * 0.3; }
      const out = ae.forward(xin, min, hp.dropout), dout = new Float32Array(2 * T);
      for (let j = 0; j < T; j++) {
        if (m[j]) { const d = out[j] - x[j]; tl += d * d / Math.max(1, np); dout[j] = (2 * d) / Math.max(1, np); }
        const p = 1 / (1 + Math.exp(-out[T + j])); dout[T + j] = (0.3 * (p - m[j])) / T;
      }
      ae.backward(dout);
      const y = tf.forward(xin, min), dy = new Float32Array(T);
      for (let j = 0; j < T; j++) if (m[j]) { const d = y[j] - x[j]; dy[j] = (2 * d) / Math.max(1, np); }
      tf.backward(dy);
    }
    opt.step(hp.lr, hp.wd, 1 / 16); steps++; trainLoss = tl / 16;
    if (steps % 25 === 0) { const v = valLoss(); if (v < best) { best = v; bestSnap = snapshot(opt.params); } }
  }
  const end = valLoss();
  if (end < best) { best = end; bestSnap = snapshot(opt.params); }
  restore(opt.params, bestSnap); // only keep weights that generalise at least as well as before
  const totalSteps = (ck.steps || 0) + steps;
  const history = [...(ck.lossHistory || []), { t: totalSteps, train: +trainLoss.toFixed(4), val: +best.toFixed(4) }].slice(-150);
  const log = [`${new Date().toISOString().slice(11, 19)} — Server session: ${steps} steps on ${items.length} records while no one was online; held-out error ${start.toFixed(4)} → ${best.toFixed(4)}.`, ...(ck.log || [])].slice(0, 30);
  return {
    checkpoint: { ...ck, at: Date.now(), steps: totalSteps, lossHistory: history, log,
      weights: serialize(opt.params).map((a) => a.map((v) => Math.round(v * 1e5) / 1e5)) },
    steps, totalSteps, valLoss: best, rows: items.length,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: claimed, error } = await admin.rpc("claim_brain_for_training", { _min_steps: MIN_STEPS, _limit: MAX_BRAINS });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const results: any[] = [];
  for (const bm of (claimed as any[]) || []) {
    try {
      const rows: any[] = [];
      for (let from = 0; from < 20000; from += 1000) {
        const { data } = await admin.from("beneficiaries").select("state,lga,ward,village,status,risk_level,latitude,longitude,created_at,next_follow_up_date,profile")
          .eq("module_id", bm.module_id).order("created_at").range(from, from + 999);
        if (!data?.length) break; rows.push(...data); if (data.length < 1000) break;
      }
      const r = trainBrain(bm.checkpoint, rows.map(flatten));
      const patch: any = { server_trained_at: new Date().toISOString(), server_lease_until: null };
      if (r) Object.assign(patch, { checkpoint: r.checkpoint, steps: r.totalSteps, val_loss: r.valLoss, corpus_rows: r.rows, server_steps: (bm.server_steps || 0) + r.steps });
      await admin.from("brain_models").update(patch).eq("brain_key", bm.brain_key);
      results.push({ brain: bm.brain_key.slice(0, 20), trained: r?.steps ?? 0 });
    } catch (e) {
      await admin.from("brain_models").update({ server_lease_until: null }).eq("brain_key", bm.brain_key);
      results.push({ brain: bm.brain_key.slice(0, 20), error: String((e as Error).message ?? e) });
    }
  }
  return new Response(JSON.stringify({ trained: results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
