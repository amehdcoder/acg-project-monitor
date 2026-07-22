import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keyset ("Load More") pagination on top of a user-supplied fetcher keyed by
 * `(created_at, id)`. Delivers a strict 20-row initial payload and appends the
 * next 20 rows on demand — no offset scans, stable under concurrent inserts.
 *
 * The fetcher receives the current cursor (the created_at/id of the LAST row
 * seen, or null for the first page) and must return rows already ordered
 * `created_at DESC, id DESC`.
 */
export interface KeysetCursor {
  created_at: string;
  id: string;
}

export interface KeysetRow {
  id: string;
  created_at: string;
}

interface Options<T extends KeysetRow> {
  /** Stable dependency array; changing any entry resets the list. */
  deps: readonly unknown[];
  /** Page size — defaults to 20 per product spec. */
  pageSize?: number;
  /** Whether the hook should fetch at all. */
  enabled?: boolean;
  fetchPage: (cursor: KeysetCursor | null, pageSize: number) => Promise<T[]>;
}

export function useKeysetLoadMore<T extends KeysetRow>({
  deps,
  pageSize = 20,
  enabled = true,
  fetchPage,
}: Options<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const busyRef = useRef(false);

  const runFetch = useCallback(
    async (cursor: KeysetCursor | null, append: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;
      append ? setLoadingMore(true) : setLoading(true);
      try {
        const next = await fetchPage(cursor, pageSize);
        setRows((prev) => (append ? [...prev, ...next] : next));
        setHasMore(next.length === pageSize);
        setError(null);
      } catch (e: any) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        busyRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [fetchPage, pageSize],
  );

  // Initial + reset on deps change.
  useEffect(() => {
    if (!enabled) {
      setRows([]);
      setHasMore(true);
      return;
    }
    setRows([]);
    setHasMore(true);
    runFetch(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore) return;
    const last = rows[rows.length - 1];
    if (!last) return;
    runFetch({ created_at: last.created_at, id: last.id }, true);
  }, [hasMore, loading, loadingMore, rows, runFetch]);

  const refresh = useCallback(() => {
    setRows([]);
    setHasMore(true);
    runFetch(null, false);
  }, [runFetch]);

  return { rows, loading, loadingMore, hasMore, error, loadMore, refresh };
}

export default useKeysetLoadMore;
