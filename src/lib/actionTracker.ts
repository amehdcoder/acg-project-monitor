/**
 * Meeting Action Points Tracker — shared types & helpers.
 *
 * Captures action points agreed in meetings (NTD coordination, Disability
 * Inclusive Development reviews, Eye Health programme meetings, etc.) and
 * tracks their implementation against defined timelines. The tracker raises
 * visual triggers as the due date approaches, on the due date, and once it
 * is past due — and requires a documented reason when an action is not
 * implemented by its due date.
 */

export interface ActionPoint {
  id: string;
  project_id: string | null;
  meeting_title: string;
  meeting_date: string | null;
  meeting_type: string | null;
  programme_area: string;
  action_point: string;
  responsible_person: string;
  responsible_email: string | null;
  responsible_user_id: string | null;
  priority: ActionPriority;
  start_date: string | null;
  due_date: string;
  status: ActionStatus;
  progress_notes: string | null;
  completed_at: string | null;
  non_implementation_reason: string | null;
  reason_provided_at: string | null;
  last_reminder_stage: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type ActionStatus = "not_started" | "in_progress" | "completed" | "deferred";
export type ActionPriority = "low" | "medium" | "high" | "critical";

/** Derived timeline stage used for the trigger / status badges. */
export type TimelineStage =
  | "completed"
  | "deferred"
  | "on_track"
  | "due_soon"
  | "due_today"
  | "overdue";

export const PROGRAMME_AREAS: { value: string; label: string }[] = [
  { value: "ntd", label: "Neglected Tropical Diseases (NTDs)" },
  { value: "did", label: "Disability Inclusive Development (DID)" },
  { value: "eye_health", label: "Eye Health" },
  { value: "clubfoot", label: "Clubfoot Treatment & Management" },
  { value: "wash", label: "Water, Sanitation & Hygiene (WASH)" },
  { value: "livelihood", label: "Livelihood & Economic Empowerment" },
  { value: "mhpss", label: "Mental Health & Psychosocial Support" },
  { value: "governance", label: "Programme Management & Governance" },
  { value: "other", label: "Other Public Health Intervention" },
];

export const MEETING_TYPES: { value: string; label: string }[] = [
  { value: "coordination", label: "Coordination / Stakeholder Meeting" },
  { value: "review", label: "Programme Review Meeting" },
  { value: "planning", label: "Planning Meeting" },
  { value: "supervision", label: "Supervisory / Monitoring Meeting" },
  { value: "technical", label: "Technical Working Group" },
  { value: "community", label: "Community Engagement Meeting" },
  { value: "management", label: "Management / Board Meeting" },
  { value: "other", label: "Other" },
];

export const PRIORITIES: { value: ActionPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export const STATUSES: { value: ActionStatus; label: string }[] = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "deferred", label: "Deferred" },
];

export function programmeLabel(v: string): string {
  return PROGRAMME_AREAS.find((p) => p.value === v)?.label ?? v;
}
export function meetingTypeLabel(v: string | null): string {
  if (!v) return "—";
  return MEETING_TYPES.find((m) => m.value === v)?.label ?? v;
}

/** Whole days between today (local midnight) and the due date. */
export function daysUntilDue(due: string): number {
  const d = new Date(due + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** Threshold (in days) for the "due soon / approaching" trigger. */
export const DUE_SOON_THRESHOLD = 3;

export function timelineStage(a: Pick<ActionPoint, "status" | "due_date">): TimelineStage {
  if (a.status === "completed") return "completed";
  if (a.status === "deferred") return "deferred";
  const days = daysUntilDue(a.due_date);
  if (days < 0) return "overdue";
  if (days === 0) return "due_today";
  if (days <= DUE_SOON_THRESHOLD) return "due_soon";
  return "on_track";
}

export const STAGE_META: Record<TimelineStage, { label: string; chip: string; dot: string }> = {
  completed: { label: "Completed", chip: "bg-[#E2F5EC] text-[#1F7A3A]", dot: "bg-[#22A55A]" },
  deferred: { label: "Deferred", chip: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  on_track: { label: "On Track", chip: "bg-[#E3ECFB] text-[#1656BA]", dot: "bg-[#2F6FE6]" },
  due_soon: { label: "Due Soon", chip: "bg-[#FFF3D6] text-[#9A6B00]", dot: "bg-[#E5A100]" },
  due_today: { label: "Due Today", chip: "bg-[#FCE9DA] text-[#B8651A]", dot: "bg-[#F08A2A]" },
  overdue: { label: "Overdue", chip: "bg-[#FCE9E9] text-[#B23636]", dot: "bg-[#E25555]" },
};

export const PRIORITY_META: Record<ActionPriority, { label: string; chip: string }> = {
  low: { label: "Low", chip: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", chip: "bg-[#E3ECFB] text-[#1656BA]" },
  high: { label: "High", chip: "bg-[#FCE9DA] text-[#B8651A]" },
  critical: { label: "Critical", chip: "bg-[#FCE9E9] text-[#B23636]" },
};

/** True when a reason for non-implementation must be documented. */
export function needsReason(a: Pick<ActionPoint, "status" | "due_date">): boolean {
  return timelineStage(a) === "overdue";
}

export function dueDescription(a: Pick<ActionPoint, "status" | "due_date">): string {
  const stage = timelineStage(a);
  if (stage === "completed") return "Implemented";
  if (stage === "deferred") return "Deferred to a later date";
  const days = daysUntilDue(a.due_date);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} past due`;
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} remaining`;
}
