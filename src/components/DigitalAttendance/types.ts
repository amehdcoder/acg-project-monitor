export type AttendanceStatus = "present" | "absent" | "late" | "excused" | "not_marked";

export interface Participant {
  id: string;
  participant_code: string;
  full_name: string;
  sex: string | null;
  phone: string | null;
  email: string | null;
  organization: string | null;
  role: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  facility: string | null;
  photo_url: string | null;
  is_active: boolean;
  project_id: string | null;
  registered_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  session_code: string;
  activity_name: string;
  session_type: string;
  description: string | null;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  community: string | null;
  facilitator: string | null;
  expected_count: number;
  status: string;
  project_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  participant_id: string;
  status: AttendanceStatus;
  marked_at: string | null;
  marked_by: string | null;
  remarks: string | null;
  method: string | null;
  created_at: string;
  updated_at: string;
}

export const STATUS_META: Record<AttendanceStatus, { label: string; color: string; bg: string; dot: string }> = {
  present: { label: "Present", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  absent: { label: "Absent", color: "text-rose-700", bg: "bg-rose-50 border-rose-200", dot: "bg-rose-500" },
  late: { label: "Late", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", dot: "bg-amber-500" },
  excused: { label: "Excused", color: "text-sky-700", bg: "bg-sky-50 border-sky-200", dot: "bg-sky-500" },
  not_marked: { label: "Not Marked", color: "text-slate-600", bg: "bg-slate-50 border-slate-200", dot: "bg-slate-400" },
};
