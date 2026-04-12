import { useState, useEffect } from "react";
import { AlertTriangle, MapPin, TrendingDown, Users, ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PriorityAction {
  id: string;
  type: "coverage" | "reporting_drop" | "compliance" | "no_activity";
  location: string;
  message: string;
  severity: "critical" | "warning" | "info";
  details: string[];
}

const severityDot = (severity: PriorityAction["severity"]) => {
  const colors = {
    critical: "bg-red-500",
    warning: "bg-amber-400",
    info: "bg-sky-400",
  };
  return <span className={`h-2 w-2 rounded-full ${colors[severity]} inline-block flex-shrink-0`} />;
};

const severityIcon = (type: PriorityAction["type"]) => {
  switch (type) {
    case "coverage": return <MapPin className="h-3.5 w-3.5 text-yellow-200" />;
    case "reporting_drop": return <TrendingDown className="h-3.5 w-3.5 text-yellow-200" />;
    case "compliance": return <ShieldAlert className="h-3.5 w-3.5 text-yellow-200" />;
    case "no_activity": return <Users className="h-3.5 w-3.5 text-yellow-200" />;
  }
};

const PriorityActionsBar = () => {
  const [actions, setActions] = useState<PriorityAction[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    generatePriorityActions();
    const channel = supabase
      .channel("dss-priority-actions")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, generatePriorityActions)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const generatePriorityActions = async () => {
    try {
      const { data: submissions } = await supabase
        .from("form_submissions")
        .select("data, user_id, within_geofence, created_at, form_id, status")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (!submissions || submissions.length === 0) return;

      // Fetch profiles for user details
      const userIds = [...new Set(submissions.map((s: any) => s.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email, state, lga")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

      // Fetch form names
      const formIds = [...new Set(submissions.map((s: any) => s.form_id))];
      const { data: forms } = await supabase
        .from("forms")
        .select("id, name")
        .in("id", formIds);
      const formMap = new Map((forms || []).map((f: any) => [f.id, f.name]));

      const priorities: PriorityAction[] = [];
      const totalSubs = submissions.length;

      // --- STATE COVERAGE ANALYSIS ---
      const stateCounts: Record<string, { count: number; users: Set<string>; forms: Set<string> }> = {};
      submissions.forEach((s: any) => {
        const d = s.data as Record<string, any>;
        const profile = profileMap.get(s.user_id);
        const state = d?.state || d?.State || d?.location_state || profile?.state;
        if (typeof state === "string" && state.trim()) {
          const key = state.trim();
          if (!stateCounts[key]) stateCounts[key] = { count: 0, users: new Set(), forms: new Set() };
          stateCounts[key].count++;
          stateCounts[key].users.add(s.user_id);
          stateCounts[key].forms.add(s.form_id);
        }
      });

      Object.entries(stateCounts).forEach(([state, info]) => {
        const pct = Math.round((info.count / totalSubs) * 100);
        if (pct < 15 && info.count > 0) {
          const userNames = [...info.users].slice(0, 3).map(uid => {
            const p = profileMap.get(uid);
            return p ? `${p.first_name} ${p.last_name}`.trim() : "Unknown";
          });
          const formNames = [...info.forms].slice(0, 3).map(fid => formMap.get(fid) || "Unknown form");
          priorities.push({
            id: `coverage-${state}`,
            type: "coverage",
            location: state,
            message: `${pct}% coverage (${info.count}/${totalSubs} submissions) – Deploy more teams`,
            severity: pct < 5 ? "critical" : "warning",
            details: [
              `Only ${info.count} of ${totalSubs} total submissions came from ${state} (${pct}%)`,
              `${info.users.size} field worker(s) active: ${userNames.join(", ")}${info.users.size > 3 ? ` +${info.users.size - 3} more` : ""}`,
              `Forms used: ${formNames.join(", ")}${info.forms.size > 3 ? ` +${info.forms.size - 3} more` : ""}`,
              pct < 5 ? "⚠️ CRITICAL: This state has almost no coverage — immediate action needed" : "Consider reassigning teams from higher-coverage states",
            ],
          });
        }
      });

      // --- GEOFENCE VIOLATIONS ---
      const violationSubs = submissions.filter((s: any) => s.within_geofence === false);
      const violations = violationSubs.length;
      const violationRate = totalSubs > 0 ? Math.round((violations / totalSubs) * 100) : 0;
      if (violationRate > 20) {
        const violatorCounts: Record<string, number> = {};
        violationSubs.forEach((s: any) => {
          violatorCounts[s.user_id] = (violatorCounts[s.user_id] || 0) + 1;
        });
        const topViolators = Object.entries(violatorCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([uid, count]) => {
            const p = profileMap.get(uid);
            return `${p ? `${p.first_name} ${p.last_name}`.trim() : "Unknown"} (${count} violations)`;
          });

        priorities.push({
          id: "geofence-violation",
          type: "compliance",
          location: "All Locations",
          message: `${violationRate}% geofence violations (${violations}/${totalSubs}) – Investigate field teams`,
          severity: violationRate > 40 ? "critical" : "warning",
          details: [
            `${violations} submissions out of ${totalSubs} were made outside the designated geofence area`,
            `Top violators:`,
            ...topViolators.map(v => `  • ${v}`),
            "Possible causes: Workers collecting data from home, GPS spoofing, or incorrect geofence boundaries",
          ],
        });
      }

      // --- REPORTING DROP ---
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      const recentSubs = submissions.filter((s: any) => new Date(s.created_at) >= sevenDaysAgo);
      const priorSubs = submissions.filter((s: any) => {
        const d = new Date(s.created_at);
        return d >= fourteenDaysAgo && d < sevenDaysAgo;
      });

      if (priorSubs.length > 0 && recentSubs.length < priorSubs.length * 0.5) {
        const dropPct = Math.round((1 - recentSubs.length / priorSubs.length) * 100);
        
        // Find who stopped reporting
        const priorUsers = new Set(priorSubs.map((s: any) => s.user_id));
        const recentUsers = new Set(recentSubs.map((s: any) => s.user_id));
        const droppedUsers = [...priorUsers].filter(u => !recentUsers.has(u));
        const droppedNames = droppedUsers.slice(0, 5).map(uid => {
          const p = profileMap.get(uid);
          return p ? `${p.first_name} ${p.last_name}`.trim() : "Unknown";
        });

        priorities.push({
          id: "reporting-drop",
          type: "reporting_drop",
          location: "Overall",
          message: `${dropPct}% reporting drop (${recentSubs.length} vs ${priorSubs.length} last week) – Investigate`,
          severity: "warning",
          details: [
            `This week: ${recentSubs.length} submissions vs last week: ${priorSubs.length} (${dropPct}% decline)`,
            `${droppedUsers.length} worker(s) who reported last week have not submitted this week:`,
            ...droppedNames.map(n => `  • ${n}`),
            droppedUsers.length > 5 ? `  ... and ${droppedUsers.length - 5} more` : "",
            `Active reporters this week: ${recentUsers.size} vs last week: ${priorUsers.size}`,
          ].filter(Boolean),
        });
      }

      // --- INACTIVE USERS ---
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const allUsers = new Set(submissions.map((s: any) => s.user_id));
      const recentActive = new Set(submissions.filter((s: any) => new Date(s.created_at) >= threeDaysAgo).map((s: any) => s.user_id));
      const inactiveUsers = [...allUsers].filter(u => !recentActive.has(u));
      
      if (inactiveUsers.length > 0 && inactiveUsers.length >= allUsers.size * 0.3) {
        const inactiveNames = inactiveUsers.slice(0, 5).map(uid => {
          const p = profileMap.get(uid);
          return p ? `${p.first_name} ${p.last_name}`.trim() + (p.state ? ` (${p.state})` : "") : "Unknown";
        });

        priorities.push({
          id: "inactive-users",
          type: "no_activity",
          location: "Field Teams",
          message: `${inactiveUsers.length}/${allUsers.size} workers inactive for 3+ days – Follow up`,
          severity: inactiveUsers.length >= allUsers.size * 0.5 ? "critical" : "warning",
          details: [
            `${inactiveUsers.length} out of ${allUsers.size} field workers have not submitted any data in the last 3 days`,
            `Inactive workers:`,
            ...inactiveNames.map(n => `  • ${n}`),
            inactiveUsers.length > 5 ? `  ... and ${inactiveUsers.length - 5} more` : "",
            "Recommend: Send push notifications or contact supervisors to verify field activity",
          ].filter(Boolean),
        });
      }

      setActions(priorities.slice(0, 6));
    } catch (err) {
      console.error("Priority actions error:", err);
    }
  };

  if (actions.length === 0) return null;

  return (
    <div className="rounded-xl overflow-hidden bg-gradient-to-r from-red-700 via-red-600 to-amber-600 shadow-lg">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-yellow-200" />
          <span className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
            Today's Priority Actions
          </span>
          <span className="text-[10px] text-white/60 ml-auto">{actions.length} action{actions.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="space-y-1.5">
          {actions.map((action) => (
            <div key={action.id}>
              <div
                className="flex items-center gap-2 text-white/90 cursor-pointer hover:bg-white/10 rounded px-1 py-0.5 transition-colors"
                onClick={() => setExpandedId(expandedId === action.id ? null : action.id)}
              >
                {severityDot(action.severity)}
                {severityIcon(action.type)}
                <span className="text-white font-semibold text-xs sm:text-sm">
                  {action.location}:
                </span>
                <span className="text-white/80 text-xs sm:text-sm truncate flex-1">
                  {action.message}
                </span>
                {expandedId === action.id
                  ? <ChevronUp className="h-3 w-3 text-white/60 flex-shrink-0" />
                  : <ChevronDown className="h-3 w-3 text-white/60 flex-shrink-0" />
                }
              </div>
              {expandedId === action.id && (
                <div className="ml-8 mt-1 mb-2 p-2 rounded bg-black/20 text-white/80 text-xs space-y-0.5">
                  {action.details.map((detail, i) => (
                    <p key={i} className={detail.startsWith("  •") ? "ml-2" : ""}>{detail}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PriorityActionsBar;
