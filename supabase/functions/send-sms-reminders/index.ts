// Automated SMS follow-up reminders via an Android phone running the free
// open-source "SMS Gateway for Android" app (sms-gate.app). Texts go out from
// the phone's own SIM, so cost = the SIM's SMS bundle.
// Actions: get_settings | save_settings | run. Admin-only; cron calls "run" with x-worker-secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { guardRequest } from "../_shared/authGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export const DEFAULT_UPCOMING = "Dear {name}, reminder from {project}: your follow-up visit at {facility} is on {date}. Please attend. Call your case officer if you need help.";
export const DEFAULT_OVERDUE = "Dear {name}, {project} noticed you missed your follow-up visit at {facility} on {date}. Please visit soon or call your case officer to reschedule.";

const toE164 = (raw: unknown): string | null => {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = "234" + d.slice(1);
  if (d.length === 10 && /^[789]/.test(d)) d = "234" + d;
  return d.length >= 10 && d.length <= 15 ? d : null;
};
const lagosDate = (offsetDays = 0) =>
  new Date(Date.now() + 3600000 + offsetDays * 86400000).toISOString().slice(0, 10);
const shortDate = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);

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
  if (projectId && !/^[0-9a-f-]{36}$/i.test(projectId)) return json({ error: "Invalid project_id" }, 400);

  if (action === "get_settings") {
    if (!projectId) return json({ error: "project_id required" }, 400);
    const { data } = await admin.from("sms_settings").select("*").eq("project_id", projectId).maybeSingle();
    const defaults = { message_upcoming: DEFAULT_UPCOMING, message_overdue: DEFAULT_OVERDUE };
    if (!data) return json({ settings: null, defaults });
    const { password, ...rest } = data as Record<string, unknown>;
    return json({ settings: { ...rest, has_password: !!password }, defaults });
  }

  if (action === "save_settings") {
    if (!projectId) return json({ error: "project_id required" }, 400);
    const s = (body.settings || {}) as Record<string, unknown>;
    const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
    const url = str(s.gateway_url, 300) || "https://api.sms-gate.app/3rdparty/v1";
    if (!/^https?:\/\//i.test(url)) return json({ error: "Gateway address must start with http:// or https://" }, 400);
    const row: Record<string, unknown> = {
      project_id: projectId,
      gateway_url: url.replace(/\/+$/, ""),
      username: str(s.username, 100),
      project_label: str(s.project_label, 60) || "HANDS",
      message_upcoming: str(s.message_upcoming, 480) || DEFAULT_UPCOMING,
      message_overdue: str(s.message_overdue, 480) || DEFAULT_OVERDUE,
      enabled: s.enabled !== false,
      updated_by: guard.userId,
      updated_at: new Date().toISOString(),
    };
    const pw = str(s.password, 200);
    if (pw) row.password = pw;
    const { error } = await admin.from("sms_settings").upsert(row);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action !== "run") return json({ error: "Unknown action" }, 400);

  let q = admin.from("sms_settings").select("*").eq("enabled", true).not("password", "is", null).not("username", "is", null);
  if (projectId) q = q.eq("project_id", projectId);
  const { data: settingsRows, error: sErr } = await q;
  if (sErr) return json({ error: sErr.message }, 500);

  const today = lagosDate(0), plus1 = lagosDate(1), plus2 = lagosDate(2), back60 = lagosDate(-60);
  const summary = { sent: 0, failed: 0, skipped: 0, projects: (settingsRows || []).length };

  for (const cfg of (settingsRows || []) as Record<string, string>[]) {
    const auth = "Basic " + btoa(`${cfg.username}:${cfg.password}`);
    const { data: bens } = await admin.from("beneficiaries")
      .select("id, full_name, profile, facility_id, next_follow_up_date, status")
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
      if (date === plus2 && !track.sms_reminder_2d_sent) kind = "reminder_2d";
      else if (date === plus1 && !track.sms_reminder_1d_sent) kind = "reminder_1d";
      else if (date === today && !track.sms_reminder_day_sent) kind = "reminder_day";
      else if (date < today && !track.sms_overdue_sent) {
        const { count } = await admin.from("beneficiary_services").select("id", { count: "exact", head: true })
          .eq("beneficiary_id", b.id).gte("service_date", date);
        if ((count || 0) === 0) kind = "overdue";
      }
      if (!kind) continue;

      const profile = (b.profile || {}) as Record<string, unknown>;
      const phone = toE164(profile.phone ?? profile.phone_number ?? profile.whatsapp);
      const log = (status: string, extra: Record<string, unknown> = {}) =>
        admin.from("sms_notification_log").insert({ project_id: cfg.project_id, beneficiary_id: b.id, kind, phone, status, ...extra });
      if (!phone) { summary.skipped++; await log("skipped", { error: "No valid phone number on record" }); continue; }

      const text = fill(kind === "overdue" ? cfg.message_overdue || DEFAULT_OVERDUE : cfg.message_upcoming || DEFAULT_UPCOMING, {
        name: String(b.full_name || "beneficiary").split(" ")[0],
        facility: (b.facility_id && facilityNames[b.facility_id]) || "your health facility",
        date: shortDate(date),
        project: cfg.project_label || "HANDS",
      });
      let res: Response, resText = "";
      try {
        res = await fetch(`${cfg.gateway_url}/message`, {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/json" },
          body: JSON.stringify({ textMessage: { text }, phoneNumbers: ["+" + phone] }),
        });
        resText = await res.text();
      } catch (e) {
        await log("failed", { error: `Could not reach the phone gateway: ${(e as Error).message}` });
        summary.failed++; continue;
      }
      if (res.ok) {
        let id: string | null = null;
        try { id = JSON.parse(resText)?.id ?? null; } catch { /* ignore */ }
        await admin.from("followup_reminders").update({ [`sms_${kind}_sent`]: true }).eq("id", track.id);
        await log("sent", { message_id: id });
        summary.sent++;
      } else {
        await log("failed", { error: `[${res.status}] ${resText.slice(0, 900)}` });
        summary.failed++;
      }
    }
  }
  return json({ ok: true, ...summary });
});
