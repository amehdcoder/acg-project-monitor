import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Brain, Database, Target, BarChart3, TrendingUp, Loader2,
  CheckCircle2, AlertTriangle, ArrowRight, Sparkles, PieChart,
  Settings2, Play, Download, RefreshCw
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, PieChart as RechartsPie, Pie, Cell, ScatterChart,
  Scatter, LineChart, Line
} from "recharts";

const ML_METHODS = [
  { value: "random_forest", label: "Random Forest", type: "classification", desc: "Ensemble of decision trees for robust predictions" },
  { value: "logistic_regression", label: "Logistic Regression", type: "classification", desc: "Linear model for binary/multi-class classification" },
  { value: "gradient_boosting", label: "Gradient Boosting", type: "classification", desc: "Sequential ensemble with high accuracy" },
  { value: "svm", label: "Support Vector Machine", type: "classification", desc: "Finds optimal separating hyperplane" },
  { value: "knn", label: "K-Nearest Neighbors", type: "classification", desc: "Instance-based classification" },
  { value: "naive_bayes", label: "Naive Bayes", type: "classification", desc: "Probabilistic classifier based on Bayes theorem" },
  { value: "linear_regression", label: "Linear Regression", type: "regression", desc: "Linear model for continuous outcomes" },
  { value: "random_forest_reg", label: "Random Forest Regressor", type: "regression", desc: "Ensemble regression model" },
  { value: "decision_tree", label: "Decision Tree", type: "both", desc: "Interpretable tree-based model" },
  { value: "neural_network", label: "Neural Network (MLP)", type: "both", desc: "Multi-layer perceptron for complex patterns" },
];

const PREDICTION_LEVELS = [
  { value: "community", label: "Community / Settlement" },
  { value: "ward", label: "Ward" },
  { value: "lga", label: "Local Government Area (District)" },
  { value: "state", label: "State (Province)" },
];

const CHART_COLORS = [
  "hsl(140, 65%, 22%)", "hsl(43, 80%, 50%)", "hsl(200, 70%, 50%)",
  "hsl(340, 65%, 50%)", "hsl(270, 60%, 55%)", "hsl(30, 80%, 55%)",
  "hsl(160, 60%, 40%)", "hsl(0, 70%, 55%)",
];

interface MLResults {
  metrics: Record<string, number>;
  feature_importances: { feature: string; importance: number }[];
  predictions: { area: string; predicted_value: string; confidence: number; sample_size?: number }[];
  confusion_matrix?: { labels: string[]; matrix: number[][] };
  insights: string[];
  recommendations?: string[];
  model_summary: string;
}

const MachineLearningView = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedForm, setSelectedForm] = useState("");
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [targetVariable, setTargetVariable] = useState("");
  const [mlMethod, setMlMethod] = useState("");
  const [predictionLevel, setPredictionLevel] = useState("lga");
  const [trainRatio, setTrainRatio] = useState(70);
  const [testRatio, setTestRatio] = useState(20);
  const [valRatio, setValRatio] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<MLResults | null>(null);
  const [activeResultTab, setActiveResultTab] = useState("overview");
  const [step, setStep] = useState(1);

  // Fetch projects
  useEffect(() => {
    const fetchProjects = async () => {
      const { data } = await supabase.from("projects").select("id, name").order("name");
      if (data) setProjects(data);
    };
    fetchProjects();
  }, []);

  // Fetch forms when project changes
  useEffect(() => {
    if (!selectedProject) { setForms([]); return; }
    const fetchForms = async () => {
      const { data } = await supabase.from("forms").select("id, name, questions").eq("project_id", selectedProject);
      if (data) setForms(data);
    };
    fetchForms();
    setSelectedForm("");
    setSubmissions([]);
    setFeatures([]);
    setSelectedFeatures([]);
    setTargetVariable("");
    setResults(null);
  }, [selectedProject]);

  // Fetch submissions & extract features
  useEffect(() => {
    if (!selectedForm) return;
    const fetchSubmissions = async () => {
      // Fetch all non-draft submissions (submitted, synced, etc.)
      const { data, error } = await supabase.from("form_submissions")
        .select("data, location, within_geofence, submitted_at, user_id, status")
        .eq("form_id", selectedForm)
        .neq("status", "draft")
        .limit(1000);
      
      if (error) {
        console.error("Error fetching submissions:", error);
        toast({ title: "Error", description: "Failed to load form submissions.", variant: "destructive" });
        return;
      }

      // Filter rows that actually have non-empty data
      const validData = (data || []).filter(s => {
        const d = s.data as Record<string, any>;
        return d && typeof d === 'object' && Object.keys(d).length > 0;
      });

      if (validData.length > 0) {
        setSubmissions(validData);
        // Extract all unique keys from submission data
        const allKeys = new Set<string>();
        validData.forEach(s => {
          const d = s.data as Record<string, any>;
          if (d && typeof d === 'object') Object.keys(d).forEach(k => allKeys.add(k));
        });
        // Add location-based features
        allKeys.add("_state");
        allKeys.add("_lga");
        allKeys.add("_ward");
        allKeys.add("_within_geofence");
        setFeatures(Array.from(allKeys).sort());
        toast({ title: "Data loaded", description: `${validData.length} submissions with ${allKeys.size} fields available.` });
      } else {
        setSubmissions([]);
        setFeatures([]);
        toast({ title: "No submissions", description: `This form has ${(data || []).length} submissions but none contain usable data fields.`, variant: "destructive" });
      }
    };
    fetchSubmissions();
    setSelectedFeatures([]);
    setTargetVariable("");
    setResults(null);
  }, [selectedForm]);

  // Auto-adjust split ratios
  const handleTrainRatioChange = (val: number[]) => {
    const train = val[0];
    const remaining = 100 - train;
    const test = Math.round(remaining * 0.67);
    const validation = remaining - test;
    setTrainRatio(train);
    setTestRatio(test);
    setValRatio(validation);
  };

  // Prepare data and run ML
  const runMLPipeline = async () => {
    if (selectedFeatures.length === 0 || !targetVariable || !mlMethod) {
      toast({ title: "Incomplete configuration", description: "Please select features, target, and ML method.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setResults(null);

    try {
      // Prepare data
      const sampleData = submissions.map(s => {
        const d = s.data as Record<string, any>;
        const row: Record<string, any> = {};
        [...selectedFeatures, targetVariable].forEach(f => {
          if (f.startsWith("_")) {
            if (f === "_state") row[f] = d.state || d.State || "";
            else if (f === "_lga") row[f] = d.lga || d.LGA || d.district || "";
            else if (f === "_ward") row[f] = d.ward || d.Ward || "";
            else if (f === "_within_geofence") row[f] = s.within_geofence;
          } else {
            row[f] = d[f];
          }
        });
        return row;
      });

      // Compute feature stats
      const featureStats: Record<string, any> = {};
      selectedFeatures.forEach(f => {
        const values = sampleData.map(r => r[f]).filter(v => v !== null && v !== undefined);
        const numericValues = values.filter(v => !isNaN(Number(v))).map(Number);
        if (numericValues.length > values.length * 0.5) {
          featureStats[f] = {
            type: "numeric",
            min: Math.min(...numericValues),
            max: Math.max(...numericValues),
            mean: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
            count: numericValues.length,
          };
        } else {
          const uniqueVals = [...new Set(values.map(String))];
          featureStats[f] = { type: "categorical", unique_values: uniqueVals.slice(0, 20), count: values.length };
        }
      });

      const targetValues = sampleData.map(r => r[targetVariable]).filter(v => v !== null && v !== undefined);
      const uniqueTargets = [...new Set(targetValues.map(String))].slice(0, 30);

      const { data: result, error } = await supabase.functions.invoke("ml-predict", {
        body: {
          action: "train_predict",
          data: {
            totalRecords: submissions.length,
            features: selectedFeatures,
            target: targetVariable,
            sampleData,
            uniqueTargets,
            featureStats,
          },
          config: {
            method: mlMethod,
            trainRatio,
            testRatio,
            valRatio,
            predictionLevel,
          },
        },
      });

      if (error) throw error;
      if (result.error) throw new Error(result.error);

      setResults(result);
      setStep(4);
      setActiveResultTab("overview");
      toast({ title: "Model trained successfully", description: "View your results below." });
    } catch (err: any) {
      console.error("ML error:", err);
      toast({ title: "ML Pipeline Error", description: err.message || "Failed to run ML pipeline", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedFormData = forms.find(f => f.id === selectedForm);
  const selectedMethodData = ML_METHODS.find(m => m.value === mlMethod);

  return (
    <div className="space-y-6 p-4 lg:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Brain className="h-7 w-7 text-primary" />
            </div>
            Machine Learning Studio
          </h1>
          <p className="mt-1 text-muted-foreground">Train models on form data to predict outcomes across geographic areas</p>
        </div>
        {results && (
          <Button variant="outline" size="sm" onClick={() => { setResults(null); setStep(1); }}>
            <RefreshCw className="h-4 w-4 mr-2" />New Analysis
          </Button>
        )}
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {[
          { num: 1, label: "Select Data" },
          { num: 2, label: "Configure Features" },
          { num: 3, label: "Choose Model" },
          { num: 4, label: "Results" },
        ].map((s, i) => (
          <div key={s.num} className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => s.num <= step && setStep(s.num)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                step === s.num ? "bg-primary text-primary-foreground shadow-md" :
                step > s.num ? "bg-primary/20 text-primary cursor-pointer" :
                "bg-muted text-muted-foreground"
              }`}
            >
              {step > s.num ? <CheckCircle2 className="h-4 w-4" /> : <span>{s.num}</span>}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < 3 && <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
          </div>
        ))}
      </div>

      {/* Step 1: Data Selection */}
      {step === 1 && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="h-5 w-5 text-primary" />Select Project
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger><SelectValue placeholder="Choose a project..." /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-primary" />Select Form
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={selectedForm} onValueChange={setSelectedForm} disabled={!selectedProject}>
                <SelectTrigger><SelectValue placeholder="Choose a form..." /></SelectTrigger>
                <SelectContent>
                  {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {submissions.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>{submissions.length} submissions loaded with {features.length} available fields</span>
                </div>
              )}
            </CardContent>
          </Card>
          {submissions.length > 0 && (
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={() => setStep(2)}>Continue to Feature Selection <ArrowRight className="h-4 w-4 ml-2" /></Button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Feature Configuration */}
      {step === 2 && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings2 className="h-5 w-5 text-primary" />Select Features (Input Variables)
              </CardTitle>
              <CardDescription>Choose the variables to use as predictors. Selected: {selectedFeatures.length}</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {features.filter(f => f !== targetVariable).map(f => (
                    <label key={f} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                      selectedFeatures.includes(f) ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}>
                      <Checkbox
                        checked={selectedFeatures.includes(f)}
                        onCheckedChange={checked => {
                          setSelectedFeatures(prev => checked ? [...prev, f] : prev.filter(x => x !== f));
                        }}
                      />
                      <span className="text-sm font-medium truncate">{f.startsWith("_") ? f.slice(1).toUpperCase() : f}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedFeatures(features.filter(f => f !== targetVariable))}>Select All</Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedFeatures([])}>Clear All</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-accent" />Target Variable
              </CardTitle>
              <CardDescription>The variable you want to predict</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={targetVariable} onValueChange={v => {
                setTargetVariable(v);
                setSelectedFeatures(prev => prev.filter(f => f !== v));
              }}>
                <SelectTrigger><SelectValue placeholder="Choose target..." /></SelectTrigger>
                <SelectContent>
                  {features.map(f => <SelectItem key={f} value={f}>{f.startsWith("_") ? f.slice(1).toUpperCase() : f}</SelectItem>)}
                </SelectContent>
              </Select>

              <Separator />

              <div className="space-y-3">
                <Label className="text-sm font-semibold">Data Split</Label>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Train: {trainRatio}%</span>
                    <span>Test: {testRatio}%</span>
                    <span>Val: {valRatio}%</span>
                  </div>
                  <Slider value={[trainRatio]} onValueChange={handleTrainRatioChange} min={50} max={90} step={5} />
                  <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                    <div className="bg-primary transition-all" style={{ width: `${trainRatio}%` }} />
                    <div className="bg-accent transition-all" style={{ width: `${testRatio}%` }} />
                    <div className="bg-muted-foreground/30 transition-all" style={{ width: `${valRatio}%` }} />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Prediction Level</Label>
                <Select value={predictionLevel} onValueChange={setPredictionLevel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PREDICTION_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {selectedFeatures.length > 0 && targetVariable && (
                <Button className="w-full" onClick={() => setStep(3)}>
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 3: Model Selection */}
      {step === 3 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Brain className="h-5 w-5 text-primary" />Select Machine Learning Method
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ML_METHODS.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setMlMethod(m.value)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      mlMethod === m.value
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm text-foreground">{m.label}</span>
                      <Badge variant={m.type === "classification" ? "default" : m.type === "regression" ? "secondary" : "outline"} className="text-[10px]">
                        {m.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Summary Card */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div><span className="text-muted-foreground">Data:</span><p className="font-semibold">{submissions.length} records</p></div>
                <div><span className="text-muted-foreground">Features:</span><p className="font-semibold">{selectedFeatures.length} selected</p></div>
                <div><span className="text-muted-foreground">Target:</span><p className="font-semibold truncate">{targetVariable}</p></div>
                <div><span className="text-muted-foreground">Method:</span><p className="font-semibold">{selectedMethodData?.label || "—"}</p></div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={runMLPipeline} disabled={!mlMethod || isLoading} size="lg" className="gap-2">
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                  {isLoading ? "Training Model..." : "Train & Predict"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {isLoading && (
            <Card>
              <CardContent className="py-12 text-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
                <div>
                  <p className="font-semibold text-foreground">Training your model...</p>
                  <p className="text-sm text-muted-foreground">Analyzing {submissions.length} records with {selectedFeatures.length} features</p>
                </div>
                <Progress value={66} className="max-w-md mx-auto" />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Step 4: Results */}
      {step === 4 && results && (
        <div className="space-y-6">
          {/* Model Summary */}
          <Card className="border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-primary/10">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-lg">Model Summary</h3>
                  <p className="text-sm text-muted-foreground mt-1">{results.model_summary}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(results.metrics).filter(([_, v]) => v !== null && v !== undefined).slice(0, 8).map(([key, value]) => (
              <Card key={key}>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{key.replace(/_/g, " ")}</p>
                  <p className="text-2xl font-bold text-foreground">
                    {typeof value === "number" ? (value < 1 && value > 0 ? `${(value * 100).toFixed(1)}%` : value.toFixed(4)) : value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Result Tabs */}
          <Tabs value={activeResultTab} onValueChange={setActiveResultTab}>
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="overview">Feature Importance</TabsTrigger>
              <TabsTrigger value="predictions">Predictions</TabsTrigger>
              {results.confusion_matrix && <TabsTrigger value="confusion">Confusion Matrix</TabsTrigger>}
              <TabsTrigger value="insights">Insights</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card>
                <CardHeader><CardTitle>Feature Importance</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={results.feature_importances.sort((a, b) => b.importance - a.importance)} layout="vertical" margin={{ left: 120 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
                        <YAxis type="category" dataKey="feature" width={110} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v: number) => `${(v * 100).toFixed(2)}%`} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                        <Bar dataKey="importance" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="predictions">
              <Card>
                <CardHeader>
                  <CardTitle>Predictions by {PREDICTION_LEVELS.find(l => l.value === predictionLevel)?.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {results.predictions.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">{p.area}</p>
                          <p className="text-sm text-muted-foreground">Prediction: <span className="font-medium text-primary">{p.predicted_value}</span></p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{(p.confidence * 100).toFixed(1)}%</span>
                            <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${p.confidence * 100}%` }} />
                            </div>
                          </div>
                          {p.sample_size && <p className="text-xs text-muted-foreground mt-1">n = {p.sample_size}</p>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Confidence distribution chart */}
                  <div className="mt-6 h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={results.predictions}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="area" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={80} />
                        <YAxis tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
                        <Tooltip formatter={(v: number) => `${(v * 100).toFixed(1)}%`} contentStyle={{ borderRadius: 8 }} />
                        <Bar dataKey="confidence" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} name="Confidence" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {results.confusion_matrix && (
              <TabsContent value="confusion">
                <Card>
                  <CardHeader><CardTitle>Confusion Matrix</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="p-2 text-left text-muted-foreground">Actual \ Predicted</th>
                            {results.confusion_matrix.labels.map(l => (
                              <th key={l} className="p-2 text-center font-medium">{l}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {results.confusion_matrix.matrix.map((row, i) => (
                            <tr key={i}>
                              <td className="p-2 font-medium">{results.confusion_matrix!.labels[i]}</td>
                              {row.map((val, j) => (
                                <td key={j} className={`p-2 text-center font-semibold rounded ${i === j ? "bg-primary/10 text-primary" : ""}`}>
                                  {val}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            <TabsContent value="insights">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Key Insights</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {results.insights.map((insight, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-foreground">{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
                {results.recommendations && results.recommendations.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-accent" />Recommendations</CardTitle></CardHeader>
                    <CardContent>
                      <ul className="space-y-3">
                        {results.recommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <TrendingUp className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
                            <span className="text-sm text-foreground">{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
};

export default MachineLearningView;
