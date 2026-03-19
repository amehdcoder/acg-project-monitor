import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { isAiCreditError, localDataQualityCheck, AI_CREDIT_TOAST } from "@/lib/aiCreditFallback";

export interface DataQualityFinding {
  id: string;
  type: "duplicate" | "anomaly" | "validation_suggestion" | "outlier" | "pattern";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  affected_submissions?: string[];
  field_name?: string;
  recommended_action: string;
}

export interface DataQualitySummary {
  total_issues: number;
  critical_count: number;
  warning_count: number;
  data_quality_score: number;
  recommendation: string;
}

export interface DataQualityReport {
  findings: DataQualityFinding[];
  summary: DataQualitySummary;
}

export function useDataQuality() {
  const [report, setReport] = useState<DataQualityReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null);

  const analyzeSubmissions = useCallback(async (formId: string, action: "detect_duplicates" | "detect_anomalies" | "suggest_validations" | "full_analysis") => {
    setIsAnalyzing(true);
    try {
      const { data: submissions, error } = await supabase
        .from("form_submissions")
        .select("id, user_id, data, submitted_at, created_at, location, within_geofence, submission_type")
        .eq("form_id", formId)
        .eq("status", "sent")
        .order("submitted_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      if (!submissions || submissions.length === 0) {
        toast({ title: "No Data", description: "No submissions found to analyze." });
        setIsAnalyzing(false);
        return;
      }

      const { data: result, error: fnError } = await supabase.functions.invoke("data-quality-check", {
        body: { submissions, action },
      });

      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);

      setReport(result as DataQualityReport);
      setLastAnalyzed(new Date());
      toast({
        title: "Analysis Complete",
        description: `Found ${result.summary.total_issues} issue(s). Quality score: ${result.summary.data_quality_score}/100`,
      });
    } catch (err: any) {
      console.error("Data quality analysis error:", err);
      toast({
        title: "Analysis Failed",
        description: err.message || "Failed to analyze data quality",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const clearReport = useCallback(() => {
    setReport(null);
    setLastAnalyzed(null);
  }, []);

  return {
    report,
    isAnalyzing,
    lastAnalyzed,
    analyzeSubmissions,
    clearReport,
  };
}
