/**
 * Item-by-item (question level) analysis for KoboToolbox-ingested quiz
 * submissions. Powered by the `per_question` payload written by the
 * `kobo-quiz-webhook` scoring engine.
 */
import type { QuizKoboSubmissionRow } from "@/hooks/useQuizKobo";

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
}

export function koboItemStats(rows: QuizKoboSubmissionRow[]): KoboItemStat[] {
  const map = new Map<string, KoboItemStat>();
  for (const r of rows) {
    for (const q of r.per_question ?? []) {
      const entry = map.get(q.name) ?? {
        name: q.name,
        label: q.label || q.name,
        group: q.group || "general",
        answered: 0,
        correct: 0,
        incorrect: 0,
        correctRate: 0,
        failRate: 0,
        points: Number(q.points) || 0,
      };
      entry.answered += 1;
      if (q.isCorrect) entry.correct += 1;
      map.set(q.name, entry);
    }
  }
  return [...map.values()]
    .map((e) => {
      const rate = e.answered ? Math.round((e.correct / e.answered) * 100) : 0;
      return { ...e, incorrect: e.answered - e.correct, correctRate: rate, failRate: 100 - rate };
    })
    .sort((a, b) => b.correctRate - a.correctRate);
}
