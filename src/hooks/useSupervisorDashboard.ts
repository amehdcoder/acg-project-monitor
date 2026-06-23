import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, subHours, differenceInMinutes } from "date-fns";
import { extractLocationInfo } from "@/lib/locationUtils";

export interface UserStatus {
  user_id: string;
  first_name: string;
  last_name: string;
  designation: string;
  state: string | null;
  lga: string | null;
  ward: string | null;
  email: string;
  phone_number: string | null;
  alternate_email: string | null;
  alternate_phone: string | null;
  is_active: boolean;
  role: string | null;
  status: "active" | "idle" | "offline";
  last_submission_at: string | null;
  submissions_today: number;
  submissions_total: number;
  geofence_compliance: number | null;
  avg_time_between_submissions: number | null;
  last_location: { lat: number; lng: number } | null;
  assigned_forms: string[];
  assigned_projects: string[];
  last_login_at: string | null;
  last_ip_address: string | null;
  last_device_type: string | null;
  device_phone_number: string | null;
}

// Keep backward compat alias
export type EnumeratorStatus = UserStatus;

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
  active_users: number;
  geofence_compliance_avg: number | null;
  submissions_by_hour: { hour: number; count: number }[];
  top_performers: { user_id: string; name: string; count: number }[];
  underperformers: { user_id: string; name: string; count: number; expected: number }[];
  total_users: number;
  active_enumerators: number; // backward compat
}

export interface ProjectSummary {
  project_id: string;
  project_name: string;
  total_users: number;
  total_enumerators: number; // backward compat
  active_today: number;
  submissions_today: number;
  compliance_rate: number | null;
}

export function useSupervisorDashboard() {
  const [users, setUsers] = useState<UserStatus[]>([]);
  const [alerts, setAlerts] = useState<SupervisorAlert[]>([]);
  const [dailySummary, setDailySummary] = useState<DailyActivitySummary | null>(null);
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date()),
  });

  const dateRangeRef = useRef(dateRange);
  dateRangeRef.current = dateRange;
  const dismissedAlertsRef = useRef<Set<string>>(new Set());
  const pollIntervalRef = useRef(2000);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSyncRef = useRef<string | null>(null);
  const isActiveRef = useRef(true);
  const [reconnectNonce, setReconnectNonce] = useState(0);

  // Force a realtime reconnect + immediate data refresh (used by the
  // "Reconnect" button when the channel is Offline/Connecting).
  const reconnectRealtime = useCallback(() => {
    setRealtimeStatus("connecting");
    pollIntervalRef.current = 2000;
    setReconnectNonce((n) => n + 1);
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      const currentDateRange = dateRangeRef.current;

      // Fetch ALL profiles (not just active), including last_seen_at
      const { data: profiles, error: profilesErr } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, designation, state, lga, ward, email, phone_number, alternate_email, alternate_phone, is_active, last_seen_at, last_ip_address, last_device_type, device_phone_number");

      if (profilesErr) throw profilesErr;

      // Fetch all user roles
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id, role");

      const rolesMap = new Map((rolesData || []).map(r => [r.user_id, r.role]));

      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();

      // Submission metrics are now aggregated server-side (per-user counts,
      // geofence compliance, first/last submission, most-recent location and
      // submitted form ids) so the browser never downloads every submission
      // row. This keeps the dashboard fast regardless of total submission volume.
      const [userMetricsRes, hourlyRes, fieldActivityRes, formAssignmentsRes, projectsRes, projectAssignmentsRes, formsRes] = await Promise.all([
        (supabase as any).rpc("supervisor_user_metrics", {
          _today_start: todayStart,
          _today_end: todayEnd,
          _range_from: currentDateRange.from.toISOString(),
          _range_to: currentDateRange.to.toISOString(),
        }),
        (supabase as any).rpc("supervisor_hourly_submissions", {
          _range_from: currentDateRange.from.toISOString(),
          _range_to: currentDateRange.to.toISOString(),
        }),
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
        supabase
          .from("forms")
          .select("id, project_id"),
      ]);

      const metricsRows: any[] = userMetricsRes.data || [];
      const metricsMap = new Map<string, any>(metricsRows.map((m) => [m.user_id, m]));
      const hourlyRows: any[] = hourlyRes.data || [];

      const fieldActivity = fieldActivityRes.data || [];
      const formAssignments = formAssignmentsRes.data || [];
      const projects = projectsRes.data || [];
      const projectAssignments = projectAssignmentsRes.data || [];
      const allForms = formsRes.data || [];

      // Build a map of form_id -> project_id for deriving project assignments from submissions
      const formProjectMap = new Map((allForms || []).map((f: any) => [f.id, f.project_id]));

      // Derive each user's submitted forms/projects from the aggregated form id set.
      const submitterFormIds = new Map<string, Set<string>>();
      const submitterProjectIds = new Map<string, Set<string>>();
      metricsRows.forEach((m) => {
        const fset = new Set<string>(((m.form_ids as string[]) || []).filter(Boolean));
        submitterFormIds.set(m.user_id, fset);
        const pset = new Set<string>();
        fset.forEach((fid) => {
          const pid = formProjectMap.get(fid);
          if (pid) pset.add(pid);
        });
        submitterProjectIds.set(m.user_id, pset);
      });
      const now = new Date();
      const allUserStatuses: UserStatus[] = (profiles || []).map((profile) => {
        const m = metricsMap.get(profile.user_id);
        const subsToday = m ? Number(m.subs_today) : 0;
        const subsTotal = m ? Number(m.subs_total) : 0;
        const userActivity = fieldActivity.filter(a => a.user_id === profile.user_id);
        // Merge formal assignments with submission-derived assignments
        const formalForms = formAssignments.filter(a => a.user_id === profile.user_id).map(a => a.form_id);
        const derivedForms = submitterFormIds.get(profile.user_id);
        const userForms = [...new Set([...formalForms, ...(derivedForms ? Array.from(derivedForms) : [])])];

        const formalProjects = projectAssignments.filter(a => a.user_id === profile.user_id).map(a => a.project_id);
        const derivedProjects = submitterProjectIds.get(profile.user_id);
        const userProjects = [...new Set([...formalProjects, ...(derivedProjects ? Array.from(derivedProjects) : [])])];

        let status: "active" | "idle" | "offline" = "offline";
        const lastActivity = userActivity[0];

        // Use last_seen_at (heartbeat) as primary indicator, fall back to activity/submissions
        const lastSeenAt = (profile as any).last_seen_at ? new Date((profile as any).last_seen_at) : null;
        const lastActivityTime = lastActivity
          ? new Date(lastActivity.ended_at || lastActivity.started_at)
          : null;
        const lastSubmissionTime = m?.last_submission_at ? new Date(m.last_submission_at) : null;

        // Pick the most recent signal
        const candidates = [lastSeenAt, lastActivityTime, lastSubmissionTime].filter(Boolean) as Date[];
        const lastActiveTime = candidates.length > 0
          ? new Date(Math.max(...candidates.map(d => d.getTime())))
          : null;

        if (lastActiveTime) {
          const minutesAgo = differenceInMinutes(now, lastActiveTime);
          if (minutesAgo <= 5) status = "active";
          else if (minutesAgo <= 30) status = "idle";
        }

        // Geofence compliance computed server-side over the selected range.
        const geoTotal = m ? Number(m.geo_total) : 0;
        const geoWithin = m ? Number(m.geo_within) : 0;
        const complianceRate = geoTotal > 0
          ? Math.round((geoWithin / geoTotal) * 100)
          : null; // null = no geofence configured

        // Mean interval between today's submissions telescopes to (max-min)/(n-1).
        let avgTimeBetween: number | null = null;
        if (subsToday > 1 && m?.today_min && m?.today_max) {
          avgTimeBetween = Math.round(
            (new Date(m.today_max).getTime() - new Date(m.today_min).getTime()) / (subsToday - 1) / 60000,
          );
        }

        const lastLoc = m?.last_location as any;
        const lastLocation = lastLoc && lastLoc.lat && lastLoc.lng
          ? { lat: lastLoc.lat, lng: lastLoc.lng }
          : null;

        // Derive state/lga from the most recent submission's data/GPS (server-provided).
        let derivedState: string | null = null;
        let derivedLga: string | null = null;
        if (m?.last_data || m?.last_location) {
          const formData = m.last_data && typeof m.last_data === "object" ? m.last_data as Record<string, any> : null;
          const locInfo = extractLocationInfo(formData, m.last_location as any);
          if (locInfo.state) {
            derivedState = locInfo.state;
            derivedLga = locInfo.lga;
          }
        }
        // Only use submission-derived location; do NOT fall back to profile state
        // This ensures "Team Reporting by State" only shows states with actual field data

        return {
          user_id: profile.user_id,
          first_name: profile.first_name,
          last_name: profile.last_name,
          designation: profile.designation,
          state: derivedState,
          lga: derivedLga,
          ward: profile.ward,
          email: profile.email,
          phone_number: profile.phone_number,
          alternate_email: profile.alternate_email,
          alternate_phone: profile.alternate_phone,
          is_active: profile.is_active,
          role: rolesMap.get(profile.user_id) || null,
          status,
          last_submission_at: m?.last_submission_at || null,
          submissions_today: subsToday,
          submissions_total: subsTotal,
          geofence_compliance: complianceRate,
          avg_time_between_submissions: avgTimeBetween,
          last_location: lastLocation,
          assigned_forms: userForms,
          assigned_projects: userProjects,
          last_login_at: (profile as any).last_seen_at || null,
          last_ip_address: (profile as any).last_ip_address || null,
          last_device_type: (profile as any).last_device_type || null,
          device_phone_number: (profile as any).device_phone_number || null,
        };
      });

      setUsers(allUserStatuses);

      // Generate alerts for users with form assignments (field workers)
      const fieldWorkers = allUserStatuses.filter(e => e.assigned_forms.length > 0 && e.is_active);
      const newAlerts: SupervisorAlert[] = [];
      const nigerianHour = now.getUTCHours() + 1;

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

        if (worker.geofence_compliance !== null && worker.geofence_compliance < 80 && worker.submissions_total > 0) {
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

      // Daily summary — driven by the SELECTED date range so the time filters
      // (Today / 7 Days / 30 Days / custom) reactively re-shape the whole page.
      const hourMap = new Map<number, number>();
      rangeSubmissions.forEach(s => {
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
      rangeSubmissions.forEach(s => {
        userCounts.set(s.user_id, (userCounts.get(s.user_id) || 0) + 1);
      });
      const sorted = Array.from(userCounts.entries()).sort((a, b) => b[1] - a[1]);
      const topPerformers = sorted.slice(0, 5).map(([uid, count]) => {
        const w = allUserStatuses.find(w => w.user_id === uid);
        return { user_id: uid, name: w ? `${w.first_name} ${w.last_name}` : "Unknown", count };
      });

      const underperformers = fieldWorkers
        .filter(w => w.submissions_total < 3 && w.assigned_forms.length > 0)
        .sort((a, b) => a.submissions_total - b.submissions_total)
        .slice(0, 5)
        .map(w => ({
          user_id: w.user_id,
          name: `${w.first_name} ${w.last_name}`,
          count: w.submissions_total,
          expected: 5,
        }));

      const geofenceWorkers = fieldWorkers.filter(w => w.geofence_compliance !== null);
      const avgCompliance = geofenceWorkers.length > 0
        ? Math.round(geofenceWorkers.reduce((sum, w) => sum + (w.geofence_compliance ?? 0), 0) / geofenceWorkers.length)
        : null;

      const activeUsersCount = allUserStatuses.filter(w => w.status !== "offline").length;

      setDailySummary({
        date: new Date().toISOString().split("T")[0],
        total_submissions: rangeSubmissions.length,
        active_users: activeUsersCount,
        active_enumerators: activeUsersCount, // backward compat
        geofence_compliance_avg: avgCompliance,
        submissions_by_hour: submissionsByHour,
        top_performers: topPerformers,
        underperformers,
        total_users: allUserStatuses.length,
      });

      // Project summaries
      const summaries: ProjectSummary[] = projects.map(project => {
        const projectUserIds = projectAssignments
          .filter(a => a.project_id === project.id)
          .map(a => a.user_id);
        const projectWorkers = allUserStatuses.filter(w => projectUserIds.includes(w.user_id));

        return {
          project_id: project.id,
          project_name: project.name,
          total_users: projectWorkers.length,
          total_enumerators: projectWorkers.length, // backward compat
          active_today: projectWorkers.filter(w => w.status !== "offline").length,
          submissions_today: projectWorkers.reduce((sum, w) => sum + w.submissions_today, 0),
          compliance_rate: (() => {
            const geoWorkers = projectWorkers.filter(w => w.geofence_compliance !== null);
            return geoWorkers.length > 0
              ? Math.round(geoWorkers.reduce((s, w) => s + (w.geofence_compliance ?? 0), 0) / geoWorkers.length)
              : null;
          })(),
        };
      });

      setProjectSummaries(summaries.filter(s => s.total_users > 0));
      lastSyncRef.current = new Date().toISOString();
      setLastUpdated(new Date());
      pollIntervalRef.current = 2000;

    } catch (error) {
      console.error("Error fetching supervisor data:", error);
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchAllData();
    setIsLoading(false);
  }, [fetchAllData]);

  const dismissAlert = useCallback((alertId: string) => {
    dismissedAlertsRef.current.add(alertId);
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, dismissed: true } : a));
  }, []);

  useEffect(() => {
    isActiveRef.current = true;
    refresh();

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
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        fetchAllData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => {
        fetchAllData();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeStatus("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeStatus("disconnected");
        else setRealtimeStatus("connecting");
      });

    const poll = async () => {
      if (!isActiveRef.current) return;
      await fetchAllData();
      pollIntervalRef.current = Math.min(pollIntervalRef.current * 1.5, 30000);
      if (isActiveRef.current) {
        pollTimeoutRef.current = setTimeout(poll, pollIntervalRef.current);
      }
    };

    pollTimeoutRef.current = setTimeout(poll, 5000);

    return () => {
      isActiveRef.current = false;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [refresh, fetchAllData, reconnectNonce]);

  // React to time-filter (date range) changes with a visible loading state so
  // the UI can disable interactions until the whole page finishes reloading.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    let cancelled = false;
    setIsFiltering(true);
    fetchAllData().finally(() => {
      if (!cancelled) setIsFiltering(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dateRange.from.getTime(), dateRange.to.getTime(), fetchAllData]);

  const activeAlerts = alerts.filter(a => !a.dismissed);

  return {
    users,
    enumerators: users, // backward compat
    alerts: activeAlerts,
    allAlerts: alerts,
    dailySummary,
    projectSummaries,
    isLoading,
    isFiltering,
    lastUpdated,
    realtimeStatus,
    selectedProject,
    setSelectedProject,
    dateRange,
    setDateRange,
    refresh,
    reconnectRealtime,
    dismissAlert,
  };
}
