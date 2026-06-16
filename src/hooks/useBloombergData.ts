import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BLOOMBERG_FORM_ID, type BloombergSchool, type CascadeFieldKey, normalizeMissingLabel } from "@/lib/bloomberg/definition";
import {
  cacheBloombergSchools,
  cacheBloombergAssignments,
  readCachedBloombergSchools,
  readCachedBloombergAssignments,
} from "@/lib/bloomberg/offlineSchoolCache";

export interface CascadeAssignment {
  field_key: CascadeFieldKey;
  value: string;
}

/** Loads the full school list and the current user's cascade scope, then
 * exposes cascade-filtered option helpers.
 *
 * Schools + cascade assignments are cached in IndexedDB after each successful
 * online load, and transparently restored from that cache when the device is
 * offline or the network request fails — so the form's schools and the
 * State→LGA→Ward→Community cascade keep working with no connectivity. */
export const useBloombergSchools = () => {
  const { user } = useAuth();
  const [schools, setSchools] = useState<BloombergSchool[]>([]);
  const [assignments, setAssignments] = useState<CascadeAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFromCache(false);

      // 1) Try the network first when we appear to be online.
      const all: BloombergSchool[] = [];
      let online = navigator.onLine;
      if (online) {
        const PAGE = 1000;
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from("bloomberg_schools")
            .select(
              "school_key,label,school_name,school_code,school_type,school_level,ownership,state,lga,ward,location,state_label,lga_label,ward_label,location_label",
            )
            .order("school_name")
            .range(from, from + PAGE - 1);
          if (error) {
            online = false; // network/db failure → fall back to cache
            break;
          }
          if (!data || data.length === 0) break;
          const normalized = (data as BloombergSchool[]).map((s) => ({
            ...s,
            ward_label: normalizeMissingLabel(s.ward_label),
            location_label: normalizeMissingLabel(s.location_label),
            label: normalizeMissingLabel(s.label),
          }));
          all.push(...normalized);
          if (data.length < PAGE) break;
        }
      }

      // 2) Use fresh data when we got it; otherwise restore from the cache.
      if (online && all.length > 0) {
        if (!cancelled) setSchools(all);
        void cacheBloombergSchools(all);
      } else {
        const { schools: cached } = await readCachedBloombergSchools();
        if (!cancelled) {
          setSchools(cached);
          setFromCache(cached.length > 0);
        }
      }

      // 3) Cascade assignments — same online-first / cache-fallback strategy.
      if (user?.id) {
        let assigned: CascadeAssignment[] | null = null;
        if (online) {
          const { data: a, error } = await supabase
            .from("user_cascade_assignments")
            .select("field_key,value")
            .eq("user_id", user.id)
            .eq("form_id", BLOOMBERG_FORM_ID);
          if (!error) assigned = (a as CascadeAssignment[]) || [];
        }
        if (assigned) {
          if (!cancelled) setAssignments(assigned);
          void cacheBloombergAssignments(user.id, assigned);
        } else {
          const cachedA = await readCachedBloombergAssignments(user.id);
          if (!cancelled) setAssignments(cachedA as CascadeAssignment[]);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Apply the user's cascade scope: only schools within all assigned values.
  const scopedSchools = useMemo(() => {
    if (assignments.length === 0) return schools;
    const byField: Record<string, Set<string>> = {};
    assignments.forEach((a) => {
      (byField[a.field_key] ||= new Set()).add(a.value);
    });
    return schools.filter((s) =>
      Object.entries(byField).every(([f, set]) => set.has((s as any)[f] ?? "")),
    );
  }, [schools, assignments]);

  return { schools: scopedSchools, allSchools: schools, assignments, loading, fromCache };
};
