// Idempotency contract for offline-first submissions.
//
// Every submission that leaves a field device carries two immutable values:
//   • submission_uuid    — a UUID v4 generated locally at capture time. It is
//     the durable identity of the submission across ANY number of retransmits.
//     If a network blip causes the same payload to be sent twice, the backend
//     recognises the duplicate UUID and never creates a second row.
//   • client_submitted_at — the exact on-device moment the form was completed.
//     This is the authoritative capture clock (independent of server time and
//     of any later sync time), used for ordering and audit.
//
// These are additive: the existing id-based upsert dedupe still applies. The
// contract simply makes the guarantee explicit, queryable, and enforced by a
// unique index on the server.

export interface SyncContractFields {
  submission_uuid: string;
  client_submitted_at: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && UUID_RE.test(v);

/** Generate a fresh UUID v4, with a safe fallback for older webviews. */
export function newSubmissionUuid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  // RFC4122-ish fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Stamp the idempotency contract onto a row destined for a submission table.
 * Idempotent itself: existing values are preserved so a queued row keeps the
 * SAME uuid/capture-time across every retry.
 *
 * @param row           the payload being written
 * @param preferredUuid when the caller already has a stable local id (e.g. the
 *                      IndexedDB record id) pass it so uuid === id.
 * @param capturedAt    the on-device capture timestamp (defaults to now()).
 */
export function stampSyncContract<T extends Record<string, any>>(
  row: T,
  preferredUuid?: string,
  capturedAt?: string,
): T & SyncContractFields {
  const submission_uuid = isUuid(row.submission_uuid)
    ? row.submission_uuid
    : isUuid(preferredUuid)
    ? (preferredUuid as string)
    : newSubmissionUuid();
  const client_submitted_at =
    typeof row.client_submitted_at === "string" && row.client_submitted_at
      ? row.client_submitted_at
      : capturedAt || new Date().toISOString();
  return { ...row, submission_uuid, client_submitted_at };
}
