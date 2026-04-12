import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { isAiCreditError, localMLPrediction, AI_CREDIT_TOAST } from "@/lib/aiCreditFallback";
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
import { Switch } from "@/components/ui/switch";
import {
  Brain, Database, Target, BarChart3, TrendingUp, Loader2,
  CheckCircle2, AlertTriangle, ArrowRight, Sparkles, PieChart,
  Settings2, Play, Download, RefreshCw, ShieldCheck, Scale, Activity,
  MapPin, GitCompare, Save, Trash2, Eye
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

interface CoverageItem {
  area: string;
  most_prevalent_outcome: string;
  coverage_percentage: number;
  outcome_distribution: Record<string, number>;
  total_observations: number;
  predicted_observations: number;
}

interface ModelHealthMetrics {
  overfitting_risk: "low" | "medium" | "high";
  underfitting_risk: "low" | "medium" | "high";
  train_test_gap: number;
  bias_variance_assessment: string;
  class_balance_status: string;
  recommendations: string[];
}

interface MLResults {
  metrics: Record<string, number>;
  feature_importances: { feature: string; importance: number }[];
  predictions: { area: string; predicted_value: string; confidence: number; sample_size?: number }[];
  confusion_matrix?: { labels: string[]; matrix: number[][] };
  insights: string[];
  recommendations?: string[];
  model_summary: string;
  coverage_analysis?: CoverageItem[];
  model_health?: ModelHealthMetrics;
}

interface SavedModelRun {
  id: string;
  name: string;
  method: string;
  methodLabel: string;
  features: string[];
  target: string;
  predictionLevel: string;
  config: {
    trainRatio: number;
    testRatio: number;
    valRatio: number;
    regularization: boolean;
    regularizationStrength: number;
    classBalancing: boolean;
    crossValidationFolds: number;
    earlyStopping: boolean;
    maxDepth: number;
    minSamplesLeaf: number;
  };
  results: MLResults;
  timestamp: Date;
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
  const [showComparison, setShowComparison] = useState(false);
  const [savedRuns, setSavedRuns] = useState<SavedModelRun[]>([]);
  const [comparisonRunIds, setComparisonRunIds] = useState<string[]>([]);
  // Model health controls
  const [enableRegularization, setEnableRegularization] = useState(true);
  const [regularizationStrength, setRegularizationStrength] = useState(50);
  const [enableClassBalancing, setEnableClassBalancing] = useState(true);
  const [crossValidationFolds, setCrossValidationFolds] = useState(5);
  const [enableEarlyStopping, setEnableEarlyStopping] = useState(true);
  const [maxDepth, setMaxDepth] = useState(10);
  const [minSamplesLeaf, setMinSamplesLeaf] = useState(5);

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

      const validData = (data || []).filter(s => {
        const d = s.data as Record<string, any>;
        return d && typeof d === 'object' && Object.keys(d).length > 0;
      });

      if (validData.length > 0) {
        setSubmissions(validData);
        const allKeys = new Set<string>();
        validData.forEach(s => {
          const d = s.data as Record<string, any>;
          if (d && typeof d === 'object') Object.keys(d).forEach(k => allKeys.add(k));
        });
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

  // Compute data quality diagnostics
  const dataDiagnostics = useMemo(() => {
    if (!submissions.length || !targetVariable) return null;

    const targetValues = submissions.map(s => {
      const d = s.data as Record<string, any>;
      if (targetVariable.startsWith("_")) {
        if (targetVariable === "_state") return d.state || d.State || "";
        if (targetVariable === "_lga") return d.lga || d.LGA || d.district || "";
        if (targetVariable === "_ward") return d.ward || d.Ward || "";
        if (targetVariable === "_within_geofence") return s.within_geofence;
      }
      return d[targetVariable];
    }).filter(v => v !== null && v !== undefined && v !== "");

    const classCounts: Record<string, number> = {};
    targetValues.forEach(v => {
      const key = String(v);
      classCounts[key] = (classCounts[key] || 0) + 1;
    });

    const classes = Object.entries(classCounts).sort((a, b) => b[1] - a[1]);
    const totalSamples = targetValues.length;
    const maxClassCount = classes.length > 0 ? classes[0][1] : 0;
    const minClassCount = classes.length > 0 ? classes[classes.length - 1][1] : 0;
    const imbalanceRatio = minClassCount > 0 ? maxClassCount / minClassCount : Infinity;
    const isImbalanced = imbalanceRatio > 3;

    // Check for low sample warning
    const lowSampleWarning = totalSamples < 50;
    const veryLowPerClass = classes.some(([_, count]) => count < 5);

    // Feature-to-sample ratio (overfitting risk indicator)
    const featureRatio = selectedFeatures.length / Math.max(totalSamples, 1);
    const highFeatureRatio = featureRatio > 0.1;

    return {
      classCounts: classes,
      totalSamples,
      imbalanceRatio,
      isImbalanced,
      lowSampleWarning,
      veryLowPerClass,
      highFeatureRatio,
      featureRatio,
      numClasses: classes.length,
    };
  }, [submissions, targetVariable, selectedFeatures]);

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

      // Try Google Gemini AI via edge function first
      let aiResult: any = null;
      try {
        const { data, error } = await supabase.functions.invoke("ml-predict", {
          body: {
            sampleData: sampleData.slice(0, 200),
            features: selectedFeatures,
            target: targetVariable,
            method: mlMethod,
            featureStats,
            uniqueTargets,
            predictionLevel,
            config: {
              trainRatio, testRatio, valRatio,
              regularization: enableRegularization,
              regularizationStrength,
              classBalancing: enableClassBalancing,
              crossValidationFolds,
              earlyStopping: enableEarlyStopping,
              maxDepth, minSamplesLeaf,
            },
          },
        });
        if (!error && data && !data.error) {
          aiResult = data;
        }
      } catch (aiErr) {
        console.warn("Gemini ML prediction unavailable, using local:", aiErr);
      }

      const result = aiResult || localMLPrediction(sampleData, selectedFeatures, targetVariable, mlMethod);
      if (result.error) throw new Error(result.error);
      setResults(result);
      setStep(4);
      setActiveResultTab("overview");
      toast({ 
        title: "Model trained successfully", 
        description: aiResult ? "Powered by Google Gemini AI." : "Using local ML algorithms.",
      });
    } catch (err: any) {
      console.error("ML error:", err);
      toast({ title: "ML Pipeline Error", description: err.message || "Failed to run ML pipeline", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedFormData = forms.find(f => f.id === selectedForm);
  const selectedMethodData = ML_METHODS.find(m => m.value === mlMethod);

  // Get risk color
  const getRiskColor = (risk: string) => {
    if (risk === "low") return "text-green-600 bg-green-50 border-green-200";
    if (risk === "medium") return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const getRiskBadgeVariant = (risk: string): "default" | "secondary" | "destructive" | "outline" => {
    if (risk === "low") return "default";
    if (risk === "medium") return "secondary";
    return "destructive";
  };

  const saveCurrentRun = () => {
    if (!results || !mlMethod) return;
    const run: SavedModelRun = {
      id: crypto.randomUUID(),
      name: `${selectedMethodData?.label || mlMethod} — ${new Date().toLocaleTimeString()}`,
      method: mlMethod,
      methodLabel: selectedMethodData?.label || mlMethod,
      features: [...selectedFeatures],
      target: targetVariable,
      predictionLevel,
      config: {
        trainRatio, testRatio, valRatio,
        regularization: enableRegularization,
        regularizationStrength,
        classBalancing: enableClassBalancing,
        crossValidationFolds,
        earlyStopping: enableEarlyStopping,
        maxDepth, minSamplesLeaf,
      },
      results,
      timestamp: new Date(),
    };
    setSavedRuns(prev => [...prev, run]);
    toast({ title: "Model saved", description: `Saved as "${run.name}" for comparison.` });
  };

  const removeRun = (id: string) => {
    setSavedRuns(prev => prev.filter(r => r.id !== id));
    setComparisonRunIds(prev => prev.filter(rid => rid !== id));
  };

  const toggleComparisonRun = (id: string) => {
    setComparisonRunIds(prev => prev.includes(id) ? prev.filter(rid => rid !== id) : [...prev, id]);
  };

  const comparisonRuns = savedRuns.filter(r => comparisonRunIds.includes(r.id));

  // Key comparison metrics
  const COMPARE_METRICS = ["accuracy", "precision", "recall", "f1_score", "train_accuracy", "test_accuracy", "cross_val_mean"];

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
        <div className="flex gap-2">
          {savedRuns.length >= 2 && (
            <Button
              variant={showComparison ? "default" : "outline"}
              size="sm"
              onClick={() => setShowComparison(!showComparison)}
            >
              <GitCompare className="h-4 w-4 mr-2" />
              Compare Models ({savedRuns.length})
            </Button>
          )}
          {results && (
            <Button variant="outline" size="sm" onClick={() => { setResults(null); setStep(1); }}>
              <RefreshCw className="h-4 w-4 mr-2" />New Analysis
            </Button>
          )}
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {[
          { num: 1, label: "Select Data" },
          { num: 2, label: "Configure Features" },
          { num: 3, label: "Model & Health" },
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

              {/* Data Quality Diagnostics */}
              {dataDiagnostics && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <Activity className="h-4 w-4" />Data Quality Check
                    </Label>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <span className="text-muted-foreground">Total samples</span>
                        <Badge variant={dataDiagnostics.lowSampleWarning ? "destructive" : "default"} className="text-[10px]">
                          {dataDiagnostics.totalSamples}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <span className="text-muted-foreground">Target classes</span>
                        <Badge variant="secondary" className="text-[10px]">{dataDiagnostics.numClasses}</Badge>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <span className="text-muted-foreground">Class imbalance</span>
                        <Badge variant={dataDiagnostics.isImbalanced ? "destructive" : "default"} className="text-[10px]">
                          {dataDiagnostics.isImbalanced ? `${dataDiagnostics.imbalanceRatio.toFixed(1)}x imbalanced` : "Balanced"}
                        </Badge>
                      </div>
                      {dataDiagnostics.highFeatureRatio && (
                        <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 flex-shrink-0" />
                          <span className="text-destructive">High feature-to-sample ratio ({(dataDiagnostics.featureRatio * 100).toFixed(0)}%) — risk of overfitting. Consider reducing features.</span>
                        </div>
                      )}
                      {dataDiagnostics.lowSampleWarning && (
                        <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 flex-shrink-0" />
                          <span className="text-destructive">Low sample count — model may underfit. Collect more data if possible.</span>
                        </div>
                      )}
                      {dataDiagnostics.isImbalanced && (
                        <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-50 border border-yellow-200">
                          <Scale className="h-3.5 w-3.5 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <span className="text-yellow-700">Imbalanced classes detected. Class balancing is recommended (enabled in Model & Health settings).</span>
                        </div>
                      )}
                    </div>
                    {/* Class distribution mini chart */}
                    {dataDiagnostics.classCounts.length > 0 && dataDiagnostics.classCounts.length <= 10 && (
                      <div className="space-y-1 pt-1">
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Class Distribution</span>
                        {dataDiagnostics.classCounts.map(([cls, count], i) => (
                          <div key={cls} className="flex items-center gap-2 text-xs">
                            <span className="w-20 truncate text-muted-foreground">{cls}</span>
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${(count / dataDiagnostics.totalSamples) * 100}%`,
                                  backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                                }}
                              />
                            </div>
                            <span className="w-8 text-right font-medium">{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {selectedFeatures.length > 0 && targetVariable && (
                <Button className="w-full" onClick={() => setStep(3)}>
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 3: Model Selection + Health Controls */}
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

          {/* Overfitting / Underfitting Controls */}
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Model Health Controls
              </CardTitle>
              <CardDescription>
                Configure settings to prevent overfitting (model memorizes training data) and underfitting (model is too simple)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                {/* Left column */}
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-semibold">Regularization</Label>
                      <p className="text-xs text-muted-foreground">Penalizes overly complex models to prevent overfitting</p>
                    </div>
                    <Switch checked={enableRegularization} onCheckedChange={setEnableRegularization} />
                  </div>
                  {enableRegularization && (
                    <div className="pl-1 space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Weak (risk underfit)</span>
                        <span>Strong (risk overfit)</span>
                      </div>
                      <Slider value={[regularizationStrength]} onValueChange={v => setRegularizationStrength(v[0])} min={10} max={90} step={10} />
                      <p className="text-xs text-center text-muted-foreground">Strength: {regularizationStrength}%</p>
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-semibold">Class Balancing (SMOTE/Weighting)</Label>
                      <p className="text-xs text-muted-foreground">Handles imbalanced classes to improve minority class predictions</p>
                    </div>
                    <Switch checked={enableClassBalancing} onCheckedChange={setEnableClassBalancing} />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-semibold">Early Stopping</Label>
                      <p className="text-xs text-muted-foreground">Stops training when validation error starts increasing</p>
                    </div>
                    <Switch checked={enableEarlyStopping} onCheckedChange={setEnableEarlyStopping} />
                  </div>
                </div>

                {/* Right column */}
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Cross-Validation Folds</Label>
                    <p className="text-xs text-muted-foreground">Higher folds = more robust evaluation, slower training</p>
                    <Select value={String(crossValidationFolds)} onValueChange={v => setCrossValidationFolds(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3-fold (faster)</SelectItem>
                        <SelectItem value="5">5-fold (recommended)</SelectItem>
                        <SelectItem value="10">10-fold (thorough)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Max Tree Depth</Label>
                    <p className="text-xs text-muted-foreground">Limits model complexity. Lower = less overfitting risk.</p>
                    <div className="flex items-center gap-3">
                      <Slider value={[maxDepth]} onValueChange={v => setMaxDepth(v[0])} min={2} max={30} step={1} className="flex-1" />
                      <span className="text-sm font-medium w-8 text-right">{maxDepth}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Min Samples per Leaf</Label>
                    <p className="text-xs text-muted-foreground">Prevents model from creating very specific rules for few samples</p>
                    <div className="flex items-center gap-3">
                      <Slider value={[minSamplesLeaf]} onValueChange={v => setMinSamplesLeaf(v[0])} min={1} max={20} step={1} className="flex-1" />
                      <span className="text-sm font-medium w-8 text-right">{minSamplesLeaf}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Card */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
                <div><span className="text-muted-foreground">Data:</span><p className="font-semibold">{submissions.length} records</p></div>
                <div><span className="text-muted-foreground">Features:</span><p className="font-semibold">{selectedFeatures.length} selected</p></div>
                <div><span className="text-muted-foreground">Target:</span><p className="font-semibold truncate">{targetVariable}</p></div>
                <div><span className="text-muted-foreground">Method:</span><p className="font-semibold">{selectedMethodData?.label || "—"}</p></div>
                <div><span className="text-muted-foreground">CV Folds:</span><p className="font-semibold">{crossValidationFolds}-fold</p></div>
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
          {/* Save to comparison button */}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={saveCurrentRun} className="gap-2">
              <Save className="h-4 w-4" />Save to Comparison
            </Button>
          </div>
          {/* Model Health Assessment */}
          {results.model_health && (
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5 text-primary" />Model Health Assessment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div className={`p-3 rounded-lg border text-center ${getRiskColor(results.model_health.overfitting_risk)}`}>
                    <p className="text-xs font-medium uppercase tracking-wider mb-1">Overfitting Risk</p>
                    <Badge variant={getRiskBadgeVariant(results.model_health.overfitting_risk)} className="text-xs">
                      {results.model_health.overfitting_risk.toUpperCase()}
                    </Badge>
                  </div>
                  <div className={`p-3 rounded-lg border text-center ${getRiskColor(results.model_health.underfitting_risk)}`}>
                    <p className="text-xs font-medium uppercase tracking-wider mb-1">Underfitting Risk</p>
                    <Badge variant={getRiskBadgeVariant(results.model_health.underfitting_risk)} className="text-xs">
                      {results.model_health.underfitting_risk.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="p-3 rounded-lg border bg-muted/30 text-center">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Train-Test Gap</p>
                    <p className="text-lg font-bold text-foreground">{(results.model_health.train_test_gap * 100).toFixed(1)}%</p>
                  </div>
                  <div className="p-3 rounded-lg border bg-muted/30 text-center">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Class Balance</p>
                    <p className="text-xs font-semibold text-foreground">{results.model_health.class_balance_status}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{results.model_health.bias_variance_assessment}</p>
                {results.model_health.recommendations.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {results.model_health.recommendations.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{r}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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
              <TabsTrigger value="coverage">Coverage Analysis</TabsTrigger>
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

            {/* Coverage Analysis Tab */}
            <TabsContent value="coverage">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    Intervention Coverage Analysis
                  </CardTitle>
                  <CardDescription>
                    Most prevalent predicted outcome per {PREDICTION_LEVELS.find(l => l.value === predictionLevel)?.label} with coverage percentage.
                    The model generalizes from observed communities to predict the overall status across each area.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {results.coverage_analysis && results.coverage_analysis.length > 0 ? (
                    <div className="space-y-6">
                      {/* Coverage cards */}
                      <div className="space-y-3">
                        {results.coverage_analysis.map((item, i) => (
                          <div key={i} className="p-4 rounded-xl border bg-card">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h4 className="font-semibold text-foreground text-base">{item.area}</h4>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {item.predicted_observations} of {item.total_observations} observations predicted
                                </p>
                              </div>
                              <div className="text-right">
                                <Badge variant="default" className="text-sm px-3 py-1">
                                  {item.most_prevalent_outcome}
                                </Badge>
                                <p className="text-2xl font-bold text-primary mt-1">{item.coverage_percentage.toFixed(1)}%</p>
                                <p className="text-[10px] text-muted-foreground">coverage</p>
                              </div>
                            </div>
                            {/* Outcome distribution bar */}
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-muted-foreground">Predicted Outcome Distribution</p>
                              <div className="flex h-4 rounded-full overflow-hidden">
                                {Object.entries(item.outcome_distribution).sort((a, b) => b[1] - a[1]).map(([outcome, pct], j) => (
                                  <div
                                    key={outcome}
                                    className="h-full transition-all relative group"
                                    style={{
                                      width: `${pct}%`,
                                      backgroundColor: CHART_COLORS[j % CHART_COLORS.length],
                                      minWidth: pct > 0 ? '4px' : 0,
                                    }}
                                    title={`${outcome}: ${pct.toFixed(1)}%`}
                                  />
                                ))}
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                {Object.entries(item.outcome_distribution).sort((a, b) => b[1] - a[1]).map(([outcome, pct], j) => (
                                  <div key={outcome} className="flex items-center gap-1.5 text-xs">
                                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS[j % CHART_COLORS.length] }} />
                                    <span className="text-muted-foreground">{outcome}:</span>
                                    <span className="font-medium">{pct.toFixed(1)}%</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Coverage summary chart */}
                      <div className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={results.coverage_analysis} margin={{ bottom: 60 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="area" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={80} />
                            <YAxis tickFormatter={v => `${v}%`} domain={[0, 100]} />
                            <Tooltip
                              formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name]}
                              contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                            />
                            <Legend />
                            <Bar dataKey="coverage_percentage" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Coverage %" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <MapPin className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">Coverage analysis not available</p>
                      <p className="text-sm mt-1">The model did not return coverage data. Re-run with a categorical target variable (e.g., MDA status).</p>
                    </div>
                  )}
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

      {/* Model Comparison View */}
      {showComparison && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <GitCompare className="h-5 w-5 text-primary" />Model Comparison
              </CardTitle>
              <CardDescription>Select models to compare side by side. Train models with different settings and save them.</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Saved runs list */}
              <div className="space-y-2 mb-6">
                {savedRuns.map(run => (
                  <div key={run.id} className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${
                    comparisonRunIds.includes(run.id) ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`} onClick={() => toggleComparisonRun(run.id)}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Checkbox checked={comparisonRunIds.includes(run.id)} onCheckedChange={() => toggleComparisonRun(run.id)} />
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{run.name}</p>
                        <p className="text-xs text-muted-foreground">{run.features.length} features · Target: {run.target} · {run.config.crossValidationFolds}-fold CV</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {run.results.model_health && (
                        <Badge variant={getRiskBadgeVariant(run.results.model_health.overfitting_risk)} className="text-[10px]">
                          Overfit: {run.results.model_health.overfitting_risk}
                        </Badge>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); removeRun(run.id); }}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
                {savedRuns.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No saved models yet. Train a model and click "Save to Comparison" to start.</p>
                )}
              </div>

              {/* Side-by-side comparison */}
              {comparisonRuns.length >= 2 && (
                <div className="space-y-6">
                  {/* Metrics comparison table */}
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-3">Performance Metrics</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left p-2 text-muted-foreground font-medium">Metric</th>
                            {comparisonRuns.map(run => (
                              <th key={run.id} className="text-center p-2 font-medium text-foreground">{run.methodLabel}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {COMPARE_METRICS.map(metric => {
                            const values = comparisonRuns.map(r => r.results.metrics[metric]);
                            const hasValues = values.some(v => v !== undefined && v !== null);
                            if (!hasValues) return null;
                            const bestVal = Math.max(...values.filter(v => v != null));
                            return (
                              <tr key={metric} className="border-b border-border/50">
                                <td className="p-2 text-muted-foreground capitalize">{metric.replace(/_/g, " ")}</td>
                                {values.map((val, i) => (
                                  <td key={i} className={`p-2 text-center font-medium ${val === bestVal ? "text-primary font-bold" : "text-foreground"}`}>
                                    {val != null ? `${(val * 100).toFixed(1)}%` : "—"}
                                    {val === bestVal && <span className="ml-1 text-[10px]">★</span>}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Health comparison */}
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-3">Model Health Comparison</h4>
                    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${comparisonRuns.length}, 1fr)` }}>
                      {comparisonRuns.map(run => (
                        <Card key={run.id} className="border-border">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">{run.methodLabel}</CardTitle>
                            <CardDescription className="text-xs">{run.config.trainRatio}/{run.config.testRatio}/{run.config.valRatio} split</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {run.results.model_health ? (
                              <>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Overfitting</span>
                                  <Badge variant={getRiskBadgeVariant(run.results.model_health.overfitting_risk)} className="text-[10px]">
                                    {run.results.model_health.overfitting_risk}
                                  </Badge>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Underfitting</span>
                                  <Badge variant={getRiskBadgeVariant(run.results.model_health.underfitting_risk)} className="text-[10px]">
                                    {run.results.model_health.underfitting_risk}
                                  </Badge>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Train-Test Gap</span>
                                  <span className="font-medium text-foreground">{(run.results.model_health.train_test_gap * 100).toFixed(1)}%</span>
                                </div>
                                <Separator />
                                <div className="space-y-1 text-xs text-muted-foreground">
                                  <p>{run.config.regularization ? `✓ Regularization (${run.config.regularizationStrength}%)` : "✗ No regularization"}</p>
                                  <p>{run.config.classBalancing ? "✓ Class balancing" : "✗ No class balancing"}</p>
                                  <p>{run.config.earlyStopping ? "✓ Early stopping" : "✗ No early stopping"}</p>
                                </div>
                              </>
                            ) : (
                              <p className="text-xs text-muted-foreground">No health data</p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {/* Radar chart comparison */}
                  <Card>
                    <CardHeader><CardTitle className="text-sm">Performance Radar</CardTitle></CardHeader>
                    <CardContent>
                      <div className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={COMPARE_METRICS.map(m => ({
                            metric: m.replace(/_/g, " "),
                            ...Object.fromEntries(comparisonRuns.map(r => [r.id, (r.results.metrics[m] ?? 0) * 100]))
                          }))}>
                            <PolarGrid stroke="hsl(var(--border))" />
                            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10 }} />
                            <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                            {comparisonRuns.map((run, i) => (
                              <Radar key={run.id} name={run.methodLabel} dataKey={run.id} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.15} />
                            ))}
                            <Legend />
                            <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
              {comparisonRuns.length < 2 && savedRuns.length >= 2 && (
                <p className="text-sm text-muted-foreground text-center py-4">Select at least 2 models above to compare.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default MachineLearningView;
