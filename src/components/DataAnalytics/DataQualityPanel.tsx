import { useState } from "react";
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Search,
  Copy,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useDataQuality, DataQualityFinding } from "@/hooks/useDataQuality";

interface Props {
  formId: string;
  formName: string;
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", badge: "destructive" as const },
  warning: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-500/10", badge: "secondary" as const },
  info: { icon: Info, color: "text-blue-600", bg: "bg-blue-500/10", badge: "outline" as const },
};

const TYPE_LABELS = {
  duplicate: "Duplicate",
  anomaly: "Anomaly",
  validation_suggestion: "Validation",
  outlier: "Outlier",
  pattern: "Pattern",
};

const DataQualityPanel = ({ formId, formName }: Props) => {
  const { report, isAnalyzing, lastAnalyzed, analyzeSubmissions, clearReport } = useDataQuality();
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());

  const toggleFinding = (id: string) => {
    setExpandedFindings(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 70) return "text-amber-600";
    return "text-destructive";
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-acg-gold" />
            AI Data Quality
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => analyzeSubmissions(formId, "detect_duplicates")}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
              Duplicates
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => analyzeSubmissions(formId, "detect_anomalies")}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1.5 h-3.5 w-3.5" />}
              Anomalies
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => analyzeSubmissions(formId, "suggest_validations")}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Shield className="mr-1.5 h-3.5 w-3.5" />}
              Validations
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isAnalyzing && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">AI is analyzing your data...</p>
          </div>
        )}

        {!isAnalyzing && !report && (
          <div className="text-center py-8">
            <Sparkles className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-medium text-foreground">No analysis run yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click one of the buttons above to analyze submissions for "{formName}"
            </p>
          </div>
        )}

        {!isAnalyzing && report && (
          <div className="space-y-4">
            {/* Quality Score */}
            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
              <div className="text-center">
                <p className={`font-display text-3xl font-bold ${scoreColor(report.summary.data_quality_score)}`}>
                  {report.summary.data_quality_score}
                </p>
                <p className="text-xs text-muted-foreground">Quality Score</p>
              </div>
              <div className="flex-1">
                <Progress value={report.summary.data_quality_score} className="h-2 mb-2" />
                <div className="flex gap-3 text-xs">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-destructive" />
                    {report.summary.critical_count} critical
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    {report.summary.warning_count} warnings
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    {report.summary.total_issues - report.summary.critical_count - report.summary.warning_count} info
                  </span>
                </div>
              </div>
            </div>

            {/* Recommendation */}
            <div className="p-3 rounded-lg border border-border bg-card">
              <p className="text-sm text-foreground">
                <strong>Recommendation:</strong> {report.summary.recommendation}
              </p>
            </div>

            {/* Findings */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Findings ({report.findings.length})
              </p>
              {report.findings.map((finding) => {
                const config = SEVERITY_CONFIG[finding.severity];
                const isExpanded = expandedFindings.has(finding.id);

                return (
                  <Collapsible key={finding.id} open={isExpanded} onOpenChange={() => toggleFinding(finding.id)}>
                    <CollapsibleTrigger asChild>
                      <button className={`w-full flex items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted/50 ${config.bg}`}>
                        <config.icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-foreground">{finding.title}</span>
                            <Badge variant={config.badge} className="text-[10px] px-1.5 py-0 h-4">
                              {TYPE_LABELS[finding.type]}
                            </Badge>
                          </div>
                          {!isExpanded && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{finding.description}</p>
                          )}
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0 mt-0.5" /> : <ChevronDown className="h-4 w-4 shrink-0 mt-0.5" />}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="pl-10 pr-3 pb-3 space-y-2">
                        <p className="text-sm text-muted-foreground">{finding.description}</p>
                        {finding.field_name && (
                          <p className="text-xs"><strong>Field:</strong> {finding.field_name}</p>
                        )}
                        {finding.affected_submissions && finding.affected_submissions.length > 0 && (
                          <p className="text-xs"><strong>Affected:</strong> {finding.affected_submissions.length} submission(s)</p>
                        )}
                        <div className="p-2 rounded bg-primary/5 border border-primary/10">
                          <p className="text-xs text-foreground">
                            <strong>Action:</strong> {finding.recommended_action}
                          </p>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}

              {report.findings.length === 0 && (
                <div className="text-center py-6">
                  <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <p className="text-sm font-medium">No issues found</p>
                  <p className="text-xs text-muted-foreground">Your data looks clean!</p>
                </div>
              )}
            </div>

            {/* Meta */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
              <span>Analyzed: {lastAnalyzed?.toLocaleTimeString()}</span>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={clearReport}>
                Clear
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DataQualityPanel;
