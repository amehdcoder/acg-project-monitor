import { useState, useMemo, useEffect } from "react";
import { RefreshCw, FolderOpen, CalendarIcon, Wifi, WifiOff, Clock } from "lucide-react";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSupervisorDashboard } from "@/hooks/useSupervisorDashboard";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import SupervisorKPICards from "./SupervisorKPICards";
import UserStatusTable from "./UserStatusTable";
import SupervisorAlerts from "./SupervisorAlerts";
import DailyActivityChart from "./DailyActivityChart";
import ProjectOverview from "./ProjectOverview";
import AuditLogViewer from "./AuditLogViewer";
import SupervisorExport from "./SupervisorExport";
import TerritoryMap from "./TerritoryMap";
import DailyBriefing from "./DailyBriefing";
import TargetCompletionReport from "./TargetCompletionReport";
import TargetLeaderboard from "./TargetLeaderboard";
import StateAnalyticsChart from "./StateAnalyticsChart";
import FormDataKnowledgeGraph from "@/components/KnowledgeGraph/FormDataKnowledgeGraph";

const PRESETS = [
  { label: "Today", from: () => startOfDay(new Date()), to: () => endOfDay(new Date()) },
  { label: "7 Days", from: () => startOfDay(subDays(new Date(), 7)), to: () => endOfDay(new Date()) },
  { label: "30 Days", from: () => startOfDay(subDays(new Date(), 30)), to: () => endOfDay(new Date()) },
  { label: "90 Days", from: () => startOfDay(subDays(new Date(), 90)), to: () => endOfDay(new Date()) },
];

const SupervisorDashboard = () => {
  const {
    users,
    alerts,
    dailySummary,
    projectSummaries,
    isLoading,
    isFiltering,
    lastUpdated,
    realtimeStatus,
    refresh,
    dismissAlert,
    dateRange,
    setDateRange,
  } = useSupervisorDashboard();
  const { isSuperAdmin } = useAuth();
  const { t } = useLanguage();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [activePreset, setActivePreset] = useState<string>("Today");

  const handlePreset = (preset: typeof PRESETS[number]) => {
    setActivePreset(preset.label);
    setDateRange({ from: preset.from(), to: preset.to() });
  };

  const handleCustomRange = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from) {
      setActivePreset("custom");
      setDateRange({
        from: startOfDay(range.from),
        to: range.to ? endOfDay(range.to) : endOfDay(range.from),
      });
    }
  };

  // Filter users by selected project
  const filteredUsers = useMemo(() => {
    if (selectedProjectId === "all") return users;
    return users.filter(u => u.assigned_projects.includes(selectedProjectId));
  }, [users, selectedProjectId]);

  const filteredAlerts = useMemo(() => {
    if (selectedProjectId === "all") return alerts;
    const projectUserIds = new Set(filteredUsers.map(u => u.user_id));
    return alerts.filter(a => projectUserIds.has(a.user_id));
  }, [alerts, filteredUsers, selectedProjectId]);

  const filteredDailySummary = useMemo(() => {
    if (selectedProjectId === "all" || !dailySummary) return dailySummary;
    const projectUserIds = new Set(filteredUsers.map(u => u.user_id));
    const filteredTop = dailySummary.top_performers.filter(p => projectUserIds.has(p.user_id));
    const filteredUnder = dailySummary.underperformers.filter(p => projectUserIds.has(p.user_id));
    const activeCount = filteredUsers.filter(u => u.status !== "offline").length;
    const fieldWorkers = filteredUsers.filter(u => u.assigned_forms.length > 0 && u.is_active);
    const geofenceWorkers = fieldWorkers.filter(u => u.geofence_compliance !== null);
    const avgCompliance = geofenceWorkers.length > 0
      ? Math.round(geofenceWorkers.reduce((s, u) => s + (u.geofence_compliance ?? 0), 0) / geofenceWorkers.length)
      : null;

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
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-lg sm:text-2xl font-bold text-foreground truncate">{t("supervisor.title")}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Real-time team activity, submissions, and compliance
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SupervisorExport users={filteredUsers} dateRange={dateRange} />
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

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <FolderOpen className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
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

          <div className="flex items-center gap-1">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant={activePreset === preset.label ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs px-3"
                onClick={() => handlePreset(preset)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={activePreset === "custom" ? "default" : "outline"}
                size="sm"
                className={cn("h-8 text-xs gap-1.5 px-3")}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {activePreset === "custom"
                  ? `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d")}`
                  : "Custom"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={handleCustomRange}
                numberOfMonths={1}
                disabled={(date) => date > new Date()}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* KPI Cards */}
      <SupervisorKPICards
        enumerators={filteredUsers}
        alerts={filteredAlerts}
        dailySummary={filteredDailySummary}
      />

      {/* FIONET-style State Analytics */}
      <StateAnalyticsChart users={filteredUsers} />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <UserStatusTable users={filteredUsers} />
          <DailyActivityChart summary={filteredDailySummary} />
          <TargetCompletionReport />
        </div>

        <div className="space-y-6">
          <DailyBriefing
            users={filteredUsers}
            dailySummary={filteredDailySummary}
            projectSummaries={selectedProjectId === "all" ? projectSummaries : projectSummaries.filter(p => p.project_id === selectedProjectId)}
          />
          <SupervisorAlerts alerts={filteredAlerts} onDismiss={dismissAlert} />
          <TargetLeaderboard />
          <TerritoryMap users={filteredUsers} />
          <ProjectOverview projects={selectedProjectId === "all" ? projectSummaries : projectSummaries.filter(p => p.project_id === selectedProjectId)} />
          {isSuperAdmin && <AuditLogViewer />}
        </div>
      </div>

      {/* Knowledge graph of collected form data — filterable by project */}
      <FormDataKnowledgeGraph
        projectId={selectedProjectId !== "all" ? selectedProjectId : undefined}
        showProjectFilter
        projects={projectSummaries.map((p) => ({ id: p.project_id, name: p.project_name }))}
        title="Form Data Knowledge Graph"
        description="Connections between forms, locations and contributors across supervised projects"
      />
    </div>
  );
};

export default SupervisorDashboard;
