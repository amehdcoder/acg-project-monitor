// Morbidity management & disability prevention (MMDP) register.
//
// Preventive chemotherapy stops new infection; it does nothing for the swelling,
// the hydrocoele or the in-turned eyelash somebody already lives with. This
// register tracks that care person by person — stage, limb measurement, acute
// attacks, self-care kit, surgery and the next review that is due.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from: (t: string) => any };

export interface MorbidityRow {
  id: string;
  project_id: string;
  module_id: string | null;
  household_id: string | null;
  beneficiary_id: string | null;
  member_id: string | null;
  condition: string;
  stage: string | null;
  affected_side: string | null;
  limb_circumference_cm: number | null;
  acute_attacks_last_year: number | null;
  self_care_kit_issued: boolean;
  self_care_trained: boolean;
  surgery_status: string | null;
  surgery_date: string | null;
  next_review_date: string | null;
  notes: string | null;
  recorded_on: string;
  created_at: string;
}

export const MORBIDITY_CONDITIONS = [
  { value: "lymphoedema", label: "Lymphoedema (limb swelling)" },
  { value: "hydrocoele", label: "Hydrocoele" },
  { value: "trichiasis", label: "Trachomatous trichiasis" },
  { value: "skin_disease", label: "Onchocercal skin disease" },
  { value: "other", label: "Other NTD morbidity" },
];

export const MORBIDITY_STAGES = [
  { value: "stage_1", label: "Stage 1 — reversible swelling" },
  { value: "stage_2", label: "Stage 2 — not reversible overnight" },
  { value: "stage_3", label: "Stage 3 — shallow skin folds" },
  { value: "stage_4", label: "Stage 4 — knobs / lumps" },
  { value: "stage_5", label: "Stage 5 — deep skin folds" },
  { value: "stage_6", label: "Stage 6 — mossy lesions" },
  { value: "stage_7", label: "Stage 7 — unable to self-care" },
  { value: "not_staged", label: "Not staged" },
];

export const SURGERY_STATUS = [
  { value: "not_required", label: "Not required" },
  { value: "referred", label: "Referred for surgery" },
  { value: "scheduled", label: "Surgery scheduled" },
  { value: "done", label: "Surgery done" },
  { value: "declined", label: "Patient declined" },
];

export const AFFECTED_SIDES = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "both", label: "Both sides" },
  { value: "not_applicable", label: "Not applicable" },
];

export const conditionLabel = (v?: string | null) =>
  MORBIDITY_CONDITIONS.find((c) => c.value === v)?.label || v || "—";
export const stageLabel = (v?: string | null) =>
  MORBIDITY_STAGES.find((c) => c.value === v)?.label || v || "Not staged";
export const surgeryLabel = (v?: string | null) =>
  SURGERY_STATUS.find((c) => c.value === v)?.label || v || "—";

export const useMorbidityRecords = (projectId?: string) => {
  const [records, setRecords] = useState<MorbidityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setRecords([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await db.from("ntd_morbidity_records").select("*")
      .eq("project_id", projectId).order("recorded_on", { ascending: false }).limit(10000);
    setRecords((data as MorbidityRow[]) || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  return { records, loading, reload: load };
};

/** Morbidity care recorded for one person, for their own record page. */
export const useMorbidityForPerson = (beneficiaryId?: string | null) => {
  const [records, setRecords] = useState<MorbidityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!beneficiaryId) { setRecords([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await db.from("ntd_morbidity_records").select("*")
      .eq("beneficiary_id", beneficiaryId).order("recorded_on", { ascending: false }).limit(200);
    setRecords((data as MorbidityRow[]) || []);
    setLoading(false);
  }, [beneficiaryId]);

  useEffect(() => { void load(); }, [load]);

  return { records, loading, reload: load };
};

export const saveMorbidityRecord = async (
  row: Partial<MorbidityRow> & { project_id: string; condition: string },
): Promise<string> => {
  const { data: auth } = await supabase.auth.getUser();
  if (row.id) {
    const { id, created_at: _c, ...rest } = row as Record<string, unknown> & { id: string };
    const { error } = await db.from("ntd_morbidity_records").update(rest).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await db.from("ntd_morbidity_records")
    .insert({ ...row, created_by: auth.user?.id }).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
};

export const deleteMorbidityRecord = async (id: string) => {
  const { error } = await db.from("ntd_morbidity_records").delete().eq("id", id);
  if (error) throw error;
};

/** Care left undone on the latest record for a person — what to chase today. */
export const careGaps = (rows: MorbidityRow[]) => {
  const gaps: string[] = [];
  const latest = rows[0];
  if (!latest) return gaps;
  if (!latest.self_care_kit_issued) gaps.push("Self-care kit not issued");
  if (!latest.self_care_trained) gaps.push("Self-care training not given");
  if (latest.surgery_status === "referred" || latest.surgery_status === "scheduled") {
    gaps.push("Surgery still outstanding");
  }
  if (latest.next_review_date && latest.next_review_date < new Date().toISOString().slice(0, 10)) {
    gaps.push("Review overdue");
  }
  if ((latest.acute_attacks_last_year || 0) >= 3) gaps.push("Frequent acute attacks");
  return gaps;
};

/** Change in limb measurement between the two most recent records. */
export const measurementTrend = (rows: MorbidityRow[]) => {
  const withMeasure = rows.filter((r) => r.limb_circumference_cm != null);
  if (withMeasure.length < 2) return null;
  const [now, before] = withMeasure;
  const delta = (now.limb_circumference_cm as number) - (before.limb_circumference_cm as number);
  return {
    delta: Math.round(delta * 10) / 10,
    improving: delta < 0,
    from: before.recorded_on,
    to: now.recorded_on,
  };
};
