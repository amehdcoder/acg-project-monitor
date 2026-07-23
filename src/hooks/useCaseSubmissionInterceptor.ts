// Phase 3 — Form submission interceptor.
//
// Wraps a registration submit handler with the deduplication pipeline. Call
// `intercept()` from your form; if candidates score at/above the threshold
// the returned state exposes them to a UI modal (see DuplicateResolutionModal).
// Modal action callbacks then continue the flow either as an update to the
// selected case or as a new case with `flagged_override: true`.

import { useCallback, useState } from "react";
import {
  buildNewCase,
  putCase,
  type CaseEntity,
  type CaseSearchKeys,
  type CaseType,
} from "@/lib/caseEngine/caseStore";
import {
  evaluateDuplicateCandidates,
  DEFAULT_DUPLICATE_THRESHOLD,
  type DuplicateCandidate,
} from "@/lib/caseEngine/duplicateEngine";
import { enqueueCaseTransaction } from "@/lib/caseEngine/caseSyncQueue";
import { updateCaseState } from "@/lib/caseEngine/caseMutator";

export interface InterceptInput {
  case_type: CaseType;
  search_keys: CaseSearchKeys;
  properties: Record<string, unknown>;
  external_id?: string | null;
  parent_case_id?: string | null;
  project_id?: string | null;
  owner_user_id?: string | null;
  media?: Array<{ field: string; file: File | Blob; filename?: string }>;
  threshold?: number;
}

export type InterceptResolution =
  | { status: "queued_new"; case: CaseEntity }
  | { status: "queued_update"; case: CaseEntity }
  | { status: "awaiting_resolution"; candidates: DuplicateCandidate[] };

export interface PendingInterception {
  input: InterceptInput;
  candidates: DuplicateCandidate[];
}

export const useCaseSubmissionInterceptor = () => {
  const [pending, setPending] = useState<PendingInterception | null>(null);

  /** Kick off the dedupe check; returns queued OR sets `pending` for UI. */
  const intercept = useCallback(
    async (input: InterceptInput): Promise<InterceptResolution> => {
      const threshold = input.threshold ?? DEFAULT_DUPLICATE_THRESHOLD;
      const candidates = await evaluateDuplicateCandidates(input.search_keys, {
        case_type: input.case_type,
        threshold,
      });
      if (candidates.length > 0) {
        setPending({ input, candidates });
        return { status: "awaiting_resolution", candidates };
      }
      const created = await commitNewCase(input, false);
      return { status: "queued_new", case: created };
    },
    [],
  );

  /** Action A — user chose an existing case; convert to update/follow-up. */
  const resolveAsExisting = useCallback(
    async (case_id: string): Promise<CaseEntity> => {
      if (!pending) throw new Error("No pending interception to resolve");
      const merged = await updateCaseState({
        case_id,
        delta: pending.input.properties,
        search_keys_patch: pending.input.search_keys,
      });
      await enqueueCaseTransaction({
        case_id,
        kind: "update",
        delta: pending.input.properties,
        search_keys: merged.search_keys,
        case_type: merged.case_type,
        project_id: pending.input.project_id,
        owner_user_id: pending.input.owner_user_id,
        media: pending.input.media,
      });
      setPending(null);
      return merged;
    },
    [pending],
  );

  /** Action B — user confirms as brand-new despite duplicate warnings. */
  const resolveAsNew = useCallback(async (): Promise<CaseEntity> => {
    if (!pending) throw new Error("No pending interception to resolve");
    const created = await commitNewCase(pending.input, true);
    setPending(null);
    return created;
  }, [pending]);

  const cancel = useCallback(() => setPending(null), []);

  return { intercept, pending, resolveAsExisting, resolveAsNew, cancel };
};

const commitNewCase = async (
  input: InterceptInput,
  flagged_override: boolean,
): Promise<CaseEntity> => {
  const entity = buildNewCase({
    case_type: input.case_type,
    search_keys: input.search_keys,
    properties: input.properties,
    external_id: input.external_id ?? null,
    parent_case_id: input.parent_case_id ?? null,
    project_id: input.project_id ?? null,
    owner_user_id: input.owner_user_id ?? null,
    flagged_override,
  });
  await putCase(entity);
  await enqueueCaseTransaction({
    case_id: entity.case_id,
    kind: "create",
    delta: entity.properties,
    search_keys: entity.search_keys,
    case_type: entity.case_type,
    parent_case_id: entity.parent_case_id,
    external_id: entity.external_id,
    flagged_override,
    project_id: entity.project_id,
    owner_user_id: entity.owner_user_id,
    media: input.media,
  });
  return entity;
};
