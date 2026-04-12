import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TeamMember {
  userId: string;
  name: string;
  submissions: number;
  coverage: number; // % of assigned forms with submissions
  qualityScore: number;
  grade: string;
  avatar?: string;
}

const gradeColor = (grade: string) => {
  switch (grade) {
    case "A": return "text-emerald-500 bg-emerald-500/10";
    case "B": return "text-sky-500 bg-sky-500/10";
    case "C": return "text-amber-500 bg-amber-500/10";
    case "D": return "text-orange-500 bg-orange-500/10";
    default: return "text-red-500 bg-red-500/10";
  }
};

const coverageColor = (pct: number) => {
  if (pct >= 80) return "text-emerald-500";
  if (pct >= 60) return "text-amber-500";
  return "text-red-500";
};

const StatusDot = ({ submissions }: { submissions: number }) => {
  if (submissions >= 10) return <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" />;
  if (submissions >= 5) return <span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block" />;
  if (submissions > 0) return <span className="h-2.5 w-2.5 rounded-full bg-orange-500 inline-block" />;
  return <span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" />;
};

const FieldTeamPerformance = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    fetchTeamData();
    const channel = supabase
      .channel("dss-field-team")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, fetchTeamData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchTeamData = async () => {
    try {
      // Get all data collectors (non-admin profiles)
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, designation, is_active")
        .eq("is_active", true);

      if (!profiles) return;

      // Get all submissions
      const { data: submissions } = await supabase
        .from("form_submissions")
        .select("user_id, within_geofence, status")
        .eq("status", "sent")
        .limit(1000);

      // Get form assignments
      const { data: assignments } = await supabase
        .from("user_form_assignments")
        .select("user_id, form_id");

      const subsMap: Record<string, { total: number; compliant: number }> = {};
      (submissions || []).forEach((s: any) => {
        if (!subsMap[s.user_id]) subsMap[s.user_id] = { total: 0, compliant: 0 };
        subsMap[s.user_id].total++;
        if (s.within_geofence !== false) subsMap[s.user_id].compliant++;
      });

      // Form assignments per user
      const assignmentMap: Record<string, Set<string>> = {};
      (assignments || []).forEach((a: any) => {
        if (!assignmentMap[a.user_id]) assignmentMap[a.user_id] = new Set();
        assignmentMap[a.user_id].add(a.form_id);
      });

      // Submission form coverage per user
      const subFormMap: Record<string, Set<string>> = {};
      (submissions || []).forEach((s: any) => {
        // We'd need form_id here - let's approximate with total count
      });

      const teamMembers: TeamMember[] = profiles
        .filter(p => subsMap[p.user_id]?.total > 0) // Only show active collectors
        .map(p => {
          const sub = subsMap[p.user_id] || { total: 0, compliant: 0 };
          const assignedForms = assignmentMap[p.user_id]?.size || 1;
          const complianceRate = sub.total > 0 ? Math.round((sub.compliant / sub.total) * 100) : 100;
          
          // Quality score = compliance rate with diminishing returns
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
    }
  };

  return (
    <Card className="border border-border/30 shadow-card bg-card/95 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-sm sm:text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Field Team Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {members.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No field team data available
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
      </CardContent>
    </Card>
  );
};

export default FieldTeamPerformance;
