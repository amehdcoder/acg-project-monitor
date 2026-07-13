import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PartyPopper, BookOpen, ArrowRight, Clock, Award } from "lucide-react";

interface OpenQuiz {
  id: string;
  title: string;
  open_test_type: "pre_test" | "post_test" | null;
  is_published: boolean;
  passing_score: number;
}

const DISMISS_KEY = "quiz-opened-dismissed:v1";

const getDismissed = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || "{}");
  } catch {
    return {};
  }
};

/**
 * Beautiful, centered "assessment is now open" notification shown to members
 * (non-admins) the moment an administrator opens a quiz. Each open state is
 * announced once per member (tracked in localStorage) so it never nags.
 */
const QuizOpenedDialog = ({
  quizzes,
  onTake,
}: {
  quizzes: OpenQuiz[];
  onTake: (quiz: OpenQuiz) => void;
}) => {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(getDismissed);
  const [open, setOpen] = useState(false);

  // The most recent published, currently-open quiz that hasn't been acknowledged.
  const activeQuiz = useMemo(() => {
    return quizzes.find(
      (q) =>
        q.is_published &&
        q.open_test_type &&
        !dismissed[`${q.id}:${q.open_test_type}`],
    );
  }, [quizzes, dismissed]);

  useEffect(() => {
    setOpen(!!activeQuiz);
  }, [activeQuiz]);

  if (!activeQuiz) return null;

  const testLabel = activeQuiz.open_test_type === "pre_test" ? "Pre-test" : "Post-test";

  const acknowledge = () => {
    const next = { ...dismissed, [`${activeQuiz.id}:${activeQuiz.open_test_type}`]: true };
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) acknowledge(); }}>
      <DialogContent
        className="max-w-[92vw] sm:max-w-md overflow-hidden rounded-3xl border-0 p-0 shadow-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Header band */}
        <div className="relative bg-gradient-to-br from-[hsl(214,84%,32%)] via-[hsl(215,80%,42%)] to-[hsl(210,90%,52%)] px-6 pb-8 pt-8 text-center text-white">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/30">
            <PartyPopper className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-xl font-bold tracking-tight">Assessment is now open!</h2>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-white/85">
            The {testLabel} for this quiz has just been unlocked for you.
          </p>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 pb-6 pt-5">
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BookOpen className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{activeQuiz.title}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    <Clock className="h-3 w-3" /> {testLabel} open
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    <Award className="h-3 w-3" /> {activeQuiz.passing_score}% to pass
                  </span>
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-sm leading-relaxed text-muted-foreground">
            Head to the <span className="font-semibold text-foreground">Quizzes</span> page and tap
            <span className="font-semibold text-foreground"> Take Test Now</span> below to begin. You can
            only take this test once — make it count!
          </p>

          <div className="flex flex-col gap-2">
            <Button
              onClick={() => { onTake(activeQuiz); acknowledge(); }}
              className="h-12 w-full gap-2 rounded-xl bg-[hsl(214,84%,32%)] text-base font-semibold text-white shadow-md hover:bg-[hsl(214,84%,28%)]"
            >
              Take Test Now <ArrowRight className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              onClick={acknowledge}
              className="h-10 w-full rounded-xl text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuizOpenedDialog;
