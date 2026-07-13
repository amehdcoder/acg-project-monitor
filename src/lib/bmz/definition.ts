// Jigawa State Inclusive Eye Health BMZ Project — Monitoring Checklist.
// For Health Ambassadors, TBAs & CHEWs.
//
// Code-defined "standard form" (like SeeClear / Bloomberg) that lives
// permanently in the Standard Forms folder and can be added to any project.

export const BMZ_FORM_NAME = "Jigawa Eye Health Monitoring Checklist";
export const BMZ_FORM_DESC =
  "BMZ Inclusive Eye Health monitoring for Health Ambassadors, TBAs & CHEWs — training, service delivery, referrals & sign-off.";
export const BMZ_DASH_NAME = "Jigawa Eye Health Monitoring Dashboard";
export const BMZ_DASH_DESC =
  "Cadre performance, training coverage, service delivery, referrals, screening & flagged gaps (admin only).";

// Brand colors from the BMZ project header.
export const BMZ_GREEN = "#0f6b52";
export const BMZ_TEAL = "#14b8a6";
export const BMZ_DARK = "#0b3d2e";

// ---------- Reference option sets ----------
export const CADRE_OPTIONS = [
  { value: "chew", label: "CHEW" },
  { value: "ambassador", label: "Health Ambassador" },
  { value: "tba", label: "TBA" },
];

export const SEX_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

export const REFRESHER_OPTIONS = [
  { value: "done", label: "Done" },
  { value: "deferred", label: "Deferred" },
  { value: "not_due", label: "Not due" },
];

export const PRIMARY_ACTIVITIES = [
  { key: "mobilization", label: "Community mobilization on eye health" },
  { key: "facility_visits", label: "Encouraging health facility visits" },
  { key: "follow_up", label: "Tracking client follow-up at facility" },
  { key: "advocacy", label: "Advocacy at community gatherings" },
  { key: "other", label: "Other" },
];

// Availability status shared by Screening Kits & Eye poster.
export type AvailStatus = "in_use" | "not_in_use" | "not_available";
export const AVAIL_OPTIONS: { value: AvailStatus; label: string; score: number; color: string }[] = [
  { value: "in_use", label: "Available & in use", score: 2, color: "#16a34a" },
  { value: "not_in_use", label: "Available, not in use", score: 1, color: "#f59e0b" },
  { value: "not_available", label: "Not available", score: 0, color: "#dc2626" },
];

export const CHALLENGE_ITEMS = [
  { key: "transport", label: "Transport / logistics" },
  { key: "acceptance", label: "Community acceptance" },
  { key: "stockout", label: "Stock-out / lack of materials" },
  { key: "other", label: "Other" },
];

// ---------- Scoring ----------
// A simple, transparent compliance index (0-100%) derived from the positive
// signals in a visit. Used for the dashboard readiness banding.
export interface BmzScoreInput {
  trainedEyeCare: boolean | null;
  refresherStatus: string;
  activitiesCount: number;
  screeningKits: string;
  eyePoster: string;
  registerUpdated: boolean | null;
  referralsEvidence: boolean | null;
}

export const computeCompliance = (i: BmzScoreInput): number => {
  let score = 0;
  let max = 0;

  // Trained on primary eye care (2)
  max += 2;
  if (i.trainedEyeCare) score += 2;

  // Refresher training (2)
  max += 2;
  if (i.refresherStatus === "done") score += 2;
  else if (i.refresherStatus === "not_due") score += 1;

  // At least one primary activity (2)
  max += 2;
  if (i.activitiesCount >= 3) score += 2;
  else if (i.activitiesCount >= 1) score += 1;

  // Screening kits (2)
  max += 2;
  score += AVAIL_OPTIONS.find((o) => o.value === i.screeningKits)?.score ?? 0;

  // Eye poster (2)
  max += 2;
  score += AVAIL_OPTIONS.find((o) => o.value === i.eyePoster)?.score ?? 0;

  // Register up to date (2)
  max += 2;
  if (i.registerUpdated) score += 2;

  // Evidence of referrals (2)
  max += 2;
  if (i.referralsEvidence) score += 2;

  return max > 0 ? Math.round((score / max) * 100) : 0;
};

export const readinessBand = (pct: number) => {
  if (pct >= 80) return { label: "Strong", color: "#16a34a" };
  if (pct >= 60) return { label: "Fair", color: "#f59e0b" };
  if (pct >= 40) return { label: "Weak", color: "#f97316" };
  return { label: "Critical", color: "#dc2626" };
};

export const cadreLabel = (v?: string) => CADRE_OPTIONS.find((c) => c.value === v)?.label || v || "—";
export const availLabel = (v?: string) => AVAIL_OPTIONS.find((c) => c.value === v)?.label || v || "—";
export const refresherLabel = (v?: string) => REFRESHER_OPTIONS.find((c) => c.value === v)?.label || v || "—";

export interface BmzChallenge {
  type: string;
  explain: string;
}
