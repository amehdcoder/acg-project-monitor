import { GRADUATION_STAGES } from "./graduation";

export interface PortalSubmission { id: string; stage: string; activity_date: string; notes: string; status: "pending" | "approved" | "returned"; review_notes?: string; }
export interface PortalPathway { account_id: string; name: string; project_name: string; gate: { status: string }; stages: string[]; services: { service_name: string; service_date: string }[]; submissions: PortalSubmission[]; }
export function progressSubmissionError(status: string, stage: string, notes: string, date: string, today: string) {
  if (status !== "selected") return "Progress submissions open after selection.";
  if (!GRADUATION_STAGES.includes(stage)) return "Choose a Graduation stage.";
  if (!date || date > today) return "Choose today or a previous activity date.";
  if (notes.trim().length < 5 || notes.length > 4000) return "Add activity notes between 5 and 4000 characters.";
  return null;
}