import { useState, useEffect } from "react";
import { AlertTriangle, MapPin, TrendingDown, Users, ShieldAlert, ChevronDown, ChevronUp, Target, FolderOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

interface PriorityAction {
  id: string;
  type: "coverage" | "reporting_drop" | "compliance" | "no_activity" | "target_gap";
  location: string;
  message: string;
  severity: "critical" | "warning" | "info";
  details: string[];
  projectName?: string;
  formName?: string;
}

interface ProjectFormGroup {
  projectId: string;
  projectName: string;
  forms: { formId: string; formName: string; actions: PriorityAction[] }[];
  ungrouped: PriorityAction[];
}

const severityDot = (severity: PriorityAction["severity"]) => {
  const colors = { critical: "bg-status-danger", warning: "bg-status-warning", info: "bg-status-info" };
  return <span className={`h-2 w-2 rounded-full ${colors[severity]} inline-block flex-shrink-0`} />;
};

const severityIcon = (type: PriorityAction["type"]) => {
  switch (type) {
    case "coverage": return <MapPin className="h-3.5 w-3.5 text-yellow-200" />;
    case "reporting_drop": return <TrendingDown className="h-3.5 w-3.5 text-yellow-200" />;
    case "compliance": return <ShieldAlert className="h-3.5 w-3.5 text-yellow-200" />;
    case "no_activity": return <Users className="h-3.5 w-3.5 text-yellow-200" />;
    case "target_gap": return <Target className="h-3.5 w-3.5 text-yellow-200" />;
  }
};

const PriorityActionsBar = () => {
  const [groups, setGroups] = useState<ProjectFormGroup[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalActions, setTotalActions] = useState(0);

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

      if (!submissions || submissions.length === 0) { setLoading(false); return; }

      const userIds = [...new Set(submissions.map((s: any) => s.user_id))];
      const formIds = [...new Set(submissions.map((s: any) => s.form_id))];

      const [profilesRes, formsRes, targetsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, first_name, last_name, email, state, lga").in("user_id", userIds),
        supabase.from("forms").select("id, name, project_id").in("id", formIds),
        supabase.from("form_daily_targets").select("form_id, user_id, daily_target").eq("is_active", true),
      ]);

      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p]));
      const formMap = new Map((formsRes.data || []).map((f: any) => [f.id, { name: f.name, projectId: f.project_id }]));

      const projectIds = [...new Set((formsRes.data || []).map(f => f.project_id))];
      const { data: projects } = await supabase.from("projects").select("id, name").in("id", projectIds);
      const projectMap = new Map((projects || []).map(p => [p.id, p.name]));

      const getName = (uid: string) => {
        const p = profileMap.get(uid);
        return p ? `${p.first_name} ${p.last_name}`.trim() : "Unknown";
      };

      const priorities: PriorityAction[] = [];

      // ---- PER-FORM ANALYSIS ----
      const formSubs: Record<string, any[]> = {};
      submissions.forEach(s => {
        if (!formSubs[s.form_id]) formSubs[s.form_id] = [];
        formSubs[s.form_id].push(s);
      });

      const now = new Date();
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);

      for (const [formId, fSubs] of Object.entries(formSubs)) {
        const fi = formMap.get(formId);
        if (!fi) continue;
        const fName = fi.name;
        const pName = projectMap.get(fi.projectId) || "Unknown";

        // Geofence violations per form
        const violations = fSubs.filter(s => s.within_geofence === false);
        const violationRate = fSubs.length > 0 ? Math.round((violations.length / fSubs.length) * 100) : 0;
        if (violationRate > 20 && violations.length >= 3) {
          const violatorCounts: Record<string, number> = {};
          violations.forEach(s => { violatorCounts[s.user_id] = (violatorCounts[s.user_id] || 0) + 1; });
          const topV = Object.entries(violatorCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([uid, c]) => `${getName(uid)} (${c})`);
          priorities.push({
            id: `gf-${formId}`, type: "compliance", location: fName, projectName: pName, formName: fName,
            severity: violationRate > 40 ? "critical" : "warning",
            message: `${violationRate}% geofence violations (${violations.length}/${fSubs.length})`,
            details: [`Top violators: ${topV.join(", ")}`, "Workers may be submitting outside designated areas"],
          });
        }

        // Reporting drop per form
        const recent = fSubs.filter(s => new Date(s.created_at) >= sevenDaysAgo);
        const prior = fSubs.filter(s => { const d = new Date(s.created_at); return d >= fourteenDaysAgo && d < sevenDaysAgo; });
        if (prior.length > 3 && recent.length < prior.length * 0.5) {
          const dropPct = Math.round((1 - recent.length / prior.length) * 100);
          const priorU = new Set(prior.map(s => s.user_id));
          const recentU = new Set(recent.map(s => s.user_id));
          const dropped = [...priorU].filter(u => !recentU.has(u));
          priorities.push({
            id: `drop-${formId}`, type: "reporting_drop", location: fName, projectName: pName, formName: fName,
            severity: "warning",
            message: `${dropPct}% drop this week (${recent.length} vs ${prior.length})`,
            details: [
              `${dropped.length} worker(s) stopped reporting: ${dropped.slice(0, 3).map(getName).join(", ")}${dropped.length > 3 ? ` +${dropped.length - 3}` : ""}`,
              `Active: ${recentU.size} this week vs ${priorU.size} last week`,
            ],
          });
        }

        // Inactive users per form
        const allFormUsers = new Set(fSubs.map(s => s.user_id));
        const recentActive = new Set(fSubs.filter(s => new Date(s.created_at) >= threeDaysAgo).map(s => s.user_id));
        const inactive = [...allFormUsers].filter(u => !recentActive.has(u));
        if (inactive.length >= 2 && inactive.length >= allFormUsers.size * 0.3) {
          priorities.push({
            id: `inactive-${formId}`, type: "no_activity", location: fName, projectName: pName, formName: fName,
            severity: inactive.length >= allFormUsers.size * 0.5 ? "critical" : "warning",
            message: `${inactive.length}/${allFormUsers.size} workers inactive 3+ days`,
            details: [`Inactive: ${inactive.slice(0, 4).map(getName).join(", ")}${inactive.length > 4 ? ` +${inactive.length - 4}` : ""}`],
          });
        }
      }

      // ---- TARGET GAP ANALYSIS ----
      if (targetsRes.data && targetsRes.data.length > 0) {
        const todaySubs: Record<string, number> = {};
        submissions.filter(s => new Date(s.created_at) >= todayStart).forEach(s => {
          const k = `${s.user_id}__${s.form_id}`;
          todaySubs[k] = (todaySubs[k] || 0) + 1;
        });

        // Group by form
        const formTargetGaps: Record<string, { behind: string[]; total: number; formName: string; projectName: string }> = {};
        targetsRes.data.forEach(t => {
          const achieved = todaySubs[`${t.user_id}__${t.form_id}`] || 0;
          const pct = t.daily_target > 0 ? (achieved / t.daily_target) * 100 : 100;
          const fi = formMap.get(t.form_id);
          if (!fi) return;
          if (!formTargetGaps[t.form_id]) {
            formTargetGaps[t.form_id] = { behind: [], total: 0, formName: fi.name, projectName: projectMap.get(fi.projectId) || "Unknown" };
          }
          formTargetGaps[t.form_id].total++;
          if (pct < 50) {
            formTargetGaps[t.form_id].behind.push(`${getName(t.user_id)} (${achieved}/${t.daily_target})`);
          }
        });

        Object.entries(formTargetGaps).forEach(([fid, gap]) => {
          if (gap.behind.length >= 2) {
            priorities.push({
              id: `target-${fid}`, type: "target_gap", location: gap.formName, projectName: gap.projectName, formName: gap.formName,
              severity: gap.behind.length >= gap.total * 0.5 ? "critical" : "warning",
              message: `${gap.behind.length}/${gap.total} workers below 50% of daily target`,
              details: gap.behind.slice(0, 5).concat(gap.behind.length > 5 ? [`+${gap.behind.length - 5} more`] : []),
            });
          }
        });
      }

      // ---- STATE COVERAGE (global) ----
      const totalSubs = submissions.length;
      const stateCounts: Record<string, { count: number; users: Set<string> }> = {};
      submissions.forEach((s: any) => {
        const d = s.data as Record<string, any>;
        const profile = profileMap.get(s.user_id);
        const state = d?.state || d?.State || d?.location_state || profile?.state;
        if (typeof state === "string" && state.trim()) {
          const key = state.trim();
          if (!stateCounts[key]) stateCounts[key] = { count: 0, users: new Set() };
          stateCounts[key].count++;
          stateCounts[key].users.add(s.user_id);
        }
      });
      Object.entries(stateCounts).forEach(([state, info]) => {
        const pct = Math.round((info.count / totalSubs) * 100);
        if (pct < 10 && info.count > 0) {
          priorities.push({
            id: `cov-${state}`, type: "coverage", location: state,
            severity: pct < 3 ? "critical" : "warning",
            message: `Only ${pct}% coverage (${info.count} submissions, ${info.users.size} workers)`,
            details: [`Deploy more teams to ${state} — currently ${info.users.size} active worker(s)`],
          });
        }
      });

      // Sort: critical first
      priorities.sort((a, b) => {
        const sev = { critical: 0, warning: 1, info: 2 };
        return sev[a.severity] - sev[b.severity];
      });

      // Group by project → form
      const projectFormGroups: Record<string, ProjectFormGroup> = {};

      priorities.forEach(action => {
        const pName = action.projectName || "General";
        const pId = pName;
        if (!projectFormGroups[pId]) {
          projectFormGroups[pId] = { projectId: pId, projectName: pName, forms: [], ungrouped: [] };
        }
        if (action.formName) {
          let fg = projectFormGroups[pId].forms.find(f => f.formName === action.formName);
          if (!fg) {
            fg = { formId: action.id, formName: action.formName!, actions: [] };
            projectFormGroups[pId].forms.push(fg);
          }
          fg.actions.push(action);
        } else {
          projectFormGroups[pId].ungrouped.push(action);
        }
      });

      setGroups(Object.values(projectFormGroups));
      setTotalActions(priorities.length);
    } catch (err) {
      console.error("Priority actions error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Skeleton className="h-16 rounded-xl w-full" />;
  if (totalActions === 0) return null;

  return (
    <div className="rounded-xl overflow-hidden bg-gradient-to-r from-[hsl(var(--priority-bar-from))] via-[hsl(var(--priority-bar-via))] to-[hsl(var(--priority-bar-to))] shadow-lg">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-yellow-200" />
          <span className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
            Today's Priority Actions
          </span>
          <span className="text-[10px] text-white/60 ml-auto">{totalActions} action{totalActions !== 1 ? "s" : ""}</span>
        </div>

        <div className="space-y-2 max-h-[320px] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.3) transparent" }}>
          {groups.map(pg => {
            const isProjectExpanded = expandedProject === pg.projectId;
            const pgActionCount = pg.forms.reduce((s, f) => s + f.actions.length, 0) + pg.ungrouped.length;
            const criticalCount = pg.forms.reduce((s, f) => s + f.actions.filter(a => a.severity === "critical").length, 0) + pg.ungrouped.filter(a => a.severity === "critical").length;

            return (
              <div key={pg.projectId} className="rounded-lg overflow-hidden bg-white/5">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => setExpandedProject(isProjectExpanded ? null : pg.projectId)}
                >
                  <FolderOpen className="h-3.5 w-3.5 text-yellow-200 flex-shrink-0" />
                  <span className="text-xs font-bold text-white flex-1 truncate">{pg.projectName}</span>
                  {criticalCount > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/30 text-red-200 font-medium">
                      {criticalCount} critical
                    </span>
                  )}
                  <span className="text-[10px] text-white/50">{pgActionCount}</span>
                  {isProjectExpanded ? <ChevronUp className="h-3 w-3 text-white/50" /> : <ChevronDown className="h-3 w-3 text-white/50" />}
                </div>

                {isProjectExpanded && (
                  <div className="px-3 pb-2 space-y-1.5">
                    {pg.forms.map(fg => (
                      <div key={fg.formName} className="ml-2">
                        <p className="text-[10px] text-white/50 font-medium mb-1 uppercase tracking-wide">📋 {fg.formName}</p>
                        {fg.actions.map(action => (
                          <ActionRow key={action.id} action={action} expandedId={expandedId} setExpandedId={setExpandedId} />
                        ))}
                      </div>
                    ))}
                    {pg.ungrouped.map(action => (
                      <ActionRow key={action.id} action={action} expandedId={expandedId} setExpandedId={setExpandedId} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const ActionRow = ({ action, expandedId, setExpandedId }: { action: PriorityAction; expandedId: string | null; setExpandedId: (id: string | null) => void }) => (
  <div>
    <div
      className="flex items-center gap-2 text-white/90 cursor-pointer hover:bg-white/10 rounded px-1 py-0.5 transition-colors"
      onClick={() => setExpandedId(expandedId === action.id ? null : action.id)}
    >
      {severityDot(action.severity)}
      {severityIcon(action.type)}
      <span className="text-white font-semibold text-xs truncate max-w-[100px]">{action.location}:</span>
      <span className="text-white/80 text-xs truncate flex-1">{action.message}</span>
      {expandedId === action.id ? <ChevronUp className="h-3 w-3 text-white/60 flex-shrink-0" /> : <ChevronDown className="h-3 w-3 text-white/60 flex-shrink-0" />}
    </div>
    {expandedId === action.id && (
      <div className="ml-8 mt-1 mb-2 p-2 rounded bg-black/20 text-white/80 text-xs space-y-0.5">
        {action.details.map((detail, i) => (
          <p key={i} className={detail.startsWith("  •") || detail.startsWith("+") ? "ml-2" : ""}>{detail}</p>
        ))}
      </div>
    )}
  </div>
);

export default PriorityActionsBar;
