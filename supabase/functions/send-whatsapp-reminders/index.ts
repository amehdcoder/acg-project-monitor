// Automated WhatsApp follow-up reminders (Meta WhatsApp Cloud API).
// Actions: get_settings | save_settings | run. Admin-only; cron calls "run" with x-worker-secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { guardRequest } from "../_shared/authGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const GRAPH = "https://graph.facebook.com/v21.0";

/** Normalise to E.164 digits (no "+"); Nigerian local numbers get 234. */
export const toE164 = (raw: unknown): string | null => {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = "234" + d.slice(1);
  if (d.length === 10 && /^[789]/.test(d)) d = "234" + d;
  return d.length >= 10 && d.length <= 15 ? d : null;
};

const lagosDate = (offsetDays = 0) => {
  const t = new Date(Date.now() + 60 * 60 * 1000 + offsetDays * 86400000);
  return t.toISOString().slice(0, 10);
};
const prettyDate = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

type Kind = "reminder_2d" | "reminder_1d" | "reminder_day" | "overdue";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const guard = await guardRequest(req, corsHeaders);
  if (guard.response) return guard.response;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || "run");
  const projectId = typeof body.project_id === "string" ? body.project_id : null;
  const uuidRe = /^[0-9a-f-]{36}$/i;
  if (projectId && !uuidRe.test(projectId)) return json({ error: "Invalid project_id" }, 400);

  if (action === "get_settings") {
    if (!projectId) return json({ error: "project_id required" }, 400);
    const { data } = await admin.from("whatsapp_settings").select("*").eq("project_id", projectId).maybeSingle();
    if (!data) return json({ settings: null });
    const { access_token, ...rest } = data as Record<string, unknown>;
    const tok = String(access_token || "");
    return json({ settings: { ...rest, has_token: !!tok, token_hint: tok ? `••••${tok.slice(-4)}` : "" } });
  }

  if (action === "save_settings") {
    if (!projectId) return json({ error: "project_id required" }, 400);
    const s = (body.settings || {}) as Record<string, unknown>;
    const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
    const row: Record<string, unknown> = {
      project_id: projectId,
      phone_number_id: str(s.phone_number_id, 40),
      business_account_id: str(s.business_account_id, 40),
      template_upcoming: str(s.template_upcoming, 100) || "follow_up_upcoming",
      template_overdue: str(s.template_overdue, 100) || "follow_up_overdue",
      template_language: str(s.template_language, 10) || "en",
      project_label: str(s.project_label, 100) || "Accelerate Project",
      enabled: s.enabled !== false,
      updated_by: guard.userId,
      updated_at: new Date().toISOString(),
    };
    const token = str(s.access_token, 1000);
    if (token) row.access_token = token; // blank = keep existing token
    const { error } = await admin.from("whatsapp_settings").upsert(row);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action !== "run") return json({ error: "Unknown action" }, 400);

  // ---- run reminders ----
  let q = admin.from("whatsapp_settings").select("*").eq("enabled", true).not("access_token", "is", null).not("phone_number_id", "is", null);
  if (projectId) q = q.eq("project_id", projectId);
  const { data: settingsRows, error: sErr } = await q;
  if (sErr) return json({ error: sErr.message }, 500);

  const today = lagosDate(0), plus1 = lagosDate(1), plus2 = lagosDate(2), back60 = lagosDate(-60);
  const summary = { sent: 0, failed: 0, skipped: 0, projects: (settingsRows || []).length };

  for (const cfg of (settingsRows || []) as Record<string, string>[]) {
    const { data: bens } = await admin.from("beneficiaries")
      .select("id, full_name, profile, facility_id, village, next_follow_up_date, status")
      .eq("project_id", cfg.project_id)
      .gte("next_follow_up_date", back60).lte("next_follow_up_date", plus2)
      .limit(2000);
    const facilityIds = [...new Set((bens || []).map((b) => b.facility_id).filter(Boolean))];
    const facilityNames: Record<string, string> = {};
    if (facilityIds.length) {
      const { data: fac } = await admin.from("health_facilities").select("id, name").in("id", facilityIds);
      for (const f of fac || []) facilityNames[f.id] = f.name;
    }

    for (const b of bens || []) {
      if (["closed", "deceased", "inactive", "transferred"].includes(String(b.status))) continue;
      const date = b.next_follow_up_date as string;
      const { data: track } = await admin.from("followup_reminders")
        .upsert({ project_id: cfg.project_id, beneficiary_id: b.id, scheduled_date: date }, { onConflict: "beneficiary_id,scheduled_date" })
        .select("*").single();
      if (!track) continue;

      let kind: Kind | null = null;
      if (date === plus2 && !track.reminder_2d_sent) kind = "reminder_2d";
      else if (date === plus1 && !track.reminder_1d_sent) kind = "reminder_1d";
      else if (date === today && !track.reminder_day_sent) kind = "reminder_day";
      else if (date < today && !track.overdue_sent) {
        // Pending = no service recorded on or after the scheduled date.
        const { count } = await admin.from("beneficiary_services").select("id", { count: "exact", head: true })
          .eq("beneficiary_id", b.id).gte("service_date", date);
        if ((count || 0) === 0) kind = "overdue";
      }
      if (!kind) continue;

      const profile = (b.profile || {}) as Record<string, unknown>;
      const phone = toE164(profile.phone ?? profile.phone_number ?? profile.whatsapp);
      const log = (status: string, extra: Record<string, unknown> = {}) =>
        admin.from("whatsapp_notification_log").insert({ project_id: cfg.project_id, beneficiary_id: b.id, kind, phone, status, ...extra });
      if (!phone) { summary.skipped++; await log("skipped", { error: "No valid phone number on record" }); continue; }

      const place = (b.facility_id && facilityNames[b.facility_id]) || "your health facility";
      const res = await fetch(`${GRAPH}/${cfg.phone_number_id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "template",
          template: {
            name: kind === "overdue" ? cfg.template_overdue : cfg.template_upcoming,
            language: { code: cfg.template_language || "en" },
            components: [{ type: "body", parameters: [
              { type: "text", text: String(b.full_name || "beneficiary") },
              { type: "text", text: place },
              { type: "text", text: prettyDate(date) },
            ] }],
          },
        }),
      });
      const text = await res.text();
      if (res.ok) {
        let id: string | null = null;
        try { id = JSON.parse(text)?.messages?.[0]?.id ?? null; } catch { /* ignore */ }
        await admin.from("followup_reminders").update({ [`${kind}_sent`]: true }).eq("id", track.id);
        await log("sent", { message_id: id });
        summary.sent++;
      } else {
        await log("failed", { error: `[${res.status}] ${text.slice(0, 900)}` });
        summary.failed++;
      }
    }
  }
  return json({ ok: true, ...summary });
});
