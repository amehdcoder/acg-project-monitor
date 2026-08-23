/**
 * useAmehnitiesBrain — owns the Amehnities AI Transformer worker.
 *
 * Responsibilities:
 *  - boot the worker + model
 *  - load the bounded activity corpus and stream live events into it
 *  - keep training strictly off the main thread and paused when the tab/page
 *    is not visible, so the rest of the app never slows down
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTIVITY_SOURCES, Tokenizer, encodeEvent, encodeEvents, loadActivityCorpus,
  syntheticCorpus, type ActivityEvent,
} from "@/lib/amehnitiesAi/activityStream";

export interface Telemetry {
  structural?: boolean;
  cfg: { dModel: number; nHeads: number; nLayers: number; dFF: number; ctx: number; vocab: number; lr: number };
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
}

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
  const [synthetic, setSynthetic] = useState(false);

  // ---- worker lifecycle
  useEffect(() => {
    const w = new Worker(new URL("../workers/amehnitiesTransformer.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    w.onmessage = (e: MessageEvent) => {
      if (e.data?.type === "telemetry") setTelemetry(e.data as Telemetry);
    };
    w.postMessage({ type: "init", cfg: { dModel: 64, nHeads: 4, nLayers: 4, dFF: 256, ctx: 32, vocab: 256, lr: 3e-3 } });
    w.postMessage({ type: "run", running: true });
    return () => { w.postMessage({ type: "run", running: false }); w.terminate(); workerRef.current = null; };
  }, []);

  // ---- initial corpus
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tk = tokenizerRef.current;
      const corpus = await loadActivityCorpus(tk);
      if (cancelled) return;
      let events = corpus.events;
      let tokens = corpus.tokens;
      if (events.length < 80) {
        setSynthetic(true);
        events = [...syntheticCorpus(tk), ...events].sort((a, b) => a.at - b.at);
        tokens = encodeEvents(tk, events);
      }
      lastAtRef.current = events.length ? events[events.length - 1].at : null;
      const counts: Record<string, number> = {};
      for (const e of events) counts[e.source] = (counts[e.source] || 0) + 1;
      setSourceCounts(counts);
      setFeed(events.slice(-40).reverse());
      workerRef.current?.postMessage({ type: "tokens", tokens, vocabSize: tk.size });
      setCorpusReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- live event feed (realtime → tokens, continuously)
  useEffect(() => {
    const channel = supabase.channel("amehnities-ai-brain");
    for (const s of ACTIVITY_SOURCES) {
      channel.on("postgres_changes", { event: "INSERT", schema: "public", table: s.table }, (payload: any) => {
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

  const grow = useCallback(() => workerRef.current?.postMessage({ type: "grow" }), []);
  const shrink = useCallback(() => workerRef.current?.postMessage({ type: "shrink" }), []);
  const toggle = useCallback(() => setRunning((r) => !r), []);

  const vocab = tokenizerRef.current.vocab;
  const predictions = useMemo(
    () => (telemetry?.top || []).map((t) => ({ label: vocab[t.id] ?? `token#${t.id}`, p: t.p })),
    [telemetry, vocab],
  );

  return { telemetry, running, toggle, budget, setBudget, grow, shrink, feed, sourceCounts, corpusReady, synthetic, predictions, vocab };
}
