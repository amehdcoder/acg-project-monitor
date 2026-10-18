// Graduation Approach pathway — tracks each beneficiary household from mapping
// through verification and selection, then across the delivery stages.
import { PRIORITY_LIVELIHOOD_SERVICES } from "./componentOutcomes";

export type SelectionStatus = "mapped" | "verified" | "selected" | "not_selected";

export interface GraduationGate {
  status: SelectionStatus;
  mapped_at?: string;
  verified_at?: string;
  decided_at?: string;
  reason?: string;
  updated_by?: string;
}

export const SELECTION_STEPS: { value: SelectionStatus; label: string; hint: string }[] = [
  { value: "mapped", label: "Mapped", hint: "Household identified during community mapping" },
  { value: "verified", label: "Verified", hint: "Eligibility confirmed by ground verification" },
  { value: "selected", label: "Selected", hint: "Enrolled onto the Graduation pathway" },
];

/** Delivery stages after selection (the priority services minus the entry stage). */
export const GRADUATION_STAGES = PRIORITY_LIVELIHOOD_SERVICES.slice(1);

export const readGate = (profile: Record<string, unknown> | null | undefined): GraduationGate | null => {
  const g = profile?.graduation as GraduationGate | undefined;
  return g && typeof g === "object" && g.status ? g : null;
};

export interface StageProgress {
  stage: string;
  count: number;
  lastDate: string | null;
}

/** Progress per stage, counted from recorded services with matching names. */
export const stageProgress = (
  services: { service_name?: string | null; service_date?: string | null }[],
): StageProgress[] =>
  GRADUATION_STAGES.map((stage) => {
    const hits = services.filter((s) => (s.service_name || "").toLowerCase() === stage.toLowerCase());
    const lastDate = hits.map((h) => h.service_date || "").filter(Boolean).sort().pop() || null;
    return { stage, count: hits.length, lastDate };
  });

export const pathwayPercent = (progress: StageProgress[]) =>
  progress.length ? Math.round((progress.filter((p) => p.count > 0).length / progress.length) * 100) : 0;
