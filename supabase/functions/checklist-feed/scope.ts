// Pure, dependency-free State-scoping helpers for the Checklist feed.
//
// These are extracted from the edge-function handler so they can be unit
// tested directly (see scope_test.ts). Every submission returned to a caller
// — on the initial fetch and on every realtime-triggered refetch — passes
// through `scopeRows`, so a grantee can never receive a row outside the
// State(s) their grant allows.

/** Case/whitespace-insensitive State key ("Kano State" → "kano"). */
export function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+state$/, "");
}

/** Best-effort State reader across the Kobo naming conventions used in the form. */
export function readState(row: Record<string, unknown>): string {
  const isState = (leaf: string) =>
    /^((mda|sel|q)_?)?state(_?(name|label|select|code))?$/i.test(leaf.replace(/\s+/g, "_"));
  for (const [k, v] of Object.entries(row || {})) {
    const leaf = k.split("/").pop() || k;
    if (isState(leaf) && String(v ?? "").trim()) return String(v);
  }
  return "";
}

/**
 * Filter submissions to the caller's granted State(s).
 *
 * - Admins (`isAdmin`) and grants with an empty scope see everything.
 * - A scoped grant sees ONLY rows whose State matches the grant. Rows with no
 *   readable State are treated as out of scope (fail closed).
 */
export function scopeRows<T extends Record<string, unknown>>(
  rows: T[],
  scopeStates: string[],
  isAdmin = false,
): T[] {
  if (isAdmin) return rows;
  const allowed = (scopeStates ?? []).map(norm).filter(Boolean);
  if (!allowed.length) return rows;
  return rows.filter((r) => {
    const st = norm(readState(r));
    return !!st && allowed.includes(st);
  });
}

/** Is a `user_page_access` grant currently in force? */
export function isGrantActive(
  grant: { starts_at?: string | null; expires_at?: string | null } | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!grant) return false;
  if (grant.starts_at && new Date(grant.starts_at).getTime() > now) return false;
  if (grant.expires_at && new Date(grant.expires_at).getTime() <= now) return false;
  return true;
}
