// Offline storage for See Clear facility visits captured by account-free
// collector devices.
//
// A visit is kept as a normal saved-form entry (the same IndexedDB store the
// rest of the app uses for Draft / Ready / Sent), tagged with `kind: "seeclear"`
// so the device sync engine routes it to the checklist intake instead of the
// generic form submissions table. Photos travel as data URLs and are uploaded
// server-side on sync, so capture works with no network at all.

import { saveSavedEntry, type SavedFormEntry } from "@/lib/savedForms";
import { deviceUserId } from "@/lib/deviceSession";
import { SEECLEAR_FORM_ID } from "@/lib/specialFormBridge";

export interface DeviceSeeClearVisit {
  entryId: string;
  submissionId: string;
  deviceId: string;
  projectId: string;
  collectorLabel: string;
  asDraft: boolean;
  title: string;
  row: Record<string, any>;
  photos: Record<string, string>;
  gps: { lat: number; lng: number; accuracy?: number } | null;
}

export async function saveDeviceSeeClearVisit(visit: DeviceSeeClearVisit): Promise<void> {
  const now = new Date().toISOString();
  const entry: SavedFormEntry = {
    id: visit.entryId,
    userId: deviceUserId(visit.deviceId),
    formId: SEECLEAR_FORM_ID,
    formName: "See Clear Eye Health Facility Checklist",
    displayName: visit.title,
    formDescription: visit.title,
    projectId: visit.projectId,
    questions: [],
    groups: [],
    geofence: null,
    settings: { kind: "seeclear", photos: visit.photos, collectorLabel: visit.collectorLabel },
    responses: visit.row,
    gps: visit.gps,
    submissionData: visit.row,
    submissionLocation: visit.gps ? { lat: visit.gps.lat, lng: visit.gps.lng } : null,
    withinGeofence: null,
    submissionType: "seeclear",
    status: visit.asDraft ? "draft" : "finalized",
    createdAt: now,
    updatedAt: now,
    finalizedAt: visit.asDraft ? null : now,
    submissionId: visit.submissionId,
    offline: true,
    deviceId: visit.deviceId,
  };
  await saveSavedEntry(entry);
}
