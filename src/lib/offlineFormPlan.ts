import { offlineFormKey, ownedOfflineForm } from "./offlineFormAccess";

export interface OfflineFormSnapshot extends Record<string, any> {
  id: string;
  form_id?: string;
  owner_user_id?: string;
  project_id: string;
  name: string;
  description: string | null;
  status: string;
  questions: any[];
  geofence: any;
  settings: Record<string, any>;
  downloaded_at?: string;
  updated_at?: string | null;
  content_signature?: string;
}

export interface OfflineFormPlan {
  puts: OfflineFormSnapshot[];
  removeKeys: string[];
  addedForms: { id: string; name: string; project_id: string }[];
  updatedForms: { id: string; name: string; project_id: string }[];
  unchangedForms: { id: string; name: string; project_id: string }[];
}

const summary = (form: OfflineFormSnapshot) => ({
  id: form.id,
  name: form.name,
  project_id: form.project_id,
});

/** Return a complete, deterministic form snapshot suitable for offline rendering. */
export function normalizeOfflineForm(form: Record<string, any>): OfflineFormSnapshot {
  const id = String(form.form_id || form.id || "");
  return {
    ...form,
    id,
    name: String(form.name || "Untitled form"),
    description: form.description ?? null,
    status: String(form.status || "active"),
    project_id: String(form.project_id || ""),
    questions: Array.isArray(form.questions) ? form.questions : [],
    geofence: form.geofence ?? null,
    settings: form.settings && typeof form.settings === "object" ? form.settings : {},
    created_at: form.created_at || null,
    // Never use the current time as a content version: doing so would make an
    // unchanged form look updated on every check.
    updated_at: form.updated_at || form.created_at || null,
  } as OfflineFormSnapshot;
}

const stableValue = (value: any): any => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
};

/** A stable content fingerprint; server timestamps alone are not trusted. */
export function offlineFormSignature(form: Record<string, any>): string {
  const normalized = normalizeOfflineForm(form);
  const canonical: Record<string, any> = { ...normalized };
  for (const key of [
    "downloaded_at",
    "content_signature",
    "owner_user_id",
    "form_id",
    "__sealed",
    // Submission totals are presentation metadata, not form-definition changes.
    "submissions_count",
    // Groups are a derived render view already contained in `questions`.
    // Keeping both in the fingerprint would make Forms-page and background
    // snapshots alternately look different even when nothing changed.
    "groups",
  ]) delete canonical[key];
  const text = JSON.stringify(stableValue(canonical));
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i++) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(text.charCodeAt(i))) * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

export function offlineFormContentChanged(
  existing: Record<string, any> | null | undefined,
  incoming: Record<string, any>,
): boolean {
  if (!existing) return true;
  return offlineFormSignature(existing) !== offlineFormSignature(incoming);
}

/**
 * Plan a minimal offline-library write. By default this never prunes, because
 * callers may be supplying only one project or one visible page. A complete
 * server-authorized fetch opts into pruning revoked definitions explicitly.
 */
export function planOfflineFormChanges(
  existingRows: Record<string, any>[],
  authorizedForms: Record<string, any>[],
  userId: string,
  options: { prune?: boolean; now?: string } = {},
): OfflineFormPlan {
  const now = options.now || new Date().toISOString();
  const owned = existingRows.filter(
    (row) => row?.owner_user_id === userId && typeof row?.form_id === "string",
  );
  const existingByFormId = new Map<string, Record<string, any>>();
  for (const row of owned) {
    const previous = existingByFormId.get(row.form_id);
    if (!previous || String(row.downloaded_at || "").localeCompare(String(previous.downloaded_at || "")) > 0) {
      existingByFormId.set(row.form_id, row);
    }
  }

  const uniqueAuthorized = new Map<string, Record<string, any>>();
  for (const form of authorizedForms) {
    if (form?.id) uniqueAuthorized.set(String(form.id), form);
  }

  const plan: OfflineFormPlan = {
    puts: [],
    removeKeys: [],
    addedForms: [],
    updatedForms: [],
    unchangedForms: [],
  };

  for (const [formId, raw] of uniqueAuthorized) {
    const incoming = normalizeOfflineForm(raw);
    const existing = existingByFormId.get(formId);
    if (!offlineFormContentChanged(existing, incoming)) {
      plan.unchangedForms.push(summary(incoming));
      continue;
    }
    const signature = offlineFormSignature(incoming);
    const owned = ownedOfflineForm({
      ...incoming,
      content_signature: signature,
      downloaded_at: now,
    }, userId) as OfflineFormSnapshot;
    plan.puts.push(owned);
    (existing ? plan.updatedForms : plan.addedForms).push(summary(incoming));
  }

  if (options.prune) {
    for (const row of owned) {
      if (!uniqueAuthorized.has(row.form_id)) {
        plan.removeKeys.push(String(row.id || offlineFormKey(userId, row.form_id)));
      }
    }
  }
  return plan;
}
