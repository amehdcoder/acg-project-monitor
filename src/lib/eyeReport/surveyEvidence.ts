import { z } from "zod";
import { parseMilestones, type MilestoneKey, type MilestoneObservation } from "./milestones";

export const SURVEY_FIELDS: Record<MilestoneKey, { numerator: string; denominator: string; population: string }> = {
  ecsc: { numerator: "People operated for cataract with a good presenting visual outcome", denominator: "People operated for cataract plus people needing cataract surgery", population: "Use a representative population survey and its documented cataract eligibility and visual-acuity thresholds." },
  erec: { numerator: "People with refractive correction achieving a good presenting visual outcome", denominator: "People with met, undermet or unmet refractive correction needs", population: "Use a representative population survey and its documented refractive-error eligibility and visual-acuity thresholds." },
  tt: { numerator: "Adults with TT unknown to the health system", denominator: "Adults aged 15 years or older examined", population: "Count surveyed adults aged ≥15 years, not screening visits or referrals." },
  tf: { numerator: "Children with trachomatous inflammation — follicular", denominator: "Children aged 1–9 years examined", population: "Count surveyed children aged 1–9 years. Threshold observation alone does not establish sustained elimination." },
  backlog: { numerator: "People remaining in the verified TT surgical backlog", denominator: "", population: "Use the same verified backlog cohort at baseline and follow-up; referrals alone are not resolved cases." },
};
const count = z.number().int().min(0).max(2147483647);
export const surveySchema = z.object({
  indicator: z.enum(["ecsc", "erec", "tt", "tf", "backlog"]), state: z.string().trim().min(1).max(300), lga: z.string().trim().min(1).max(300),
  date: z.string(), baseline_date: z.string(), numerator: count, denominator: count.nullable(), baseline_numerator: count, baseline_denominator: count.nullable(),
  source: z.string().trim().min(1, "Enter the survey source.").max(300), methodology: z.string().trim().min(1, "Enter the survey method and eligibility criteria.").max(300), representative: z.literal(true, { errorMap: () => ({ message: "Confirm representative evidence for the selected population." }) }),
});
export type SurveyInput = z.infer<typeof surveySchema>;
export type SavedSurvey = SurveyInput & MilestoneObservation & { id: string; project_id: string; created_by: string; updated_at?: string };
export function validateSurvey(raw: unknown): SurveyInput & MilestoneObservation {
  const result = surveySchema.safeParse(raw);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Check the survey fields.");
  const r = result.data;
  const percentage = (n: number, d: number | null) => {
    if (d === null || d <= 0 || n > d) throw new Error("Enter a positive population denominator with cases no greater than the population examined.");
    return n / d * 100;
  };
  const value = r.indicator === "backlog" ? r.numerator : percentage(r.numerator, r.denominator);
  const baseline = r.indicator === "backlog" ? r.baseline_numerator : percentage(r.baseline_numerator, r.baseline_denominator);
  const observation = parseMilestones([{ ...r, value, baseline }])[0];
  return { ...r, ...observation, ...(r.indicator === "backlog" ? { denominator: null, baseline_denominator: null } : {}) };
}
export function mergeSurveyEvidence(saved: MilestoneObservation[], imported: MilestoneObservation[]) {
  const key = (r: MilestoneObservation) => [r.indicator, r.state.toLowerCase(), r.lga.toLowerCase(), r.date].join("|");
  const map = new Map(imported.map(r => [key(r), r]));
  for (const r of saved) map.set(key(r), r);
  return [...map.values()];
}