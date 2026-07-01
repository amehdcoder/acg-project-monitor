// Sends a branded after-hours decision email (approved / rejected) to the
// original requester. Callable only by reviewers (admins/owners). Uses the
// service role to resolve the requester's email + name from the request row,
// then dispatches via the existing send-email-smtp function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBrandEmail } from "../_shared/amehnitiesEmail.ts";
import { guardRequest } from "../_shared/authGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await guardRequest(req, corsHeaders, { requireAdmin: true });
  if (guard.response) return guard.response;

  try {
    const { requestId, decision, note } = await req.json();
    if (!requestId || (decision !== "approved" && decision !== "rejected")) {
      return new Response(JSON.stringify({ error: "requestId and valid decision are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: reqRow, error: reqErr } = await admin
      .from("after_hours_submission_requests")
      .select("id, requested_by, requested_by_name, form_label, target_table, reason, review_note, reviewed_at")
      .eq("id", requestId)
      .maybeSingle();
    if (reqErr) throw reqErr;
    if (!reqRow) throw new Error("Request not found");

    const { data: prof } = await admin
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("user_id", reqRow.requested_by)
      .maybeSingle();

    const email = (prof?.email ?? "").trim();
    if (!email) {
      // Nothing to send to — not an error for the caller.
      return new Response(JSON.stringify({ success: true, skipped: "no-email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const name = (prof?.first_name ?? reqRow.requested_by_name ?? "").split(" ")[0]?.trim() || "there";
    const formName = reqRow.form_label || reqRow.target_table || "your submission";
    const approved = decision === "approved";
    const reviewerNote = (note ?? reqRow.review_note ?? "").trim();

    const html = approved
      ? renderBrandEmail({
          heading: `Your after-hours submission was approved ✅`,
          intro: `Good news, ${name}! Your request to submit outside the standard hours has been reviewed and approved.`,
          body: `
            <p>Your submission for <b>${formName}</b> has been securely saved and is now reflected on the dashboard.</p>
            <div style="margin:16px 0;padding:14px 16px;border-radius:10px;background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;">
              <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;">Status</div>
              <div style="font-size:16px;font-weight:700;margin-top:2px;">Approved &amp; Saved</div>
            </div>
            ${reviewerNote ? `<p style="font-size:14px;color:#374151;"><b>Reviewer note:</b> ${reviewerNote}</p>` : ""}
            <p style="font-size:13px;color:#6b7280;">No further action is needed from you — thank you for keeping the field data flowing.</p>
          `,
          ctaLabel: "Open Amehnities",
          ctaUrl: "https://www.amehnities.org",
          closing: "Thank you for your diligence and commitment to the work.",
        })
      : renderBrandEmail({
          heading: `Update on your after-hours submission`,
          intro: `Hello ${name}, your request to submit outside the standard hours has been reviewed.`,
          body: `
            <p>Your submission for <b>${formName}</b> was <b>not approved</b> and has not been saved.</p>
            <div style="margin:16px 0;padding:14px 16px;border-radius:10px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;">
              <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;">Status</div>
              <div style="font-size:16px;font-weight:700;margin-top:2px;">Not approved</div>
            </div>
            ${reviewerNote ? `<p style="font-size:14px;color:#374151;"><b>Reviewer note:</b> ${reviewerNote}</p>` : ""}
            <p style="font-size:13px;color:#6b7280;">You may re-submit during the allowed submission window, or reach out to your administrator for guidance.</p>
          `,
          ctaLabel: "Open Amehnities",
          ctaUrl: "https://www.amehnities.org",
          closing: "Thank you for your understanding.",
        });

    const subject = approved
      ? "Your after-hours submission was approved"
      : "Update on your after-hours submission";

    const { error: sendErr } = await admin.functions.invoke("send-email-smtp", {
      body: { to: email, subject, html },
    });
    if (sendErr) throw sendErr;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-after-hours-decision error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
