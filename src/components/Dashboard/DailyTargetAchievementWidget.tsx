import { useState, useEffect, useRef } from "react";

import { Target, ChevronDown, ChevronUp, CheckCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

interface UserFormTarget {
  userId: string;
  userName: string;
  formId: string;
  formName: string;
  target: number;
  achieved: number;
  percentage: number;
}

interface ProjectGroup {
  projectId: string;
  projectName: string;
  forms: { formId: string; formName: string; users: UserFormTarget[] }[];
}

interface DailyTargetProps {
  selectedProjectId?: string | null;
}

const DailyTargetAchievementWidget = ({ selectedProjectId }: DailyTargetProps) => {
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [hasAnyTargets, setHasAnyTargets] = useState(false);
  const [allMet, setAllMet] = useState(false);

  const fetchRef = useRef(fetchTargetData);
  useEffect(() => { fetchRef.current = fetchTargetData; });

  useEffect(() => {
    fetchRef.current();
    const ch = supabase
      .channel("dss-target-achievement")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, () => fetchRef.current())
      .on("postgres_changes", { event: "*", schema: "public", table: "form_daily_targets" }, () => fetchRef.current())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedProjectId]);


  const fetchTargetData = async () => {
    try {
      const { data: targets } = await supabase
        .from("form_daily_targets")
        .select("form_id, user_id, daily_target")
        .eq("is_active", true);

      if (!targets || targets.length === 0) {
        setHasAnyTargets(false);
        setGroups([]);
        setLoading(false);
        return;
      }
      setHasAnyTargets(true);


      const userIds = [...new Set(targets.map(t => t.user_id))];
      const formIds = [...new Set(targets.map(t => t.form_id))];

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [profilesRes, formsRes, subsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds),
        supabase.from("forms").select("id, name, project_id").in("id", formIds),
        supabase.from("form_submissions").select("form_id, user_id")
          .in("form_id", formIds).in("user_id", userIds)
          .gte("created_at", todayStart.toISOString()),
      ]);

      const profileMap = new Map((profilesRes.data || []).map(p => [p.user_id, `${p.first_name} ${p.last_name}`.trim()]));
      const formMap = new Map((formsRes.data || []).map(f => [f.id, { name: f.name, projectId: f.project_id }]));

      // Count today's submissions per user+form
      const subCounts: Record<string, number> = {};
      (subsRes.data || []).forEach(s => {
        const key = `${s.user_id}__${s.form_id}`;
        subCounts[key] = (subCounts[key] || 0) + 1;
      });

      // Get project names
      const projectIds = [...new Set((formsRes.data || []).map(f => f.project_id))];
      const { data: projects } = await supabase.from("projects").select("id, name").in("id", projectIds);
      const projectMap = new Map((projects || []).map(p => [p.id, p.name]));

      // Build grouped structure
      const projectGroups: Record<string, ProjectGroup> = {};

      targets.forEach(t => {
        const formInfo = formMap.get(t.form_id);
        if (!formInfo) return;
        const achieved = subCounts[`${t.user_id}__${t.form_id}`] || 0;
        const pct = t.daily_target > 0 ? Math.round((achieved / t.daily_target) * 100) : 0;

        const entry: UserFormTarget = {
          userId: t.user_id,
          userName: profileMap.get(t.user_id) || "Unknown",
          formId: t.form_id,
          formName: formInfo.name,
          target: t.daily_target,
          achieved,
          percentage: pct,
        };

        if (!projectGroups[formInfo.projectId]) {
          projectGroups[formInfo.projectId] = {
            projectId: formInfo.projectId,
            projectName: projectMap.get(formInfo.projectId) || "Unknown Project",
            forms: [],
          };
        }

        const pg = projectGroups[formInfo.projectId];
        let formGroup = pg.forms.find(f => f.formId === t.form_id);
        if (!formGroup) {
          formGroup = { formId: t.form_id, formName: formInfo.name, users: [] };
          pg.forms.push(formGroup);
        }
        formGroup.users.push(entry);
      });

      Object.values(projectGroups).forEach(pg => {
        pg.forms.forEach(fg => {
          fg.users.sort((a, b) => a.percentage - b.percentage);
        });
      });

      let result = Object.values(projectGroups);
      if (selectedProjectId) {
        result = result.filter(pg => pg.projectId === selectedProjectId);
      }

      setGroups(result);

      // Check if all targets are met (so we can show the correct empty state)
      const allUsers = result.flatMap(pg => pg.forms.flatMap(fg => fg.users));
      setAllMet(allUsers.length > 0 && allUsers.every(u => u.percentage >= 100));

    } catch (err) {
      console.error("Target achievement error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Skeleton className="h-[200px] rounded-lg w-full" />;

  if (groups.length === 0 || allMet) {
    return (
      <div className="flex flex-col items-center justify-center h-[160px] text-muted-foreground">
        <Target className="h-8 w-8 opacity-30 mb-2" />
        {!hasAnyTargets ? (
          <>
            <p className="text-sm">No daily targets configured</p>
            <p className="text-xs mt-1">Set targets in Forms → Daily Targets</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-status-success">🎉 All targets met today!</p>
            <p className="text-xs mt-1">Every collector has hit their daily target</p>
          </>
        )}
      </div>
    );
  }


  const totalTargets = groups.reduce((s, g) => s + g.forms.reduce((s2, f) => s2 + f.users.length, 0), 0);
  const metTargets = groups.reduce((s, g) => s + g.forms.reduce((s2, f) => s2 + f.users.filter(u => u.percentage >= 100).length, 0), 0);
  const overallPct = totalTargets > 0 ? Math.round((metTargets / totalTargets) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm sm:text-base flex items-center gap-2 font-semibold text-foreground">
          <Target className="h-4 w-4 text-primary" />
          Daily Target Achievement
        </h3>
        <Badge
          variant="outline"
          className={`text-[10px] h-5 ${overallPct >= 80 ? "border-status-success/50 text-status-success" : overallPct >= 50 ? "border-status-warning/50 text-status-warning" : "border-status-danger/50 text-status-danger"}`}
        >
          {metTargets}/{totalTargets} met ({overallPct}%)
        </Badge>
      </div>

      <div className="space-y-2 max-h-[300px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {groups.map(pg => {
          const isExpanded = expandedProject === pg.projectId;
          const pgMet = pg.forms.reduce((s, f) => s + f.users.filter(u => u.percentage >= 100).length, 0);
          const pgTotal = pg.forms.reduce((s, f) => s + f.users.length, 0);

          return (
            <div key={pg.projectId} className="border border-border rounded-lg overflow-hidden">
              <div
                className="flex items-center gap-2 px-3 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedProject(isExpanded ? null : pg.projectId)}
              >
                {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="text-xs font-semibold text-foreground flex-1 truncate">{pg.projectName}</span>
                <span className="text-[10px] text-muted-foreground">{pgMet}/{pgTotal} met</span>
              </div>
              {isExpanded && (
                <div className="px-3 py-2 space-y-3">
                  {pg.forms.map(fg => (
                    <div key={fg.formId}>
                      <p className="text-[11px] font-medium text-muted-foreground mb-1.5">{fg.formName}</p>
                      <div className="space-y-1.5">
                        {fg.users.map(u => (
                          <div key={`${u.userId}-${u.formId}`} className="flex items-center gap-2">
                            {u.percentage >= 100
                              ? <CheckCircle className="h-3 w-3 text-status-success flex-shrink-0" />
                              : u.percentage >= 50
                                ? <Target className="h-3 w-3 text-status-warning flex-shrink-0" />
                                : <AlertTriangle className="h-3 w-3 text-status-danger flex-shrink-0" />
                            }
                            <span className="text-xs text-foreground truncate w-24">{u.userName}</span>
                            <Progress value={Math.min(u.percentage, 100)} className="flex-1 h-2" />
                            <span className={`text-[10px] font-mono w-16 text-right ${u.percentage >= 100 ? "text-status-success" : u.percentage >= 50 ? "text-status-warning" : "text-status-danger"}`}>
                              {u.achieved}/{u.target} ({u.percentage}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DailyTargetAchievementWidget;
