import {
  useQuery,
  keepPreviousData,
  type QueryKey,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { safeArray, isTransientBackendError } from "@/lib/safeData";

/**
 * Thin wrapper around `useQuery` for Supabase reads. Standardizes:
 *  - Query keys shaped `[domain, table, filters]` so identical concurrent
 *    requests across components dedupe automatically.
 *  - Error unwrapping — Supabase returns `{ data, error }`; the fetcher may
 *    return the raw envelope and we surface the error to React Query.
 *  - Cache defaults inherited from the app-wide QueryClient
 *    (staleTime 60s, gcTime 5min, no window-focus refetch,
 *     `placeholderData: keepPreviousData` so widgets keep last-good data
 *     when a 429/504/empty response hits mid-refetch).
 */
export function useSupabaseQuery<T>(
  queryKey: QueryKey,
  fetcher: () => Promise<{ data: T | null; error: any } | T>,
  options?: Omit<UseQueryOptions<T>, "queryKey" | "queryFn">,
) {
  return useQuery<T>({
    queryKey,
    queryFn: async () => {
      const result: any = await fetcher();
      if (result && typeof result === "object" && "error" in result) {
        if (result.error) throw result.error;
        return (result.data ?? null) as T;
      }
      return result as T;
    },
    placeholderData: keepPreviousData,
    ...options,
  });
}

/**
 * Variant that guarantees an array result. Under heavy load or after a 429/504,
 * consumers can safely `.map` without any optional-chaining.
 */
export function useSupabaseListQuery<T>(
  queryKey: QueryKey,
  fetcher: () => Promise<{ data: T[] | null; error: any } | T[] | null | undefined>,
  options?: Omit<UseQueryOptions<T[]>, "queryKey" | "queryFn">,
) {
  const query = useQuery<T[]>({
    queryKey,
    queryFn: async () => {
      try {
        const result: any = await fetcher();
        if (result && typeof result === "object" && "error" in result) {
          if (result.error) throw result.error;
          return safeArray<T>(result.data);
        }
        return safeArray<T>(result);
      } catch (err) {
        // Transient overloads (429/504/etc.) — propagate to react-query so
        // it retries with backoff, but the query cache keeps last-good data.
        if (isTransientBackendError(err)) throw err;
        throw err;
      }
    },
    placeholderData: keepPreviousData,
    ...options,
  });

  // Normalize `data` so `.map` is always safe on the render path.
  const items = safeArray<T>(query.data);
  return { ...query, items };
}

export default useSupabaseQuery;
