// Phase 4a — Delta Case Mutator.
//
// Longitudinal state manager for existing cases. Applies a last-write-wins
// merge of `properties` onto the local IndexedDB copy and flips sync status
// to `pending_update` so the background queue picks it up.

import { getCase, putCase, type CaseEntity } from "./caseStore";

export interface UpdateCaseInput {
  case_id: string;
  delta: Record<string, unknown>;
  search_keys_patch?: Partial<CaseEntity["search_keys"]>;
  close?: boolean;
}

export const updateCaseState = async (
  input: UpdateCaseInput,
): Promise<CaseEntity> => {
  const existing = await getCase(input.case_id);
  if (!existing) {
    throw new Error(`updateCaseState: case ${input.case_id} not found locally`);
  }
  const merged: CaseEntity = {
    ...existing,
    properties: { ...existing.properties, ...input.delta },
    search_keys: { ...existing.search_keys, ...(input.search_keys_patch || {}) },
    updated_at: new Date().toISOString(),
    is_closed: input.close ? true : existing.is_closed,
    // Only mark as pending_update when it was previously synced; a case that
    // is still `pending_creation` stays that way — the server hasn't seen it.
    sync_status:
      existing.sync_status === "synced" ? "pending_update" : existing.sync_status,
  };
  await putCase(merged);
  return merged;
};
