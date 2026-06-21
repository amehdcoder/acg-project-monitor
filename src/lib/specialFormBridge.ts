// Bridges the standalone Bloomberg / SeeClear form fillers into the shared
// saved-forms lifecycle store so their submissions surface in the Forms page
// tabs (Drafts / Ready to send / Sent) exactly like the normal workflow.
//
// These specialised fillers persist their authoritative data in their own
// Supabase tables (bloomberg_validations, seeclear_monitoring). This helper
// only writes a lightweight mirror entry into the local saved-forms IndexedDB
// store so the user sees a consistent record in the Forms page UI.

import {
  saveSavedEntry,
  newEntryId,
  setSavedEntryStatus,
  type SavedFormEntry,
  type SavedFormStatus,
} from "@/lib/savedForms";
import { queueOrInsert } from "@/lib/offlineSubmissions";

// Stable synthetic form ids so mirrored entries group nicely.
export const BLOOMBERG_FORM_ID = "bloomberg-school-enrolment-validation";
export const SEECLEAR_FORM_ID = "seeclear-eye-health-facility-checklist";
export const BLOOMBERG_SPECIAL_FORM_KEY = "bloomberg";
export const SEECLEAR_SPECIAL_FORM_KEY = "seeclear";

interface MirrorArgs {
  userId: string;
  formId: string;
  formName: string;
  formDescription: string;
  status: SavedFormStatus;
  responses?: Record<string, any>;
  gps?: { lat: number; lng: number; accuracy?: number } | null;
  submissionId?: string | null;
  offline?: boolean;
}

/**
 * Write (or refresh) a saved-forms mirror entry for a specialised form
 * submission. Best-effort: never throws into the caller's submit flow.
 */
export async function mirrorSpecialForm(args: MirrorArgs): Promise<void> {
  try {
    const now = new Date().toISOString();
    const entry: SavedFormEntry = {
      id: newEntryId(),
      userId: args.userId,
      formId: args.formId,
      formName: args.formName,
      formDescription: args.formDescription,
      projectId: "",
      questions: [],
      groups: [],
      geofence: null,
      settings: { specialBridge: true },
      responses: args.responses ?? {},
      gps: args.gps ?? null,
      submissionData: args.responses ?? null,
      submissionLocation: args.gps ? { lat: args.gps.lat, lng: args.gps.lng } : null,
      withinGeofence: null,
      submissionType: args.formId,
      status: args.status,
      createdAt: now,
      updatedAt: now,
      finalizedAt: args.status !== "draft" ? now : null,
      sentAt: args.status === "sent" && !args.offline ? now : null,
      submissionId: args.submissionId ?? null,
      offline: !!args.offline,
    };
    await saveSavedEntry(entry);
  } catch (e) {
    console.warn("mirrorSpecialForm failed (non-fatal):", e);
  }
}

export const isBloombergSavedEntry = (entry: SavedFormEntry | null | undefined): boolean =>
  !!entry &&
  (entry.formId === BLOOMBERG_FORM_ID || entry.formId === "bloomberg_enrolment") &&
  (entry.settings?.specialForm === BLOOMBERG_SPECIAL_FORM_KEY || entry.settings?.specialBridge === true || /bloomberg/i.test(entry.formName || ""));

// Special bridge forms (Bloomberg / SeeClear) are not strictly bound to a single
// project context, so they must surface in the Forms tabs regardless of which
// project happens to be selected when viewing the saved-forms lists.
export const isSpecialBridgeEntry = (entry: SavedFormEntry | null | undefined): boolean =>
  !!entry &&
  (entry.settings?.specialBridge === true ||
    entry.settings?.specialForm === BLOOMBERG_SPECIAL_FORM_KEY ||
    entry.settings?.specialForm === SEECLEAR_SPECIAL_FORM_KEY);

export async function syncSpecialSavedForm(
  entry: SavedFormEntry,
): Promise<{ success: boolean; offline: boolean; id: string } | null> {
  if (!isBloombergSavedEntry(entry)) return null;

  const now = new Date().toISOString();
  const id = entry.submissionId || crypto.randomUUID();
  const row = {
    ...(entry.submissionData || {}),
    id,
    validator_id: entry.userId,
    status: "sent",
    submitted_at: now,
  };

  const { queued } = await queueOrInsert("bloomberg_validations", row, true, {
    mirrorEntryId: entry.id,
  });
  if (!queued) {
    await setSavedEntryStatus(entry.id, "sent", {
      submissionId: id,
      sentAt: now,
      offline: false,
      settings: { ...(entry.settings || {}), serverVerifiedAt: now },
    });
  }
  return { success: true, offline: queued, id };
}
