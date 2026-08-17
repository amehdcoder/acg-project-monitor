/**
 * Runs the Human Patterns & Networks pipeline in a Web Worker.
 *
 * The panel stays fully interactive (filters, typing, scrolling) while very
 * large bound microplans are analysed. Raw sources are shipped to the worker
 * only when they actually change; option changes are debounced and replay
 * against the cached copy, so recompute is cheap.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { HumanPatternsResult } from "@/lib/isc/humanPatterns";
import type { answerLinkedQuestions, computePlanningLinkage } from "@/lib/isc/planningLinkage";
import type { DecisionIntelligenceResult } from "@/lib/isc/decisionIntelligence";
import type { LogisticsDataset } from "@/lib/isc/medicineAccountability";

export type LinkageResult = ReturnType<typeof computePlanningLinkage>;
export type LinkageAnswers = ReturnType<typeof answerLinkedQuestions>;

export interface EngineInputs {
  dataset: LogisticsDataset;
  checklistRows: Record<string, unknown>[];
  entries: Record<string, unknown>[];
  targetColumns: string[];
  hasProject: boolean;
  lateStartDays: number;
  coverageFloor: number;
  excludePeople: string[];
  unitsPerPerson: number;
  popPerDistributor: number;
}

export interface EngineOutput {
  patterns: HumanPatternsResult | null;
  di: DecisionIntelligenceResult | null;
  link: LinkageResult | null;
  linkAnswers: LinkageAnswers;
  computing: boolean;
  failed: boolean;
}

const OPT_DEBOUNCE = 250;

export function useHumanPatternsEngine(input: EngineInputs): EngineOutput {
  const {
    dataset, checklistRows, entries, targetColumns, hasProject,
    lateStartDays, coverageFloor, excludePeople, unitsPerPerson, popPerDistributor,
  } = input;

  const workerRef = useRef<Worker | null>(null);
  const reqRef = useRef(0);
  const dataReadyRef = useRef(false);

  const [out, setOut] = useState<Omit<EngineOutput, "computing" | "failed">>({
    patterns: null, di: null, link: null, linkAnswers: [],
  });
  const [computing, setComputing] = useState(true);
  const [failed, setFailed] = useState(false);

  /* worker lifecycle */
  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("../workers/humanPatterns.worker.ts", import.meta.url), { type: "module" });
    } catch {
      setFailed(true);
      setComputing(false);
      return;
    }
    workerRef.current = worker;
    worker.onmessage = (ev: MessageEvent) => {
      const m = ev.data as {
        type: string; id: number;
        patterns?: HumanPatternsResult; di?: DecisionIntelligenceResult;
        link?: LinkageResult | null; linkAnswers?: LinkageAnswers;
      };
      if (m.id !== reqRef.current) return;             // stale run — ignore
      if (m.type === "result") {
        setOut({
          patterns: m.patterns ?? null,
          di: m.di ?? null,
          link: m.link ?? null,
          linkAnswers: m.linkAnswers ?? [],
        });
        setFailed(false);
      } else {
        setFailed(true);
      }
      setComputing(false);
    };
    worker.onerror = () => { setFailed(true); setComputing(false); };
    return () => { worker?.terminate(); workerRef.current = null; };
  }, []);

  const targetKey = useMemo(() => targetColumns.join("|"), [targetColumns]);

  /* ship raw sources only when they change */
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;
    dataReadyRef.current = false;
    setComputing(true);
    w.postMessage({
      type: "data",
      payload: { dataset, checklistRows, entries, targetColumns, hasProject },
    });
    dataReadyRef.current = true;
    // a compute is scheduled by the options effect below (it shares the key)
  }, [dataset, checklistRows, entries, targetKey, hasProject, targetColumns]);

  /* debounced compute on any input change */
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;
    setComputing(true);
    const t = window.setTimeout(() => {
      const id = ++reqRef.current;
      w.postMessage({
        type: "compute",
        id,
        opts: { lateStartDays, coverageFloor, excludePeople, unitsPerPerson, popPerDistributor },
      });
    }, OPT_DEBOUNCE);
    return () => window.clearTimeout(t);
  }, [
    dataset, checklistRows, entries, targetKey, hasProject,
    lateStartDays, coverageFloor, excludePeople, unitsPerPerson, popPerDistributor,
  ]);

  return { ...out, computing, failed };
}

export default useHumanPatternsEngine;
