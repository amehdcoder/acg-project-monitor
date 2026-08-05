/**
 * Kobo ↔ flattened data reconciliation computation.
 *
 * Extracted from the reconciliation panel so the same rows can be rendered on
 * screen and exported to CSV/PDF from the dashboard toolbar.
 */
import { buildChecklistDataset } from "@/components/IntegratedSupervisory/checklistSchema";
import type { KoboCache } from "@/components/IntegratedSupervisory/koboClient";

export type ReconSeverity = "error" | "warning";

export interface ReconIssue {
  severity: ReconSeverity;
  type: string;
  uuid: string;
  submissionId: string;
  submittedAt: string;
  geography: string;
  expected: string;
  actual: string;
  detail: string;
}

export interface ReconStats {
  koboReported: number;
  cachedSubmissions: number;
  parents: number;
  expectedRespondents: number;
  flattenedRespondents: number;
  errors: number;
  warnings: number;
}

export const MANDATORY_GEO = ["State", "LGA", "Ward", "COMMUNITIES"] as const;

/** Count repeat items directly on the raw submission (schema-agnostic). */
export function rawRepeatCount(raw: any): number {
  let best = 0;
  const walk = (o: any) => {
    if (!o || typeof o !== "object") return;
    for (const v of Object.values(o)) {
      if (Array.isArray(v) && v.every((i) => i && typeof i === "object" && !Array.isArray(i))) {
        best = Math.max(best, v.length);
        continue;
      }
      if (v && typeof v === "object") walk(v);
    }
  };
  walk(raw);
  return best;
}

export function computeReconciliation(cache: KoboCache | null): { issues: ReconIssue[]; stats: ReconStats } {
  const raws: any[] = cache?.results ?? [];
  const { parents, respondents } = buildChecklistDataset(raws);

  const respondentsByParent = new Map<string, number>();
  for (const r of respondents) {
    const key = String((r as any).parent_uuid ?? "");
    respondentsByParent.set(key, (respondentsByParent.get(key) ?? 0) + 1);
  }

  const found: ReconIssue[] = [];
  const seenUuid = new Map<string, number>();

  raws.forEach((raw, i) => {
    const uuid = String(raw?._uuid ?? "");
    const parent = parents[i] ?? {};
    const submissionId = String(raw?._id ?? "—");
    const submittedAt = String(raw?._submission_time ?? "—");
    const geography = MANDATORY_GEO.map((k) => String((parent as any)[k] ?? "")).filter(Boolean).join(" › ") || "—";
    const base = { uuid: uuid || "—", submissionId, submittedAt, geography };

    seenUuid.set(uuid, (seenUuid.get(uuid) ?? 0) + 1);

    const rawCount = rawRepeatCount(raw);
    const flatCount = respondentsByParent.get(uuid) ?? 0;

    if (rawCount !== flatCount) {
      found.push({
        ...base, severity: "error", type: "Repeat count mismatch",
        expected: `${rawCount} interview${rawCount === 1 ? "" : "s"}`,
        actual: `${flatCount} flattened row${flatCount === 1 ? "" : "s"}`,
        detail: "Respondent repeat items were not fully unrolled into flat rows.",
      });
    } else if (rawCount === 0) {
      found.push({
        ...base, severity: "warning", type: "No respondent interviews",
        expected: "≥ 1 interview", actual: "0",
        detail: "Checklist submitted without any Respondent_Interview entries.",
      });
    }

    const missing = MANDATORY_GEO.filter((k) => !String((parent as any)[k] ?? "").trim());
    if (missing.length) {
      found.push({
        ...base, severity: "warning", type: "Missing geography",
        expected: MANDATORY_GEO.join(", "), actual: `missing ${missing.join(", ")}`,
        detail: "Mandatory administrative fields could not be resolved from the submission.",
      });
    }
  });

  for (const [uuid, n] of seenUuid) {
    if (n > 1) {
      found.push({
        severity: "error", type: "Duplicate submission UUID",
        uuid: uuid || "—", submissionId: "—", submittedAt: "—", geography: "—",
        expected: "1 record", actual: `${n} records`,
        detail: "The same Kobo UUID appears more than once in the cached payload.",
      });
    }
  }

  const parentUuids = new Set(raws.map((r) => String(r?._uuid ?? "")));
  for (const key of respondentsByParent.keys()) {
    if (!parentUuids.has(key)) {
      found.push({
        severity: "error", type: "Orphaned respondent row",
        uuid: key || "—", submissionId: "—", submittedAt: "—", geography: "—",
        expected: "matching parent submission", actual: "no parent found",
        detail: "A flattened respondent row references a submission that is not in the cache.",
      });
    }
  }

  const expectedRespondents = raws.reduce((a, r) => a + rawRepeatCount(r), 0);

  return {
    issues: found,
    stats: {
      koboReported: cache?.count ?? 0,
      cachedSubmissions: raws.length,
      parents: parents.length,
      expectedRespondents,
      flattenedRespondents: respondents.length,
      errors: found.filter((f) => f.severity === "error").length,
      warnings: found.filter((f) => f.severity === "warning").length,
    },
  };
}
