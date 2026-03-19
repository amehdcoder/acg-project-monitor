import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  BarChart3, TrendingUp, Calculator, Info, Loader2, Play, ArrowLeft,
  CheckCircle, AlertTriangle, Lightbulb, FileText, PieChart, ScatterChart,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  BarChart, Bar, LineChart, Line, ScatterChart as RechartsScatter, Scatter,
  PieChart as RechartsPie, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area, RadarChart,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";

const ANALYSIS_TYPES = [
  {
    id: "descriptive",
    name: "Descriptive Statistics",
    description: "Mean, median, mode, std deviation, skewness, kurtosis for numeric fields",
    icon: BarChart3,
    suitableFor: ["number", "range", "calculate"],
    insight: "Provides summary measures of central tendency and dispersion for your numeric data. Useful for understanding the distribution and spread of responses.",
  },
  {
    id: "frequency",
    name: "Frequency Analysis",
    description: "Count and percentage distribution of categorical responses",
    icon: PieChart,
    suitableFor: ["select_one", "radio", "checkbox", "select_multiple", "text", "yes_no"],
    insight: "Shows how often each response option was selected. Ideal for understanding the distribution of categorical data like survey choices.",
  },
  {
    id: "cross_tabulation",
    name: "Cross-Tabulation (Chi-Square)",
    description: "Contingency tables with Chi-square test of independence",
    icon: FileText,
    suitableFor: ["select_one", "radio", "checkbox", "select_multiple", "yes_no"],
    insight: "Tests whether two categorical variables are statistically independent. Reveals relationships between different survey questions.",
  },
  {
    id: "t_test",
    name: "T-Test (Independent Samples)",
    description: "Compare means between two groups with significance testing",
    icon: TrendingUp,
    suitableFor: ["number", "range", "calculate"],
    requiresGrouping: true,
    insight: "Determines if there is a statistically significant difference between the means of two groups. E.g., comparing scores between two regions.",
  },
  {
    id: "paired_t_test",
    name: "Paired T-Test",
    description: "Compare means of paired/matched observations",
    icon: TrendingUp,
    suitableFor: ["number", "range", "calculate"],
    insight: "Tests if the mean difference between paired observations is significant. Useful for pre/post comparisons within the same subjects.",
  },
  {
    id: "anova",
    name: "One-Way ANOVA",
    description: "Compare means across 3+ groups with F-test and post-hoc analysis",
    icon: BarChart3,
    suitableFor: ["number", "range", "calculate"],
    requiresGrouping: true,
    insight: "Tests whether means differ significantly across three or more groups. Includes post-hoc tests to identify which specific groups differ.",
  },
  {
    id: "correlation",
    name: "Correlation Analysis (Pearson & Spearman)",
    description: "Measure linear and rank-order relationships between numeric variables",
    icon: ScatterChart,
    suitableFor: ["number", "range", "calculate"],
    insight: "Quantifies the strength and direction of relationships between numeric variables. Pearson for linear, Spearman for monotonic relationships.",
  },
  {
    id: "regression_linear",
    name: "Linear Regression",
    description: "Model the relationship between a dependent and independent variable(s)",
    icon: TrendingUp,
    suitableFor: ["number", "range", "calculate"],
    insight: "Predicts a numeric outcome based on one or more predictor variables. Provides R-squared, coefficients, and significance values.",
  },
  {
    id: "logistic_regression",
    name: "Logistic Regression",
    description: "Predict binary outcomes from predictor variables",
    icon: TrendingUp,
    suitableFor: ["number", "range", "calculate", "yes_no", "select_one"],
    insight: "Models the probability of a binary outcome (yes/no) based on predictor variables. Useful for classification and risk factor analysis.",
  },
  {
    id: "mann_whitney",
    name: "Mann-Whitney U Test",
    description: "Non-parametric comparison of two independent groups",
    icon: BarChart3,
    suitableFor: ["number", "range", "calculate"],
    requiresGrouping: true,
    insight: "Non-parametric alternative to the independent t-test. Does not assume normal distribution. Compares medians between two groups.",
  },
  {
    id: "kruskal_wallis",
    name: "Kruskal-Wallis H Test",
    description: "Non-parametric comparison across 3+ groups",
    icon: BarChart3,
    suitableFor: ["number", "range", "calculate"],
    requiresGrouping: true,
    insight: "Non-parametric alternative to one-way ANOVA. Tests whether samples come from the same distribution across multiple groups.",
  },
  {
    id: "chi_square_goodness",
    name: "Chi-Square Goodness of Fit",
    description: "Test if observed frequencies match expected distribution",
    icon: PieChart,
    suitableFor: ["select_one", "radio", "yes_no"],
    insight: "Tests whether the observed frequency distribution of a categorical variable matches an expected distribution.",
  },
  {
    id: "time_series",
    name: "Time Series Analysis",
    description: "Trend analysis, seasonality detection, and forecasting",
    icon: TrendingUp,
    suitableFor: ["number", "range", "calculate"],
    insight: "Analyzes temporal patterns in submission data. Detects trends, seasonal patterns, and provides short-term forecasts.",
  },
  {
    id: "survival",
    name: "Kaplan-Meier Survival Analysis",
    description: "Time-to-event analysis with survival curves",
    icon: TrendingUp,
    suitableFor: ["number", "range", "calculate"],
    insight: "Estimates the probability of an event occurring over time. Useful for analyzing case durations, treatment timelines, or follow-up completion rates.",
  },
  {
    id: "factor_analysis",
    name: "Factor Analysis / PCA",
    description: "Identify underlying factors in multi-variable datasets",
    icon: ScatterChart,
    suitableFor: ["number", "range", "calculate"],
    insight: "Reduces many variables into fewer underlying factors. Helps identify latent constructs and simplify complex datasets.",
  },
  {
    id: "cluster_analysis",
    name: "Cluster Analysis",
    description: "Group similar observations together using K-means or hierarchical clustering",
    icon: ScatterChart,
    suitableFor: ["number", "range", "calculate"],
    insight: "Identifies natural groupings in your data without predefined categories. Useful for segmenting respondents or communities.",
  },
];

const COLORS = [
  "hsl(140, 65%, 22%)", "hsl(43, 80%, 50%)", "hsl(200, 70%, 50%)",
  "hsl(340, 70%, 50%)", "hsl(270, 60%, 55%)", "hsl(30, 80%, 55%)",
  "hsl(170, 60%, 40%)", "hsl(0, 70%, 55%)", "hsl(220, 60%, 55%)",
  "hsl(80, 60%, 45%)",
];

interface FormQuestion {
  id: string;
  label?: string;
  title?: string;
  type: string;
  name?: string;
  options?: { label: string; value: string }[];
}

const StatisticalAnalysisView = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedForm, setSelectedForm] = useState<string>("");
  const [selectedAnalysis, setSelectedAnalysis] = useState<string>("");
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [groupingQuestion, setGroupingQuestion] = useState<string>("");
  const [results, setResults] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("projects").select("id, name").order("name");
      setProjects(data || []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedProject) { setForms([]); return; }
    (async () => {
      const { data } = await supabase.from("forms").select("id, name, questions").eq("project_id", selectedProject).order("name");
      setForms(data || []);
    })();
  }, [selectedProject]);

  const currentForm = forms.find(f => f.id === selectedForm);
  const questions: FormQuestion[] = useMemo(() => {
    if (!currentForm?.questions) return [];
    const qs = currentForm.questions as any[];
    const flat: FormQuestion[] = [];
    const flatten = (items: any[]) => {
      for (const q of items) {
        if (q.questions) flatten(q.questions);
        else if (q.id && q.type) flat.push(q);
      }
    };
    flatten(qs);
    return flat;
  }, [currentForm]);

  const currentAnalysisType = ANALYSIS_TYPES.find(a => a.id === selectedAnalysis);

  const suitableQuestions = useMemo(() => {
    if (!currentAnalysisType) return [];
    return questions.filter(q => currentAnalysisType.suitableFor.includes(q.type));
  }, [questions, currentAnalysisType]);

  const categoricalQuestions = useMemo(() => {
    return questions.filter(q => ["select_one", "radio", "checkbox", "select_multiple", "yes_no", "text"].includes(q.type));
  }, [questions]);

  const toggleQuestion = (qId: string) => {
    setSelectedQuestions(prev =>
      prev.includes(qId) ? prev.filter(id => id !== qId) : [...prev, qId]
    );
  };

  // Local fallback for basic descriptive & frequency analyses when AI is unavailable
  const runLocalAnalysis = useCallback((submissions: any[], selectedQMeta: any[], analysisType: string): any | null => {
    if (analysisType === "descriptive") {
      const statistics: any[] = [];
      const charts: any[] = [];
      for (const q of selectedQMeta) {
        const values = submissions
          .map(s => {
            const d = s.data as any;
            const v = d?.[q.id];
            return v !== undefined && v !== null && v !== "" ? Number(v) : NaN;
          })
          .filter(v => !isNaN(v));
        if (values.length === 0) {
          statistics.push({ Question: q.label, N: 0, Mean: "N/A", Median: "N/A", "Std Dev": "N/A", Min: "N/A", Max: "N/A" });
          continue;
        }
        const sorted = [...values].sort((a, b) => a - b);
        const n = sorted.length;
        const mean = sorted.reduce((a, b) => a + b, 0) / n;
        const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
        const variance = sorted.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1 || 1);
        const stdDev = Math.sqrt(variance);
        const min = sorted[0];
        const max = sorted[n - 1];
        const q1 = sorted[Math.floor(n * 0.25)];
        const q3 = sorted[Math.floor(n * 0.75)];
        statistics.push({ Question: q.label, N: n, Mean: mean.toFixed(4), Median: median.toFixed(4), "Std Dev": stdDev.toFixed(4), Min: min, Max: max, Q1: q1, Q3: q3 });
        // Histogram bins
        const binCount = Math.min(10, Math.ceil(Math.sqrt(n)));
        const binWidth = (max - min) / binCount || 1;
        const bins = Array.from({ length: binCount }, (_, i) => ({
          name: `${(min + i * binWidth).toFixed(1)}-${(min + (i + 1) * binWidth).toFixed(1)}`,
          value: 0,
        }));
        values.forEach(v => {
          const idx = Math.min(Math.floor((v - min) / binWidth), binCount - 1);
          bins[idx].value++;
        });
        charts.push({ type: "bar", title: `Distribution: ${q.label}`, data: bins, xKey: "name", bars: ["value"] });
      }
      return {
        summary: `Local descriptive statistics computed for ${selectedQMeta.length} question(s) across ${submissions.length} submissions. AI-powered analysis unavailable — showing computed results.`,
        statistics, charts,
        interpretation: "These are locally computed statistics. For advanced interpretation, ensure AI credits are available.",
        recommendations: ["Verify data normality before applying parametric tests.", "Check for outliers that may skew mean values."],
      };
    }
    if (analysisType === "frequency") {
      const statistics: any[] = [];
      const charts: any[] = [];
      for (const q of selectedQMeta) {
        const counts = new Map<string, number>();
        let total = 0;
        submissions.forEach(s => {
          const d = s.data as any;
          let v = d?.[q.id];
          if (v === undefined || v === null || v === "") return;
          if (Array.isArray(v)) v.forEach((item: any) => { counts.set(String(item), (counts.get(String(item)) || 0) + 1); total++; });
          else { counts.set(String(v), (counts.get(String(v)) || 0) + 1); total++; }
        });
        const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
        entries.forEach(([val, count]) => {
          statistics.push({ Question: q.label, Value: val, Count: count, Percentage: total > 0 ? ((count / total) * 100).toFixed(1) + "%" : "0%" });
        });
        charts.push({
          type: "pie", title: `${q.label}`,
          data: entries.slice(0, 10).map(([name, value]) => ({ name, value })),
        });
        charts.push({
          type: "bar", title: `${q.label} - Frequency`,
          data: entries.map(([name, value]) => ({ name, value })),
          xKey: "name", bars: ["value"],
        });
      }
      return {
        summary: `Local frequency analysis for ${selectedQMeta.length} question(s) across ${submissions.length} submissions.`,
        statistics, charts,
        interpretation: "Frequency counts computed locally. For chi-square goodness-of-fit or advanced analyses, ensure AI credits are available.",
        recommendations: ["Review low-frequency categories for potential data quality issues."],
      };
    }
    return null;
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!selectedForm || !selectedAnalysis || selectedQuestions.length === 0) {
      toast({ title: "Missing Selection", description: "Select form, analysis type, and at least one question.", variant: "destructive" });
      return;
    }
    setIsAnalyzing(true);
    setResults(null);
    try {
      const { data: submissions, error } = await supabase
        .from("form_submissions")
        .select("id, data, submitted_at, user_id, location")
        .eq("form_id", selectedForm)
        .eq("status", "sent")
        .order("submitted_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      if (!submissions?.length) {
        toast({ title: "No Data", description: "No submissions found for this form." });
        setIsAnalyzing(false);
        return;
      }

      const selectedQMeta = selectedQuestions.map(qId => {
        const q = questions.find(qq => qq.id === qId);
        return { id: qId, label: q?.label || q?.title || q?.name || qId, type: q?.type || "text", options: q?.options };
      });

      const groupQ = groupingQuestion ? questions.find(q => q.id === groupingQuestion) : null;

      try {
        const { data: result, error: fnError } = await supabase.functions.invoke("statistical-analysis", {
          body: {
            submissions,
            analysisType: selectedAnalysis,
            questions: selectedQMeta,
            groupingQuestion: groupQ ? { id: groupQ.id, label: groupQ.label || groupQ.title || groupQ.name, type: groupQ.type, options: groupQ.options } : null,
            formName: currentForm?.name || "",
          },
        });

        if (fnError) {
          // Check if it's a credits/rate-limit error, fall back to local
          const errMsg = fnError.message || String(fnError);
          if (errMsg.includes("402") || errMsg.includes("credit") || errMsg.includes("429") || errMsg.includes("rate limit")) {
            const local = runLocalAnalysis(submissions, selectedQMeta, selectedAnalysis);
            if (local) {
              setResults(local);
              toast({ title: "Local Analysis", description: "AI credits unavailable. Showing locally computed results.", variant: "default" });
              return;
            }
          }
          throw fnError;
        }
        if (result?.error) {
          // Handle error messages from the edge function body
          if (result.error.includes("credit") || result.error.includes("402") || result.error.includes("rate limit") || result.error.includes("429")) {
            const local = runLocalAnalysis(submissions, selectedQMeta, selectedAnalysis);
            if (local) {
              setResults(local);
              toast({ title: "Local Analysis", description: result.error + " Showing locally computed results.", variant: "default" });
              return;
            }
          }
          throw new Error(result.error);
        }

        setResults(result);
        toast({ title: "Analysis Complete", description: "Statistical analysis results are ready." });
      } catch (edgeFnErr: any) {
        // Final fallback attempt for basic analyses
        const local = runLocalAnalysis(submissions, selectedQMeta, selectedAnalysis);
        if (local) {
          setResults(local);
          toast({ title: "Local Analysis", description: "AI service unavailable. Showing locally computed results." });
          return;
        }
        throw edgeFnErr;
      }
    } catch (err: any) {
      console.error("Analysis error:", err);
      const msg = err.message || "Unknown error";
      toast({ title: "Analysis Failed", description: msg, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedForm, selectedAnalysis, selectedQuestions, groupingQuestion, questions, currentForm, runLocalAnalysis]);

  const renderCharts = () => {
    if (!results?.charts) return null;
    return results.charts.map((chart: any, i: number) => {
      const key = `chart-${i}`;
      if (chart.type === "bar") {
        return (
          <Card key={key}>
            <CardHeader><CardTitle className="text-base">{chart.title}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chart.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey={chart.xKey || "name"} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {(chart.bars || ["value"]).map((b: string, j: number) => (
                    <Bar key={b} dataKey={b} fill={COLORS[j % COLORS.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      }
      if (chart.type === "pie") {
        return (
          <Card key={key}>
            <CardHeader><CardTitle className="text-base">{chart.title}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <RechartsPie>
                  <Pie data={chart.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                    {chart.data.map((_: any, j: number) => (
                      <Cell key={j} fill={COLORS[j % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </RechartsPie>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      }
      if (chart.type === "scatter") {
        return (
          <Card key={key}>
            <CardHeader><CardTitle className="text-base">{chart.title}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <RechartsScatter>
                  <CartesianGrid />
                  <XAxis dataKey="x" name={chart.xLabel || "X"} tick={{ fontSize: 11 }} />
                  <YAxis dataKey="y" name={chart.yLabel || "Y"} tick={{ fontSize: 11 }} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                  <Scatter name={chart.title} data={chart.data} fill={COLORS[0]} />
                </RechartsScatter>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      }
      if (chart.type === "line") {
        return (
          <Card key={key}>
            <CardHeader><CardTitle className="text-base">{chart.title}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chart.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey={chart.xKey || "name"} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {(chart.lines || ["value"]).map((l: string, j: number) => (
                    <Line key={l} type="monotone" dataKey={l} stroke={COLORS[j % COLORS.length]} strokeWidth={2} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      }
      if (chart.type === "area") {
        return (
          <Card key={key}>
            <CardHeader><CardTitle className="text-base">{chart.title}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chart.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey={chart.xKey || "name"} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" fill={COLORS[0]} stroke={COLORS[0]} fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      }
      return null;
    });
  };

  return (
    <div className="space-y-6 p-3 sm:p-4 lg:p-6 max-w-full overflow-x-hidden">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground lg:text-3xl flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Calculator className="h-6 w-6 text-primary" />
          </div>
          Statistical Analysis
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Comprehensive statistical analyses on your form data, structured by project
        </p>
      </div>

      {/* Step 1: Select Project & Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
            Select Data Source
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Project</label>
            <Select value={selectedProject} onValueChange={(v) => { setSelectedProject(v); setSelectedForm(""); setResults(null); }}>
              <SelectTrigger><SelectValue placeholder="Select project..." /></SelectTrigger>
              <SelectContent>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Form</label>
            <Select value={selectedForm} onValueChange={(v) => { setSelectedForm(v); setSelectedQuestions([]); setResults(null); }} disabled={!selectedProject}>
              <SelectTrigger><SelectValue placeholder="Select form..." /></SelectTrigger>
              <SelectContent>
                {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Choose Analysis Type */}
      {selectedForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
              Choose Analysis Type
            </CardTitle>
            <CardDescription>Select the statistical method to apply. Only questions suitable for the chosen analysis will be shown.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ANALYSIS_TYPES.map(a => {
                const suitable = questions.filter(q => a.suitableFor.includes(q.type));
                const hasSuitable = suitable.length > 0;
                return (
                  <button
                    key={a.id}
                    onClick={() => { if (hasSuitable) { setSelectedAnalysis(a.id); setSelectedQuestions([]); setResults(null); } }}
                    disabled={!hasSuitable}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      selectedAnalysis === a.id
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : hasSuitable
                        ? "border-border hover:border-primary/40 hover:bg-muted/30"
                        : "border-border/50 opacity-40 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <a.icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${selectedAnalysis === a.id ? "text-primary" : "text-muted-foreground"}`} />
                      <div>
                        <p className="text-sm font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {suitable.length} suitable question{suitable.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Insight preview */}
      {currentAnalysisType && (
        <Alert>
          <Lightbulb className="h-4 w-4" />
          <AlertTitle>What this analysis will tell you</AlertTitle>
          <AlertDescription>{currentAnalysisType.insight}</AlertDescription>
        </Alert>
      )}

      {/* Step 3: Select Questions */}
      {selectedAnalysis && suitableQuestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
              Select Questions to Analyze
            </CardTitle>
            <CardDescription>
              Only questions with data types suitable for {currentAnalysisType?.name} are shown.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {suitableQuestions.map(q => (
                <button
                  key={q.id}
                  onClick={() => toggleQuestion(q.id)}
                  className={`text-left p-2 rounded-lg border text-sm transition-all ${
                    selectedQuestions.includes(q.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-4 w-4 rounded border flex items-center justify-center ${
                      selectedQuestions.includes(q.id) ? "bg-primary border-primary" : "border-muted-foreground/30"
                    }`}>
                      {selectedQuestions.includes(q.id) && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{q.label || q.title || q.name || q.id}</p>
                      <Badge variant="secondary" className="text-[10px] mt-0.5">{q.type}</Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Grouping variable for tests that need it */}
            {currentAnalysisType?.requiresGrouping && (
              <div className="pt-3 border-t">
                <label className="text-sm font-medium block mb-1">Grouping Variable (categorical)</label>
                <Select value={groupingQuestion} onValueChange={setGroupingQuestion}>
                  <SelectTrigger className="w-full md:w-64"><SelectValue placeholder="Select grouping question..." /></SelectTrigger>
                  <SelectContent>
                    {categoricalQuestions.map(q => (
                      <SelectItem key={q.id} value={q.id}>{q.label || q.title || q.name || q.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Separator />
            <Button
              onClick={runAnalysis}
              disabled={isAnalyzing || selectedQuestions.length === 0}
              className="gap-2"
              variant="acg"
            >
              {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isAnalyzing ? "Analyzing..." : "Run Analysis"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-6">
          {/* Summary */}
          {results.summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Analysis Results: {currentAnalysisType?.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{results.summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Statistics Table */}
          {results.statistics && results.statistics.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Statistical Output</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="w-full">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        {Object.keys(results.statistics[0]).map((k) => (
                          <th key={k} className="text-left p-2 font-medium text-muted-foreground">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.statistics.map((row: any, i: number) => (
                        <tr key={i} className="border-b hover:bg-muted/30">
                          {Object.values(row).map((v: any, j: number) => (
                            <td key={j} className="p-2">{typeof v === "number" ? v.toFixed(4) : String(v ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {renderCharts()}
          </div>

          {/* Interpretation */}
          {results.interpretation && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-accent" />
                  AI Interpretation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{results.interpretation}</p>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {results.recommendations && results.recommendations.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Recommendations</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {results.recommendations.map((r: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default StatisticalAnalysisView;
