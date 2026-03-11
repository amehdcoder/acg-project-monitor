import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
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
    enumerators,
    alerts,
    dailySummary,
    projectSummaries,
    isLoading,
    refresh,
    dismissAlert,
  } = useSupervisorDashboard();
  const { isSuperAdmin, role } = useAuth();
  const { t } = useLanguage();

  // Systems admins only see users in their assigned projects
  // This filtering happens at UI level; data-level is already restricted by RLS
  // Super admins see all users

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
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={isLoading}
          className="shrink-0"
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {t("supervisor.refresh")}
        </Button>
      </div>

      {/* KPI Cards */}
      <SupervisorKPICards
        enumerators={enumerators}
        alerts={alerts}
        dailySummary={dailySummary}
      />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          <UserStatusTable users={users} />
          <DailyActivityChart summary={dailySummary} />
        </div>

        {/* Right Column - 1/3 width */}
        <div className="space-y-6">
          <SupervisorAlerts alerts={alerts} onDismiss={dismissAlert} />
          <ProjectOverview projects={projectSummaries} />
          {isSuperAdmin && <AuditLogViewer />}
        </div>
      </div>
    </div>
  );
};

export default SupervisorDashboard;
