// Emails the project owner (project creator) from info@amehnities.org when a
// form submission arrives. Called by a database trigger with only a
// submission id; everything else is read server-side, and a claim row makes
// each submission email at most once, so the public URL cannot be abused.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBrandEmail } from "../_shared/amehnitiesEmail.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f-]{36}$/i;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { submission_id } = await req.json().catch(() => ({}));
    if (!UUID.test(String(submission_id ?? ""))) return json({ error: "submission_id required" }, 400);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: sub } = await db.from("form_submissions")
      .select("id, form_id, user_id, status, collector_label, created_at, submitted_at")
      .eq("id", submission_id).maybeSingle();
    if (!sub || sub.status === "draft") return json({ skipped: "not a submission" });

    // Claim first: a duplicate claim means it was already handled.
    const { error: claimErr } = await db.from("form_submission_email_alerts").insert({ submission_id });
    if (claimErr) return json({ skipped: "already notified" });

    const { data: form } = await db.from("forms").select("name, project_id").eq("id", sub.form_id).maybeSingle();
    const { data: project } = form?.project_id
      ? await db.from("projects").select("name, created_by").eq("id", form.project_id).maybeSingle()
      : { data: null };
    const ownerId = project?.created_by;
    const { data: owner } = ownerId
      ? await db.from("profiles").select("email, first_name").eq("user_id", ownerId).maybeSingle()
      : { data: null };
    if (!owner?.email) {
      await db.from("form_submission_email_alerts").update({ status: "no_owner_email" }).eq("submission_id", submission_id);
      return json({ skipped: "no owner email" });
    }
    const { data: collector } = sub.user_id
      ? await db.from("profiles").select("first_name, last_name, email").eq("user_id", sub.user_id).maybeSingle()
      : { data: null };
    const who = [collector?.first_name, collector?.last_name].filter(Boolean).join(" ") || collector?.email || sub.collector_label || "A data collector";
    const when = new Date(sub.submitted_at || sub.created_at).toLocaleString("en-GB", { timeZone: "Africa/Lagos" });

    const html = renderBrandEmail({
      heading: "New form submission received",
      intro: `Hello ${esc(owner.first_name || "there")}, a new submission has arrived in your project.`,
      body: `<table cellpadding="8" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;font-size:14px;">
        <tr><td style="color:#6b7280;">Project</td><td style="font-weight:600;">${esc(project?.name)}</td></tr>
        <tr><td style="color:#6b7280;">Form</td><td style="font-weight:600;">${esc(form?.name)}</td></tr>
        <tr><td style="color:#6b7280;">Submitted by</td><td>${esc(who)}</td></tr>
        <tr><td style="color:#6b7280;">Time (WAT)</td><td>${esc(when)}</td></tr></table>`,
      ctaLabel: "Open Amehnities",
      ctaUrl: "https://www.amehnities.org",
    });
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email-smtp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": Deno.env.get("CRON_SECRET") ?? "" },
      body: JSON.stringify({ to: owner.email, subject: `New submission: ${form?.name ?? "form"}`, html }),
    });
    const error = res.ok ? null : { message: `${res.status} ${(await res.text()).slice(0, 300)}` };
    await db.from("form_submission_email_alerts")
      .update({ recipient: owner.email, status: error ? "failed" : "sent", error: error?.message ?? null })
      .eq("submission_id", submission_id);
    return json({ success: !error });
  } catch (e) {
    console.error("notify-form-submission:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
