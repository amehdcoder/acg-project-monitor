// Account-free device enrolment (KoboCollect-style QR / project code).
//
// A collector scans a QR code or types the project code (+ optional PIN) and a
// device label. We verify the code, register the device, and hand back an
// opaque device token plus the full offline bundle for that project.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  admin,
  buildProjectBundle,
  normalizeCode,
  randomToken,
  sha256Hex,
  verifyDeviceToken,
} from "../_shared/deviceAccess.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MAX_ATTEMPTS_PER_HOUR = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "enroll");
    const db = admin();

    // Refresh: an already-enrolled device pulls the latest forms bundle.
    if (action === "refresh") {
      const ctx = await verifyDeviceToken(req);
      if (!ctx) return json({ error: "device_not_authorized" }, 401);
      const bundle = await buildProjectBundle(ctx.projectId, ctx.allowForms, ctx.allowCases, ctx.allowSeeclear);
      return json({
        device: { deviceId: ctx.deviceId, label: ctx.label },
        access: {
          allowForms: ctx.allowForms,
          allowCases: ctx.allowCases,
          allowSeeclear: ctx.allowSeeclear,
        },
        bundle,
      });
    }

    const code = normalizeCode(String(body.code ?? ""));
    const pin = body.pin == null ? "" : String(body.pin).trim();
    const deviceId = String(body.deviceId ?? "").trim();
    const label = String(body.label ?? "").trim().slice(0, 120);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    const audit = (success: boolean, reason?: string) =>
      db.from("project_enroll_attempts").insert({ join_code: code || null, ip, success, reason: reason ?? null });

    if (code.length < 4 || !deviceId || !label) {
      await audit(false, "invalid_input");
      return json({ error: "invalid_input" }, 400);
    }

    // Simple rate limit per IP.
    if (ip) {
      const since = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await db
        .from("project_enroll_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .eq("success", false)
        .gte("created_at", since);
      if ((count ?? 0) >= MAX_ATTEMPTS_PER_HOUR) {
        await audit(false, "rate_limited");
        return json({ error: "too_many_attempts" }, 429);
      }
    }

    const codeHash = await sha256Hex(code);
    const { data: config } = await db
      .from("project_access_configs")
      .select("*")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (!config || !config.enabled) {
      await audit(false, "unknown_or_disabled_code");
      return json({ error: "invalid_code" }, 404);
    }
    if (config.expires_at && new Date(config.expires_at).getTime() <= Date.now()) {
      await audit(false, "expired");
      return json({ error: "code_expired" }, 403);
    }
    if (config.pin_hash) {
      if (!pin || (await sha256Hex(pin)) !== config.pin_hash) {
        await audit(false, "bad_pin");
        return json({ error: "invalid_pin" }, 403);
      }
    }

    const token = randomToken();
    const tokenHash = await sha256Hex(token);

    const { error: upsertError } = await db.from("project_devices").upsert(
      {
        project_id: config.project_id,
        device_id: deviceId,
        label,
        token_hash: tokenHash,
        revoked: false,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "project_id,device_id" },
    );
    if (upsertError) {
      await audit(false, "device_write_failed");
      return json({ error: "enrolment_failed" }, 500);
    }

    const bundle = await buildProjectBundle(
      config.project_id,
      !!config.allow_forms,
      !!config.allow_cases,
      !!config.allow_seeclear,
    );
    await audit(true);

    return json({
      token,
      device: { deviceId, label },
      access: {
        allowForms: !!config.allow_forms,
        allowCases: !!config.allow_cases,
        allowSeeclear: !!config.allow_seeclear,
      },
      bundle,
    });
  } catch (e) {
    console.error("project-enroll error", e);
    return json({ error: "unexpected_error" }, 500);
  }
});
