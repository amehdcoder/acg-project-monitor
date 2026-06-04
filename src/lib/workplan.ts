/**
 * Work Plan Tracker — shared types & helpers.
 *
 * Models a programme work plan (activity schedule / GANTT) and tracks the
 * implementation of each activity against defined timelines. Activities raise
 * visual triggers as the due date approaches, on the due date, and once it is
 * past due — and require a documented reason when an activity is not
 * implemented by its due date.
 *
 * Aligned with HANDS Nigeria (Health And Development Support Programme) focus
 * areas: Neglected Tropical Diseases (NTDs), Disability Inclusive Development
 * (DID), Eye Health, Clubfoot, WASH and related public health interventions.
 */

export interface Workplan {
  id: string;
  project_id: string | null;
  project_no: string | null;
  developed_by: string | null;
  working_title: string;
  programme_area: string;
  donor_partner: string | null;
  start_year: number;
  end_year: number;
  status: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkplanActivity {
  id: string;
  workplan_id: string;
  result: string;
  activity: string;
  responsible_person: string | null;
  responsible_email: string | null;
  target: string | null;
  support_needed: boolean;
  priority: ActivityPriority;
  start_date: string | null;
  due_date: string;
  quarters: string[];
  status: ActivityStatus;
  progress: number;
  completed_at: string | null;
  comment: string | null;
  non_implementation_reason: string | null;
  reason_provided_at: string | null;
  last_reminder_stage: string;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type ActivityStatus = "not_started" | "in_progress" | "completed" | "deferred";
export type ActivityPriority = "low" | "medium" | "high" | "critical";

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
  { value: "eye_health", label: "Inclusive Eye Health" },
  { value: "clubfoot", label: "Clubfoot Treatment & Management" },
  { value: "wash", label: "Water, Sanitation & Hygiene (WASH)" },
  { value: "livelihood", label: "Livelihood & Economic Empowerment" },
  { value: "mhpss", label: "Mental Health & Psychosocial Support" },
  { value: "governance", label: "Programme Management & Governance" },
  { value: "other", label: "Other Public Health Intervention" },
];

export const PRIORITIES: { value: ActivityPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export const STATUSES: { value: ActivityStatus; label: string }[] = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "deferred", label: "Deferred" },
];

export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

export function programmeLabel(v: string): string {
  return PROGRAMME_AREAS.find((p) => p.value === v)?.label ?? v;
}

/** Whole days between today (local midnight) and the due date. */
export function daysUntilDue(due: string): number {
  const d = new Date(due + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export const DUE_SOON_THRESHOLD = 7;

export function timelineStage(a: Pick<WorkplanActivity, "status" | "due_date">): TimelineStage {
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

export const PRIORITY_META: Record<ActivityPriority, { label: string; chip: string }> = {
  low: { label: "Low", chip: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", chip: "bg-[#E3ECFB] text-[#1656BA]" },
  high: { label: "High", chip: "bg-[#FCE9DA] text-[#B8651A]" },
  critical: { label: "Critical", chip: "bg-[#FCE9E9] text-[#B23636]" },
};

export const STATUS_META: Record<ActivityStatus, { label: string; chip: string }> = {
  not_started: { label: "Not Started", chip: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Progress", chip: "bg-[#E3ECFB] text-[#1656BA]" },
  completed: { label: "Completed", chip: "bg-[#E2F5EC] text-[#1F7A3A]" },
  deferred: { label: "Deferred", chip: "bg-[#FFF3D6] text-[#9A6B00]" },
};

/** True when a reason for non-implementation must be documented. */
export function needsReason(a: Pick<WorkplanActivity, "status" | "due_date">): boolean {
  return timelineStage(a) === "overdue";
}

export function dueDescription(a: Pick<WorkplanActivity, "status" | "due_date">): string {
  const stage = timelineStage(a);
  if (stage === "completed") return "Implemented";
  if (stage === "deferred") return "Deferred to a later date";
  const days = daysUntilDue(a.due_date);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} past due`;
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} remaining`;
}

/** Overall completion percentage across a set of activities. */
export function planProgress(acts: WorkplanActivity[]): number {
  if (!acts.length) return 0;
  const sum = acts.reduce((n, a) => n + (a.status === "completed" ? 100 : a.progress || 0), 0);
  return Math.round(sum / acts.length);
}
