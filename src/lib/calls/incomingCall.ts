// Pure, testable logic for the global incoming-call overlay.
//
// The overlay must render ABOVE every page/route, and accept/reject must behave
// deterministically regardless of where the user is. All of that decision logic
// lives here so it can be unit-tested without a live realtime socket.

/**
 * z-index for the full-screen ringing overlay. Kept high enough to sit above
 * dialogs (z-50), bottom navigation, toasts and every in-app page. Exported so
 * both the component and tests reference a single source of truth.
 */
export const CALL_OVERLAY_Z_INDEX = 2147483000;

/** Calls older than this are considered stale and never ring. */
export const CALL_MAX_AGE_MS = 10 * 60 * 1000;

export interface RawCallRow {
  id?: string | null;
  chat_group_id?: string | null;
  started_by?: string | null;
  call_type?: string | null;
  started_at?: string | null;
  is_active?: boolean | null;
}

export interface RingDecisionContext {
  currentUserId: string | null | undefined;
  /** Calls already turned into a ring prompt (dedupe). */
  prompted: Set<string>;
  /** Calls the user explicitly declined. */
  dismissed: Set<string>;
  now?: number;
  maxAgeMs?: number;
}

export type CallType = "voice" | "video";

export interface IncomingCallItem {
  id: string;
  chatGroupId: string;
  callType: CallType;
  callerName: string;
  callerAvatar: string | null;
  groupName: string;
}

/** Normalize an arbitrary call_type value to a supported call type. */
export function normalizeCallType(value: unknown): CallType {
  return value === "video" ? "video" : "voice";
}

/**
 * Decide whether a raw active_calls row should ring for the current user.
 * Returns false for: missing data, the user's own calls, already prompted or
 * dismissed calls, ended calls, and stale calls.
 */
export function shouldRingForCall(
  call: RawCallRow | null | undefined,
  ctx: RingDecisionContext,
): boolean {
  if (!call || !ctx.currentUserId) return false;
  const id = call.id;
  if (!id) return false;
  if (call.is_active === false) return false;
  if (call.started_by === ctx.currentUserId) return false;
  if (ctx.prompted.has(id) || ctx.dismissed.has(id)) return false;

  const maxAge = ctx.maxAgeMs ?? CALL_MAX_AGE_MS;
  const now = ctx.now ?? Date.now();
  const startedAt = call.started_at ? new Date(call.started_at).getTime() : now;
  if (Number.isFinite(startedAt) && now - startedAt > maxAge) return false;

  return true;
}

/** Add an incoming call to the ring queue (idempotent by id). */
export function enqueueIncoming(
  queue: IncomingCallItem[],
  item: IncomingCallItem,
): IncomingCallItem[] {
  return queue.some((c) => c.id === item.id) ? queue : [...queue, item];
}

/** Remove an incoming call from the queue (used on accept, decline or cancel). */
export function dequeueIncoming(
  queue: IncomingCallItem[],
  id: string,
): IncomingCallItem[] {
  return queue.filter((c) => c.id !== id);
}
