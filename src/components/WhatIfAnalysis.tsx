import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FlaskConical, TrendingUp, TrendingDown, Minus, BarChart3,
  RefreshCcw, Save, Play, ArrowRight, Lightbulb, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";

interface Scenario {
  id: string;
  name: string;
  parameters: Record<string, number>;
  results: Record<string, number>;
  timestamp: string;
}

const WhatIfAnalysis = () => {
  const [forms, setForms] = useState<any[]>([]);
  const [selectedFormId, setSelectedFormId] = useState("");
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  // Adjustable parameters
  const [targetMultiplier, setTargetMultiplier] = useState(100);
  const [complianceThreshold, setComplianceThreshold] = useState(80);
  const [teamSizeAdjust, setTeamSizeAdjust] = useState(100);
  const [geofenceRadius, setGeofenceRadius] = useState(100);
  const [submissionRateChange, setSubmissionRateChange] = useState(0);

  useEffect(() => {
    supabase.from("forms").select("id, name, project_id").then(({ data }) => {
      if (data) setForms(data);
    });
  }, []);

  useEffect(() => {
    if (!selectedFormId) return;
    setLoading(true);
    supabase.from("form_submissions").select("*").eq("form_id", selectedFormId).order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => {
        setSubmissions(data || []);
        setLoading(false);
      });
  }, [selectedFormId]);

  const baseline = useMemo(() => {
    if (!submissions.length) return null;
    const total = submissions.length;
    const completed = submissions.filter(s => s.status === "submitted").length;
    const withGeo = submissions.filter(s => s.within_geofence === true).length;
    const uniqueUsers = new Set(submissions.map(s => s.user_id)).size;

    const dailyMap = new Map<string, number>();
    submissions.forEach(s => {
      const day = s.created_at?.slice(0, 10);
      if (day) dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    });
    const avgDaily = dailyMap.size ? total / dailyMap.size : 0;

    return {
      totalSubmissions: total,
      completionRate: total ? (completed / total) * 100 : 0,
      geofenceCompliance: total ? (withGeo / total) * 100 : 0,
      activeFieldWorkers: uniqueUsers,
      avgDailySubmissions: avgDaily,
      daysOfData: dailyMap.size,
    };
  }, [submissions]);

  const projected = useMemo(() => {
    if (!baseline) return null;
    const adjustedTeam = Math.round(baseline.activeFieldWorkers * (teamSizeAdjust / 100));
    const adjustedDaily = baseline.avgDailySubmissions * (targetMultiplier / 100) * (1 + submissionRateChange / 100);
    const projectedTotal = Math.round(adjustedDaily * baseline.daysOfData);
    const projectedCompliance = Math.min(100, baseline.geofenceCompliance * (geofenceRadius / 100));

    return {
      projectedTotal,
      adjustedTeam,
      adjustedDaily: Math.round(adjustedDaily * 10) / 10,
      projectedCompliance: Math.round(projectedCompliance * 10) / 10,
      projectedCompletionRate: Math.min(100, baseline.completionRate * (complianceThreshold / 80)),
      impactScore: Math.round(((projectedTotal / (baseline.totalSubmissions || 1)) - 1) * 100),
    };
  }, [baseline, targetMultiplier, complianceThreshold, teamSizeAdjust, geofenceRadius, submissionRateChange]);

  const saveScenario = () => {
    if (!projected || !baseline) return;
    const scenario: Scenario = {
      id: crypto.randomUUID(),
      name: `Scenario ${scenarios.length + 1}`,
      parameters: { targetMultiplier, complianceThreshold, teamSizeAdjust, geofenceRadius, submissionRateChange },
      results: { ...projected },
      timestamp: new Date().toISOString(),
    };
    setScenarios(prev => [scenario, ...prev]);
    toast({ title: "Scenario Saved", description: `"${scenario.name}" has been stored for comparison.` });
  };

  const resetParameters = () => {
    setTargetMultiplier(100);
    setComplianceThreshold(80);
    setTeamSizeAdjust(100);
    setGeofenceRadius(100);
    setSubmissionRateChange(0);
  };

  const comparisonData = useMemo(() => {
    if (!baseline || !projected) return [];
    return [
      { metric: "Total Submissions", baseline: baseline.totalSubmissions, projected: projected.projectedTotal },
      { metric: "Daily Average", baseline: Math.round(baseline.avgDailySubmissions), projected: Math.round(projected.adjustedDaily) },
      { metric: "Team Size", baseline: baseline.activeFieldWorkers, projected: projected.adjustedTeam },
      { metric: "Compliance %", baseline: Math.round(baseline.geofenceCompliance), projected: Math.round(projected.projectedCompliance) },
    ];
  }, [baseline, projected]);

  const DeltaBadge = ({ value }: { value: number }) => {
    if (value === 0) return <Badge variant="secondary" className="text-[10px]"><Minus className="h-3 w-3 mr-1" />No change</Badge>;
    return (
      <Badge className={`text-[10px] ${value > 0 ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200" : "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200"}`}>
        {value > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
        {value > 0 ? "+" : ""}{value}%
      </Badge>
    );
  };

  return (
    <div className="space-y-6 p-4 lg:p-6 max-w-[1200px] mx-auto">
      <div>
        <h1 className="font-display text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <FlaskConical className="h-7 w-7 text-primary" />
          </div>
          What-If Analysis
        </h1>
        <p className="text-muted-foreground mt-1">Explore scenarios by adjusting parameters to see projected outcomes</p>
      </div>

      {/* Form Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs mb-1 block">Select Form</Label>
              <Select value={selectedFormId} onValueChange={setSelectedFormId}>
                <SelectTrigger><SelectValue placeholder="Choose a form..." /></SelectTrigger>
                <SelectContent>
                  {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {baseline && (
              <div className="flex gap-4 text-sm">
                <div><span className="text-muted-foreground">Submissions:</span> <strong>{baseline.totalSubmissions}</strong></div>
                <div><span className="text-muted-foreground">Workers:</span> <strong>{baseline.activeFieldWorkers}</strong></div>
                <div><span className="text-muted-foreground">Days:</span> <strong>{baseline.daysOfData}</strong></div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {baseline && projected && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Parameters Panel */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" /> Scenario Parameters
              </CardTitle>
              <CardDescription>Adjust values to explore what-if scenarios</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <Label>Target Multiplier</Label>
                  <span className="font-mono text-primary font-bold">{targetMultiplier}%</span>
                </div>
                <Slider value={[targetMultiplier]} onValueChange={([v]) => setTargetMultiplier(v)} min={50} max={200} step={5} />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <Label>Compliance Threshold</Label>
                  <span className="font-mono text-primary font-bold">{complianceThreshold}%</span>
                </div>
                <Slider value={[complianceThreshold]} onValueChange={([v]) => setComplianceThreshold(v)} min={50} max={100} step={5} />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <Label>Team Size Adjustment</Label>
                  <span className="font-mono text-primary font-bold">{teamSizeAdjust}%</span>
                </div>
                <Slider value={[teamSizeAdjust]} onValueChange={([v]) => setTeamSizeAdjust(v)} min={50} max={200} step={10} />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <Label>Geofence Radius</Label>
                  <span className="font-mono text-primary font-bold">{geofenceRadius}%</span>
                </div>
                <Slider value={[geofenceRadius]} onValueChange={([v]) => setGeofenceRadius(v)} min={50} max={200} step={10} />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <Label>Submission Rate Change</Label>
                  <span className="font-mono text-primary font-bold">{submissionRateChange > 0 ? "+" : ""}{submissionRateChange}%</span>
                </div>
                <Slider value={[submissionRateChange]} onValueChange={([v]) => setSubmissionRateChange(v)} min={-50} max={50} step={5} />
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={resetParameters}>
                  <RefreshCcw className="h-3 w-3" /> Reset
                </Button>
                <Button variant="acg" size="sm" className="flex-1 gap-1" onClick={saveScenario}>
                  <Save className="h-3 w-3" /> Save Scenario
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results Panel */}
          <div className="lg:col-span-2 space-y-4">
            {/* Impact Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 border-blue-200/50">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{projected.projectedTotal}</p>
                  <p className="text-[10px] text-blue-600/70 dark:text-blue-400/70">Projected Submissions</p>
                  <DeltaBadge value={projected.impactScore} />
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-emerald-200/50">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{projected.adjustedTeam}</p>
                  <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70">Team Members</p>
                  <DeltaBadge value={Math.round(((teamSizeAdjust / 100) - 1) * 100)} />
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200/50">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{projected.adjustedDaily}</p>
                  <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70">Daily Average</p>
                  <DeltaBadge value={Math.round(((projected.adjustedDaily / (baseline.avgDailySubmissions || 1)) - 1) * 100)} />
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border-purple-200/50">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{projected.projectedCompliance}%</p>
                  <p className="text-[10px] text-purple-600/70 dark:text-purple-400/70">Compliance Rate</p>
                  <DeltaBadge value={Math.round(projected.projectedCompliance - baseline.geofenceCompliance)} />
                </CardContent>
              </Card>
            </div>

            {/* Comparison Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Baseline vs. Projected
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={comparisonData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="baseline" fill="hsl(220 70% 45%)" name="Baseline" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="projected" fill="hsl(36 90% 55%)" name="Projected" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Insights */}
            <Card className="border-accent/30 bg-accent/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Lightbulb className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Scenario Insights</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {projected.impactScore > 20 && <li className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-green-500" /> Significant increase in projected submissions (+{projected.impactScore}%)</li>}
                      {projected.impactScore < -10 && <li className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> Projected submissions would decrease by {Math.abs(projected.impactScore)}%</li>}
                      {teamSizeAdjust > 100 && <li className="flex items-center gap-1"><ArrowRight className="h-3 w-3" /> Adding {projected.adjustedTeam - baseline.activeFieldWorkers} team members would help reach targets</li>}
                      {teamSizeAdjust < 100 && <li className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" /> Reducing team size may impact coverage and quality</li>}
                      {complianceThreshold > 90 && <li className="flex items-center gap-1"><ArrowRight className="h-3 w-3" /> High compliance threshold ensures data integrity</li>}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Saved Scenarios */}
            {scenarios.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Saved Scenarios ({scenarios.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[200px]">
                    <div className="space-y-2">
                      {scenarios.map(s => (
                        <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-2 text-xs">
                          <div>
                            <span className="font-medium">{s.name}</span>
                            <span className="text-muted-foreground ml-2">{new Date(s.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px]">
                              Submissions: {Math.round(s.results.projectedTotal as number)}
                            </Badge>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => {
                              setTargetMultiplier(s.parameters.targetMultiplier);
                              setComplianceThreshold(s.parameters.complianceThreshold);
                              setTeamSizeAdjust(s.parameters.teamSizeAdjust);
                              setGeofenceRadius(s.parameters.geofenceRadius);
                              setSubmissionRateChange(s.parameters.submissionRateChange);
                            }}>
                              Load
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {!selectedFormId && (
        <div className="text-center py-16 text-muted-foreground">
          <FlaskConical className="h-16 w-16 mx-auto mb-4 opacity-20" />
          <p className="font-medium text-lg">Select a form to begin what-if analysis</p>
          <p className="text-sm mt-1">Choose a form with submission data to explore different scenarios</p>
        </div>
      )}
    </div>
  );
};

export default WhatIfAnalysis;
