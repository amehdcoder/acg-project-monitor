// Shared helpers for account-free (QR / project-code) device access.
//
// Devices never hold a Supabase session. They hold an opaque bearer token whose
// SHA-256 hash is stored in `project_devices.token_hash`. Every device call is
// verified server-side here and executed with the service role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const admin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/[\s-]/g, "");

export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface DeviceContext {
  deviceRowId: string;
  deviceId: string;
  projectId: string;
  label: string;
  allowForms: boolean;
  allowCases: boolean;
  allowSeeclear: boolean;
  collectorUserId: string | null;
}

/** Verify a device bearer token. Returns null when invalid, revoked or expired. */
export async function verifyDeviceToken(req: Request): Promise<DeviceContext | null> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token.length < 32) return null;

  const tokenHash = await sha256Hex(token);
  const db = admin();
  const { data: device } = await db
    .from("project_devices")
    .select("id, device_id, project_id, label, revoked")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!device || device.revoked) return null;

  const { data: config } = await db
    .from("project_access_configs")
    .select("enabled, allow_forms, allow_cases, allow_seeclear, expires_at, collector_user_id")
    .eq("project_id", device.project_id)
    .maybeSingle();
  if (!config || !config.enabled) return null;
  if (config.expires_at && new Date(config.expires_at).getTime() <= Date.now()) return null;

  await db
    .from("project_devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", device.id);

  return {
    deviceRowId: device.id,
    deviceId: device.device_id,
    projectId: device.project_id,
    label: device.label,
    allowForms: !!config.allow_forms,
    allowCases: !!config.allow_cases,
    allowSeeclear: !!config.allow_seeclear,
    collectorUserId: config.collector_user_id ?? null,
  };
}

/** Forms a collector must never see: unfinished or retired definitions. */
const COLLECTABLE = (status: unknown) => {
  const value = String(status ?? "active").toLowerCase();
  return !["draft", "archived", "deleted", "inactive", "disabled"].includes(value);
};

/** Everything a device needs to run fully offline for its project. */
export async function buildProjectBundle(
  projectId: string,
  allowForms: boolean,
  allowCases: boolean,
  allowSeeclear = false,
) {
  const db = admin();
  const nowIso = new Date().toISOString();

  const [{ data: project }, ownResult, grantResult] = await Promise.all([
    db.from("projects").select("id, name, description").eq("id", projectId).maybeSingle(),
    allowForms
      ? db.from("forms").select("*").eq("project_id", projectId)
      : Promise.resolve({ data: [] as any[] }),
    allowForms
      ? db.from("form_project_grants").select("form_id, starts_at, expires_at").eq("project_id", projectId)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  // Forms shared into this project from elsewhere count as the project's own
  // checklists, exactly as they do for signed-in users.
  const grantedIds = ((grantResult.data ?? []) as any[])
    .filter((g) =>
      (!g.starts_at || g.starts_at <= nowIso) && (!g.expires_at || g.expires_at > nowIso))
    .map((g) => g.form_id);

  let granted: any[] = [];
  if (grantedIds.length > 0) {
    const { data } = await db.from("forms").select("*").in("id", grantedIds);
    granted = data ?? [];
  }

  const byId = new Map<string, any>();
  for (const form of [...((ownResult.data ?? []) as any[]), ...granted]) {
    if (COLLECTABLE(form.status)) byId.set(form.id, form);
  }
  const forms = Array.from(byId.values());

  let caseTypes: unknown[] = [];
  if (allowCases) {
    const { data } = await db.from("case_types").select("*").eq("project_id", projectId);
    caseTypes = data ?? [];
  }

  // Extra checklists the device may fill offline alongside the project forms.
  const specialForms = allowSeeclear ? ["seeclear"] : [];

  return {
    project: project ?? null,
    forms: forms ?? [],
    caseTypes,
    specialForms,
    syncedAt: new Date().toISOString(),
  };
}
