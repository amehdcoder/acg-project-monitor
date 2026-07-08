// Releases individual Pre-test / Post-test quiz results to assigned members by email.
//
// For each selected member the function:
//   1. Loads their Pre-test and Post-test attempts for the quiz.
//   2. Grades every question in both attempts and runs a McNemar paired test
//      across the shared questions to decide whether the improvement (or decline)
//      is statistically significant — explained in plain language.
//   3. Sends a colorful, professional HTML email via the Hostinger SMTP relay.
//
// Admin-only. Uses the service role to read attempt/profile data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMailRaw } from "../_shared/rawSmtp.ts";
import { guardRequest } from "../_shared/authGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SMTP_HOST = "smtp.hostinger.com";
const SMTP_PORT = 465;
const SMTP_USER = "info@amehnities.org";
const FROM_NAME = "The Amehnities Team";
const SEND_TIMEOUT_MS = 20_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Attempt = {
  attempt_type: string;
  percentage: number | null;
  score: number | null;
  total_points: number | null;
  completed_at: string | null;
  answers: Record<string, unknown> | null;
};

// Normal CDF for two-sided p-value from a z score.
function normalTwoSidedP(z: number): number {
  const az = Math.abs(z);
  // Abramowitz & Stegun 7.1.26 approximation of erfc.
  const t = 1 / (1 + 0.3275911 * (az / Math.SQRT2));
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-(az * az) / 2);
  // y ~ P(|Z| <= az); two-sided p = 1 - y
  return Math.max(0, Math.min(1, 1 - y));
}

// McNemar's paired test on per-question correctness (pre vs post).
// b = wrong->right (improved), c = right->wrong (declined).
function mcnemar(b: number, c: number): { p: number; significant: boolean } {
  const n = b + c;
  if (n === 0) return { p: 1, significant: false };
  // Continuity-corrected chi-square -> z, then two-sided p.
  const chi = Math.pow(Math.abs(b - c) - 1, 2) / n;
  const z = Math.sqrt(Math.max(chi, 0));
  const p = normalTwoSidedP(z);
  return { p, significant: p < 0.05 };
}

function gradeAttempt(
  answers: Record<string, unknown> | null,
  correct: Map<string, string>,
): Map<string, boolean> {
  const graded = new Map<string, boolean>();
  if (!answers) return graded;
  for (const [qid, expected] of correct.entries()) {
    const given = answers[qid];
    graded.set(
      qid,
      given != null && String(given).trim().toLowerCase() === String(expected).trim().toLowerCase(),
    );
  }
  return graded;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";

function buildEmail(opts: {
  name: string;
  quizTitle: string;
  pre: Attempt | null;
  post: Attempt | null;
  passingScore: number;
  inference: string;
  improved: number;
  declined: number;
  significant: boolean;
}): { subject: string; html: string } {
  const { name, quizTitle, pre, post, passingScore, inference, improved, declined, significant } = opts;
  const prePct = pre?.percentage != null ? Math.round(pre.percentage) : null;
  const postPct = post?.percentage != null ? Math.round(post.percentage) : null;
  const delta = prePct != null && postPct != null ? postPct - prePct : null;
  const deltaColor = delta == null ? "#64748b" : delta > 0 ? "#059669" : delta < 0 ? "#e11d48" : "#64748b";
  const deltaLabel =
    delta == null ? "—" : delta > 0 ? `+${delta} points` : delta < 0 ? `${delta} points` : "No change";

  const scoreCard = (label: string, a: Attempt | null, accent: string) => {
    const pct = a?.percentage != null ? Math.round(a.percentage) : null;
    const passed = pct != null && pct >= passingScore;
    return `
      <td style="padding:8px;" width="50%" valign="top">
        <div style="background:${accent}12;border:1px solid ${accent}44;border-radius:16px;padding:18px;text-align:center;">
          <div style="font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${accent};">${esc(label)}</div>
          <div style="font-size:40px;font-weight:800;color:#0f172a;line-height:1.1;margin:6px 0;">${pct != null ? pct + "%" : "—"}</div>
          <div style="font-size:12px;color:#475569;">${a?.score != null ? `${a.score}/${a.total_points ?? "?"} pts` : "Not taken"}</div>
          ${pct != null ? `<div style="display:inline-block;margin-top:8px;padding:3px 12px;border-radius:999px;font-size:11px;font-weight:700;color:#fff;background:${passed ? "#059669" : "#e11d48"};">${passed ? "PASSED" : "BELOW PASS"}</div>` : ""}
          <div style="font-size:11px;color:#94a3b8;margin-top:8px;">${fmtDate(a?.completed_at ?? null)}</div>
        </div>
      </td>`;
  };

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 12px;">
    <div style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.08);">
      <div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 45%,#db2777 100%);padding:32px 28px;color:#fff;">
        <div style="font-size:13px;font-weight:600;opacity:.85;letter-spacing:.08em;text-transform:uppercase;">Your Assessment Results</div>
        <div style="font-size:24px;font-weight:800;margin-top:6px;">${esc(quizTitle)}</div>
        <div style="font-size:14px;margin-top:8px;opacity:.9;">Hello ${esc(name)}, here is a summary of your performance.</div>
      </div>
      <div style="padding:22px 20px 8px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          ${scoreCard("Pre-test", pre, "#2563eb")}
          ${scoreCard("Post-test", post, "#059669")}
        </tr></table>
      </div>
      <div style="padding:6px 20px 20px;">
        <div style="background:linear-gradient(135deg,#f8fafc,#eef2ff);border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6366f1;">Change from Pre to Post</div>
          <div style="font-size:28px;font-weight:800;color:${deltaColor};margin:4px 0;">${deltaLabel}</div>
          <div style="font-size:13px;color:#334155;line-height:1.55;">${esc(inference)}</div>
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
            <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;background:#dcfce7;color:#166534;">${improved} questions improved</span>
            <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;background:#fee2e2;color:#991b1b;">${declined} questions declined</span>
            <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;background:${significant ? "#e0e7ff" : "#f1f5f9"};color:${significant ? "#3730a3" : "#475569"};">${significant ? "Statistically significant" : "Not statistically significant"}</span>
          </div>
        </div>
      </div>
      <div style="padding:0 20px 28px;">
        <div style="font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">Passing score for this assessment is <strong>${passingScore}%</strong>.<br/>This is an automated summary from The Amehnities Team.</div>
      </div>
    </div>
  </div></body></html>`;

  return { subject: `Your results for ${quizTitle}`, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await guardRequest(req, corsHeaders, { requireAdmin: true });
  if (guard.response) return guard.response;

  try {
    const body = await req.json().catch(() => ({}));
    const quizId: string | undefined = body?.quizId;
    const userIds: string[] = Array.isArray(body?.userIds) ? body.userIds : [];
    if (!quizId || userIds.length === 0) {
      return new Response(JSON.stringify({ error: "quizId and userIds are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: quiz, error: quizErr } = await supabase
      .from("quizzes")
      .select("id, title, passing_score")
      .eq("id", quizId)
      .single();
    if (quizErr || !quiz) throw new Error("Quiz not found");

    const { data: questions } = await supabase
      .from("quiz_questions")
      .select("id, correct_answer")
      .eq("quiz_id", quizId);
    const correct = new Map<string, string>();
    (questions ?? []).forEach((q: { id: string; correct_answer: string }) =>
      correct.set(q.id, q.correct_answer),
    );

    const password = Deno.env.get("HOSTINGER_SMTP_PASSWORD");
    if (!password) throw new Error("HOSTINGER_SMTP_PASSWORD is not configured");

    const results: { userId: string; status: string; detail?: string }[] = [];

    for (const userId of userIds) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", userId)
          .maybeSingle();
        const email = profile?.email ? String(profile.email).trim() : "";
        const name = profile?.full_name || "there";
        if (!EMAIL_RE.test(email)) {
          results.push({ userId, status: "skipped", detail: "no valid email" });
          continue;
        }

        const { data: attempts } = await supabase
          .from("quiz_attempts")
          .select("attempt_type, percentage, score, total_points, completed_at, answers")
          .eq("quiz_id", quizId)
          .eq("user_id", userId)
          .order("completed_at", { ascending: false });

        const pre = (attempts ?? []).find((a: Attempt) => a.attempt_type === "pre_test") ?? null;
        const post = (attempts ?? []).find((a: Attempt) => a.attempt_type === "post_test") ?? null;

        if (!pre && !post) {
          results.push({ userId, status: "skipped", detail: "no attempts" });
          continue;
        }

        // Per-question paired comparison for statistical inference.
        let improved = 0;
        let declined = 0;
        let significant = false;
        let inference: string;
        if (pre && post) {
          const gPre = gradeAttempt(pre.answers, correct);
          const gPost = gradeAttempt(post.answers, correct);
          for (const qid of correct.keys()) {
            const a = gPre.get(qid);
            const b = gPost.get(qid);
            if (a === false && b === true) improved++;
            else if (a === true && b === false) declined++;
          }
          const { p, significant: sig } = mcnemar(improved, declined);
          significant = sig;
          const prePct = pre.percentage != null ? Math.round(pre.percentage) : 0;
          const postPct = post.percentage != null ? Math.round(post.percentage) : 0;
          const dir = postPct > prePct ? "improved" : postPct < prePct ? "declined" : "stayed the same";
          if (postPct > prePct) {
            inference = sig
              ? `Your score rose from ${prePct}% to ${postPct}%. This is a real, meaningful improvement — it is very unlikely (p ≈ ${p.toFixed(2)}) to have happened by chance, showing genuine gains in knowledge.`
              : `Your score rose from ${prePct}% to ${postPct}%. This is an encouraging improvement, though it is small enough (p ≈ ${p.toFixed(2)}) that we cannot yet be statistically confident it reflects a lasting change rather than chance.`;
          } else if (postPct < prePct) {
            inference = sig
              ? `Your score moved from ${prePct}% to ${postPct}%, a statistically significant decline (p ≈ ${p.toFixed(2)}). It may help to review the material again.`
              : `Your score moved from ${prePct}% to ${postPct}%. The change is small and not statistically significant (p ≈ ${p.toFixed(2)}), so it likely reflects normal variation rather than a true drop.`;
          } else {
            inference = `Your Pre-test and Post-test scores were both ${postPct}%, so your measured knowledge ${dir} between the two assessments.`;
          }
        } else if (pre) {
          inference = `Only your Pre-test has been recorded (${Math.round(pre.percentage ?? 0)}%). A Post-test comparison will be available once you complete it.`;
        } else {
          inference = `Only your Post-test has been recorded (${Math.round(post!.percentage ?? 0)}%). No Pre-test is available for comparison.`;
        }

        const { subject, html } = buildEmail({
          name,
          quizTitle: quiz.title,
          pre,
          post,
          passingScore: Math.round(Number(quiz.passing_score ?? 70)),
          inference,
          improved,
          declined,
          significant,
        });

        await sendMailRaw(
          { hostname: SMTP_HOST, port: SMTP_PORT, username: SMTP_USER, password, timeoutMs: SEND_TIMEOUT_MS },
          { from: `${FROM_NAME} <${SMTP_USER}>`, fromAddress: SMTP_USER, to: email, subject, html },
        );
        results.push({ userId, status: "sent" });
      } catch (err) {
        results.push({ userId, status: "error", detail: err instanceof Error ? err.message : String(err) });
      }
    }

    const sent = results.filter((r) => r.status === "sent").length;
    return new Response(JSON.stringify({ success: true, sent, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
