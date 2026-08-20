/**
 * Item-by-item (question level) analysis for KoboToolbox-ingested quiz
 * submissions. Powered by the `per_question` payload written by the
 * `kobo-quiz-webhook` scoring engine.
 */
import type { QuizKoboSubmissionRow } from "@/hooks/useQuizKobo";
import type { QuizKoboIdentityFields, QuizKoboQuestion } from "./scoring";
import { isIdentityQuestion, leafName } from "./scoring";

export interface KoboItemStat {
  name: string;
  label: string;
  group: string;
  answered: number;
  correct: number;
  incorrect: number;
  correctRate: number;
  failRate: number;
  points: number;
  /** Configured correct response, human label where available. */
  correctLabel: string;
}

export function koboItemStats(
  rows: QuizKoboSubmissionRow[],
  config?: QuizKoboQuestion[] | null,
  identity?: QuizKoboIdentityFields | null,
): KoboItemStat[] {
  const byName = new Map<string, QuizKoboQuestion>();
  for (const q of config ?? []) byName.set(leafName(q.name), q);

  const correctLabelOf = (name: string, fallback: string): string => {
    const cfg = byName.get(leafName(name));
    if (!cfg || !cfg.correct?.length) {
      return fallback ? fallback.split(/\s+/).filter(Boolean).join(", ") : "—";
    }
    return cfg.correct
      .map((code) => cfg.choices?.find((c) => String(c.name) === String(code))?.label || code)
      .join(", ");
  };

  const map = new Map<string, KoboItemStat>();
  const seen = new Map<string, Set<string>>();
  for (const r of rows) {
    for (const q of r.per_question ?? []) {
      if (isIdentityQuestion({ name: q.name, label: q.label }, identity)) continue;
      const key = leafName(q.name);
      const entry = map.get(key) ?? {
        name: q.name,
        label: q.label || q.name,
        group: q.group || "general",
        answered: 0,
        correct: 0,
        incorrect: 0,
        correctRate: 0,
        failRate: 0,
        participants: 0,
        points: Number(q.points) || 0,
        correctLabel: correctLabelOf(q.name, String((q as { correct?: string }).correct ?? "")),
      };
      entry.answered += 1;
      if (q.isCorrect) entry.correct += 1;
      const set = seen.get(key) ?? new Set<string>();
      set.add(r.participant_key || r.id);
      seen.set(key, set);
      map.set(key, entry);
    }
  }
  return [...map.values()]
    .map((e) => {
      const rate = e.answered ? Math.round((e.correct / e.answered) * 100) : 0;
      return {
        ...e,
        incorrect: e.answered - e.correct,
        correctRate: rate,
        failRate: 100 - rate,
        participants: seen.get(leafName(e.name))?.size ?? 0,
      };
    })
    .sort((a, b) => b.correctRate - a.correctRate);
}

/** Unique participants represented in an item-analysis dataset. */
export function uniqueParticipantCount(rows: QuizKoboSubmissionRow[]): number {
  return new Set(rows.map((r) => r.participant_key || r.id)).size;
}
