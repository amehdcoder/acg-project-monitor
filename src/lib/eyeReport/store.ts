// Offline-first persistence for Eye Health daily reports.
//  • Signed-in users: offlineMutate (direct when online, queued on the device otherwise).
//  • Account-free devices: saved-form queue drained by project-collect (kind "eye_daily").
import { supabase } from "@/integrations/supabase/client";
import { cachedRead, cachePatchRows } from "@/lib/programmeModule/offlineReadCache";
import { offlineMutate } from "@/lib/programmeModule/offlineWrite";
import { saveSavedEntry, listAllSavedEntries } from "@/lib/savedForms";
import { syncDeviceRecords } from "@/lib/deviceSync";
import type { EyeReportRow } from "./definition";

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: any) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export const cacheKey = (projectId: string) => `eye-reports:${projectId}`;

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
