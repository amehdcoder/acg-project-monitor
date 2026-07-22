// Shared TanStack Query presets for high-concurrency workloads.
//
// Complex dashboards are the single biggest source of read pressure on the
// backend — when hundreds of operators open a dashboard tab at the same time,
// every extra refetch multiplies into hundreds of concurrent Postgres queries.
// Pinning these presets to a 5-minute staleTime means the same operator loading
// three widgets (or navigating away and back) reuses the cached snapshot for
// five full minutes before any refetch is even considered.
//
// The App-level QueryClient already installs an exponential retry backoff
// (`retryDelay: attempt => min(1s * 2^attempt, 15s)`) with extra headroom for
// transient 429/502/503/504 responses, and `networkMode: "offlineFirst"` so a
// dashboard mounted while offline reads straight from cache instead of erroring.
// Spreading `DASHBOARD_QUERY_OPTIONS` into a dashboard `useQuery` therefore
// gives it the full concurrency-safe profile in one line.

export const FIVE_MINUTES = 5 * 60_000;
export const THIRTY_MINUTES = 30 * 60_000;

/**
 * Preset for heavy dashboard reads. Spread into `useQuery({ ... })`:
 *
 *   useQuery({ queryKey, queryFn, ...DASHBOARD_QUERY_OPTIONS });
 */
export const DASHBOARD_QUERY_OPTIONS = {
  // Cached data stays "fresh" for 5 minutes — no automatic refetch during that
  // window, even if the component remounts or another component subscribes to
  // the same key. Manual `invalidateQueries` still forces a refresh on demand.
  staleTime: FIVE_MINUTES,
  // Keep the cached snapshot in memory for 30 minutes after the last observer
  // unmounts, so switching tabs and returning does not re-hit the backend.
  gcTime: THIRTY_MINUTES,
  refetchOnMount: false as const,
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: "always" as const,
} as const;
