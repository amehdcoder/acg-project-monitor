/**
 * useAmehnitiesBrain — owns the Amehnities AI Transformer worker.
 *
 * Responsibilities:
 *  - boot the worker + model
 *  - load the bounded activity corpus (restricted to the enabled sources) and
 *    stream live events into it
 *  - keep training strictly off the main thread and paused when the tab/page
 *    is not visible, so the rest of the app never slows down
 *  - expose checkpoint export/import plus an inference API for the UI
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildCheckpointFile, downloadCheckpoint, parseCheckpointFile, toWorkerCheckpoint, validateCheckpoint,
  type CheckpointFile, type CheckpointIssue,
} from "@/lib/amehnitiesAi/checkpoint";
import {
  ACTIVITY_SOURCES, Tokenizer, encodeEvent, encodeEvents, encodeWebPassage, loadActivityCorpus,
  syntheticCorpus, WEB_SOURCE_LABEL, type ActivityEvent, type WebPassage,
} from "@/lib/amehnitiesAi/activityStream";
import { indexMemory } from "@/lib/amehnitiesAi/frontierClient";

export interface MetricSample {
  at: number; step: number; loss: number; gradNorm: number;
  tokensPerSec: number; stepsPerSec: number; entropy: number; tokensSeen: number;
}

export interface EvalSample {
  at: number; step: number; loss: number; perplexity: number;
  accuracy: number; top5: number; confidence: number; windows: number;
}

export interface DivergenceAlert {
  at: number; reason: string; title: string; detail: string;
  metrics: Record<string, number>; suggestions: string[];
}

export interface Telemetry {
  structural?: boolean;
  cfg: { dModel: number; nHeads: number; nLayers: number; dFF: number; ctx: number; vocab: number; lr: number; batch: number };
  params: number;
  step: number;
  loss: number;
  perplexity: number;
  lossHistory: number[];
  attention: number[][];
  headEntropy: number[];
  layerEnergy: number[];
  weightNorms: { q: number; k: number; v: number; o: number; ff: number }[];
  top: { id: number; p: number }[];
  tokensSeen: number;
  streamSize: number;
  ctx: number;
  gradNorm: number;
  tokensPerSec: number;
  stepsPerSec: number;
  entropy: number;
  metrics: MetricSample[];
  running: boolean;
  evaluation: EvalSample | null;
  evalSeries: EvalSample[];
  evalEnabled: boolean;
  guardEnabled: boolean;
  alert: DivergenceAlert | null;
  trainTokens: number;
  valTokens: number;
  /** Autonomous capacity growth ("neurogenesis"). */
  plasticity?: boolean;
  growth?: { at: number; reason: string; from: number; to: number; cfg: Telemetry["cfg"] }[];
  maxParams?: number;
}

export interface QueryResult {
  prompt: number[];
  predictions: { id: number; p: number; entropy: number; alternatives: { id: number; p: number }[] }[];
  evidence: { token: number; weight: number }[];
  step: number;
  loss: number;
}

export interface CheckpointRecord {
  id: string;
  createdAt: string;
  step: number;
  loss: number;
  params: number;
  bytes: number;
  withOptimizer: boolean;
  file: CheckpointFile;
  /** Auto-saved best-checkpoint metadata (absent for manual exports). */
  auto?: boolean;
  score?: number;
  valLoss?: number;
  accuracy?: number;
  confidence?: number;
}

/** How an auto-saved checkpoint is judged to be "the best so far". */
export type BestMetric = "loss" | "confidence";

const SOURCE_LABELS = ACTIVITY_SOURCES.map((s) => s.label);

export function useAmehnitiesBrain() {
  const workerRef = useRef<Worker | null>(null);
  const tokenizerRef = useRef(new Tokenizer(1024));
  const lastAtRef = useRef<number | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [running, setRunning] = useState(true);
  const [budget, setBudget] = useState(12);
  const [feed, setFeed] = useState<ActivityEvent[]>([]);
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const [corpusReady, setCorpusReady] = useState(false);
  const checkpointWaiters = useRef<((payload: any) => void)[]>([]);
  const queryWaiters = useRef<Map<string, (payload: any) => void>>(new Map());
  const [synthetic, setSynthetic] = useState(false);
  const [enabledSources, setEnabledSources] = useState<string[]>(SOURCE_LABELS);
  const [checkpoints, setCheckpoints] = useState<CheckpointRecord[]>([]);
  const [bestCheckpoints, setBestCheckpoints] = useState<CheckpointRecord[]>([]);
  const [autoSave, setAutoSave] = useState(true);
  const [bestMetric, setBestMetric] = useState<BestMetric>("loss");
  const [autoSaving, setAutoSaving] = useState(false);
  const lastEvalAtRef = useRef(0);
  const bestScoreRef = useRef<number | null>(null);
  const enabledRef = useRef(enabledSources);
  enabledRef.current = enabledSources;
  // Continuous learning from the public-health / M&E literature on the web.
  const [webLearning, setWebLearning] = useState(true);
  const [webStats, setWebStats] = useState({ passages: 0, lastAt: 0 as number, topic: "" });
  const webCursor = useRef(0);
  const runningRef = useRef(true);
  const telemetryRef = useRef<Telemetry | null>(null);


  // ---- worker lifecycle
  useEffect(() => {
    const w = new Worker(new URL("../workers/amehnitiesTransformer.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    w.onmessage = (e: MessageEvent) => {
      const d = e.data;
      if (d?.type === "telemetry") { telemetryRef.current = d as Telemetry; setTelemetry(d as Telemetry); }
      else if (d?.type === "checkpoint") {
        const waiters = checkpointWaiters.current;
        checkpointWaiters.current = [];
        waiters.forEach((r) => r(d));
      } else if (d?.type === "query") {
        const resolve = queryWaiters.current.get(d.id);
        if (resolve) { queryWaiters.current.delete(d.id); resolve(d); }
      }
    };
    w.postMessage({ type: "init", cfg: { dModel: 64, nHeads: 4, nLayers: 4, dFF: 256, ctx: 32, vocab: 256, lr: 3e-3, batch: 1 } });
    w.postMessage({ type: "run", running: true });
    return () => { w.postMessage({ type: "run", running: false }); w.terminate(); workerRef.current = null; };
  }, []);

  // ---- corpus (reloaded whenever the enabled source mix changes)
  useEffect(() => {
    let cancelled = false;
    setCorpusReady(false);
    (async () => {
      const tk = tokenizerRef.current;
      const sources = ACTIVITY_SOURCES.filter((s) => enabledSources.includes(s.label));
      const corpus = sources.length ? await loadActivityCorpus(tk, 400, sources) : { events: [], tokens: [] as number[] };
      if (cancelled) return;
      let events = corpus.events;
      let tokens = corpus.tokens;
      if (sources.length && events.length < 80) {
        setSynthetic(true);
        events = [...syntheticCorpus(tk).filter((e) => enabledSources.includes(e.source)), ...events].sort((a, b) => a.at - b.at);
        tokens = encodeEvents(tk, events);
      } else {
        setSynthetic(false);
      }
      lastAtRef.current = events.length ? events[events.length - 1].at : null;
      const counts: Record<string, number> = {};
      for (const e of events) counts[e.source] = (counts[e.source] || 0) + 1;
      setSourceCounts(counts);
      setFeed(events.slice(-40).reverse());
      workerRef.current?.postMessage({ type: "tokens", tokens, vocabSize: tk.size, replace: true });
      setCorpusReady(true);
    })();
    return () => { cancelled = true; };
  }, [enabledSources]);

  // ---- live event feed (realtime → tokens, continuously)
  useEffect(() => {
    const channel = supabase.channel("amehnities-ai-brain");
    for (const s of ACTIVITY_SOURCES) {
      channel.on("postgres_changes", { event: "INSERT", schema: "public", table: s.table }, (payload: any) => {
        if (!enabledRef.current.includes(s.label)) return;
        const row = payload?.new || {};
        const at = new Date(row[s.timeColumn] ?? Date.now()).getTime();
        const ev: ActivityEvent = {
          source: s.label,
          kind: s.kindColumn ? row[s.kindColumn] : undefined,
          at: Number.isFinite(at) ? at : Date.now(),
        };
        const tokens = encodeEvent(tokenizerRef.current, ev, lastAtRef.current);
        lastAtRef.current = ev.at;
        workerRef.current?.postMessage({ type: "tokens", tokens, vocabSize: tokenizerRef.current.size });
        setFeed((f) => [ev, ...f].slice(0, 40));
        setSourceCounts((c) => ({ ...c, [ev.source]: (c[ev.source] || 0) + 1 }));
      });
    }
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ---- never burn CPU while hidden
  useEffect(() => {
    const onVis = () => workerRef.current?.postMessage({ type: "run", running: running && !document.hidden });
    document.addEventListener("visibilitychange", onVis);
    onVis();
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [running]);

  useEffect(() => { workerRef.current?.postMessage({ type: "budget", ms: budget }); }, [budget]);
  useEffect(() => { runningRef.current = running; }, [running]);

  /* ---- continuous learning from the internet -----------------------------
   * Every couple of minutes a small batch of public-health / M&E literature is
   * retrieved, tokenised into the same live training stream the app events
   * feed, AND written into the assistant's long-term vector memory so the chat
   * answers improve from exactly what the network just learned. */
  useEffect(() => {
    if (!webLearning) return;
    let cancelled = false;

    const pull = async () => {
      if (cancelled || document.hidden || !runningRef.current) return;
      try {
        const { data, error } = await supabase.functions.invoke("ai-web-stream", {
          body: { cursor: webCursor.current, count: 2 },
        });
        if (error || cancelled) return;
        const passages = (data?.passages ?? []) as (WebPassage & { topic?: string })[];
        webCursor.current = Number(data?.cursor ?? webCursor.current + 2);
        if (!passages.length) return;

        const tk = tokenizerRef.current;
        const tokens: number[] = [];
        const events: ActivityEvent[] = [];
        const now = Date.now();
        passages.forEach((p, i) => {
          tokens.push(...encodeWebPassage(tk, p, now + i));
          events.push({ source: WEB_SOURCE_LABEL, kind: p.publisher, at: now + i });
        });
        workerRef.current?.postMessage({ type: "tokens", tokens, vocabSize: tk.size });
        setFeed((f) => [...events.reverse(), ...f].slice(0, 40));
        setSourceCounts((c) => ({ ...c, [WEB_SOURCE_LABEL]: (c[WEB_SOURCE_LABEL] || 0) + passages.length }));
        setWebStats((s) => ({ passages: s.passages + passages.length, lastAt: now, topic: passages[0]?.topic ?? s.topic }));

        // feed what was learned into the chat knowledge base
        await indexMemory(passages.map((p) => ({
          kind: "web_knowledge",
          title: p.title,
          content: `${p.title}\n${p.snippet}`,
          metadata: { url: p.url, publisher: p.publisher, year: p.year, topic: p.topic },
        }))).catch(() => undefined);
      } catch { /* the brain never breaks the page over a knowledge pull */ }
    };

    void pull();
    const id = setInterval(() => void pull(), 120_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [webLearning]);

  /* ---- consolidation: push what the network has learned into chat memory --- */
  useEffect(() => {
    const consolidate = async () => {
      const t = telemetryRef.current;
      if (!t || document.hidden || !runningRef.current || !(t.loss > 0)) return;
      const top = (t.top || []).slice(0, 5)
        .map((x) => `${tokenizerRef.current.vocab[x.id] ?? `token#${x.id}`} (${(x.p * 100).toFixed(1)}%)`)
        .join(", ");
      await indexMemory([{
        kind: "brain_state",
        title: `Amehnities neural state — step ${t.step}`,
        content:
          `The in-app Transformer now holds ${t.params.toLocaleString()} parameters across ${t.cfg.nLayers} blocks ` +
          `(${t.cfg.nHeads} heads, d_model ${t.cfg.dModel}, context ${t.cfg.ctx}). ` +
          `Loss ${t.loss.toFixed(3)}, perplexity ${t.perplexity.toFixed(2)}, ` +
          `${t.tokensSeen.toLocaleString()} activity tokens seen.` +
          (top ? ` Most likely next app events: ${top}.` : "") +
          (t.evaluation ? ` Held-out accuracy ${(t.evaluation.accuracy * 100).toFixed(1)}%.` : ""),
        source_id: "amehnities-brain-state",
        metadata: { step: t.step, params: t.params, loss: t.loss, perplexity: t.perplexity },
      }]).catch(() => undefined);
    };
    const id = setInterval(() => void consolidate(), 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  // The guardrail pauses training inside the worker; mirror that in UI state so
  // the controls (and the visibility watcher) never silently resume a diverged run.
  useEffect(() => {
    if (telemetry?.alert) setRunning(false);
  }, [telemetry?.alert?.at]);

  const toggleSource = useCallback((label: string) => {
    setEnabledSources((cur) => (cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]));
  }, []);
  const setAllSources = useCallback((on: boolean) => setEnabledSources(on ? SOURCE_LABELS : []), []);

  /** Ask the worker for a full snapshot of weights + optimiser + training state. */
  const captureCheckpoint = useCallback((includeOptimizer = true) => {
    const w = workerRef.current;
    if (!w) return Promise.reject(new Error("Model is not running"));
    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Checkpoint timed out")), 15000);
      checkpointWaiters.current.push((payload) => { clearTimeout(timeout); resolve(payload); });
      w.postMessage({ type: "checkpoint", includeOptimizer });
    });
  }, []);

  /** Capture and download the checkpoint as a portable .amz.json file. */
  const exportCheckpoint = useCallback(async (includeOptimizer = true) => {
    const payload = await captureCheckpoint(includeOptimizer);
    const file = buildCheckpointFile(payload, tokenizerRef.current.vocab);
    if (payload.shapes) file.shapes = payload.shapes;
    const bytes = downloadCheckpoint(file);
    setCheckpoints((c) => [
      {
        id: `${file.createdAt}-${file.training.step}`,
        createdAt: file.createdAt,
        step: file.training.step,
        loss: file.training.loss,
        params: file.training.paramCount,
        bytes,
        withOptimizer: !!file.optimizer,
        file,
      },
      ...c,
    ].slice(0, 12));
    return { file, bytes };
  }, [captureCheckpoint]);

  /** Snapshot the current weights into memory (no download) — used by auto-save. */
  const snapshotCheckpoint = useCallback(async (meta: Partial<CheckpointRecord>) => {
    const payload = await captureCheckpoint(true);
    const file = buildCheckpointFile(payload, tokenizerRef.current.vocab);
    if (payload.shapes) file.shapes = payload.shapes;
    const rec: CheckpointRecord = {
      id: `auto-${file.createdAt}-${file.training.step}`,
      createdAt: file.createdAt,
      step: file.training.step,
      loss: file.training.loss,
      params: file.training.paramCount,
      bytes: JSON.stringify(file).length,
      withOptimizer: !!file.optimizer,
      file,
      auto: true,
      ...meta,
    };
    return rec;
  }, [captureCheckpoint]);

  /**
   * Auto-save the best-performing checkpoints.
   *
   * Every time a fresh held-out evaluation lands, the run is scored (lowest
   * validation loss or highest prediction confidence). Only genuine
   * improvements are kept, and at most five snapshots are retained.
   */
  useEffect(() => {
    const ev = telemetry?.evaluation;
    if (!autoSave || !ev || autoSaving) return;
    if (ev.at === lastEvalAtRef.current) return;
    lastEvalAtRef.current = ev.at;
    const score = bestMetric === "loss" ? -ev.loss : ev.confidence;
    if (!Number.isFinite(score)) return;
    const prev = bestScoreRef.current;
    // require a meaningful improvement so we don't churn on noise
    if (prev !== null && score <= prev + Math.abs(prev || 1) * 0.002) return;
    bestScoreRef.current = score;
    setAutoSaving(true);
    snapshotCheckpoint({
      score, valLoss: ev.loss, accuracy: ev.accuracy, confidence: ev.confidence,
    })
      .then((rec) => {
        setBestCheckpoints((cur) => {
          const next = [rec, ...cur].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
          return next.slice(0, 5);
        });
      })
      .catch(() => { /* a missed snapshot is never fatal — the next eval retries */ })
      .finally(() => setAutoSaving(false));
  }, [telemetry?.evaluation, autoSave, bestMetric, autoSaving, snapshotCheckpoint]);

  /** Switching the ranking metric re-baselines the "best so far" comparison. */
  const changeBestMetric = useCallback((m: BestMetric) => {
    setBestMetric(m);
    setBestCheckpoints((cur) => {
      const rescored = cur.map((c) => ({
        ...c,
        score: m === "loss" ? -(c.valLoss ?? c.loss) : (c.confidence ?? 0),
      })).sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
      bestScoreRef.current = rescored.length ? rescored[0].score ?? null : null;
      return rescored;
    });
  }, []);

  /** Roll the live model back to one of the auto-saved best checkpoints. */
  const rollbackTo = useCallback((id: string) => {
    const rec = [...bestCheckpoints, ...checkpoints].find((c) => c.id === id);
    if (!rec) throw new Error("That checkpoint is no longer available");
    workerRef.current?.postMessage({ type: "load", ckpt: toWorkerCheckpoint(rec.file) });
    bestScoreRef.current = rec.score ?? bestScoreRef.current;
    return rec;
  }, [bestCheckpoints, checkpoints]);

  /** Download an auto-saved best checkpoint. */
  const downloadBestCheckpoint = useCallback((id: string) => {
    const rec = bestCheckpoints.find((c) => c.id === id);
    if (!rec) throw new Error("Checkpoint no longer available");
    return downloadCheckpoint(rec.file);
  }, [bestCheckpoints]);

  const clearBestCheckpoints = useCallback(() => {
    setBestCheckpoints([]);
    bestScoreRef.current = null;
  }, []);

  /** Held-out evaluation controls. */
  const runEvaluation = useCallback((windows = 8) => {
    workerRef.current?.postMessage({ type: "eval", now: true, windows });
  }, []);
  const setEvalEnabled = useCallback((enabled: boolean) => {
    workerRef.current?.postMessage({ type: "eval", enabled });
  }, []);
  const setEvalInterval = useCallback((everyMs: number) => {
    workerRef.current?.postMessage({ type: "eval", everyMs });
  }, []);

  /** Divergence guardrails. */
  const setGuardEnabled = useCallback((enabled: boolean) => {
    workerRef.current?.postMessage({ type: "guard", enabled });
  }, []);
  const dismissAlert = useCallback(() => {
    workerRef.current?.postMessage({ type: "dismissAlert" });
  }, []);

  /** Re-download a checkpoint that was captured earlier in this session. */
  const downloadSavedCheckpoint = useCallback((id: string) => {
    const rec = checkpoints.find((c) => c.id === id);
    if (!rec) throw new Error("Checkpoint no longer available");
    return downloadCheckpoint(rec.file);
  }, [checkpoints]);

  /** Validate a checkpoint file without loading it. */
  const inspectCheckpoint = useCallback(async (f: File): Promise<{ file: CheckpointFile; issues: CheckpointIssue[] }> => {
    let text: string;
    try { text = await f.text(); } catch { throw new Error("Could not read the file"); }
    let file: CheckpointFile;
    try { file = JSON.parse(text) as CheckpointFile; }
    catch { throw new Error("This file is not valid JSON — expected an .amz.json checkpoint"); }
    return { file, issues: validateCheckpoint(file, telemetry?.cfg ?? null) };
  }, [telemetry]);

  /** Restore a previously exported checkpoint file (validated first). */
  const importCheckpoint = useCallback(async (f: File) => {
    const text = await f.text();
    let parsedFile: CheckpointFile;
    try { parsedFile = JSON.parse(text) as CheckpointFile; }
    catch { throw new Error("This file is not valid JSON — expected an .amz.json checkpoint"); }
    const issues = validateCheckpoint(parsedFile, telemetry?.cfg ?? null);
    const blocking = issues.filter((i) => i.level === "error");
    if (blocking.length) throw new Error(`${blocking[0].title}: ${blocking[0].detail}`);
    const { file, ckpt } = parseCheckpointFile(text);
    workerRef.current?.postMessage({ type: "load", ckpt });
    return file as CheckpointFile;
  }, [telemetry]);

  /** Run the model forward and return predictions with attention evidence. */
  const askModel = useCallback((steps = 6) => {
    const w = workerRef.current;
    if (!w) return Promise.reject(new Error("Model is not running"));
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise<QueryResult>((resolve, reject) => {
      const timeout = setTimeout(() => { queryWaiters.current.delete(id); reject(new Error("Inference timed out")); }, 15000);
      queryWaiters.current.set(id, (payload) => {
        clearTimeout(timeout);
        if (payload.error) reject(new Error(payload.error));
        else resolve(payload as QueryResult);
      });
      w.postMessage({ type: "query", id, steps });
    });
  }, []);

  /**
   * Apply hyper-parameters. Training is paused, the worker rebuilds/updates
   * safely (warm-starting weights unless a fresh restart is requested) and then
   * resumes — so a config change can never corrupt an in-flight step.
   */
  const applyConfig = useCallback(
    async (patch: { lr?: number; batch?: number; ctx?: number; budgetMs?: number }, opts?: { fresh?: boolean }) => {
      const w = workerRef.current;
      if (!w) return;
      const wasRunning = running;
      w.postMessage({ type: "run", running: false });
      await new Promise((r) => setTimeout(r, 60));
      if (patch.budgetMs !== undefined) { setBudget(patch.budgetMs); w.postMessage({ type: "budget", ms: patch.budgetMs }); }
      const { budgetMs: _omit, ...cfgPatch } = patch;
      if (Object.keys(cfgPatch).length) {
        w.postMessage(opts?.fresh ? { type: "restart", fresh: true, patch: cfgPatch } : { type: "config", patch: cfgPatch });
      } else if (opts?.fresh) {
        w.postMessage({ type: "restart", fresh: true });
      }
      await new Promise((r) => setTimeout(r, 60));
      if (wasRunning && !document.hidden) w.postMessage({ type: "run", running: true });
    },
    [running],
  );

  const grow = useCallback(() => workerRef.current?.postMessage({ type: "grow" }), []);
  const shrink = useCallback(() => workerRef.current?.postMessage({ type: "shrink" }), []);
  const toggle = useCallback(() => setRunning((r) => !r), []);

  const vocab = tokenizerRef.current.vocab;
  const predictions = useMemo(
    () => (telemetry?.top || []).map((t) => ({ label: vocab[t.id] ?? `token#${t.id}`, p: t.p })),
    [telemetry, vocab],
  );

  return {
    telemetry, running, toggle, budget, setBudget, grow, shrink, feed, sourceCounts,
    corpusReady, synthetic, predictions, vocab,
    allSources: SOURCE_LABELS, enabledSources, toggleSource, setAllSources,
    exportCheckpoint, importCheckpoint, inspectCheckpoint, applyConfig,
    checkpoints, downloadSavedCheckpoint, askModel,
    evaluation: telemetry?.evaluation ?? null,
    evalSeries: telemetry?.evalSeries ?? [],
    evalEnabled: telemetry?.evalEnabled ?? true,
    valTokens: telemetry?.valTokens ?? 0,
    trainTokens: telemetry?.trainTokens ?? 0,
    runEvaluation, setEvalEnabled, setEvalInterval,
    alert: telemetry?.alert ?? null,
    guardEnabled: telemetry?.guardEnabled ?? true,
    setGuardEnabled, dismissAlert,
    bestCheckpoints, autoSave, setAutoSave, bestMetric, setBestMetric: changeBestMetric,
    autoSaving, rollbackTo, downloadBestCheckpoint, clearBestCheckpoints,
  };
}
