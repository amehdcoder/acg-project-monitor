import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TeamMember {
  userId: string;
  name: string;
  submissions: number;
  coverage: number;
  qualityScore: number;
  grade: string;
  reasons: string[];
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
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

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
      // Resolve the form-id filter for the selected project up-front so we can
      // push it down into the submissions query (rather than fetching 1000 rows
      // globally and filtering in memory, which under-counts large datasets).
      let projectFormIdList: string[] | null = null;
      if (selectedProjectId) {
        const { data: pForms } = await supabase
          .from("forms").select("id").eq("project_id", selectedProjectId);
        projectFormIdList = (pForms || []).map((f: any) => f.id);
        if (projectFormIdList.length === 0) {
          setMembers([]); setLoading(false); return;
        }
      }

      let subsQuery = supabase
        .from("form_submissions")
        .select("user_id, within_geofence, status, form_id")
        .eq("status", "sent");
      if (projectFormIdList) subsQuery = subsQuery.in("form_id", projectFormIdList);

      const [profilesRes, submissionsRes, assignmentsRes, formsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, first_name, last_name, designation, is_active").eq("is_active", true),
        subsQuery,
        supabase.from("user_form_assignments").select("user_id, form_id"),
        supabase.from("forms").select("id, project_id"),
      ]);

      const filteredSubs = submissionsRes.data || [];

      const profiles = profilesRes.data;
      if (!profiles) return;

      const subsMap: Record<string, { total: number; compliant: number; geofenceTotal: number }> = {};
      filteredSubs.forEach((s: any) => {
        if (!subsMap[s.user_id]) subsMap[s.user_id] = { total: 0, compliant: 0, geofenceTotal: 0 };
        subsMap[s.user_id].total++;
        if (s.within_geofence !== null) {
          subsMap[s.user_id].geofenceTotal++;
          if (s.within_geofence === true) subsMap[s.user_id].compliant++;
        }
      });

      const teamMembers: TeamMember[] = profiles
        .filter(p => subsMap[p.user_id]?.total > 0)
        .map(p => {
          const sub = subsMap[p.user_id] || { total: 0, compliant: 0, geofenceTotal: 0 };
          const hasGeofence = sub.geofenceTotal > 0;
          const complianceRate = hasGeofence
            ? Math.round((sub.compliant / sub.geofenceTotal) * 100)
            : 100; // no geofence = neutral

          // Quality score = 60% compliance + 40% volume (capped at 50 subs)
          const compliancePoints = complianceRate * 0.6;
          const volumePoints = Math.min(sub.total, 50) * 0.8;
          const qualityScore = Math.min(Math.round(compliancePoints + volumePoints), 100);

          // Build reasons
          const reasons: string[] = [];
          reasons.push(`📊 Submissions: ${sub.total} (volume score: ${Math.round(volumePoints)}/40)`);
          if (hasGeofence) {
            reasons.push(`📍 Geofence compliance: ${complianceRate}% (${sub.compliant}/${sub.geofenceTotal}) → ${Math.round(compliancePoints)}/60 pts`);
          } else {
            reasons.push(`📍 No geofence configured → compliance neutral (60/60 pts)`);
          }
          if (sub.total >= 50) reasons.push("✅ Max volume cap reached (50+)");
          if (sub.total < 5) reasons.push("⚠️ Low submission count affects score");
          if (hasGeofence && complianceRate < 70) reasons.push("🔴 Geofence violations dragging score down");

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
            qualityScore,
            grade,
            reasons,
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
              <TooltipProvider>
                {members.map((m) => (
                  <>
                    <tr
                      key={m.userId}
                      className="border-b border-border/20 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setExpandedUser(expandedUser === m.userId ? null : m.userId)}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <StatusDot submissions={m.submissions} />
                          <span className="font-medium truncate max-w-[100px] sm:max-w-[140px]">{m.name}</span>
                          {expandedUser === m.userId
                            ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
                            : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold">{m.submissions}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${coverageColor(m.coverage)}`}>
                        {m.coverage}%
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="font-bold">{m.qualityScore}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${gradeColor(m.grade)}`}>
                                {m.grade}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-[250px]">
                            <p className="font-semibold text-xs mb-1">Score Breakdown</p>
                            {m.reasons.map((r, i) => (
                              <p key={i} className="text-[11px] leading-relaxed">{r}</p>
                            ))}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    </tr>
                    {expandedUser === m.userId && (
                      <tr key={`${m.userId}-details`}>
                        <td colSpan={4} className="px-3 pb-3 pt-1">
                          <div className="bg-muted/40 rounded-lg p-3 space-y-1.5">
                            <p className="text-[11px] font-semibold text-foreground">Quality Score Breakdown</p>
                            {m.reasons.map((r, i) => (
                              <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">{r}</p>
                            ))}
                            <div className="flex gap-2 mt-2">
                              <div className="flex-1 bg-background rounded p-2 text-center">
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Volume</p>
                                <p className="text-sm font-bold text-foreground">{Math.min(Math.round(Math.min(m.submissions, 50) * 0.8), 40)}/40</p>
                              </div>
                              <div className="flex-1 bg-background rounded p-2 text-center">
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Compliance</p>
                                <p className="text-sm font-bold text-foreground">{Math.round(m.coverage * 0.6)}/60</p>
                              </div>
                              <div className="flex-1 bg-background rounded p-2 text-center">
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Total</p>
                                <p className="text-sm font-bold text-foreground">{m.qualityScore}/100</p>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </TooltipProvider>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default FieldTeamPerformance;
