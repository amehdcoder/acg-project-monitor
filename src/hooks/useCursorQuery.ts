import { useCallback, useMemo, useState } from "react";
import { keepPreviousData, useQuery, type QueryKey } from "@tanstack/react-query";

export interface CursorPage<T> {
  rows: T[];
  count: number | null;
  from: number;
  to: number;
}

interface Options<T> {
  /** Stable query key. Include every filter that changes the result set. */
  queryKey: QueryKey;
  /**
   * Fetcher receiving inclusive `from`/`to` offsets. Must return the rows plus
   * an optional total `count` (from `.select("*", { count: "exact" })`).
   */
  fetchPage: (from: number, to: number) => Promise<CursorPage<T>>;
  pageSize?: number;
  enabled?: boolean;
}

/**
 * Server-side cursor/offset pagination on top of React Query.
 *
 * - 50 rows per page by default (traffic-throttled).
 * - `keepPreviousData` so switching pages doesn't flash a spinner.
 * - `staleTime`/`gcTime` inherited from the app-wide QueryClient defaults
 *   (60s / 5min) — identical concurrent requests dedupe automatically.
 */
export function useCursorQuery<T>({
  queryKey,
  fetchPage,
  pageSize = 50,
  enabled = true,
}: Options<T>) {
  const [page, setPage] = useState(0);

  const from = page * pageSize;
  const to = from + pageSize - 1;

  const query = useQuery({
    queryKey: [...queryKey, { page, pageSize }],
    queryFn: () => fetchPage(from, to),
    enabled,
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.count ?? null;
  const totalPages =
    total != null ? Math.max(1, Math.ceil(total / pageSize)) : rows.length === pageSize ? page + 2 : page + 1;

  const goToPage = useCallback(
    (p: number) => setPage(Math.max(0, Math.min(p, totalPages - 1))),
    [totalPages],
  );

  return useMemo(
    () => ({
      rows,
      total,
      page,
      pageSize,
      totalPages,
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      isError: query.isError,
      error: query.error,
      refetch: query.refetch,
      goToPage,
      nextPage: () => goToPage(page + 1),
      prevPage: () => goToPage(page - 1),
      hasPrev: page > 0,
      hasNext: total != null ? from + rows.length < total : rows.length === pageSize,
    }),
    [rows, total, page, pageSize, totalPages, query.isLoading, query.isFetching, query.isError, query.error, query.refetch, goToPage, from],
  );
}

export default useCursorQuery;
