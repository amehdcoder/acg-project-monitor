import { useState, useEffect } from "react";
import { AlertTriangle, MapPin, TrendingDown, Users, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PriorityAction {
  id: string;
  type: "coverage" | "reporting_drop" | "compliance" | "no_activity";
  location: string;
  message: string;
  severity: "critical" | "warning" | "info";
}

const severityIcon = (type: PriorityAction["type"]) => {
  switch (type) {
    case "coverage": return <MapPin className="h-3.5 w-3.5" />;
    case "reporting_drop": return <TrendingDown className="h-3.5 w-3.5" />;
    case "compliance": return <ShieldAlert className="h-3.5 w-3.5" />;
    case "no_activity": return <Users className="h-3.5 w-3.5" />;
  }
};

const severityDot = (severity: PriorityAction["severity"]) => {
  const colors = {
    critical: "bg-red-500",
    warning: "bg-amber-400",
    info: "bg-sky-400",
  };
  return <span className={`h-2 w-2 rounded-full ${colors[severity]} inline-block flex-shrink-0`} />;
};

const PriorityActionsBar = () => {
  const [actions, setActions] = useState<PriorityAction[]>([]);

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
      // Get submissions with location data
      const { data: submissions } = await supabase
        .from("form_submissions")
        .select("data, user_id, within_geofence, created_at, form_id")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (!submissions || submissions.length === 0) return;

      const priorities: PriorityAction[] = [];

      // Analyze by state coverage
      const stateCounts: Record<string, number> = {};
      submissions.forEach((s: any) => {
        const d = s.data as Record<string, any>;
        const state = d?.state || d?.State || d?.location_state;
        if (typeof state === "string" && state.trim()) {
          stateCounts[state.trim()] = (stateCounts[state.trim()] || 0) + 1;
        }
      });

      const totalSubs = submissions.length;
      // Find poorly covered states
      Object.entries(stateCounts).forEach(([state, count]) => {
        const pct = Math.round((count / totalSubs) * 100);
        if (pct < 15 && count > 0) {
          priorities.push({
            id: `coverage-${state}`,
            type: "coverage",
            location: state,
            message: `${pct}% Poorly Covered – Deploy More Teams`,
            severity: pct < 5 ? "critical" : "warning",
          });
        }
      });

      // Check geofence violations
      const violations = submissions.filter((s: any) => s.within_geofence === false).length;
      const violationRate = totalSubs > 0 ? Math.round((violations / totalSubs) * 100) : 0;
      if (violationRate > 20) {
        priorities.push({
          id: "geofence-violation",
          type: "compliance",
          location: "All Locations",
          message: `${violationRate}% Geofence Violations – Investigate Field Teams`,
          severity: violationRate > 40 ? "critical" : "warning",
        });
      }

      // Check for states with reporting drops (compare last 7 days vs prior 7 days)
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      
      const recentSubs = submissions.filter((s: any) => new Date(s.created_at) >= sevenDaysAgo);
      const priorSubs = submissions.filter((s: any) => {
        const d = new Date(s.created_at);
        return d >= fourteenDaysAgo && d < sevenDaysAgo;
      });

      if (priorSubs.length > 0 && recentSubs.length < priorSubs.length * 0.5) {
        priorities.push({
          id: "reporting-drop",
          type: "reporting_drop",
          location: "Overall",
          message: `${Math.round((1 - recentSubs.length / priorSubs.length) * 100)}% Reporting Drop – Investigate`,
          severity: "warning",
        });
      }

      setActions(priorities.slice(0, 4));
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
        </div>
        <div className="space-y-1.5">
          {actions.map((action) => (
            <div key={action.id} className="flex items-center gap-2 text-white/90">
              {severityDot(action.severity)}
              <span className="text-white font-semibold text-xs sm:text-sm">
                {action.location}:
              </span>
              <span className="text-white/80 text-xs sm:text-sm truncate">
                {action.message}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PriorityActionsBar;
