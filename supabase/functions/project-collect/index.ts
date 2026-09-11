// Submission sync for account-free enrolled devices.
//
// The browser never writes to the database directly in device mode — every
// queued record is posted here with the device bearer token, verified, and
// written with the service role against the project's collection account.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { admin, verifyDeviceToken } from "../_shared/deviceAccess.ts";
import { intakeSeeClearRecord } from "../_shared/seeclearDeviceIntake.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface IncomingRecord {
  id: string;
  /** "form" (default) writes a project form submission; "seeclear" writes a
   *  See Clear facility visit; "case" opens a project case. */
  kind?: string;
  caseTypeId?: string;
  caseName?: string;
  formId: string;
  data: Record<string, unknown>;
  photos?: Record<string, string>;
  location?: { lat: number; lng: number } | null;
  withinGeofence?: boolean | null;
  submissionType?: string;
  submittedAt?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const ctx = await verifyDeviceToken(req);
    if (!ctx) return json({ error: "device_not_authorized" }, 401);
    if (!ctx.allowForms && !ctx.allowSeeclear && !ctx.allowCases) {
      return json({ error: "collection_not_allowed" }, 403);
    }
    if (!ctx.collectorUserId) return json({ error: "collection_account_missing" }, 409);

    const body = await req.json().catch(() => ({}));
    const records: IncomingRecord[] = Array.isArray(body.records) ? body.records.slice(0, 100) : [];
    if (records.length === 0) return json({ error: "no_records" }, 400);

    const db = admin();

    const accepted: string[] = [];
    const rejected: { id: string; reason: string }[] = [];
    const now = new Date().toISOString();

    // See Clear facility visits go to the checklist table (and on to Kobo).
    const seeclear = records.filter((r) => r.kind === "seeclear");
    for (const record of seeclear) {
      if (!ctx.allowSeeclear) {
        rejected.push({ id: record.id, reason: "seeclear_not_allowed" });
        continue;
      }
      const res = await intakeSeeClearRecord(
        { id: record.id, data: record.data ?? {}, photos: record.photos, submittedAt: record.submittedAt },
        { collectorUserId: ctx.collectorUserId, deviceId: ctx.deviceId, label: ctx.label },
      );
      if (res.ok) accepted.push(record.id);
      else rejected.push({ id: record.id, reason: res.reason ?? "write_failed" });
    }

    const formRecords = records.filter((r) => r.kind !== "seeclear");

    // Only forms that belong to this device's project may be written.
    const formIds = Array.from(new Set(formRecords.map((r) => String(r.formId))));
    const { data: forms } = await db
      .from("forms")
      .select("id, project_id")
      .in("id", formIds);
    const allowedForms = new Set(
      (forms ?? []).filter((f: any) => f.project_id === ctx.projectId).map((f: any) => f.id),
    );

    const rows = formRecords
      .filter((r) => {
        if (!r?.id || !r?.formId) {
          rejected.push({ id: r?.id ?? "unknown", reason: "invalid_record" });
          return false;
        }
        if (!ctx.allowForms) {
          rejected.push({ id: r.id, reason: "forms_not_allowed" });
          return false;
        }
        if (!allowedForms.has(r.formId)) {
          rejected.push({ id: r.id, reason: "form_not_in_project" });
          return false;
        }
        return true;
      })
      .map((r) => ({
        id: r.id,
        form_id: r.formId,
        user_id: ctx.collectorUserId,
        data: r.data ?? {},
        location: r.location ?? null,
        within_geofence: r.withinGeofence ?? null,
        submission_type: r.submissionType || "regular",
        status: "sent",
        submitted_at: r.submittedAt || now,
        synced_at: now,
        device_id: ctx.deviceId,
        collector_label: ctx.label,
      }));

    if (rows.length > 0) {
      // Idempotent: the client's deterministic record id keys the upsert, so a
      // retry after a lost acknowledgement never duplicates a record.
      const { error } = await db.from("form_submissions").upsert(rows, { onConflict: "id" });
      if (error) {
        console.error("project-collect upsert error", error);
        return json({ error: "write_failed", detail: error.message }, 500);
      }
      accepted.push(...rows.map((r) => r.id));
      await db
        .from("project_devices")
        .update({ last_seen_at: now })
        .eq("id", ctx.deviceRowId);
      await db.rpc("increment_device_records", {
        _device_row_id: ctx.deviceRowId,
        _count: rows.length,
      }).catch(() => {});
    }

    return json({ accepted, rejected });
  } catch (e) {
    console.error("project-collect error", e);
    return json({ error: "unexpected_error" }, 500);
  }
});
