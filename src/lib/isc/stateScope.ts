/**
 * Client-side mirror of the Checklist feed's State-scoping rules.
 *
 * The authoritative filter runs server-side inside the `checklist-feed` edge
 * function. This module re-applies the exact same rules in the browser as
 * defence-in-depth so that a cached payload, a stale service-worker response
 * or a realtime-triggered refetch can never surface a submission from a State
 * the user was not granted.
 */

/** Case/whitespace-insensitive State key ("Kano State" → "kano"). */
export function normState(s: unknown): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+state$/, "");
}

/** Best-effort State reader across the Kobo naming conventions used in the form. */
export function readRowState(row: Record<string, unknown>): string {
  const isState = (leaf: string) =>
    /^((mda|sel|q)_?)?state(_?(name|label|select|code))?$/i.test(leaf.replace(/\s+/g, "_"));
  for (const [k, v] of Object.entries(row || {})) {
    const leaf = k.split("/").pop() || k;
    if (isState(leaf) && String(v ?? "").trim()) return String(v);
  }
  return "";
}

/**
 * Keep only rows inside the granted State(s).
 *
 * An empty scope means "unscoped" (administrator or an all-States grant) and
 * passes everything through. A scoped caller only ever keeps rows with a
 * readable, matching State — rows with no State fail closed.
 */
export function filterRowsToScope<T extends Record<string, unknown>>(
  rows: T[],
  scopeStates: string[] | null | undefined,
): T[] {
  const allowed = (scopeStates ?? []).map(normState).filter(Boolean);
  if (!allowed.length) return rows ?? [];
  return (rows ?? []).filter((r) => {
    const st = normState(readRowState(r));
    return !!st && allowed.includes(st);
  });
}

/** True when a single row is visible to a caller with this scope. */
export function rowInScope(
  row: Record<string, unknown>,
  scopeStates: string[] | null | undefined,
): boolean {
  return filterRowsToScope([row], scopeStates).length === 1;
}
