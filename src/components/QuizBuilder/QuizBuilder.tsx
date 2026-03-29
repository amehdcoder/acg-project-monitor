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
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Plus, Trash2, Save, Eye, Send, ChevronUp, ChevronDown,
  BookOpen, Award, Clock, BarChart3, Loader2, CheckCircle, CalendarIcon, Users, UserPlus,
} from "lucide-react";
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
  created_at: string;
}

const QuizBuilder = () => {
  const { user, isAdmin } = useAuth();
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
  const [newPassingScore, setNewPassingScore] = useState(50);

  // Assignment state
  const [allUsers, setAllUsers] = useState<{ user_id: string; first_name: string; last_name: string; email: string }[]>([]);
  const [assignedUserIds, setAssignedUserIds] = useState<Set<string>>(new Set());
  const [assignSearch, setAssignSearch] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);

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
      // Non-admin: fetch assigned quizzes only
      const { data: assignments } = await supabase
        .from("quiz_user_assignments")
        .select("quiz_id")
        .eq("user_id", user!.id);
      
      if (assignments && assignments.length > 0) {
        const quizIds = assignments.map(a => a.quiz_id);
        const { data } = await supabase
          .from("quizzes")
          .select("*")
          .in("id", quizIds)
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
    setNewTitle(""); setNewDesc(""); setNewProjectId(""); setNewPostTestDate(undefined); setNewPostTestTime("09:00"); setNewTimeLimit(""); setNewPassingScore(50);
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

  const deleteQuiz = async (quizId: string) => {
    const { error } = await supabase.from("quizzes").delete().eq("id", quizId);
    if (!error) {
      toast({ title: "Quiz deleted" });
      if (selectedQuiz?.id === quizId) { setSelectedQuiz(null); setQuestions([]); }
      fetchQuizzes();
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            {isAdmin ? "Quiz Manager" : "My Quizzes"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin ? "Create quizzes with Pre-test & Post-test analysis" : "Take assigned quizzes"}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Create Quiz
          </Button>
        )}
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
            <Card className="form-card">
              <CardContent className="py-8 text-center space-y-4">
                <BookOpen className="h-12 w-12 mx-auto text-primary" />
                <p className="text-foreground font-medium">Ready to take this quiz?</p>
                <Button onClick={() => setShowTaker(selectedQuiz)} className="gap-2">
                  <Eye className="h-4 w-4" /> Start Quiz
                </Button>
              </CardContent>
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
            quizzes.map(quiz => (
              <Card
                key={quiz.id}
                className="form-card cursor-pointer hover:shadow-card transition-shadow"
                onClick={() => { setSelectedQuiz(quiz); if (isAdmin) fetchQuestions(quiz.id); }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{quiz.title}</CardTitle>
                    <Badge variant={quiz.is_published ? "default" : "secondary"} className="shrink-0 text-[10px]">
                      {quiz.is_published ? "Live" : "Draft"}
                    </Badge>
                  </div>
                  {quiz.description && (
                    <CardDescription className="line-clamp-2">{quiz.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="h-3 w-3" />
                      Post-test: {getPostTestDisplay(quiz)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Award className="h-3 w-3" />
                      {quiz.passing_score}% pass
                    </span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {quiz.is_published && (
                      <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); setShowTaker(quiz); }} className="gap-1 text-xs">
                        <Eye className="h-3 w-3" /> Take
                      </Button>
                    )}
                    {isAdmin && (
                      <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); deleteQuiz(quiz.id); }} className="gap-1 text-xs text-destructive">
                        <Trash2 className="h-3 w-3" /> Delete
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

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
                <Input type="number" min={0} max={100} value={newPassingScore} onChange={e => setNewPassingScore(parseInt(e.target.value) || 50)} className="form-input" />
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
    </div>
  );
};

export default QuizBuilder;
