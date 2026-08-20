// Quiz ⇄ KoboToolbox realtime webhook.
//
// Register in KoboToolbox → Settings → REST Services with:
//   Endpoint: https://<project>.supabase.co/functions/v1/kobo-quiz-webhook/<quiz_id>
//   Custom header: x-kobo-secret: <webhook secret shown in the Quiz Manager>
//
// Each POSTed submission is scored against `quiz_kobo_configs.question_config`
// and upserted into `quiz_kobo_submissions`, which is published on realtime so
// the Quizzes analytics dashboard updates instantly.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders as baseCors } from "npm:@supabase/supabase-js@2/cors";
import {
  scoreSubmission,
  type QuizKoboIdentityFields,
  type QuizKoboQuestion,
} from "../_shared/quizKoboScoring.ts";

const corsHeaders = {
  ...baseCors,
  "Access-Control-Allow-Headers":
    "authorization, x-kobo-secret, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const j = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function decodeBasic(header: string): string | null {
  const m = header.match(/^Basic\s+(.+)$/i);
  if (!m) return null;
  try {
    const decoded = atob(m[1].trim());
    const idx = decoded.indexOf(":");
    return idx >= 0 ? decoded.slice(idx + 1) : decoded;
  } catch { return null; }
}

function presentedSecrets(req: Request): string[] {
  const out: string[] = [];
  const custom = req.headers.get("x-kobo-secret");
  if (custom) out.push(custom.trim());
  const auth = req.headers.get("authorization") ?? "";
  if (/^Bearer\s+/i.test(auth)) out.push(auth.replace(/^Bearer\s+/i, "").trim());
  else if (/^Basic\s+/i.test(auth)) { const p = decodeBasic(auth); if (p) out.push(p); }
  else if (auth) out.push(auth.trim());
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const tail = segments[segments.length - 1] ?? "";
    const quizId = UUID_RE.test(tail) ? tail : (url.searchParams.get("quiz_id") ?? "");

    if (!UUID_RE.test(quizId)) {
      return j({ error: "Missing or invalid quiz_id. Use /kobo-quiz-webhook/<quiz_id>." }, 400);
    }

    const { data: config, error: cfgErr } = await supabase
      .from("quiz_kobo_configs")
      .select("id, quiz_id, webhook_secret, question_config, identity_fields")
      .eq("quiz_id", quizId)
      .maybeSingle();

    if (cfgErr) return j({ error: cfgErr.message }, 500);
    if (!config) return j({ error: "No Kobo configuration for this quiz" }, 404);

    if (!presentedSecrets(req).includes(String(config.webhook_secret))) {
      return j({ error: "Unauthorized" }, 401);
    }

    if (req.method === "GET") return j({ ok: true, quiz_id: quizId, ready: true });
    if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") return j({ error: "Invalid JSON payload" }, 400);

    const rows = Array.isArray(payload) ? payload : [payload];
    const questions = (config.question_config ?? []) as QuizKoboQuestion[];
    const identity = (config.identity_fields ?? {}) as QuizKoboIdentityFields;

    const choiceLabelFor = (field: string, value: string) => {
      const q = questions.find((x) => x.name === field);
      return q?.choices?.find((c) => c.name === value)?.label ?? "";
    };

    let saved = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const submissionId = String(row?._id ?? row?.["meta/instanceID"] ?? row?._uuid ?? "");
      if (!submissionId) { errors.push("submission without _id skipped"); continue; }

      const scored = scoreSubmission(row, questions, identity, choiceLabelFor);

      const { error } = await supabase.from("quiz_kobo_submissions").upsert({
        quiz_id: quizId,
        config_id: config.id,
        kobo_submission_id: submissionId,
        kobo_uuid: row?._uuid ?? null,
        participant_name: scored.participantName,
        participant_key: scored.participantKey,
        assessment_type: scored.assessmentType,
        intervention_group: scored.interventionGroup,
        answers: scored.answers,
        per_question: scored.perQuestion,
        score: scored.score,
        max_score: scored.maxScore,
        percentage: scored.percentage,
        band: scored.band,
        submitted_at: scored.submittedAt,
        raw: row,
      }, { onConflict: "quiz_id,kobo_submission_id" });

      if (error) errors.push(error.message);
      else saved += 1;
    }

    await supabase
      .from("quiz_kobo_configs")
      .update({ last_event_at: new Date().toISOString(), last_sync_at: new Date().toISOString() })
      .eq("id", config.id);

    return j({ ok: errors.length === 0, saved, errors: errors.slice(0, 10) }, errors.length && !saved ? 500 : 200);
  } catch (e) {
    console.error("kobo-quiz-webhook error:", (e as Error).message);
    return j({ error: (e as Error).message }, 500);
  }
});
