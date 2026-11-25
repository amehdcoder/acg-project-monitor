// Daily digest: emails each project owner (project creator) one summary of
// the previous Nigerian (WAT, UTC+1) day's form submissions, from
// info@amehnities.org. Run by a scheduled job just after midnight WAT; only
// server-to-server calls with the worker secret are accepted, and a
// (owner, day) claim row makes each digest send at most once.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBrandEmail } from "../_shared/amehnitiesEmail.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const WAT_MS = 60 * 60 * 1000;

/** The WAT calendar day before `now`, as [startUtc, endUtc) plus its label. */
export function previousWatDay(now: Date) {
  const watNow = new Date(now.getTime() + WAT_MS);
  const day = new Date(Date.UTC(watNow.getUTCFullYear(), watNow.getUTCMonth(), watNow.getUTCDate() - 1));
  const start = new Date(day.getTime() - WAT_MS);
  return { date: day.toISOString().slice(0, 10), start, end: new Date(start.getTime() + 86400000) };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-worker-secret") !== secret) return json({ error: "forbidden" }, 403);
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { date, start, end } = previousWatDay(new Date());
    const s = start.toISOString(), e = end.toISOString();

    const subs: { form_id: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("form_submissions").select("form_id")
        .neq("status", "draft")
        .or(`and(submitted_at.gte.${s},submitted_at.lt.${e}),and(submitted_at.is.null,created_at.gte.${s},created_at.lt.${e})`)
        .range(from, from + 999);
      if (error) throw error;
      subs.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    if (!subs.length) return json({ date, owners: 0 });

    const formIds = [...new Set(subs.map((r) => r.form_id))];
    const { data: forms } = await db.from("forms").select("id, name, project_id").in("id", formIds);
    const projectIds = [...new Set((forms ?? []).map((f) => f.project_id).filter(Boolean))];
    const { data: projects } = projectIds.length
      ? await db.from("projects").select("id, name, created_by").in("id", projectIds) : { data: [] };
    const formMap = new Map((forms ?? []).map((f) => [f.id, f]));
    const projMap = new Map((projects ?? []).map((p) => [p.id, p]));

    // owner -> project -> form -> count
    const byOwner = new Map<string, Map<string, Map<string, number>>>();
    for (const r of subs) {
      const f = formMap.get(r.form_id); const p = f && projMap.get(f.project_id);
      if (!p?.created_by) continue;
      const pm = byOwner.get(p.created_by) ?? new Map(); byOwner.set(p.created_by, pm);
      const fm = pm.get(p.id) ?? new Map(); pm.set(p.id, fm);
      fm.set(f!.id, (fm.get(f!.id) ?? 0) + 1);
    }

    let sent = 0;
    for (const [ownerId, pm] of byOwner) {
      const total = [...pm.values()].reduce((a, fm) => a + [...fm.values()].reduce((x, y) => x + y, 0), 0);
      const { error: claimErr } = await db.from("form_submission_daily_digests")
        .insert({ owner_id: ownerId, digest_date: date, submission_count: total });
      if (claimErr) continue; // already sent for this day
      const { data: owner } = await db.from("profiles").select("email, first_name").eq("user_id", ownerId).maybeSingle();
      if (!owner?.email) {
        await db.from("form_submission_daily_digests").update({ status: "no_owner_email" }).eq("owner_id", ownerId).eq("digest_date", date);
        continue;
      }
      const rows = [...pm].map(([pid, fm]) => {
        const p = projMap.get(pid)!;
        return [...fm].map(([fid, n]) =>
          `<tr><td>${esc(p.name)}</td><td>${esc(formMap.get(fid)?.name)}</td><td style="text-align:right;font-weight:600;">${n}</td></tr>`).join("");
      }).join("");
      const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      const html = renderBrandEmail({
        heading: "Daily submissions summary",
        intro: `Hello ${esc(owner.first_name || "there")}, here is the summary of form submissions in your projects for ${esc(label)} (Nigerian time). Total: <strong>${total}</strong>.`,
        body: `<table cellpadding="8" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;font-size:14px;width:100%;">
          <tr style="color:#6b7280;"><td>Project</td><td>Form</td><td style="text-align:right;">Submissions</td></tr>${rows}</table>`,
        ctaLabel: "Open Amehnities",
        ctaUrl: "https://www.amehnities.org",
      });
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email-smtp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-secret": secret },
        body: JSON.stringify({ to: owner.email, subject: `Daily submissions summary – ${label}: ${total}`, html }),
      });
      const err = res.ok ? null : `${res.status} ${(await res.text()).slice(0, 300)}`;
      await db.from("form_submission_daily_digests")
        .update({ recipient: owner.email, status: err ? "failed" : "sent", error: err })
        .eq("owner_id", ownerId).eq("digest_date", date);
      if (!err) sent++;
    }
    return json({ date, owners: byOwner.size, sent });
  } catch (e) {
    console.error("notify-form-submission digest:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
