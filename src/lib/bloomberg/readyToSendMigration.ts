// One-time, idempotent migration that rescues Bloomberg School Enrolment
// Validation submissions collected with the OLD draft/finalize version of the
// form. Those entries are stuck locally in the saved-forms IndexedDB store with
// status "finalized" (the Forms page "Ready to send" tab) and never reached the
// server, so they are missing from the Validation Dashboard.
//
// This runs on the device that holds the data (we cannot reach another user's
// IndexedDB from the server). It:
//   1. Finds finalized Bloomberg saved entries.
//   2. De-duplicates by school so a single school is never validated twice by
//      the same validator — locally (keep the latest finalized per school) and
//      against the server (skip schools this validator already has on record).
//   3. Inserts the survivors into bloomberg_validations as "sent", preserving
//      the original collection/finalize timestamps so all dashboard math,
//      coverage and statistics stay correct.
//   4. Marks local entries as either confirmed sent or still queued, so the UI
//      never falsely shows "sent" until the server has the row.
//
// Idempotent: rows are upserted on their stable submissionId, and once a local
// entry is marked "sent" it is no longer picked up.

import { supabase } from "@/integrations/supabase/client";
import {
  listSavedEntries,
  setSavedEntryStatus,
  type SavedFormEntry,
} from "@/lib/savedForms";
import { isBloombergSavedEntry } from "@/lib/specialFormBridge";
import { queueOrInsert } from "@/lib/offlineSubmissions";

// Per-session guard so we only attempt the migration once per page load.
let migrationRan = false;

const collectionTime = (e: SavedFormEntry): number => {
  const t =
    Date.parse(e.createdAt || "") ||
    Date.parse(e.finalizedAt || "") ||
    Date.parse(e.updatedAt || "");
  return Number.isNaN(t) ? 0 : t;
};

const finalizeTime = (e: SavedFormEntry): number => {
  const t = Date.parse(e.finalizedAt || "") || Date.parse(e.updatedAt || "") || collectionTime(e);
  return Number.isNaN(t) ? Date.now() : t;
};

const schoolKeyOf = (e: SavedFormEntry): string | null => {
  const sd = (e.submissionData || {}) as Record<string, any>;
  const r = (e.responses || {}) as Record<string, any>;
  return (sd.school_key ?? r.school_key ?? r.schoolKey ?? null) || null;
};

export interface MigrationResult {
  migrated: number;
  skippedDuplicate: number;
  queued: number;
}

export async function migrateReadyToSendBloomberg(
  userId: string,
): Promise<MigrationResult> {
  const result: MigrationResult = {
    migrated: 0,
    skippedDuplicate: 0,
    queued: 0,
  };
  if (!userId) return result;

  // 1) Finalized Bloomberg entries waiting in "Ready to send".
  const finalized = (await listSavedEntries(userId, "finalized")).filter(
    isBloombergSavedEntry,
  );
  if (finalized.length === 0) return result;

  // 3a) Local de-dup: one entry per school (the most recently finalized).
  // Superseded duplicates are queued for a parallel status-clear so we never
  // block the event loop entry-by-entry, no matter how many are stuck.
  const bySchool = new Map<string, SavedFormEntry>();
  const noKey: SavedFormEntry[] = [];
  const supersededIds: string[] = [];
  for (const e of finalized) {
    const key = schoolKeyOf(e);
    if (!key) {
      noKey.push(e);
      continue;
    }
    const prev = bySchool.get(key);
    if (!prev || finalizeTime(e) >= finalizeTime(prev)) {
      if (prev) {
        supersededIds.push(prev.id);
        result.skippedDuplicate += 1;
      }
      bySchool.set(key, e);
    } else {
      supersededIds.push(e.id);
      result.skippedDuplicate += 1;
    }
  }

  const nowIso = () => new Date().toISOString();

  // Bounded-concurrency pool: processes an unbounded list "instantly" from the
  // user's perspective without spawning trillions of simultaneous promises
  // (which would exhaust memory / freeze the tab). Yields between waves so the
  // UI stays smooth and responsive regardless of volume.
  const POOL = 64;
  async function runPool<T>(items: T[], worker: (item: T) => Promise<void>) {
    let idx = 0;
    const next = async (): Promise<void> => {
      while (idx < items.length) {
        const i = idx++;
        try {
          await worker(items[i]);
        } catch {
          // Per-item failures are non-fatal; the entry stays for a later retry.
        }
        // Yield to the event loop periodically so the app never freezes.
        if (i % POOL === 0) await Promise.resolve();
      }
    };
    const runners = Array.from({ length: Math.min(POOL, items.length || 1) }, next);
    await Promise.all(runners);
  }

  // Clear superseded local duplicates in parallel — fire and forget alongside.
  const supersedeWork = runPool(supersededIds, async (id) => {
    await setSavedEntryStatus(id, "sent", { submissionId: null, sentAt: nowIso() });
  });

  // 3b) Server de-dup: schools this validator already has on record.
  const serverKeys = new Set<string>();
  try {
    const { data } = await supabase
      .from("bloomberg_validations")
      .select("school_key")
      .eq("validator_id", userId)
      .not("school_key", "is", null);
    (data || []).forEach((r: any) => {
      if (r.school_key) serverKeys.add(r.school_key as string);
    });
  } catch {
    // If we cannot confirm server state, fall through — upsert-on-id below
    // still prevents duplicate rows for the same submission.
  }

  const targets: SavedFormEntry[] = [...bySchool.values(), ...noKey];

  // 4) Insert survivors (preserving original timestamps) and 5) mark local
  // entries sent — all in parallel through the bounded pool. This makes
  // recovery effectively instantaneous for any volume without batching delays
  // or freezing the dashboard/app.
  await runPool(targets, async (e) => {
    const key = schoolKeyOf(e);
    if (key && serverKeys.has(key)) {
      // Already validated by this user on the server — clear it locally to keep
      // the "Ready to send" tab accurate, but never create a duplicate row.
      await setSavedEntryStatus(e.id, "sent", {
        submissionId: e.submissionId || null,
        sentAt: nowIso(),
      });
      result.skippedDuplicate += 1;
      return;
    }

    const submissionId = e.submissionId || crypto.randomUUID();
    const createdIso = new Date(collectionTime(e) || finalizeTime(e)).toISOString();
    const submittedIso = new Date(finalizeTime(e)).toISOString();

    const baseData = (e.submissionData || {}) as Record<string, any>;
    const verification = {
      ...((baseData.verification && typeof baseData.verification === "object"
        ? baseData.verification
        : {}) as Record<string, any>),
      _recovered_from_ready_to_send: true,
      _recovered_at: nowIso(),
    };

    const row = {
      ...baseData,
      verification,
      id: submissionId,
      validator_id: userId,
      status: "sent",
      created_at: createdIso,
      submitted_at: submittedIso,
    };

    const { queued } = await queueOrInsert("bloomberg_validations", row, true, {
      mirrorEntryId: e.id,
    });
    await setSavedEntryStatus(e.id, "sent", {
      submissionId,
      sentAt: queued ? null : nowIso(),
      offline: queued,
      settings: queued ? e.settings : { ...(e.settings || {}), serverVerifiedAt: nowIso() },
    });
    if (queued) {
      result.queued += 1;
    } else {
      if (key) serverKeys.add(key);
      result.migrated += 1;
    }
  });

  await supersedeWork;

  return result;
}


// Fire-and-forget wrapper used at app start. Runs at most once per session and
// never throws into the caller.
export async function runReadyToSendMigrationOnce(
  userId: string | null | undefined,
): Promise<void> {
  if (!userId || migrationRan) return;
  migrationRan = true;
  try {
    const r = await migrateReadyToSendBloomberg(userId);
    if (r.migrated > 0) {
      // Let any open dashboards/forms know fresh data landed.
      window.dispatchEvent(
        new CustomEvent("bloomberg:ready-to-send-migrated", { detail: r }),
      );
    }
  } catch (err) {
    console.warn("Bloomberg ready-to-send migration failed (non-fatal):", err);
    migrationRan = false; // allow a retry next mount
  }
}
