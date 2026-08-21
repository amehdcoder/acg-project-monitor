/**
 * Self-healing repair for the Quiz ⇄ KoboToolbox configuration.
 *
 * Two historic defects are corrected here:
 *  1. Missing participant identity mapping — stored submissions fell back to
 *     humanising the raw XML code ("option_2" → "Option 2").
 *  2. Label-based identity detection wrongly classified real questions (any
 *     label containing "name of …") as the participant-name field and pruned
 *     them from the scored set, shrinking the denominator (9/10 read 7/8 =
 *     87.5%).
 *
 * The repair re-imports the Kobo schema, restores every scorable question
 * (preserving locally configured answer keys and points), persists the correct
 * identity fields and re-plays stored payloads through the scoring webhook.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  IDENTITY_FIELD_RE, leafName, normalizeKey, parseKoboForm,
  type QuizKoboIdentityFields, type QuizKoboQuestion,
} from "./scoring";
import type { QuizKoboConfig } from "@/hooks/useQuizKobo";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface IdentityRepairResult {
  repaired: boolean;
  rescored: number;
  restoredQuestions?: number;
  nameField?: string | null;
  reason?: string;
}

/** A field only qualifies as the participant identifier by its NAME. */
const looksLikeIdentity = (field?: string | null): boolean =>
  !!field && IDENTITY_FIELD_RE.test(normalizeKey(leafName(String(field))));

/** True when the stored config cannot resolve names, or mis-flags a question. */
export function needsIdentityRepair(config?: QuizKoboConfig | null): boolean {
  if (!config) return false;
  const id = (config.identity_fields ?? {}) as QuizKoboIdentityFields;
  if (!id.nameField) return true;
  // A "name field" that is really a quiz question (e.g. schisto_sth_q7).
  if (!looksLikeIdentity(id.nameField)) return true;
  return !(id.nameChoices && id.nameChoices.length > 0);
}

export async function repairKoboIdentity(config: QuizKoboConfig): Promise<IdentityRepairResult> {
  if (!needsIdentityRepair(config)) return { repaired: false, rescored: 0, reason: "already-configured" };

  const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
    body: {
      action: "fetch_submissions",
      server_url: config.server_url,
      form_uid: config.form_uid,
      api_token: config.api_token,
      page_size: 1,
      page: 0,
    },
  });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).detail || (data as any).error);

  const parsed = parseKoboForm((data as any)?.survey ?? [], (data as any)?.choices ?? []);

  const storedIdentity = (config.identity_fields ?? {}) as QuizKoboIdentityFields;
  const merged: QuizKoboIdentityFields = {
    ...storedIdentity,
    // Drop a previously mis-detected question posing as the name field.
    nameField: looksLikeIdentity(storedIdentity.nameField) ? storedIdentity.nameField : null,
    nameChoices: looksLikeIdentity(storedIdentity.nameField) ? storedIdentity.nameChoices : null,
  };
  for (const [k, v] of Object.entries(parsed.identity)) {
    if (v != null && v !== "") (merged as any)[k] = v;
  }
  if (!merged.nameField) return { repaired: false, rescored: 0, reason: "no-name-field-on-form" };

  // Restore every scorable question from the live schema, keeping any answer
  // key / points / enabled flag already configured locally.
  const storedByLeaf = new Map<string, QuizKoboQuestion>();
  for (const q of config.question_config ?? []) storedByLeaf.set(leafName(q.name), q);

  const identityNames = new Set(
    [merged.nameField, merged.assessmentField, merged.interventionField]
      .filter(Boolean)
      .map((f) => leafName(String(f))),
  );

  const questions: QuizKoboQuestion[] = parsed.questions
    .filter((q) => !identityNames.has(leafName(q.name)))
    .map((q) => {
      const prev = storedByLeaf.get(leafName(q.name));
      return prev
        ? { ...q, correct: prev.correct ?? [], points: Number(prev.points) || q.points, enabled: prev.enabled !== false }
        : q;
    });

  const restoredQuestions = Math.max(0, questions.length - (config.question_config ?? []).length);

  const { error: upErr } = await supabase
    .from("quiz_kobo_configs")
    .update({
      identity_fields: merged as unknown as any,
      question_config: questions as unknown as any,
    })
    .eq("id", config.id);
  if (upErr) throw upErr;

  const rescored = await rescoreStoredSubmissions({
    ...config,
    identity_fields: merged,
    question_config: questions,
  });
  return { repaired: true, rescored, restoredQuestions, nameField: merged.nameField };
}

/**
 * Re-play stored raw Kobo payloads through the scoring webhook so existing
 * rows are re-scored with the current configuration (names, correct answers,
 * identity exclusions). Safe to re-run — the webhook upserts by submission id.
 */
export async function rescoreStoredSubmissions(config: QuizKoboConfig): Promise<number> {
  if (!config.webhook_secret) return 0;
  const { data: rows, error } = await supabase
    .from("quiz_kobo_submissions")
    .select("raw")
    .eq("quiz_id", config.quiz_id)
    .limit(5000);
  if (error) throw error;

  const payloads = (rows ?? []).map((r: any) => r.raw).filter(Boolean);
  if (!payloads.length) return 0;

  const url = `${SUPABASE_URL}/functions/v1/kobo-quiz-webhook/${config.quiz_id}`;
  let saved = 0;
  for (let i = 0; i < payloads.length; i += 200) {
    const batch = payloads.slice(i, i + 200);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-kobo-secret": config.webhook_secret },
      body: JSON.stringify(batch),
    });
    const out = await resp.json().catch(() => ({}));
    saved += Number((out as any)?.saved ?? 0);
  }
  return saved;
}
