import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BLOOMBERG_FORM_ID, type BloombergSchool, type CascadeFieldKey } from "@/lib/bloomberg/definition";

export interface CascadeAssignment {
  field_key: CascadeFieldKey;
  value: string;
}

/** Loads the full school list and the current user's cascade scope, then
 * exposes cascade-filtered option helpers. */
export const useBloombergSchools = () => {
  const { user } = useAuth();
  const [schools, setSchools] = useState<BloombergSchool[]>([]);
  const [assignments, setAssignments] = useState<CascadeAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Paginate to fetch all ~2,853 schools.
      const all: BloombergSchool[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("bloomberg_schools")
          .select(
            "school_key,label,school_name,school_code,school_type,school_level,ownership,state,lga,ward,location,state_label,lga_label,ward_label,location_label",
          )
          .order("school_name")
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        all.push(...(data as BloombergSchool[]));
        if (data.length < PAGE) break;
      }
      if (!cancelled) setSchools(all);

      if (user?.id) {
        const { data: a } = await supabase
          .from("user_cascade_assignments")
          .select("field_key,value")
          .eq("user_id", user.id)
          .eq("form_id", BLOOMBERG_FORM_ID);
        if (!cancelled) setAssignments((a as CascadeAssignment[]) || []);
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

  return { schools: scopedSchools, allSchools: schools, assignments, loading };
};
