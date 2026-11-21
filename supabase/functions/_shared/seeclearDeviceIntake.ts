// Server-side intake for See Clear facility visits captured on account-free
// collector devices.
//
// A queued visit arrives as the exact payload the checklist produced. Here it
// is (1) stored in `seeclear_monitoring` so the dashboard shows it immediately,
// and (2) best-effort forwarded to the linked KoboToolbox form so the project's
// Kobo dataset stays the single system of record. The Kobo submission carries
// `meta/instanceID = uuid:<submission_uuid>`, which is the same key the
// `kobo-webhook` ingest upserts on — so a visit can never land twice.

import { admin } from "./deviceAccess.ts";

export interface SeeClearDeviceRecord {
  id: string;
  data: Record<string, any>;
  photos?: Record<string, string>; // slot -> data URL
  submittedAt?: string;
}

const dataUrlToBytes = (dataUrl: string): { bytes: Uint8Array; contentType: string } | null => {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const binary = atob(m[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType: m[1] };
};

const ALLOWED_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
};
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 20;
const SLOT_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fields a device may supply; everything else is server-controlled. */
const DEVICE_FIELDS = [
  "date_of_visit", "state", "lga", "ward", "community", "facility_name", "facility_level", "ownership",
  "functional_status", "is_functional", "staff_on_duty", "focal_name", "focal_designation", "focal_phone",
  "team_members", "gps_lat", "gps_lng", "gps_accuracy", "general", "hr_score", "hr_max", "infra_score",
  "infra_max", "equipment", "equip_score", "equip_max", "essential_supplies", "complete_records",
  "referral_compliance", "referrals_made", "referrals_completed", "readiness_score", "overall_score",
  "challenges", "recommendations", "remarks", "officer_signature", "incharge_signature", "critical_gap",
] as const;

/** Store device-captured evidence photos and return slot -> storage path. */
async function storeEvidence(
  recordId: string,
  photos: Record<string, string> | undefined,
): Promise<Record<string, string>> {
  if (!photos) return {};
  const db = admin();
  const out: Record<string, string> = {};
  if (!ID_RE.test(recordId)) return {};
  for (const [slot, value] of Object.entries(photos).slice(0, MAX_PHOTOS)) {
    if (!value || typeof value !== "string" || !SLOT_RE.test(slot)) continue;
    // Only server-issued paths for this record may be referenced, never arbitrary values.
    if (!value.startsWith("data:")) {
      if (value.startsWith(`device/${recordId}/`) && !value.includes("..")) out[slot] = value;
      continue;
    }
    // Reject oversize payloads before decoding (base64 is ~4/3 of bytes).
    if (value.length > Math.ceil(MAX_PHOTO_BYTES * 4 / 3) + 100) continue;
    const parsed = dataUrlToBytes(value);
    if (!parsed) continue;
    const ext = ALLOWED_PHOTO_TYPES[parsed.contentType.toLowerCase()];
    if (!ext || parsed.bytes.byteLength > MAX_PHOTO_BYTES) continue;
    const path = `device/${recordId}/${slot}.${ext}`;
    const { error } = await db.storage
      .from("seeclear-evidence")
      .upload(path, parsed.bytes, { contentType: parsed.contentType, upsert: true });
    if (!error) out[slot] = path;
  }
  return out;
}

/** Push one visit to the linked KoboToolbox form. Never throws. */
async function pushToKobo(submissionUuid: string, flat: Record<string, unknown>): Promise<boolean> {
  try {
    const db = admin();
    const { data: cfg } = await db
      .from("kobo_form_configs")
      .select("kobo_server_url, form_uid, api_token")
      .ilike("form_title", "%see clear%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cfg?.form_uid || !cfg?.api_token) return false;

    const base = String(cfg.kobo_server_url || "https://kf.kobotoolbox.org").replace(/\/+$/, "");
    const res = await fetch(`${base}/api/v1/submissions`, {
      method: "POST",
      headers: {
        Authorization: `Token ${cfg.api_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: cfg.form_uid,
        submission: { ...flat, "meta/instanceID": `uuid:${submissionUuid}` },
      }),
    });
    if (!res.ok) {
      console.warn("seeclear kobo push failed", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.warn("seeclear kobo push error", e);
    return false;
  }
}

/** Flatten the checklist row into the field names used by the Kobo XLSForm. */
function toKoboSubmission(row: Record<string, any>): Record<string, unknown> {
  const flat: Record<string, unknown> = {
    date_of_visit: row.date_of_visit,
    state: row.state,
    lga: row.lga,
    ward: row.ward,
    community: row.community,
    facility_name: row.facility_name,
    facility_level: row.facility_level,
    ownership: row.ownership,
    functional_status: row.functional_status,
    staff_on_duty: row.staff_on_duty,
    focal_name: row.focal_name,
    focal_designation: row.focal_designation,
    focal_phone: row.focal_phone,
    remarks: row.remarks,
    critical_gap: row.critical_gap,
    officer_signature: row.officer_signature,
    incharge_signature: row.incharge_signature,
    key_challenges: Array.isArray(row.challenges) ? row.challenges.join(" ") : "",
    recommendations: Array.isArray(row.recommendations) ? row.recommendations.join(" ") : "",
  };
  for (const [k, v] of Object.entries(row.general ?? {})) flat[k] = v;
  for (const [k, v] of Object.entries(row.hr ?? {})) flat[k] = v;
  for (const [k, v] of Object.entries(row.infra ?? {})) flat[k] = v;
  for (const [k, v] of Object.entries(row.equipment ?? {})) flat[k] = v;
  if (row.gps_lat && row.gps_lng) flat["gps"] = `${row.gps_lat} ${row.gps_lng} 0 0`;
  return flat;
}

/**
 * Write one device-captured See Clear visit. Returns true when the dashboard
 * row is stored (Kobo forwarding is best-effort and never blocks the visit).
 */
export async function intakeSeeClearRecord(
  record: SeeClearDeviceRecord,
  ctx: { collectorUserId: string; deviceId: string; label: string },
): Promise<{ ok: boolean; reason?: string }> {
  const db = admin();
  if (!ID_RE.test(String(record.id ?? ""))) return { ok: false, reason: "invalid_id" };
  const evidence = await storeEvidence(record.id, record.photos);
  const submittedAtRaw = record.submittedAt ? new Date(record.submittedAt) : new Date();
  const submittedAt = Number.isNaN(submittedAtRaw.getTime()) ? new Date().toISOString() : submittedAtRaw.toISOString();

  const source = (record.data && typeof record.data === "object") ? record.data : {};
  const picked: Record<string, unknown> = {};
  for (const key of DEVICE_FIELDS) if (key in source) picked[key] = (source as Record<string, unknown>)[key];
  // Prior evidence may only reference this record's own stored files.
  const priorEvidence: Record<string, string> = {};
  for (const [slot, path] of Object.entries((source as any).evidence ?? {})) {
    if (SLOT_RE.test(slot) && typeof path === "string" && path.startsWith(`device/${record.id}/`) && !path.includes("..")) priorEvidence[slot] = path;
  }

  const row = {
    ...picked,
    id: record.id,
    submission_uuid: record.id,
    monitor_id: ctx.collectorUserId,
    source: "device",
    evidence: { ...priorEvidence, ...evidence },
    status: "sent",
    client_submitted_at: submittedAt,
  };

  const { error } = await db
    .from("seeclear_monitoring")
    .upsert(row, { onConflict: "submission_uuid" });
  if (error) {
    console.error("seeclear device intake failed", error);
    return { ok: false, reason: "write_failed" };
  }

  const pushed = await pushToKobo(record.id, toKoboSubmission(row));
  if (pushed) {
    await db
      .from("seeclear_monitoring")
      .update({ source: "device+kobo" })
      .eq("submission_uuid", record.id);
  }
  return { ok: true };
}
