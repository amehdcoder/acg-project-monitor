import { useState, useMemo } from "react";
import { RefreshCw, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSupervisorDashboard } from "@/hooks/useSupervisorDashboard";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import SupervisorKPICards from "./SupervisorKPICards";
import UserStatusTable from "./UserStatusTable";
import SupervisorAlerts from "./SupervisorAlerts";
import DailyActivityChart from "./DailyActivityChart";
import ProjectOverview from "./ProjectOverview";
import AuditLogViewer from "./AuditLogViewer";

const SupervisorDashboard = () => {
  const {
    users,
    alerts,
    dailySummary,
    projectSummaries,
    isLoading,
    refresh,
    dismissAlert,
  } = useSupervisorDashboard();
  const { isSuperAdmin } = useAuth();
  const { t } = useLanguage();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");

  // Filter users by selected project
  const filteredUsers = useMemo(() => {
    if (selectedProjectId === "all") return users;
    return users.filter(u => u.assigned_projects.includes(selectedProjectId));
  }, [users, selectedProjectId]);

  // Filter alerts by selected project users
  const filteredAlerts = useMemo(() => {
    if (selectedProjectId === "all") return alerts;
    const projectUserIds = new Set(filteredUsers.map(u => u.user_id));
    return alerts.filter(a => projectUserIds.has(a.user_id));
  }, [alerts, filteredUsers, selectedProjectId]);

  // Recompute daily summary for filtered users
  const filteredDailySummary = useMemo(() => {
    if (selectedProjectId === "all" || !dailySummary) return dailySummary;
    const projectUserIds = new Set(filteredUsers.map(u => u.user_id));
    const filteredTop = dailySummary.top_performers.filter(p => projectUserIds.has(p.user_id));
    const filteredUnder = dailySummary.underperformers.filter(p => projectUserIds.has(p.user_id));
    const activeCount = filteredUsers.filter(u => u.status !== "offline").length;
    const fieldWorkers = filteredUsers.filter(u => u.assigned_forms.length > 0 && u.is_active);
    const withSubs = fieldWorkers.filter(u => u.submissions_total > 0);
    const avgCompliance = withSubs.length > 0
      ? Math.round(withSubs.reduce((s, u) => s + u.geofence_compliance, 0) / withSubs.length)
      : 100;

    return {
      ...dailySummary,
      total_submissions: filteredUsers.reduce((s, u) => s + u.submissions_today, 0),
      active_users: activeCount,
      active_enumerators: activeCount,
      total_users: filteredUsers.length,
      geofence_compliance_avg: avgCompliance,
      top_performers: filteredTop,
      underperformers: filteredUnder,
    };
  }, [dailySummary, filteredUsers, selectedProjectId]);

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6 lg:p-8 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-lg sm:text-2xl font-bold text-foreground truncate">{t("supervisor.title")}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Track all user activity, submissions, and compliance across the platform
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="w-48 h-9">
              <FolderOpen className="h-4 w-4 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projectSummaries.map((p) => (
                <SelectItem key={p.project_id} value={p.project_id}>
                  {p.project_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t("supervisor.refresh")}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <SupervisorKPICards
        enumerators={filteredUsers}
        alerts={filteredAlerts}
        dailySummary={filteredDailySummary}
      />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <UserStatusTable users={filteredUsers} />
          <DailyActivityChart summary={filteredDailySummary} />
        </div>

        <div className="space-y-6">
          <SupervisorAlerts alerts={filteredAlerts} onDismiss={dismissAlert} />
          <ProjectOverview projects={selectedProjectId === "all" ? projectSummaries : projectSummaries.filter(p => p.project_id === selectedProjectId)} />
          {isSuperAdmin && <AuditLogViewer />}
        </div>
      </div>
    </div>
  );
};

export default SupervisorDashboard;
