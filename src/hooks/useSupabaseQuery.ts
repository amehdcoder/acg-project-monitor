import { useQuery, type QueryKey, type UseQueryOptions } from "@tanstack/react-query";

/**
 * Thin wrapper around `useQuery` for Supabase reads. Standardizes:
 *  - Query keys shaped `[domain, table, filters]` so identical concurrent
 *    requests across components dedupe automatically.
 *  - Error unwrapping — Supabase returns `{ data, error }`; the fetcher may
 *    return the raw envelope and we surface the error to React Query.
 *  - Cache defaults inherited from the app-wide QueryClient
 *    (staleTime 60s, gcTime 5min, no window-focus refetch).
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
    ...options,
  });
}

export default useSupabaseQuery;
