import { useState, useEffect } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TeamMember {
  userId: string;
  name: string;
  submissions: number;
  coverage: number;
  qualityScore: number;
  grade: string;
}

const gradeColor = (grade: string) => {
  switch (grade) {
    case "A": return "text-status-success bg-status-success/10";
    case "B": return "text-status-info bg-status-info/10";
    case "C": return "text-status-warning bg-status-warning/10";
    case "D": return "text-chart-highlight bg-chart-highlight/10";
    default: return "text-status-danger bg-status-danger/10";
  }
};

const coverageColor = (pct: number) => {
  if (pct >= 80) return "text-status-success";
  if (pct >= 60) return "text-status-warning";
  return "text-status-danger";
};

const StatusDot = ({ submissions }: { submissions: number }) => {
  if (submissions >= 10) return <span className="h-2.5 w-2.5 rounded-full bg-status-success inline-block" />;
  if (submissions >= 5) return <span className="h-2.5 w-2.5 rounded-full bg-status-warning inline-block" />;
  if (submissions > 0) return <span className="h-2.5 w-2.5 rounded-full bg-chart-highlight inline-block" />;
  return <span className="h-2.5 w-2.5 rounded-full bg-status-danger inline-block" />;
};

interface FieldTeamPerformanceProps {
  selectedProjectId?: string | null;
}

const FieldTeamPerformance = ({ selectedProjectId }: FieldTeamPerformanceProps) => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeamData();
    const channel = supabase
      .channel("dss-field-team")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, fetchTeamData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedProjectId]);

  const fetchTeamData = async () => {
    try {
      const [profilesRes, submissionsRes, assignmentsRes, formsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, first_name, last_name, designation, is_active").eq("is_active", true),
        supabase.from("form_submissions").select("user_id, within_geofence, status, form_id").eq("status", "sent").limit(1000),
        supabase.from("user_form_assignments").select("user_id, form_id"),
        supabase.from("forms").select("id, project_id"),
      ]);

      let filteredSubs = submissionsRes.data || [];
      if (selectedProjectId) {
        const projectFormIds = new Set((formsRes.data || []).filter((f: any) => f.project_id === selectedProjectId).map((f: any) => f.id));
        filteredSubs = filteredSubs.filter((s: any) => projectFormIds.has(s.form_id));
      }

      const profiles = profilesRes.data;
      if (!profiles) return;

      const subsMap: Record<string, { total: number; compliant: number }> = {};
      (submissionsRes.data || []).forEach((s: any) => {
        if (!subsMap[s.user_id]) subsMap[s.user_id] = { total: 0, compliant: 0 };
        subsMap[s.user_id].total++;
        if (s.within_geofence !== false) subsMap[s.user_id].compliant++;
      });

      const assignmentMap: Record<string, Set<string>> = {};
      (assignmentsRes.data || []).forEach((a: any) => {
        if (!assignmentMap[a.user_id]) assignmentMap[a.user_id] = new Set();
        assignmentMap[a.user_id].add(a.form_id);
      });

      const teamMembers: TeamMember[] = profiles
        .filter(p => subsMap[p.user_id]?.total > 0)
        .map(p => {
          const sub = subsMap[p.user_id] || { total: 0, compliant: 0 };
          const complianceRate = sub.total > 0 ? Math.round((sub.compliant / sub.total) * 100) : 100;
          const qualityScore = Math.round(complianceRate * 0.6 + Math.min(sub.total, 50) * 0.8);
          let grade = "F";
          if (qualityScore >= 85) grade = "A";
          else if (qualityScore >= 70) grade = "B";
          else if (qualityScore >= 55) grade = "C";
          else if (qualityScore >= 40) grade = "D";

          return {
            userId: p.user_id,
            name: `${p.first_name} ${p.last_name}`.trim() || "Unknown",
            submissions: sub.total,
            coverage: complianceRate,
            qualityScore: Math.min(qualityScore, 100),
            grade,
          };
        })
        .sort((a, b) => b.qualityScore - a.qualityScore)
        .slice(0, 8);

      setMembers(teamMembers);
    } catch (err) {
      console.error("Field team perf error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-48" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="px-3 pt-3 pb-2">
        <h3 className="font-display text-sm sm:text-base flex items-center gap-2 font-semibold text-foreground">
          <Users className="h-4 w-4 text-status-warning" />
          Field Team Performance
        </h3>
      </div>
      {members.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
          <Users className="h-8 w-8 opacity-30" />
          <p>No field team data available</p>
          <p className="text-[10px]">Performance data appears once collectors submit forms</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Collector</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Submissions</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Coverage</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Quality Score</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <StatusDot submissions={m.submissions} />
                      <span className="font-medium truncate max-w-[100px] sm:max-w-[140px]">{m.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold">{m.submissions}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${coverageColor(m.coverage)}`}>
                    {m.coverage}%
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="font-bold">{m.qualityScore}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${gradeColor(m.grade)}`}>
                        {m.grade}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default FieldTeamPerformance;
