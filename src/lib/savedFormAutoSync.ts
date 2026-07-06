import { supabase } from "@/integrations/supabase/client";
import { listAllSavedEntries, setSavedEntryStatus, type SavedFormEntry } from "@/lib/savedForms";
import { isSpecialBridgeEntry, syncSpecialSavedForm } from "@/lib/specialFormBridge";

let started = false;
let syncing = false;

const isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine);

async function sendOne(entry: SavedFormEntry): Promise<boolean> {
  const special = isSpecialBridgeEntry(entry) ? await syncSpecialSavedForm(entry) : null;
  if (special?.success) return true;

  const submissionId = crypto.randomUUID();
  const sentAt = new Date().toISOString();
  const row = {
    id: submissionId,
    form_id: entry.formId,
    user_id: entry.userId,
    data: entry.submissionData || entry.responses || {},
    location: entry.submissionLocation || null,
    within_geofence: entry.withinGeofence ?? null,
    submission_type: entry.submissionType || "regular",
    status: "sent",
    submitted_at: entry.finalizedAt || entry.updatedAt || sentAt,
    synced_at: sentAt,
  };
  const { error } = await supabase.from("form_submissions").insert(row as any);
  if (error) throw error;
  await setSavedEntryStatus(entry.id, "sent", {
    submissionId,
    sentAt,
    offline: false,
    displayName: entry.displayName || null,
  });
  return true;
}

export async function syncFinalizedSavedForms(): Promise<{ synced: number; failed: number }> {
  if (syncing || !isOnline()) return { synced: 0, failed: 0 };
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } } as any));
  const userId = data?.session?.user?.id;
  if (!userId) return { synced: 0, failed: 0 };

  syncing = true;
  let synced = 0;
  let failed = 0;
  try {
    const entries = (await listAllSavedEntries("finalized")).filter((e) => e.userId === userId);
    for (const entry of entries) {
      if (!isOnline()) break;
      try {
        if (await sendOne(entry)) synced++;
      } catch {
        failed++;
      }
    }
  } finally {
    syncing = false;
  }
  return { synced, failed };
}

export function initSavedFormAutoSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => void syncFinalizedSavedForms());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncFinalizedSavedForms();
  });
  window.setInterval(() => void syncFinalizedSavedForms(), 20000);
  void syncFinalizedSavedForms();
}