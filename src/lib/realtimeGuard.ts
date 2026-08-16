import { supabase } from "@/integrations/supabase/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RealtimeAuthResult {
  allowed: boolean;
  reason: string;
}

/**
 * Lightweight client-side topic validation. This is a fast first gate; the
 * authoritative check (and audit logging) happens server-side in
 * `authorize_realtime_subscription`.
 */
export function isWellFormedTopic(topic: string): boolean {
  if (!topic || topic.length === 0 || topic.length > 200) return false;
  if (topic === "presence:project:none") return true;
  if (topic.startsWith("presence:project:")) {
    return UUID_RE.test(topic.slice("presence:project:".length));
  }
  if (topic.startsWith("proximity-inbox-")) {
    return UUID_RE.test(topic.slice("proximity-inbox-".length));
  }
  if (topic.startsWith("proximity-chat-")) {
    return UUID_RE.test(topic.slice("proximity-chat-".length));
  }
  return false;
}

/**
 * Explicit authorization guard. Validates the topic id and participant
 * membership server-side BEFORE a realtime channel is subscribed. Every
 * allow/deny decision is logged in `access_audit_log` for monitoring.
 *
 * Returns `{ allowed: false }` instead of throwing so callers can fail closed.
 */
export async function authorizeRealtimeSubscription(
  topic: string
): Promise<RealtimeAuthResult> {
  if (!isWellFormedTopic(topic)) {
    return { allowed: false, reason: "malformed_topic_client" };
  }
  // Presence channels are project-scoped and ephemeral, and the authoritative
  // check runs in the realtime.messages RLS policy on every subscribe/track.
  // Do not put a database RPC in front of this hot path: under load or weak
  // connectivity that single RPC failure made everyone appear offline.
  if (topic.startsWith("presence:project:")) {
    return { allowed: true, reason: "project_presence" };
  }

  try {
    const { data, error } = await supabase.rpc("authorize_realtime_subscription", {
      _topic: topic,
    });
    if (error) {
      console.warn("[realtimeGuard] authorization check failed", error.message);
      return { allowed: false, reason: "authorization_error" };
    }
    const result = (data ?? {}) as Partial<RealtimeAuthResult>;
    return {
      allowed: result.allowed === true,
      reason: result.reason ?? "unknown",
    };
  } catch (e) {
    console.warn("[realtimeGuard] authorization exception", e);
    return { allowed: false, reason: "authorization_exception" };
  }
}

/**
 * Records a referral data access attempt for monitoring (allowed/denied).
 * Fire-and-forget; failures never block the UI.
 */
export async function logReferralAccess(
  action: string,
  decision: "allowed" | "denied",
  referralId?: string,
  reason?: string
): Promise<void> {
  try {
    await supabase.rpc("log_access_attempt", {
      _resource_type: "patient_referral",
      _resource_id: referralId ?? null,
      _action: action,
      _decision: decision,
      _reason: reason ?? null,
      _metadata: {},
    });
  } catch (e) {
    console.warn("[realtimeGuard] referral access log failed", e);
  }
}
