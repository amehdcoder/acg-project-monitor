/**
 * Keyset (cursor) pagination helper.
 *
 * Unlike OFFSET/`range()` pagination — which gets progressively slower the
 * deeper you page and is capped to avoid runaway scans — keyset pagination
 * seeks on an indexed `id` column, so every page costs the same regardless of
 * how many rows precede it. This scales to arbitrarily large tables without a
 * hard row cap, while still walking the whole result set in bounded chunks.
 *
 * The `build` callback MUST:
 *   1. SELECT the `id` column (used as the cursor),
 *   2. apply `.gt("id", afterId)` when `afterId` is not null,
 *   3. order by `id` ascending and `.limit(pageSize)`.
 *
 * Usage:
 *   const rows = await fetchAllRowsKeyset<any>((limit, afterId) => {
 *     let q = supabase.from("microplan_entries").select("id, state, lga");
 *     if (afterId) q = q.gt("id", afterId);
 *     return q.order("id", { ascending: true }).limit(limit);
 *   });
 */
export async function fetchAllRowsKeyset<T extends { id?: string | number } = any>(
  build: (limit: number, afterId: string | number | null) => any,
  pageSize = 1000,
  // Generous safety bound (pages, not rows) to avoid an accidental infinite loop.
  maxPages = 100000,
): Promise<T[]> {
  const out: T[] = [];
  let afterId: string | number | null = null;

  for (let page = 0; page < maxPages; page++) {
    const { data, error } = await build(pageSize, afterId);
    if (error) throw error;
    const batch: T[] = (data as T[]) ?? [];
    if (batch.length === 0) break;
    out.push(...batch);
    if (batch.length < pageSize) break;
    const last = batch[batch.length - 1] as any;
    const nextId = last?.id;
    if (nextId === undefined || nextId === null || nextId === afterId) break;
    afterId = nextId;
  }

  return out;
}
