import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Plus, Trash2, Save, Eye, Send, ChevronUp, ChevronDown,
  BookOpen, Award, Clock, BarChart3, Loader2, CheckCircle, CalendarIcon, Users, UserPlus, Archive, Eraser,
  Lock, LockOpen, DoorOpen, DoorClosed, Sparkles, RotateCcw, Mail, TrendingUp, AlertTriangle, Copy, ArrowRight, Pencil, PartyPopper,
} from "lucide-react";
import { validateMessageTokens, KNOWN_QUIZ_TOKENS } from "@/lib/quizTokens";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import QuizTaker from "./QuizTaker";
import QuizAnalytics from "./QuizAnalytics";

interface QuizQuestion {
  id: string;
  question_text: string;
  question_type: string;
  options: { label: string; value: string }[];
  correct_answer: string;
  points: number;
  sort_order: number;
}

interface Quiz {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  post_test_delay_days: number;
  post_test_datetime: string | null;
  time_limit_minutes: number | null;
  passing_score: number;
  is_published: boolean;
  open_test_type: "pre_test" | "post_test" | null;
  pass_message: string | null;
  fail_message: string | null;
  pre_pass_message: string | null;
  pre_fail_message: string | null;
  post_pass_message: string | null;
  post_fail_message: string | null;
  created_at: string;
}

const QuizBuilder = () => {
  const { user, isAdmin, isOwner } = useAuth();
  const [confirmDeleteQuiz, setConfirmDeleteQuiz] = useState<Quiz | null>(null);
  const [confirmClearQuiz, setConfirmClearQuiz] = useState<Quiz | null>(null);
  const [confirmReset, setConfirmReset] = useState<{ quiz: Quiz; type: "pre_test" | "post_test" | null } | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [submissionAction, setSubmissionAction] = useState(false);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTaker, setShowTaker] = useState<Quiz | null>(null);
  const [showAnalytics, setShowAnalytics] = useState<Quiz | null>(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New quiz form
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newProjectId, setNewProjectId] = useState("");
  const [newPostTestDate, setNewPostTestDate] = useState<Date | undefined>(undefined);
  const [newPostTestTime, setNewPostTestTime] = useState("09:00");
  const [newTimeLimit, setNewTimeLimit] = useState<number | "">("");
  const [newPassingScore, setNewPassingScore] = useState(70);

  // Assignment state
  const [allUsers, setAllUsers] = useState<{ user_id: string; first_name: string; last_name: string; email: string }[]>([]);
  const [assignedUserIds, setAssignedUserIds] = useState<Set<string>>(new Set());
  const [assignSearch, setAssignSearch] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);

  // Quiz settings (pass mark + custom messages) — editable on published quizzes
  const [showSettings, setShowSettings] = useState(false);
  const [settingsScore, setSettingsScore] = useState(70);
  const [settingsPrePass, setSettingsPrePass] = useState("");
  const [settingsPreFail, setSettingsPreFail] = useState("");
  const [settingsPostPass, setSettingsPostPass] = useState("");
  const [settingsPostFail, setSettingsPostFail] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [previewMember, setPreviewMember] = useState<{ name: string; email: string; source: string } | null>(null);
  const [previewMemberB, setPreviewMemberB] = useState<{ name: string; email: string; source: string } | null>(null);

  // Release results by email
  const [showRelease, setShowRelease] = useState(false);
  const [releaseUsers, setReleaseUsers] = useState<{ user_id: string; name: string; email: string; hasPre: boolean; hasPost: boolean }[]>([]);
  const [releaseSelected, setReleaseSelected] = useState<Set<string>>(new Set());
  const [releaseSearch, setReleaseSearch] = useState("");
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseBusy, setReleaseBusy] = useState(false);

  // Rename quiz (Super Admin) — give any quiz a custom name.
  const [renameQuiz, setRenameQuiz] = useState<Quiz | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const openRenameDialog = (quiz: Quiz) => {
    setRenameQuiz(quiz);
    setRenameValue(quiz.title);
  };

  const handleRenameQuiz = async () => {
    if (!renameQuiz) return;
    const newTitle = renameValue.trim();
    if (!newTitle) {
      toast({ title: "Please enter a quiz name", variant: "destructive" });
      return;
    }
    if (newTitle === renameQuiz.title) {
      setRenameQuiz(null);
      return;
    }
    setRenameBusy(true);
    const { error } = await supabase
      .from("quizzes")
      .update({ title: newTitle })
      .eq("id", renameQuiz.id);
    setRenameBusy(false);
    if (error) {
      toast({ title: "Could not rename quiz", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Quiz renamed", description: `Now called “${newTitle}”.` });
    setQuizzes((prev) => prev.map((q) => (q.id === renameQuiz.id ? { ...q, title: newTitle } : q)));
    setSelectedQuiz((prev) => (prev && prev.id === renameQuiz.id ? { ...prev, title: newTitle } : prev));
    setRenameQuiz(null);
  };


  // Copy quiz to another project
  const [copyQuiz, setCopyQuiz] = useState<Quiz | null>(null);
  const [copyTargetProject, setCopyTargetProject] = useState("");
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyResult, setCopyResult] = useState<{ quiz: Quiz; projectName: string } | null>(null);

  const sampleMember = previewMember ?? { name: "Amina Yusuf", email: "amina.yusuf@example.org", source: "Sample project member" };
  const sampleMemberB = previewMemberB ?? { name: "Chidi Okonkwo", email: "chidi.okonkwo@example.org", source: "Sample project member" };

  // Two representative profiles so admins can see how name/score fields render
  // for different users. The second profile also uses a lower score band.
  const previewProfiles = [
    { member: sampleMember, highBand: true },
    { member: sampleMemberB, highBand: false },
  ];

  // Aggregate token validation across all four configured messages.
  const messageTokenReport = (() => {
    const templates = [settingsPrePass, settingsPreFail, settingsPostPass, settingsPostFail];
    const unknown = new Set<string>();
    let anyNameToken = false;
    for (const t of templates) {
      const v = validateMessageTokens(t || "");
      v.unknown.forEach((u) => unknown.add(u));
      if (v.hasNameToken) anyNameToken = true;
    }
    return { unknown: Array.from(unknown), ok: unknown.size === 0, anyNameToken };
  })();

  const renderConfiguredMessage = (
    template: string,
    fallback: string,
    testLabel: "Pre-test" | "Post-test",
    passed: boolean,
    who: { name: string; email: string; source: string } = sampleMember,
    highBand = true,
  ) => {
    const total = 10;
    const base = passed ? Math.max(settingsScore, 70) : Math.max(0, Math.min(settingsScore - 12, 58));
    const percentage = highBand ? base : Math.max(0, base - 9);
    const score = Math.round((percentage / 100) * total);
    return (template.trim() || fallback)
      .replace(/\{name\}/gi, who.name)
      .replace(/\{score\}/gi, String(score))
      .replace(/\{percentage\}/gi, String(percentage))
      .replace(/\{total\}/gi, String(total))
      .replace(/\{passing\}/gi, String(settingsScore))
      .replace(/\{test\}/gi, testLabel);
  };

  const releasePreviewUser = (() => {
    const selected = releaseUsers.find((u) => releaseSelected.has(u.user_id));
    const first = selected || releaseUsers[0];
    return first ? { name: first.name, email: first.email, source: first.hasPre || first.hasPost ? "Selected quiz member" : "Assigned member" } : sampleMember;
  })();

  useEffect(() => {
    fetchQuizzes();
    if (isAdmin) fetchProjects();
  }, [isAdmin]);

  const fetchProjects = async () => {
    const { data } = await supabase.from("projects").select("id, name").order("name");
    if (data) setProjects(data);
  };

  const fetchQuizzes = async () => {
    setLoading(true);
    if (isAdmin) {
      const { data, error } = await supabase
        .from("quizzes")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setQuizzes(data as Quiz[]);
      if (error) toast({ title: "Error loading quizzes", description: error.message, variant: "destructive" });
    } else {
      // Non-admin: published quizzes they're assigned to OR that belong to any
      // project they are a member of (all linked-project members can answer).
      const quizIds = new Set<string>();

      const { data: assignments } = await supabase
        .from("quiz_user_assignments")
        .select("quiz_id")
        .eq("user_id", user!.id);
      (assignments || []).forEach((a) => a.quiz_id && quizIds.add(a.quiz_id));

      const { data: projAssignments } = await supabase
        .from("user_project_assignments")
        .select("project_id")
        .eq("user_id", user!.id);
      const projectIds = [...new Set((projAssignments || []).map((p) => p.project_id).filter(Boolean))];

      let projectQuizzes: Quiz[] = [];
      if (projectIds.length > 0) {
        const { data: pq } = await supabase
          .from("quizzes")
          .select("*")
          .in("project_id", projectIds)
          .eq("is_published", true);
        projectQuizzes = (pq as Quiz[]) || [];
        projectQuizzes.forEach((q) => quizIds.add(q.id));
      }

      if (quizIds.size > 0) {
        const { data } = await supabase
          .from("quizzes")
          .select("*")
          .in("id", [...quizIds])
          .eq("is_published", true)
          .order("created_at", { ascending: false });
        if (data) setQuizzes(data as Quiz[]);
      } else {
        setQuizzes([]);
      }
    }

    setLoading(false);
  };

  const fetchQuestions = async (quizId: string) => {
    const { data } = await supabase
      .from("quiz_questions")
      .select("*")
      .eq("quiz_id", quizId)
      .order("sort_order");
    if (data) setQuestions(data.map(q => ({
      ...q,
      options: (q.options as any) || [],
      points: Number(q.points),
    })));
  };

  const handleCreateQuiz = async () => {
    if (!newTitle.trim() || !newProjectId) {
      toast({ title: "Please fill title and select a project", variant: "destructive" });
      return;
    }
    if (!newPostTestDate) {
      toast({ title: "Please select a post-test date", variant: "destructive" });
      return;
    }
    // Combine date + time
    const [hours, minutes] = newPostTestTime.split(":").map(Number);
    const postTestDt = new Date(newPostTestDate);
    postTestDt.setHours(hours, minutes, 0, 0);

    const now = new Date();
    const delayMs = postTestDt.getTime() - now.getTime();
    const delayDays = Math.max(0, Math.floor(delayMs / 86400000));

    const { data, error } = await supabase.from("quizzes").insert({
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      project_id: newProjectId,
      created_by: user!.id,
      post_test_delay_days: delayDays,
      post_test_datetime: postTestDt.toISOString(),
      time_limit_minutes: newTimeLimit || null,
      passing_score: newPassingScore,
    }).select().single();
    if (error) {
      toast({ title: "Error creating quiz", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Quiz created!" });
    setShowCreateDialog(false);
    setNewTitle(""); setNewDesc(""); setNewProjectId(""); setNewPostTestDate(undefined); setNewPostTestTime("09:00"); setNewTimeLimit(""); setNewPassingScore(70);
    fetchQuizzes();
    if (data) {
      setSelectedQuiz(data as Quiz);
      setQuestions([]);
    }
  };

  const addQuestion = () => {
    setQuestions(prev => [...prev, {
      id: crypto.randomUUID(),
      question_text: "",
      question_type: "select_one",
      options: [
        { label: "Option A", value: "a" },
        { label: "Option B", value: "b" },
        { label: "Option C", value: "c" },
        { label: "Option D", value: "d" },
      ],
      correct_answer: "a",
      points: 1,
      sort_order: prev.length,
    }]);
  };

  const updateQuestion = (idx: number, updates: Partial<QuizQuestion>) => {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, ...updates } : q));
  };

  const removeQuestion = (idx: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= questions.length) return;
    const arr = [...questions];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setQuestions(arr.map((q, i) => ({ ...q, sort_order: i })));
  };

  const saveQuestions = async () => {
    if (!selectedQuiz) return;
    setSaving(true);
    await supabase.from("quiz_questions").delete().eq("quiz_id", selectedQuiz.id);
    const rows = questions.map((q, i) => ({
      quiz_id: selectedQuiz.id,
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.options,
      correct_answer: q.correct_answer,
      points: q.points,
      sort_order: i,
    }));
    if (rows.length > 0) {
      const { error } = await supabase.from("quiz_questions").insert(rows);
      if (error) {
        toast({ title: "Error saving questions", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }
    toast({ title: "Questions saved!" });
    setSaving(false);
  };

  const togglePublish = async (quiz: Quiz) => {
    const { error } = await supabase.from("quizzes").update({ is_published: !quiz.is_published }).eq("id", quiz.id);
    if (!error) {
      toast({ title: quiz.is_published ? "Quiz unpublished" : "Quiz published!" });
      fetchQuizzes();
      if (selectedQuiz?.id === quiz.id) setSelectedQuiz({ ...quiz, is_published: !quiz.is_published });
    }
  };

  // Admin control: open the quiz for a specific test type (Pre-test/Post-test),
  // or close it for all members. Publishing is auto-enabled when opening.
  const [openStateBusy, setOpenStateBusy] = useState(false);
  const setOpenTestType = async (quiz: Quiz, type: "pre_test" | "post_test" | null) => {
    setOpenStateBusy(true);
    const patch: { open_test_type: "pre_test" | "post_test" | null; is_published?: boolean } = { open_test_type: type };
    // Opening a test implies the quiz must be live for members to see it.
    if (type && !quiz.is_published) patch.is_published = true;
    const { error } = await supabase.from("quizzes").update(patch).eq("id", quiz.id);
    setOpenStateBusy(false);
    if (error) {
      toast({ title: "Could not update quiz status", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: type
        ? `${type === "pre_test" ? "Pre-test" : "Post-test"} is now OPEN for all members`
        : "Quiz closed for all members",
    });
    const updated = { ...quiz, open_test_type: type, is_published: patch.is_published ?? quiz.is_published };
    setQuizzes((prev) => prev.map((q) => (q.id === quiz.id ? updated : q)));
    if (selectedQuiz?.id === quiz.id) setSelectedQuiz(updated);
  };


  const deleteQuiz = async (quizId: string) => {
    const { error } = await supabase.from("quizzes").delete().eq("id", quizId);
    if (!error) {
      toast({ title: "Quiz deleted" });
      if (selectedQuiz?.id === quizId) { setSelectedQuiz(null); setQuestions([]); }
      fetchQuizzes();
    } else {
      toast({ title: "Could not delete quiz", description: error.message, variant: "destructive" });
    }
    setConfirmDeleteQuiz(null);
  };

  // Deep-clone a quiz (and all its questions/options/settings) into a target
  // project. The new row inherits the target project's RLS automatically, so
  // any member of that project can immediately see and edit it.
  const handleCopyQuiz = async () => {
    if (!copyQuiz || !copyTargetProject) {
      toast({ title: "Please select a target project", variant: "destructive" });
      return;
    }
    setCopyBusy(true);
    try {
      // 1. Read the complete original quiz configuration.
      const { data: original, error: readErr } = await supabase
        .from("quizzes")
        .select("*")
        .eq("id", copyQuiz.id)
        .single();
      if (readErr || !original) throw readErr || new Error("Original quiz not found");

      // 2. Build a fresh insert payload, stripping identity/ownership fields and
      // re-pointing project_id to the target project.
      const {
        id: _id,
        project_id: _pid,
        created_by: _cb,
        created_at: _ca,
        updated_at: _ua,
        ...clonable
      } = original as any;

      const targetName =
        projects.find((p) => p.id === copyTargetProject)?.name || "the selected project";

      const { data: newQuiz, error: insErr } = await supabase
        .from("quizzes")
        .insert({
          ...clonable,
          title: `${original.title} · ${targetName}`,
          project_id: copyTargetProject,
          created_by: user!.id,
          is_published: false,
          open_test_type: null,
        })
        .select()
        .single();
      if (insErr || !newQuiz) throw insErr || new Error("Could not create the copied quiz");

      // 3. Deep-copy all questions with their options.
      const { data: srcQuestions } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("quiz_id", copyQuiz.id)
        .order("sort_order");

      if (srcQuestions && srcQuestions.length > 0) {
        const rows = srcQuestions.map((q: any, i: number) => ({
          quiz_id: newQuiz.id,
          question_text: q.question_text,
          question_type: q.question_type,
          options: q.options,
          correct_answer: q.correct_answer,
          points: q.points,
          sort_order: i,
        }));
        const { error: qErr } = await supabase.from("quiz_questions").insert(rows);
        if (qErr) throw qErr;
      }

      // 4. Audit the copy action (source quiz, target project, initiator).
      try {
        await supabase.from("quiz_copy_audit" as any).insert({
          source_quiz_id: copyQuiz.id,
          new_quiz_id: newQuiz.id,
          source_project_id: (original as any).project_id ?? null,
          target_project_id: copyTargetProject,
          target_project_name: targetName,
          source_quiz_title: original.title,
          copied_by: user!.id,
          copied_by_email: user!.email ?? null,
        });
      } catch (auditErr) {
        console.warn("Quiz copy audit log failed:", auditErr);
      }

      toast({
        title: "Quiz copied!",
        description: `“${original.title}” was copied to ${targetName}.`,
      });
      setCopyResult({ quiz: newQuiz as Quiz, projectName: targetName });

      fetchQuizzes();
    } catch (err: any) {
      toast({
        title: "Could not copy quiz",
        description: err?.message || "Unexpected error while copying.",
        variant: "destructive",
      });
    } finally {
      setCopyBusy(false);
    }
  };


  // Owner-only: archive every submission of a quiz for future reference, then
  // clear them so the quiz starts fresh.
  const archiveSubmissions = async (quiz: Quiz, alsoClear: boolean) => {
    if (!user) return;
    setSubmissionAction(true);
    try {
      const { data: attempts, error: fErr } = await supabase
        .from("quiz_attempts")
        .select("*")
        .eq("quiz_id", quiz.id);
      if (fErr) throw fErr;
      const rows = (attempts || []).map((a: any) => ({
        original_attempt_id: a.id,
        quiz_id: a.quiz_id,
        user_id: a.user_id,
        attempt_type: a.attempt_type,
        answers: a.answers,
        score: a.score,
        total_points: a.total_points,
        percentage: a.percentage,
        started_at: a.started_at,
        completed_at: a.completed_at,
        original_created_at: a.created_at,
        archived_by: user.id,
      }));
      if (rows.length > 0) {
        const { error: aErr } = await supabase.from("quiz_archived_attempts" as any).insert(rows);
        if (aErr) throw aErr;
      }
      if (alsoClear) {
        const { error: dErr } = await supabase.from("quiz_attempts").delete().eq("quiz_id", quiz.id);
        if (dErr) throw dErr;
      }
      toast({
        title: alsoClear ? "Submissions archived & cleared" : "Submissions archived",
        description: `${rows.length} attempt${rows.length === 1 ? "" : "s"} archived${alsoClear ? " and removed for fresh entries" : ""}.`,
      });
    } catch (e: any) {
      toast({ title: "Could not archive submissions", description: e.message, variant: "destructive" });
    } finally {
      setSubmissionAction(false);
    }
  };

  // Owner-only: clear (delete) all submissions for fresh entries.
  const clearSubmissions = async (quiz: Quiz) => {
    setSubmissionAction(true);
    try {
      const { error } = await supabase.from("quiz_attempts").delete().eq("quiz_id", quiz.id);
      if (error) throw error;
      toast({ title: "Submissions cleared", description: "All quiz attempts were removed for fresh entries." });
    } catch (e: any) {
      toast({ title: "Could not clear submissions", description: e.message, variant: "destructive" });
    } finally {
      setSubmissionAction(false);
      setConfirmClearQuiz(null);
    }
  };

  // Admin-only: reset a specific test type (or both) so authorized members can
  // retake it. Previous attempts are archived server-side before removal.
  const resetAttempts = async (quiz: Quiz, type: "pre_test" | "post_test" | null) => {
    setResetBusy(true);
    try {
      const { data, error } = await supabase.rpc("reset_quiz_attempts", {
        p_quiz_id: quiz.id,
        p_attempt_type: type,
      });
      if (error) throw error;
      const label = type === "pre_test" ? "Pre-test" : type === "post_test" ? "Post-test" : "Pre-test & Post-test";
      toast({
        title: `${label} reset`,
        description: `${data ?? 0} attempt${data === 1 ? "" : "s"} archived and cleared. Assigned members can retake it now.`,
      });
    } catch (e: any) {
      toast({ title: "Could not reset attempts", description: e.message, variant: "destructive" });
    } finally {
      setResetBusy(false);
      setConfirmReset(null);
    }
  };

  // Admin-only: open settings dialog prefilled from the selected quiz.
  const openSettings = (quiz: Quiz) => {
    setSettingsScore(Math.round(Number(quiz.passing_score ?? 70)));
    setSettingsPrePass(quiz.pre_pass_message ?? quiz.pass_message ?? "");
    setSettingsPreFail(quiz.pre_fail_message ?? quiz.fail_message ?? "");
    setSettingsPostPass(quiz.post_pass_message ?? quiz.pass_message ?? "");
    setSettingsPostFail(quiz.post_fail_message ?? quiz.fail_message ?? "");
    setShowSettings(true);
    loadPreviewMember(quiz);
  };

  const loadPreviewMember = async (quiz: Quiz) => {
    setPreviewMember(null);
    setPreviewMemberB(null);
    try {
      // Prefer assigned quiz members; fall back to any current project members.
      const { data: assignments } = await supabase
        .from("quiz_user_assignments")
        .select("user_id")
        .eq("quiz_id", quiz.id)
        .limit(2);

      let userIds = (assignments || []).map((a) => a.user_id as string);
      let source = "Assigned quiz member";

      if (userIds.length < 2) {
        const { data: projectMembers } = await supabase
          .from("user_project_assignments")
          .select("user_id")
          .eq("project_id", quiz.project_id)
          .limit(4);
        const extra = (projectMembers || [])
          .map((p) => p.user_id as string)
          .filter((id) => !userIds.includes(id));
        if (userIds.length === 0 && extra.length > 0) source = "Current project member";
        userIds = [...userIds, ...extra].slice(0, 2);
      }

      if (userIds.length === 0) return;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", userIds);

      const toMember = (uid: string) => {
        const p = (profiles || []).find((pr) => pr.user_id === uid);
        if (!p) return null;
        return {
          name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || "Project member",
          email: p.email || "No email on file",
          source,
        };
      };

      const a = toMember(userIds[0]);
      const b = userIds[1] ? toMember(userIds[1]) : null;
      if (a) setPreviewMember(a);
      if (b) setPreviewMemberB(b);
    } catch (error) {
      console.warn("Could not load quiz preview members", error);
    }
  };


  // Admin-only: save pass mark & custom pass/fail messages (works on published quizzes).
  const saveQuizSettings = async () => {
    if (!selectedQuiz) return;
    const score = Math.max(0, Math.min(100, settingsScore || 0));
    setSettingsBusy(true);
    try {
      const patch = {
        passing_score: score,
        pre_pass_message: settingsPrePass.trim() || null,
        pre_fail_message: settingsPreFail.trim() || null,
        post_pass_message: settingsPostPass.trim() || null,
        post_fail_message: settingsPostFail.trim() || null,
      };
      const { error } = await supabase
        .from("quizzes")
        .update(patch)
        .eq("id", selectedQuiz.id);
      if (error) throw error;
      setSelectedQuiz({ ...selectedQuiz, ...patch });
      toast({ title: "Quiz settings saved", description: `Passing score set to ${score}%.` });
      setShowSettings(false);
      fetchQuizzes();
    } catch (e: any) {
      toast({ title: "Could not save settings", description: e.message, variant: "destructive" });
    } finally {
      setSettingsBusy(false);
    }
  };

  // Admin-only: load assigned members and whether they have Pre/Post attempts.
  const openReleaseDialog = async () => {
    if (!selectedQuiz) return;
    setShowRelease(true);
    setReleaseLoading(true);
    setReleaseSearch("");
    setReleaseSelected(new Set());
    try {
      const { data: assignments } = await supabase
        .from("quiz_user_assignments")
        .select("user_id")
        .eq("quiz_id", selectedQuiz.id);
      const ids = (assignments || []).map((a) => a.user_id);
      if (ids.length === 0) { setReleaseUsers([]); setReleaseLoading(false); return; }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", ids);
      const { data: attempts } = await supabase
        .from("quiz_attempts")
        .select("user_id, attempt_type")
        .eq("quiz_id", selectedQuiz.id)
        .in("user_id", ids);

      const preSet = new Set((attempts || []).filter((a) => a.attempt_type === "pre_test").map((a) => a.user_id));
      const postSet = new Set((attempts || []).filter((a) => a.attempt_type === "post_test").map((a) => a.user_id));
      const rows = (profiles || []).map((p) => ({
        user_id: p.user_id,
        name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email,
        email: p.email,
        hasPre: preSet.has(p.user_id),
        hasPost: postSet.has(p.user_id),
      }));
      setReleaseUsers(rows);
    } catch (e: any) {
      toast({ title: "Could not load members", description: e.message, variant: "destructive" });
    } finally {
      setReleaseLoading(false);
    }
  };

  const toggleRelease = (userId: string) => {
    setReleaseSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  // Admin-only: send result emails (with pre/post statistical inference) to selected members.
  const releaseResults = async () => {
    if (!selectedQuiz || releaseSelected.size === 0) return;
    if (!messageTokenReport.ok) {
      toast({
        title: "Fix message tokens first",
        description: `Unknown token${messageTokenReport.unknown.length > 1 ? "s" : ""}: ${messageTokenReport.unknown.map((t) => `{${t}}`).join(", ")}. Update the quiz messages before releasing results.`,
        variant: "destructive",
      });
      return;
    }
    setReleaseBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("release-quiz-results", {
        body: { quizId: selectedQuiz.id, userIds: Array.from(releaseSelected) },
      });
      if (error) throw error;
      const sent = (data as any)?.sent ?? 0;
      toast({
        title: "Results released",
        description: `${sent} result email${sent === 1 ? "" : "s"} sent successfully.`,
      });
      setShowRelease(false);
    } catch (e: any) {
      toast({ title: "Could not send results", description: e.message, variant: "destructive" });
    } finally {
      setReleaseBusy(false);
    }
  };





  const getPostTestDisplay = (quiz: Quiz) => {
    if (quiz.post_test_datetime) {
      return format(new Date(quiz.post_test_datetime), "PPP 'at' p");
    }
    const created = new Date(quiz.created_at);
    created.setDate(created.getDate() + quiz.post_test_delay_days);
    return format(created, "PPP");
  };

  // Assignment management
  const openAssignDialog = async () => {
    if (!selectedQuiz) return;
    setShowAssignDialog(true);
    setAssignLoading(true);
    setAssignSearch("");

    // Fetch all non-admin users
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, email")
      .order("first_name");

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role");

    const adminIds = new Set((roles || []).filter(r => r.role === "super_admin" || r.role === "systems_admin").map(r => r.user_id));
    const nonAdminProfiles = (profiles || []).filter(p => !adminIds.has(p.user_id) && p.user_id !== user!.id);
    setAllUsers(nonAdminProfiles);

    // Fetch current assignments
    const { data: assignments } = await supabase
      .from("quiz_user_assignments")
      .select("user_id")
      .eq("quiz_id", selectedQuiz.id);

    setAssignedUserIds(new Set((assignments || []).map(a => a.user_id)));
    setAssignLoading(false);
  };

  const toggleUserAssignment = (userId: string) => {
    setAssignedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const saveAssignments = async () => {
    if (!selectedQuiz || !user) return;
    setAssignLoading(true);

    // Delete all existing, re-insert
    await supabase.from("quiz_user_assignments").delete().eq("quiz_id", selectedQuiz.id);

    if (assignedUserIds.size > 0) {
      const rows = Array.from(assignedUserIds).map(uid => ({
        quiz_id: selectedQuiz.id,
        user_id: uid,
        assigned_by: user.id,
      }));
      const { error } = await supabase.from("quiz_user_assignments").insert(rows);
      if (error) {
        toast({ title: "Error saving assignments", description: error.message, variant: "destructive" });
        setAssignLoading(false);
        return;
      }
    }
    toast({ title: "User assignments saved!" });
    setShowAssignDialog(false);
    setAssignLoading(false);
  };

  const filteredAssignUsers = allUsers.filter(u => {
    if (!assignSearch.trim()) return true;
    const s = assignSearch.toLowerCase();
    return u.first_name.toLowerCase().includes(s) || u.last_name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
  });

  if (showTaker) {
    return <QuizTaker quiz={showTaker} onClose={() => { setShowTaker(null); fetchQuizzes(); }} />;
  }

  if (showAnalytics && selectedQuiz) {
    return <QuizAnalytics quiz={selectedQuiz} onBack={() => setShowAnalytics(null)} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-fuchsia-600 to-amber-500 p-5 shadow-lg sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-12 left-1/3 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur-sm">
              <BookOpen className="h-6 w-6 text-white" />
            </span>
            <div>
              <h1 className="text-xl font-extrabold text-white drop-shadow sm:text-2xl">
                {isAdmin ? "Quiz Manager" : "My Quizzes"}
              </h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-white/85">
                <Sparkles className="h-3.5 w-3.5 text-amber-200" />
                {isAdmin ? "Create quizzes with Pre-test & Post-test analysis" : "Take your assigned assessments"}
              </p>
            </div>
          </div>
          {isAdmin && (
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="gap-2 bg-white text-indigo-700 shadow-md hover:bg-white/90"
            >
              <Plus className="h-4 w-4" /> Create Quiz
            </Button>
          )}
        </div>
      </div>


      {selectedQuiz ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => { setSelectedQuiz(null); setQuestions([]); }}>
              ← Back to Quizzes
            </Button>
            <Badge variant={selectedQuiz.is_published ? "default" : "secondary"}>
              {selectedQuiz.is_published ? "Published" : "Draft"}
            </Badge>
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              Post-test: {getPostTestDisplay(selectedQuiz)}
            </span>
          </div>

          <Card className="form-card">
            <CardHeader>
              <CardTitle className="text-lg">{selectedQuiz.title}</CardTitle>
              {selectedQuiz.description && <CardDescription>{selectedQuiz.description}</CardDescription>}
              <div className="flex gap-2 flex-wrap pt-2">
                {isAdmin && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => togglePublish(selectedQuiz)} className="gap-1">
                      <Send className="h-3 w-3" /> {selectedQuiz.is_published ? "Unpublish" : "Publish"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAnalytics(selectedQuiz)} className="gap-1">
                      <BarChart3 className="h-3 w-3" /> Analytics
                    </Button>
                    <Button size="sm" variant="outline" onClick={openAssignDialog} className="gap-1">
                      <UserPlus className="h-3 w-3" /> Assign Users
                    </Button>
                    {isOwner && (
                      <>
                        <Button
                          size="sm" variant="outline" disabled={submissionAction}
                          onClick={() => archiveSubmissions(selectedQuiz, false)}
                          className="gap-1"
                        >
                          <Archive className="h-3 w-3" /> Archive Submissions
                        </Button>
                        <Button
                          size="sm" variant="outline" disabled={submissionAction}
                          onClick={() => setConfirmClearQuiz(selectedQuiz)}
                          className="gap-1 text-amber-600"
                        >
                          <Eraser className="h-3 w-3" /> Clear Submissions
                        </Button>
                      </>
                    )}
                  </>
                )}
                {selectedQuiz.is_published && (
                  <Button size="sm" onClick={() => setShowTaker(selectedQuiz)} className="gap-1">
                    <Eye className="h-3 w-3" /> Take Quiz
                  </Button>
                )}
              </div>
            </CardHeader>
          </Card>

          {/* ── Beautiful Test Access Control (Admin) ── */}
          {isAdmin && (() => {
            const openType = selectedQuiz.open_test_type;
            const isOpen = openType === "pre_test" || openType === "post_test";
            return (
              <Card className={cn(
                "form-card overflow-hidden border-0 relative",
                isOpen
                  ? "bg-gradient-to-br from-emerald-500/10 via-emerald-400/5 to-transparent ring-1 ring-emerald-500/30"
                  : "bg-gradient-to-br from-muted/60 via-muted/30 to-transparent ring-1 ring-border"
              )}>
                <CardContent className="p-4 sm:p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-colors",
                        isOpen ? "bg-emerald-500 text-white" : "bg-muted-foreground/10 text-muted-foreground"
                      )}>
                        {isOpen ? <DoorOpen className="h-6 w-6" /> : <DoorClosed className="h-6 w-6" />}
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground flex items-center gap-1.5">
                          Test Access Control
                          <Sparkles className="h-3.5 w-3.5 text-primary/60" />
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isOpen
                            ? `The ${openType === "pre_test" ? "Pre-test" : "Post-test"} is OPEN — all members can take it now.`
                            : "Closed for all members. Open a test to let members take it."}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={isOpen ? "default" : "secondary"}
                      className={cn("gap-1", isOpen && "bg-emerald-600 hover:bg-emerald-600")}
                    >
                      {isOpen ? <LockOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                      {isOpen ? "Open" : "Closed"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      disabled={openStateBusy}
                      onClick={() => setOpenTestType(selectedQuiz, "pre_test")}
                      className={cn(
                        "group rounded-2xl border-2 p-3.5 text-left transition-all disabled:opacity-60",
                        openType === "pre_test"
                          ? "border-blue-500 bg-blue-500/10 shadow-sm"
                          : "border-border bg-background/60 hover:border-blue-400/60 hover:bg-blue-500/5"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <BookOpen className={cn("h-4 w-4", openType === "pre_test" ? "text-blue-600" : "text-muted-foreground")} />
                        <span className="text-sm font-semibold text-foreground">Open Pre-test</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">Members take the Pre-test only.</p>
                    </button>

                    <button
                      type="button"
                      disabled={openStateBusy}
                      onClick={() => setOpenTestType(selectedQuiz, "post_test")}
                      className={cn(
                        "group rounded-2xl border-2 p-3.5 text-left transition-all disabled:opacity-60",
                        openType === "post_test"
                          ? "border-emerald-500 bg-emerald-500/10 shadow-sm"
                          : "border-border bg-background/60 hover:border-emerald-400/60 hover:bg-emerald-500/5"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Award className={cn("h-4 w-4", openType === "post_test" ? "text-emerald-600" : "text-muted-foreground")} />
                        <span className="text-sm font-semibold text-foreground">Open Post-test</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">Members take the Post-test only.</p>
                    </button>

                    <button
                      type="button"
                      disabled={openStateBusy || !isOpen}
                      onClick={() => setOpenTestType(selectedQuiz, null)}
                      className={cn(
                        "group rounded-2xl border-2 p-3.5 text-left transition-all disabled:opacity-40",
                        "border-border bg-background/60 hover:border-rose-400/60 hover:bg-rose-500/5"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-rose-500" />
                        <span className="text-sm font-semibold text-foreground">Close Quiz</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">Mark closed for all members.</p>
                    </button>
                  </div>
                  {openStateBusy && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Updating access…
                    </div>
                  )}

                  {/* Reset a test type so authorized members can retake it (attempts are archived first). */}
                  <div className="rounded-2xl border border-dashed border-border/70 bg-background/50 p-3.5">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-semibold text-foreground">Reset attempts</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 mb-2.5">
                      Archive & clear a test so assigned members can take it again when authorized.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm" variant="outline" disabled={resetBusy}
                        onClick={() => setConfirmReset({ quiz: selectedQuiz, type: "pre_test" })}
                        className="gap-1 text-blue-600"
                      >
                        <RotateCcw className="h-3 w-3" /> Reset Pre-test
                      </Button>
                      <Button
                        size="sm" variant="outline" disabled={resetBusy}
                        onClick={() => setConfirmReset({ quiz: selectedQuiz, type: "post_test" })}
                        className="gap-1 text-emerald-600"
                      >
                        <RotateCcw className="h-3 w-3" /> Reset Post-test
                      </Button>
                      <Button
                        size="sm" variant="outline" disabled={resetBusy}
                        onClick={() => setConfirmReset({ quiz: selectedQuiz, type: null })}
                        className="gap-1 text-amber-600"
                      >
                        <RotateCcw className="h-3 w-3" /> Reset Both
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* ── Grading & Results (Admin) ── */}
          {isAdmin && (
            <Card className="form-card overflow-hidden border-0 bg-gradient-to-br from-indigo-500/10 via-fuchsia-500/5 to-transparent ring-1 ring-indigo-500/30">
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-white shadow-sm">
                    <Award className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground flex items-center gap-1.5">
                      Grading & Results <Sparkles className="h-3.5 w-3.5 text-primary/60" />
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Pass mark <strong>{selectedQuiz.passing_score}%</strong> — editable anytime, even after publishing.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openSettings(selectedQuiz)} className="gap-1.5 text-indigo-600">
                    <Save className="h-3.5 w-3.5" /> Pass mark & messages
                  </Button>
                  <Button size="sm" onClick={openReleaseDialog} className="gap-1.5 bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white hover:opacity-90">
                    <Send className="h-3.5 w-3.5" /> Release results by email
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}




          {isAdmin && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Questions ({questions.length})</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={addQuestion} className="gap-1">
                    <Plus className="h-3 w-3" /> Add Question
                  </Button>
                  <Button size="sm" onClick={saveQuestions} disabled={saving} className="gap-1">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save All
                  </Button>
                </div>
              </div>

              {questions.map((q, idx) => (
                <Card key={q.id} className="form-card">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col gap-1 pt-1">
                        <button onClick={() => moveQuestion(idx, -1)} className="text-muted-foreground hover:text-foreground" disabled={idx === 0}>
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {idx + 1}
                        </span>
                        <button onClick={() => moveQuestion(idx, 1)} className="text-muted-foreground hover:text-foreground" disabled={idx === questions.length - 1}>
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex-1 space-y-3">
                        <Textarea
                          value={q.question_text}
                          onChange={e => updateQuestion(idx, { question_text: e.target.value })}
                          placeholder="Enter your question..."
                          className="form-input min-h-[60px]"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {q.options.map((opt, oi) => (
                            <div key={oi} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`correct-${q.id}`}
                                checked={q.correct_answer === opt.value}
                                onChange={() => updateQuestion(idx, { correct_answer: opt.value })}
                                className="h-4 w-4 text-primary accent-primary"
                              />
                              <Input
                                value={opt.label}
                                onChange={e => {
                                  const newOpts = [...q.options];
                                  newOpts[oi] = { ...newOpts[oi], label: e.target.value };
                                  updateQuestion(idx, { options: newOpts });
                                }}
                                className="form-input flex-1"
                                placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                              />
                              {q.options.length > 2 && (
                                <button
                                  onClick={() => {
                                    const newOpts = q.options.filter((_, i) => i !== oi);
                                    updateQuestion(idx, { options: newOpts });
                                  }}
                                  className="text-destructive hover:text-destructive/80"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 items-center flex-wrap">
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => {
                              const letter = String.fromCharCode(97 + q.options.length);
                              updateQuestion(idx, {
                                options: [...q.options, { label: `Option ${letter.toUpperCase()}`, value: letter }]
                              });
                            }}
                            className="text-xs gap-1"
                          >
                            <Plus className="h-3 w-3" /> Add Option
                          </Button>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Award className="h-3 w-3" />
                            <Input
                              type="number" min={0.5} step={0.5}
                              value={q.points}
                              onChange={e => updateQuestion(idx, { points: parseFloat(e.target.value) || 1 })}
                              className="form-input w-16 h-7 text-xs"
                            />
                            pts
                          </div>
                        </div>
                      </div>
                      <button onClick={() => removeQuestion(idx)} className="text-destructive hover:text-destructive/80 pt-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="ml-8 flex items-center gap-2">
                      <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                      <span className="text-xs text-muted-foreground">
                        Correct: <strong>{q.options.find(o => o.value === q.correct_answer)?.label || "Not set"}</strong>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {questions.length === 0 && (
                <Card className="form-card">
                  <CardContent className="py-12 text-center">
                    <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">No questions yet. Click "Add Question" to start building.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Non-admin: show Take Quiz prominently */}
          {!isAdmin && selectedQuiz.is_published && (
            <Card className="form-card overflow-hidden">
              <div className="relative overflow-hidden bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-amber-400 px-6 py-10 text-center">
                <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15 blur-xl" />
                <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur-sm">
                  <BookOpen className="h-8 w-8 text-white" />
                </div>
                <p className="relative mt-4 text-lg font-extrabold text-white drop-shadow">Ready to take this quiz?</p>
                <p className="relative mt-1 text-sm font-medium text-white/85">Give it your best — good luck!</p>
                <Button
                  onClick={() => setShowTaker(selectedQuiz)}
                  className="relative mt-5 gap-2 bg-white text-indigo-700 shadow-md hover:bg-white/90"
                >
                  <Eye className="h-4 w-4" /> Start Quiz
                </Button>
              </div>
            </Card>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-full flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : quizzes.length === 0 ? (
            <Card className="col-span-full form-card">
              <CardContent className="py-12 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">
                  {isAdmin ? "No quizzes created yet." : "No quizzes assigned to you yet."}
                </p>
              </CardContent>
            </Card>
          ) : (
            quizzes.map((quiz, idx) => {
              const accents = [
                "from-indigo-500 to-fuchsia-500",
                "from-emerald-500 to-teal-500",
                "from-amber-500 to-orange-500",
                "from-sky-500 to-blue-600",
                "from-rose-500 to-pink-500",
                "from-violet-500 to-purple-600",
              ];
              const accent = accents[idx % accents.length];
              return (
              <Card
                key={quiz.id}
                className="form-card group relative cursor-pointer overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-card"
                onClick={() => { setSelectedQuiz(quiz); if (isAdmin) fetchQuestions(quiz.id); }}
              >
                <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${accent}`} />
                <CardHeader className="pb-2 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-sm`}>
                        <BookOpen className="h-5 w-5" />
                      </span>
                      <CardTitle className="text-base leading-snug">{quiz.title}</CardTitle>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {quiz.open_test_type ? (
                        <Badge className="gap-1 bg-emerald-600 text-[10px] hover:bg-emerald-600">
                          <LockOpen className="h-2.5 w-2.5" />
                          {quiz.open_test_type === "pre_test" ? "Pre-test open" : "Post-test open"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Lock className="h-2.5 w-2.5" /> Closed
                        </Badge>
                      )}
                    </div>
                  </div>

                  {quiz.description && (
                    <CardDescription className="line-clamp-2 pt-1">{quiz.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 font-medium text-muted-foreground">
                      <CalendarIcon className="h-3 w-3" />
                      {getPostTestDisplay(quiz)}
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      <Award className="h-3 w-3" />
                      {quiz.passing_score}% pass
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {quiz.is_published && (
                      <Button
                        size="sm"
                        onClick={e => { e.stopPropagation(); setShowTaker(quiz); }}
                        className={`gap-1 bg-gradient-to-r ${accent} text-xs text-white shadow-sm hover:opacity-90`}
                      >
                        <Eye className="h-3 w-3" /> Take
                      </Button>
                    )}
                    {isAdmin && (
                      <>
                        <Button
                          size="icon" variant="ghost"
                          onClick={e => { e.stopPropagation(); setCopyResult(null); setCopyTargetProject(""); setCopyQuiz(quiz); }}
                          className="ml-auto h-7 w-7 text-muted-foreground/40 hover:text-primary"
                          aria-label="Copy quiz to another project"
                          title="Copy to project"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          onClick={e => { e.stopPropagation(); setConfirmDeleteQuiz(quiz); }}
                          className="h-7 w-7 text-muted-foreground/40 hover:text-destructive"
                          aria-label="Delete quiz"
                          title="Delete quiz"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
              );
            })
          )}
        </div>
      )}

      {/* Copy Quiz to Another Project Dialog */}
      <Dialog open={!!copyQuiz} onOpenChange={(o) => { if (!o) { setCopyQuiz(null); setCopyResult(null); setCopyTargetProject(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-primary" /> Copy quiz to another project
            </DialogTitle>
            <DialogDescription>
              {copyResult
                ? "Your quiz has been duplicated."
                : `Create an independent copy of “${copyQuiz?.title ?? ""}” in another project. All questions, options, and settings are deep-copied.`}
            </DialogDescription>
          </DialogHeader>

          {copyResult ? (
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <p>Quiz successfully copied to <span className="font-semibold">{copyResult.projectName}</span>! Any member of that project can now see and edit it.</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setCopyQuiz(null); setCopyResult(null); setCopyTargetProject(""); }}>Close</Button>
                <Button
                  className="gap-1"
                  onClick={() => {
                    const q = copyResult.quiz;
                    setCopyQuiz(null); setCopyResult(null); setCopyTargetProject("");
                    setSelectedQuiz(q);
                    fetchQuestions(q.id);
                  }}
                >
                  Open copied quiz <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div>
                <Label className="form-label">Target project</Label>
                <Select value={copyTargetProject} onValueChange={setCopyTargetProject}>
                  <SelectTrigger className="form-input">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setCopyQuiz(null); setCopyTargetProject(""); }}>Cancel</Button>
                <Button onClick={handleCopyQuiz} disabled={copyBusy || !copyTargetProject} className="gap-1">
                  {copyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                  Copy quiz
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quiz Settings Dialog (pass mark + custom messages) */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Award className="h-5 w-5 text-indigo-600" /> Grading & result messages</DialogTitle>
            <DialogDescription>Set the pass mark and personalize what members see after each test.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label className="form-label">Passing Score (%)</Label>
              <Input type="number" min={0} max={100} value={settingsScore} onChange={(e) => setSettingsScore(parseInt(e.target.value) || 0)} className="form-input" />
            </div>

            <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-fuchsia-50 p-3 text-[11px] leading-relaxed text-indigo-900 dark:border-indigo-900/50 dark:from-indigo-950/40 dark:to-fuchsia-950/20 dark:text-indigo-200">
              <p className="font-semibold">Personalize with these tokens:</p>
              <p className="mt-1 font-mono">
                {"{name}"} · {"{score}"} · {"{percentage}"} · {"{total}"} · {"{passing}"} · {"{test}"}
              </p>
              <p className="mt-1 opacity-80">Example: “Well done {"{name}"}! You scored {"{percentage}"}% on the {"{test}"}.”</p>
            </div>

            {messageTokenReport.unknown.length > 0 ? (
              <div className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-bold">Unknown token{messageTokenReport.unknown.length > 1 ? "s" : ""} detected — fix before releasing results.</p>
                  <p className="mt-0.5 font-mono">{messageTokenReport.unknown.map((t) => `{${t}}`).join(" · ")}</p>
                  <p className="mt-1 opacity-80">These will be sent to members literally. Use only: {KNOWN_QUIZ_TOKENS.map((t) => `{${t}}`).join(" · ")}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                <CheckCircle className="h-4 w-4 shrink-0" />
                All tokens valid.{!messageTokenReport.anyNameToken && " Tip: add {name} to personalize the message."}
              </div>
            )}

            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300"><BookOpen className="h-3.5 w-3.5" /> Pre-test messages</p>
              <div className="space-y-3">
                <div>
                  <Label className="form-label">Pass message</Label>
                  <Textarea value={settingsPrePass} onChange={(e) => setSettingsPrePass(e.target.value)} placeholder="e.g. Great start, {name}! You scored {percentage}%." className="form-input min-h-[60px]" />
                </div>
                <div>
                  <Label className="form-label">Fail message</Label>
                  <Textarea value={settingsPreFail} onChange={(e) => setSettingsPreFail(e.target.value)} placeholder="e.g. {name}, you scored {percentage}% — the post-test is your chance to shine." className="form-input min-h-[60px]" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300"><Award className="h-3.5 w-3.5" /> Post-test messages</p>
              <div className="space-y-3">
                <div>
                  <Label className="form-label">Pass message</Label>
                  <Textarea value={settingsPostPass} onChange={(e) => setSettingsPostPass(e.target.value)} placeholder="e.g. Congratulations {name}! You passed with {percentage}%." className="form-input min-h-[60px]" />
                </div>
                <div>
                  <Label className="form-label">Fail message</Label>
                  <Textarea value={settingsPostFail} onChange={(e) => setSettingsPostFail(e.target.value)} placeholder="e.g. Keep going, {name} — review the material and retry when authorized." className="form-input min-h-[60px]" />
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="bg-gradient-to-r from-sky-600 via-indigo-600 to-fuchsia-600 px-4 py-3 text-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-white/80">Admin live preview</p>
                    <p className="text-sm font-extrabold">Configured member result messages</p>
                  </div>
                  <Sparkles className="h-5 w-5 shrink-0 text-white" />
                </div>
              </div>
              <div className="space-y-4 p-4">
                {previewProfiles.map(({ member, highBand }, idx) => (
                  <div key={idx} className="space-y-3">
                    <div className="rounded-xl border border-dashed border-border bg-muted/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Sample user {idx + 1} of {previewProfiles.length} · {highBand ? "higher score band" : "lower score band"}
                      </p>
                      <p className="mt-1 text-sm font-bold text-foreground">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email} · {member.source}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                        <Badge className="mb-2 bg-emerald-600 text-white hover:bg-emerald-600">Pre-test pass</Badge>
                        <p className="whitespace-pre-line text-sm font-semibold leading-relaxed text-emerald-950 dark:text-emerald-100">
                          {renderConfiguredMessage(settingsPrePass, "Excellent work, {name}! You scored {percentage}% on the {test} and met the {passing}% pass mark.", "Pre-test", true, member, highBand)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                        <Badge className="mb-2 bg-amber-600 text-white hover:bg-amber-600">Pre-test fail</Badge>
                        <p className="whitespace-pre-line text-sm font-semibold leading-relaxed text-amber-950 dark:text-amber-100">
                          {renderConfiguredMessage(settingsPreFail, "Thank you, {name}. You scored {percentage}% on the {test}; review the learning points before the Post-test.", "Pre-test", false, member, highBand)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 dark:border-teal-900/50 dark:bg-teal-950/20">
                        <Badge className="mb-2 bg-teal-600 text-white hover:bg-teal-600">Post-test pass</Badge>
                        <p className="whitespace-pre-line text-sm font-semibold leading-relaxed text-teal-950 dark:text-teal-100">
                          {renderConfiguredMessage(settingsPostPass, "Congratulations, {name}! Your {test} score is {percentage}% ({score}/{total}), above the {passing}% pass mark.", "Post-test", true, member, highBand)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/50 dark:bg-rose-950/20">
                        <Badge className="mb-2 bg-rose-600 text-white hover:bg-rose-600">Post-test fail</Badge>
                        <p className="whitespace-pre-line text-sm font-semibold leading-relaxed text-rose-950 dark:text-rose-100">
                          {renderConfiguredMessage(settingsPostFail, "Keep going, {name}. You scored {percentage}% on the {test}; an admin can authorize a retake after review.", "Post-test", false, member, highBand)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button>
            <Button onClick={saveQuizSettings} disabled={settingsBusy} className="gap-1.5">
              {settingsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Release Results Dialog */}
      <Dialog open={showRelease} onOpenChange={setShowRelease}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-fuchsia-600" /> Release results by email</DialogTitle>
            <DialogDescription>Selected members receive a colorful summary with their Pre-test vs Post-test statistical analysis.</DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-rose-500 px-4 py-3 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-white/80">Admin email preview</p>
                  <p className="text-base font-extrabold">Hello {releasePreviewUser.name}, here is your assessment summary</p>
                  <p className="mt-1 text-xs text-white/80">Previewing with {releasePreviewUser.source}: {releasePreviewUser.email || "No email on file"}</p>
                </div>
                <Mail className="h-5 w-5 shrink-0 text-white" />
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center dark:border-blue-900/50 dark:bg-blue-950/20">
                  <p className="text-[11px] font-bold uppercase text-blue-700 dark:text-blue-300">Pre-test</p>
                  <p className="mt-1 text-2xl font-black text-blue-900 dark:text-blue-100">62%</p>
                  <p className="text-[11px] text-blue-700/80 dark:text-blue-200/80">6/10 pts</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <p className="text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Post-test</p>
                  <p className="mt-1 text-2xl font-black text-emerald-900 dark:text-emerald-100">84%</p>
                  <p className="text-[11px] text-emerald-700/80 dark:text-emerald-200/80">8/10 pts</p>
                </div>
                <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3 text-center dark:border-fuchsia-900/50 dark:bg-fuchsia-950/20">
                  <p className="text-[11px] font-bold uppercase text-fuchsia-700 dark:text-fuchsia-300">Change</p>
                  <p className="mt-1 flex items-center justify-center gap-1 text-2xl font-black text-fuchsia-900 dark:text-fuchsia-100"><TrendingUp className="h-5 w-5" /> +22</p>
                  <p className="text-[11px] text-fuchsia-700/80 dark:text-fuchsia-200/80">points</p>
                </div>
              </div>
              <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-sky-50 p-3 dark:border-indigo-900/50 dark:from-indigo-950/30 dark:to-sky-950/20">
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Plain-language inference</p>
                <p className="mt-1 text-sm leading-relaxed text-indigo-950 dark:text-indigo-100">
                  {releasePreviewUser.name}'s score improved from 62% to 84%. This preview explains whether the improvement is statistically significant, highlights questions improved or declined, and keeps the message personal, respectful, and easy to understand.
                </p>
              </div>
            </div>
          </div>
          <Input value={releaseSearch} onChange={(e) => setReleaseSearch(e.target.value)} placeholder="Search members…" className="form-input" />
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>{releaseSelected.size} selected</span>
            <button type="button" className="text-primary font-medium" onClick={() => setReleaseSelected(new Set(releaseUsers.map((u) => u.user_id)))}>Select all</button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 -mx-1 px-1">
            {releaseLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading members…</div>
            ) : releaseUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No members are assigned to this quiz yet.</p>
            ) : (
              releaseUsers
                .filter((u) => !releaseSearch.trim() || u.name.toLowerCase().includes(releaseSearch.toLowerCase()) || (u.email ?? "").toLowerCase().includes(releaseSearch.toLowerCase()))
                .map((u) => (
                  <label key={u.user_id} className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-2.5 cursor-pointer hover:bg-muted/40">
                    <Checkbox checked={releaseSelected.has(u.user_id)} onCheckedChange={() => toggleRelease(u.user_id)} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">{u.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{u.email || "no email on file"}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold", u.hasPre ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground")}>Pre</span>
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold", u.hasPost ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")}>Post</span>
                    </div>
                  </label>
                ))
            )}
          </div>
          {!messageTokenReport.ok && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Unknown token{messageTokenReport.unknown.length > 1 ? "s" : ""} in the quiz messages ({messageTokenReport.unknown.map((t) => `{${t}}`).join(", ")}). Fix them in Settings before sending.</span>
            </div>
          )}
          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => setShowRelease(false)}>Cancel</Button>
            <Button onClick={releaseResults} disabled={releaseBusy || releaseSelected.size === 0 || !messageTokenReport.ok} className="gap-1.5 bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white hover:opacity-90">
              {releaseBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send results
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      {/* Create Quiz Dialog */}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Quiz</DialogTitle>
            <DialogDescription>Set up a quiz with Pre-test and Post-test capabilities.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="form-label">Quiz Title *</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. NTD Knowledge Assessment" className="form-input" />
            </div>
            <div className="space-y-2">
              <Label className="form-label">Description</Label>
              <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Brief description..." className="form-input" />
            </div>
            <div className="space-y-2">
              <Label className="form-label">Project *</Label>
              <Select value={newProjectId} onValueChange={setNewProjectId}>
                <SelectTrigger className="form-input"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="form-label">Post-test Date & Time *</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "flex-1 justify-start text-left font-normal form-input",
                        !newPostTestDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newPostTestDate ? format(newPostTestDate, "PPP") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={newPostTestDate}
                      onSelect={setNewPostTestDate}
                      disabled={(date) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return date < today;
                      }}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  value={newPostTestTime}
                  onChange={e => setNewPostTestTime(e.target.value)}
                  className="form-input w-[120px]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="form-label">Passing Score (%)</Label>
                <Input type="number" min={0} max={100} value={newPassingScore} onChange={e => setNewPassingScore(parseInt(e.target.value) || 70)} className="form-input" />
              </div>
              <div className="space-y-2">
                <Label className="form-label">Time Limit (min)</Label>
                <Input type="number" min={1} value={newTimeLimit} onChange={e => setNewTimeLimit(e.target.value ? parseInt(e.target.value) : "")} placeholder="No limit" className="form-input" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateQuiz}>Create Quiz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Users Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Assign Users to Quiz
            </DialogTitle>
            <DialogDescription>Select non-admin users who can take this quiz.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            <Input
              placeholder="Search users..."
              value={assignSearch}
              onChange={e => setAssignSearch(e.target.value)}
              className="form-input"
            />
            <div className="text-xs text-muted-foreground">
              {assignedUserIds.size} user{assignedUserIds.size !== 1 ? "s" : ""} assigned
            </div>
            {assignLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 space-y-1 pr-1">
                {filteredAssignUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No users found.</p>
                ) : (
                  filteredAssignUsers.map(u => (
                    <label key={u.user_id} className="flex items-center gap-3 rounded-lg border border-border p-2.5 cursor-pointer hover:bg-muted/50 transition-colors">
                      <Checkbox
                        checked={assignedUserIds.has(u.user_id)}
                        onCheckedChange={() => toggleUserAssignment(u.user_id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{u.first_name} {u.last_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
            <Button onClick={saveAssignments} disabled={assignLoading}>
              {assignLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Assignments
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm quiz deletion */}
      <AlertDialog open={!!confirmDeleteQuiz} onOpenChange={(o) => !o && setConfirmDeleteQuiz(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{confirmDeleteQuiz?.title}</strong>, its questions and
              all related submissions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDeleteQuiz && deleteQuiz(confirmDeleteQuiz.id)}
            >
              Delete quiz
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm clearing submissions (owner) */}
      <AlertDialog open={!!confirmClearQuiz} onOpenChange={(o) => !o && setConfirmClearQuiz(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all submissions?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every recorded attempt for <strong>{confirmClearQuiz?.title}</strong> so the
              quiz can start with fresh entries. Consider archiving first to keep a copy for reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline" disabled={submissionAction}
              onClick={() => confirmClearQuiz && archiveSubmissions(confirmClearQuiz, true)}
            >
              <Archive className="mr-1 h-4 w-4" /> Archive & clear
            </Button>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmClearQuiz && clearSubmissions(confirmClearQuiz)}
            >
              Clear without archiving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmReset} onOpenChange={(o) => !o && setConfirmReset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reset {confirmReset?.type === "pre_test" ? "Pre-test" : confirmReset?.type === "post_test" ? "Post-test" : "both tests"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This archives and clears the {confirmReset?.type === "pre_test" ? "Pre-test" : confirmReset?.type === "post_test" ? "Post-test" : "Pre-test and Post-test"} attempts
              for <strong>{confirmReset?.quiz.title}</strong>, so assigned members can take it again. Archived
              results remain available for reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetBusy}
              onClick={() => confirmReset && resetAttempts(confirmReset.quiz, confirmReset.type)}
            >
              {resetBusy ? "Resetting…" : "Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>


  );
};

export default QuizBuilder;
