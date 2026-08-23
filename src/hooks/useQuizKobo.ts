/**
 * Quiz ⇄ KoboToolbox live data hook.
 *
 * Loads the per-quiz Kobo configuration + all scored submissions, then keeps
 * them live through a Supabase Realtime subscription on
 * `public.quiz_kobo_submissions`, so the analytics dashboard updates the
 * instant the `kobo-quiz-webhook` edge function ingests a submission — no
 * manual refresh needed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  QuizKoboIdentityFields, QuizKoboQuestion, ScoreBand,
} from "@/lib/quizKobo/scoring";

export interface QuizKoboConfig {
  id: string;
  quiz_id: string;
  server_url: string;
  form_uid: string;
  form_title: string | null;
  api_token: string;
  sync_mode: string;
  webhook_secret: string;
  question_config: QuizKoboQuestion[];
  identity_fields: QuizKoboIdentityFields;
  last_sync_at: string | null;
  last_event_at: string | null;
}

export interface QuizKoboSubmissionRow {
  id: string;
  quiz_id: string;
  kobo_submission_id: string;
  participant_name: string;
  participant_key: string;
  assessment_type: "pre" | "post";
  intervention_group: string | null;
  answers: Record<string, string>;
  per_question: { name: string; label: string; group: string; answer?: string; correct?: string; isCorrect: boolean; earned: number; points: number }[];
  score: number;
  max_score: number;
  percentage: number;
  band: ScoreBand;
  submitted_at: string;
}

export function useQuizKobo(quizId: string | null | undefined) {
  const [config, setConfig] = useState<QuizKoboConfig | null>(null);
  const [submissions, setSubmissions] = useState<QuizKoboSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!quizId) { setConfig(null); setSubmissions([]); setLoading(false); return; }
    if (!silent) setLoading(true);
    const [{ data: cfg, error: cfgErr }, { data: subs, error: subErr }] = await Promise.all([
      supabase.from("quiz_kobo_configs").select("*").eq("quiz_id", quizId).maybeSingle(),
      supabase.from("quiz_kobo_submissions").select("*").eq("quiz_id", quizId)
        .order("submitted_at", { ascending: false }).limit(5000),
    ]);
    let resolved = (cfg as unknown as QuizKoboConfig) ?? null;
    if (!resolved) {
      // Non-admin analytics viewers cannot read the config table directly (it
      // stores the KoboToolbox API token). Fall back to the credential-free RPC.
      const { data: safe } = await supabase.rpc("get_quiz_kobo_config_safe", { _quiz_id: quizId });
      const row = Array.isArray(safe) ? safe[0] : null;
      resolved = (row as unknown as QuizKoboConfig) ?? null;
    }
    setConfig(resolved);

    setSubmissions(((subs ?? []) as unknown as QuizKoboSubmissionRow[]));
    // Missing config is a normal state (quiz not linked); a hard query failure is not.
    const failure = subErr ?? (resolved ? null : (cfgErr?.code === "PGRST116" ? null : cfgErr));
    setError(failure ? (failure.message || "Sync fetch failed") : null);
    if (!failure) setLastSyncedAt(new Date());
    setLoading(false);
  }, [quizId]);


  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!quizId) return;
    const channel = supabase.channel(`quiz-kobo-${quizId}-${Math.random().toString(36).slice(2, 8)}`);
    channel
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "quiz_kobo_submissions", filter: `quiz_id=eq.${quizId}` },
        () => {
          setLastEventAt(new Date());
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => { void load(true); }, 250);
        },
      )
      // The config carries the scoring key; changing it must re-render analytics.
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "quiz_kobo_configs", filter: `quiz_id=eq.${quizId}` },
        () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => { void load(true); }, 250);
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    // Safety net: if the realtime socket is degraded (offline field networks,
    // proxy timeouts) a light poll still surfaces updates and deletions.
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 20_000);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [quizId, load]);


  return { config, submissions, loading, live, error, lastEventAt, lastSyncedAt, reload: load, setConfig };
}

export default useQuizKobo;
