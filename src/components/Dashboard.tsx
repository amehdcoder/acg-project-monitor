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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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
}

const Dashboard = () => {
  const { profile, isAdmin } = useAuth();
  const { pendingCount: offlinePending, syncPendingSubmissions, isSyncing } = useOfflineStorage();
  const [stats, setStats] = useState<Stats>({
    totalForms: 0,
    submissions: 0,
    pendingSync: 0,
    completionRate: 0,
  });
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [recentForms, setRecentForms] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, [offlinePending]);

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

    // Fetch upcoming tasks
    const { data: tasksData } = await supabase
      .from("admin_tasks")
      .select("*")
      .eq("status", "pending")
      .order("due_date", { ascending: true })
      .limit(3);

    // Combine server pending + offline pending
    const totalPending = (pendingCount || 0) + offlinePending;

    setStats({
      totalForms: formsCount || 0,
      submissions: submissionsCount || 0,
      pendingSync: totalPending,
      completionRate: submissionsCount ? Math.round(((submissionsCount - totalPending) / submissionsCount) * 100) : 100,
    });

    setRecentForms(forms || []);
    setTasks(tasksData || []);
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
            <Button variant="gold-outline" size="lg" onClick={handleSyncData}>
              <Send className="h-5 w-5" />
              Sync Data
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

        {/* Right Column */}
        <div className="space-y-4">
          {/* Field Activity Tracker */}
          <FieldActivityTracker />

          {/* Upcoming Tasks */}
          <Card className="border-0 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-display text-lg">
                Upcoming Tasks
              </CardTitle>
              {isAdmin && (
                <Button variant="ghost" size="icon">
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {tasks.length > 0 ? (
                tasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                    <Calendar className="h-5 w-5 text-acg-gold" />
                    <div>
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.due_date 
                          ? new Date(task.due_date).toLocaleDateString()
                          : "No due date"
                        }
                      </p>
                    </div>
                  </div>
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-lg">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Overdue Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-sm text-muted-foreground py-4">
                No overdue tasks
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
