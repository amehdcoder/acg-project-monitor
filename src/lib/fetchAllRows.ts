/**
 * Page through a Supabase query in 1000-row chunks until everything is fetched.
 * Removes the implicit 1000-row cap on any SELECT.
 *
 * Usage:
 *   const rows = await fetchAllRows((from, to) =>
 *     supabase.from("microplan_entries").select("*").eq("project_id", id).range(from, to)
 *   );
 */
export async function fetchAllRows<T = any>(
  build: (from: number, to: number) => any,
  pageSize = 1000,
  hardCap = 200000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  while (from < hardCap) {
    const to = from + pageSize - 1;
    const { data, error } = await build(from, to);
    if (error) throw error;
    const batch: T[] = (data as T[]) ?? [];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return out;
}
