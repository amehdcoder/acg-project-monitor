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

    // Cases opened offline on a device.
    const caseRecords = records.filter((r) => r.kind === "case");
    if (caseRecords.length > 0) {
      const caseTypeIds = Array.from(
        new Set(caseRecords.map((r) => String(r.caseTypeId || r.formId))),
      );
      const { data: caseTypes } = await db
        .from("case_types")
        .select("id, project_id")
        .in("id", caseTypeIds);
      const allowedTypes = new Set(
        (caseTypes ?? []).filter((c: any) => c.project_id === ctx.projectId).map((c: any) => c.id),
      );

      const caseRows: Record<string, unknown>[] = [];
      for (const r of caseRecords) {
        const typeId = String(r.caseTypeId || r.formId);
        if (!ctx.allowCases) {
          rejected.push({ id: r.id, reason: "cases_not_allowed" });
          continue;
        }
        if (!allowedTypes.has(typeId)) {
          rejected.push({ id: r.id, reason: "case_type_not_in_project" });
          continue;
        }
        caseRows.push({
          id: r.id,
          case_type_id: typeId,
          project_id: ctx.projectId,
          owner_id: ctx.collectorUserId,
          name: String(r.caseName || "Case").slice(0, 200),
          properties: r.data ?? {},
          status: "open",
          opened_at: r.submittedAt || now,
          client_submitted_at: r.clientSubmittedAt || r.submittedAt || now,
        });
      }
      if (caseRows.length > 0) {
        // Atomic, idempotent, last-write-wins ingestion in a single
        // transaction — no partial writes and no duplicate cases on retry.
        const { data: ok, error } = await db.rpc("ingest_cases", { _rows: caseRows });
        if (error) {
          console.error("project-collect case ingest error", error);
          for (const row of caseRows) rejected.push({ id: String(row.id), reason: "write_failed" });
        } else {
          accepted.push(...(ok ?? []).map((row: any) => String(row.accepted_id ?? row)));
        }
      }
    }

    const formRecords = records.filter((r) => r.kind !== "seeclear" && r.kind !== "case");

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
        submission_uuid: r.submissionUuid || r.id,
        form_id: r.formId,
        user_id: ctx.collectorUserId,
        data: r.data ?? {},
        location: r.location ?? null,
        within_geofence: r.withinGeofence ?? null,
        submission_type: r.submissionType || "regular",
        submitted_at: r.submittedAt || now,
        client_submitted_at: r.clientSubmittedAt || r.submittedAt || now,
        device_id: ctx.deviceId,
        collector_label: ctx.label,
      }));

    if (rows.length > 0) {
      // Single atomic transaction keyed on the device-generated
      // submission_uuid: partial batches can't leave orphan rows and a retry
      // after a lost acknowledgement is de-duplicated, not duplicated.
      const { data: ingested, error } = await db.rpc("ingest_form_submissions", { _rows: rows });
      if (error) {
        console.error("project-collect ingest error", error);
        return json({ error: "write_failed", detail: error.message }, 500);
      }
      const landed = new Set(
        (ingested ?? []).map((row: any) => String(row.accepted_uuid ?? row)),
      );
      for (const r of rows) {
        if (landed.has(String(r.submission_uuid))) accepted.push(r.id);
        else rejected.push({ id: r.id, reason: "write_failed" });
      }
      // Lock-free: no counter update on a hot shared row. Device throughput is
      // read from the project_device_activity view instead.
      await db
        .from("project_devices")
        .update({ last_seen_at: now })
        .eq("id", ctx.deviceRowId);
    }

    return json({ accepted, rejected });
  } catch (e) {
    console.error("project-collect error", e);
    return json({ error: "unexpected_error" }, 500);
  }
});
