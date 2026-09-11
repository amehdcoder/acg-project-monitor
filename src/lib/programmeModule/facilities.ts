// Registered health facilities, focal persons and facility-scoped helpers for
// the Longitudinal Beneficiary Record.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FacilityRow {
  id: string;
  name: string;
  facility_type: "phc" | "secondary" | "tertiary";
  state: string | null;
  lga: string | null;
  ward: string | null;
  contact_person: string | null;
  contact_phone: string | null;
}

export interface FocalPersonRow {
  id: string;
  facility_id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export const FACILITY_TYPE_LABEL: Record<FacilityRow["facility_type"], string> = {
  phc: "Primary Health Centre",
  secondary: "Secondary Health Facility",
  tertiary: "Tertiary Health Facility",
};

export const URGENCY_OPTIONS = [
  { value: "routine", label: "Routine" },
  { value: "urgent", label: "Urgent" },
  { value: "emergency", label: "Emergency" },
];

/** All facilities the signed-in user may see (project register). */
export const useFacilities = (projectId?: string) => {
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("health_facilities")
      .select("id,name,facility_type,state,lga,ward,contact_person,contact_phone")
      .order("name")
      .limit(2000);
    if (projectId) q = q.or(`project_id.eq.${projectId},project_id.is.null`);
    const { data } = await q;
    setFacilities((data as FacilityRow[]) || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  return { facilities, loading, reload: load };
};

/** Facilities where the signed-in user is an active focal person. */
export const useMyFacilities = () => {
  const [facilityIds, setFacilityIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { if (!cancelled) { setFacilityIds([]); setLoading(false); } return; }
      const { data } = await supabase
        .from("facility_focal_persons")
        .select("facility_id")
        .eq("user_id", auth.user.id)
        .eq("is_active", true);
      if (cancelled) return;
      setFacilityIds(((data as { facility_id: string }[]) || []).map((r) => r.facility_id));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { facilityIds, loading };
};
