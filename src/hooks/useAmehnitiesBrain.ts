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
import {
  clearBrain, clearVersions, deleteVersion, getVersion, listVersions, loadBrain, saveBrain, saveVersion,
  type ModelVersionMeta, type PersistenceStatus, type VersionTrigger,
} from "@/lib/amehnitiesAi/brainPersistence";
import {
  describeDataset, encodeDataset, type ParsedDataset, type TrainingExample,
} from "@/lib/amehnitiesAi/trainingDataset";
import {
  DEFAULT_GATE, describeVerdict, evaluateGate, holdoutSplit,
  type BenchmarkSample, type GateVerdict,
} from "@/lib/amehnitiesAi/evalHarness";
import { sanitizeTrainingPair } from "@/lib/amehnitiesAi/safetyPolicy";



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
  /** Backpropagation: measured ∂L/∂W per stage of the network. */
  gradFlow?: { embed: number; blocks: { attn: number; ffn: number }[]; head: number } | null;
  /** L2 norm of the last Adam weight update (gradient-descent step size). */
  updateNorm?: number;
  /** Gradient-clipping scale applied on the last step (1 = unclipped). */
  clipScale?: number;
  /** Number of optimiser (gradient-descent) updates applied. */
  optimSteps?: number;
  lr?: number;

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
  /** FFN activation currently used by the network. */
  activation?: "swish" | "gelu";
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

/** One completed supervised training run over an imported dataset. */
export interface DatasetRun {
  id: string; at: number; name: string; examples: number; epochs: number;
  tokens: number; format: string; startStep: number; endStep: number; loss: number;
  /** Examples withheld from training and used by the promotion gate. */
  holdout: number;
  /** Examples dropped / masked by the global safety policy. */
  droppedUnsafe: number;
  redactedExamples: number;
  /** Pre/post benchmark verdict — `promote:false` means the run was reverted. */
  gate: GateVerdict | null;
  promoted: boolean;
}


export type { ModelVersionMeta } from "@/lib/amehnitiesAi/brainPersistence";

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

  // ---- automatic, continuous persistence of everything the model learns
  const [persistence, setPersistence] = useState<PersistenceStatus>({
    supported: typeof indexedDB !== "undefined",
    savedAt: null, step: 0, params: 0, bytes: 0, restored: false, saving: false, error: null,
  });
  const restoredRef = useRef(false);
  const lastSavedStepRef = useRef(-1);
  const savingRef = useRef(false);
  const lastMemoryPushRef = useRef(0);

  // ---- versioning + dataset import
  const [versions, setVersions] = useState<ModelVersionMeta[]>([]);
  const [datasetTraining, setDatasetTraining] = useState(false);
  const [datasetRuns, setDatasetRuns] = useState<DatasetRun[]>([]);
  const lastVersionStepRef = useRef(-1);
  const persistNowRef = useRef<((opts?: { force?: boolean }) => Promise<void>) | null>(null);
  /** Pending holdout-benchmark requests, keyed by request id. */
  const benchmarkWaiters = useRef<Map<string, (s: BenchmarkSample | null) => void>>(new Map());






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
      } else if (d?.type === "benchmark") {
        const resolve = benchmarkWaiters.current.get(d.id);
        if (resolve) { benchmarkWaiters.current.delete(d.id); resolve(d.sample ?? null); }
      }
    };
    w.postMessage({ type: "init", cfg: { dModel: 64, nHeads: 4, nLayers: 4, dFF: 256, ctx: 32, vocab: 256, lr: 3e-3, batch: 1 } });
    w.postMessage({ type: "run", running: true });

    // Warm-start from the automatically persisted model, so everything learned
    // in previous sessions (weights, optimiser state, vocabulary, counters)
    // continues instead of restarting from scratch.
    void (async () => {
      const rec = await loadBrain();
      if (!rec || workerRef.current !== w) { restoredRef.current = true; return; }
      try {
        tokenizerRef.current.restore(rec.file.vocabulary ?? []);
        w.postMessage({ type: "load", ckpt: toWorkerCheckpoint(rec.file) });
        lastSavedStepRef.current = rec.step;
        setPersistence((p) => ({
          ...p, savedAt: rec.savedAt, step: rec.step, params: rec.params, bytes: rec.bytes,
          restored: true, error: null,
        }));
      } catch (e: any) {
        setPersistence((p) => ({ ...p, error: e?.message ?? "Saved model could not be restored" }));
      } finally {
        restoredRef.current = true;
      }
    })();

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

  /* ---- realtime autosave -------------------------------------------------
   * Every 30 seconds (and whenever the tab is hidden or closed) the live model
   * — weights, Adam moments, vocabulary, step/token counters and the current
   * architecture, including any neurogenesis growth — is written to IndexedDB.
   * The same snapshot is summarised into the assistant's long-term memory so
   * the chat answers always reflect the most recently trained model. */
  const persistNow = useCallback(async (opts?: { force?: boolean }) => {
    const t = telemetryRef.current;
    if (!t || savingRef.current || !restoredRef.current) return;
    if (!opts?.force && t.step <= lastSavedStepRef.current) return;
    savingRef.current = true;
    setPersistence((p) => ({ ...p, saving: true }));
    try {
      const payload = await captureCheckpoint(true);
      const file = buildCheckpointFile(payload, tokenizerRef.current.vocab);
      if (payload.shapes) file.shapes = payload.shapes;
      const rec = await saveBrain(file);
      lastSavedStepRef.current = rec.step;
      setPersistence((p) => ({
        ...p, savedAt: rec.savedAt, step: rec.step, params: rec.params, bytes: rec.bytes,
        saving: false, error: null,
      }));

      // Feed what was just learned into the chat knowledge base.
      const now = Date.now();
      if (now - lastMemoryPushRef.current > 120_000) {
        lastMemoryPushRef.current = now;
        const top = (t.top || []).slice(0, 5)
          .map((x) => `${tokenizerRef.current.vocab[x.id] ?? `token#${x.id}`} (${(x.p * 100).toFixed(1)}%)`)
          .join(", ");
        void indexMemory([{
          kind: "brain_state",
          title: `Amehnities trained model — step ${rec.step}`,
          content:
            `Saved model snapshot at step ${rec.step.toLocaleString()}: ${rec.params.toLocaleString()} parameters, ` +
            `${t.cfg.nLayers} blocks, ${t.cfg.nHeads} heads, d_model ${t.cfg.dModel}, context ${t.cfg.ctx}, ` +
            `activation ${t.activation ?? "swish"}. Training loss ${t.loss.toFixed(4)}, perplexity ${t.perplexity.toFixed(2)}, ` +
            `${t.tokensSeen.toLocaleString()} activity tokens learned from ${t.streamSize.toLocaleString()} stream tokens.` +
            (top ? ` Most likely next app events: ${top}.` : "") +
            (t.evaluation ? ` Held-out accuracy ${(t.evaluation.accuracy * 100).toFixed(1)}%, validation loss ${t.evaluation.loss.toFixed(3)}.` : ""),
          source_id: "amehnities-brain-state",
          metadata: { step: rec.step, params: rec.params, loss: t.loss, perplexity: t.perplexity, saved_at: rec.savedAt },
        }]).catch(() => undefined);
      }
    } catch (e: any) {
      setPersistence((p) => ({ ...p, saving: false, error: e?.message ?? "Autosave failed" }));
    } finally {
      savingRef.current = false;
    }
  }, [captureCheckpoint]);

  useEffect(() => {
    if (!persistence.supported) return;
    const id = setInterval(() => { void persistNow(); }, 30_000);
    const flush = () => { void persistNow(); };
    const onVis = () => { if (document.hidden) flush(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [persistNow, persistence.supported]);

  useEffect(() => { persistNowRef.current = persistNow; }, [persistNow]);


  /** Forget the automatically saved model (next boot trains from scratch). */
  const forgetSavedBrain = useCallback(async () => {
    await clearBrain();
    lastSavedStepRef.current = -1;
    setPersistence((p) => ({ ...p, savedAt: null, step: 0, params: 0, bytes: 0, restored: false, error: null }));
  }, []);

  /* ---- model versioning --------------------------------------------------
   * Immutable, dated snapshots kept on the device. Any of them can be rolled
   * back into the live worker in one click if a training run degrades results.
   */
  const refreshVersions = useCallback(async () => {
    setVersions(await listVersions());
  }, []);

  useEffect(() => { void refreshVersions(); }, [refreshVersions]);

  const createVersion = useCallback(
    async (opts?: { label?: string; trigger?: VersionTrigger; notes?: string }) => {
      const t = telemetryRef.current;
      const payload = await captureCheckpoint(true);
      const file = buildCheckpointFile(payload, tokenizerRef.current.vocab);
      if (payload.shapes) file.shapes = payload.shapes;
      const meta = await saveVersion(file, {
        label: opts?.label,
        trigger: opts?.trigger ?? "manual",
        notes: opts?.notes,
        perplexity: t?.perplexity ?? 0,
        valLoss: t?.evaluation?.loss ?? null,
        accuracy: t?.evaluation?.accuracy ?? null,
      });
      lastVersionStepRef.current = meta.step;
      await refreshVersions();
      return meta;
    },
    [captureCheckpoint, refreshVersions],
  );

  /** Restore a stored version into the live model (a safety point is kept first). */
  const rollbackToVersion = useCallback(async (id: string) => {
    const rec = await getVersion(id);
    if (!rec) throw new Error("That version is no longer stored on this device");
    // Never lose the current state — snapshot it before overwriting.
    try { await createVersion({ trigger: "pre-rollback", label: "Before rollback" }); } catch { /* best effort */ }
    tokenizerRef.current.restore(rec.file.vocabulary ?? []);
    workerRef.current?.postMessage({ type: "load", ckpt: toWorkerCheckpoint(rec.file) });
    const saved = await saveBrain(rec.file);
    lastSavedStepRef.current = saved.step;
    setPersistence((p) => ({
      ...p, savedAt: saved.savedAt, step: saved.step, params: saved.params, bytes: saved.bytes, error: null,
    }));
    await refreshVersions();
    return rec;
  }, [createVersion, refreshVersions]);

  const removeVersion = useCallback(async (id: string) => {
    await deleteVersion(id);
    await refreshVersions();
  }, [refreshVersions]);

  const clearAllVersions = useCallback(async () => {
    await clearVersions();
    await refreshVersions();
  }, [refreshVersions]);

  const downloadVersion = useCallback(async (id: string) => {
    const rec = await getVersion(id);
    if (!rec) throw new Error("That version is no longer stored on this device");
    return downloadCheckpoint(rec.file);
  }, []);

  /* ---- supervised dataset import ----------------------------------------
   * Imported examples are packed with role-boundary tokens and streamed into
   * the live training loop, then the improved model is persisted immediately
   * and a version is cut so the run can always be reverted.
   */
  const trainOnDataset = useCallback(
    async (parsed: ParsedDataset, opts?: { epochs?: number }) => {
      const w = workerRef.current;
      if (!w) throw new Error("Model is not running");
      if (!parsed.examples.length) throw new Error("No usable examples were found in that dataset");
      const epochs = Math.max(1, Math.min(20, opts?.epochs ?? 3));
      const startStep = telemetryRef.current?.step ?? 0;
      setDatasetTraining(true);
      try {
        const tk = tokenizerRef.current;
        const tokens = encodeDataset(tk, parsed.examples, parsed.name, epochs);
        w.postMessage({ type: "tokens", tokens, vocabSize: tk.size });
        w.postMessage({ type: "run", running: true });
        setRunning(true);

        // Let the live loop actually consume the new material before we
        // snapshot, so the persisted model reflects the imported examples.
        const target = Math.min(600, 60 + parsed.examples.length * epochs);
        const deadline = Date.now() + 45_000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 400));
          if ((telemetryRef.current?.step ?? 0) - startStep >= target) break;
        }

        await persistNowRef.current?.({ force: true });
        const version = await createVersion({
          trigger: "dataset",
          label: `Dataset · ${parsed.name}`,
          notes: describeDataset(parsed),
        });

        const run: DatasetRun = {
          id: version.id,
          at: Date.now(),
          name: parsed.name,
          examples: parsed.examples.length,
          epochs,
          tokens: tokens.length,
          format: parsed.format,
          startStep,
          endStep: telemetryRef.current?.step ?? startStep,
          loss: telemetryRef.current?.loss ?? 0,
        };
        setDatasetRuns((r) => [run, ...r].slice(0, 20));

        // What was learned is fed straight into the chat knowledge base.
        void indexMemory(
          parsed.examples.slice(0, 60).map((ex, i) => ({
            kind: "training_example",
            title: (ex.prompt || ex.completion).slice(0, 90) || `${parsed.name} #${i + 1}`,
            content: ex.prompt ? `Q: ${ex.prompt}\nA: ${ex.completion}` : ex.completion,
            metadata: { dataset: parsed.name, format: parsed.format, epochs },
          })),
        ).catch(() => undefined);

        return run;
      } finally {
        setDatasetTraining(false);
      }
    },
    [createVersion],
  );

  /** Automatic rollback points every 2,000 optimiser steps of real training. */
  useEffect(() => {
    const step = telemetry?.step ?? 0;
    if (!persistence.supported || !step) return;
    if (lastVersionStepRef.current < 0) { lastVersionStepRef.current = step; return; }
    if (step - lastVersionStepRef.current < 2000) return;
    lastVersionStepRef.current = step;
    void createVersion({ trigger: "auto", label: `Auto · step ${step.toLocaleString()}` }).catch(() => undefined);
  }, [telemetry?.step, persistence.supported, createVersion]);


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
  const setPlasticity = useCallback(
    (enabled: boolean) => workerRef.current?.postMessage({ type: "plasticity", enabled }),
    [],
  );
  const setActivation = useCallback(
    (kind: "swish" | "gelu") => workerRef.current?.postMessage({ type: "activation", kind }),
    [],
  );
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
    plasticity: telemetry?.plasticity ?? true, setPlasticity,
    activation: telemetry?.activation ?? "swish", setActivation,
    growth: telemetry?.growth ?? [],
    maxParams: telemetry?.maxParams ?? 0,
    webLearning, setWebLearning, webStats,
    persistence, persistNow, forgetSavedBrain,
    versions, createVersion, rollbackToVersion, removeVersion, clearAllVersions,
    downloadVersion, refreshVersions,
    trainOnDataset, datasetTraining, datasetRuns,


  };
}
