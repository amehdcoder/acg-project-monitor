import { useState, useEffect } from "react";
import {
  FileText,
  Send,
  Clock,
  CheckCircle,
  Calendar,
  AlertTriangle,
  ChevronRight,
  Plus,
  Eye,
  Pencil,
  Trash2,
  Loader2,
  Search,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import FieldActivityTracker from "@/components/FieldActivityTracker";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { useOfflineForms } from "@/hooks/useOfflineForms";
import { FormFiller } from "@/components/FormFiller";
import { Question, GeofenceArea } from "@/components/FormBuilder/types";

interface Stats {
  totalForms: number;
  submissions: number;
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
}

const Dashboard = ({ onOpenDashboardBuilder }: DashboardProps) => {
  const { profile, isAdmin, user } = useAuth();
  const { pendingCount: offlinePending, syncPendingSubmissions, isSyncing, isOnline } = useOfflineStorage();
  const { offlineForms, isFormAvailableOffline } = useOfflineForms();
  const [lookerDashboardUrl, setLookerDashboardUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({
    totalForms: 0,
    submissions: 0,
    pendingSync: 0,
    completionRate: 0,
  });
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<AdminTask[]>([]);
  const [recentForms, setRecentForms] = useState<any[]>([]);
  const [mySubmissions, setMySubmissions] = useState<FormSubmission[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  
  // Task management state
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [showTaskDetail, setShowTaskDetail] = useState<AdminTask | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    due_date: "",
    status: "pending",
    assigned_to: "",
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
    fetchDashboardData();
    fetchUsers();
    fetchLookerUrl();
    if (user?.id) {
      fetchMySubmissions();
    }
  }, [offlinePending, user?.id]);

  const fetchDashboardData = async () => {
    // Fetch forms count
    const { count: formsCount } = await supabase
      .from("forms")
      .select("*", { count: "exact", head: true });

    // Fetch total submissions count (all statuses)
    const { count: submissionsCount } = await supabase
      .from("form_submissions")
      .select("*", { count: "exact", head: true });

    // Fetch synced submissions count (status = 'sent' AND synced_at is not null)
    const { count: syncedCount } = await supabase
      .from("form_submissions")
      .select("*", { count: "exact", head: true })
      .eq("status", "sent")
      .not("synced_at", "is", null);

    // Fetch pending sync (draft status OR synced_at is null)
    const { count: pendingCount } = await supabase
      .from("form_submissions")
      .select("*", { count: "exact", head: true })
      .or("status.eq.draft,synced_at.is.null");

    // Fetch recent forms
    const { data: forms } = await supabase
      .from("forms")
      .select("*")
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .limit(4);

    // Fetch upcoming tasks (due today or later)
    const today = new Date().toISOString().split('T')[0];
    const { data: upcomingTasksData } = await supabase
      .from("admin_tasks")
      .select("*")
      .eq("status", "pending")
      .gte("due_date", today)
      .order("due_date", { ascending: true })
      .limit(5);

    // Fetch overdue tasks (past due date, still pending)
    const { data: overdueTasksData } = await supabase
      .from("admin_tasks")
      .select("*")
      .eq("status", "pending")
      .lt("due_date", today)
      .order("due_date", { ascending: true })
      .limit(5);

    // Combine server pending + offline pending for total pending
    const totalPending = (pendingCount || 0) + offlinePending;
    const totalSubmissions = submissionsCount || 0;
    const totalSynced = syncedCount || 0;

    // Calculate actual sync rate: synced / total submissions
    // If no submissions exist, rate is 0% (nothing to sync)
    // Rate should only be 100% when all submissions are synced
    let syncRate = 0;
    if (totalSubmissions > 0) {
      syncRate = Math.round((totalSynced / totalSubmissions) * 100);
    }

    setStats({
      totalForms: formsCount || 0,
      submissions: totalSubmissions,
      pendingSync: totalPending,
      completionRate: syncRate,
    });

    setRecentForms(forms || []);
    setTasks(upcomingTasksData || []);
    setOverdueTasks(overdueTasksData || []);
  };

  const fetchLookerUrl = async () => {
    try {
      // Get first project that has a Looker URL
      const { data } = await supabase
        .from("projects")
        .select("looker_dashboard_url")
        .not("looker_dashboard_url", "is", null)
        .limit(1);

      if (data && data.length > 0) {
        const url = (data[0] as any).looker_dashboard_url;
        if (url) setLookerDashboardUrl(url);
      }
    } catch (error) {
      console.error("Error fetching Looker URL:", error);
    }
  };

  const fetchUsers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, email")
      .eq("is_active", true)
      .order("first_name");
    setUsers(data || []);
  };

  const fetchMySubmissions = async () => {
    if (!user?.id) return;
    
    try {
      // Fetch user's recent submissions
      const { data: submissions, error } = await supabase
        .from("form_submissions")
        .select("id, form_id, status, created_at, submitted_at, synced_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;

      if (submissions && submissions.length > 0) {
        // Get form names for the submissions
        const formIds = [...new Set(submissions.map(s => s.form_id))];
        const { data: forms } = await supabase
          .from("forms")
          .select("id, name")
          .in("id", formIds);

        const formNameMap = new Map(forms?.map(f => [f.id, f.name]) || []);
        
        const submissionsWithNames = submissions.map(s => ({
          ...s,
          form_name: formNameMap.get(s.form_id) || "Unknown Form",
        }));

        setMySubmissions(submissionsWithNames);
      } else {
        setMySubmissions([]);
      }
    } catch (error) {
      console.error("Error fetching submissions:", error);
    }
  };

  const fetchAvailableForms = async () => {
    if (!user?.id) return;
    setLoadingForms(true);
    
    try {
      // When offline, use offline forms
      if (!isOnline) {
        const typedForms: AvailableForm[] = offlineForms
          .filter(f => f.status === "active")
          .map(form => ({
            id: form.id,
            name: form.name,
            description: form.description,
            status: form.status,
            questions: form.questions || [],
            geofence: form.geofence,
            settings: form.settings || {},
            project_id: form.project_id,
          }));
        setAvailableForms(typedForms);
        setLoadingForms(false);
        return;
      }

      let formsData;
      if (isAdmin) {
        // Admins can access all active forms
        const { data, error } = await supabase
          .from("forms")
          .select("*")
          .eq("status", "active")
          .order("name");
        if (error) throw error;
        formsData = data;
      } else {
        // Regular users get assigned forms only
        const { data: assignments, error: assignError } = await supabase
          .from("user_form_assignments")
          .select("form_id")
          .eq("user_id", user.id);
        
        if (assignError) throw assignError;
        
        if (assignments && assignments.length > 0) {
          const formIds = assignments.map(a => a.form_id);
          const { data, error } = await supabase
            .from("forms")
            .select("*")
            .in("id", formIds)
            .eq("status", "active")
            .order("name");
          if (error) throw error;
          formsData = data;
        } else {
          formsData = [];
        }
      }

      const typedForms: AvailableForm[] = (formsData || []).map(form => ({
        id: form.id,
        name: form.name,
        description: form.description,
        status: form.status,
        questions: (form.questions as unknown as Question[]) || [],
        geofence: (form.geofence as unknown as GeofenceArea) || null,
        settings: (form.settings as unknown as FormSettings) || {},
        project_id: form.project_id,
      }));

      setAvailableForms(typedForms);
    } catch (error: any) {
      console.error("Error fetching forms:", error);
      toast({
        title: "Error loading forms",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingForms(false);
    }
  };

  const handleFillNewForm = () => {
    fetchAvailableForms();
    setFormSearchQuery("");
    setShowFormSelector(true);
  };

  const handleSelectForm = (form: AvailableForm) => {
    setShowFormSelector(false);
    setFillingForm(form);
  };

  const handleCreateTask = () => {
    setEditingTask(null);
    setTaskForm({
      title: "",
      description: "",
      due_date: "",
      status: "pending",
      assigned_to: "",
    });
    setShowTaskDialog(true);
  };

  const handleEditTask = (task: AdminTask) => {
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      description: task.description || "",
      due_date: task.due_date ? task.due_date.split('T')[0] : "",
      status: task.status,
      assigned_to: task.assigned_to || "",
    });
    setShowTaskDialog(true);
    setShowTaskDetail(null);
  };

  const handleSaveTask = async () => {
    if (!taskForm.title.trim()) {
      toast({
        title: "Title Required",
        description: "Please enter a task title.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const taskData = {
        title: taskForm.title,
        description: taskForm.description || null,
        due_date: taskForm.due_date || null,
        status: taskForm.status,
        updated_by: user?.id,
        assigned_to: taskForm.assigned_to || null,
      };

      if (editingTask) {
        const { error } = await supabase
          .from("admin_tasks")
          .update(taskData)
          .eq("id", editingTask.id);
        if (error) throw error;
        toast({ title: "Task Updated", description: "Task has been updated successfully." });
      } else {
        const { error } = await supabase
          .from("admin_tasks")
          .insert({ ...taskData, created_by: user?.id });
        if (error) throw error;
        toast({ title: "Task Created", description: "New task has been created." });
      }

      setShowTaskDialog(false);
      fetchDashboardData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save task.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteTaskId) return;

    try {
      const { error } = await supabase
        .from("admin_tasks")
        .delete()
        .eq("id", deleteTaskId);
      if (error) throw error;
      toast({ title: "Task Deleted", description: "Task has been removed." });
      setDeleteTaskId(null);
      fetchDashboardData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete task.",
        variant: "destructive",
      });
    }
  };

  const handleMarkComplete = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from("admin_tasks")
        .update({ status: "completed", updated_by: user?.id })
        .eq("id", taskId);
      if (error) throw error;
      toast({ title: "Task Completed", description: "Task has been marked as complete." });
      setShowTaskDetail(null);
      fetchDashboardData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update task.",
        variant: "destructive",
      });
    }
  };

  const statsItems = [
    {
      label: "Total Forms",
      value: stats.totalForms.toString(),
      icon: FileText,
      change: "Active forms",
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Submissions",
      value: stats.submissions.toLocaleString(),
      icon: Send,
      change: "Total collected",
      color: "text-acg-gold",
      bgColor: "bg-acg-gold/10",
    },
    {
      label: "Pending Sync",
      value: stats.pendingSync.toString(),
      icon: Clock,
      change: "Awaiting connection",
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      label: "Sync Rate",
      value: `${stats.completionRate}%`,
      icon: CheckCircle,
      change: "Synced submissions",
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
  ];

  const handleSyncData = async () => {
    await syncPendingSubmissions();
    fetchDashboardData();
  };

  const getAssignedUserName = (userId: string | null) => {
    if (!userId) return null;
    const assignedUser = users.find(u => u.user_id === userId);
    return assignedUser ? `${assignedUser.first_name} ${assignedUser.last_name}` : null;
  };

  const TaskCard = ({ task, isOverdue = false }: { task: AdminTask; isOverdue?: boolean }) => (
    <div
      className={`flex items-start sm:items-center gap-3 rounded-lg p-3 cursor-pointer transition-all duration-200 hover:bg-muted/80 hover:shadow-sm ${
        isOverdue ? "bg-destructive/10 border border-destructive/20" : "bg-muted/50"
      }`}
      onClick={() => setShowTaskDetail(task)}
    >
      <div className={`flex-shrink-0 p-2 rounded-full ${isOverdue ? "bg-destructive/20" : "bg-acg-gold/20"}`}>
        <Calendar className={`h-4 w-4 ${isOverdue ? "text-destructive" : "text-acg-gold"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{task.title}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <p className={`text-xs ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
            {task.due_date 
              ? new Date(task.due_date).toLocaleDateString(undefined, { 
                  month: 'short', 
                  day: 'numeric',
                  year: new Date(task.due_date).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                })
              : "No due date"
            }
          </p>
          {task.assigned_to && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              {getAssignedUserName(task.assigned_to)?.split(' ')[0] || 'Assigned'}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        {isOverdue && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 shrink-0">
            Overdue
          </Badge>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
      </div>
    </div>
  );

  const filteredAvailableForms = availableForms.filter(form => 
    form.name.toLowerCase().includes(formSearchQuery.toLowerCase())
  );

  // Show FormFiller if a form is being filled
  if (fillingForm) {
    return (
      <FormFiller
        formId={fillingForm.id}
        formName={fillingForm.name}
        formDescription={fillingForm.description || ""}
        questions={fillingForm.questions}
        geofence={fillingForm.geofence || undefined}
        userId={user?.id || ""}
        projectId={fillingForm.project_id || ""}
        requireLocation={fillingForm.settings?.requireLocation}
        settings={fillingForm.settings}
        onClose={() => setFillingForm(null)}
        onSubmitSuccess={(submissionId) => {
          toast({
            title: "Form Submitted",
            description: `Submission ID: ${submissionId.slice(0, 8)}...`,
          });
          setFillingForm(null);
          fetchDashboardData();
          fetchMySubmissions();
        }}
      />
    );
  }

  return (
    <>
    <div className="space-y-6 p-4 lg:p-6">
      {/* Welcome Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-hero p-6 text-primary-foreground lg:p-8">
        <div className="bg-pattern-geometric absolute inset-0 opacity-30" />
        <div className="relative z-10">
          <h1 className="font-display text-2xl font-bold lg:text-3xl">
            Welcome back, {profile?.first_name || "User"}!
          </h1>
          <p className="mt-2 text-primary-foreground/80">
            Monitor your field activities and track project progress
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="gold" size="lg" onClick={handleFillNewForm}>
              <FileText className="h-5 w-5" />
              Fill New Form
            </Button>
            <Button variant="gold-outline" size="lg" onClick={handleSyncData} disabled={isSyncing}>
              {isSyncing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
              {isSyncing ? "Syncing..." : "Sync Data"}
            </Button>
            {isAdmin && onOpenDashboardBuilder && (
              <Button variant="gold-outline" size="lg" onClick={onOpenDashboardBuilder}>
                <BarChart3 className="h-5 w-5" />
                Custom Dashboards
              </Button>
            )}
          </div>
        </div>
        <div className="absolute -bottom-4 -right-4 h-32 w-32 rounded-full bg-acg-gold/20 blur-3xl" />
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsItems.map((stat) => (
          <Card key={stat.label} className="overflow-hidden border-0 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-glow/20">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="mt-1 font-display text-3xl font-bold text-foreground">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stat.change}
                  </p>
                </div>
                <div className={`rounded-xl p-3 ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Looker Studio Dashboard */}
      {lookerDashboardUrl && (
        <Card className="border-0 shadow-card overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="font-display text-lg sm:text-xl flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Project Dashboard
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(lookerDashboardUrl, "_blank")}
            >
              Open in Looker Studio
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <iframe
              src={lookerDashboardUrl.replace("/reporting/", "/embed/reporting/")}
              className="w-full border-0"
              style={{ height: "500px" }}
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent Forms */}
        <Card className="border-0 shadow-card lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="font-display text-lg sm:text-xl">Recent Forms</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs sm:text-sm">
              View All
              <ChevronRight className="ml-1 h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 sm:space-y-3">
            {recentForms.length > 0 ? (
              recentForms.map((form) => (
                <div
                  key={form.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-3 sm:p-4 transition-all duration-200 hover:border-acg-gold/30 hover:shadow-soft"
                >
                  <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-foreground text-sm sm:text-base truncate">{form.name}</h4>
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">
                        {form.description || "No description"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span
                      className={`rounded-full px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium ${
                        form.status === "active"
                          ? "bg-green-100 text-green-700"
                          : form.status === "halted"
                          ? "bg-yellow-100 text-yellow-700"
                          : form.status === "closed"
                          ? "bg-red-100 text-red-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {form.status}
                    </span>
                    {form.status === "active" && (
                      <Button
                        variant="acg"
                        size="sm"
                        className="h-7 sm:h-8 text-xs"
                        onClick={() => {
                          const typedForm: AvailableForm = {
                            id: form.id,
                            name: form.name,
                            description: form.description,
                            status: form.status,
                            questions: (form.questions as unknown as Question[]) || [],
                            geofence: (form.geofence as unknown as GeofenceArea) || null,
                            settings: (form.settings as unknown as FormSettings) || {},
                          };
                          setFillingForm(typedForm);
                        }}
                      >
                        <Pencil className="mr-1 h-3 w-3" />
                        <span className="hidden sm:inline">Fill</span>
                      </Button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-2 text-muted-foreground">No forms yet</p>
                {isAdmin && (
                  <Button variant="acg" className="mt-4">
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Form
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Submissions */}
        <Card className="border-0 shadow-card lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="font-display text-lg sm:text-xl">My Submissions</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs sm:text-sm">
              View All
              <ChevronRight className="ml-1 h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 sm:space-y-3">
            {mySubmissions.length > 0 ? (
              mySubmissions.map((submission) => (
                <div
                  key={submission.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-3 sm:p-4 transition-all duration-200 hover:border-acg-gold/30 hover:shadow-soft"
                >
                  <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <div className={`hidden sm:flex h-12 w-12 items-center justify-center rounded-lg flex-shrink-0 ${
                      submission.status === "sent" 
                        ? "bg-green-500/10" 
                        : submission.status === "draft"
                        ? "bg-yellow-500/10"
                        : "bg-primary/10"
                    }`}>
                      {submission.status === "sent" ? (
                        <CheckCircle className="h-6 w-6 text-green-500" />
                      ) : submission.status === "draft" ? (
                        <Clock className="h-6 w-6 text-yellow-500" />
                      ) : (
                        <Send className="h-6 w-6 text-primary" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-foreground text-sm sm:text-base truncate">{submission.form_name}</h4>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {new Date(submission.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at{" "}
                        {new Date(submission.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-2">
                    <Badge
                      variant={
                        submission.synced_at 
                          ? "default" 
                          : submission.status === "sent" 
                          ? "secondary" 
                          : "outline"
                      }
                      className={`text-[10px] sm:text-xs px-1.5 sm:px-2 ${
                        submission.synced_at 
                          ? "bg-green-100 text-green-700 hover:bg-green-100" 
                          : submission.status === "sent"
                          ? "bg-blue-100 text-blue-700 hover:bg-blue-100"
                          : submission.status === "draft"
                          ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-100"
                          : ""
                      }`}
                    >
                      {submission.synced_at 
                        ? "Synced" 
                        : submission.status === "sent" 
                        ? "Sent" 
                        : "Draft"
                      }
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8">
                      <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Send className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-2 text-muted-foreground">No submissions yet</p>
                <p className="text-sm text-muted-foreground">
                  Fill out a form to see your submissions here
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column - Tasks */}
        <div className="space-y-4 lg:col-span-1">
          {/* Field Activity Tracker */}
          <FieldActivityTracker />

          {/* Upcoming Tasks */}
          <Card className="border-0 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="font-display text-base sm:text-lg">
                  Upcoming Tasks
                </CardTitle>
                {tasks.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-5">
                    {tasks.length}
                  </Badge>
                )}
              </div>
              {isAdmin && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleCreateTask}
                  className="h-8 px-2"
                >
                  <Plus className="h-4 w-4" />
                  <span className="ml-1 hidden sm:inline text-xs">Add</span>
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {tasks.length > 0 ? (
                <>
                  {tasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                  {tasks.length >= 5 && (
                    <Button variant="ghost" size="sm" className="w-full text-xs mt-2">
                      View All Tasks
                      <ChevronRight className="ml-1 h-3 w-3" />
                    </Button>
                  )}
                </>
              ) : (
                <div className="text-center py-6">
                  <Calendar className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No upcoming tasks</p>
                  {isAdmin && (
                    <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={handleCreateTask}>
                      <Plus className="h-3 w-3 mr-1" />
                      Create Task
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Overdue Tasks */}
          <Card className={`border-0 shadow-card ${overdueTasks.length > 0 ? 'border-l-4 border-l-destructive bg-destructive/5' : ''}`}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-display text-base sm:text-lg">
                <div className={`p-1.5 rounded-full ${overdueTasks.length > 0 ? 'bg-destructive/20' : 'bg-muted'}`}>
                  <AlertTriangle className={`h-4 w-4 ${overdueTasks.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                </div>
                <span className={overdueTasks.length > 0 ? 'text-destructive' : ''}>Overdue Tasks</span>
                {overdueTasks.length > 0 && (
                  <Badge variant="destructive" className="ml-auto text-[10px] h-5 px-2">
                    {overdueTasks.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {overdueTasks.length > 0 ? (
                <>
                  {overdueTasks.map((task) => (
                    <TaskCard key={task.id} task={task} isOverdue />
                  ))}
                  {overdueTasks.length >= 5 && (
                    <Button variant="ghost" size="sm" className="w-full text-xs mt-2 text-destructive hover:text-destructive">
                      View All Overdue
                      <ChevronRight className="ml-1 h-3 w-3" />
                    </Button>
                  )}
                </>
              ) : (
                <div className="text-center py-6">
                  <CheckCircle className="h-8 w-8 mx-auto text-green-500/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No overdue tasks</p>
                  <p className="text-xs text-muted-foreground mt-1">You're all caught up!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Task Create/Edit Dialog */}
      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingTask ? "Edit Task" : "Create New Task"}
            </DialogTitle>
            <DialogDescription>
              {editingTask ? "Update the task details below" : "Add a new task to track"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">Title *</Label>
              <Input
                id="task-title"
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                placeholder="Enter task title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                placeholder="Enter task description"
                rows={3}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="task-due-date">Due Date</Label>
                <Input
                  id="task-due-date"
                  type="date"
                  value={taskForm.due_date}
                  onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-status">Status</Label>
                <Select
                  value={taskForm.status}
                  onValueChange={(val) => setTaskForm({ ...taskForm, status: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-assigned">Assign To</Label>
              <Select
                value={taskForm.assigned_to || "__unassigned__"}
                onValueChange={(val) => setTaskForm({ ...taskForm, assigned_to: val === "__unassigned__" ? "" : val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select user (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.first_name} {u.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaskDialog(false)}>
              Cancel
            </Button>
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
            <DialogDescription>
              {showTaskDetail?.due_date
                ? `Due: ${new Date(showTaskDetail.due_date).toLocaleDateString()}`
                : "No due date set"
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-muted-foreground">Status</Label>
              <Badge
                variant={showTaskDetail?.status === "completed" ? "default" : "secondary"}
                className="mt-1"
              >
                {showTaskDetail?.status}
              </Badge>
            </div>
            {showTaskDetail?.assigned_to && (
              <div>
                <Label className="text-muted-foreground">Assigned To</Label>
                <p className="mt-1 text-sm font-medium">
                  {getAssignedUserName(showTaskDetail.assigned_to)}
                </p>
              </div>
            )}
            {showTaskDetail?.description && (
              <div>
                <Label className="text-muted-foreground">Description</Label>
                <p className="mt-1 text-sm">{showTaskDetail.description}</p>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {showTaskDetail?.status !== "completed" && (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => showTaskDetail && handleMarkComplete(showTaskDetail.id)}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark Complete
              </Button>
            )}
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => showTaskDetail && handleEditTask(showTaskDetail)}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    if (showTaskDetail) {
                      setDeleteTaskId(showTaskDetail.id);
                      setShowTaskDetail(null);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
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
            <AlertDialogDescription>
              This action cannot be undone. The task will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTask}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Form Selection Dialog */}
      <Dialog open={showFormSelector} onOpenChange={setShowFormSelector}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select a Form to Fill</DialogTitle>
            <DialogDescription>
              Choose a form from the list below to start filling.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search forms..."
                value={formSearchQuery}
                onChange={(e) => setFormSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {loadingForms ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredAvailableForms.length > 0 ? (
                filteredAvailableForms.map((form) => (
                  <div
                    key={form.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer transition-colors hover:bg-muted"
                    onClick={() => handleSelectForm(form)}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{form.name}</p>
                      {form.description && (
                        <p className="text-xs text-muted-foreground truncate">{form.description}</p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No forms available</p>
                  <p className="text-xs">You may need to be assigned to a form first.</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
};

export default Dashboard;
