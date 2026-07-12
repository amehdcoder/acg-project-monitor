// Interactive sync-conflict resolution primitives.
//
// Pure, offline-safe helpers used when a local edit to a submission collides
// with a newer server version (detected via optimistic-concurrency version
// numbers from `update_submission_guarded`). These functions never touch the
// network — they only compute diffs and merges so the UI can let a supervisor
// choose how to resolve the divergence.

export type ConflictStrategy = "keep-mine" | "accept-server" | "merge-both";

export interface FieldDiff {
  key: string;
  localValue: unknown;
  serverValue: unknown;
}

/** Stable, order-independent stringify so value equality ignores key order. */
const stableStringify = (v: unknown): string => {
  if (v === null || v === undefined) return "\u0000null";
  if (typeof v !== "object") return typeof v + ":" + String(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return "{" + keys.map((k) => `${k}:${stableStringify((v as any)[k])}`).join(",") + "}";
};

export const valuesEqual = (a: unknown, b: unknown): boolean =>
  stableStringify(a) === stableStringify(b);

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Compute the per-field differences between a local record and the server
 * record. Only keys whose values actually diverge are returned, so the UI shows
 * a focused "what changed" view rather than the entire payload.
 */
export function detectFieldConflicts(
  local: Record<string, unknown>,
  server: Record<string, unknown>,
): FieldDiff[] {
  const keys = new Set<string>([...Object.keys(local || {}), ...Object.keys(server || {})]);
  const diffs: FieldDiff[] = [];
  for (const key of keys) {
    const localValue = local?.[key];
    const serverValue = server?.[key];
    if (!valuesEqual(localValue, serverValue)) {
      diffs.push({ key, localValue, serverValue });
    }
  }
  return diffs.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Field-union merge: start from the server record, then overlay every local
 * field that carries a value. Local wins on direct clashes unless the local
 * value is empty (in which case the server's populated value is preserved),
 * guaranteeing no answered field from either side is lost.
 *
 * `perFieldChoice` (used by the "Merge Both" UI) can override the default on a
 * key-by-key basis: `"local"` keeps the local value, `"server"` keeps server.
 */
export function mergeRecords(
  local: Record<string, unknown>,
  server: Record<string, unknown>,
  perFieldChoice: Record<string, "local" | "server"> = {},
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(server || {}) };
  const keys = new Set<string>([...Object.keys(local || {}), ...Object.keys(server || {})]);
  for (const key of keys) {
    const localValue = local?.[key];
    const serverValue = server?.[key];
    const choice = perFieldChoice[key];
    if (choice === "server") {
      merged[key] = serverValue;
    } else if (choice === "local") {
      merged[key] = localValue;
    } else {
      // Default: prefer a populated local value; otherwise keep server's.
      merged[key] = isEmpty(localValue) ? serverValue : localValue;
    }
  }
  return merged;
}

/** Produce the final payload for a chosen resolution strategy. */
export function resolveConflict(
  strategy: ConflictStrategy,
  local: Record<string, unknown>,
  server: Record<string, unknown>,
  perFieldChoice: Record<string, "local" | "server"> = {},
): Record<string, unknown> {
  switch (strategy) {
    case "keep-mine":
      return { ...local };
    case "accept-server":
      return { ...server };
    case "merge-both":
      return mergeRecords(local, server, perFieldChoice);
    default:
      return { ...server };
  }
}
