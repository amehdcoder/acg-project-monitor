import { useState, useEffect, useCallback } from "react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, ArrowRight, CheckCircle, XCircle, Clock, Award, BookOpen, Loader2, Lock,
  Sparkles, Trophy, Target,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import quizHero from "@/assets/community-health-worker.jpg.asset.json";

const QuizHeroBanner = ({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
}) => (
  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-amber-400 p-[2px] shadow-lg sm:rounded-3xl">
    <div className="relative overflow-hidden rounded-[calc(1rem-2px)] bg-slate-900 sm:rounded-[calc(1.5rem-2px)]">
      {/* Full image — displayed at its natural aspect ratio so it is never cropped and stays responsive on every screen */}
      <img
        src={quizHero.url}
        alt="Community health worker engaging a family"
        className="block h-auto w-full object-contain"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-indigo-950/25 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-white/25 backdrop-blur-sm">
          <Sparkles className="h-3.5 w-3.5 text-amber-300" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/95 sm:text-[11px]">
            {badge || "Knowledge Assessment"}
          </span>
        </div>
        <h2 className="text-lg font-extrabold leading-tight text-white drop-shadow-lg sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-xs font-medium text-white/85 sm:text-sm">{subtitle}</p>}
      </div>
    </div>
  </div>
);


interface QuizTakerProps {
  quiz: {
    id: string;
    title: string;
    description: string | null;
    post_test_delay_days: number;
    post_test_datetime: string | null;
    time_limit_minutes: number | null;
    passing_score: number;
    open_test_type?: "pre_test" | "post_test" | null;
  };
  onClose: () => void;
}

interface QuizQuestion {
  id: string;
  question_text: string;
  options: { label: string; value: string }[];
  correct_answer: string;
  points: number;
  sort_order: number;
}

const QuizTaker = ({ quiz, onClose }: QuizTakerProps) => {
  const { user, isAdmin } = useAuth();
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number; percentage: number; passed: boolean } | null>(null);
  const [attemptType, setAttemptType] = useState<"pre_test" | "post_test">("pre_test");
  const [existingAttempts, setExistingAttempts] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [startedAt] = useState(new Date());
  const [closedForMembers, setClosedForMembers] = useState(false);
  const [alreadyTaken, setAlreadyTaken] = useState(false);

  const openType: "pre_test" | "post_test" | null =
    quiz.open_test_type === "pre_test" || quiz.open_test_type === "post_test"
      ? quiz.open_test_type
      : null;

  useEffect(() => {
    const init = async () => {
      setLoading(true);

      // Fetch existing attempts first — needed for gating decisions.
      const { data: attempts } = await supabase
        .from("quiz_attempts")
        .select("*")
        .eq("quiz_id", quiz.id)
        .eq("user_id", user!.id)
        .order("created_at");
      if (attempts) setExistingAttempts(attempts);

      const preTest = (attempts || []).find((a: any) => a.attempt_type === "pre_test");
      const postTest = (attempts || []).find((a: any) => a.attempt_type === "post_test");

      // Gate: the quiz is closed for members until an admin opens a test type.
      if (!openType && !isAdmin) {
        setClosedForMembers(true);
        // If the member already has a result, show their latest one.
        const latest = postTest || preTest;
        if (latest) {
          setSubmitted(true);
          setResult({
            score: Number(latest.score),
            total: Number(latest.total_points),
            percentage: Number(latest.percentage),
            passed: Number(latest.percentage) >= quiz.passing_score,
          });
        }
        setLoading(false);
        return;
      }

      // Which test are we taking? The one the admin opened (admins default to pre-test).
      const activeType: "pre_test" | "post_test" = openType || "pre_test";
      setAttemptType(activeType);

      // Fetch questions via secure RPC (correct_answer is never sent to the client).
      const { data: qData } = await supabase
        .rpc("get_quiz_questions_for_attempt", { p_quiz_id: quiz.id });
      if (qData) setQuestions((qData as any[]).map(q => ({ ...q, options: q.options as any, points: Number(q.points), correct_answer: "" })));

      // Members can take the open test only once. If already done, show the result.
      const existingForType = activeType === "pre_test" ? preTest : postTest;
      if (existingForType && !isAdmin) {
        setAlreadyTaken(true);
        setSubmitted(true);
        setResult({
          score: Number(existingForType.score),
          total: Number(existingForType.total_points),
          percentage: Number(existingForType.percentage),
          passed: Number(existingForType.percentage) >= quiz.passing_score,
        });
        setLoading(false);
        return;
      }

      setLoading(false);
    };
    init();
  }, [quiz.id, user, isAdmin, openType]);


  // Timer
  useEffect(() => {
    if (!quiz.time_limit_minutes || submitted || loading) return;
    const totalSeconds = quiz.time_limit_minutes * 60;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const remaining = totalSeconds - elapsed;
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        handleSubmit();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [quiz.time_limit_minutes, submitted, loading, startedAt]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);

    // Server-side scoring — correct answers never leave the database.
    const { data: scored, error } = await supabase.rpc("submit_quiz_attempt", {
      p_quiz_id: quiz.id,
      p_attempt_type: attemptType,
      p_answers: answers,
      p_started_at: startedAt.toISOString(),
    });

    if (error) {
      if ((error as any).code === "23505") {
        toast({ title: "You have already completed this test", variant: "destructive" });
      } else {
        toast({ title: "Error submitting quiz", description: error.message, variant: "destructive" });
      }
      setSubmitting(false);
      return;
    }

    const row = Array.isArray(scored) ? (scored as any[])[0] : (scored as any);
    const score = Number(row?.score ?? 0);
    const totalPoints = Number(row?.total_points ?? 0);
    const percentage = Number(row?.percentage ?? 0);

    setResult({ score, total: totalPoints, percentage, passed: percentage >= quiz.passing_score });
    setSubmitted(true);
    setSubmitting(false);
    toast({ title: `${attemptType === "pre_test" ? "Pre-test" : "Post-test"} completed!` });
  }, [answers, quiz, attemptType, startedAt, submitting]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Quiz is closed for members until an admin opens a test type.
  if (closedForMembers && !(submitted && result)) {
    return (
      <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
        <Button variant="outline" size="sm" onClick={onClose} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Quizzes
        </Button>
        <QuizHeroBanner title={quiz.title} subtitle={quiz.description || "Every Child Healthy. Every Future Bright."} />
        <Card className="form-card">
          <CardContent className="py-12 text-center space-y-3">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Lock className="h-8 w-8" />
            </div>
            <CardTitle className="text-lg">This quiz is currently closed</CardTitle>
            <CardDescription className="max-w-sm mx-auto">
              An administrator has not opened this quiz yet. Please check back — the Pre-test or
              Post-test will appear here the moment it is opened.
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    );
  }


  // Show results after submission or when can't take post-test yet
  if (submitted && result) {
    const preAttempt = existingAttempts.find((a: any) => a.attempt_type === "pre_test");
    const postAttempt = existingAttempts.find((a: any) => a.attempt_type === "post_test");

    return (
      <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
        <Button variant="outline" size="sm" onClick={onClose} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Quizzes
        </Button>

        <Card className="form-card overflow-hidden">
          <div
            className={`relative overflow-hidden px-6 pb-6 pt-8 text-center ${
              result.passed
                ? "bg-gradient-to-br from-emerald-500 via-teal-500 to-green-400"
                : "bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500"
            }`}
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15 blur-xl" />
            <div className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/10 blur-xl" />
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/30 backdrop-blur-sm">
              {result.passed ? <Trophy className="h-10 w-10 text-white" /> : <Target className="h-10 w-10 text-white" />}
            </div>
            <h3 className="relative mt-4 text-xl font-extrabold text-white drop-shadow">
              {attemptType === "pre_test" && !postAttempt ? "Pre-test Complete!" :
               postAttempt ? "Quiz Complete!" : "Results"}
            </h3>
            <p className="relative mt-1 text-sm font-medium text-white/90">
              {result.passed ? "Congratulations! You passed! 🎉" : `You need ${quiz.passing_score}% to pass — keep going!`}
            </p>
            <div className="relative mt-5 text-6xl font-black leading-none text-white drop-shadow-md">
              {Math.round(result.percentage)}%
            </div>
            <p className="relative mt-1 text-xs font-semibold uppercase tracking-wider text-white/80">
              {result.score} / {result.total} points
            </p>
          </div>
          <CardContent className="space-y-4 pt-5">
            <Progress value={result.percentage} className="h-3" />

            {alreadyTaken && (
              <div className="rounded-xl border border-dashed border-border bg-muted/40 py-4 text-center">
                <Lock className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                <p className="px-4 text-sm text-muted-foreground">
                  You have already completed the <strong>{attemptType === "pre_test" ? "Pre-test" : "Post-test"}</strong>.
                  The next test will appear here once an administrator opens it.
                </p>
              </div>
            )}

            {preAttempt && postAttempt && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 p-4 text-center ring-1 ring-slate-200 dark:from-slate-800 dark:to-slate-800/50 dark:ring-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pre-test</p>
                  <p className="mt-1 text-2xl font-extrabold text-slate-600 dark:text-slate-300">{Math.round(Number(preAttempt.percentage))}%</p>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-50 p-4 text-center ring-1 ring-emerald-200 dark:from-emerald-900/40 dark:to-teal-900/20 dark:ring-emerald-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Post-test</p>
                  <p className="mt-1 text-2xl font-extrabold text-emerald-600 dark:text-emerald-300">{Math.round(Number(postAttempt.percentage))}%</p>
                  {Number(postAttempt.percentage) > Number(preAttempt.percentage) && (
                    <p className="mt-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      +{Math.round(Number(postAttempt.percentage) - Number(preAttempt.percentage))}% improvement
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentQ = questions[currentIdx];
  const progress = ((currentIdx + 1) / questions.length) * 100;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="space-y-4 animate-fade-in max-w-2xl mx-auto">
      <QuizHeroBanner
        title={quiz.title}
        subtitle={quiz.description || "Every Child Healthy. Every Future Bright."}
        badge={attemptType === "pre_test" ? "Pre-test Assessment" : "Post-test Assessment"}
      />
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={onClose} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Exit
        </Button>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="gap-1">
            {attemptType === "pre_test" ? "Pre-test" : "Post-test"}
          </Badge>
          {timeLeft !== null && (
            <Badge variant={timeLeft < 60 ? "destructive" : "outline"} className="gap-1 font-mono">
              <Clock className="h-3 w-3" /> {formatTime(Math.max(0, timeLeft))}
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Question {currentIdx + 1} of {questions.length}</span>
          <span>{answeredCount} answered</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {currentQ && (
        <Card className="form-card overflow-hidden border-t-4 border-t-primary">
          <CardContent className="space-y-5 pt-6">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm font-bold text-white shadow-sm">
                {currentIdx + 1}
              </span>
              <p className="pt-1 text-base font-semibold text-foreground">{currentQ.question_text}</p>
            </div>

            <RadioGroup
              value={answers[currentQ.id] || ""}
              onValueChange={val => setAnswers(prev => ({ ...prev, [currentQ.id]: val }))}
              className="space-y-2.5 sm:ml-12"
            >
              {currentQ.options.map((opt, i) => {
                const selected = answers[currentQ.id] === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3.5 transition-all ${
                      selected
                        ? "border-primary bg-gradient-to-r from-primary/10 to-fuchsia-500/5 shadow-sm"
                        : "border-border hover:border-primary/40 hover:bg-muted/40"
                    }`}
                  >
                    <RadioGroupItem value={opt.value} id={`q-${currentQ.id}-${opt.value}`} />
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <Label htmlFor={`q-${currentQ.id}-${opt.value}`} className="flex-1 cursor-pointer text-sm font-medium">
                      {opt.label}
                    </Label>
                    {selected && <CheckCircle className="h-4 w-4 shrink-0 text-primary" />}
                  </label>
                );
              })}
            </RadioGroup>


            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline" size="sm"
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx(prev => prev - 1)}
                className="gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Previous
              </Button>

              {currentIdx < questions.length - 1 ? (
                <Button
                  size="sm"
                  onClick={() => setCurrentIdx(prev => prev + 1)}
                  className="gap-1"
                >
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={submitting || answeredCount < questions.length}
                  className="gap-1"
                >
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                  Submit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick navigation dots */}
      <div className="flex flex-wrap gap-1.5 justify-center">
        {questions.map((q, i) => (
          <button
            key={q.id}
            onClick={() => setCurrentIdx(i)}
            className={`h-7 w-7 rounded-full text-[10px] font-bold transition-all ${
              i === currentIdx
                ? "bg-primary text-primary-foreground scale-110"
                : answers[q.id]
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuizTaker;
