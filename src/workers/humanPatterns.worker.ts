/**
 * Human Patterns & Networks compute worker.
 *
 * Keeps the whole Medicine Accountability intelligence pipeline (identity
 * resolution, social network, community diagnosis, planning linkage and
 * decision intelligence) OFF the main thread so the tab stays interactive even
 * when a very large Geo-Microplanning project (hundreds of thousands of rows)
 * is bound.
 *
 * Protocol:
 *   { type: "data",    payload }  → caches the raw sources in the worker
 *   { type: "compute", id, opts } → runs the pipeline over the cached sources
 *   ← { type: "result", id, ... } | { type: "error", id, message }
 */
import { computeHumanPatterns, type HumanPatternsResult } from "@/lib/isc/humanPatterns";
import {
  answerLinkedQuestions, computePlanningLinkage, normalizePlanRows, type PlanRow,
} from "@/lib/isc/planningLinkage";
import computeDecisionIntelligence from "@/lib/isc/decisionIntelligence";
import type { LogisticsDataset } from "@/lib/isc/medicineAccountability";

interface DataPayload {
  dataset: LogisticsDataset;
  checklistRows: Record<string, unknown>[];
  entries: Record<string, unknown>[];
  /** Raw microplan column names summed into the target population. */
  targetColumns: string[];
  hasProject: boolean;
}

export interface ComputeOpts {
  lateStartDays: number;
  coverageFloor: number;      // percent, e.g. 70
  excludePeople: string[];
  unitsPerPerson: number;
  popPerDistributor: number;
}

let data: DataPayload | null = null;
let planCache: { cols: string; rows: PlanRow[] } | null = null;

const buildPlan = (d: DataPayload): PlanRow[] => {
  const cols = d.targetColumns.join("|");
  if (planCache && planCache.cols === cols) return planCache.rows;
  const rows = normalizePlanRows(d.entries, (e) =>
    d.targetColumns.reduce((sum, c) => {
      const v = (e as Record<string, unknown>)[c];
      return sum + (typeof v === "number" && Number.isFinite(v) ? v : 0);
    }, 0));
  planCache = { cols, rows };
  return rows;
};

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as { type: string; id?: number; payload?: DataPayload; opts?: ComputeOpts };

  if (msg.type === "data") {
    data = msg.payload ?? null;
    planCache = null;
    return;
  }

  if (msg.type !== "compute") return;
  const id = msg.id ?? 0;
  const opts = msg.opts as ComputeOpts;

  try {
    if (!data) {
      (self as unknown as Worker).postMessage({ type: "error", id, message: "no data" });
      return;
    }

    const plan = buildPlan(data);

    const patterns: HumanPatternsResult = computeHumanPatterns(data.dataset, data.checklistRows, {
      lateStartDays: opts.lateStartDays,
      coverageFloor: opts.coverageFloor / 100,
      excludePeople: opts.excludePeople,
      plan,
    });

    const di = computeDecisionIntelligence(
      data.dataset, patterns.network, patterns.diagnoses, patterns.sites,
      { coverageFloor: opts.coverageFloor / 100, lateStartDays: opts.lateStartDays },
    );

    let link: ReturnType<typeof computePlanningLinkage> | null = null;
    let linkAnswers: ReturnType<typeof answerLinkedQuestions> = [];
    if (data.hasProject) {
      link = computePlanningLinkage(plan, data.dataset, patterns.sites, {
        unitsPerPerson: opts.unitsPerPerson,
        popPerDistributor: opts.popPerDistributor,
      });
      linkAnswers = answerLinkedQuestions(link, patterns.network, patterns.diagnoses, patterns.sites);
    }

    (self as unknown as Worker).postMessage({
      type: "result", id, patterns, di, link, linkAnswers, planCount: plan.length,
    });
  } catch (e) {
    (self as unknown as Worker).postMessage({
      type: "error", id, message: e instanceof Error ? e.message : String(e),
    });
  }
};
