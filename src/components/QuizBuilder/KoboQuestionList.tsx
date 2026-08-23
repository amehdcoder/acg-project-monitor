/**
 * Read-only rendering of the questions imported from a linked KoboToolbox
 * form, styled to match the in-app question cards on the Quizzes page.
 *
 * The scoring key lives in `quiz_kobo_configs.question_config`; it is owned by
 * the Kobo form, so these cards are deliberately not editable here — the
 * KoboToolbox Sync dialog is the single place where the mapping is changed.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award, CheckCircle, Lock, PlugZap } from "lucide-react";
import type { QuizKoboQuestion, QuizKoboIdentityFields } from "@/lib/quizKobo/scoring";
import { isIdentityQuestion } from "@/lib/quizKobo/scoring";

interface Props {
  questions: QuizKoboQuestion[];
  identity?: QuizKoboIdentityFields | null;
  formTitle?: string | null;
}

export default function KoboQuestionList({ questions, identity, formTitle }: Props) {
  const scored = (questions ?? []).filter(
    (q) => q.enabled !== false && !isIdentityQuestion(q, identity ?? undefined),
  );
  if (scored.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <PlugZap className="h-4 w-4 text-cyan-600" />
          KoboToolbox Questions ({scored.length})
        </h3>
        <Badge variant="secondary" className="gap-1 text-[10px]">
          <Lock className="h-2.5 w-2.5" /> Read-only · synced{formTitle ? ` from ${formTitle}` : ""}
        </Badge>
      </div>

      {scored.map((q, idx) => {
        const correctLabels = q.choices
          .filter((c) => q.correct?.includes(c.name))
          .map((c) => c.label || c.name);
        return (
          <Card key={`${q.group ?? ""}.${q.name}`} className="form-card border-cyan-200/60 dark:border-cyan-900/40">
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-xs font-bold text-cyan-700 dark:text-cyan-300">
                  {idx + 1}
                </span>
                <div className="flex-1 space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-snug text-foreground">{q.label || q.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {q.groupLabel && (
                        <Badge variant="outline" className="text-[10px]">{q.groupLabel}</Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] font-mono">{q.name}</Badge>
                      <Badge variant="outline" className="text-[10px]">{q.type}</Badge>
                    </div>
                  </div>

                  {q.choices.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {q.choices.map((opt) => {
                        const isCorrect = q.correct?.includes(opt.name);
                        return (
                          <div
                            key={opt.name}
                            className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
                              isCorrect
                                ? "border-green-500/50 bg-green-500/10 font-medium text-green-800 dark:text-green-300"
                                : "border-border bg-muted/40 text-muted-foreground"
                            }`}
                          >
                            <span
                              className={`h-3 w-3 shrink-0 rounded-full border ${
                                isCorrect ? "border-green-600 bg-green-600" : "border-muted-foreground/40"
                              }`}
                            />
                            <span className="truncate">{opt.label || opt.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Award className="h-3 w-3" />
                    <span className="font-semibold text-foreground">{q.points}</span> pts
                  </div>
                </div>
              </div>

              <div className="ml-8 flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                <span className="text-xs text-muted-foreground">
                  Correct: <strong>{correctLabels.length ? correctLabels.join(", ") : "Not set"}</strong>
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
