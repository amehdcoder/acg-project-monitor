/**
 * Two-way reconciliation between KoboToolbox and `quiz_kobo_submissions`.
 *
 * KoboToolbox REST Services only push *new/edited* submissions — deletions and
 * some edits never reach the webhook. This module pulls the authoritative list
 * of submissions straight from Kobo, re-plays every payload through the
 * scoring webhook (so edited questions/responses are re-scored), then removes
 * any local row whose Kobo submission no longer exists. Realtime on
 * `quiz_kobo_submissions` propagates both effects to the dashboard instantly.
 */
import { supabase } from "@/integrations/supabase/client";
import { isIdentityQuestion } from "./scoring";
import type { QuizKoboConfig } from "@/hooks/useQuizKobo";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface FullSyncResult {
  fetched: number;
  saved: number;
  deleted: number;
  cleanedConfig: boolean;
}

/**
 * Drop identity/classification rows (Name of Independent Monitor, Assessment
 * type, MDA intervention) and blank rows from a stored question config — they
 * must never contribute points, otherwise a perfect score reads 100/101 = 99%.
 */
export async function sanitizeQuestionConfig(config: QuizKoboConfig): Promise<boolean> {
  const questions = config.question_config ?? [];
  const cleaned = questions.filter((q) => !isIdentityQuestion(q, config.identity_fields));
  if (cleaned.length === questions.length) return false;
  const { error } = await supabase
    .from("quiz_kobo_configs")
    .update({ question_config: cleaned as unknown as any })
    .eq("id", config.id);
  if (error) throw error;
  return true;
}

const PAGE = 200;

export async function fullSyncKobo(config: QuizKoboConfig): Promise<FullSyncResult> {
  const cleanedConfig = await sanitizeQuestionConfig(config).catch(() => false);
  if (!config.webhook_secret) return { fetched: 0, saved: 0, deleted: 0, cleanedConfig };

  const webhookUrl = `${SUPABASE_URL}/functions/v1/kobo-quiz-webhook/${config.quiz_id}`;
  const liveIds = new Set<string>();
  let fetched = 0;
  let saved = 0;

  for (let page = 0; page <= 50; page += 1) {
    const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
      body: {
        action: "fetch_submissions",
        server_url: config.server_url,
        form_uid: config.form_uid,
        api_token: config.api_token,
        page_size: PAGE,
        page,
      },
    });
    if (error) throw new Error(error.message);
    if ((data as any)?.error) throw new Error((data as any).detail || (data as any).error);

    const results: any[] = Array.isArray((data as any)?.results) ? (data as any).results : [];
    if (!results.length) break;
    fetched += results.length;
    for (const r of results) {
      const id = String(r?._id ?? r?.["meta/instanceID"] ?? r?._uuid ?? "");
      if (id) liveIds.add(id);
    }

    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-kobo-secret": config.webhook_secret },
      body: JSON.stringify(results),
    });
    const out = await resp.json().catch(() => ({}));
    saved += Number((out as any)?.saved ?? 0);

    if (results.length < PAGE) break;
  }

  // Remove local rows deleted on KoboToolbox.
  let deleted = 0;
  if (fetched > 0) {
    const { data: local } = await supabase
      .from("quiz_kobo_submissions")
      .select("id, kobo_submission_id")
      .eq("quiz_id", config.quiz_id)
      .limit(5000);
    const stale = (local ?? [])
      .filter((r: any) => !liveIds.has(String(r.kobo_submission_id)))
      .map((r: any) => r.id as string);
    for (let i = 0; i < stale.length; i += 100) {
      const chunk = stale.slice(i, i + 100);
      const { error } = await supabase.from("quiz_kobo_submissions").delete().in("id", chunk);
      if (!error) deleted += chunk.length;
    }
  }

  await supabase
    .from("quiz_kobo_configs")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", config.id);

  return { fetched, saved, deleted, cleanedConfig };
}
