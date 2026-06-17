// Shared accountability analytics for field-monitoring dashboards
// (Bloomberg School Enrolment Validation & See Clear Eye-Health Monitoring).
//
// Turns raw per-unit submissions (one school / one health facility each) into
// a per-user productivity summary: days worked, start/end time per unit, total
// time spent, and the drill-down list of units visited & reported.

export interface AccountabilityRecordInput {
  userId: string | null;
  unitName: string;
  state: string;
  lga: string;
  /** When the field worker started the record (created_at). */
  start: string | null;
  /** When the record was completed / submitted (submitted_at || updated_at). */
  end: string | null;
  status: string;
}

export interface AccountabilityVisit {
  unitName: string;
  state: string;
  lga: string;
  start: string | null;
  end: string | null;
  durationMs: number;
  date: string;
  status: string;
}

export interface AccountabilityUser {
  userId: string;
  name: string;
  email: string;
  daysWorked: number;
  visitCount: number;
  totalTimeMs: number;
  avgTimeMs: number;
  firstDay: string | null;
  lastDay: string | null;
  visits: AccountabilityVisit[];
}

export interface ProfileLite {
  name: string;
  email: string;
}

const dayKey = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const durationMs = (start: string | null, end: string | null): number => {
  if (!start || !end) return 0;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  const diff = b - a;
  return diff > 0 ? diff : 0;
};

/** Human-friendly duration, e.g. "1h 24m" or "12m" or "—". */
export const formatDuration = (ms: number): string => {
  if (!ms || ms <= 0) return "—";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
};

/** Short local time, e.g. "09:42". */
export const formatClock = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
};

/** Short local date, e.g. "17 Jun 2026". */
export const formatDay = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

export function buildAccountability(
  records: AccountabilityRecordInput[],
  profiles: Map<string, ProfileLite>,
): AccountabilityUser[] {
  const byUser = new Map<string, AccountabilityVisit[]>();

  records.forEach((r) => {
    const uid = r.userId || "unassigned";
    const visit: AccountabilityVisit = {
      unitName: r.unitName || "Unnamed",
      state: r.state || "—",
      lga: r.lga || "—",
      start: r.start,
      end: r.end,
      durationMs: durationMs(r.start, r.end),
      date: dayKey(r.start) || dayKey(r.end) || "",
      status: r.status,
    };
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push(visit);
  });

  const users: AccountabilityUser[] = [];
  byUser.forEach((visits, uid) => {
    const days = new Set<string>();
    let totalTimeMs = 0;
    visits.forEach((v) => {
      if (v.date) days.add(v.date);
      totalTimeMs += v.durationMs;
    });
    const sortedDays = [...days].sort();
    visits.sort((a, b) => (b.start || "").localeCompare(a.start || ""));
    const profile = profiles.get(uid);
    users.push({
      userId: uid,
      name: profile?.name || (uid === "unassigned" ? "Unassigned" : "Unknown user"),
      email: profile?.email || "",
      daysWorked: days.size,
      visitCount: visits.length,
      totalTimeMs,
      avgTimeMs: visits.length ? Math.round(totalTimeMs / visits.length) : 0,
      firstDay: sortedDays[0] || null,
      lastDay: sortedDays[sortedDays.length - 1] || null,
      visits,
    });
  });

  return users.sort((a, b) => b.visitCount - a.visitCount || b.totalTimeMs - a.totalTimeMs);
}
