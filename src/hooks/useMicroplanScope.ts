import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface MicroplanScope {
  loading: boolean;
  /** True when no designation rows OR every assignment has no scope at all → unrestricted */
  hasNoRestriction: boolean;
  /** Returns true if the given hierarchy passes any of the user's assignments */
  isInScope: (row: {
    state?: string | null;
    lga?: string | null;
    ward?: string | null;
    flhf_name?: string | null;
    community_name?: string | null;
    settlement_name?: string | null;
  }) => boolean;
  designations: string[];
}

/**
 * Reads the current user's microplan_designation_assignments and returns a
 * helper to check if a row is within their scope. Admins can be passed
 * `bypass=true` to disable restriction entirely.
 */
export const useMicroplanScope = (bypass: boolean): MicroplanScope => {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || bypass) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("microplan_designation_assignments")
        .select("designation, states, lgas, wards, flhfs, communities, settlements")
        .eq("user_id", user.id);
      if (!cancelled) {
        setRows(data || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, bypass]);

  const hasNoRestriction = useMemo(() => {
    if (bypass) return true;
    if (rows.length === 0) return false;
    return rows.every(r =>
      (r.states?.length ?? 0) === 0 &&
      (r.lgas?.length ?? 0) === 0 &&
      (r.wards?.length ?? 0) === 0 &&
      (r.flhfs?.length ?? 0) === 0 &&
      (r.communities?.length ?? 0) === 0 &&
      (r.settlements?.length ?? 0) === 0
    );
  }, [rows, bypass]);

  const isInScope: MicroplanScope["isInScope"] = useMemo(() => {
    if (bypass) return () => true;
    if (rows.length === 0) return () => false; // No assignment → no edit access; admin bypass handles read for admins
    return (row) => rows.some(r => {
      const ok = (arr: string[] | null | undefined, v: string | null | undefined) =>
        !arr || arr.length === 0 || (v != null && arr.includes(v));
      return (
        ok(r.states, row.state ?? null) &&
        ok(r.lgas, row.lga ?? null) &&
        ok(r.wards, row.ward ?? null) &&
        ok(r.flhfs, row.flhf_name ?? null) &&
        ok(r.communities, row.community_name ?? null) &&
        ok(r.settlements, row.settlement_name ?? null)
      );
    });
  }, [rows, bypass]);

  const designations = useMemo(() => [...new Set(rows.map(r => r.designation))], [rows]);

  return { loading, hasNoRestriction, isInScope, designations };
};
