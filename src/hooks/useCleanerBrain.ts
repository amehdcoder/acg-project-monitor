import { useCallback, useEffect, useRef, useState } from "react";
import type { MdaTypeId } from "@/lib/dataCleaner/schemas";
import type { BrainStats, ScoredRow } from "@/lib/dataCleaner/neural/protocol";

/** Owns the always-on Data Cleaner brain worker for the chosen MDA type. */
export interface BrainServerSync {
  load: () => Promise<any | null>;
  save: (m: { key: string; data: any; steps: number; valLoss: number; corpusRows: number; columns: number }) => Promise<void> | void;
}
export function useCleanerBrain(mda: MdaTypeId | string, config?: { columns: { key: string; type: string }[] } | null, server?: BrainServerSync) {
  const serverRef = useRef(server); serverRef.current = server;
  const ref = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, { res: (r: ScoredRow[]) => void; rej: (e: Error) => void }>());
  const seq = useRef(0);
  const [stats, setStats] = useState<BrainStats | null>(null);

  useEffect(() => {
    const w = new Worker(new URL("../workers/dataCleanerBrain.worker.ts", import.meta.url), { type: "module" });
    ref.current = w;
    w.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === "stats") setStats(m.stats);
      else if (m.type === "checkpoint") { try { void serverRef.current?.save(m); } catch (e) { console.warn("[brain] server save", e); } }
      else if (m.type === "scored") { pending.current.get(m.id)?.res(m.rows); pending.current.delete(m.id); }
      else if (m.type === "error") { const p = pending.current.get(m.id); if (p) { p.rej(new Error(m.message)); pending.current.delete(m.id); } else console.warn("[cleaner brain]", m.message); }
    };
    const vis = () => w.postMessage({ type: "hidden", hidden: document.hidden });
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); w.terminate(); ref.current = null; };
  }, []);

  const cfgKey = config ? JSON.stringify(config.columns) : "";
  useEffect(() => {
    if (config === null) return; // caller still preparing its schema
    setStats(null);
    let off = false;
    (async () => {
      let serverCkpt: any = null;
      try { serverCkpt = await serverRef.current?.load() ?? null; } catch { /* offline — use this device's copy */ }
      if (!off) ref.current?.postMessage({ type: "init", mda, config, serverCkpt });
    })();
    return () => { off = true; ref.current?.postMessage({ type: "checkpointNow" }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mda, cfgKey]);

  const score = useCallback((rows: Record<string, any>[]) => new Promise<ScoredRow[]>((res, rej) => {
    const id = ++seq.current; pending.current.set(id, { res, rej });
    ref.current?.postMessage({ type: "score", id, rows });
  }), []);
  const addCorpus = useCallback((rows: Record<string, any>[], source: string) => ref.current?.postMessage({ type: "addCorpus", rows, source }), []);
  const setRunning = useCallback((on: boolean) => ref.current?.postMessage({ type: "setRunning", on }), []);
  const checkpointNow = useCallback(() => ref.current?.postMessage({ type: "checkpointNow" }), []);
  const reset = useCallback(() => ref.current?.postMessage({ type: "reset" }), []);
  return { stats, score, addCorpus, setRunning, reset, checkpointNow };
}
