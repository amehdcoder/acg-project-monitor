import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { localDataQualityCheck } from "@/lib/aiCreditFallback";
import { toast } from "@/hooks/use-toast";

export interface QualityIndicator {
  id: string;
  form_id: string;
  project_id: string;
  completeness_score: number;
  accuracy_score: number;
  consistency_score: number;
  timeliness_score: number;
  overall_score: number;
  total_submissions: number;
  complete_submissions: number;
  incomplete_submissions: number;
  duplicate_count: number;
  anomaly_count: number;
  geofence_violations: number;
  rapid_fire_count: number;
  avg_completion_time_seconds: number;
  last_checked_at: string;
  checked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QualityIssue {
  id: string;
  form_id: string;
  project_id: string;
  submission_id: string | null;
  issue_type: string;
  severity: string;
  title: string;
  description: string;
  field_name: string | null;
  status: string;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  detected_at: string;
  created_at: string;
}

export function useDataQualityManagement() {
  const { user } = useAuth();
  const [indicators, setIndicators] = useState<QualityIndicator[]>([]);
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const fetchIndicators = useCallback(async () => {
    const { data, error } = await supabase
      .from("data_quality_indicators")
      .select("*")
      .order("last_checked_at", { ascending: false });
    if (!error && data) setIndicators(data as unknown as QualityIndicator[]);
  }, []);

  const fetchIssues = useCallback(async () => {
    const { data, error } = await supabase
      .from("data_quality_issues")
      .select("*")
      .order("detected_at", { ascending: false })
      .limit(200);
    if (!error && data) setIssues(data as unknown as QualityIssue[]);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchIndicators(), fetchIssues()]);
    setLoading(false);
  }, [fetchIndicators, fetchIssues]);

  useEffect(() => {
    if (user) loadAll();
  }, [user, loadAll]);

  // Realtime for issues
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("dq-issues-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "data_quality_issues" }, () => {
        fetchIssues();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchIssues]);

  const runFullScan = useCallback(async () => {
    if (!user) return;
    setScanning(true);
    try {
      // Get all active forms
      const { data: forms, error: fErr } = await supabase
        .from("forms")
        .select("id, name, project_id, questions")
        .eq("status", "active");
      if (fErr) throw fErr;
      if (!forms?.length) {
        toast({ title: "No Forms", description: "No active forms found to scan." });
        setScanning(false);
        return;
      }

      let totalIssuesFound = 0;

      for (const form of forms) {
        const { data: submissions, error: sErr } = await supabase
          .from("form_submissions")
          .select("id, user_id, data, submitted_at, created_at, location, within_geofence, status")
          .eq("form_id", form.id)
          .neq("status", "draft")
          .order("submitted_at", { ascending: false })
          .limit(500);

        if (sErr || !submissions?.length) continue;

        const questions = (form.questions as any[]) || [];
        const totalFields = questions.filter((q: any) => q.type !== "note" && q.type !== "calculate" && q.type !== "begin_group" && q.type !== "end_group" && q.type !== "begin_repeat" && q.type !== "end_repeat").length;

        // Calculate indicators
        let completeCount = 0;
        let incompleteCount = 0;
        let duplicateCount = 0;
        let anomalyCount = 0;
        let geofenceViolations = 0;
        let rapidFireCount = 0;
        const dataStrings: string[] = [];
        const byUser = new Map<string, any[]>();

        for (const sub of submissions) {
          const data = sub.data as Record<string, any> || {};
          const userFields = Object.keys(data).filter(k => !k.startsWith("_"));
          
          // Completeness
          if (totalFields > 0 && userFields.length >= totalFields * 0.8) {
            completeCount++;
          } else {
            incompleteCount++;
          }

          // Duplicates
          const dataStr = JSON.stringify(data);
          if (dataStrings.includes(dataStr)) duplicateCount++;
          dataStrings.push(dataStr);

          // Geofence violations
          if (sub.within_geofence === false) geofenceViolations++;

          // Group by user for rapid-fire
          if (!byUser.has(sub.user_id)) byUser.set(sub.user_id, []);
          byUser.get(sub.user_id)!.push(sub);

          // Empty data anomaly
          if (userFields.length < 2) anomalyCount++;
        }

        // Rapid-fire detection
        for (const [, userSubs] of byUser) {
          const sorted = userSubs.sort((a: any, b: any) => new Date(a.submitted_at || a.created_at).getTime() - new Date(b.submitted_at || b.created_at).getTime());
          for (let i = 1; i < sorted.length; i++) {
            const diff = new Date(sorted[i].submitted_at || sorted[i].created_at).getTime() - new Date(sorted[i - 1].submitted_at || sorted[i - 1].created_at).getTime();
            if (diff < 60000) rapidFireCount++;
          }
        }

        const total = submissions.length;
        const completeness = total > 0 ? Math.round((completeCount / total) * 100) : 100;
        const accuracy = total > 0 ? Math.max(0, Math.round(100 - (anomalyCount / total) * 100)) : 100;
        const consistency = total > 0 ? Math.max(0, Math.round(100 - (duplicateCount / total) * 100)) : 100;
        const timeliness = total > 0 ? Math.max(0, Math.round(100 - (rapidFireCount / total) * 100)) : 100;
        const overall = Math.round((completeness + accuracy + consistency + timeliness) / 4);

        // Upsert indicator
        const { data: existing } = await supabase
          .from("data_quality_indicators")
          .select("id")
          .eq("form_id", form.id)
          .limit(1);

        const indicatorData = {
          form_id: form.id,
          project_id: form.project_id,
          completeness_score: completeness,
          accuracy_score: accuracy,
          consistency_score: consistency,
          timeliness_score: timeliness,
          overall_score: overall,
          total_submissions: total,
          complete_submissions: completeCount,
          incomplete_submissions: incompleteCount,
          duplicate_count: duplicateCount,
          anomaly_count: anomalyCount,
          geofence_violations: geofenceViolations,
          rapid_fire_count: rapidFireCount,
          last_checked_at: new Date().toISOString(),
          checked_by: user.id,
          updated_at: new Date().toISOString(),
        };

        if (existing?.length) {
          await supabase.from("data_quality_indicators").update(indicatorData).eq("id", existing[0].id);
        } else {
          await supabase.from("data_quality_indicators").insert(indicatorData);
        }

        // Create issues for detected problems
        const newIssues: any[] = [];

        if (duplicateCount > 0) {
          newIssues.push({
            form_id: form.id, project_id: form.project_id,
            issue_type: "duplicate", severity: duplicateCount > 5 ? "critical" : "warning",
            title: `${duplicateCount} duplicate submissions in ${form.name}`,
            description: `Detected ${duplicateCount} exact duplicate data entries that may need review or removal.`,
            status: "open",
          });
          totalIssuesFound++;
        }

        if (geofenceViolations > 0) {
          newIssues.push({
            form_id: form.id, project_id: form.project_id,
            issue_type: "geofence_violation", severity: geofenceViolations > 10 ? "critical" : "warning",
            title: `${geofenceViolations} geofence violations in ${form.name}`,
            description: `${geofenceViolations} submissions were made outside the designated geofence area.`,
            status: "open",
          });
          totalIssuesFound++;
        }

        if (rapidFireCount > 0) {
          newIssues.push({
            form_id: form.id, project_id: form.project_id,
            issue_type: "rapid_fire", severity: rapidFireCount > 10 ? "critical" : "warning",
            title: `${rapidFireCount} rapid-fire submissions in ${form.name}`,
            description: `${rapidFireCount} submissions were made less than 60 seconds apart, suggesting possible data fabrication.`,
            status: "open",
          });
          totalIssuesFound++;
        }

        if (incompleteCount > total * 0.3) {
          newIssues.push({
            form_id: form.id, project_id: form.project_id,
            issue_type: "incomplete", severity: incompleteCount > total * 0.5 ? "critical" : "warning",
            title: `High incompleteness rate in ${form.name}`,
            description: `${incompleteCount} of ${total} submissions (${Math.round(incompleteCount / total * 100)}%) have significant missing data.`,
            status: "open",
          });
          totalIssuesFound++;
        }

        if (anomalyCount > 0) {
          newIssues.push({
            form_id: form.id, project_id: form.project_id,
            issue_type: "anomaly", severity: anomalyCount > 5 ? "critical" : "info",
            title: `${anomalyCount} data anomalies in ${form.name}`,
            description: `${anomalyCount} submissions contain very little data (fewer than 2 fields), suggesting empty or test entries.`,
            status: "open",
          });
          totalIssuesFound++;
        }

        if (newIssues.length > 0) {
          await supabase.from("data_quality_issues").insert(newIssues);
        }
      }

      await loadAll();
      toast({
        title: "Scan Complete",
        description: `Scanned ${forms.length} forms. Found ${totalIssuesFound} quality issues.`,
      });
    } catch (err: any) {
      console.error("Scan error:", err);
      toast({ title: "Scan Failed", description: err.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  }, [user, loadAll]);

  const resolveIssue = useCallback(async (issueId: string, resolution: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("data_quality_issues")
      .update({
        status: "resolved",
        resolution,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", issueId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Issue Resolved", description: "The quality issue has been marked as resolved." });
      fetchIssues();
    }
  }, [user, fetchIssues]);

  const dismissIssue = useCallback(async (issueId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("data_quality_issues")
      .update({ status: "dismissed", resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq("id", issueId);
    if (!error) {
      toast({ title: "Issue Dismissed" });
      fetchIssues();
    }
  }, [user, fetchIssues]);

  const triggerDataCleaning = useCallback(async (issueId: string, cleaningType: string) => {
    if (!user) return;
    const issue = issues.find(i => i.id === issueId);
    if (!issue) return;

    try {
      if (cleaningType === "remove_duplicates" && issue.form_id) {
        // Get all submissions for this form, find and mark duplicates
        const { data: subs } = await supabase
          .from("form_submissions")
          .select("id, data, submitted_at")
          .eq("form_id", issue.form_id)
          .eq("status", "sent")
          .order("submitted_at", { ascending: true });

        if (subs?.length) {
          const seen = new Set<string>();
          const duplicateIds: string[] = [];
          for (const sub of subs) {
            const key = JSON.stringify(sub.data);
            if (seen.has(key)) duplicateIds.push(sub.id);
            else seen.add(key);
          }

          if (duplicateIds.length > 0) {
            // Mark duplicates as draft (soft delete)
            for (const id of duplicateIds) {
              await supabase.from("form_submissions").update({ status: "draft" }).eq("id", id);
            }
            toast({ title: "Duplicates Cleaned", description: `${duplicateIds.length} duplicate submissions moved to draft status.` });
          }
        }
      } else if (cleaningType === "flag_anomalies" && issue.form_id) {
        // Flag anomalous submissions by adding metadata
        const { data: subs } = await supabase
          .from("form_submissions")
          .select("id, data")
          .eq("form_id", issue.form_id)
          .eq("status", "sent");

        if (subs?.length) {
          let flagged = 0;
          for (const sub of subs) {
            const data = sub.data as Record<string, any>;
            const fields = Object.keys(data).filter(k => !k.startsWith("_"));
            if (fields.length < 2) {
              await supabase.from("form_submissions")
                .update({ data: { ...data, _quality_flag: "anomaly_detected", _flagged_at: new Date().toISOString() } })
                .eq("id", sub.id);
              flagged++;
            }
          }
          toast({ title: "Anomalies Flagged", description: `${flagged} submissions flagged for review.` });
        }
      } else if (cleaningType === "flag_geofence_violations" && issue.form_id) {
        const { data: subs } = await supabase
          .from("form_submissions")
          .select("id, data")
          .eq("form_id", issue.form_id)
          .eq("within_geofence", false);

        if (subs?.length) {
          for (const sub of subs) {
            const data = sub.data as Record<string, any>;
            await supabase.from("form_submissions")
              .update({ data: { ...data, _quality_flag: "geofence_violation", _flagged_at: new Date().toISOString() } })
              .eq("id", sub.id);
          }
          toast({ title: "Geofence Violations Flagged", description: `${subs.length} submissions flagged.` });
        }
      }

      // Mark issue as resolved
      await resolveIssue(issueId, `Data cleaning applied: ${cleaningType}`);
    } catch (err: any) {
      toast({ title: "Cleaning Failed", description: err.message, variant: "destructive" });
    }
  }, [user, issues, resolveIssue]);

  const [aiSuggestions, setAiSuggestions] = useState<any | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  const runAiAnalysis = useCallback(async (formId: string, action: "detect_duplicates" | "detect_anomalies" | "suggest_validations" | "full_analysis" = "full_analysis") => {
    setAiAnalyzing(true);
    setAiSuggestions(null);
    try {
      const { data: submissions, error } = await supabase
        .from("form_submissions")
        .select("id, user_id, data, submitted_at, created_at, location, within_geofence, submission_type")
        .eq("form_id", formId)
        .eq("status", "sent")
        .order("submitted_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      if (!submissions?.length) {
        toast({ title: "No Data", description: "No submissions found to analyze." });
        setAiAnalyzing(false);
        return;
      }

      // Use local data quality check (no AI credits needed)
      const localResult = localDataQualityCheck(submissions);
      setAiSuggestions(localResult);
      toast({
        title: "Analysis Complete",
        description: `Found ${localResult.summary?.total_issues || 0} issues. Quality score: ${localResult.summary?.data_quality_score || "N/A"}/100`,
      });
    } catch (err: any) {
      console.error("AI analysis error:", err);
      toast({ title: "AI Analysis Failed", description: err.message, variant: "destructive" });
    } finally {
      setAiAnalyzing(false);
    }
  }, []);

  return {
    indicators,
    issues,
    loading,
    scanning,
    runFullScan,
    resolveIssue,
    dismissIssue,
    triggerDataCleaning,
    refresh: loadAll,
    aiSuggestions,
    aiAnalyzing,
    runAiAnalysis,
    clearAiSuggestions: () => setAiSuggestions(null),
  };
}
