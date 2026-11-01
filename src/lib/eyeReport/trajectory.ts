export const MILESTONES = [{ key: "baseline", label: "Baseline" }, { key: "day30", label: "30 days" }, { key: "day90", label: "90 days" }, { key: "day180", label: "180 days" }] as const;
export interface VisualTrajectory {
  id: string; project_id: string; episode_key: string; facility_name: string; lga: string; surgery_date: string;
  baseline: number; day30: number | null; day90: number | null; day180: number | null;
  source: "tracker_import" | "clinical_entry"; created_by: string;
}
export type RecoveryStatus = "Full Recovery" | "Partial Improvement" | "Unchanged" | "Deteriorated" | "Awaiting follow-up";
/** Descriptive analytics only: good vision is <=0.3 logMAR; meaningful change is 0.2 logMAR. */
export function recoveryStatus(row: VisualTrajectory): RecoveryStatus {
  const latest = row.day180 ?? row.day90 ?? row.day30;
  if (latest === null) return "Awaiting follow-up";
  if (latest <= 0.3) return "Full Recovery";
  if (row.baseline - latest >= 0.2 - 1e-9) return "Partial Improvement";
  if (latest - row.baseline >= 0.2 - 1e-9) return "Deteriorated";
  return "Unchanged";
}
export function meanMilestones(rows: VisualTrajectory[]) {
  return MILESTONES.map((m) => {
    const values = rows.flatMap((r) => r[m.key] === null ? [] : [Number(r[m.key])]);
    return { milestone: m.label, value: values.length ? values.reduce((a,b) => a+b,0) / values.length : null, n: values.length };
  });
}
export function validateTrajectory(raw: Record<string, unknown>): Omit<VisualTrajectory,"id"|"project_id"|"source"|"created_by"> {
  const read = (key: string, required = false): number | null => {
    const v = raw[key];
    if (v === undefined || v === null || String(v).trim() === "") { if (required) throw new Error("Baseline logMAR is required."); return null; }
    const n = Number(v); if (!Number.isFinite(n) || n < -0.3 || n > 3) throw new Error(`${key} must be a measured logMAR between -0.3 and 3.`);
    return n;
  };
  const episode_key = String(raw.episode_key ?? "").trim(), facility_name = String(raw.facility_name ?? "").trim(), lga = String(raw.lga ?? "").trim(), surgery_date = String(raw.surgery_date ?? "").trim();
  if (!episode_key || episode_key.length > 150 || !facility_name || facility_name.length > 200 || !lga || lga.length > 80) throw new Error("Episode key, facility and LGA are required (use a pseudonymous per-eye surgical episode key).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(surgery_date) || !Number.isFinite(Date.parse(surgery_date)) || new Date(surgery_date).toISOString().slice(0,10) !== surgery_date) throw new Error("Enter a valid surgery date (YYYY-MM-DD).");
  const baseline = read("baseline",true); if (baseline === null) throw new Error("Baseline is required.");
  return { episode_key, facility_name, lga, surgery_date, baseline, day30:read("day30"), day90:read("day90"), day180:read("day180") };
}
export interface DhisOutcomeEvidence { month: string; rows: { indicator_key: string; dhis2: number | null }[] }
export function remoteGoodOutcome(evidence: DhisOutcomeEvidence | null) {
  const bands = ["good","borderline","poor"].map((k) => evidence?.rows.find((r) => r.indicator_key === `eye_daily:discharge_presenting_${k}`)?.dhis2);
  if (bands.some((v) => v === undefined || v === null || !Number.isFinite(v) || v < 0)) return null;
  const values = bands.map(Number), total = values.reduce((a,b)=>a+b,0);
  return total ? { rate: values[0]/total*100, n: total } : null;
}