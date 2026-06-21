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
  const responses = (entry.responses || {}) as Record<string, any>;
  const row = {
    ...(entry.submissionData || {}),
    id,
    validator_id: entry.userId,
    school_key: (entry.submissionData as any)?.school_key ?? responses.school_key ?? responses.schoolKey ?? null,
    state: (entry.submissionData as any)?.state ?? responses.state ?? null,
    lga: (entry.submissionData as any)?.lga ?? responses.lga ?? null,
    ward: (entry.submissionData as any)?.ward ?? responses.ward ?? null,
    location: (entry.submissionData as any)?.location ?? responses.location ?? null,
    school_name: (entry.submissionData as any)?.school_name ?? responses.school_name ?? null,
    school_code: (entry.submissionData as any)?.school_code ?? responses.school_code ?? null,
    school_type: (entry.submissionData as any)?.school_type ?? responses.school_type ?? null,
    school_level: (entry.submissionData as any)?.school_level ?? responses.school_level ?? null,
    ownership: (entry.submissionData as any)?.ownership ?? responses.ownership ?? null,
    gps_lat: (entry.submissionData as any)?.gps_lat ?? responses.gps?.lat ?? entry.gps?.lat ?? null,
    gps_lng: (entry.submissionData as any)?.gps_lng ?? responses.gps?.lng ?? entry.gps?.lng ?? null,
    gps_accuracy: (entry.submissionData as any)?.gps_accuracy ?? responses.gps?.accuracy ?? entry.gps?.accuracy ?? null,
    verification: (entry.submissionData as any)?.verification ?? responses.verification ?? null,
    enrolment: (entry.submissionData as any)?.enrolment ?? responses.enrolment ?? null,
    specified_locations: (entry.submissionData as any)?.specified_locations ?? responses.specified_locations ?? null,
    total_male: (entry.submissionData as any)?.total_male ?? responses.total_male ?? null,
    total_female: (entry.submissionData as any)?.total_female ?? responses.total_female ?? null,
    grand_total: (entry.submissionData as any)?.grand_total ?? responses.grand_total ?? null,
    evidence: (entry.submissionData as any)?.evidence ?? responses.evidence ?? null,
    remarks: (entry.submissionData as any)?.remarks ?? responses.remarks ?? null,
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
