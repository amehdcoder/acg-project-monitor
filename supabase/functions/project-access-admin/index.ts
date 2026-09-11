// Owner/admin management of a project's account-free (QR) collection access.
//
// Handles: reading the current configuration, enabling/updating it, rotating
// the join code, and revoking devices. Join codes, PINs and device tokens are
// only ever stored hashed; the plain join code is kept so the owner can display
// the QR card, but it is never readable from the browser client directly.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { admin, normalizeCode, sha256Hex } from "../_shared/deviceAccess.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    .join("");

async function requireProjectManager(req: Request, projectId: string) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return null;

  const db = admin();
  const { data: isAdminRes } = await db.rpc("is_admin", { _user_id: userId });
  if (isAdminRes === true) return userId;

  const { data: project } = await db
    .from("projects")
    .select("created_by")
    .eq("id", projectId)
    .maybeSingle();
  return project?.created_by === userId ? userId : null;
}

/** One hidden collection account per project keeps every existing FK and RLS rule intact. */
async function ensureCollectorUser(projectId: string, projectName: string, existing: string | null) {
  const db = admin();
  if (existing) {
    const { data } = await db.auth.admin.getUserById(existing);
    if (data?.user) return existing;
  }
  const email = `collect+${projectId}@devices.amehnities.org`;
  const password = crypto.randomUUID() + crypto.randomUUID();
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Open Collection — ${projectName}`, open_collection_project: projectId },
  });
  if (created?.user?.id) return created.user.id;

  // Already provisioned earlier — find it by email.
  if (error) {
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    const match = list?.users?.find((u: any) => u.email === email);
    if (match) return match.id;
    throw error;
  }
  throw new Error("collector_account_failed");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "get");
    const projectId = String(body.projectId ?? "");
    if (!projectId) return json({ error: "project_required" }, 400);

    const userId = await requireProjectManager(req, projectId);
    if (!userId) return json({ error: "not_authorized" }, 403);

    const db = admin();
    const loadConfig = async () => {
      const { data } = await db
        .from("project_access_configs")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      return data;
    };

    if (action === "get") {
      const config = await loadConfig();
      const { data: devices } = await db
        .from("project_devices")
        .select("id, device_id, label, revoked, records_sent, last_seen_at, enrolled_at")
        .eq("project_id", projectId)
        .order("enrolled_at", { ascending: false });
      return json({ config: config ?? null, devices: devices ?? [] });
    }

    if (action === "save") {
      const { data: project } = await db
        .from("projects")
        .select("name")
        .eq("id", projectId)
        .maybeSingle();
      const existing = await loadConfig();

      const enabled = body.enabled !== false;
      const allowForms = body.allowForms !== false;
      const allowCases = body.allowCases === true;
      const allowSeeclear = body.allowSeeclear === true;
      const expiresAt = body.expiresAt ? new Date(body.expiresAt).toISOString() : null;

      const rotate = body.rotateCode === true || !existing;
      const joinCode = rotate ? makeCode() : existing!.join_code;

      let pinHash = existing?.pin_hash ?? null;
      if (body.pin === null) pinHash = null;
      else if (typeof body.pin === "string" && body.pin.trim()) pinHash = await sha256Hex(body.pin.trim());

      const collectorUserId = enabled
        ? await ensureCollectorUser(projectId, project?.name ?? "Project", existing?.collector_user_id ?? null)
        : existing?.collector_user_id ?? null;

      const payload = {
        project_id: projectId,
        enabled,
        join_code: joinCode,
        code_hash: await sha256Hex(normalizeCode(joinCode)),
        pin_hash: pinHash,
        allow_forms: allowForms,
        allow_cases: allowCases,
        allow_seeclear: allowSeeclear,
        expires_at: expiresAt,
        collector_user_id: collectorUserId,
        created_by: existing?.created_by ?? userId,
      };

      const { data, error } = await db
        .from("project_access_configs")
        .upsert(payload, { onConflict: "project_id" })
        .select("*")
        .maybeSingle();
      if (error) return json({ error: "save_failed", detail: error.message }, 500);

      // Rotating the code invalidates every device that joined with the old one.
      if (rotate && existing) {
        await db.from("project_devices").update({ revoked: true }).eq("project_id", projectId);
      }
      return json({ config: data });
    }

    if (action === "revoke_device") {
      const deviceRowId = String(body.deviceRowId ?? "");
      if (!deviceRowId) return json({ error: "device_required" }, 400);
      await db
        .from("project_devices")
        .update({ revoked: body.revoked === false ? false : true })
        .eq("id", deviceRowId)
        .eq("project_id", projectId);
      return json({ ok: true });
    }

    if (action === "revoke_all") {
      await db.from("project_devices").update({ revoked: true }).eq("project_id", projectId);
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("project-access-admin error", e);
    return json({ error: "unexpected_error" }, 500);
  }
});
