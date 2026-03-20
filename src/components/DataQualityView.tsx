import { useState, useEffect } from "react";
import {
  Shield, AlertTriangle, CheckCircle, Loader2, Search, Trash2,
  RefreshCcw, BarChart3, Activity, Target, Clock, MapPin,
  Copy, Zap, FileWarning, ChevronDown, ChevronUp, Sparkles,
  Filter, ArrowUpDown, Eye, Wrench, BrainCircuit,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useDataQualityManagement, QualityIndicator, QualityIssue } from "@/hooks/useDataQualityManagement";
import { toast } from "@/hooks/use-toast";

const SEVERITY_CONFIG: Record<string, { icon: any; color: string; bg: string; badgeVariant: "destructive" | "secondary" | "outline" }> = {
  critical: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", badgeVariant: "destructive" },
  warning: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-500/10", badgeVariant: "secondary" },
  info: { icon: Eye, color: "text-blue-600", bg: "bg-blue-500/10", badgeVariant: "outline" },
};

const ISSUE_TYPE_ICONS: Record<string, any> = {
  duplicate: Copy,
  anomaly: Zap,
  geofence_violation: MapPin,
  rapid_fire: Clock,
  incomplete: FileWarning,
};

const CLEANING_ACTIONS: Record<string, { label: string; action: string; description: string }[]> = {
  duplicate: [
    { label: "Remove Duplicates", action: "remove_duplicates", description: "Move exact duplicate submissions to draft status" },
  ],
  anomaly: [
    { label: "Flag Anomalies", action: "flag_anomalies", description: "Add quality flags to submissions with very little data" },
  ],
  geofence_violation: [
    { label: "Flag Violations", action: "flag_geofence_violations", description: "Flag all submissions made outside geofence boundaries" },
  ],
  rapid_fire: [
    { label: "Flag Anomalies", action: "flag_anomalies", description: "Flag rapid-fire submissions for manual review" },
  ],
  incomplete: [
    { label: "Flag Anomalies", action: "flag_anomalies", description: "Flag incomplete submissions for review" },
  ],
};

const DataQualityView = () => {
  const {
    indicators, issues, loading, scanning,
    runFullScan, resolveIssue, dismissIssue, triggerDataCleaning, refresh,
  } = useDataQualityManagement();

  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("open");
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [resolveDialog, setResolveDialog] = useState<QualityIssue | null>(null);
  const [resolution, setResolution] = useState("");
  const [cleaningDialog, setCleaningDialog] = useState<QualityIssue | null>(null);
  const [formNames, setFormNames] = useState<Record<string, string>>({});
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});

  // Fetch form and project names
  useEffect(() => {
    const fetchNames = async () => {
      const { data: forms } = await supabase.from("forms").select("id, name");
      const { data: projects } = await supabase.from("projects").select("id, name");
      if (forms) setFormNames(Object.fromEntries(forms.map(f => [f.id, f.name])));
      if (projects) setProjectNames(Object.fromEntries(projects.map(p => [p.id, p.name])));
    };
    fetchNames();
  }, []);

  const filteredIssues = issues.filter(issue => {
    if (filterSeverity !== "all" && issue.severity !== filterSeverity) return false;
    if (filterStatus !== "all" && issue.status !== filterStatus) return false;
    if (filterType !== "all" && issue.issue_type !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return issue.title.toLowerCase().includes(q) || issue.description.toLowerCase().includes(q);
    }
    return true;
  });

  const openIssues = issues.filter(i => i.status === "open");
  const criticalIssues = openIssues.filter(i => i.severity === "critical");

  const avgOverall = indicators.length > 0
    ? Math.round(indicators.reduce((s, i) => s + Number(i.overall_score), 0) / indicators.length)
    : 0;
  const avgCompleteness = indicators.length > 0
    ? Math.round(indicators.reduce((s, i) => s + Number(i.completeness_score), 0) / indicators.length)
    : 0;
  const avgAccuracy = indicators.length > 0
    ? Math.round(indicators.reduce((s, i) => s + Number(i.accuracy_score), 0) / indicators.length)
    : 0;
  const avgConsistency = indicators.length > 0
    ? Math.round(indicators.reduce((s, i) => s + Number(i.consistency_score), 0) / indicators.length)
    : 0;
  const avgTimeliness = indicators.length > 0
    ? Math.round(indicators.reduce((s, i) => s + Number(i.timeliness_score), 0) / indicators.length)
    : 0;

  const scoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 70) return "text-amber-600";
    return "text-destructive";
  };

  const progressColor = (score: number) => {
    if (score >= 90) return "[&>div]:bg-green-500";
    if (score >= 70) return "[&>div]:bg-amber-500";
    return "[&>div]:bg-destructive";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            Data Quality Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track quality indicators, identify issues, and trigger data cleaning
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={scanning}>
            <RefreshCcw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={runFullScan} disabled={scanning}>
            {scanning ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
            {scanning ? "Scanning..." : "Run Full Scan"}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Overall Quality", value: avgOverall, icon: Target },
          { label: "Completeness", value: avgCompleteness, icon: BarChart3 },
          { label: "Accuracy", value: avgAccuracy, icon: CheckCircle },
          { label: "Consistency", value: avgConsistency, icon: Activity },
          { label: "Timeliness", value: avgTimeliness, icon: Clock },
        ].map(kpi => (
          <Card key={kpi.label} className="border-0 shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <kpi.icon className="h-4 w-4 text-muted-foreground" />
                <span className={`font-display text-2xl font-bold ${scoreColor(kpi.value)}`}>
                  {indicators.length > 0 ? `${kpi.value}%` : "—"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <Progress value={kpi.value} className={`h-1.5 mt-2 ${progressColor(kpi.value)}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alert Banner */}
      {criticalIssues.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {criticalIssues.length} critical issue{criticalIssues.length > 1 ? "s" : ""} require attention
              </p>
              <p className="text-xs text-muted-foreground">
                Review and apply data cleaning actions below
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="issues" className="space-y-4">
        <TabsList>
          <TabsTrigger value="issues" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Issues ({openIssues.length})
          </TabsTrigger>
          <TabsTrigger value="indicators" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Indicators ({indicators.length})
          </TabsTrigger>
        </TabsList>

        {/* Issues Tab */}
        <TabsContent value="issues" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search issues..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="duplicate">Duplicates</SelectItem>
                <SelectItem value="anomaly">Anomalies</SelectItem>
                <SelectItem value="geofence_violation">Geofence</SelectItem>
                <SelectItem value="rapid_fire">Rapid Fire</SelectItem>
                <SelectItem value="incomplete">Incomplete</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Issues List */}
          {filteredIssues.length === 0 ? (
            <Card className="border-0 shadow-card">
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-10 w-10 text-green-600 mx-auto mb-3" />
                <p className="font-medium text-foreground">
                  {issues.length === 0 ? "No issues detected yet" : "No matching issues"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {issues.length === 0 ? "Run a full scan to identify data quality issues" : "Try adjusting your filters"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredIssues.map(issue => {
                const config = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.info;
                const Icon = ISSUE_TYPE_ICONS[issue.issue_type] || AlertTriangle;
                const cleanActions = CLEANING_ACTIONS[issue.issue_type] || [];

                return (
                  <Card key={issue.id} className={`border-0 shadow-card ${issue.status !== "open" ? "opacity-60" : ""}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${config.bg} shrink-0`}>
                          <Icon className={`h-4 w-4 ${config.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-medium text-foreground">{issue.title}</span>
                            <Badge variant={config.badgeVariant} className="text-[10px] h-4">
                              {issue.severity}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] h-4">
                              {issue.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{issue.description}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>Form: {formNames[issue.form_id] || issue.form_id.slice(0, 8)}</span>
                            <span>Project: {projectNames[issue.project_id] || issue.project_id.slice(0, 8)}</span>
                            <span>{new Date(issue.detected_at).toLocaleDateString()}</span>
                          </div>
                          {issue.resolution && (
                            <p className="text-xs text-green-600 mt-1">Resolution: {issue.resolution}</p>
                          )}
                        </div>
                        {issue.status === "open" && (
                          <div className="flex flex-col gap-1 shrink-0">
                            {cleanActions.length > 0 && (
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 text-xs"
                                onClick={() => setCleaningDialog(issue)}
                              >
                                <Wrench className="h-3 w-3 mr-1" />
                                Clean
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => { setResolveDialog(issue); setResolution(""); }}
                            >
                              Resolve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-muted-foreground"
                              onClick={() => dismissIssue(issue.id)}
                            >
                              Dismiss
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Indicators Tab */}
        <TabsContent value="indicators" className="space-y-4">
          {indicators.length === 0 ? (
            <Card className="border-0 shadow-card">
              <CardContent className="py-12 text-center">
                <BarChart3 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="font-medium text-foreground">No quality indicators yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Run a full scan to compute quality metrics for all forms
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {indicators.map(ind => (
                <Card key={ind.id} className="border-0 shadow-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span className="truncate">{formNames[ind.form_id] || ind.form_id.slice(0, 8)}</span>
                      <span className={`font-display text-xl font-bold ${scoreColor(Number(ind.overall_score))}`}>
                        {Number(ind.overall_score)}%
                      </span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {projectNames[ind.project_id] || "Unknown Project"} · {ind.total_submissions} submissions
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { label: "Completeness", value: Number(ind.completeness_score) },
                      { label: "Accuracy", value: Number(ind.accuracy_score) },
                      { label: "Consistency", value: Number(ind.consistency_score) },
                      { label: "Timeliness", value: Number(ind.timeliness_score) },
                    ].map(metric => (
                      <div key={metric.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{metric.label}</span>
                          <span className={`font-medium ${scoreColor(metric.value)}`}>{metric.value}%</span>
                        </div>
                        <Progress value={metric.value} className={`h-1.5 ${progressColor(metric.value)}`} />
                      </div>
                    ))}
                    <Separator />
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Copy className="h-3 w-3 text-muted-foreground" />
                        <span>{ind.duplicate_count} duplicates</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span>{ind.geofence_violations} geofence</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-3 w-3 text-muted-foreground" />
                        <span>{ind.anomaly_count} anomalies</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span>{ind.rapid_fire_count} rapid-fire</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Last checked: {new Date(ind.last_checked_at).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Resolve Dialog */}
      <Dialog open={!!resolveDialog} onOpenChange={() => setResolveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Issue</DialogTitle>
            <DialogDescription>{resolveDialog?.title}</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Describe how this issue was resolved..."
            value={resolution}
            onChange={e => setResolution(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialog(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (resolveDialog) resolveIssue(resolveDialog.id, resolution || "Manually resolved");
                setResolveDialog(null);
              }}
            >
              Mark Resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cleaning Dialog */}
      <Dialog open={!!cleaningDialog} onOpenChange={() => setCleaningDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              Data Cleaning Actions
            </DialogTitle>
            <DialogDescription>{cleaningDialog?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {cleaningDialog && (CLEANING_ACTIONS[cleaningDialog.issue_type] || []).map(action => (
              <Card key={action.action} className="border shadow-sm cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => {
                  if (cleaningDialog) {
                    triggerDataCleaning(cleaningDialog.id, action.action);
                    setCleaningDialog(null);
                  }
                }}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <Wrench className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{action.label}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCleaningDialog(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DataQualityView;
