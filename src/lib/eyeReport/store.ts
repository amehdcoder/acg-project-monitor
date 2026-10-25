// Offline-first persistence for Eye Health daily reports.
//  • Signed-in users: offlineMutate (direct when online, queued on the device otherwise).
//  • Account-free devices: saved-form queue drained by project-collect (kind "eye_daily").
import { supabase } from "@/integrations/supabase/client";
import { cachedRead, cachePatchRows } from "@/lib/programmeModule/offlineReadCache";
import { offlineMutate } from "@/lib/programmeModule/offlineWrite";
import { saveSavedEntry, listAllSavedEntries } from "@/lib/savedForms";
import { syncDeviceRecords } from "@/lib/deviceSync";
import type { EyePatientRow, EyeReportRow } from "./definition";

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: any) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export const cacheKey = (projectId: string) => `eye-reports:${projectId}`;
export const patientCacheKey = (projectId: string) => `eye-patients:${projectId}`;

export async function loadReports(projectId: string): Promise<{ rows: EyeReportRow[]; fromCache: boolean }> {
  const { data, fromCache } = await cachedRead<EyeReportRow[]>(cacheKey(projectId), () =>
    db.from("eye_daily_reports").select("*").eq("project_id", projectId).order("report_date", { ascending: false }).limit(10000));
  return { rows: data ?? [], fromCache };
}

export type ReportPayload = Omit<EyeReportRow, "id" | "created_by" | "device_id" | "collector_label"> & { id?: string };

export async function saveReport(payload: ReportPayload, userId: string, editing: boolean): Promise<{ id: string; queued: boolean }> {
  const id = payload.id || crypto.randomUUID();
  const values = { ...payload, id, ...(editing ? {} : { created_by: userId }) };
  const res = editing
    ? await offlineMutate({ table: "eye_daily_reports", action: "update", id, values: { ...payload, id: undefined } as any })
    : await offlineMutate({ table: "eye_daily_reports", action: "insert", values });
  await cachePatchRows(cacheKey(payload.project_id), id, { ...values, created_by: userId }, !editing);
  return { id, queued: res.queued };
}

export async function deleteReport(projectId: string, id: string) {
  await offlineMutate({ table: "eye_daily_reports", action: "delete", id });
  await cachePatchRows(cacheKey(projectId), id, null);
}

/** Account-free: store the finished report in the device queue and try to send it. */
export async function saveDeviceReport(payload: ReportPayload, device: { deviceId: string; projectId: string; label: string }) {
  const id = payload.id || crypto.randomUUID();
  const now = new Date().toISOString();
  await saveSavedEntry({
    id, userId: `device:${device.deviceId}`, formId: "eye_daily", formName: "Eye Health Daily Report",
    displayName: `${payload.facility_name} · ${payload.report_date}`, formDescription: "", projectId: device.projectId,
    questions: [], groups: [], geofence: null, settings: { kind: "eye_daily" }, responses: payload as any, gps: null,
    submissionData: { ...payload, prepared_by: payload.prepared_by || device.label } as any, status: "finalized",
    createdAt: now, updatedAt: now, finalizedAt: now, submissionId: id, offline: !navigator.onLine, deviceId: device.deviceId,
  } as any);
  if (navigator.onLine) void syncDeviceRecords().catch(() => undefined);
  return id;
}

export async function listDeviceReports(deviceId: string, projectId: string): Promise<EyeReportRow[]> {
  const lists = await Promise.all([listAllSavedEntries("finalized"), listAllSavedEntries("sent")]);
  return lists.flat()
    .filter((e) => e.settings?.kind === "eye_daily" && e.userId === `device:${deviceId}` && e.projectId === projectId)
    .map((e) => ({ ...(e.submissionData as any), id: e.id, _status: e.status } as EyeReportRow));
}

// ── Per-patient WG-SS screenings ────────────────────────────────────────────

export async function loadPatients(projectId: string): Promise<{ rows: EyePatientRow[]; fromCache: boolean }> {
  const { data, fromCache } = await cachedRead<EyePatientRow[]>(patientCacheKey(projectId), () =>
    db.from("eye_daily_patients").select("*").eq("project_id", projectId).order("report_date", { ascending: false }).limit(20000));
  return { rows: data ?? [], fromCache };
}

export type PatientPayload = Omit<EyePatientRow, "id" | "created_by" | "device_id" | "collector_label" | "created_at" | "updated_at"> & { id?: string };

/**
 * Saves the screenings for one facility day. When `reportId` is given the day's
 * previous rows are replaced so editing a report never duplicates patients.
 */
export async function savePatients(rows: PatientPayload[], userId: string, replaceReportId?: string | null): Promise<{ queued: boolean }> {
  let queued = false;
  if (replaceReportId) {
    const existing = (await loadPatients(rows[0]?.project_id ?? "")).rows.filter((r) => r.report_id === replaceReportId);
    for (const old of existing) {
      const res = await offlineMutate({ table: "eye_daily_patients", action: "delete", id: old.id });
      queued = queued || res.queued;
      await cachePatchRows(patientCacheKey(old.project_id), old.id, null);
    }
  }
  for (const p of rows) {
    const id = p.id || crypto.randomUUID();
    const values = { ...p, id, created_by: userId };
    const res = await offlineMutate({ table: "eye_daily_patients", action: "insert", values });
    queued = queued || res.queued;
    await cachePatchRows(patientCacheKey(p.project_id), id, values, true);
  }
  return { queued };
}

/** Account-free: queue the day's screenings on the device and try to send them. */
export async function saveDevicePatients(rows: PatientPayload[], device: { deviceId: string; projectId: string; label: string }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const first = rows[0];
  await saveSavedEntry({
    id, userId: `device:${device.deviceId}`, formId: "eye_wgss", formName: "Eye Health WG-SS Screenings",
    displayName: `${first?.facility_name ?? "Facility"} · ${first?.report_date ?? ""} · ${rows.length} patients`, formDescription: "", projectId: device.projectId,
    questions: [], groups: [], geofence: null, settings: { kind: "eye_wgss" }, responses: { patients: rows } as any, gps: null,
    submissionData: { patients: rows.map((p) => ({ ...p, collector_label: device.label })) } as any, status: "finalized",
    createdAt: now, updatedAt: now, finalizedAt: now, submissionId: id, offline: !navigator.onLine, deviceId: device.deviceId,
  } as any);
  if (navigator.onLine) void syncDeviceRecords().catch(() => undefined);
  return id;
}

export async function listDevicePatients(deviceId: string, projectId: string): Promise<EyePatientRow[]> {
  const lists = await Promise.all([listAllSavedEntries("finalized"), listAllSavedEntries("sent")]);
  return lists.flat()
    .filter((e) => e.settings?.kind === "eye_wgss" && e.userId === `device:${deviceId}` && e.projectId === projectId)
    .flatMap((e) => (((e.submissionData as any)?.patients ?? []) as any[]).map((p, i) => ({ ...p, id: p.id ?? `${e.id}-${i}`, _status: e.status } as EyePatientRow)));
}
