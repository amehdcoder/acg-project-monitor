import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { localStatisticalAnalysis } from "@/lib/aiCreditFallback";
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

  // Use enhanced local analysis from aiCreditFallback
  const runLocalAnalysis = useCallback((submissions: any[], selectedQMeta: any[], analysisType: string): any | null => {
    return localStatisticalAnalysis(submissions, selectedQMeta, analysisType, groupingQuestion);
  }, [groupingQuestion]);

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

      // Use local analysis directly (no AI credits needed)
      const local = runLocalAnalysis(submissions, selectedQMeta, selectedAnalysis);
      if (local) {
        setResults(local);
        toast({ title: "Analysis Complete", description: "Results are ready." });
      } else {
        toast({ title: "Unsupported", description: `"${selectedAnalysis}" analysis is not available locally. Try Descriptive, Frequency, or Correlation.`, variant: "destructive" });
      }
      toast({ title: "Analysis Complete", description: "Statistical analysis results are ready." });
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
    <div className="space-y-6 p-3 sm:p-4 lg:p-6 max-w-[1200px] mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground lg:text-3xl flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/10 shadow-sm">
              <Calculator className="h-6 w-6 text-primary" />
            </div>
            Statistical Analysis
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1.5">
            Comprehensive statistical analyses on your form data — 16 methods including parametric and non-parametric tests
          </p>
        </div>
        {results && (
          <Badge variant="outline" className="self-start border-emerald-300 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 gap-1.5 px-3 py-1">
            <CheckCircle className="h-3.5 w-3.5" />
            Results Ready
          </Badge>
        )}
      </div>

      {/* Step 1: Select Project & Form */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-sm">1</span>
            Select Data Source
          </CardTitle>
          <CardDescription>Choose the project and form containing your data</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Project</label>
            <Select value={selectedProject} onValueChange={(v) => { setSelectedProject(v); setSelectedForm(""); setResults(null); }}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Select project..." /></SelectTrigger>
              <SelectContent>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Form</label>
            <Select value={selectedForm} onValueChange={(v) => { setSelectedForm(v); setSelectedQuestions([]); setResults(null); }} disabled={!selectedProject}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Select form..." /></SelectTrigger>
              <SelectContent>
                {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Choose Analysis Type */}
      {selectedForm && (
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-sm">2</span>
              Choose Analysis Type
            </CardTitle>
            <CardDescription>Select the statistical method. Only questions suitable for the chosen analysis will be available.</CardDescription>
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
                    className={`text-left p-3.5 rounded-xl border-2 transition-all group ${
                      selectedAnalysis === a.id
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                        : hasSuitable
                        ? "border-border hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm"
                        : "border-border/50 opacity-40 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`p-1.5 rounded-lg mt-0.5 ${selectedAnalysis === a.id ? "bg-primary/10" : "bg-muted"}`}>
                        <a.icon className={`h-4 w-4 flex-shrink-0 ${selectedAnalysis === a.id ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold leading-tight">{a.name}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>
                        <Badge variant="outline" className="mt-2 text-[10px] font-medium">
                          {suitable.length} question{suitable.length !== 1 ? "s" : ""}
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
        <Alert className="border-primary/20 bg-primary/5">
          <Lightbulb className="h-4 w-4 text-primary" />
          <AlertTitle className="text-primary">What this analysis will tell you</AlertTitle>
          <AlertDescription>{currentAnalysisType.insight}</AlertDescription>
        </Alert>
      )}

      {/* Step 3: Select Questions */}
      {selectedAnalysis && suitableQuestions.length > 0 && (
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-sm">3</span>
              Select Questions to Analyze
            </CardTitle>
            <CardDescription>
              Showing {suitableQuestions.length} question{suitableQuestions.length !== 1 ? "s" : ""} compatible with {currentAnalysisType?.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {suitableQuestions.map(q => (
                <button
                  key={q.id}
                  onClick={() => toggleQuestion(q.id)}
                  className={`text-left p-3 rounded-xl border-2 text-sm transition-all ${
                    selectedQuestions.includes(q.id)
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/30 hover:bg-muted/20"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      selectedQuestions.includes(q.id) ? "bg-primary border-primary" : "border-muted-foreground/30"
                    }`}>
                      {selectedQuestions.includes(q.id) && <CheckCircle className="h-3.5 w-3.5 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{q.label || q.title || q.name || q.id}</p>
                      <Badge variant="secondary" className="text-[10px] mt-1">{q.type}</Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Grouping variable for tests that need it */}
            {currentAnalysisType?.requiresGrouping && (
              <div className="pt-4 border-t border-border">
                <label className="text-sm font-medium block mb-1.5">Grouping Variable (categorical)</label>
                <Select value={groupingQuestion} onValueChange={setGroupingQuestion}>
                  <SelectTrigger className="w-full md:w-72 h-11"><SelectValue placeholder="Select grouping question..." /></SelectTrigger>
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
              className="gap-2 h-11 px-6"
              variant="acg"
              size="lg"
            >
              {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isAnalyzing ? "Analyzing..." : `Run ${currentAnalysisType?.name || "Analysis"}`}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-6">
          {/* Summary */}
          {results.summary && (
            <Card className="border-0 shadow-md border-l-4 border-l-emerald-500">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                  </div>
                  Analysis Results: {currentAnalysisType?.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{results.summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Statistics Table */}
          {results.statistics && results.statistics.length > 0 && (
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Statistical Output
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="w-full">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-primary/10">
                        {Object.keys(results.statistics[0]).map((k) => (
                          <th key={k} className="text-left p-2.5 font-semibold text-foreground text-xs uppercase tracking-wider">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.statistics.map((row: any, i: number) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                          {Object.values(row).map((v: any, j: number) => (
                            <td key={j} className="p-2.5 font-mono text-xs">{typeof v === "number" ? v.toFixed(4) : String(v ?? "")}</td>
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
            <Card className="border-0 shadow-md bg-gradient-to-br from-primary/5 to-accent/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <Lightbulb className="h-4 w-4 text-primary" />
                  </div>
                  Interpretation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{results.interpretation}</p>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {results.recommendations && results.recommendations.length > 0 && (
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="h-4 w-4 text-accent" />
                  Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {results.recommendations.map((r: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm p-2.5 rounded-lg bg-muted/30 border border-border/50">
                      <AlertTriangle className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{r}</span>
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
