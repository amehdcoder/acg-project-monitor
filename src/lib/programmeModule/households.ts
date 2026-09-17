// Household & community cluster grouping.
//
// Individual beneficiaries are grouped into household units so NTD programmes
// can run mass drug administration (MDA) against a household register, trace
// contacts inside a compound, and monitor outcomes at family level rather than
// only per person. Households in turn share community water and sanitation
// (WASH) points, which is what turns a list of patients into a transmission
// picture.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WashSourceRow {
  id: string;
  project_id: string;
  name: string;
  source_type: string;
  sanitation_type: string | null;
  is_improved: boolean;
  state: string | null;
  lga: string | null;
  ward: string | null;
  village: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
}

export interface HouseholdRow {
  id: string;
  project_id: string;
  module_id: string | null;
  household_code: string;
  name: string | null;
  head_name: string | null;
  household_size: number;
  state: string | null;
  lga: string | null;
  ward: string | null;
  village: string | null;
  latitude: number | null;
  longitude: number | null;
  wash_source_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface MdaRoundRow {
  id: string;
  project_id: string;
  module_id: string | null;
  household_id: string;
  round_name: string;
  round_date: string;
  disease: string;
  drug: string | null;
  persons_eligible: number;
  persons_treated: number;
  persons_absent: number;
  persons_refused: number;
  directly_observed: boolean;
  notes: string | null;
  round_type?: string;
  drug_batch?: string | null;
  drug_expiry?: string | null;
  distributor_name?: string | null;
  supervisor_name?: string | null;
  facility_id?: string | null;
  community?: string | null;
  revisit_done?: boolean;
  unregistered_eligible?: number;
  unregistered_treated?: number;
}

/** One person's treatment entry inside a round — the auditable unit of coverage. */
export interface MdaTreatmentRow {
  id?: string;
  project_id: string;
  module_id: string | null;
  round_id?: string;
  household_id: string;
  beneficiary_id: string | null;
  person_name: string;
  age_years: number | null;
  sex: string | null;
  outcome: string;
  not_eligible_reason: string | null;
  drug: string | null;
  tablets: number | null;
  dose_basis: string | null;
  dose_value: number | null;
  directly_observed: boolean;
  adverse_event: string | null;
  adverse_event_serious: boolean;
  notes: string | null;
}

export const MDA_OUTCOMES = [
  { value: "treated", label: "Treated" },
  { value: "absent", label: "Absent" },
  { value: "refused", label: "Refused" },
  { value: "not_eligible", label: "Not eligible" },
];

export const NOT_ELIGIBLE_REASONS = [
  { value: "too_young", label: "Below age / height cut-off" },
  { value: "pregnant", label: "Pregnant" },
  { value: "breastfeeding", label: "Breastfeeding (first week)" },
  { value: "severely_ill", label: "Severely ill" },
  { value: "treated_elsewhere", label: "Already treated elsewhere" },
  { value: "other", label: "Other reason" },
];

export const DOSE_BASIS = [
  { value: "height_pole", label: "Height pole band" },
  { value: "weight", label: "Weight (kg)" },
  { value: "age", label: "Age band" },
];

export const MDA_ROUND_TYPES = [
  { value: "annual", label: "Annual round" },
  { value: "mop_up", label: "Mop-up round" },
  { value: "retreatment", label: "Re-treatment" },
  { value: "catch_up", label: "Catch-up visit" },
];

export const outcomeLabel = (v?: string | null) =>
  MDA_OUTCOMES.find((o) => o.value === v)?.label || v || "—";

export const notEligibleLabel = (v?: string | null) =>
  NOT_ELIGIBLE_REASONS.find((o) => o.value === v)?.label || v || "—";

export const WASH_SOURCE_TYPES = [
  { value: "borehole", label: "Borehole / hand pump", improved: true },
  { value: "piped", label: "Piped water", improved: true },
  { value: "protected_well", label: "Protected well", improved: true },
  { value: "rainwater", label: "Rainwater harvesting", improved: true },
  { value: "unprotected_well", label: "Unprotected well", improved: false },
  { value: "stream", label: "Stream / river", improved: false },
  { value: "pond", label: "Pond / dam", improved: false },
  { value: "vendor", label: "Water vendor / tanker", improved: false },
];

export const SANITATION_TYPES = [
  { value: "flush", label: "Flush toilet" },
  { value: "vip", label: "Ventilated improved pit latrine" },
  { value: "pit_slab", label: "Pit latrine with slab" },
  { value: "pit_open", label: "Pit latrine without slab" },
  { value: "open", label: "Open defecation" },
];

export const NTD_DISEASES = [
  { value: "lymphatic_filariasis", label: "Lymphatic filariasis", drug: "Ivermectin + Albendazole" },
  { value: "onchocerciasis", label: "Onchocerciasis (river blindness)", drug: "Ivermectin" },
  { value: "schistosomiasis", label: "Schistosomiasis", drug: "Praziquantel" },
  { value: "sth", label: "Soil-transmitted helminths", drug: "Albendazole" },
  { value: "trachoma", label: "Trachoma", drug: "Azithromycin" },
];

export const HOUSEHOLD_ROLES = [
  { value: "head", label: "Head of household" },
  { value: "spouse", label: "Spouse / partner" },
  { value: "child", label: "Child" },
  { value: "parent", label: "Parent" },
  { value: "sibling", label: "Sibling" },
  { value: "relative", label: "Other relative" },
  { value: "other", label: "Other member" },
];

export const roleLabel = (v?: string | null) =>
  HOUSEHOLD_ROLES.find((r) => r.value === v)?.label || "Member";

export const washTypeLabel = (v?: string | null) =>
  WASH_SOURCE_TYPES.find((t) => t.value === v)?.label || v || "Water point";

export const diseaseLabel = (v?: string | null) =>
  NTD_DISEASES.find((d) => d.value === v)?.label || v || "—";

const db = supabase as unknown as {
  from: (t: string) => any;
};

/** Households registered on a project, with their WASH point and MDA history. */
export const useHouseholds = (projectId?: string, moduleId?: string) => {
  const [households, setHouseholds] = useState<HouseholdRow[]>([]);
  const [washSources, setWashSources] = useState<WashSourceRow[]>([]);
  const [rounds, setRounds] = useState<MdaRoundRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setHouseholds([]); setLoading(false); return; }
    setLoading(true);
    const [h, w, r] = await Promise.all([
      db.from("beneficiary_households").select("*").eq("project_id", projectId)
        .order("created_at", { ascending: false }).limit(2000),
      db.from("community_wash_sources").select("*").eq("project_id", projectId).order("name").limit(1000),
      db.from("household_mda_rounds").select("*").eq("project_id", projectId)
        .order("round_date", { ascending: false }).limit(4000),
    ]);
    setHouseholds((h.data as HouseholdRow[]) || []);
    setWashSources((w.data as WashSourceRow[]) || []);
    setRounds((r.data as MdaRoundRow[]) || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load, moduleId]);

  return { households, washSources, rounds, loading, reload: load };
};

/** Next household code for a project — HH-0001, HH-0002 … restarting at 1. */
export const nextHouseholdCode = (existing: HouseholdRow[]) => {
  let max = 0;
  for (const h of existing) {
    const n = Number(String(h.household_code || "").replace(/\D+/g, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `HH-${String(max + 1).padStart(4, "0")}`;
};

export const saveHousehold = async (
  row: Partial<HouseholdRow> & { project_id: string },
): Promise<string> => {
  const { data: auth } = await supabase.auth.getUser();
  if (row.id) {
    const { id, ...rest } = row;
    const { error } = await db.from("beneficiary_households").update(rest).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await db.from("beneficiary_households")
    .insert({ ...row, created_by: auth.user?.id })
    .select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
};

export const deleteHousehold = async (id: string) => {
  const { error } = await db.from("beneficiary_households").delete().eq("id", id);
  if (error) throw error;
};

export const saveWashSource = async (
  row: Partial<WashSourceRow> & { project_id: string; name: string },
): Promise<string> => {
  const { data: auth } = await supabase.auth.getUser();
  if (row.id) {
    const { id, ...rest } = row;
    const { error } = await db.from("community_wash_sources").update(rest).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await db.from("community_wash_sources")
    .insert({ ...row, created_by: auth.user?.id })
    .select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
};

export const saveMdaRound = async (
  row: Partial<MdaRoundRow> & { project_id: string; household_id: string; round_name: string },
) => {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await db.from("household_mda_rounds")
    .insert({ ...row, created_by: auth.user?.id });
  if (error) throw error;
};

/** Attaches (or detaches) a beneficiary to a household. */
export const setBeneficiaryHousehold = async (
  beneficiaryId: string,
  householdId: string | null,
  role: string | null,
) => {
  const { error } = await db.from("beneficiaries")
    .update({ household_id: householdId, household_role: role })
    .eq("id", beneficiaryId);
  if (error) throw error;
};

/** Treatment coverage for a household across all recorded MDA rounds. */
export const householdCoverage = (rounds: MdaRoundRow[]) => {
  const eligible = rounds.reduce((a, r) => a + (r.persons_eligible || 0), 0);
  const treated = rounds.reduce((a, r) => a + (r.persons_treated || 0), 0);
  return {
    eligible,
    treated,
    percent: eligible > 0 ? Math.round((treated / eligible) * 100) : 0,
    rounds: rounds.length,
  };
};
