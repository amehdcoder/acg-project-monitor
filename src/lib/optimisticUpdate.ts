import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * Optimistic-locking update for any table that has a `version` column.
 *
 * Workflow continuity: every CES-mutating call should go through this helper
 * so two devices editing the same row never silently overwrite each other.
 *
 *   const { data, conflict } = await optimisticUpdate("ces_surveys", id, version, { status: "qc" });
 *   if (conflict) { /* refetch & let user reconcile *​/ }
 */
export async function optimisticUpdate<T = any>(
  table: string,
  id: string,
  expectedVersion: number,
  patch: Record<string, any>,
  opts: { showToastOnConflict?: boolean; transactionGuard?: () => boolean } = {}
): Promise<{ data: T | null; conflict: boolean; error: any }> {
  // Transaction guard — caller can short-circuit (e.g. offline, role lost).
  if (opts.transactionGuard && !opts.transactionGuard()) {
    return { data: null, conflict: false, error: new Error("Transaction guard blocked update") };
  }

  // We rely on the BEFORE UPDATE trigger `bump_version_on_update` to increment
  // version automatically. We only need to assert the *expected* prior version
  // matches in the WHERE clause.
  const { data, error } = await (supabase
    .from(table as any)
    .update(patch)
    .eq("id", id)
    .eq("version", expectedVersion)
    .select()
    .maybeSingle() as any);

  if (error) {
    return { data: null, conflict: false, error };
  }

  if (!data) {
    // No row matched ⇒ another writer bumped the version first.
    if (opts.showToastOnConflict !== false) {
      toast({
        title: "Update conflict",
        description: "Another device updated this record. Reloading the latest version…",
        variant: "destructive",
      });
    }
    return { data: null, conflict: true, error: null };
  }

  return { data: data as T, conflict: false, error: null };
}

/**
 * Fetch the current version of a row — used to refresh after a conflict.
 */
export async function fetchVersion(table: string, id: string): Promise<number | null> {
  const { data } = await (supabase.from(table as any).select("version").eq("id", id).maybeSingle() as any);
  return (data as any)?.version ?? null;
}

/**
 * Convenience: read current version, attempt update with optimistic check.
 * On conflict, retries ONCE after refetching the latest version. This handles the
 * common case where two collaborators tap save within milliseconds; if the second
 * conflict still occurs the caller is informed and should reload.
 */
export async function safeUpdate<T = any>(
  table: string,
  id: string,
  patch: Record<string, any>
): Promise<{ data: T | null; conflict: boolean; error: any }> {
  let version = await fetchVersion(table, id);
  if (version == null) {
    return { data: null, conflict: false, error: new Error("Row not found") };
  }
  let result = await optimisticUpdate<T>(table, id, version, patch, { showToastOnConflict: false });
  if (result.conflict) {
    // Refetch and try once more — the most common collision is back-to-back saves
    // by two devices and a single retry resolves it cleanly.
    const latest = await fetchVersion(table, id);
    if (latest == null) return { data: null, conflict: false, error: new Error("Row deleted") };
    result = await optimisticUpdate<T>(table, id, latest, patch, { showToastOnConflict: true });
  }
  return result;
}

