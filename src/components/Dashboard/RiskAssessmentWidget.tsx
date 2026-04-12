import { useState, useEffect } from "react";
import { ShieldAlert, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface RiskEntry {
  location: string;
  state: string;
  riskScore: number;
  riskLevel: "High" | "Moderate" | "Low";
  submissions: number;
  trend: "up" | "down" | "stable";
}

const RiskBadge = ({ level }: { level: string }) => {
  const colors = {
    High: "text-red-500 font-bold",
    Moderate: "text-amber-500 font-semibold",
    Low: "text-emerald-500 font-medium",
  };
  return <span className={`text-xs ${colors[level as keyof typeof colors] || "text-muted-foreground"}`}>{level}</span>;
};

const TrendIcon = ({ trend }: { trend: string }) => {
  if (trend === "up") return <TrendingUp className="h-3 w-3 text-red-400" />;
  if (trend === "down") return <TrendingDown className="h-3 w-3 text-emerald-400" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
};

const RiskBar = ({ score }: { score: number }) => {
  const segments = 10;
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: segments }).map((_, i) => {
        const filled = i < Math.ceil(score / 10);
        const color = score >= 70 ? "bg-red-500" : score >= 40 ? "bg-amber-500" : "bg-emerald-500";
        return (
          <div key={i} className={`h-2.5 w-2 rounded-sm ${filled ? color : "bg-muted"}`} />
        );
      })}
    </div>
  );
};

const RiskAssessmentWidget = () => {
  const [risks, setRisks] = useState<RiskEntry[]>([]);

  useEffect(() => {
    fetchRiskData();
    const channel = supabase
      .channel("dss-risk-assessment")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, fetchRiskData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchRiskData = async () => {
    try {
      const { data: submissions } = await supabase
        .from("form_submissions")
        .select("data, within_geofence, created_at")
        .limit(1000);

      if (!submissions) return;

      // Analyze by LGA/state
      const locationMap: Record<string, { 
        state: string; total: number; violations: number; recentCount: number; priorCount: number;
      }> = {};

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

      submissions.forEach((s: any) => {
        const d = s.data as Record<string, any>;
        if (!d) return;
        const lga = d.lga || d.LGA || d.local_government || d.district;
        const state = d.state || d.State || d.location_state || "Unknown";
        if (!lga || typeof lga !== "string") return;

        const key = lga.trim();
        if (!locationMap[key]) locationMap[key] = { state: typeof state === "string" ? state : "Unknown", total: 0, violations: 0, recentCount: 0, priorCount: 0 };
        locationMap[key].total++;
        if (s.within_geofence === false) locationMap[key].violations++;
        
        const created = new Date(s.created_at);
        if (created >= weekAgo) locationMap[key].recentCount++;
        else if (created >= twoWeeksAgo) locationMap[key].priorCount++;
      });

      const riskEntries: RiskEntry[] = Object.entries(locationMap)
        .filter(([_, v]) => v.total >= 2)
        .map(([location, v]) => {
          // Risk score based on violation rate + reporting drop
          const violationRate = v.total > 0 ? (v.violations / v.total) * 100 : 0;
          const reportingTrend = v.priorCount > 0 ? (v.recentCount / v.priorCount) : 1;
          const dropPenalty = reportingTrend < 0.5 ? 30 : reportingTrend < 0.8 ? 15 : 0;
          const riskScore = Math.min(100, Math.round(violationRate * 0.7 + dropPenalty));
          
          return {
            location,
            state: v.state,
            riskScore,
            riskLevel: riskScore >= 70 ? "High" as const : riskScore >= 40 ? "Moderate" as const : "Low" as const,
            submissions: v.total,
            trend: reportingTrend < 0.8 ? "up" as const : reportingTrend > 1.2 ? "down" as const : "stable" as const,
          };
        })
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 6);

      setRisks(riskEntries);
    } catch (err) {
      console.error("Risk assessment error:", err);
    }
  };

  return (
    <Card className="border border-border/30 shadow-card bg-card/95 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-sm sm:text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-500" />
          Risk Assessment
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {risks.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No risk data available yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">LGA</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">State</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Risk Level</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((r) => (
                  <tr key={r.location} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <RiskBar score={r.riskScore} />
                        <span className="font-medium truncate max-w-[80px]">{r.location}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.state}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="font-bold text-foreground">{r.riskScore}</span>
                        <RiskBadge level={r.riskLevel} />
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

export default RiskAssessmentWidget;
