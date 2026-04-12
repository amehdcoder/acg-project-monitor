import { useState, useEffect, useCallback } from "react";
import { ShieldAlert, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { supabase } from "@/integrations/supabase/client";

interface RiskEntry {
  location: string;
  state: string;
  riskScore: number;
  riskLevel: "High" | "Moderate" | "Low";
  submissions: number;
  trend: "up" | "down" | "stable";
  factors: string[];
}

interface RiskSummary {
  highCount: number;
  moderateCount: number;
  lowCount: number;
  avgScore: number;
}

const RiskBadge = ({ level }: { level: string }) => {
  const config: Record<string, { bg: string; text: string }> = {
    High: { bg: "bg-red-500/15", text: "text-red-500" },
    Moderate: { bg: "bg-amber-500/15", text: "text-amber-500" },
    Low: { bg: "bg-emerald-500/15", text: "text-emerald-500" },
  };
  const c = config[level] || { bg: "bg-muted", text: "text-muted-foreground" };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}>
      {level}
    </span>
  );
};

const TrendIcon = ({ trend }: { trend: string }) => {
  if (trend === "up") return <TrendingUp className="h-3 w-3 text-red-400" />;
  if (trend === "down") return <TrendingDown className="h-3 w-3 text-emerald-400" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
};

const RiskBar = ({ score }: { score: number }) => (
  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
    <div
      className={`h-full rounded-full transition-all ${
        score >= 70 ? "bg-red-500" : score >= 40 ? "bg-amber-500" : "bg-emerald-500"
      }`}
      style={{ width: `${score}%` }}
    />
  </div>
);

const extractFromData = (d: Record<string, any>, patterns: string[]): string | null => {
  if (!d || typeof d !== "object") return null;
  for (const key of Object.keys(d)) {
    const lower = key.toLowerCase();
    for (const pattern of patterns) {
      if (lower.includes(pattern)) {
        const val = d[key];
        if (typeof val === "string" && val.trim()) return val.trim();
      }
    }
  }
  return null;
};

const RiskAssessmentWidget = () => {
  const [risks, setRisks] = useState<RiskEntry[]>([]);
  const [summary, setSummary] = useState<RiskSummary>({ highCount: 0, moderateCount: 0, lowCount: 0, avgScore: 0 });

  const fetchRiskData = useCallback(async () => {
    try {
      // Fetch submissions and profiles in parallel
      const [subsRes, profilesRes, qualityRes] = await Promise.all([
        supabase
          .from("form_submissions")
          .select("user_id, data, within_geofence, created_at, status, synced_at")
          .limit(1000),
        supabase
          .from("profiles")
          .select("user_id, state, lga")
          .not("state", "is", null),
        supabase
          .from("data_quality_issues")
          .select("form_id, severity, status")
          .eq("status", "open"),
      ]);

      const submissions = subsRes.data || [];
      if (submissions.length === 0) return;

      // Build profile lookup
      const profileMap = new Map<string, { state: string; lga: string }>();
      (profilesRes.data || []).forEach((p: any) => {
        if (p.state) profileMap.set(p.user_id, { state: p.state, lga: p.lga || "Unknown" });
      });

      // Count open quality issues per form
      const qualityIssueMap = new Map<string, number>();
      (qualityRes.data || []).forEach((q: any) => {
        qualityIssueMap.set(q.form_id, (qualityIssueMap.get(q.form_id) || 0) + 1);
      });

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

      // Aggregate by state (primary) with LGA detail
      const stateMap: Record<string, {
        lgas: Set<string>;
        total: number;
        violations: number;
        recentCount: number;
        priorCount: number;
        unsyncedCount: number;
        draftCount: number;
      }> = {};

      submissions.forEach((s: any) => {
        const d = s.data as Record<string, any>;
        // Extract state from data or profile
        let state = extractFromData(d, ["state", "province", "region"]);
        let lga = extractFromData(d, ["lga", "local_government", "district", "area_council"]);

        if (!state) {
          const profile = profileMap.get(s.user_id);
          if (profile) {
            state = profile.state;
            if (!lga) lga = profile.lga;
          }
        }

        if (!state) return;
        const stateKey = state.trim();

        if (!stateMap[stateKey]) {
          stateMap[stateKey] = { lgas: new Set(), total: 0, violations: 0, recentCount: 0, priorCount: 0, unsyncedCount: 0, draftCount: 0 };
        }

        const entry = stateMap[stateKey];
        if (lga) entry.lgas.add(lga.trim());
        entry.total++;
        if (s.within_geofence === false) entry.violations++;
        if (!s.synced_at) entry.unsyncedCount++;
        if (s.status === "draft") entry.draftCount++;

        const created = new Date(s.created_at);
        if (created >= weekAgo) entry.recentCount++;
        else if (created >= twoWeeksAgo) entry.priorCount++;
      });

      const riskEntries: RiskEntry[] = Object.entries(stateMap)
        .map(([state, v]) => {
          const factors: string[] = [];

          // Factor 1: Geofence violation rate (0-40 pts)
          const violationRate = v.total > 0 ? (v.violations / v.total) * 100 : 0;
          const violationScore = Math.min(40, Math.round(violationRate * 0.4));
          if (violationRate > 10) factors.push(`${Math.round(violationRate)}% geofence violations`);

          // Factor 2: Reporting trend drop (0-25 pts)
          const reportingTrend = v.priorCount > 0 ? (v.recentCount / v.priorCount) : 1;
          const trendScore = reportingTrend < 0.3 ? 25 : reportingTrend < 0.5 ? 20 : reportingTrend < 0.8 ? 10 : 0;
          if (reportingTrend < 0.8 && v.priorCount > 0) factors.push("Declining submissions");

          // Factor 3: Unsynced / draft rate (0-20 pts)
          const unsyncedRate = v.total > 0 ? ((v.unsyncedCount + v.draftCount) / v.total) * 100 : 0;
          const syncScore = Math.min(20, Math.round(unsyncedRate * 0.2));
          if (unsyncedRate > 30) factors.push(`${Math.round(unsyncedRate)}% unsynced`);

          // Factor 4: Low volume (0-15 pts)
          const volumeScore = v.total < 3 ? 15 : v.total < 5 ? 8 : 0;
          if (v.total < 5) factors.push("Low submission volume");

          const riskScore = Math.min(100, violationScore + trendScore + syncScore + volumeScore);

          if (factors.length === 0) factors.push("Within acceptable thresholds");

          return {
            location: `${v.lgas.size} LGA${v.lgas.size !== 1 ? "s" : ""}`,
            state,
            riskScore,
            riskLevel: riskScore >= 70 ? "High" as const : riskScore >= 40 ? "Moderate" as const : "Low" as const,
            submissions: v.total,
            trend: reportingTrend < 0.8 ? "up" as const : reportingTrend > 1.2 ? "down" as const : "stable" as const,
            factors,
          };
        })
        .sort((a, b) => b.riskScore - a.riskScore);

      setRisks(riskEntries);

      const high = riskEntries.filter(r => r.riskLevel === "High").length;
      const moderate = riskEntries.filter(r => r.riskLevel === "Moderate").length;
      const low = riskEntries.filter(r => r.riskLevel === "Low").length;
      const avg = riskEntries.length > 0 ? Math.round(riskEntries.reduce((a, b) => a + b.riskScore, 0) / riskEntries.length) : 0;
      setSummary({ highCount: high, moderateCount: moderate, lowCount: low, avgScore: avg });
    } catch (err) {
      console.error("Risk assessment error:", err);
    }
  }, []);

  useEffect(() => {
    fetchRiskData();
    const channel = supabase
      .channel("dss-risk-assessment-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, fetchRiskData)
      .on("postgres_changes", { event: "*", schema: "public", table: "data_quality_issues" }, fetchRiskData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRiskData]);

  const overallColor = summary.avgScore >= 70
    ? "text-red-500"
    : summary.avgScore >= 40
      ? "text-amber-500"
      : "text-emerald-500";

  return (
    <Card className="border border-border/30 shadow-card bg-card/95 backdrop-blur-sm h-full flex flex-col">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-sm sm:text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            Risk Assessment
          </CardTitle>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] text-muted-foreground font-medium">Live</span>
          </div>
        </div>
        {/* Summary strip */}
        {risks.length > 0 && (
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-red-500" />
              <span className="text-xs font-bold text-red-500">{summary.highCount}</span>
              <span className="text-[10px] text-muted-foreground">High</span>
            </div>
            <div className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-500" />
              <span className="text-xs font-bold text-amber-500">{summary.moderateCount}</span>
              <span className="text-[10px] text-muted-foreground">Mod</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              <span className="text-xs font-bold text-emerald-500">{summary.lowCount}</span>
              <span className="text-[10px] text-muted-foreground">Low</span>
            </div>
            <div className="ml-auto">
              <span className={`text-xs font-bold ${overallColor}`}>Avg: {summary.avgScore}</span>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0 overflow-auto">
        {risks.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <ShieldAlert className="h-8 w-8 text-muted-foreground/30" />
            <p>No risk data available yet</p>
            <p className="text-[10px]">Risk scores will appear once submissions are recorded</p>
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {risks.map((r) => (
              <div key={r.state} className="px-3 py-2.5 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-xs truncate">{r.state}</span>
                    <span className="text-[10px] text-muted-foreground">{r.location}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <TrendIcon trend={r.trend} />
                    <span className="text-xs font-bold">{r.riskScore}</span>
                    <RiskBadge level={r.riskLevel} />
                  </div>
                </div>
                <RiskBar score={r.riskScore} />
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-muted-foreground">{r.submissions} submissions</span>
                  <span className="text-[10px] text-muted-foreground/50">•</span>
                  <span className="text-[10px] text-muted-foreground truncate">{r.factors[0]}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RiskAssessmentWidget;
