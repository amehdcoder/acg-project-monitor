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

const Dashboard = () => {
  const { profile, isAdmin, user } = useAuth();
  const { pendingCount: offlinePending, syncPendingSubmissions, isSyncing } = useOfflineStorage();
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

  useEffect(() => {
    fetchDashboardData();
    fetchUsers();
    if (user?.id) {
      fetchMySubmissions();
    }
  }, [offlinePending, user?.id]);

  const fetchDashboardData = async () => {
    // Fetch forms count
    const { count: formsCount } = await supabase
      .from("forms")
      .select("*", { count: "exact", head: true });

    // Fetch submissions count
    const { count: submissionsCount } = await supabase
      .from("form_submissions")
      .select("*", { count: "exact", head: true });

    // Fetch pending sync
    const { count: pendingCount } = await supabase
      .from("form_submissions")
      .select("*", { count: "exact", head: true })
      .is("synced_at", null);

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

    // Combine server pending + offline pending
    const totalPending = (pendingCount || 0) + offlinePending;

    setStats({
      totalForms: formsCount || 0,
      submissions: submissionsCount || 0,
      pendingSync: totalPending,
      completionRate: submissionsCount ? Math.round(((submissionsCount - totalPending) / submissionsCount) * 100) : 100,
    });

    setRecentForms(forms || []);
    setTasks(upcomingTasksData || []);
    setOverdueTasks(overdueTasksData || []);
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
      className={`flex items-center gap-3 rounded-lg p-3 cursor-pointer transition-colors hover:bg-muted ${
        isOverdue ? "bg-destructive/10" : "bg-muted/50"
      }`}
      onClick={() => setShowTaskDetail(task)}
    >
      <Calendar className={`h-5 w-5 ${isOverdue ? "text-destructive" : "text-acg-gold"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{task.title}</p>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {task.due_date 
              ? new Date(task.due_date).toLocaleDateString()
              : "No due date"
            }
          </p>
          {task.assigned_to && (
            <Badge variant="outline" className="text-xs">
              {getAssignedUserName(task.assigned_to)}
            </Badge>
          )}
        </div>
      </div>
      {isOverdue && (
        <Badge variant="destructive" className="text-xs shrink-0">
          Overdue
        </Badge>
      )}
    </div>
  );

  return (
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
            <Button variant="gold" size="lg">
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

      {/* Main Content */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent Forms */}
        <Card className="border-0 shadow-card lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display text-xl">Recent Forms</CardTitle>
            <Button variant="ghost" size="sm">
              View All
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentForms.length > 0 ? (
              recentForms.map((form) => (
                <div
                  key={form.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-all duration-200 hover:border-acg-gold/30 hover:shadow-soft"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground">{form.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {form.description || "No description"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
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
                    <Button variant="ghost" size="sm">
                      Open
                    </Button>
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display text-xl">My Submissions</CardTitle>
            <Button variant="ghost" size="sm">
              View All
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {mySubmissions.length > 0 ? (
              mySubmissions.map((submission) => (
                <div
                  key={submission.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-all duration-200 hover:border-acg-gold/30 hover:shadow-soft"
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                      submission.status === "submitted" 
                        ? "bg-green-500/10" 
                        : submission.status === "draft"
                        ? "bg-yellow-500/10"
                        : "bg-primary/10"
                    }`}>
                      {submission.status === "submitted" ? (
                        <CheckCircle className="h-6 w-6 text-green-500" />
                      ) : submission.status === "draft" ? (
                        <Clock className="h-6 w-6 text-yellow-500" />
                      ) : (
                        <Send className="h-6 w-6 text-primary" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground">{submission.form_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {new Date(submission.created_at).toLocaleDateString()} at{" "}
                        {new Date(submission.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        submission.synced_at 
                          ? "default" 
                          : submission.status === "submitted" 
                          ? "secondary" 
                          : "outline"
                      }
                      className={
                        submission.synced_at 
                          ? "bg-green-100 text-green-700 hover:bg-green-100" 
                          : submission.status === "submitted"
                          ? "bg-blue-100 text-blue-700 hover:bg-blue-100"
                          : submission.status === "draft"
                          ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-100"
                          : ""
                      }
                    >
                      {submission.synced_at 
                        ? "Synced" 
                        : submission.status === "submitted" 
                        ? "Submitted" 
                        : "Draft"
                      }
                    </Badge>
                    <Button variant="ghost" size="icon">
                      <Eye className="h-4 w-4" />
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

        {/* Right Column */}
        <div className="space-y-4">
          {/* Field Activity Tracker */}
          <FieldActivityTracker />

          {/* Upcoming Tasks */}
          <Card className="border-0 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-display text-lg">
                Upcoming Tasks
              </CardTitle>
              {isAdmin && (
                <Button variant="ghost" size="icon" onClick={handleCreateTask}>
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {tasks.length > 0 ? (
                tasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))
              ) : (
                <p className="text-center text-sm text-muted-foreground py-4">
                  No upcoming tasks
                </p>
              )}
            </CardContent>
          </Card>

          {/* Overdue Tasks */}
          <Card className="border-0 shadow-card border-l-4 border-l-destructive">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-display text-lg">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Overdue Tasks
                {overdueTasks.length > 0 && (
                  <Badge variant="destructive" className="ml-auto">
                    {overdueTasks.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {overdueTasks.length > 0 ? (
                overdueTasks.map((task) => (
                  <TaskCard key={task.id} task={task} isOverdue />
                ))
              ) : (
                <p className="text-center text-sm text-muted-foreground py-4">
                  No overdue tasks
                </p>
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
                value={taskForm.assigned_to}
                onValueChange={(val) => setTaskForm({ ...taskForm, assigned_to: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select user (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
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
    </div>
  );
};

export default Dashboard;
