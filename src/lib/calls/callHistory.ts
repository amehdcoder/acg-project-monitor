// Pure helpers for the project-level call history panel.
//
// Call records live in the `active_calls` table (started_by, call_type,
// started_at, ended_at, is_active). This module derives the user-facing
// outcome, duration and relative time from those raw rows.

import { CALL_MAX_AGE_MS } from "./incomingCall";

export interface CallHistoryRow {
  id: string;
  chat_group_id: string;
  started_by: string;
  call_type: string;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
}

export type CallOutcomeTone = "ongoing" | "missed" | "completed";

export interface CallOutcome {
  label: string;
  tone: CallOutcomeTone;
  /** Whether the call is live and can be joined/re-opened right now. */
  canRejoin: boolean;
}

/**
 * Derive the outcome of a call from the current user's perspective.
 * - Live call you started        -> Ongoing (rejoin)
 * - Live call started by someone  -> Missed · Ongoing (rejoin)
 * - Ended call                    -> Completed (call back)
 * Stale "active" rows (older than the ring window) are treated as ended.
 */
export function deriveCallOutcome(
  call: Pick<CallHistoryRow, "started_by" | "started_at" | "is_active">,
  currentUserId: string | null | undefined,
  now: number = Date.now(),
): CallOutcome {
  const startedByMe = !!currentUserId && call.started_by === currentUserId;
  const age = now - new Date(call.started_at).getTime();
  const liveAndFresh = call.is_active && (!Number.isFinite(age) || age <= CALL_MAX_AGE_MS);

  if (liveAndFresh) {
    return startedByMe
      ? { label: "Ongoing", tone: "ongoing", canRejoin: true }
      : { label: "Missed · Ongoing", tone: "missed", canRejoin: true };
  }

  return startedByMe
    ? { label: "Ended · Outgoing", tone: "completed", canRejoin: false }
    : { label: "Ended · Incoming", tone: "completed", canRejoin: false };
}

/** Duration of a call in seconds (uses `now` for still-active calls). */
export function callDurationSeconds(
  call: Pick<CallHistoryRow, "started_at" | "ended_at" | "is_active">,
  now: number = Date.now(),
): number {
  const start = new Date(call.started_at).getTime();
  if (!Number.isFinite(start)) return 0;
  const end = call.ended_at
    ? new Date(call.ended_at).getTime()
    : call.is_active
      ? now
      : start;
  return Math.max(0, Math.round((end - start) / 1000));
}

/** Human-friendly duration, e.g. "0s", "45s", "3m 20s", "1h 5m". */
export function formatCallDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** Compact relative time, e.g. "just now", "5m ago", "2h ago", "3d ago". */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, now - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Sort call rows newest-first for the history list. */
export function sortCallsNewestFirst(rows: CallHistoryRow[]): CallHistoryRow[] {
  return [...rows].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );
}
