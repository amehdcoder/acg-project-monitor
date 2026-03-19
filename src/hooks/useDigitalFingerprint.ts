import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface FingerprintProfile {
  avgTypingSpeed: number;
  typicalLoginHours: number[]; // hours 0-23
  typicalDeviceTypes: string[];
  avgSessionDuration: number; // minutes
  typicalLocations: { lat: number; lng: number }[];
  submissionRatePerHour: number;
}

interface AnomalyAlert {
  type: "unusual_login_time" | "suspicious_location" | "rapid_submissions" | "new_device" | "unusual_data_access";
  severity: "low" | "medium" | "high";
  message: string;
  userId: string;
  userName: string;
  timestamp: string;
}

export const useDigitalFingerprint = (enabled: boolean = false) => {
  const [anomalies, setAnomalies] = useState<AnomalyAlert[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const lastCheckRef = useRef<number>(0);

  const buildUserFingerprint = useCallback(async (userId: string): Promise<FingerprintProfile | null> => {
    try {
      // Get submission patterns (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: submissions } = await supabase
        .from("form_submissions")
        .select("submitted_at, location")
        .eq("user_id", userId)
        .gte("submitted_at", thirtyDaysAgo)
        .order("submitted_at", { ascending: true });

      // Get device session patterns
      const { data: sessions } = await supabase
        .from("device_sessions")
        .select("device_type, first_seen_at, last_seen_at")
        .eq("user_id", userId)
        .gte("first_seen_at", thirtyDaysAgo);

      if (!submissions?.length) return null;

      // Analyze login/submission hours
      const hourCounts: Record<number, number> = {};
      const locations: { lat: number; lng: number }[] = [];

      submissions.forEach(sub => {
        if (sub.submitted_at) {
          const hour = new Date(sub.submitted_at).getHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        }
        const loc = sub.location as any;
        if (loc?.lat && loc?.lng) {
          locations.push({ lat: loc.lat, lng: loc.lng });
        }
      });

      // Typical hours (top 8 most common hours)
      const typicalHours = Object.entries(hourCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([h]) => parseInt(h));

      // Typical devices
      const deviceTypes = [...new Set(sessions?.map(s => s.device_type) || [])];

      // Avg session duration
      const sessionDurations = sessions?.map(s => {
        const start = new Date(s.first_seen_at).getTime();
        const end = new Date(s.last_seen_at).getTime();
        return (end - start) / 60000; // minutes
      }) || [];
      const avgDuration = sessionDurations.length > 0
        ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length : 0;

      // Submission rate
      const dayCount = Math.max(1, (Date.now() - new Date(thirtyDaysAgo).getTime()) / (24 * 60 * 60 * 1000));
      const submissionRate = submissions.length / (dayCount * 24); // per hour

      // Cluster typical locations (simple centroid approach)
      const typicalLocs = locations.length > 0
        ? [locations.reduce((acc, l) => ({ lat: acc.lat + l.lat / locations.length, lng: acc.lng + l.lng / locations.length }), { lat: 0, lng: 0 })]
        : [];

      return {
        avgTypingSpeed: 0, // Would need behavioral monitoring data
        typicalLoginHours: typicalHours,
        typicalDeviceTypes: deviceTypes,
        avgSessionDuration: avgDuration,
        typicalLocations: typicalLocs,
        submissionRatePerHour: submissionRate,
      };
    } catch (e) {
      console.error("Fingerprint build error:", e);
      return null;
    }
  }, []);

  const detectAnomalies = useCallback(async (userId: string, profile: FingerprintProfile, userName: string): Promise<AnomalyAlert[]> => {
    const alerts: AnomalyAlert[] = [];
    const now = new Date();
    const currentHour = now.getHours();

    // Check unusual login time
    if (profile.typicalLoginHours.length > 0 && !profile.typicalLoginHours.includes(currentHour)) {
      const isLateNight = currentHour >= 0 && currentHour <= 5;
      alerts.push({
        type: "unusual_login_time",
        severity: isLateNight ? "high" : "medium",
        message: `${userName} is active at ${currentHour}:00, outside their typical hours (${profile.typicalLoginHours.slice(0, 4).join(", ")}h)`,
        userId, userName,
        timestamp: now.toISOString(),
      });
    }

    // Check rapid submissions (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentSubs } = await supabase
      .from("form_submissions")
      .select("id")
      .eq("user_id", userId)
      .gte("submitted_at", oneHourAgo);

    const recentRate = recentSubs?.length || 0;
    if (profile.submissionRatePerHour > 0 && recentRate > profile.submissionRatePerHour * 5) {
      alerts.push({
        type: "rapid_submissions",
        severity: "high",
        message: `${userName} submitted ${recentRate} forms in the last hour (typical: ~${profile.submissionRatePerHour.toFixed(1)}/hr)`,
        userId, userName,
        timestamp: now.toISOString(),
      });
    }

    // Check new device
    const { data: recentSessions } = await supabase
      .from("device_sessions")
      .select("device_type, first_seen_at")
      .eq("user_id", userId)
      .order("first_seen_at", { ascending: false })
      .limit(1);

    if (recentSessions?.[0]) {
      const latestDevice = recentSessions[0].device_type;
      if (profile.typicalDeviceTypes.length > 0 && !profile.typicalDeviceTypes.includes(latestDevice)) {
        alerts.push({
          type: "new_device",
          severity: "medium",
          message: `${userName} is using a new device type: ${latestDevice} (typical: ${profile.typicalDeviceTypes.join(", ")})`,
          userId, userName,
          timestamp: now.toISOString(),
        });
      }
    }

    return alerts;
  }, []);

  const runAnomalyCheck = useCallback(async () => {
    if (!enabled) return;
    const now = Date.now();
    if (now - lastCheckRef.current < 5 * 60 * 1000) return; // Rate limit: every 5 min
    lastCheckRef.current = now;
    setIsAnalyzing(true);

    try {
      // Get current user to verify admin
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all active users with recent activity
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: activeDevices } = await supabase
        .from("device_sessions")
        .select("user_id")
        .eq("is_active", true)
        .gte("last_seen_at", oneHourAgo);

      if (!activeDevices?.length) { setIsAnalyzing(false); return; }

      const uniqueUsers = [...new Set(activeDevices.map(d => d.user_id))];

      // Get profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", uniqueUsers);
      const profileMap = new Map(profiles?.map(p => [p.user_id, `${p.first_name} ${p.last_name}`]) || []);

      const allAlerts: AnomalyAlert[] = [];

      for (const userId of uniqueUsers.slice(0, 20)) { // Cap at 20 users
        const fingerprint = await buildUserFingerprint(userId);
        if (!fingerprint) continue;
        const userAlerts = await detectAnomalies(userId, fingerprint, profileMap.get(userId) || "Unknown");
        allAlerts.push(...userAlerts);
      }

      // Auto-notify admins for high-severity anomalies
      for (const alert of allAlerts.filter(a => a.severity === "high")) {
        // Get admin user IDs for the projects this user belongs to
        const { data: userProjects } = await supabase
          .from("user_project_assignments")
          .select("project_id")
          .eq("user_id", alert.userId);

        if (userProjects?.length) {
          const projectIds = userProjects.map(p => p.project_id);
          const { data: adminAssignments } = await supabase
            .from("user_project_assignments")
            .select("user_id")
            .in("project_id", projectIds);

          const { data: adminRoles } = await supabase
            .from("user_roles")
            .select("user_id")
            .in("role", ["super_admin", "systems_admin"]);

          const adminUserIds = new Set(adminRoles?.map(r => r.user_id) || []);
          const projectAdmins = adminAssignments?.filter(a => adminUserIds.has(a.user_id)).map(a => a.user_id) || [];

          // Also add super admins
          const { data: superAdmins } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", "super_admin");
          const allNotifyIds = [...new Set([...projectAdmins, ...(superAdmins?.map(s => s.user_id) || [])])];

          for (const adminId of allNotifyIds) {
            await supabase.from("notifications").insert({
              user_id: adminId,
              title: `⚠️ Security Anomaly: ${alert.type.replace(/_/g, " ")}`,
              message: alert.message,
              type: "warning",
              category: "security",
            });
          }
        }
      }

      setAnomalies(allAlerts);
    } catch (e) {
      console.error("Anomaly detection error:", e);
    } finally {
      setIsAnalyzing(false);
    }
  }, [enabled, buildUserFingerprint, detectAnomalies]);

  // Run check on mount and periodically
  useEffect(() => {
    if (!enabled) return;
    runAnomalyCheck();
    const interval = setInterval(runAnomalyCheck, 10 * 60 * 1000); // Every 10 minutes
    return () => clearInterval(interval);
  }, [enabled, runAnomalyCheck]);

  return { anomalies, isAnalyzing, runAnomalyCheck };
};

export default useDigitalFingerprint;
