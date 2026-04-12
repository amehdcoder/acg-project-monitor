import { useState, useEffect } from "react";
import {
  FileText, Send, Clock, CheckCircle, Calendar, AlertTriangle,
  ChevronRight, Plus, Eye, Pencil, Trash2, Loader2, Search, BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { useOfflineForms } from "@/hooks/useOfflineForms";
import { FormFiller } from "@/components/FormFiller";
import { Question, GeofenceArea } from "@/components/FormBuilder/types";
import { useLanguage } from "@/hooks/useLanguage";

// DSS Components
import DashboardKPIStrip from "@/components/Dashboard/DashboardKPIStrip";
import PriorityActionsBar from "@/components/Dashboard/PriorityActionsBar";
import RiskAssessmentWidget from "@/components/Dashboard/RiskAssessmentWidget";
import TrendsProjectionsChart from "@/components/Dashboard/TrendsProjectionsChart";
import FieldTeamPerformance from "@/components/Dashboard/FieldTeamPerformance";
import AlertCenter from "@/components/Dashboard/AlertCenter";

// Existing widgets
import DashboardKPIChart from "@/components/DashboardKPIChart";
import FieldActivityTracker from "@/components/FieldActivityTracker";
import GeofenceComplianceWidget from "@/components/GeofenceComplianceWidget";
import DashboardRouteMap from "@/components/DashboardRouteMap";
import DailyTargetTracker from "@/components/DailyTargetTracker";

interface Stats {
  totalForms: number;
  submissions: number;
  registrations: number;
  followUps: number;
  pendingSync: number;
  completionRate: number;
}

interface AdminTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  assigned_to: string | null;
}

interface UserProfile {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface FormSubmission {
  id: string;
  form_id: string;
  status: string;
  created_at: string;
  submitted_at: string | null;
  synced_at: string | null;
  form_name?: string;
}

interface FormSettings {
  requireLocation?: boolean;
  allowAnonymous?: boolean;
  offlineEnabled?: boolean;
  autoSave?: boolean;
  enforceGeofence?: boolean;
  autoSaveInterval?: number;
  caseManagement?: {
    enabled: boolean;
    action: "none" | "register" | "update" | "close";
    caseType?: string;
    caseTypeId?: string;
    caseNameQuestion?: string;
    saveToProperties: { questionId: string; propertyName: string }[];
    closeCondition?: string;
    loadFromProperties: { propertyName: string; questionId: string }[];
  };
}

interface AvailableForm {
  id: string;
  name: string;
  description: string | null;
  status: string;
  questions: Question[];
  geofence: GeofenceArea | null;
  settings: FormSettings;
  project_id?: string;
}

interface DashboardProps {
  onOpenDashboardBuilder?: () => void;
  onViewSubmissions?: () => void;
}

const Dashboard = ({ onOpenDashboardBuilder, onViewSubmissions }: DashboardProps) => {
  const { profile, isAdmin, user } = useAuth();
  const { t } = useLanguage();
  const { pendingCount: offlinePending, syncPendingSubmissions, isSyncing, isOnline } = useOfflineStorage();
  const { offlineForms } = useOfflineForms();
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<AdminTask[]>([]);
  const [mySubmissions, setMySubmissions] = useState<FormSubmission[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  
  // Task management state
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [showTaskDetail, setShowTaskDetail] = useState<AdminTask | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: "", description: "", due_date: "", status: "pending", assigned_to: "",
  });
  const [editingTask, setEditingTask] = useState<AdminTask | null>(null);
  const [saving, setSaving] = useState(false);

  // Form filling state
  const [showFormSelector, setShowFormSelector] = useState(false);
  const [availableForms, setAvailableForms] = useState<AvailableForm[]>([]);
  const [fillingForm, setFillingForm] = useState<AvailableForm | null>(null);
  const [formSearchQuery, setFormSearchQuery] = useState("");
  const [loadingForms, setLoadingForms] = useState(false);

  useEffect(() => {
    fetchTasksAndSubmissions();
    fetchUsers();
  }, [offlinePending, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('dashboard-live-indicators')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'form_submissions' }, () => {
        fetchTasksAndSubmissions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_tasks' }, () => {
        fetchTasksAndSubmissions();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const fetchTasksAndSubmissions = async () => {
    const today = new Date().toISOString().split('T')[0];
    const [upcomingRes, overdueRes] = await Promise.all([
      supabase.from("admin_tasks").select("*").eq("status", "pending").gte("due_date", today).order("due_date", { ascending: true }).limit(5),
      supabase.from("admin_tasks").select("*").eq("status", "pending").lt("due_date", today).order("due_date", { ascending: true }).limit(5),
    ]);
    setTasks(upcomingRes.data || []);
    setOverdueTasks(overdueRes.data || []);

    if (user?.id) {
      const { data: submissions } = await supabase
        .from("form_submissions")
        .select("id, form_id, status, created_at, submitted_at, synced_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (submissions && submissions.length > 0) {
        const formIds = [...new Set(submissions.map(s => s.form_id))];
        const { data: forms } = await supabase.from("forms").select("id, name").in("id", formIds);
        const formNameMap = new Map(forms?.map(f => [f.id, f.name]) || []);
        setMySubmissions(submissions.map(s => ({ ...s, form_name: formNameMap.get(s.form_id) || "Unknown Form" })));
      } else {
        setMySubmissions([]);
      }
    }
  };

  const fetchUsers = async () => {
    const { data } = await supabase.from("profiles").select("user_id, first_name, last_name, email").eq("is_active", true).order("first_name");
    setUsers(data || []);
  };

  const fetchAvailableForms = async () => {
    if (!user?.id) return;
    setLoadingForms(true);
    try {
      if (!isOnline) {
        setAvailableForms(offlineForms.filter(f => f.status === "active").map(form => ({
          id: form.id, name: form.name, description: form.description, status: form.status,
          questions: form.questions || [], geofence: form.geofence, settings: form.settings || {}, project_id: form.project_id,
        })));
        setLoadingForms(false);
        return;
      }

      let formsData;
      if (isAdmin) {
        const { data } = await supabase.from("forms").select("*").eq("status", "active").order("name");
        formsData = data;
      } else {
        const { data: assignments } = await supabase.from("user_form_assignments").select("form_id").eq("user_id", user.id);
        if (assignments && assignments.length > 0) {
          const { data } = await supabase.from("forms").select("*").in("id", assignments.map(a => a.form_id)).eq("status", "active").order("name");
          formsData = data;
        } else {
          formsData = [];
        }
      }

      setAvailableForms((formsData || []).map(form => ({
        id: form.id, name: form.name, description: form.description, status: form.status,
        questions: (form.questions as unknown as Question[]) || [],
        geofence: (form.geofence as unknown as GeofenceArea) || null,
        settings: (form.settings as unknown as FormSettings) || {},
        project_id: form.project_id,
      })));
    } catch (error: any) {
      toast({ title: "Error loading forms", description: error.message, variant: "destructive" });
    } finally {
      setLoadingForms(false);
    }
  };

  const handleFillNewForm = () => { fetchAvailableForms(); setFormSearchQuery(""); setShowFormSelector(true); };
  const handleSelectForm = (form: AvailableForm) => { setShowFormSelector(false); setFillingForm(form); };

  const handleCreateTask = () => {
    setEditingTask(null);
    setTaskForm({ title: "", description: "", due_date: "", status: "pending", assigned_to: "" });
    setShowTaskDialog(true);
  };

  const handleEditTask = (task: AdminTask) => {
    setEditingTask(task);
    setTaskForm({
      title: task.title, description: task.description || "", due_date: task.due_date ? task.due_date.split('T')[0] : "",
      status: task.status, assigned_to: task.assigned_to || "",
    });
    setShowTaskDialog(true);
    setShowTaskDetail(null);
  };

  const handleSaveTask = async () => {
    if (!taskForm.title.trim()) {
      toast({ title: "Title Required", description: "Please enter a task title.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const taskData = {
        title: taskForm.title, description: taskForm.description || null,
        due_date: taskForm.due_date || null, status: taskForm.status,
        updated_by: user?.id, assigned_to: taskForm.assigned_to || null,
      };
      if (editingTask) {
        const { error } = await supabase.from("admin_tasks").update(taskData).eq("id", editingTask.id);
        if (error) throw error;
        toast({ title: "Task Updated", description: "Task has been updated successfully." });
      } else {
        const { error } = await supabase.from("admin_tasks").insert({ ...taskData, created_by: user?.id });
        if (error) throw error;
        toast({ title: "Task Created", description: "New task has been created." });
      }
      setShowTaskDialog(false);
      await fetchTasksAndSubmissions();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save task.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteTaskId) return;
    try {
      const { error } = await supabase.from("admin_tasks").delete().eq("id", deleteTaskId);
      if (error) throw error;
      setDeleteTaskId(null);
      toast({ title: "Task Deleted", description: "Task has been removed." });
      await fetchTasksAndSubmissions();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleMarkComplete = async (taskId: string) => {
    try {
      const { error } = await supabase.from("admin_tasks").update({ status: "done", updated_by: user?.id }).eq("id", taskId);
      if (error) throw error;
      toast({ title: "Task Completed" });
      setShowTaskDetail(null);
      await fetchTasksAndSubmissions();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleSyncData = async () => { await syncPendingSubmissions(); fetchTasksAndSubmissions(); };

  const getAssignedUserName = (userId: string | null) => {
    if (!userId) return null;
    const u = users.find(u => u.user_id === userId);
    return u ? `${u.first_name} ${u.last_name}` : null;
  };

  const filteredAvailableForms = availableForms.filter(form => form.name.toLowerCase().includes(formSearchQuery.toLowerCase()));

  const TaskCard = ({ task, isOverdue = false }: { task: AdminTask; isOverdue?: boolean }) => (
    <div
      className={`flex items-start sm:items-center gap-3 rounded-lg p-3 cursor-pointer transition-all duration-200 hover:bg-muted/80 hover:shadow-sm ${isOverdue ? "bg-destructive/10 border border-destructive/20" : "bg-muted/50"}`}
      onClick={() => setShowTaskDetail(task)}
    >
      <div className={`flex-shrink-0 p-2 rounded-full ${isOverdue ? "bg-destructive/20" : "bg-acg-gold/20"}`}>
        <Calendar className={`h-4 w-4 ${isOverdue ? "text-destructive" : "text-acg-gold"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{task.title}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <p className={`text-xs ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
            {task.due_date ? new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : "No due date"}
          </p>
          {task.assigned_to && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              {getAssignedUserName(task.assigned_to)?.split(' ')[0] || 'Assigned'}
            </Badge>
          )}
        </div>
      </div>
      {isOverdue && <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 shrink-0">Overdue</Badge>}
    </div>
  );

  // Show FormFiller if a form is being filled
  if (fillingForm) {
    return (
      <FormFiller
        formId={fillingForm.id} formName={fillingForm.name} formDescription={fillingForm.description || ""}
        questions={fillingForm.questions} geofence={fillingForm.geofence || undefined}
        userId={user?.id || ""} projectId={fillingForm.project_id || ""}
        requireLocation={fillingForm.settings?.requireLocation} settings={fillingForm.settings}
        onClose={() => setFillingForm(null)}
        onSubmitSuccess={(submissionId) => {
          toast({ title: "Form Submitted", description: `Submission ID: ${submissionId.slice(0, 8)}...` });
          setFillingForm(null);
          fetchTasksAndSubmissions();
        }}
      />
    );
  }

  return (
    <>
    <div className="space-y-4 p-3 sm:p-4 lg:p-6 max-w-[1400px] mx-auto">
      {/* Compact Welcome + Actions Bar */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-hero p-4 sm:p-5 text-primary-foreground">
        <div className="bg-pattern-geometric absolute inset-0 opacity-20" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-lg sm:text-xl font-bold">
              {t("auth.welcome_back").replace("!", "")}, {profile?.first_name || "User"}!
            </h1>
            <p className="text-xs sm:text-sm text-primary-foreground/70 mt-0.5">
              Decision Support System — Real-time field intelligence
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="gold" size="sm" onClick={handleFillNewForm}>
              <FileText className="h-4 w-4 mr-1" /> {t("dashboard.fill_form")}
            </Button>
            <Button variant="gold-outline" size="sm" onClick={handleSyncData} disabled={isSyncing}>
              {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              {isSyncing ? "Syncing..." : "Sync"}
            </Button>
            {isAdmin && onOpenDashboardBuilder && (
              <Button variant="gold-outline" size="sm" onClick={onOpenDashboardBuilder}>
                <BarChart3 className="h-4 w-4 mr-1" /> Dashboards
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <DashboardKPIStrip />

      {/* Priority Actions */}
      <PriorityActionsBar />

      {/* Performance Overview + Risk Assessment Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DashboardKPIChart />
        </div>
        <div className="space-y-4">
          <RiskAssessmentWidget />
          <FieldActivityTracker />
        </div>
      </div>

      {/* Trends + Field Team Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TrendsProjectionsChart />
        </div>
        <FieldTeamPerformance />
      </div>

      {/* Geospatial + Compliance + Alerts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <DashboardRouteMap />
        <GeofenceComplianceWidget />
        <AlertCenter />
      </div>

      {/* My Submissions + Tasks Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* My Submissions */}
        <Card className="border-0 shadow-card lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-display text-sm sm:text-base">My Submissions</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => onViewSubmissions?.()}>
              View All <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {mySubmissions.length > 0 ? (
              mySubmissions.slice(0, 5).map((submission) => (
                <div key={submission.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 transition-all hover:border-acg-gold/30">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`h-8 w-8 flex items-center justify-center rounded-lg flex-shrink-0 ${submission.status === "sent" ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
                      {submission.status === "sent" ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Clock className="h-4 w-4 text-amber-500" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{submission.form_name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(submission.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <Badge variant={submission.synced_at ? "default" : "secondary"} className={`text-[9px] px-1.5 ${submission.synced_at ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {submission.synced_at ? "Synced" : submission.status === "sent" ? "Sent" : "Draft"}
                  </Badge>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-xs text-muted-foreground">
                <Send className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No submissions yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tasks Column */}
        <div className="space-y-4">
          <DailyTargetTracker />

          <Card className="border-0 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-display text-sm flex items-center gap-2">
                Upcoming Tasks
                {tasks.length > 0 && <Badge variant="secondary" className="text-[10px] h-5">{tasks.length}</Badge>}
              </CardTitle>
              {isAdmin && (
                <Button variant="ghost" size="sm" onClick={handleCreateTask} className="h-7 px-2">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-1.5">
              {tasks.length > 0 ? tasks.map(t => <TaskCard key={t.id} task={t} />) : (
                <div className="text-center py-4 text-xs text-muted-foreground">No upcoming tasks</div>
              )}
            </CardContent>
          </Card>

          {overdueTasks.length > 0 && (
            <Card className="border-0 shadow-card border-l-4 border-l-destructive bg-destructive/5">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Overdue
                  <Badge variant="destructive" className="text-[10px] h-5 ml-auto">{overdueTasks.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {overdueTasks.map(t => <TaskCard key={t.id} task={t} isOverdue />)}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>

    {/* Task Create/Edit Dialog */}
    <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">{editingTask ? "Edit Task" : "Create New Task"}</DialogTitle>
          <DialogDescription>{editingTask ? "Update the task details below" : "Add a new task to track"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title *</Label>
            <Input id="task-title" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Enter task title" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea id="task-description" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} placeholder="Enter task description" rows={3} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={taskForm.status} onValueChange={(val) => setTaskForm({ ...taskForm, status: val })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="rescheduled">Rescheduled</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Assign To</Label>
            <Select value={taskForm.assigned_to || "__unassigned__"} onValueChange={(val) => setTaskForm({ ...taskForm, assigned_to: val === "__unassigned__" ? "" : val })}>
              <SelectTrigger><SelectValue placeholder="Select user (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">Unassigned</SelectItem>
                {users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.first_name} {u.last_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowTaskDialog(false)}>Cancel</Button>
          <Button variant="acg" onClick={handleSaveTask} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {editingTask ? "Update Task" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Task Detail Dialog */}
    <Dialog open={!!showTaskDetail} onOpenChange={() => setShowTaskDetail(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">{showTaskDetail?.title}</DialogTitle>
          <DialogDescription>{showTaskDetail?.due_date ? `Due: ${new Date(showTaskDetail.due_date).toLocaleDateString()}` : "No due date set"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div><Label className="text-muted-foreground">Status</Label><Badge variant={showTaskDetail?.status === "done" ? "default" : "secondary"} className="mt-1">{showTaskDetail?.status}</Badge></div>
          {showTaskDetail?.assigned_to && <div><Label className="text-muted-foreground">Assigned To</Label><p className="mt-1 text-sm font-medium">{getAssignedUserName(showTaskDetail.assigned_to)}</p></div>}
          {showTaskDetail?.description && <div><Label className="text-muted-foreground">Description</Label><p className="mt-1 text-sm">{showTaskDetail.description}</p></div>}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {showTaskDetail?.status !== "done" && (
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => showTaskDetail && handleMarkComplete(showTaskDetail.id)}>
              <CheckCircle className="h-4 w-4 mr-2" /> Mark Complete
            </Button>
          )}
          {isAdmin && (
            <>
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => showTaskDetail && handleEditTask(showTaskDetail)}>
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </Button>
              <Button variant="destructive" className="w-full sm:w-auto" onClick={() => { if (showTaskDetail) { setDeleteTaskId(showTaskDetail.id); setShowTaskDetail(null); } }}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Delete Confirmation */}
    <AlertDialog open={!!deleteTaskId} onOpenChange={() => setDeleteTaskId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Task?</AlertDialogTitle>
          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Form Selection Dialog */}
    <Dialog open={showFormSelector} onOpenChange={setShowFormSelector}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select a Form to Fill</DialogTitle>
          <DialogDescription>Choose a form from the list below to start filling.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search forms..." value={formSearchQuery} onChange={(e) => setFormSearchQuery(e.target.value)} className="pl-10" />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {loadingForms ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filteredAvailableForms.length > 0 ? (
              filteredAvailableForms.map((form) => (
                <div key={form.id} className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted" onClick={() => handleSelectForm(form)}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{form.name}</p>
                    {form.description && <p className="text-xs text-muted-foreground truncate">{form.description}</p>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No forms available</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default Dashboard;
