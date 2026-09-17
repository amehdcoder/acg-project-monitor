// Household roster and the lifelong NTD treatment passport.
//
// A household holds more than the patients we registered: it holds everyone who
// sleeps there. Preventive chemotherapy only interrupts transmission when the
// whole compound swallows, so the roster below carries registered beneficiaries
// and other members side by side, each with their own treatment history across
// the five preventive-chemotherapy diseases.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NTD_DISEASES, type MdaRoundRow, type MdaTreatmentRow } from "./households";

const db = supabase as unknown as { from: (t: string) => any };

export interface HouseholdMemberRow {
  id: string;
  project_id: string;
  module_id: string | null;
  household_id: string;
  beneficiary_id: string | null;
  full_name: string;
  sex: string | null;
  date_of_birth: string | null;
  age_years: number | null;
  relationship: string | null;
  height_cm: number | null;
  is_pregnant: boolean;
  is_breastfeeding: boolean;
  is_alive: boolean;
  notes: string | null;
  created_at: string;
}

/** A person on the roster — registered beneficiary or other household member. */
export interface RosterPerson {
  key: string;
  memberId: string | null;
  beneficiaryId: string | null;
  name: string;
  sex: string | null;
  age: number | null;
  heightCm: number | null;
  relationship: string | null;
  isPregnant: boolean;
  isBreastfeeding: boolean;
  registered: boolean;
}

export const useHouseholdMembers = (projectId?: string) => {
  const [members, setMembers] = useState<HouseholdMemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setMembers([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await db.from("household_members").select("*")
      .eq("project_id", projectId).order("created_at", { ascending: true }).limit(20000);
    setMembers((data as HouseholdMemberRow[]) || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  return { members, loading, reload: load };
};

/** The roster of one household — used on a person's own record page. */
export const useMembersOfHousehold = (householdId?: string | null) => {
  const [members, setMembers] = useState<HouseholdMemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!householdId) { setMembers([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await db.from("household_members").select("*")
      .eq("household_id", householdId).order("created_at", { ascending: true }).limit(200);
    setMembers((data as HouseholdMemberRow[]) || []);
    setLoading(false);
  }, [householdId]);

  useEffect(() => { void load(); }, [load]);

  return { members, loading, reload: load };
};

export const saveHouseholdMember = async (
  row: Partial<HouseholdMemberRow> & { project_id: string; household_id: string; full_name: string },
): Promise<string> => {
  const { data: auth } = await supabase.auth.getUser();
  if (row.id) {
    const { id, created_at: _c, ...rest } = row as Record<string, unknown> & { id: string };
    const { error } = await db.from("household_members").update(rest).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await db.from("household_members")
    .insert({ ...row, created_by: auth.user?.id }).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
};

export const deleteHouseholdMember = async (id: string) => {
  const { error } = await db.from("household_members").delete().eq("id", id);
  if (error) throw error;
};

export const MEMBER_RELATIONSHIPS = [
  { value: "head", label: "Head of household" },
  { value: "spouse", label: "Spouse / partner" },
  { value: "child", label: "Child" },
  { value: "parent", label: "Parent" },
  { value: "sibling", label: "Sibling" },
  { value: "relative", label: "Other relative" },
  { value: "other", label: "Other member" },
];

export const relationshipLabel = (v?: string | null) =>
  MEMBER_RELATIONSHIPS.find((r) => r.value === v)?.label || "Member";

// ---------------------------------------------------------------------------
// Eligibility — WHO preventive-chemotherapy rules, applied per disease.
// ---------------------------------------------------------------------------

export interface EligibilityVerdict {
  eligible: boolean;
  reason: string | null;
  /** Machine reason matching NOT_ELIGIBLE_REASONS so it can be saved as-is. */
  code: string | null;
}

export const diseaseEligibility = (
  disease: string,
  p: { age: number | null; heightCm: number | null; isPregnant: boolean; isBreastfeeding: boolean },
): EligibilityVerdict => {
  const ok: EligibilityVerdict = { eligible: true, reason: null, code: null };
  const age = p.age;
  const tooYoung = (min: number) =>
    age !== null && age < min
      ? { eligible: false, reason: `Under ${min} years`, code: "too_young" }
      : null;

  if (disease === "onchocerciasis" || disease === "lymphatic_filariasis") {
    // Ivermectin: 5 years / 90 cm, never in pregnancy.
    if (p.isPregnant) return { eligible: false, reason: "Pregnant — ivermectin withheld", code: "pregnant" };
    if (p.heightCm !== null && p.heightCm < 90) {
      return { eligible: false, reason: "Under 90 cm height pole", code: "too_young" };
    }
    const y = tooYoung(5);
    if (y) return y;
    if (p.isBreastfeeding && age !== null && age < 60) {
      return { eligible: true, reason: "Breastfeeding — check infant is over one week", code: null };
    }
    return ok;
  }
  if (disease === "schistosomiasis") {
    const y = tooYoung(5); // praziquantel from 5 years / school age
    if (y) return y;
    return ok;
  }
  if (disease === "sth") {
    const y = tooYoung(1); // albendazole from 12 months
    if (y) return y;
    if (p.isPregnant && age !== null) {
      return { eligible: true, reason: "Pregnant — treat after the first trimester only", code: null };
    }
    return ok;
  }
  if (disease === "trachoma") {
    // Azithromycin: whole community, infants under 6 months get tetracycline eye ointment.
    if (age !== null && age < 0.5) {
      return { eligible: false, reason: "Under 6 months — eye ointment instead", code: "too_young" };
    }
    return ok;
  }
  return ok;
};

// ---------------------------------------------------------------------------
// Treatment passport — disease down the side, year across the top.
// ---------------------------------------------------------------------------

export type PassportState = "treated" | "absent" | "refused" | "not_eligible" | "none";

export interface PassportCell {
  disease: string;
  year: number;
  state: PassportState;
  rounds: number;
  treatment?: MdaTreatmentRow;
}

export interface Passport {
  years: number[];
  diseases: typeof NTD_DISEASES;
  cell: (disease: string, year: number) => PassportCell;
  /** Diseases where the person missed two or more consecutive offered rounds. */
  persistentMisses: { disease: string; streak: number }[];
  neverTreated: string[];
  doses: number;
}

const yearOf = (d?: string | null) => (d ? new Date(d).getFullYear() : new Date().getFullYear());

/**
 * Builds the passport for one person from their own treatment rows plus every
 * round their household took part in — so a round the person was never offered
 * still shows as a gap rather than silently disappearing.
 */
export const buildPassport = (
  personTreatments: MdaTreatmentRow[],
  householdRounds: MdaRoundRow[],
  yearsBack = 5,
): Passport => {
  const roundById = new Map(householdRounds.map((r) => [r.id, r]));
  const thisYear = new Date().getFullYear();
  const seen = new Set<number>([thisYear]);
  householdRounds.forEach((r) => seen.add(yearOf(r.round_date)));
  personTreatments.forEach((t) => {
    const r = t.round_id ? roundById.get(t.round_id) : undefined;
    seen.add(yearOf(r?.round_date));
  });
  const years = Array.from(seen)
    .filter((y) => y > thisYear - yearsBack - 1)
    .sort((a, b) => a - b);

  const index = new Map<string, PassportCell>();
  for (const t of personTreatments) {
    const r = t.round_id ? roundById.get(t.round_id) : undefined;
    if (!r) continue;
    const key = `${r.disease}|${yearOf(r.round_date)}`;
    const prev = index.get(key);
    // Treated wins over any other outcome recorded the same year.
    const better = !prev || prev.state !== "treated";
    if (better) {
      index.set(key, {
        disease: r.disease,
        year: yearOf(r.round_date),
        state: (t.outcome as PassportState) || "none",
        rounds: (prev?.rounds || 0) + 1,
        treatment: t,
      });
    } else if (prev) {
      prev.rounds += 1;
    }
  }

  const offered = new Set(
    householdRounds.map((r) => `${r.disease}|${yearOf(r.round_date)}`),
  );

  const cell = (disease: string, year: number): PassportCell =>
    index.get(`${disease}|${year}`) || {
      disease,
      year,
      state: "none",
      rounds: offered.has(`${disease}|${year}`) ? 1 : 0,
    };

  const persistentMisses: { disease: string; streak: number }[] = [];
  const neverTreated: string[] = [];
  for (const d of NTD_DISEASES) {
    let streak = 0;
    let worst = 0;
    let treatedEver = false;
    let offeredEver = false;
    for (const y of years) {
      const c = cell(d.value, y);
      if (c.state === "treated") { treatedEver = true; streak = 0; continue; }
      if (c.state === "not_eligible") continue;
      if (c.rounds > 0 || c.state !== "none") {
        offeredEver = true;
        streak += 1;
        worst = Math.max(worst, streak);
      }
    }
    if (worst >= 2) persistentMisses.push({ disease: d.value, streak: worst });
    if (!treatedEver && offeredEver) neverTreated.push(d.value);
  }

  return {
    years,
    diseases: NTD_DISEASES,
    cell,
    persistentMisses,
    neverTreated,
    doses: personTreatments.filter((t) => t.outcome === "treated").length,
  };
};

export const PASSPORT_TONE: Record<PassportState, string> = {
  treated: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  absent: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  refused: "bg-destructive/10 text-destructive border-destructive/30",
  not_eligible: "bg-muted text-muted-foreground border-border",
  none: "bg-background text-muted-foreground border-dashed border-border",
};

export const PASSPORT_MARK: Record<PassportState, string> = {
  treated: "✓",
  absent: "A",
  refused: "R",
  not_eligible: "—",
  none: "·",
};

export const PASSPORT_STATE_LABEL: Record<PassportState, string> = {
  treated: "Treated",
  absent: "Absent",
  refused: "Refused",
  not_eligible: "Not eligible",
  none: "No record",
};
