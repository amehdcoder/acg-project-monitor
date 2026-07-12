// Dashboard Share & Permissions engine — public token resolver + OTP gate.
//
// Actions (POST body { action }):
//   - "resolve":     { token, sessionToken? }  -> share metadata + access decision
//   - "request-otp": { token, email }          -> emails a 6-digit code
//   - "verify-otp":  { token, email, code }    -> returns a long-lived sessionToken
//
// Access modes:
//   public          -> anyone with the link (granted immediately)
//   external_emails -> email must be on the allow-list AND verified via OTP
//   internal_roles  -> requester must be signed in with an allowed app role
//
// This function runs with verify_jwt = false so anonymous visitors can resolve
// public/external shares. All privileged reads use the service-role client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SHARE_SECRET = Deno.env.get("DASHBOARD_SHARE_SECRET")!;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes to enter the code
const MAX_OTP_ATTEMPTS = 6;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ---- crypto helpers ------------------------------------------------------
const enc = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SHARE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(input));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): unknown {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return JSON.parse(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad));
}

// A share session is an HMAC-signed payload the viewer stores locally.
// It carries no expiry — access ends only when the admin revokes the share.
async function issueSession(shareId: string, email: string): Promise<string> {
  const payload = b64url({ sid: shareId, email, iat: Date.now() });
  const sig = await hmac(payload);
  return `${payload}.${sig}`;
}
async function verifySession(sessionToken: string, shareId: string): Promise<string | null> {
  try {
    const [payload, sig] = sessionToken.split(".");
    if (!payload || !sig) return null;
    if ((await hmac(payload)) !== sig) return null;
    const data = b64urlDecode(payload) as { sid: string; email: string };
    if (data.sid !== shareId) return null;
    return data.email;
  } catch {
    return null;
  }
}

function shareIsLive(share: { is_active: boolean; expires_at: string | null }): boolean {
  if (!share.is_active) return false;
  if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) return false;
  return true;
}

function publicShare(share: any) {
  return {
    dashboard_id: share.dashboard_id,
    project_id: share.project_id,
    access_type: share.access_type,
    label: share.label,
    expires_at: share.expires_at,
    form_id: share.form_id,
    form_name: share.form_name,
    form_snapshot: share.form_snapshot,
  };
}

async function getUserFromAuthHeader(req: Request): Promise<{ id: string } | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  if (token === ANON_KEY || token === SERVICE_KEY) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getClaims(token);
  const sub = data?.claims?.sub as string | undefined;
  if (error || !sub) return null;
  return { id: sub };
}

async function userAllowedByRole(userId: string, allowedRoles: string[]): Promise<boolean> {
  // Dashboard admins can always view.
  const { data: isAdmin } = await admin.rpc("is_dashboard_admin", { _user_id: userId });
  if (isAdmin) return true;
  if (!allowedRoles.length) return false;

  const { data: profile } = await admin
    .from("profiles")
    .select("is_owner, is_co_owner")
    .eq("user_id", userId)
    .maybeSingle();
  if (profile?.is_owner && allowedRoles.includes("owner")) return true;
  if (profile?.is_co_owner && allowedRoles.includes("co_owner")) return true;

  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  return (roles ?? []).some((r: { role: string }) => allowedRoles.includes(r.role));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = String(body?.action ?? "");
  const token = String(body?.token ?? "").trim();
  if (!token) return json({ error: "Missing share token" }, 400);

  const { data: share, error: shareErr } = await admin
    .from("dashboard_shares")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (shareErr) return json({ error: "Lookup failed" }, 500);
  if (!share) return json({ status: "not_found" }, 404);
  if (!shareIsLive(share)) return json({ status: "revoked" }, 200);

  // ---- RESOLVE ----------------------------------------------------------
  if (action === "resolve") {
    if (share.access_type === "public") {
      return json({ status: "granted", share: publicShare(share) });
    }

    if (share.access_type === "internal_roles") {
      const user = await getUserFromAuthHeader(req);
      if (!user) return json({ status: "needs_login", share: publicShare(share) });
      const ok = await userAllowedByRole(user.id, share.allowed_roles ?? []);
      return ok
        ? json({ status: "granted", share: publicShare(share) })
        : json({ status: "forbidden", share: publicShare(share) });
    }

    // external_emails
    const sessionToken = String(body?.sessionToken ?? "");
    if (sessionToken) {
      const email = await verifySession(sessionToken, share.id);
      const allow = (share.allowed_emails ?? []).map((e: string) => e.toLowerCase());
      if (email && allow.includes(email.toLowerCase())) {
        return json({ status: "granted", share: publicShare(share) });
      }
    }
    return json({ status: "needs_otp", share: publicShare(share) });
  }

  // ---- REQUEST OTP ------------------------------------------------------
  if (action === "request-otp") {
    if (share.access_type !== "external_emails") return json({ error: "OTP not applicable" }, 400);
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json({ error: "Invalid email address" }, 400);

    const allow = (share.allowed_emails ?? []).map((e: string) => e.toLowerCase());
    if (!allow.includes(email)) {
      // Do not reveal the allow-list; respond as if sent.
      return json({ status: "sent" });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await sha256Hex(`${email}:${code}:${SHARE_SECRET}`);

    await admin
      .from("dashboard_share_otps")
      .update({ consumed: true })
      .eq("share_id", share.id)
      .eq("email", email)
      .eq("consumed", false);

    await admin.from("dashboard_share_otps").insert({
      share_id: share.id,
      email,
      code_hash,
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    });

    const label = share.label || "a shared dashboard";
    const html = `
      <div style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;">
          <div style="background:linear-gradient(135deg,#0c2340,#1a4a6e);padding:26px 32px;">
            <p style="margin:0;color:#93c5fd;font-size:12px;letter-spacing:1px;text-transform:uppercase;">Amehnities · Secure Dashboard Access</p>
            <h1 style="margin:8px 0 0;color:#ffffff;font-size:20px;">Your one-time verification code</h1>
          </div>
          <div style="padding:32px;">
            <p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.6;">
              Use the code below to open <strong style="color:#0c2340;">${label}</strong>. It expires in 10 minutes.
            </p>
            <div style="text-align:center;margin:24px 0;">
              <span style="display:inline-block;background:#ecfeff;border:1px solid #a5f3fc;color:#0c2340;font-size:34px;font-weight:800;letter-spacing:10px;padding:16px 28px;border-radius:12px;">${code}</span>
            </div>
            <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </div>
          <div style="background:#0c2340;padding:16px 32px;">
            <p style="margin:0;color:#93a4bd;font-size:12px;">Amehnities — HANDS Nigeria monitoring platform</p>
          </div>
        </div>
      </div>`;

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email-smtp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          to: email,
          subject: `Your dashboard access code: ${code}`,
          html,
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        console.error("OTP email send failed", res.status, detail);
        return json({ error: "Could not send verification email" }, 502);
      }
    } catch (e) {
      console.error("OTP email error", e);
      return json({ error: "Could not send verification email" }, 502);
    }

    return json({ status: "sent" });
  }

  // ---- VERIFY OTP -------------------------------------------------------
  if (action === "verify-otp") {
    if (share.access_type !== "external_emails") return json({ error: "OTP not applicable" }, 400);
    const email = String(body?.email ?? "").trim().toLowerCase();
    const code = String(body?.code ?? "").trim();
    if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) {
      return json({ status: "invalid" });
    }

    const { data: otp } = await admin
      .from("dashboard_share_otps")
      .select("*")
      .eq("share_id", share.id)
      .eq("email", email)
      .eq("consumed", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otp) return json({ status: "invalid" });
    if (new Date(otp.expires_at).getTime() <= Date.now()) return json({ status: "expired" });
    if (otp.attempts >= MAX_OTP_ATTEMPTS) return json({ status: "too_many_attempts" });

    const expected = await sha256Hex(`${email}:${code}:${SHARE_SECRET}`);
    if (expected !== otp.code_hash) {
      await admin
        .from("dashboard_share_otps")
        .update({ attempts: otp.attempts + 1 })
        .eq("id", otp.id);
      return json({ status: "invalid" });
    }

    await admin.from("dashboard_share_otps").update({ consumed: true }).eq("id", otp.id);
    const sessionToken = await issueSession(share.id, email);
    return json({ status: "granted", sessionToken, share: publicShare(share) });
  }

  return json({ error: "Unknown action" }, 400);
});
