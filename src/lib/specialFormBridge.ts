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
  type SavedFormEntry,
  type SavedFormStatus,
} from "@/lib/savedForms";

// Stable synthetic form ids so mirrored entries group nicely.
export const BLOOMBERG_FORM_ID = "bloomberg-school-enrolment-validation";
export const SEECLEAR_FORM_ID = "seeclear-eye-health-facility-checklist";

interface MirrorArgs {
  userId: string;
  formId: string;
  formName: string;
  formDescription: string;
  status: SavedFormStatus;
  responses?: Record<string, any>;
  gps?: { lat: number; lng: number; accuracy?: number } | null;
  submissionId?: string | null;
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
      sentAt: args.status === "sent" ? now : null,
      submissionId: args.submissionId ?? null,
      offline: false,
    };
    await saveSavedEntry(entry);
  } catch (e) {
    console.warn("mirrorSpecialForm failed (non-fatal):", e);
  }
}
