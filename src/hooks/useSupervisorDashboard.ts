import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, subHours, differenceInMinutes } from "date-fns";

export interface EnumeratorStatus {
  user_id: string;
  first_name: string;
  last_name: string;
  designation: string;
  state: string | null;
  lga: string | null;
  email: string;
  status: "active" | "idle" | "offline";
  last_submission_at: string | null;
  submissions_today: number;
  submissions_total: number;
  geofence_compliance: number;
  avg_time_between_submissions: number | null;
  last_location: { lat: number; lng: number } | null;
  assigned_forms: string[];
}

export interface SupervisorAlert {
  id: string;
  type: "no_activity" | "low_submissions" | "geofence_violation" | "late_start" | "unusual_pattern";
  severity: "warning" | "critical";
  user_id: string;
  user_name: string;
  message: string;
  timestamp: string;
  dismissed: boolean;
}

export interface DailyActivitySummary {
  date: string;
  total_submissions: number;
  active_enumerators: number;
  geofence_compliance_avg: number;
  submissions_by_hour: { hour: number; count: number }[];
  top_performers: { user_id: string; name: string; count: number }[];
  underperformers: { user_id: string; name: string; count: number; expected: number }[];
}

export interface ProjectSummary {
  project_id: string;
  project_name: string;
  total_enumerators: number;
  active_today: number;
  submissions_today: number;
  compliance_rate: number;
}

export function useSupervisorDashboard() {
  const [enumerators, setEnumerators] = useState<EnumeratorStatus[]>([]);
  const [alerts, setAlerts] = useState<SupervisorAlert[]>([]);
  const [dailySummary, setDailySummary] = useState<DailyActivitySummary | null>(null);
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date()),
  });

  // Use refs to avoid stale closures and infinite effect loops
  const dateRangeRef = useRef(dateRange);
  dateRangeRef.current = dateRange;
  const dismissedAlertsRef = useRef<Set<string>>(new Set());
  const pollIntervalRef = useRef(2000);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSyncRef = useRef<string | null>(null);
  const isActiveRef = useRef(true);

  const fetchAllData = useCallback(async () => {
    try {
      const currentDateRange = dateRangeRef.current;

      // Fetch all profiles
      const { data: profiles, error: profilesErr } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, designation, state, lga, email")
        .eq("is_active", true);

      if (profilesErr) throw profilesErr;

      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();

      // Parallel fetches for all data
      const [todaySubsRes, rangeSubsRes, fieldActivityRes, formAssignmentsRes, projectsRes, projectAssignmentsRes] = await Promise.all([
        supabase
          .from("form_submissions")
          .select("id, user_id, submitted_at, created_at, within_geofence, location, form_id")
          .eq("status", "sent")
          .gte("submitted_at", todayStart)
          .lte("submitted_at", todayEnd),
        supabase
          .from("form_submissions")
          .select("id, user_id, submitted_at, within_geofence")
          .eq("status", "sent")
          .gte("submitted_at", currentDateRange.from.toISOString())
          .lte("submitted_at", currentDateRange.to.toISOString()),
        supabase
          .from("field_activity")
          .select("user_id, started_at, ended_at, location")
          .gte("started_at", subHours(new Date(), 2).toISOString())
          .order("started_at", { ascending: false }),
        supabase
          .from("user_form_assignments")
          .select("user_id, form_id"),
        supabase
          .from("projects")
          .select("id, name")
          .eq("status", "active"),
        supabase
          .from("user_project_assignments")
          .select("user_id, project_id"),
      ]);

      const todaySubmissions = todaySubsRes.data || [];
      const rangeSubmissions = rangeSubsRes.data || [];
      const fieldActivity = fieldActivityRes.data || [];
      const formAssignments = formAssignmentsRes.data || [];
      const projects = projectsRes.data || [];
      const projectAssignments = projectAssignmentsRes.data || [];

      // Build enumerator statuses
      const now = new Date();
      const enumeratorStatuses: EnumeratorStatus[] = (profiles || []).map((profile) => {
        const userTodaySubs = todaySubmissions.filter(s => s.user_id === profile.user_id);
        const userRangeSubs = rangeSubmissions.filter(s => s.user_id === profile.user_id);
        const userActivity = fieldActivity.filter(a => a.user_id === profile.user_id);
        const userForms = formAssignments.filter(a => a.user_id === profile.user_id).map(a => a.form_id);

        // Determine status
        let status: "active" | "idle" | "offline" = "offline";
        const lastActivity = userActivity[0];
        const lastSubmission = userTodaySubs.sort((a, b) =>
          new Date(b.submitted_at || b.created_at).getTime() - new Date(a.submitted_at || a.created_at).getTime()
        )[0];

        const lastActiveTime = lastActivity
          ? new Date(lastActivity.ended_at || lastActivity.started_at)
          : lastSubmission
            ? new Date(lastSubmission.submitted_at || lastSubmission.created_at)
            : null;

        if (lastActiveTime) {
          const minutesAgo = differenceInMinutes(now, lastActiveTime);
          if (minutesAgo <= 30) status = "active";
          else if (minutesAgo <= 120) status = "idle";
        }

        // Geofence compliance
        const totalGeofenceSubs = userRangeSubs.filter(s => s.within_geofence !== null);
        const withinGeofence = totalGeofenceSubs.filter(s => s.within_geofence === true);
        const complianceRate = totalGeofenceSubs.length > 0
          ? Math.round((withinGeofence.length / totalGeofenceSubs.length) * 100)
          : 100;

        // Average time between submissions
        let avgTimeBetween: number | null = null;
        if (userTodaySubs.length > 1) {
          const sorted = userTodaySubs
            .map(s => new Date(s.submitted_at || s.created_at).getTime())
            .sort((a, b) => a - b);
          const intervals = sorted.slice(1).map((t, i) => t - sorted[i]);
          avgTimeBetween = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length / 60000);
        }

        // Last location
        const lastLoc = lastSubmission?.location as any;
        const lastLocation = lastLoc && lastLoc.lat && lastLoc.lng
          ? { lat: lastLoc.lat, lng: lastLoc.lng }
          : null;

        return {
          user_id: profile.user_id,
          first_name: profile.first_name,
          last_name: profile.last_name,
          designation: profile.designation,
          state: profile.state,
          lga: profile.lga,
          email: profile.email,
          status,
          last_submission_at: lastSubmission
            ? (lastSubmission.submitted_at || lastSubmission.created_at)
            : null,
          submissions_today: userTodaySubs.length,
          submissions_total: userRangeSubs.length,
          geofence_compliance: complianceRate,
          avg_time_between_submissions: avgTimeBetween,
          last_location: lastLocation,
          assigned_forms: userForms,
        };
      });

      // Only include users who have form assignments
      const fieldWorkers = enumeratorStatuses.filter(e => e.assigned_forms.length > 0);
      setEnumerators(fieldWorkers);

      // Generate alerts
      const newAlerts: SupervisorAlert[] = [];
      const nigerianHour = now.getUTCHours() + 1; // WAT = UTC+1

      fieldWorkers.forEach((worker) => {
        if (nigerianHour >= 10 && worker.submissions_today === 0 && worker.status === "offline") {
          newAlerts.push({
            id: `no-activity-${worker.user_id}`,
            type: "no_activity",
            severity: nigerianHour >= 14 ? "critical" : "warning",
            user_id: worker.user_id,
            user_name: `${worker.first_name} ${worker.last_name}`,
            message: `No submissions today. Last active: ${worker.last_submission_at
              ? new Date(worker.last_submission_at).toLocaleString()
              : "Never"}`,
            timestamp: now.toISOString(),
            dismissed: dismissedAlertsRef.current.has(`no-activity-${worker.user_id}`),
          });
        }

        if (worker.geofence_compliance < 80 && worker.submissions_total > 0) {
          newAlerts.push({
            id: `geofence-${worker.user_id}`,
            type: "geofence_violation",
            severity: worker.geofence_compliance < 50 ? "critical" : "warning",
            user_id: worker.user_id,
            user_name: `${worker.first_name} ${worker.last_name}`,
            message: `Geofence compliance at ${worker.geofence_compliance}% (${worker.submissions_total} submissions)`,
            timestamp: now.toISOString(),
            dismissed: dismissedAlertsRef.current.has(`geofence-${worker.user_id}`),
          });
        }

        if (nigerianHour >= 14 && worker.submissions_today > 0 && worker.submissions_today < 3) {
          newAlerts.push({
            id: `low-subs-${worker.user_id}`,
            type: "low_submissions",
            severity: "warning",
            user_id: worker.user_id,
            user_name: `${worker.first_name} ${worker.last_name}`,
            message: `Only ${worker.submissions_today} submission(s) today — below expected rate`,
            timestamp: now.toISOString(),
            dismissed: dismissedAlertsRef.current.has(`low-subs-${worker.user_id}`),
          });
        }
      });

      setAlerts(newAlerts);

      // Build daily summary
      const hourMap = new Map<number, number>();
      todaySubmissions.forEach(s => {
        if (s.submitted_at) {
          const hour = new Date(s.submitted_at).getHours();
          hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
        }
      });
      const submissionsByHour = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        count: hourMap.get(i) || 0,
      }));

      const userCounts = new Map<string, number>();
      todaySubmissions.forEach(s => {
        userCounts.set(s.user_id, (userCounts.get(s.user_id) || 0) + 1);
      });
      const sorted = Array.from(userCounts.entries()).sort((a, b) => b[1] - a[1]);
      const topPerformers = sorted.slice(0, 5).map(([uid, count]) => {
        const w = fieldWorkers.find(w => w.user_id === uid);
        return { user_id: uid, name: w ? `${w.first_name} ${w.last_name}` : "Unknown", count };
      });

      const underperformers = fieldWorkers
        .filter(w => w.submissions_today < 3 && w.assigned_forms.length > 0)
        .sort((a, b) => a.submissions_today - b.submissions_today)
        .slice(0, 5)
        .map(w => ({
          user_id: w.user_id,
          name: `${w.first_name} ${w.last_name}`,
          count: w.submissions_today,
          expected: 5,
        }));

      const geofenceWorkers = fieldWorkers.filter(w => w.submissions_total > 0);
      const avgCompliance = geofenceWorkers.length > 0
        ? Math.round(geofenceWorkers.reduce((sum, w) => sum + w.geofence_compliance, 0) / geofenceWorkers.length)
        : 100;

      setDailySummary({
        date: new Date().toISOString().split("T")[0],
        total_submissions: todaySubmissions.length,
        active_enumerators: fieldWorkers.filter(w => w.status !== "offline").length,
        geofence_compliance_avg: avgCompliance,
        submissions_by_hour: submissionsByHour,
        top_performers: topPerformers,
        underperformers,
      });

      // Build project summaries
      const summaries: ProjectSummary[] = projects.map(project => {
        const projectUsers = projectAssignments
          .filter(a => a.project_id === project.id)
          .map(a => a.user_id);
        const projectWorkers = fieldWorkers.filter(w => projectUsers.includes(w.user_id));

        return {
          project_id: project.id,
          project_name: project.name,
          total_enumerators: projectWorkers.length,
          active_today: projectWorkers.filter(w => w.status !== "offline").length,
          submissions_today: projectWorkers.reduce((sum, w) => sum + w.submissions_today, 0),
          compliance_rate: projectWorkers.length > 0
            ? Math.round(projectWorkers.reduce((s, w) => s + w.geofence_compliance, 0) / projectWorkers.length)
            : 100,
        };
      });

      setProjectSummaries(summaries.filter(s => s.total_enumerators > 0));
      lastSyncRef.current = new Date().toISOString();
      pollIntervalRef.current = 2000; // reset on success

    } catch (error) {
      console.error("Error fetching supervisor data:", error);
    }
  }, []); // No dependencies - uses refs for mutable state

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchAllData();
    setIsLoading(false);
  }, [fetchAllData]);

  const dismissAlert = useCallback((alertId: string) => {
    dismissedAlertsRef.current.add(alertId);
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, dismissed: true } : a));
  }, []);

  // Main effect: realtime subscription + polling fallback
  useEffect(() => {
    isActiveRef.current = true;

    // Initial fetch
    refresh();

    // Realtime subscription for instant updates
    const channel = supabase
      .channel("supervisor-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "form_submissions" }, () => {
        pollIntervalRef.current = 2000;
        fetchAllData();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "form_submissions" }, () => {
        fetchAllData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "field_activity" }, () => {
        pollIntervalRef.current = 2000;
        fetchAllData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => {
        fetchAllData();
      })
      .subscribe();

    // Polling fallback with exponential backoff
    const poll = async () => {
      if (!isActiveRef.current) return;
      await fetchAllData();
      // Increase interval gradually up to 30s if no realtime events
      pollIntervalRef.current = Math.min(pollIntervalRef.current * 1.5, 30000);
      if (isActiveRef.current) {
        pollTimeoutRef.current = setTimeout(poll, pollIntervalRef.current);
      }
    };

    // Start polling after initial delay
    pollTimeoutRef.current = setTimeout(poll, 5000);

    return () => {
      isActiveRef.current = false;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [refresh, fetchAllData]);

  // Re-fetch when dateRange changes
  useEffect(() => {
    fetchAllData();
  }, [dateRange.from.getTime(), dateRange.to.getTime()]);

  const activeAlerts = alerts.filter(a => !a.dismissed);

  return {
    enumerators: selectedProject === "all" ? enumerators : enumerators,
    alerts: activeAlerts,
    allAlerts: alerts,
    dailySummary,
    projectSummaries,
    isLoading,
    selectedProject,
    setSelectedProject,
    dateRange,
    setDateRange,
    refresh,
    dismissAlert,
  };
}
