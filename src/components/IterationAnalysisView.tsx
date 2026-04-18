import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, BarChart3, AlertTriangle, CheckCircle, TrendingUp, FileText, FolderOpen, RefreshCw, PieChart, X as XIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { localIterationAnalysis } from "@/lib/aiCreditFallback";
import { PieChart as RePieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

interface Theme {
  name: string;
  description: string;
  count: number;
  percentage: number;
  examples: string[];
}

interface Analysis {
  themes: Theme[];
  keyFindings: string[];
  recommendations: string[];
  severity: "low" | "medium" | "high" | "critical";
}

interface ReasonEntry {
  projectId: string;
  projectName: string;
  formId: string;
  formName: string;
  groupId: string;
  reason: string;
  target: number;
  actual: number;
  submittedAt: string;
  userId: string;
  userName?: string;
}

interface Summary {
  totalReasons: number;
  projects: { id: string; name: string; count: number }[];
  forms: { id: string; name: string; projectName: string; count: number }[];
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(210, 70%, 55%)",
  "hsl(340, 65%, 50%)",
  "hsl(160, 55%, 45%)",
  "hsl(45, 80%, 50%)",
  "hsl(280, 50%, 55%)",
  "hsl(20, 70%, 50%)",
];

const SEVERITY_CONFIG = {
  low: { color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30", label: "Low" },
  medium: { color: "text-yellow-600", bg: "bg-yellow-100 dark:bg-yellow-900/30", label: "Medium" },
  high: { color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-900/30", label: "High" },
  critical: { color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30", label: "Critical" },
};

const IterationAnalysisView = () => {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [entries, setEntries] = useState<ReasonEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [selectedForm, setSelectedForm] = useState<string>("all");

  // Fetch projects for filter
  useEffect(() => {
    const fetchProjects = async () => {
      const { data } = await supabase.from("projects").select("id, name").order("name");
      if (data) setProjects(data);
    };
    fetchProjects();
  }, []);

  const availableForms = useMemo(() => {
    if (!summary) return [];
    if (selectedProject === "all") return summary.forms;
    return summary.forms.filter((f) => {
      const entry = entries.find((e) => e.formId === f.id);
      return entry?.projectId === selectedProject;
    });
  }, [summary, selectedProject, entries]);

  const runAnalysis = async () => {
    setLoading(true);
    setAnalysis(null);
    try {
      const body: Record<string, string> = {};
      if (selectedProject !== "all") body.projectId = selectedProject;
      if (selectedForm !== "all") body.formId = selectedForm;

      const { data, error } = await supabase.functions.invoke("analyze-iteration-reasons", { body });
      
      if (error && !data) {
        throw error;
      }

      if (data?.entries?.length) {
        // Resolve user names from profiles
        const userIds = [...new Set((data.entries as any[]).map((e: any) => e.userId as string))];
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", userIds);
        const nameMap = new Map<string, string>(
          (profilesData || []).map((p: any) => [p.user_id, `${p.first_name} ${p.last_name}`.trim() || "Unknown"])
        );
        const enrichedEntries = data.entries.map((e: any) => ({
          ...e,
          userName: nameMap.get(e.userId) || "Unknown",
        }));
        setEntries(enrichedEntries);
        setSummary(data.summary || null);
        
        // Use AI analysis from edge function if available, otherwise local
        if (data?.analysis) {
          setAnalysis(data.analysis);
        } else {
          const localText = localIterationAnalysis(data.entries);
          const localAnalysisObj: Analysis = {
            themes: [{ name: "Local Analysis", description: localText, count: data.entries.length, percentage: 100, examples: [] }],
            keyFindings: ["Showing locally computed summary."],
            recommendations: ["Review top reasons for incomplete targets to improve completion rates."],
            severity: "low",
          };
          setAnalysis(localAnalysisObj);
        }
      } else {
        toast({ title: "No Data", description: "No incomplete iteration reasons found for the selected filters." });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Analysis Failed", description: "Could not run thematic analysis.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Completion rate by form
  const completionData = useMemo(() => {
    if (!entries.length) return [];
    const formMap = new Map<string, { name: string; totalTarget: number; totalActual: number; count: number }>();
    for (const e of entries) {
      const f = formMap.get(e.formId) || { name: e.formName, totalTarget: 0, totalActual: 0, count: 0 };
      f.totalTarget += e.target;
      f.totalActual += e.actual;
      f.count++;
      formMap.set(e.formId, f);
    }
    return Array.from(formMap.values()).map((f) => ({
      name: f.name.length > 20 ? f.name.slice(0, 20) + "..." : f.name,
      completionRate: f.totalTarget > 0 ? Math.round((f.totalActual / f.totalTarget) * 100) : 0,
      incidents: f.count,
    }));
  }, [entries]);

  // By project distribution
  const projectDistribution = useMemo(() => {
    if (!summary) return [];
    return summary.projects.map((p) => ({ name: p.name, value: p.count }));
  }, [summary]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Iteration Analysis</h2>
        <p className="text-sm text-muted-foreground mt-1">
          AI-powered thematic analysis of reasons for incomplete repeat group iterations
        </p>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-soft">
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium text-foreground mb-1.5 block">Project</label>
              <Select value={selectedProject} onValueChange={(v) => { setSelectedProject(v); setSelectedForm("all"); }}>
                <SelectTrigger><SelectValue placeholder="All Projects" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium text-foreground mb-1.5 block">Form</label>
              <Select value={selectedForm} onValueChange={setSelectedForm}>
                <SelectTrigger><SelectValue placeholder="All Forms" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Forms</SelectItem>
                  {availableForms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="acg" onClick={runAnalysis} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {loading ? "Analyzing..." : "Run Analysis"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* No data state */}
      {!loading && !summary && (
        <Card className="border-0 shadow-soft">
          <CardContent className="py-16 text-center">
            <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">No Analysis Yet</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              Select filters and click "Run Analysis" to generate AI-powered thematic analysis of incomplete iteration reasons from form submissions.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary KPIs */}
      {summary && summary.totalReasons > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-0 shadow-soft">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{summary.totalReasons}</p>
                  <p className="text-xs text-muted-foreground">Total Incidents</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-soft">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{summary.projects.length}</p>
                  <p className="text-xs text-muted-foreground">Projects Affected</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-soft">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{summary.forms.length}</p>
                  <p className="text-xs text-muted-foreground">Forms Affected</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-soft">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {analysis?.severity ? (
                      <span className={SEVERITY_CONFIG[analysis.severity].color}>
                        {SEVERITY_CONFIG[analysis.severity].label}
                      </span>
                    ) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">Severity Level</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Row */}
      {summary && summary.totalReasons > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Theme Distribution Pie */}
          {analysis?.themes && analysis.themes.length > 0 && (
            <Card className="border-0 shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PieChart className="h-4 w-4 text-primary" />
                  Theme Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <RePieChart>
                    <Pie
                      data={analysis.themes.map((t) => ({ name: t.name, value: t.count }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {analysis.themes.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RePieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Completion Rate by Form */}
          {completionData.length > 0 && (
            <Card className="border-0 shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Completion Rate by Form
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={completionData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} unit="%" />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="completionRate" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Completion Rate" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Project Distribution */}
          {projectDistribution.length > 1 && (
            <Card className="border-0 shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FolderOpen className="h-4 w-4 text-primary" />
                  Incidents by Project
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={projectDistribution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} name="Incidents" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Form-level breakdown */}
          {summary.forms.length > 0 && (
            <Card className="border-0 shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-primary" />
                  Incidents by Form
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={summary.forms.map((f) => ({ name: f.name.length > 18 ? f.name.slice(0, 18) + "..." : f.name, count: f.count }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Incidents" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* AI Analysis Results */}
      {analysis && (
        <div className="space-y-6">
          {/* Key Findings */}
          <Card className="border-0 shadow-soft">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                Key Findings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analysis.keyFindings.map((finding, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    <p className="text-sm text-foreground leading-relaxed">{finding}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Themes Detail */}
          <Card className="border-0 shadow-soft">
            <CardHeader>
              <CardTitle>Identified Themes</CardTitle>
              <CardDescription>Recurring patterns in incomplete iteration reasons</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analysis.themes.map((theme, i) => (
                  <div key={i} className="rounded-lg border border-border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-foreground">{theme.name}</h4>
                      <Badge variant="outline" className="text-xs">
                        {theme.count} ({theme.percentage}%)
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{theme.description}</p>
                    {theme.examples.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <p className="text-xs font-medium text-muted-foreground">Example quotes:</p>
                        {theme.examples.slice(0, 2).map((ex, j) => (
                          <p key={j} className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-2">
                            "{ex}"
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card className="border-0 shadow-soft">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analysis.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <p className="text-sm text-foreground leading-relaxed">{rec}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Raw reasons table with filters */}
      {entries.length > 0 && (
        <RecordedReasonsTable entries={entries} />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Recorded reasons table with built-in filters
// ─────────────────────────────────────────────────────────
interface RecordedReasonsTableProps {
  entries: ReasonEntry[];
}

const RecordedReasonsTable = ({ entries }: RecordedReasonsTableProps) => {
  const [tableFromDate, setTableFromDate] = useState<string>("");
  const [tableToDate, setTableToDate] = useState<string>("");
  const [tableUser, setTableUser] = useState<string>("all");
  const [tableProject, setTableProject] = useState<string>("all");
  const [tableForm, setTableForm] = useState<string>("all");

  const userOptions = useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach((e) => {
      if (e.userId) map.set(e.userId, e.userName || "Unknown");
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach((e) => map.set(e.projectId, e.projectName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const formOptions = useMemo(() => {
    const map = new Map<string, { name: string; projectId: string }>();
    entries.forEach((e) => map.set(e.formId, { name: e.formName, projectId: e.projectId }));
    let list = Array.from(map.entries()).map(([id, v]) => ({ id, name: v.name, projectId: v.projectId }));
    if (tableProject !== "all") list = list.filter((f) => f.projectId === tableProject);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, tableProject]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (tableUser !== "all" && e.userId !== tableUser) return false;
      if (tableProject !== "all" && e.projectId !== tableProject) return false;
      if (tableForm !== "all" && e.formId !== tableForm) return false;
      if (tableFromDate || tableToDate) {
        if (!e.submittedAt) return false;
        const d = new Date(e.submittedAt);
        if (tableFromDate && d < new Date(tableFromDate)) return false;
        if (tableToDate) {
          const to = new Date(tableToDate);
          to.setHours(23, 59, 59, 999);
          if (d > to) return false;
        }
      }
      return true;
    });
  }, [entries, tableUser, tableProject, tableForm, tableFromDate, tableToDate]);

  const hasFilters = tableFromDate || tableToDate || tableUser !== "all" || tableProject !== "all" || tableForm !== "all";

  const clearFilters = () => {
    setTableFromDate(""); setTableToDate("");
    setTableUser("all"); setTableProject("all"); setTableForm("all");
  };

  return (
    <Card className="border-0 shadow-soft">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>All Recorded Reasons ({filtered.length}{hasFilters && filtered.length !== entries.length ? ` of ${entries.length}` : ""})</CardTitle>
            <CardDescription>Individual incomplete iteration reasons from submissions</CardDescription>
          </div>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="gap-1.5">
              <XIcon className="h-3.5 w-3.5" /> Clear filters
            </Button>
          )}
        </div>

        {/* Filter row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">From</label>
            <Input type="date" value={tableFromDate} onChange={(e) => setTableFromDate(e.target.value)} className="h-9" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">To</label>
            <Input type="date" value={tableToDate} onChange={(e) => setTableToDate(e.target.value)} className="h-9" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Submitted By</label>
            <Select value={tableUser} onValueChange={setTableUser}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {userOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Project</label>
            <Select value={tableProject} onValueChange={(v) => { setTableProject(v); setTableForm("all"); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projectOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Form</label>
            <Select value={tableForm} onValueChange={setTableForm}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Forms</SelectItem>
                {formOptions.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">S/N</th>
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Submitted By</th>
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Project</th>
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Form</th>
                <th className="text-center py-2 pr-4 font-medium text-muted-foreground">Target</th>
                <th className="text-center py-2 pr-4 font-medium text-muted-foreground">Actual</th>
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Date</th>
                <th className="text-left py-2 font-medium text-muted-foreground">Reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    No records match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.slice(0, 100).map((entry, i) => (
                  <tr key={`${entry.formId}-${entry.groupId}-${i}`} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-4 text-muted-foreground text-xs">{i + 1}</td>
                    <td className="py-2 pr-4 text-foreground font-medium">{entry.userName || "Unknown"}</td>
                    <td className="py-2 pr-4 text-foreground">{entry.projectName}</td>
                    <td className="py-2 pr-4 text-foreground">{entry.formName}</td>
                    <td className="py-2 pr-4 text-center">
                      <Badge variant="outline" className="text-xs">{entry.target}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-center">
                      <Badge variant={entry.actual < entry.target ? "destructive" : "secondary"} className="text-xs">{entry.actual}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground text-xs whitespace-nowrap">
                      {entry.submittedAt ? new Date(entry.submittedAt).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="py-2 text-muted-foreground max-w-xs truncate" title={entry.reason}>{entry.reason}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <p className="mt-3 text-xs text-muted-foreground text-center">Showing first 100 of {filtered.length} records</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default IterationAnalysisView;
