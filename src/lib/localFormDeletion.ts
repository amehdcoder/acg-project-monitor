import { listSavedEntries, deleteSavedEntries, hasActiveSyncLease } from "./savedForms";
import { listDeletionPendingInserts, deleteSelectedPendingInserts } from "./offlineSubmissions";
import { listQueued, isFormCollectionQueueItem, deleteQueuedFormOperations } from "./programmeModule/offlineQueue";
import { listLocalAnswerRows, deleteLocalAnswerRows } from "./offlineFormCache";

export interface DeletableSavedForm {
  id: string;
  name: string;
  formName: string;
  projectId: string;
  status: "draft" | "finalized" | "sent";
  date: string;
  busy: boolean;
  savedIds: string[];
  specialIds: string[];
  operationIds: string[];
  pendingIds: string[];
  draftIds: string[];
}
const names: Record<string, string> = { bloomberg_validations: "Bloomberg School Enrolment Validation", seeclear_monitoring: "See Clear Facility Monitoring Checklist", bmz_monitoring: "Jigawa Eye Health Monitoring Checklist", microplan_entries: "Geo-enabled Microplanning Entry", eye_daily_reports: "Eye Health Daily Facility Report", eye_daily_patients: "Patient Disability Screening (WG-SS)" };

/** All local lifecycle states, with transport copies folded into their saved instance. */
export async function listDeletableSavedForms(userId: string, formNames: Record<string, string> = {}): Promise<DeletableSavedForm[]> {
  if (!userId) return [];
  const [saved, special, legacy] = await Promise.all([listSavedEntries(userId), listDeletionPendingInserts(userId), listLocalAnswerRows(userId)]);
  const rows: DeletableSavedForm[] = saved.map(row => ({ id: `saved:${row.id}`, name: row.displayName || row.respondentName || row.formName, formName: row.formName, projectId: row.projectId, status: row.status, date: row.sentAt || row.finalizedAt || row.updatedAt, busy: hasActiveSyncLease(row), savedIds: [row.id], specialIds: [], operationIds: [], pendingIds: [], draftIds: [] }));
  const findMirror = (id?: string | null, submissionId?: string) => {
    const mirror = saved.find(row => row.id === id || (!!submissionId && (row.submissionId === submissionId || row.id === submissionId)));
    return mirror ? rows.find(row => row.savedIds.includes(mirror.id)) : undefined;
  };
  const add = (id: string, name: string, status: DeletableSavedForm["status"], date: string, projectId = "") => {
    const row: DeletableSavedForm = { id, name, formName: name, projectId, status, date, busy: false, savedIds: [], specialIds: [], operationIds: [], pendingIds: [], draftIds: [] };
    rows.push(row); return row;
  };
  for (const record of special) {
    const row = findMirror(record.mirrorEntryId, record.row.id) || add(`special:${record.id}`, names[record.table] || "Saved form", record.row.status === "draft" ? "draft" : "finalized", record.created_at, record.row.project_id);
    row.specialIds.push(record.id); row.status = record.row.status === "draft" ? "draft" : "finalized";
  }
  for (const item of listQueued().filter(row => row.user_id === userId && isFormCollectionQueueItem(row))) {
    const payload = item.payload as Record<string, any>;
    const values = payload.values || payload.operations?.[0]?.values || {};
    const row = findMirror(undefined, values.id) || add(`operation:${item.submission_uuid}`, names[payload.table] || "Saved form", "finalized", item.queued_at, values.project_id);
    row.operationIds.push(item.submission_uuid); row.status = "finalized";
  }
  for (const record of legacy.pending) {
    const row = findMirror(record.id, record.submission_uuid || record.id) || add(`pending:${record.id}`, record.form_name || formNames[record.form_id] || "Saved form", "finalized", record.created_at);
    row.pendingIds.push(record.id); row.status = "finalized";
  }
  for (const record of legacy.drafts) {
    add(`draft:${record.id}`, formNames[record.form_id] || "Autosaved draft", "draft", record.updated_at).draftIds.push(record.id);
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export async function deleteSelectedSavedForms(userId: string, ids: string[], isCurrentAccount: () => boolean = () => true): Promise<{ deleted: number; failed: number }> {
  if (!userId || !isCurrentAccount()) throw new Error("Your account changed. Select forms again.");
  const selected = new Set(ids);
  const rows = (await listDeletableSavedForms(userId)).filter(row => selected.has(row.id));
  let deleted = 0; let failed = 0;
  for (const row of rows) {
    if (!isCurrentAccount()) throw new Error("Your account changed. Select forms again.");
    if (row.busy) { failed++; continue; }
    try {
      // Remove outbound copies first, so deleting an instance cannot leave a hidden send behind.
      if (row.specialIds.length) await deleteSelectedPendingInserts(userId, row.specialIds, isCurrentAccount);
      if (row.operationIds.length) deleteQueuedFormOperations(userId, row.operationIds);
      if (row.pendingIds.length || row.draftIds.length) await deleteLocalAnswerRows(userId, row.pendingIds, row.draftIds, isCurrentAccount);
      if (row.savedIds.length) await deleteSavedEntries(row.savedIds, userId, isCurrentAccount);
      deleted++;
    } catch { failed++; }
  }
  window.dispatchEvent(new CustomEvent("saved-forms-sync-completed", { detail: { userId } }));
  return { deleted, failed };
}