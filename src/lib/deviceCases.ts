// Offline case creation for account-free (QR-joined) devices.
//
// A case opened on a device is stored in the same local IndexedDB queue used by
// forms, tagged `settings.kind = "case"`, so it survives a cold offline boot and
// is pushed by the shared device sync loop when a connection returns.

import { newEntryId, saveSavedEntry, type SavedFormEntry } from "@/lib/savedForms";
import { deviceUserId } from "@/lib/deviceSession";

export interface DeviceCaseInput {
  caseTypeId: string;
  caseTypeLabel: string;
  deviceId: string;
  projectId: string;
  collectorLabel: string;
  caseName: string;
  properties: Record<string, string>;
  gps?: { lat: number; lng: number; accuracy?: number } | null;
}

/** Save a new case on this device. It syncs automatically once online. */
export const saveDeviceCase = async (input: DeviceCaseInput): Promise<string> => {
  const now = new Date().toISOString();
  const submissionId = crypto.randomUUID();
  const entry: SavedFormEntry = {
    id: newEntryId(),
    userId: deviceUserId(input.deviceId),
    formId: input.caseTypeId,
    formName: input.caseTypeLabel,
    displayName: input.caseName,
    formDescription: "",
    projectId: input.projectId,
    questions: [],
    groups: [],
    geofence: null,
    settings: {
      kind: "case",
      caseTypeId: input.caseTypeId,
      caseName: input.caseName,
      collectorLabel: input.collectorLabel,
    },
    responses: input.properties,
    gps: input.gps ?? null,
    submissionData: input.properties,
    submissionLocation: input.gps ? { lat: input.gps.lat, lng: input.gps.lng } : null,
    withinGeofence: null,
    submissionType: "case",
    status: "finalized",
    createdAt: now,
    updatedAt: now,
    finalizedAt: now,
    submissionId,
    offline: true,
    deviceId: input.deviceId,
    rev: 1,
  };
  await saveSavedEntry(entry);
  return submissionId;
};
