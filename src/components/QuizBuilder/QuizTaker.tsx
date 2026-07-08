import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, ArrowRight, CheckCircle, XCircle, Clock, Award, BookOpen, Loader2, Lock,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import quizHero from "@/assets/community-health-worker.jpg.asset.json";

const QuizHeroBanner = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="relative overflow-hidden rounded-2xl border border-primary/20 shadow-sm">
    <img
      src={quizHero.url}
      alt="Community health worker engaging a family"
      className="h-32 w-full object-cover object-center sm:h-44"
      loading="lazy"
    />
    <div className="absolute inset-0 bg-gradient-to-t from-primary/85 via-primary/40 to-transparent" />
    <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
      <h2 className="text-base font-bold leading-tight text-primary-foreground drop-shadow sm:text-lg">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-primary-foreground/90 sm:text-sm">{subtitle}</p>}
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

        <Card className="form-card">
          <CardHeader className="text-center">
            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${result.passed ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"}`}>
              {result.passed ? <CheckCircle className="h-8 w-8" /> : <Award className="h-8 w-8" />}
            </div>
            <CardTitle className="text-xl mt-3">
              {attemptType === "pre_test" && !postAttempt ? "Pre-test Complete!" : 
               postAttempt ? "Quiz Complete!" : "Results"}
            </CardTitle>
            <CardDescription>
              {result.passed ? "Congratulations! You passed!" : `You need ${quiz.passing_score}% to pass.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-foreground">{Math.round(result.percentage)}%</div>
              <p className="text-sm text-muted-foreground">{result.score} / {result.total} points</p>
            </div>
            <Progress value={result.percentage} className="h-3" />

            {alreadyTaken && (
              <Card className="bg-muted/50 border-dashed">
                <CardContent className="py-4 text-center">
                  <Lock className="h-5 w-5 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    You have already completed the <strong>{attemptType === "pre_test" ? "Pre-test" : "Post-test"}</strong>.
                    The next test will appear here once an administrator opens it.
                  </p>
                </CardContent>
              </Card>
            )}


            {preAttempt && postAttempt && (
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-muted/30">
                  <CardContent className="py-3 text-center">
                    <p className="text-xs text-muted-foreground">Pre-test</p>
                    <p className="text-lg font-bold">{Math.round(Number(preAttempt.percentage))}%</p>
                  </CardContent>
                </Card>
                <Card className="bg-primary/5">
                  <CardContent className="py-3 text-center">
                    <p className="text-xs text-muted-foreground">Post-test</p>
                    <p className="text-lg font-bold">{Math.round(Number(postAttempt.percentage))}%</p>
                  </CardContent>
                </Card>
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
      <QuizHeroBanner title={quiz.title} subtitle={quiz.description || "Every Child Healthy. Every Future Bright."} />
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
        <Card className="form-card">
          <CardContent className="pt-6 space-y-5">
            <div className="flex gap-3 items-start">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                {currentIdx + 1}
              </span>
              <p className="text-base font-medium text-foreground pt-1">{currentQ.question_text}</p>
            </div>

            <RadioGroup
              value={answers[currentQ.id] || ""}
              onValueChange={val => setAnswers(prev => ({ ...prev, [currentQ.id]: val }))}
              className="ml-11 space-y-2"
            >
              {currentQ.options.map((opt, i) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 rounded-xl border-2 p-3.5 cursor-pointer transition-all ${
                    answers[currentQ.id] === opt.value
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/30 hover:bg-muted/30"
                  }`}
                >
                  <RadioGroupItem value={opt.value} id={`q-${currentQ.id}-${opt.value}`} />
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <Label htmlFor={`q-${currentQ.id}-${opt.value}`} className="flex-1 cursor-pointer text-sm">
                    {opt.label}
                  </Label>
                </label>
              ))}
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
