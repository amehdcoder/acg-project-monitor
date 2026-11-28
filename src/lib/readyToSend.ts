import { saveSavedEntry, listSavedEntries, type SavedFormEntry } from "./savedForms";
import { listReadyPendingInserts, flushSubmissionQueue } from "./offlineSubmissions";
import { listQueued, isFormCollectionQueueItem, flushQueue } from "./programmeModule/offlineQueue";

const entry = (id: string, userId: string, name: string, data: Record<string, any>, at: string, queue: string, projectId = ""): SavedFormEntry => ({
  id, userId, formId: "", formName: name, formDescription: "", projectId,
  questions: [], groups: [], geofence: null, settings: { readyQueue: queue }, responses: data,
  gps: null, status: "finalized", createdAt: at, updatedAt: at, finalizedAt: at,
});
const names: Record<string, string> = { bloomberg_validations: "Bloomberg School Enrolment Validation", seeclear_monitoring: "See Clear Facility Monitoring Checklist", bmz_monitoring: "Jigawa Eye Health Monitoring Checklist", microplan_entries: "Geo-enabled Microplanning Entry", eye_daily_reports: "Eye Health Daily Facility Report", eye_daily_patients: "Patient Disability Screening (WG-SS)" };

/** Surface dedicated-table queues without treating them as generic form submissions. */
export async function readyQueuedForms(userId: string): Promise<SavedFormEntry[]> {
  const pending = await listReadyPendingInserts(userId);
  const special = pending.map(record => ({ ...entry(record.id, userId, names[record.table] || "Completed form", record.row, record.created_at, "special", record.row.project_id || ""), lastSyncError: record.last_error, syncState: record.last_error ? "error" as const : "queued" as const, submissionId: record.row.id }));
  const operations = listQueued().filter(item => isFormCollectionQueueItem(item) && item.user_id === userId).map(item => {
    const payload = item.payload as Record<string, any>;
    const values = payload.values || payload.operations?.[0]?.values || {};
    return { ...entry(item.submission_uuid, userId, names[payload.table] || "Completed form", values, item.queued_at, "operation", values.project_id || ""), lastSyncError: item.last_error, syncState: item.last_error ? "error" as const : "queued" as const };
  });
  return [...special, ...operations];
}

export async function sendQueuedForm(entry: SavedFormEntry): Promise<boolean> {
  let sent = false;
  if (entry.settings.readyQueue === "special") {
    const result = await flushSubmissionQueue({ selectedIds: [entry.id], userId: entry.userId, force: true });
    sent = result.inserted === 1;
  }
  if (entry.settings.readyQueue === "operation") sent = (await flushQueue([entry.id])).sent === 1;
  if (sent) {
    const existing = entry.submissionId ? (await listSavedEntries(entry.userId, "sent")).some(row => row.submissionId === entry.submissionId) : false;
    if (!existing) await saveSavedEntry({ ...entry, status: "sent", sentAt: new Date().toISOString(), offline: false });
  }
  return sent;
}