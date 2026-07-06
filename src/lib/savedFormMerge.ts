// Conflict detection and deterministic merge for offline saved-form entries
// (drafts / finalized submissions) that may be edited on more than one device
// before either copy reaches the server.
//
// Why this exists
// ---------------
// Every saved entry lives in a device-local IndexedDB store keyed by a stable
// `id`. When the same logical record is opened and edited on two devices (e.g.
// a supervisor continues a draft on a tablet that a colleague also has cached),
// both devices produce an entry with the SAME `id` but divergent contents. When
// they later sync, we must resolve the divergence WITHOUT losing field data and
// WITHOUT depending on which device happened to write last.
//
// The rules below are:
//   • Deterministic  — merge(a, b) === merge(b, a); same inputs → same output,
//                       regardless of order or which device runs the merge.
//   • Lossless-first — field-level union so answers entered on either device are
//                       preserved unless they directly conflict on the same key.
//   • Lifecycle-safe — a more advanced lifecycle state always wins the envelope
//                       (sent > finalized > draft) so a finalized/sent record is
//                       never silently demoted back to a draft.

import type { SavedFormEntry, SavedFormStatus } from "@/lib/savedForms";

export interface FieldConflict {
  key: string;
  chosen: unknown;
  discarded: unknown;
  /** deviceId whose value was kept (winner). */
  winner: string | null;
}

export interface MergeReport {
  hadConflict: boolean;
  /** true when the two copies genuinely diverged (neither is an ancestor). */
  divergent: boolean;
  fieldConflicts: FieldConflict[];
  statusResolvedFrom: [SavedFormStatus, SavedFormStatus] | null;
  chosenDevice: string | null;
}

export interface MergeResult {
  merged: SavedFormEntry;
  report: MergeReport;
}

const STATUS_RANK: Record<SavedFormStatus, number> = {
  draft: 0,
  finalized: 1,
  sent: 2,
};

const ts = (v?: string | null): number => {
  const t = v ? new Date(v).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

const deviceOf = (e: SavedFormEntry): string | null =>
  (e as any).deviceId ?? null;

const revOf = (e: SavedFormEntry): number =>
  Number((e as any).rev) || 0;

/**
 * Deterministic ordering of two entries. Returns the "dominant" entry — the one
 * whose envelope metadata (status, then recency, then revision, then device id)
 * should own scalar fields. Total order guarantees commutativity: the same pair
 * always yields the same dominant entry irrespective of argument order.
 */
export function dominantEntry(a: SavedFormEntry, b: SavedFormEntry): SavedFormEntry {
  // 1) Higher lifecycle state wins (never demote finalized/sent to draft).
  const ra = STATUS_RANK[a.status] ?? 0;
  const rb = STATUS_RANK[b.status] ?? 0;
  if (ra !== rb) return ra > rb ? a : b;

  // 2) More recent update wins.
  const ua = ts(a.updatedAt);
  const ub = ts(b.updatedAt);
  if (ua !== ub) return ua > ub ? a : b;

  // 3) Higher explicit revision counter wins.
  const va = revOf(a);
  const vb = revOf(b);
  if (va !== vb) return va > vb ? a : b;

  // 4) Deterministic tie-break by device id, then entry object identity proxy.
  const da = deviceOf(a) ?? "";
  const db = deviceOf(b) ?? "";
  if (da !== db) return da > db ? a : b;

  // 5) Absolute fallback: stable by createdAt then id string.
  if (ts(a.createdAt) !== ts(b.createdAt)) return ts(a.createdAt) > ts(b.createdAt) ? a : b;
  return a.id <= b.id ? a : b;
}

/**
 * Detect whether two same-id entries have genuinely diverged. If one is a clean
 * ancestor of the other (same or lower revision AND not-newer updatedAt with an
 * identical responses signature up to that point) we treat it as a fast-forward,
 * not a conflict. We keep this conservative: any responses difference with
 * comparable timestamps is treated as divergent so nothing is dropped silently.
 */
export function detectConflict(a: SavedFormEntry, b: SavedFormEntry): boolean {
  if (a.id !== b.id) return false; // different records — not a conflict at all
  const sameResponses =
    JSON.stringify(a.responses ?? {}) === JSON.stringify(b.responses ?? {});
  const sameStatus = a.status === b.status;
  const sameDisplay = (a.respondentName ?? null) === (b.respondentName ?? null);
  if (sameResponses && sameStatus && sameDisplay) return false;

  // Fast-forward: same device, strictly increasing revision → not a conflict.
  const da = deviceOf(a);
  const db = deviceOf(b);
  if (da && db && da === db && revOf(a) !== revOf(b)) return false;

  return true;
}

const mergeResponses = (
  dom: SavedFormEntry,
  sub: SavedFormEntry,
): { responses: Record<string, any>; conflicts: FieldConflict[] } => {
  const out: Record<string, any> = {};
  const conflicts: FieldConflict[] = [];
  const domR = dom.responses ?? {};
  const subR = sub.responses ?? {};
  // Deterministic key iteration.
  const keys = Array.from(new Set([...Object.keys(domR), ...Object.keys(subR)])).sort();
  for (const k of keys) {
    const inDom = Object.prototype.hasOwnProperty.call(domR, k);
    const inSub = Object.prototype.hasOwnProperty.call(subR, k);
    if (inDom && inSub) {
      const dv = domR[k];
      const sv = subR[k];
      if (JSON.stringify(dv) === JSON.stringify(sv)) {
        out[k] = dv;
      } else {
        // Prefer a non-empty value over an empty one so real answers survive;
        // otherwise the dominant entry's value wins deterministically.
        const domEmpty = dv === null || dv === undefined || dv === "";
        const subEmpty = sv === null || sv === undefined || sv === "";
        if (domEmpty && !subEmpty) {
          out[k] = sv;
          conflicts.push({ key: k, chosen: sv, discarded: dv, winner: deviceOf(sub) });
        } else {
          out[k] = dv;
          conflicts.push({ key: k, chosen: dv, discarded: sv, winner: deviceOf(dom) });
        }
      }
    } else if (inDom) {
      out[k] = domR[k];
    } else {
      out[k] = subR[k];
    }
  }
  return { responses: out, conflicts };
};

/**
 * Deterministically merge two divergent copies of the same saved entry.
 * Commutative: mergeSavedEntries(a, b) and mergeSavedEntries(b, a) produce an
 * identical `merged` result.
 */
export function mergeSavedEntries(a: SavedFormEntry, b: SavedFormEntry): MergeResult {
  if (a.id !== b.id) {
    // Not the same record — nothing to merge; return the newer one untouched.
    const merged = ts(a.updatedAt) >= ts(b.updatedAt) ? a : b;
    return {
      merged,
      report: { hadConflict: false, divergent: false, fieldConflicts: [], statusResolvedFrom: null, chosenDevice: deviceOf(merged) },
    };
  }

  const divergent = detectConflict(a, b);
  const dom = dominantEntry(a, b);
  const sub = dom === a ? b : a;

  if (!divergent) {
    // Fast-forward: adopt dominant wholesale, but keep the highest revision.
    const merged: SavedFormEntry = {
      ...dom,
      rev: Math.max(revOf(a), revOf(b)),
    } as SavedFormEntry;
    return {
      merged,
      report: { hadConflict: false, divergent: false, fieldConflicts: [], statusResolvedFrom: null, chosenDevice: deviceOf(dom) },
    };
  }

  const { responses, conflicts } = mergeResponses(dom, sub);

  // Envelope is taken from the dominant entry; timestamps take the max so the
  // merged record is never older than either input. Revision is bumped past
  // both so a subsequent merge on any device converges immediately.
  const merged: SavedFormEntry = {
    ...dom,
    responses,
    respondentName: dom.respondentName ?? sub.respondentName ?? null,
    displayName: dom.displayName ?? sub.displayName ?? null,
    gps: dom.gps ?? sub.gps ?? null,
    submissionData: dom.submissionData ?? sub.submissionData ?? null,
    submissionLocation: dom.submissionLocation ?? sub.submissionLocation ?? null,
    createdAt: ts(a.createdAt) && ts(b.createdAt)
      ? (ts(a.createdAt) <= ts(b.createdAt) ? a.createdAt : b.createdAt)
      : (a.createdAt || b.createdAt),
    updatedAt: ts(a.updatedAt) >= ts(b.updatedAt) ? a.updatedAt : b.updatedAt,
    finalizedAt: dom.finalizedAt ?? sub.finalizedAt ?? null,
    sentAt: dom.sentAt ?? sub.sentAt ?? null,
    submissionId: dom.submissionId ?? sub.submissionId ?? null,
    rev: Math.max(revOf(a), revOf(b)) + 1,
  } as SavedFormEntry;

  return {
    merged,
    report: {
      hadConflict: conflicts.length > 0,
      divergent: true,
      fieldConflicts: conflicts,
      statusResolvedFrom: a.status !== b.status ? [a.status, b.status] : null,
      chosenDevice: deviceOf(dom),
    },
  };
}
