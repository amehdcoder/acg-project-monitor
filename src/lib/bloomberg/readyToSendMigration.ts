// One-time, idempotent migration that rescues Bloomberg School Enrolment
// Validation submissions collected with the OLD draft/finalize version of the
// form. Those entries are stuck locally in the saved-forms IndexedDB store with
// status "finalized" (the Forms page "Ready to send" tab) and never reached the
// server, so they are missing from the Validation Dashboard.
//
// This runs on the device that holds the data (we cannot reach another user's
// IndexedDB from the server). It:
//   1. Finds finalized Bloomberg saved entries.
//   2. Keeps only those collected from 8:00 AM Nigerian time on 17/06/2026
//      (the first day of live reporting) onward.
//   3. De-duplicates by school so a single school is never validated twice by
//      the same validator — locally (keep the latest finalized per school) and
//      against the server (skip schools this validator already has on record).
//   4. Inserts the survivors into bloomberg_validations as "sent", preserving
//      the original collection/finalize timestamps so all dashboard math,
//      coverage and statistics stay correct.
//   5. Marks the local entries "sent" so they leave the "Ready to send" tab.
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

// 8:00 AM on 17/06/2026, Nigerian time (WAT = UTC+1) => 07:00 UTC.
const LIVE_REPORTING_CUTOFF = Date.parse("2026-06-17T07:00:00.000Z");

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
  skippedBeforeCutoff: number;
}

export async function migrateReadyToSendBloomberg(
  userId: string,
): Promise<MigrationResult> {
  const result: MigrationResult = {
    migrated: 0,
    skippedDuplicate: 0,
    skippedBeforeCutoff: 0,
  };
  if (!userId) return result;

  // 1) Finalized Bloomberg entries waiting in "Ready to send".
  const finalized = (await listSavedEntries(userId, "finalized")).filter(
    isBloombergSavedEntry,
  );
  if (finalized.length === 0) return result;

  // 2) Apply the live-reporting cutoff.
  const eligible: SavedFormEntry[] = [];
  for (const e of finalized) {
    if (collectionTime(e) >= LIVE_REPORTING_CUTOFF) eligible.push(e);
    else result.skippedBeforeCutoff += 1;
  }
  if (eligible.length === 0) return result;

  // 3a) Local de-dup: one entry per school (the most recently finalized).
  const bySchool = new Map<string, SavedFormEntry>();
  const noKey: SavedFormEntry[] = [];
  for (const e of eligible) {
    const key = schoolKeyOf(e);
    if (!key) {
      noKey.push(e);
      continue;
    }
    const prev = bySchool.get(key);
    if (!prev || finalizeTime(e) >= finalizeTime(prev)) {
      if (prev) {
        // The superseded duplicate can be cleared from the device.
        await setSavedEntryStatus(prev.id, "sent", {
          submissionId: prev.submissionId || null,
          sentAt: new Date().toISOString(),
        });
        result.skippedDuplicate += 1;
      }
      bySchool.set(key, e);
    } else {
      await setSavedEntryStatus(e.id, "sent", {
        submissionId: e.submissionId || null,
        sentAt: new Date().toISOString(),
      });
      result.skippedDuplicate += 1;
    }
  }

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

  // 4) Insert survivors, preserving original timestamps. 5) Mark local as sent.
  for (const e of targets) {
    const key = schoolKeyOf(e);
    if (key && serverKeys.has(key)) {
      // Already validated by this user on the server — clear it locally to keep
      // the "Ready to send" tab accurate, but never create a duplicate row.
      await setSavedEntryStatus(e.id, "sent", {
        submissionId: e.submissionId || null,
        sentAt: new Date().toISOString(),
      });
      result.skippedDuplicate += 1;
      continue;
    }

    const submissionId = e.submissionId || crypto.randomUUID();
    const createdIso = new Date(collectionTime(e) || finalizeTime(e)).toISOString();
    const submittedIso = new Date(finalizeTime(e)).toISOString();

    const baseData = (e.submissionData || {}) as Record<string, any>;
    // Tag the verification payload so the dashboard can surface an admin-only
    // "Recovered submissions" indicator without needing a separate table. The
    // marker is additive and never overwrites real verification fields.
    const verification = {
      ...((baseData.verification && typeof baseData.verification === "object"
        ? baseData.verification
        : {}) as Record<string, any>),
      _recovered_from_ready_to_send: true,
      _recovered_at: new Date().toISOString(),
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

    try {
      await queueOrInsert("bloomberg_validations", row, true);
      await setSavedEntryStatus(e.id, "sent", {
        submissionId,
        sentAt: new Date().toISOString(),
      });
      if (key) serverKeys.add(key);
      result.migrated += 1;
    } catch {
      // Leave the entry as finalized so a later attempt can retry.
    }
  }

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
