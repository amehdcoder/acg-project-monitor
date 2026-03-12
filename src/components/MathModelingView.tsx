import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Calculator, Play, Loader2, Plus, Trash2, Upload, Sparkles,
  TrendingUp, BarChart3, Target, AlertTriangle, FileSpreadsheet,
  Variable, FlaskConical, LineChart as LineChartIcon, Sigma, Copy, Check, Code, Download,
  Zap, Clock, Brain, BookOpen, Lightbulb, Info, Eye, EyeOff, FileDown, RotateCcw
} from "lucide-react";
import jsPDF from "jspdf";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter,
  ReferenceLine
} from "recharts";
import * as XLSX from "xlsx";

const COLORS = [
  "hsl(140, 65%, 22%)", "hsl(43, 80%, 50%)", "hsl(200, 70%, 50%)",
  "hsl(340, 65%, 50%)", "hsl(270, 60%, 55%)", "hsl(30, 80%, 55%)",
  "hsl(160, 60%, 40%)", "hsl(0, 70%, 55%)", "hsl(220, 60%, 55%)",
  "hsl(100, 50%, 40%)",
];

const PRESET_MODELS = [
  {
    name: "SIR Model",
    equations: ["dS/dt = -beta * S * I / N", "dI/dt = beta * S * I / N - gamma * I", "dR/dt = gamma * I"],
    parameters: { beta: 0.3, gamma: 0.1, N: 1000 },
    initialValues: { S: 999, I: 1, R: 0 },
    compartments: ["S", "I", "R"],
  },
  {
    name: "SEIR Model",
    equations: ["dS/dt = -beta * S * I / N", "dE/dt = beta * S * I / N - sigma * E", "dI/dt = sigma * E - gamma * I", "dR/dt = gamma * I"],
    parameters: { beta: 0.5, sigma: 0.2, gamma: 0.1, N: 10000 },
    initialValues: { S: 9999, E: 0, I: 1, R: 0 },
    compartments: ["S", "E", "I", "R"],
  },
  {
    name: "SIS Model",
    equations: ["dS/dt = -beta * S * I / N + gamma * I", "dI/dt = beta * S * I / N - gamma * I"],
    parameters: { beta: 0.4, gamma: 0.15, N: 1000 },
    initialValues: { S: 990, I: 10 },
    compartments: ["S", "I"],
  },
  {
    name: "SIRS Model",
    equations: ["dS/dt = -beta * S * I / N + xi * R", "dI/dt = beta * S * I / N - gamma * I", "dR/dt = gamma * I - xi * R"],
    parameters: { beta: 0.3, gamma: 0.1, xi: 0.01, N: 1000 },
    initialValues: { S: 999, I: 1, R: 0 },
    compartments: ["S", "I", "R"],
  },
  {
    name: "SEITF Model (NTD)",
    equations: [
      "dShcn/dt = eta_h - beta_sac * epsilon * Fc * kappa_w * Shcn - omega * Shcn - a_sac * Shcn - mu_sac * Shcn",
      "dEhcn/dt = beta_sac * epsilon * Fc * kappa_w * Shcn - (b_sac + alpha_h + omega + mu_sac) * Ehcn",
      "dIhcn/dt = alpha_h * Ehcn - (d_sac + omega + mu_sac + delta_sac) * Ihcn",
      "dShce/dt = rho_sac * Thce - beta_sac * epsilon * Fc * kappa_w * Shce - theta_sac * Shce - omega * Shce - mu_sac * Shce",
      "dEhce/dt = beta_sac * epsilon * Fc * kappa_w * Shce - (alpha_h + pi_sac + omega + mu_sac) * Ehce",
      "dIhce/dt = alpha_h * Ehce - (c_sac * tau_sac + omega + mu_sac) * Ihce",
      "dThce/dt = theta_sac * Shce + pi_sac * Ehce + b_sac * Ehcn + d_sac * Ihcn + a_sac * Shcn - (rho_sac + omega + mu_sac) * Thce + c_sac * tau_sac * Ihce",
      "dShan/dt = omega * Shcn - beta_adult * epsilon * Fc * kappa_w * Shan - a_adult * Shan - mu_adult * Shan",
      "dEhan/dt = beta_adult * epsilon * Fc * kappa_w * Shan + omega * Ehcn - (alpha_h + b_adult + mu_adult) * Ehan",
      "dIhan/dt = omega * Ihcn + alpha_h * Ehan - (d_adult + mu_adult + delta_adult) * Ihan",
      "dShae/dt = omega * Shce + rho_adult * Thae - beta_adult * epsilon * Fc * kappa_w * Shae - theta_adult * Shae - mu_adult * Shae",
      "dEhae/dt = beta_adult * epsilon * Fc * kappa_w * Shae + omega * Ehce - (pi_adult + alpha_h + mu_adult) * Ehae",
      "dIhae/dt = alpha_h * Ehae + omega * Ihce - (c_adult * tau_adult + mu_adult) * Ihae",
      "dThae/dt = pi_adult * Ehae + c_adult * tau_adult * Ihae + theta_adult * Shae + omega * Thce + a_adult * Shan + b_adult * Ehan + d_adult * Ihan - (rho_adult + mu_adult) * Thae",
      "dFm/dt = zeta * (f1 * Ihce + f2 * Ihcn + f3 * Ihae + f4 * Ihan) - (h + mu_m) * Fm",
      "dFc/dt = gamma_env * Is - (g + j + k + n + mu_c) * Fc",
      "dSs/dt = eta_s - beta_s * epsilon * Fm * kappa_w * Ss - mu_s * Ss",
      "dEs/dt = beta_s * epsilon * Fm * kappa_w * Ss - (alpha_s + mu_s) * Es",
      "dIs/dt = alpha_s * Es - mu_s * Is",
    ],
    parameters: {
      eta_h: 50, eta_s: 100, beta_sac: 0.0005, beta_adult: 0.0003, beta_s: 0.0004,
      epsilon: 0.8, kappa_w: 0.7, omega: 0.0055, alpha_h: 0.083, alpha_s: 0.1,
      mu_sac: 0.003, mu_adult: 0.0005, mu_s: 0.02, mu_m: 0.1, mu_c: 0.05,
      delta_sac: 0.001, delta_adult: 0.0005, a_sac: 0.01, b_sac: 0.02,
      d_sac: 0.03, c_sac: 0.8, tau_sac: 0.5, rho_sac: 0.01, theta_sac: 0.05,
      pi_sac: 0.04, a_adult: 0.01, b_adult: 0.02, d_adult: 0.03,
      c_adult: 0.8, tau_adult: 0.5, rho_adult: 0.01, theta_adult: 0.05, pi_adult: 0.04,
      zeta: 0.5, f1: 0.4, f2: 0.3, f3: 0.2, f4: 0.1, h: 0.1,
      gamma_env: 0.3, g: 0.02, j: 0.01, k: 0.01, n: 0.01,
    },
    initialValues: {
      Shcn: 5000, Ehcn: 10, Ihcn: 5, Shce: 1000, Ehce: 5, Ihce: 2, Thce: 100,
      Shan: 10000, Ehan: 20, Ihan: 10, Shae: 3000, Ehae: 10, Ihae: 5, Thae: 200,
      Fm: 50, Fc: 100, Ss: 5000, Es: 20, Is: 10,
    },
    compartments: [
      "Shcn", "Ehcn", "Ihcn", "Shce", "Ehce", "Ihce", "Thce",
      "Shan", "Ehan", "Ihan", "Shae", "Ehae", "Ihae", "Thae",
      "Fm", "Fc", "Ss", "Es", "Is",
    ],
  },
];

interface PulseEvent {
  name: string;
  targetCompartments: string[];
  coverageFraction: number;
  startTime: number;
  duration: number;
  frequency: string;
  customIntervalDays: number;
  totalRounds: number;
  effectExpression: string;
}

const MathModelingView = () => {
  const { user } = useAuth();
  const [equations, setEquations] = useState<string[]>(["dS/dt = -beta * S * I / N", "dI/dt = beta * S * I / N - gamma * I", "dR/dt = gamma * I"]);
  const [parameters, setParameters] = useState<{ name: string; value: number }[]>([
    { name: "beta", value: 0.3 }, { name: "gamma", value: 0.1 }, { name: "N", value: 1000 },
  ]);
  const [preCalibrationParams, setPreCalibrationParams] = useState<Record<string, number> | null>(null);
  const [initialValues, setInitialValues] = useState<{ name: string; value: number }[]>([
    { name: "S", value: 999 }, { name: "I", value: 1 }, { name: "R", value: 0 },
  ]);
  const [compartments, setCompartments] = useState<string[]>(["S", "I", "R"]);
  const [timeConfig, setTimeConfig] = useState({ start: 0, end: 160, step: 0.1 });
  const [activeTab, setActiveTab] = useState("setup");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState("");
  const [pulseEvents, setPulseEvents] = useState<PulseEvent[]>([]);

  // Results
  const [simulationData, setSimulationData] = useState<any>(null);
  const [expandedCompartment, setExpandedCompartment] = useState<{ key: string; index: number } | null>(null);
  const [overlayCompartments, setOverlayCompartments] = useState<string[]>([]);
  const [r0Results, setR0Results] = useState<any>(null);
  const [sensitivityResults, setSensitivityResults] = useState<any>(null);
  const [scenarioResults, setScenarioResults] = useState<any>(null);
  const [fittingResults, setFittingResults] = useState<any>(null);
  const [calibratedSimData, setCalibratedSimData] = useState<any>(null);
  const [calibSimCompartments, setCalibSimCompartments] = useState<string[]>([]);
  const [scriptTab, setScriptTab] = useState<"r" | "python">("r");
  const [fittingScriptTab, setFittingScriptTab] = useState<"r" | "python">("r");
  const [copied, setCopied] = useState(false);
  const [showMdaMarkers, setShowMdaMarkers] = useState(true);

  // AI Insights & Assumptions
  const [modelAssumptions, setModelAssumptions] = useState("");
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [isGeneratingAssumptions, setIsGeneratingAssumptions] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  // Fitting
  const [fittingData, setFittingData] = useState<any[]>([]);
  const [fittingSheets, setFittingSheets] = useState<{ name: string; data: any[] }[]>([]);
  const [fittingSource, setFittingSource] = useState<"file" | "form">("file");
  const [targetFitParams, setTargetFitParams] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [fittingColumns, setFittingColumns] = useState<string[]>([]);

  // Form data for fitting
  const [projects, setProjects] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedForm, setSelectedForm] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProjects = async () => {
      const { data } = await supabase.from("projects").select("id, name").order("name");
      if (data) setProjects(data);
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    const fetchForms = async () => {
      const { data } = await supabase.from("forms").select("id, name").eq("project_id", selectedProject);
      if (data) setForms(data);
    };
    fetchForms();
  }, [selectedProject]);

  const loadPresetModel = (preset: typeof PRESET_MODELS[0]) => {
    setEquations([...preset.equations]);
    setParameters(Object.entries(preset.parameters).map(([name, value]) => ({ name, value })));
    setInitialValues(Object.entries(preset.initialValues).map(([name, value]) => ({ name, value })));
    setCompartments([...preset.compartments]);
    setSimulationData(null);
    setR0Results(null);
    setSensitivityResults(null);
    setScenarioResults(null);
    setFittingResults(null);
    setCalibratedSimData(null);
    setPreCalibrationParams(null);
    setCalibSimCompartments([]);
    setAiInsights(null);
    setModelAssumptions("");
    // Update existing pulse events to use valid compartments from new model
    setPulseEvents(prev => prev.map(pe => ({
      ...pe,
      targetCompartments: pe.targetCompartments.filter(tc => preset.compartments.includes(tc)).length > 0
        ? pe.targetCompartments.filter(tc => preset.compartments.includes(tc))
        : preset.compartments.length > 0 ? [preset.compartments[0]] : [],
    })));
    toast({ title: `${preset.name} loaded`, description: "Model equations and parameters have been set." });
  };

  const addPulseEvent = () => {
    // Auto-detect treatment compartments from model (e.g., Thce, Thae for SEITF)
    const treatmentComps = compartments.filter(c => /^T/i.test(c));
    const defaultTargets = treatmentComps.length > 0 ? treatmentComps : compartments.length > 0 ? [compartments[0]] : [];
    setPulseEvents(prev => [...prev, {
      name: `MDA Round ${prev.length + 1}`,
      targetCompartments: defaultTargets,
      coverageFraction: 0.8,
      startTime: 30,
      duration: 10,
      frequency: "yearly",
      customIntervalDays: 365,
      totalRounds: 5,
      effectExpression: "",
    }]);
  };

  const updatePulseEvent = (index: number, field: keyof PulseEvent, value: any) => {
    setPulseEvents(prev => {
      const next = [...prev];
      (next[index] as any)[field] = value;
      return next;
    });
  };

  const removePulseEvent = (index: number) => {
    setPulseEvents(prev => prev.filter((_, i) => i !== index));
  };

  const getPayload = () => ({
    equations,
    parameters: Object.fromEntries(parameters.map(p => [p.name, p.value])),
    initialValues: Object.fromEntries(initialValues.map(v => [v.name, v.value])),
    timeConfig,
    compartments,
    pulseEvents: pulseEvents.length > 0 ? pulseEvents : undefined,
    assumptions: modelAssumptions || undefined,
  });

  const callMathModel = async (action: string, extraBody = {}) => {
    setIsLoading(true);
    setLoadingAction(action);
    try {
      const { data, error } = await supabase.functions.invoke("math-model", {
        body: { action, ...getPayload(), ...extraBody },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Analysis failed", variant: "destructive" });
      return null;
    } finally {
      setIsLoading(false);
      setLoadingAction("");
    }
  };

  const runSimulation = async () => {
    const data = await callMathModel("simulate");
    if (data) {
      setSimulationData(data);
      setAiInsights(null);
      setActiveTab("simulation");
      toast({ title: "Simulation complete" });
    }
  };

  const runR0Analysis = async () => {
    const data = await callMathModel("r0_analysis");
    if (data) {
      setR0Results(data);
      setActiveTab("r0");
      toast({ title: "R₀ Analysis complete" });
    }
  };

  const runSensitivityAnalysis = async () => {
    const data = await callMathModel("sensitivity_analysis");
    if (data) {
      setSensitivityResults(data);
      setActiveTab("sensitivity");
      toast({ title: "Sensitivity analysis complete" });
    }
  };

  const runScenarioAnalysis = async () => {
    const data = await callMathModel("scenario_analysis");
    if (data) {
      setScenarioResults(data);
      setActiveTab("scenarios");
      toast({ title: "Scenario analysis complete" });
    }
  };

  const runModelFitting = async () => {
    if (fittingData.length === 0 || targetFitParams.length === 0) {
      toast({ title: "Missing data", description: "Please import data and select parameters to fit.", variant: "destructive" });
      return;
    }
    const data = await callMathModel("fit_model", {
      fittingData: {
        sheets: fittingSheets.length > 0 ? fittingSheets : [{ name: "Sheet1", data: fittingData }],
        observedData: fittingData,
        targetParams: targetFitParams,
        columnMapping,
      },
    });
    if (data) {
      setFittingResults(data);
      setActiveTab("fitting");
      toast({ title: "Model fitting complete" });
    }
  };

  const runCalibratedSimulation = async () => {
    if (!fittingResults?.parameter_table) {
      toast({ title: "No calibrated parameters", description: "Run model fitting first.", variant: "destructive" });
      return;
    }
    const calibrated = getCalibratedParams();
    setIsLoading(true);
    setLoadingAction("calibrated_simulation");
    try {
      const { data, error } = await supabase.functions.invoke("math-model", {
        body: {
          action: "simulate",
          equations,
          parameters: Object.fromEntries(calibrated.map(p => [p.name, p.value])),
          initialValues: Object.fromEntries(initialValues.map(v => [v.name, v.value])),
          timeConfig,
          compartments,
          pulseEvents: pulseEvents.length > 0 ? pulseEvents : undefined,
          assumptions: modelAssumptions || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCalibratedSimData(data);
      toast({ title: "Calibrated simulation complete", description: "Fitted curves are now overlaid on observed data." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Calibrated simulation failed", variant: "destructive" });
    } finally {
      setIsLoading(false);
      setLoadingAction("");
    }
  };

  const generateAssumptions = async () => {
    setIsGeneratingAssumptions(true);
    try {
      const data = await callMathModel("generate_assumptions");
      if (data?.assumptions) {
        setModelAssumptions(data.assumptions);
        toast({ title: "Assumptions generated", description: "Default assumptions created based on your model configuration." });
      }
    } finally {
      setIsGeneratingAssumptions(false);
    }
  };

  const interpretSimulation = async () => {
    if (!simulationData) return;
    setIsGeneratingInsights(true);
    try {
      const summaryData = Object.entries(simulationData.time_series).map(([k, v]: [string, any]) => {
        if (!Array.isArray(v) || v.length === 0) return { compartment: k };
        const values = v.map((p: any) => p.value ?? p.y ?? 0);
        const maxVal = Math.max(...values);
        const minVal = Math.min(...values);
        const finalVal = values[values.length - 1];
        const peakIdx = values.indexOf(maxVal);
        const peakTime = v[peakIdx]?.t ?? peakIdx;
        return { compartment: k, min: Math.round(minVal * 100) / 100, max: Math.round(maxVal * 100) / 100, final: Math.round(finalVal * 100) / 100, peakTime: Math.round(peakTime * 100) / 100, trend: finalVal > values[0] ? "increasing" : "decreasing" };
      });
      const data = await callMathModel("interpret_simulation", { simulationSummary: summaryData });
      if (data) {
        setAiInsights(data);
        toast({ title: "AI Insights generated" });
      }
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const allSheets: { name: string; data: any[] }[] = [];
        let allRows: any[] = [];
        let allCols: string[] = [];

        wb.SheetNames.forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(ws);
          if (jsonData.length > 0) {
            allSheets.push({ name: sheetName, data: jsonData as any[] });
            allRows = allRows.concat(jsonData);
            const cols = Object.keys(jsonData[0] as object);
            cols.forEach(c => { if (!allCols.includes(c)) allCols.push(c); });
          }
        });

        if (allRows.length > 0) {
          setFittingData(allRows);
          setFittingColumns(allCols);
          setFittingSheets(allSheets);
          toast({ 
            title: "Data imported", 
            description: `${allRows.length} rows loaded from ${allSheets.length} sheet(s): ${allSheets.map(s => `${s.name} (${s.data.length} rows)`).join(", ")}` 
          });
        }
      } catch {
        toast({ title: "Import failed", description: "Could not parse the file.", variant: "destructive" });
      }
    };
    reader.readAsBinaryString(file);
  };

  const loadFormDataForFitting = async () => {
    if (!selectedForm) return;
    const { data } = await supabase.from("form_submissions")
      .select("data, submitted_at")
      .eq("form_id", selectedForm)
      .eq("status", "submitted")
      .order("submitted_at")
      .limit(500);
    if (data && data.length > 0) {
      const rows = data.map((s, i) => {
        const d = s.data as Record<string, any>;
        return { t: i, ...d };
      });
      setFittingData(rows);
      setFittingColumns(Object.keys(rows[0]));
      setFittingSheets([{ name: "Form Submissions", data: rows }]);
      toast({ title: "Form data loaded", description: `${rows.length} submissions loaded` });
    }
  };

  // Compute pulse schedule for scripts
  const computePulseTimesForScripts = (): number[] => {
    const allTimes: number[] = [];
    pulseEvents.forEach(pe => {
      const freqMap: Record<string, number> = { yearly: 365, biannual: 182.5, biennial: 730, custom: pe.customIntervalDays };
      if (pe.frequency === "once") {
        allTimes.push(pe.startTime);
      } else {
        const interval = freqMap[pe.frequency] || 365;
        for (let r = 0; r < pe.totalRounds; r++) {
          const t = pe.startTime + r * interval;
          if (t <= timeConfig.end) allTimes.push(t);
        }
      }
    });
    return [...new Set(allTimes)].sort((a, b) => a - b);
  };

  const generateRScript = () => {
    const paramDefs = parameters.map(p => `${p.name} <- ${p.value}`).join("\n");
    const ivDefs = initialValues.map(iv => `${iv.name}_0 <- ${iv.value}`).join("\n");
    const stateVec = initialValues.map(iv => `${iv.name} = ${iv.name}_0`).join(", ");
    const odeBody = equations.map(eq => {
      const match = eq.match(/d(\w+)\/dt\s*=\s*(.+)/);
      if (!match) return `  # ${eq}`;
      return `    d${match[1]} <- ${match[2]}`;
    }).join("\n");
    const returnVars = initialValues.map(iv => `d${iv.name}`).join(", ");
    const plotLines = compartments.map((c, i) => {
      const col = ["blue", "red", "green", "purple", "orange", "brown", "cyan", "magenta"][i % 8];
      return i === 0
        ? `plot(out[,"time"], out[,"${c}"], type="l", col="${col}", lwd=2, xlab="Time", ylab="Population", main="Model Simulation", ylim=c(0, max(out[,-1])))`
        : `lines(out[,"time"], out[,"${c}"], col="${col}", lwd=2)`;
    }).join("\n");
    const legendNames = compartments.map(c => `"${c}"`).join(", ");
    const legendCols = compartments.map((_, i) => `"${["blue", "red", "green", "purple", "orange", "brown", "cyan", "magenta"][i % 8]}"`).join(", ");

    // Pulse event code for R
    const pulseTimes = computePulseTimesForScripts();
    let pulseCode = "";
    if (pulseEvents.length > 0 && pulseTimes.length > 0) {
      const receiverComp = compartments.find(c => /^[TR]/i.test(c));
      const eventLines = pulseEvents.map(pe => {
        const recv = compartments.find(c => c !== pe.targetCompartment && /^[TR]/i.test(c));
        return `    transferred <- y["${pe.targetCompartment}"] * ${pe.coverageFraction}
    y["${pe.targetCompartment}"] <- y["${pe.targetCompartment}"] - transferred${recv ? `\n    y["${recv}"] <- y["${recv}"] + transferred` : ""}
    y[y < 0] <- 0`;
      }).join("\n");

      pulseCode = `
# --- Pulse Interventions (MDA) ---
pulse_event <- function(t, y, parms) {
${eventLines}
    return(y)
}
pulse_times <- c(${pulseTimes.join(", ")})
`;
    }

    const solveCall = pulseEvents.length > 0
      ? `out <- ode(y = state, times = times, func = model, parms = parms, method = "rk4",
           events = list(func = pulse_event, time = pulse_times))`
      : `out <- ode(y = state, times = times, func = model, parms = parms, method = "rk4")`;

    return `# ====================================
# Model Simulation Script (R)
# Generated by ACG Collect ML Studio
# ====================================

# Install if needed: install.packages("deSolve")
library(deSolve)

# --- Parameters ---
${paramDefs}

# --- Initial Values ---
${ivDefs}

# --- ODE System ---
model <- function(time, state, parms) {
  with(as.list(c(state, parms)), {
${odeBody}
    list(c(${returnVars}))
  })
}
${pulseCode}
# --- Simulation Settings ---
times <- seq(${timeConfig.start}, ${timeConfig.end}, by = ${timeConfig.step})
state <- c(${stateVec})
parms <- c(${parameters.map(p => `${p.name} = ${p.value}`).join(", ")})

# --- Solve ---
${solveCall}
out <- as.data.frame(out)

# --- Plot: Combined ---
${plotLines}
legend("topright", legend = c(${legendNames}), col = c(${legendCols}), lwd = 2)
${pulseEvents.length > 0 ? `abline(v = pulse_times, col = "gray", lty = 2, lwd = 0.8)  # Pulse event markers` : ""}

# --- Plot: Individual compartments ---
par(mfrow = c(${Math.ceil(compartments.length / 3)}, ${Math.min(compartments.length, 3)}))
${compartments.map((c, i) => {
  const col = ["blue", "red", "green", "purple", "orange", "brown", "cyan", "magenta"][i % 8];
  return `plot(out[,"time"], out[,"${c}"], type="l", col="${col}", lwd=2, xlab="Time", ylab="${c}", main="${c}")${pulseEvents.length > 0 ? `\nabline(v = pulse_times, col = "gray", lty = 2, lwd = 0.8)` : ""}`;
}).join("\n")}
par(mfrow = c(1, 1))

# --- Export CSV ---
write.csv(out, "simulation_output.csv", row.names = FALSE)
cat("Simulation complete. Results saved to simulation_output.csv\\n")
${modelAssumptions ? `\n# --- Model Assumptions ---\n# ${modelAssumptions.split("\n").join("\n# ")}` : ""}
`;
  };

  const generatePythonScript = () => {
    const paramDefs = parameters.map(p => `${p.name} = ${p.value}`).join("\n");
    const ivDefs = initialValues.map(iv => `${iv.name}_0 = ${iv.value}`).join("\n");
    const stateUnpack = initialValues.map(iv => iv.name).join(", ");
    const odeBody = equations.map(eq => {
      const match = eq.match(/d(\w+)\/dt\s*=\s*(.+)/);
      if (!match) return `    # ${eq}`;
      return `    d${match[1]}dt = ${match[2]}`;
    }).join("\n");
    const returnVars = equations.map(eq => {
      const match = eq.match(/d(\w+)\/dt/);
      return match ? `d${match[1]}dt` : "0";
    }).join(", ");
    const y0List = initialValues.map(iv => `${iv.name}_0`).join(", ");

    // Pulse events for Python
    const pulseTimes = computePulseTimesForScripts();
    let pulseCode = "";
    let solveCode = "";

    if (pulseEvents.length > 0 && pulseTimes.length > 0) {
      const pulseAppications = pulseEvents.map(pe => {
        const targetIdx = compartments.indexOf(pe.targetCompartment);
        const receiverComp = compartments.find(c => c !== pe.targetCompartment && /^[TR]/i.test(c));
        const receiverIdx = receiverComp ? compartments.indexOf(receiverComp) : -1;
        return `        transferred = current_y[${targetIdx}] * ${pe.coverageFraction}  # ${pe.targetCompartment}
        current_y[${targetIdx}] -= transferred${receiverIdx >= 0 ? `\n        current_y[${receiverIdx}] += transferred  # -> ${receiverComp}` : ""}
        current_y = np.maximum(current_y, 0)`;
      }).join("\n");

      pulseCode = `
# --- Pulse Interventions (MDA) ---
pulse_times = [${pulseTimes.join(", ")}]
compartment_names = [${compartments.map(c => `'${c}'`).join(", ")}]
`;

      solveCode = `# --- Solve with Pulse Events (segmented) ---
segment_boundaries = sorted(set([${timeConfig.start}] + pulse_times + [${timeConfig.end}]))
current_y = np.array(y0)
all_t = []
all_y = []

for i in range(len(segment_boundaries) - 1):
    seg_start = segment_boundaries[i]
    seg_end = segment_boundaries[i + 1]
    seg_eval = t_eval[(t_eval >= seg_start) & (t_eval < seg_end)]
    if len(seg_eval) == 0:
        seg_eval = np.array([seg_start, seg_end])
    
    sol = solve_ivp(model, (seg_start, seg_end), current_y, t_eval=seg_eval, method='RK45', max_step=${timeConfig.step})
    all_t.extend(sol.t.tolist())
    all_y.append(sol.y)
    current_y = sol.y[:, -1].copy()
    
    # Apply pulse if at a pulse time
    if seg_end in pulse_times:
${pulseAppications}

# Combine segments
t_combined = np.array(all_t)
y_combined = np.hstack(all_y)

df = pd.DataFrame({'time': t_combined})
${compartments.map((c, i) => `df['${c}'] = y_combined[${i}]`).join("\n")}`;
    } else {
      solveCode = `# --- Solve ---
sol = solve_ivp(model, t_span, y0, t_eval=t_eval, method='RK45', max_step=${timeConfig.step})

# --- Create DataFrame ---
df = pd.DataFrame({'time': sol.t})
${compartments.map((c, i) => `df['${c}'] = sol.y[${i}]`).join("\n")}`;
    }

    return `# ====================================
# Model Simulation Script (Python)
# Generated by ACG Collect ML Studio
# ====================================

# pip install numpy scipy matplotlib pandas

import numpy as np
from scipy.integrate import solve_ivp
import matplotlib.pyplot as plt
import pandas as pd

# --- Parameters ---
${paramDefs}

# --- Initial Values ---
${ivDefs}

# --- ODE System ---
def model(t, y):
    ${stateUnpack} = y
${odeBody}
    return [${returnVars}]

# --- Simulation Settings ---
t_span = (${timeConfig.start}, ${timeConfig.end})
t_eval = np.arange(${timeConfig.start}, ${timeConfig.end}, ${timeConfig.step})
y0 = [${y0List}]
${pulseCode}
${solveCode}

# --- Plot: Combined ---
plt.figure(figsize=(12, 6))
${compartments.map(c => `plt.plot(df['time'], df['${c}'], linewidth=2, label='${c}')`).join("\n")}
${pulseEvents.length > 0 ? `for pt in pulse_times:\n    plt.axvline(x=pt, color='gray', linestyle='--', linewidth=0.8, alpha=0.6)` : ""}
plt.xlabel('Time')
plt.ylabel('Population')
plt.title('Model Simulation')
plt.legend()
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('simulation_combined.png', dpi=150)
plt.show()

# --- Plot: Individual compartments ---
fig, axes = plt.subplots(${Math.ceil(compartments.length / 3)}, ${Math.min(compartments.length, 3)}, figsize=(15, ${Math.ceil(compartments.length / 3) * 4}))
axes = np.array(axes).flatten() if ${compartments.length} > 1 else [axes]
${compartments.map((c, i) => `axes[${i}].plot(df['time'], df['${c}'], linewidth=2, color='C${i}')
axes[${i}].set_title('${c}')
axes[${i}].set_xlabel('Time')
axes[${i}].grid(True, alpha=0.3)${pulseEvents.length > 0 ? `\nfor pt in pulse_times:\n    axes[${i}].axvline(x=pt, color='gray', linestyle='--', linewidth=0.8, alpha=0.6)` : ""}`).join("\n")}
plt.tight_layout()
plt.savefig('simulation_individual.png', dpi=150)
plt.show()

# --- Export CSV ---
df.to_csv('simulation_output.csv', index=False)
print(f"Simulation complete. {len(df)} time points saved to simulation_output.csv")
${modelAssumptions ? `\n# --- Model Assumptions ---\n# ${modelAssumptions.split("\n").join("\n# ")}` : ""}
`;
  };

  const copyScript = (script: string) => {
    navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Script copied to clipboard." });
  };

  const downloadScript = (script: string, lang: "r" | "python") => {
    const ext = lang === "r" ? ".R" : ".py";
    const mime = "text/plain";
    const blob = new Blob([script], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `model_simulation${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded!", description: `Script saved as model_simulation${ext}` });
  };

  // Generate calibrated parameter values from fitting results
  const getCalibratedParams = (): { name: string; value: number }[] => {
    if (!fittingResults?.parameter_table) return parameters;
    return parameters.map(p => {
      const found = fittingResults.parameter_table.find((pt: any) => pt.name === p.name);
      return { name: p.name, value: found ? Number(found.value) : p.value };
    });
  };

  const generateCalibratedRScript = () => {
    const calibrated = getCalibratedParams();
    const paramDefs = calibrated.map(p => `${p.name} <- ${p.value}`).join("\n");
    const ivDefs = initialValues.map(iv => `${iv.name}_0 <- ${iv.value}`).join("\n");
    const stateVec = initialValues.map(iv => `${iv.name} = ${iv.name}_0`).join(", ");
    const odeBody = equations.map(eq => {
      const match = eq.match(/d(\w+)\/dt\s*=\s*(.+)/);
      if (!match) return `  # ${eq}`;
      return `    d${match[1]} <- ${match[2]}`;
    }).join("\n");
    const returnVars = initialValues.map(iv => `d${iv.name}`).join(", ");
    const plotLines = compartments.map((c, i) => {
      const col = ["blue", "red", "green", "purple", "orange", "brown", "cyan", "magenta"][i % 8];
      return i === 0
        ? `plot(out[,"time"], out[,"${c}"], type="l", col="${col}", lwd=2, xlab="Time", ylab="Population", main="Calibrated Model Simulation", ylim=c(0, max(out[,-1])))`
        : `lines(out[,"time"], out[,"${c}"], col="${col}", lwd=2)`;
    }).join("\n");
    const legendNames = compartments.map(c => `"${c}"`).join(", ");
    const legendCols = compartments.map((_, i) => `"${["blue", "red", "green", "purple", "orange", "brown", "cyan", "magenta"][i % 8]}"`).join(", ");
    return `# ====================================
# Calibrated Model Simulation Script (R)
# Parameters fitted via AI-powered calibration
# Generated by ACG Collect ML Studio
# ====================================

library(deSolve)

# --- Calibrated Parameters ---
${paramDefs}

# --- Initial Values ---
${ivDefs}

# --- ODE System ---
model <- function(time, state, parms) {
  with(as.list(c(state, parms)), {
${odeBody}
    list(c(${returnVars}))
  })
}

# --- Simulation Settings ---
times <- seq(${timeConfig.start}, ${timeConfig.end}, by = ${timeConfig.step})
state <- c(${stateVec})
parms <- c(${calibrated.map(p => `${p.name} = ${p.value}`).join(", ")})

# --- Solve ---
out <- ode(y = state, times = times, func = model, parms = parms, method = "rk4")
out <- as.data.frame(out)

# --- Plot ---
${plotLines}
legend("topright", legend = c(${legendNames}), col = c(${legendCols}), lwd = 2)

# --- Export ---
write.csv(out, "calibrated_simulation_output.csv", row.names = FALSE)
cat("Calibrated simulation complete.\\n")
`;
  };

  const generateCalibratedPythonScript = () => {
    const calibrated = getCalibratedParams();
    const paramDefs = calibrated.map(p => `${p.name} = ${p.value}`).join("\n");
    const ivDefs = initialValues.map(iv => `${iv.name}_0 = ${iv.value}`).join("\n");
    const stateUnpack = initialValues.map(iv => iv.name).join(", ");
    const odeBody = equations.map(eq => {
      const match = eq.match(/d(\w+)\/dt\s*=\s*(.+)/);
      if (!match) return `    # ${eq}`;
      return `    d${match[1]}dt = ${match[2]}`;
    }).join("\n");
    const returnVars = equations.map(eq => {
      const match = eq.match(/d(\w+)\/dt/);
      return match ? `d${match[1]}dt` : "0";
    }).join(", ");
    const y0List = initialValues.map(iv => `${iv.name}_0`).join(", ");
    return `# ====================================
# Calibrated Model Simulation Script (Python)
# Parameters fitted via AI-powered calibration
# Generated by ACG Collect ML Studio
# ====================================

import numpy as np
from scipy.integrate import solve_ivp
import matplotlib.pyplot as plt
import pandas as pd

# --- Calibrated Parameters ---
${paramDefs}

# --- Initial Values ---
${ivDefs}

# --- ODE System ---
def model(t, y):
    ${stateUnpack} = y
${odeBody}
    return [${returnVars}]

# --- Simulation Settings ---
t_span = (${timeConfig.start}, ${timeConfig.end})
t_eval = np.arange(${timeConfig.start}, ${timeConfig.end}, ${timeConfig.step})
y0 = [${y0List}]

# --- Solve ---
sol = solve_ivp(model, t_span, y0, t_eval=t_eval, method='RK45', max_step=${timeConfig.step})

# --- Create DataFrame ---
df = pd.DataFrame({'time': sol.t})
${compartments.map((c, i) => `df['${c}'] = sol.y[${i}]`).join("\n")}

# --- Plot ---
plt.figure(figsize=(12, 6))
${compartments.map(c => `plt.plot(df['time'], df['${c}'], linewidth=2, label='${c}')`).join("\n")}
plt.xlabel('Time')
plt.ylabel('Population')
plt.title('Calibrated Model Simulation')
plt.legend()
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('calibrated_simulation.png', dpi=150)
plt.show()

# --- Export ---
df.to_csv('calibrated_simulation_output.csv', index=False)
print(f"Calibrated simulation complete. {len(df)} time points saved.")
`;
  };

  const exportParameterTableExcel = () => {
    if (!fittingResults?.parameter_table) return;
    const rows = fittingResults.parameter_table.map((p: any) => ({
      Parameter: p.name,
      Description: p.description || "",
      Value: p.value,
      "CI Lower": p.confidence_interval?.lower ?? "",
      "CI Upper": p.confidence_interval?.upper ?? "",
      Source: p.source,
      "Citation / Notes": p.source === "Literature" && p.citation ? p.citation : p.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const colWidths = [{ wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 40 }];
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Parameter Table");
    // Add goodness-of-fit sheet
    if (fittingResults.goodness_of_fit) {
      const gofRows = Object.entries(fittingResults.goodness_of_fit).map(([k, v]) => ({ Metric: k.replace(/_/g, " "), Value: v }));
      const gofWs = XLSX.utils.json_to_sheet(gofRows);
      XLSX.utils.book_append_sheet(wb, gofWs, "Goodness of Fit");
    }
    XLSX.writeFile(wb, "parameter_table.xlsx");
    toast({ title: "Exported", description: "Parameter table saved as Excel file." });
  };

  const exportParameterTablePDF = () => {
    if (!fittingResults?.parameter_table) return;
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const margin = 15;
    let y = margin;
    pdf.setFontSize(16);
    pdf.text("Complete Parameter Table — Model Calibration Report", margin, y);
    y += 10;
    pdf.setFontSize(9);
    pdf.text(`Generated: ${new Date().toLocaleDateString()}`, margin, y);
    y += 8;
    // Goodness-of-fit
    if (fittingResults.goodness_of_fit) {
      pdf.setFontSize(11);
      pdf.text("Goodness of Fit", margin, y);
      y += 6;
      pdf.setFontSize(9);
      Object.entries(fittingResults.goodness_of_fit).forEach(([k, v]) => {
        pdf.text(`${k.replace(/_/g, " ")}: ${typeof v === 'number' ? (v as number).toFixed(4) : String(v)}`, margin + 4, y);
        y += 5;
      });
      y += 4;
    }
    // Table header
    const cols = ["Parameter", "Description", "Value", "Source", "Citation / Notes"];
    const colX = [margin, margin + 30, margin + 100, margin + 130, margin + 160];
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    cols.forEach((col, i) => pdf.text(col, colX[i], y));
    y += 2;
    pdf.line(margin, y, 280, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    fittingResults.parameter_table.forEach((p: any) => {
      if (y > 190) { pdf.addPage(); y = margin; }
      pdf.text(String(p.name || ""), colX[0], y);
      pdf.text(String(p.description || "").substring(0, 40), colX[1], y);
      pdf.text(typeof p.value === 'number' ? p.value.toPrecision(4) : String(p.value), colX[2], y);
      pdf.text(String(p.source || ""), colX[3], y);
      const cite = p.source === "Literature" && p.citation ? p.citation : p.notes || "";
      pdf.text(String(cite).substring(0, 50), colX[4], y);
      y += 5;
    });
    pdf.save("parameter_table.pdf");
    toast({ title: "Exported", description: "Parameter table saved as PDF." });
  };

  const getSimChartData = (timeSeries: Record<string, any>) => {
    if (!timeSeries || typeof timeSeries !== 'object') return [];
    const keys = Object.keys(timeSeries).filter(k => Array.isArray(timeSeries[k]) && timeSeries[k].length > 0);
    if (keys.length === 0) return [];

    const maxLen = Math.max(...keys.map(k => timeSeries[k].length));
    if (maxLen === 0) return [];

    const chartData: Record<string, number>[] = [];
    for (let i = 0; i < maxLen; i++) {
      const row: Record<string, number> = { t: i };
      keys.forEach(key => {
        const arr = timeSeries[key];
        if (i < arr.length) {
          const point = arr[i];
          if (typeof point === 'object' && point !== null) {
            row.t = point.t ?? point.time ?? i;
            row[key] = point.value ?? point.y ?? 0;
          } else if (typeof point === 'number') {
            row[key] = point;
          }
        }
      });
      chartData.push(row);
    }
    return chartData;
  };

  return (
    <div className="space-y-6 p-4 lg:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Calculator className="h-7 w-7 text-primary" />
            </div>
            Mathematical Modeling
          </h1>
          <p className="mt-1 text-muted-foreground">Define, simulate, and analyze dynamical systems with AI-powered tools</p>
        </div>
      </div>

      {/* Preset Models */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-muted-foreground self-center mr-2">Quick Start:</span>
        {PRESET_MODELS.map(p => (
          <Button key={p.name} variant="outline" size="sm" onClick={() => loadPresetModel(p)} className="text-xs">
            {p.name}
          </Button>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="setup">Model Setup</TabsTrigger>
          <TabsTrigger value="simulation" disabled={!simulationData}>Simulation</TabsTrigger>
          <TabsTrigger value="r0" disabled={!r0Results}>R₀ Analysis</TabsTrigger>
          <TabsTrigger value="sensitivity" disabled={!sensitivityResults}>Sensitivity</TabsTrigger>
          <TabsTrigger value="scenarios" disabled={!scenarioResults}>Scenarios</TabsTrigger>
          <TabsTrigger value="fitting-setup">Model Fitting</TabsTrigger>
          <TabsTrigger value="fitting" disabled={!fittingResults}>Fitting Results</TabsTrigger>
        </TabsList>

        {/* SETUP TAB */}
        <TabsContent value="setup">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Equations */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Sigma className="h-5 w-5 text-primary" />System of Equations</CardTitle>
                <CardDescription>Enter differential (dX/dt) or difference (X(t+1)) equations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {equations.map((eq, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={eq}
                      onChange={e => {
                        const next = [...equations];
                        next[i] = e.target.value;
                        setEquations(next);
                      }}
                      className="font-mono text-sm"
                      placeholder="dX/dt = ..."
                    />
                    <Button variant="ghost" size="icon" onClick={() => setEquations(equations.filter((_, j) => j !== i))} disabled={equations.length <= 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setEquations([...equations, ""])} className="gap-2">
                  <Plus className="h-4 w-4" />Add Equation
                </Button>
              </CardContent>
            </Card>

            {/* Time Config */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Time Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div><Label className="text-xs">Start</Label><Input type="number" value={timeConfig.start} onChange={e => setTimeConfig(p => ({ ...p, start: Number(e.target.value) }))} /></div>
                  <div><Label className="text-xs">End</Label><Input type="number" value={timeConfig.end} onChange={e => setTimeConfig(p => ({ ...p, end: Number(e.target.value) }))} /></div>
                  <div><Label className="text-xs">Step</Label><Input type="number" value={timeConfig.step} onChange={e => setTimeConfig(p => ({ ...p, step: Number(e.target.value) }))} step={0.01} /></div>
                </div>
                <div>
                  <Label className="text-xs">Compartments (comma-separated)</Label>
                  <Input value={compartments.join(", ")} onChange={e => setCompartments(e.target.value.split(",").map(s => s.trim()).filter(Boolean))} />
                </div>
              </CardContent>
            </Card>

            {/* Parameters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Variable className="h-5 w-5 text-primary" />Parameters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {parameters.map((p, i) => {
                  const origVal = preCalibrationParams?.[p.name];
                  const wasCalibrated = origVal !== undefined && origVal !== p.value;
                  return (
                    <div key={i} className={`flex gap-2 items-center rounded-md px-1 -mx-1 ${wasCalibrated ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}>
                      <Input value={p.name} onChange={e => { const next = [...parameters]; next[i].name = e.target.value; setParameters(next); }} placeholder="Name" className="w-24 font-mono text-sm" />
                      <Input type="number" value={p.value} onChange={e => { const next = [...parameters]; next[i].value = Number(e.target.value); setParameters(next); }} step="any" className={`font-mono text-sm ${wasCalibrated ? 'border-primary/50 font-semibold' : ''}`} />
                      {wasCalibrated && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0" title={`Original: ${origVal}`}>
                          was {origVal.toPrecision(4)}
                        </span>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => setParameters(parameters.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  );
                })}
                <Button variant="outline" size="sm" onClick={() => setParameters([...parameters, { name: "", value: 0 }])} className="gap-2">
                  <Plus className="h-4 w-4" />Add
                </Button>
              </CardContent>
            </Card>

            {/* Initial Values */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><FlaskConical className="h-5 w-5 text-primary" />Initial Values</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {initialValues.map((v, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={v.name} onChange={e => { const next = [...initialValues]; next[i].name = e.target.value; setInitialValues(next); }} placeholder="Var" className="w-24 font-mono text-sm" />
                    <Input type="number" value={v.value} onChange={e => { const next = [...initialValues]; next[i].value = Number(e.target.value); setInitialValues(next); }} step="any" className="font-mono text-sm" />
                    <Button variant="ghost" size="icon" onClick={() => setInitialValues(initialValues.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setInitialValues([...initialValues, { name: "", value: 0 }])} className="gap-2">
                  <Plus className="h-4 w-4" />Add
                </Button>
              </CardContent>
            </Card>

            {/* Model Assumptions */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="h-5 w-5 text-primary" />
                  Model Assumptions
                </CardTitle>
                <CardDescription>
                  Enter or auto-generate assumptions that guide AI interpretation of your model outputs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={modelAssumptions}
                  onChange={e => setModelAssumptions(e.target.value)}
                  placeholder="Enter your model assumptions here, or click 'Auto-Generate' to create defaults based on your model configuration..."
                  rows={6}
                  className="text-sm"
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{modelAssumptions.length} characters</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={generateAssumptions}
                    disabled={isGeneratingAssumptions || isLoading}
                  >
                    {isGeneratingAssumptions ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {isGeneratingAssumptions ? "Generating..." : "Auto-Generate Assumptions"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Pulse Interventions (MDA) */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-5 w-5 text-accent-foreground" />
                  Pulse Interventions (MDA)
                </CardTitle>
                <CardDescription>
                  Define time-limited interventions like Mass Drug Administration events that modify compartment values at specific intervals
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {pulseEvents.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No pulse events defined. Simulation runs continuously without interventions.</p>
                )}
                {pulseEvents.map((pe, i) => (
                  <div key={i} className="rounded-lg border border-border p-4 space-y-3 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <Input
                        value={pe.name}
                        onChange={e => updatePulseEvent(i, "name", e.target.value)}
                        className="font-semibold text-sm w-48"
                        placeholder="Event name"
                      />
                      <Button variant="ghost" size="icon" onClick={() => removePulseEvent(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs">Target Compartment</Label>
                        <Select value={pe.targetCompartment} onValueChange={v => updatePulseEvent(i, "targetCompartment", v)}>
                          <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {compartments.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Coverage (%)</Label>
                        <Input type="number" value={pe.coverageFraction * 100} onChange={e => updatePulseEvent(i, "coverageFraction", Number(e.target.value) / 100)} min={0} max={100} step={1} className="text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Start Time (days)</Label>
                        <Input type="number" value={pe.startTime} onChange={e => updatePulseEvent(i, "startTime", Number(e.target.value))} min={0} step={1} className="text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Duration (days)</Label>
                        <Input type="number" value={pe.duration} onChange={e => updatePulseEvent(i, "duration", Number(e.target.value))} min={1} step={1} className="text-xs" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Frequency</Label>
                        <Select value={pe.frequency} onValueChange={v => updatePulseEvent(i, "frequency", v)}>
                          <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="once">Once</SelectItem>
                            <SelectItem value="yearly">Once/year (365d)</SelectItem>
                            <SelectItem value="biannual">Twice/year (182d)</SelectItem>
                            <SelectItem value="biennial">Once/2 years (730d)</SelectItem>
                            <SelectItem value="custom">Custom interval</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {pe.frequency === "custom" && (
                        <div>
                          <Label className="text-xs">Interval (days)</Label>
                          <Input type="number" value={pe.customIntervalDays} onChange={e => updatePulseEvent(i, "customIntervalDays", Number(e.target.value))} min={1} className="text-xs" />
                        </div>
                      )}
                      <div>
                        <Label className="text-xs">Total Rounds</Label>
                        <Input type="number" value={pe.totalRounds} onChange={e => updatePulseEvent(i, "totalRounds", Number(e.target.value))} min={1} max={50} step={1} className="text-xs" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Effect Expression <span className="text-muted-foreground">(optional override)</span></Label>
                      <Input value={pe.effectExpression} onChange={e => updatePulseEvent(i, "effectExpression", e.target.value)} placeholder="Leave blank for default: move coverage fraction to treatment" className="font-mono text-xs" />
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">
                        <Clock className="h-3 w-3 mr-1" />
                        {pe.frequency === "once" ? `Day ${pe.startTime}` :
                         pe.frequency === "yearly" ? `Every 365d from day ${pe.startTime}` :
                         pe.frequency === "biannual" ? `Every 182d from day ${pe.startTime}` :
                         pe.frequency === "biennial" ? `Every 730d from day ${pe.startTime}` :
                         `Every ${pe.customIntervalDays}d from day ${pe.startTime}`}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">{pe.totalRounds} round{pe.totalRounds > 1 ? "s" : ""}</Badge>
                      <Badge variant="outline" className="text-[10px]">{(pe.coverageFraction * 100).toFixed(0)}% coverage → {pe.targetCompartment}</Badge>
                      <Badge variant="outline" className="text-[10px]">{pe.duration}d duration</Badge>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="gap-2" onClick={addPulseEvent}>
                  <Plus className="h-4 w-4" />Add Pulse Intervention
                </Button>
              </CardContent>
            </Card>

            {/* Run Actions */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-5 w-5 text-primary" />Run Analyses</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full gap-2" onClick={runSimulation} disabled={isLoading}>
                  {loadingAction === "simulate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Run Simulation
                </Button>
                <Button className="w-full gap-2" variant="secondary" onClick={runR0Analysis} disabled={isLoading}>
                  {loadingAction === "r0_analysis" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                  R₀ Analysis
                </Button>
                <Button className="w-full gap-2" variant="secondary" onClick={runSensitivityAnalysis} disabled={isLoading}>
                  {loadingAction === "sensitivity_analysis" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                  Sensitivity Analysis
                </Button>
                <Button className="w-full gap-2" variant="secondary" onClick={runScenarioAnalysis} disabled={isLoading}>
                  {loadingAction === "scenario_analysis" ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                  Scenario Analysis
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* SIMULATION TAB */}
        <TabsContent value="simulation">
          {simulationData && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle>Model Simulation</CardTitle>
                      <CardDescription>{simulationData.summary}</CardDescription>
                    </div>
                    {pulseEvents.length > 0 && (
                      <Button
                        variant={showMdaMarkers ? "default" : "outline"}
                        size="sm"
                        className="gap-2"
                        onClick={() => setShowMdaMarkers(prev => !prev)}
                      >
                        {showMdaMarkers ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        {showMdaMarkers ? "Hide MDA Lines" : "Show MDA Lines"}
                      </Button>
                    )}
                  </div>
                  {pulseEvents.length > 0 && showMdaMarkers && (
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-0 border-t-2 border-dashed border-muted-foreground" />
                        <span>MDA Intervention</span>
                      </div>
                      <span>•</span>
                      <span>{computePulseTimesForScripts().length} event(s) at t = {computePulseTimesForScripts().join(", ")}</span>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="h-[450px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getSimChartData(simulationData.time_series)} margin={{ top: 5, right: 30, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="t" label={{ value: "Time", position: "insideBottom", offset: -5 }} />
                        <YAxis />
                        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                        <Legend />
                        {Object.keys(simulationData.time_series).map((key, i) => (
                          <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} name={key} />
                        ))}
                        {showMdaMarkers && computePulseTimesForScripts().map((pt, i) => (
                          <ReferenceLine key={`pulse-${i}`} x={pt} stroke="hsl(var(--muted-foreground))" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `MDA`, position: "top", fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* AI-Powered Insights */}
              <Card className="border-primary/20">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        AI-Powered Interpretation
                      </CardTitle>
                      <CardDescription>Get deep epidemiological insights from your simulation results</CardDescription>
                    </div>
                    <Button
                      variant={aiInsights ? "outline" : "default"}
                      size="sm"
                      className="gap-2"
                      onClick={interpretSimulation}
                      disabled={isGeneratingInsights || isLoading}
                    >
                      {isGeneratingInsights ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
                      {isGeneratingInsights ? "Analyzing..." : aiInsights ? "Regenerate Insights" : "Generate Insights"}
                    </Button>
                  </div>
                </CardHeader>
                {aiInsights && (
                  <CardContent className="space-y-4">
                    {/* Overall Trajectory */}
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <h4 className="font-semibold text-sm text-foreground mb-2 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        Overall Trajectory
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">{aiInsights.overall_trajectory}</p>
                    </div>

                    {/* Key Findings */}
                    {aiInsights.key_findings && aiInsights.key_findings.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm text-foreground mb-3">Key Findings</h4>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {aiInsights.key_findings.map((finding: any, i: number) => (
                            <div key={i} className={`rounded-lg border p-3 ${
                              finding.severity === 'critical' ? 'border-destructive/30 bg-destructive/5' :
                              finding.severity === 'warning' ? 'border-amber-500/30 bg-amber-500/5' :
                              'border-border bg-card'
                            }`}>
                              <div className="flex items-center gap-2 mb-1">
                                {finding.severity === 'critical' && <AlertTriangle className="h-4 w-4 text-destructive" />}
                                {finding.severity === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                                {finding.severity === 'info' && <Info className="h-4 w-4 text-primary" />}
                                <span className="font-medium text-sm text-foreground">{finding.title}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">{finding.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Compartment Insights */}
                    {aiInsights.compartment_insights && aiInsights.compartment_insights.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm text-foreground mb-3">Compartment Analysis</h4>
                        <div className="space-y-2">
                          {aiInsights.compartment_insights.slice(0, 6).map((ci: any, i: number) => (
                            <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                              <Badge variant="outline" className="mt-0.5 font-mono text-xs shrink-0">{ci.compartment}</Badge>
                              <p className="text-xs text-muted-foreground">{ci.insight}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Public Health Implications */}
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                      <h4 className="font-semibold text-sm text-foreground mb-2">Public Health Implications</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">{aiInsights.public_health_implications}</p>
                    </div>

                    {/* Intervention Recommendations */}
                    {aiInsights.intervention_recommendations && aiInsights.intervention_recommendations.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm text-foreground mb-2">Intervention Recommendations</h4>
                        <ul className="space-y-2">
                          {aiInsights.intervention_recommendations.map((rec: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <Target className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Equilibrium Analysis */}
                    {aiInsights.equilibrium_analysis && (
                      <div className="rounded-lg border bg-muted/30 p-4">
                        <h4 className="font-semibold text-sm text-foreground mb-2">Equilibrium Analysis</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">{aiInsights.equilibrium_analysis}</p>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>

              {/* Individual compartment plots */}
              <Card>
                <CardHeader>
                  <CardTitle>Individual Compartment Time Series</CardTitle>
                  <CardDescription>Each compartment plotted separately for detailed analysis</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Object.keys(simulationData.time_series)
                      .filter(key => Array.isArray(simulationData.time_series[key]) && simulationData.time_series[key].length > 0)
                      .map((key, i) => {
                        const singleSeries: Record<string, any> = { [key]: simulationData.time_series[key] };
                        const chartData = getSimChartData(singleSeries);
                        return (
                          <div key={key} className="border rounded-lg p-3 bg-card cursor-pointer hover:border-primary/50 hover:shadow-md transition-all" onClick={() => { setExpandedCompartment({ key, index: i }); setOverlayCompartments([key]); }}>
                            <p className="text-sm font-semibold text-foreground mb-2 flex items-center justify-between">{key}<span className="text-[10px] text-muted-foreground">Click to expand</span></p>
                            <div className="h-[180px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                  <XAxis dataKey="t" tick={{ fontSize: 10 }} />
                                  <YAxis tick={{ fontSize: 10 }} />
                                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                                  <Line type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                                  {showMdaMarkers && computePulseTimesForScripts().map((pt, pi) => (
                                    <ReferenceLine key={`pulse-sm-${pi}`} x={pt} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 3" strokeWidth={1} />
                                  ))}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>

              {/* Expanded compartment modal */}
              <Dialog open={!!expandedCompartment} onOpenChange={() => setExpandedCompartment(null)}>
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                  {expandedCompartment && simulationData?.time_series && (() => {
                    const allKeys = Object.keys(simulationData.time_series).filter(k => Array.isArray(simulationData.time_series[k]) && simulationData.time_series[k].length > 0);
                    const selectedKeys = overlayCompartments.filter(k => allKeys.includes(k));
                    if (selectedKeys.length === 0) return null;

                    const seriesObj: Record<string, any> = {};
                    selectedKeys.forEach(k => { seriesObj[k] = simulationData.time_series[k]; });
                    const chartData = getSimChartData(seriesObj);

                    const toggleOverlay = (key: string) => {
                      setOverlayCompartments(prev =>
                        prev.includes(key) ? (prev.length > 1 ? prev.filter(k => k !== key) : prev) : [...prev, key]
                      );
                    };

                    return (
                      <>
                        <DialogHeader>
                          <DialogTitle>
                            {selectedKeys.length === 1 ? `${selectedKeys[0]} — Time Series` : `Comparing ${selectedKeys.length} Compartments`}
                          </DialogTitle>
                        </DialogHeader>

                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-1">
                          {selectedKeys.map((k, i) => {
                            const values = chartData.map(d => d[k]).filter((v): v is number => v != null);
                            const min = values.length ? Math.min(...values) : 0;
                            const max = values.length ? Math.max(...values) : 0;
                            const final2 = values.length ? values[values.length - 1] : 0;
                            return (
                              <div key={k} className="flex items-center gap-2 border rounded px-2 py-1">
                                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[allKeys.indexOf(k) % COLORS.length] }} />
                                <span className="font-medium text-foreground">{k}</span>
                                <span>Min: {min.toFixed(2)}</span>
                                <span>Max: {max.toFixed(2)}</span>
                                <span>Final: {final2.toFixed(2)}</span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="h-[400px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 5, right: 30, bottom: 25, left: 10 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="t" label={{ value: "Time", position: "insideBottom", offset: -5 }} />
                              <YAxis />
                              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                              <Legend />
                              {selectedKeys.map(k => (
                                <Line key={k} type="monotone" dataKey={k} stroke={COLORS[allKeys.indexOf(k) % COLORS.length]} strokeWidth={2.5} dot={false} name={k} />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="border-t pt-3 mt-2">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Select compartments to overlay:</p>
                          <div className="flex flex-wrap gap-2">
                            {allKeys.map((k, i) => (
                              <label key={k} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs cursor-pointer transition-all ${
                                overlayCompartments.includes(k) ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/40"
                              }`}>
                                <Checkbox
                                  checked={overlayCompartments.includes(k)}
                                  onCheckedChange={() => toggleOverlay(k)}
                                  className="h-3 w-3"
                                />
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                {k}
                              </label>
                            ))}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </DialogContent>
              </Dialog>

              {simulationData.equilibria && simulationData.equilibria.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Equilibria</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {simulationData.equilibria.map((eq: any, i: number) => (
                        <div key={i} className="p-4 rounded-lg border bg-card">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold">{eq.name}</span>
                            <Badge variant={eq.stability === "stable" ? "default" : "destructive"}>{eq.stability}</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground font-mono">
                            {Object.entries(eq.values || {}).map(([k, v]) => <span key={k} className="mr-3">{k} = {String(v)}</span>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* R & Python Scripts */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="h-5 w-5 text-primary" />
                    Reproducible Scripts
                  </CardTitle>
                  <CardDescription>Copy-paste ready R and Python scripts that reproduce this simulation{pulseEvents.length > 0 ? " (including pulse interventions)" : ""}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs value={scriptTab} onValueChange={(v) => setScriptTab(v as "r" | "python")}>
                    <div className="flex items-center justify-between mb-3">
                      <TabsList>
                        <TabsTrigger value="r">R Script</TabsTrigger>
                        <TabsTrigger value="python">Python Script</TabsTrigger>
                      </TabsList>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => copyScript(scriptTab === "r" ? generateRScript() : generatePythonScript())}
                        >
                          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copied ? "Copied!" : "Copy"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => downloadScript(scriptTab === "r" ? generateRScript() : generatePythonScript(), scriptTab)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download {scriptTab === "r" ? ".R" : ".py"}
                        </Button>
                      </div>
                    </div>
                    <TabsContent value="r">
                      <ScrollArea className="h-[400px] rounded-lg border bg-muted/30">
                        <pre className="p-4 text-xs font-mono text-foreground whitespace-pre overflow-x-auto">{generateRScript()}</pre>
                      </ScrollArea>
                    </TabsContent>
                    <TabsContent value="python">
                      <ScrollArea className="h-[400px] rounded-lg border bg-muted/30">
                        <pre className="p-4 text-xs font-mono text-foreground whitespace-pre overflow-x-auto">{generatePythonScript()}</pre>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* R0 TAB */}
        <TabsContent value="r0">
          {r0Results && (
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="md:col-span-2 border-primary/20">
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row items-start gap-6">
                    <div className="p-6 rounded-2xl bg-primary/10 text-center min-w-[140px]">
                      <p className="text-sm text-muted-foreground mb-1">Basic Reproduction Number</p>
                      <p className="text-5xl font-bold text-primary">{typeof r0Results.r0_value === 'number' ? r0Results.r0_value.toFixed(3) : r0Results.r0_value}</p>
                      <Badge className="mt-2" variant={r0Results.r0_value > 1 ? "destructive" : "default"}>
                        {r0Results.r0_value > 1 ? "Epidemic Growth" : "Epidemic Decline"}
                      </Badge>
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <Label className="text-sm text-muted-foreground">Analytical Formula</Label>
                        <p className="font-mono text-lg text-foreground bg-muted/50 rounded-lg p-3 mt-1">{r0Results.r0_formula}</p>
                      </div>
                      <p className="text-sm text-foreground">{r0Results.interpretation}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {r0Results.threshold_analysis && (
                <Card>
                  <CardHeader><CardTitle>Threshold Analysis</CardTitle></CardHeader>
                  <CardContent><p className="text-sm text-foreground">{r0Results.threshold_analysis}</p></CardContent>
                </Card>
              )}
              {r0Results.parameter_thresholds && r0Results.parameter_thresholds.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Parameter Thresholds</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {r0Results.parameter_thresholds.map((pt: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                          <span className="font-mono font-medium">{pt.parameter}</span>
                          <span className="text-sm text-muted-foreground">{pt.condition}</span>
                          <Badge variant="outline">{typeof pt.threshold_value === 'number' ? pt.threshold_value.toFixed(4) : pt.threshold_value}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* SENSITIVITY TAB */}
        <TabsContent value="sensitivity">
          {sensitivityResults && (
            <div className="space-y-6">
              <Card className="border-primary/20">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-3">
                    <AlertTriangle className="h-5 w-5 text-accent" />
                    <span className="font-semibold">Most Sensitive Parameter: <span className="text-primary font-mono">{sensitivityResults.most_sensitive_parameter}</span></span>
                  </div>
                  <p className="text-sm text-muted-foreground">{sensitivityResults.summary}</p>
                </CardContent>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Sensitivity Indices (Tornado Chart)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sensitivityResults.sensitivity_indices} layout="vertical" margin={{ left: 80 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis type="number" />
                          <YAxis type="category" dataKey="parameter" tick={{ fontSize: 12 }} />
                          <Tooltip contentStyle={{ borderRadius: 8 }} />
                          <Legend />
                          <Bar dataKey="sensitivity_to_r0" fill="hsl(var(--primary))" name="Sensitivity to Final Value" radius={[0, 4, 4, 0]} />
                          {sensitivityResults.sensitivity_indices[0]?.sensitivity_to_peak !== undefined && (
                            <Bar dataKey="sensitivity_to_peak" fill="hsl(var(--accent))" name="Sensitivity to Peak" radius={[0, 4, 4, 0]} />
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Parameter Details</CardTitle></CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[350px]">
                      <div className="space-y-3">
                        {sensitivityResults.sensitivity_indices.map((si: any, i: number) => (
                          <div key={i} className="p-3 rounded-lg border bg-card">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono font-semibold text-sm">{si.parameter}</span>
                              <Badge variant={Math.abs(si.sensitivity_to_r0) > 0.5 ? "destructive" : "secondary"}>
                                {si.sensitivity_to_r0?.toFixed(3)}
                              </Badge>
                            </div>
                            {si.interpretation && <p className="text-xs text-muted-foreground">{si.interpretation}</p>}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {sensitivityResults.recommendations && (
                <Card>
                  <CardHeader><CardTitle>Recommendations</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {sensitivityResults.recommendations.map((r: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm"><TrendingUp className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />{r}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* SCENARIOS TAB */}
        <TabsContent value="scenarios">
          {scenarioResults && (
            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle>Scenario Comparison</CardTitle><CardDescription>{scenarioResults.comparison_summary}</CardDescription></CardHeader>
                <CardContent>
                  {compartments.slice(0, 4).map(comp => {
                    const chartData: any[] = [];
                    const maxLen = Math.max(
                      ...scenarioResults.scenarios.map((s: any) => s.time_series?.[comp]?.length || 0)
                    );
                    for (let i = 0; i < Math.min(maxLen, 200); i++) {
                      const row: Record<string, number> = {};
                      scenarioResults.scenarios.forEach((s: any) => {
                        const ts = s.time_series?.[comp];
                        if (ts && ts[i]) {
                          row.t = ts[i].t;
                          row[s.name] = ts[i].value;
                        }
                      });
                      if (row.t !== undefined) chartData.push(row);
                    }
                    if (chartData.length === 0) return null;
                    return (
                      <div key={comp} className="mb-6">
                        <h4 className="font-semibold text-sm mb-2">Compartment: {comp}</h4>
                        <div className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="t" />
                              <YAxis />
                              <Tooltip contentStyle={{ borderRadius: 8 }} />
                              <Legend />
                              {scenarioResults.scenarios.map((s: any, i: number) => (
                                <Line key={s.name} type="monotone" dataKey={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {scenarioResults.scenarios.map((s: any, i: number) => (
                  <Card key={i} className="border-l-4" style={{ borderLeftColor: COLORS[i % COLORS.length] }}>
                    <CardContent className="pt-4 space-y-2">
                      <h4 className="font-semibold text-foreground">{s.name}</h4>
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                      {s.r0 !== undefined && s.r0 !== 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">R₀</span>
                          <Badge variant={s.r0 > 1 ? "destructive" : "default"}>{s.r0.toFixed(2)}</Badge>
                        </div>
                      )}
                      {s.peak_info && (
                        <div className="text-xs text-muted-foreground">
                          Peak {s.peak_info.compartment}: {s.peak_info.peak_value?.toFixed(0)} at t={s.peak_info.peak_time?.toFixed(1)}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* FITTING SETUP TAB */}
        <TabsContent value="fitting-setup">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary" />Import Data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button variant={fittingSource === "file" ? "default" : "outline"} size="sm" onClick={() => setFittingSource("file")}>From File</Button>
                  <Button variant={fittingSource === "form" ? "default" : "outline"} size="sm" onClick={() => setFittingSource("form")}>From Form Data</Button>
                </div>

                {fittingSource === "file" ? (
                  <div>
                    <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                    <Button variant="outline" className="w-full gap-2" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-4 w-4" />Upload CSV / Excel File
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Select value={selectedProject} onValueChange={setSelectedProject}>
                      <SelectTrigger><SelectValue placeholder="Select project..." /></SelectTrigger>
                      <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={selectedForm} onValueChange={setSelectedForm}>
                      <SelectTrigger><SelectValue placeholder="Select form..." /></SelectTrigger>
                      <SelectContent>{forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button variant="outline" className="w-full" onClick={loadFormDataForFitting} disabled={!selectedForm}>Load Form Data</Button>
                  </div>
                )}

                {fittingData.length > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                    <span className="font-medium text-foreground">{fittingData.length} rows loaded</span>
                    {fittingSheets.length > 1 && (
                      <p className="text-xs text-muted-foreground">
                        Sheets: {fittingSheets.map(s => `${s.name} (${s.data.length} rows)`).join(", ")}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">Columns: {fittingColumns.join(", ")}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-accent" />Fitting Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-semibold mb-2 block">Parameters to Fit</Label>
                  <div className="flex flex-wrap gap-2">
                    {parameters.map(p => (
                      <label key={p.name} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer text-sm transition-all ${
                        targetFitParams.includes(p.name) ? "border-primary bg-primary/10 text-primary" : "border-border"
                      }`}>
                        <input
                          type="checkbox"
                          checked={targetFitParams.includes(p.name)}
                          onChange={e => {
                            setTargetFitParams(prev => e.target.checked ? [...prev, p.name] : prev.filter(x => x !== p.name));
                          }}
                          className="hidden"
                        />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>

                {fittingColumns.length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Column Mapping</Label>
                    <p className="text-xs text-muted-foreground mb-2">Map data columns to model compartments</p>
                    {compartments.map(comp => (
                      <div key={comp} className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-mono w-12">{comp} →</span>
                        <Select value={columnMapping[comp] || ""} onValueChange={v => setColumnMapping(prev => ({ ...prev, [comp]: v }))}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Select column..." /></SelectTrigger>
                          <SelectContent>{fittingColumns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}

                <Button className="w-full gap-2" onClick={runModelFitting} disabled={isLoading || fittingData.length === 0 || targetFitParams.length === 0}>
                  {loadingAction === "fit_model" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Fit Model
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* FITTING RESULTS TAB */}
        <TabsContent value="fitting">
          {fittingResults && (
            <div className="space-y-6">
              <Card className="border-primary/20">
                <CardContent className="pt-6">
                  <p className="text-sm text-foreground">{fittingResults.summary}</p>
                  {fittingResults.calibration_methodology && (
                    <p className="text-xs text-muted-foreground mt-2"><strong>Methodology:</strong> {fittingResults.calibration_methodology}</p>
                  )}
                  {fittingResults.data_summary && (
                    <p className="text-xs text-muted-foreground mt-1"><strong>Data:</strong> {fittingResults.data_summary}</p>
                  )}
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="gold"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        const calibrated = getCalibratedParams();
                        setPreCalibrationParams(Object.fromEntries(parameters.map(p => [p.name, p.value])));
                        setParameters(calibrated);
                        setActiveTab("setup");
                        toast({ title: "Calibrated parameters applied", description: "Parameters updated in the Setup tab. Changed values are highlighted." });
                      }}
                    >
                      <Zap className="h-4 w-4" />
                      Apply Calibrated Parameters to Setup
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(fittingResults.goodness_of_fit || {}).map(([key, val]) => (
                  <Card key={key}>
                    <CardContent className="pt-4 pb-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{key.replace(/_/g, " ")}</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{typeof val === 'number' ? (val as number).toFixed(4) : String(val)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Parameter Table with Sources */}
              {fittingResults.parameter_table && fittingResults.parameter_table.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <BookOpen className="h-5 w-5 text-primary" />
                          Complete Parameter Table
                        </CardTitle>
                        <CardDescription>All model parameters with values, sources, and citations</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="gap-2" onClick={exportParameterTableExcel}>
                          <FileDown className="h-3.5 w-3.5" />Excel
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2" onClick={exportParameterTablePDF}>
                          <FileDown className="h-3.5 w-3.5" />PDF
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-3 font-semibold text-foreground">Parameter</th>
                            <th className="text-left p-3 font-semibold text-foreground">Description</th>
                            <th className="text-right p-3 font-semibold text-foreground">Value</th>
                            <th className="text-center p-3 font-semibold text-foreground">Source</th>
                            <th className="text-left p-3 font-semibold text-foreground">Citation / Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fittingResults.parameter_table.map((param: any, i: number) => (
                            <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
                              <td className="p-3 font-mono font-semibold text-foreground">{param.name}</td>
                              <td className="p-3 text-muted-foreground text-xs max-w-[200px]">{param.description || "—"}</td>
                              <td className="p-3 text-right font-mono text-foreground">
                                {typeof param.value === 'number' ? param.value.toPrecision(4) : param.value}
                                {param.confidence_interval && (
                                  <span className="block text-xs text-muted-foreground">
                                    [{param.confidence_interval.lower?.toPrecision(3)}, {param.confidence_interval.upper?.toPrecision(3)}]
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <Badge 
                                  variant={param.source === "Literature" ? "default" : param.source === "Calibrated" ? "destructive" : "secondary"}
                                  className="text-xs"
                                >
                                  {param.source}
                                </Badge>
                              </td>
                              <td className="p-3 text-xs text-muted-foreground">
                                {param.source === "Literature" && param.citation ? (
                                  <span className="text-primary font-medium italic">{param.citation}</span>
                                ) : param.notes || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Source legend */}
                    <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="default" className="text-xs">Literature</Badge>
                        <span>Values from published research</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="destructive" className="text-xs">Calibrated</Badge>
                        <span>Estimated from uploaded data</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-xs">Assumed</Badge>
                        <span>Reasonable default assumptions</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Legacy fitted_parameters display (fallback) */}
              {!fittingResults.parameter_table && fittingResults.fitted_parameters && (
                <Card>
                  <CardHeader><CardTitle>Fitted Parameters</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {fittingResults.fitted_parameters.map((fp: any, i: number) => (
                        <div key={i} className="p-4 rounded-lg border bg-card">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono font-semibold">{fp.name}</span>
                            <Badge variant="default">{fp.fitted_value?.toFixed(6)}</Badge>
                          </div>
                          {fp.initial_value !== undefined && (
                            <p className="text-xs text-muted-foreground">Initial: {fp.initial_value}</p>
                          )}
                          {fp.confidence_interval && (
                            <p className="text-xs text-muted-foreground">
                              95% CI: [{fp.confidence_interval.lower?.toFixed(6)}, {fp.confidence_interval.upper?.toFixed(6)}]
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Fitted vs Observed Chart - always show if we have fitting results */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle>Fitted vs Observed</CardTitle>
                      <CardDescription>
                        {calibratedSimData
                          ? "Calibrated simulation curves overlaid on observed data points"
                          : fittingResults.fitted_curves
                          ? "AI-generated fitted curves compared to observed data"
                          : "Run a calibrated simulation to overlay model curves on your observed data."}
                      </CardDescription>
                    </div>
                    <Button
                      variant="acg"
                      size="sm"
                      className="gap-2"
                      onClick={runCalibratedSimulation}
                      disabled={isLoading}
                    >
                      {isLoading && loadingAction === "calibrated_simulation" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      Run Calibrated Simulation
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {(() => {
                    let chartData: Record<string, number>[] = [];
                    let dataKeys: string[] = [];
                    const observedKeys: string[] = [];
                    const fittedKeys: string[] = [];

                    // 1. Build observed data from uploaded fitting data
                    const mappedComps = Object.entries(columnMapping).filter(([_, col]) => col);
                    let observedPoints: Record<string, number>[] = [];
                    if (fittingData.length > 0 && mappedComps.length > 0) {
                      observedPoints = fittingData.slice(0, 500).map((row, i) => {
                        const point: Record<string, number> = { t: row.t ?? row.time ?? row.Time ?? i };
                        mappedComps.forEach(([comp, col]) => {
                          const val = Number(row[col]);
                          if (!isNaN(val)) point[`Observed ${comp}`] = val;
                        });
                        return point;
                      });
                      mappedComps.forEach(([comp]) => observedKeys.push(`Observed ${comp}`));
                    }

                    // 2. Build fitted curves from calibrated simulation
                    if (calibratedSimData?.time_series) {
                      const simChart = getSimChartData(calibratedSimData.time_series);
                      const simKeys = Object.keys(calibratedSimData.time_series).filter(
                        k => Array.isArray(calibratedSimData.time_series[k]) && calibratedSimData.time_series[k].length > 0
                      );
                      // Merge observed + simulated
                      const maxLen = Math.max(observedPoints.length, simChart.length);
                      for (let i = 0; i < maxLen; i++) {
                        const row: Record<string, number> = { t: simChart[i]?.t ?? observedPoints[i]?.t ?? i };
                        // Add sim data
                        if (i < simChart.length) {
                          simKeys.forEach(k => { if (simChart[i][k] !== undefined) row[`Fitted ${k}`] = simChart[i][k]; });
                        }
                        // Add observed data (match by closest t)
                        if (i < observedPoints.length) {
                          observedKeys.forEach(k => { if (observedPoints[i][k] !== undefined) row[k] = observedPoints[i][k]; });
                        }
                        chartData.push(row);
                      }
                      simKeys.forEach(k => fittedKeys.push(`Fitted ${k}`));
                      dataKeys = [...observedKeys, ...fittedKeys];
                    } else if (fittingResults.fitted_curves && typeof fittingResults.fitted_curves === 'object') {
                      // Fallback: AI-generated fitted curves
                      const keys = Object.keys(fittingResults.fitted_curves).filter(
                        k => Array.isArray(fittingResults.fitted_curves[k]) && fittingResults.fitted_curves[k].length > 0
                      );
                      if (keys.length > 0) {
                        const aiChart = getSimChartData(fittingResults.fitted_curves);
                        const maxLen = Math.max(observedPoints.length, aiChart.length);
                        for (let i = 0; i < maxLen; i++) {
                          const row: Record<string, number> = { t: aiChart[i]?.t ?? observedPoints[i]?.t ?? i };
                          if (i < aiChart.length) {
                            keys.forEach(k => { if (aiChart[i][k] !== undefined) row[`Fitted ${k}`] = aiChart[i][k]; });
                          }
                          if (i < observedPoints.length) {
                            observedKeys.forEach(k => { if (observedPoints[i][k] !== undefined) row[k] = observedPoints[i][k]; });
                          }
                          chartData.push(row);
                        }
                        keys.forEach(k => fittedKeys.push(`Fitted ${k}`));
                        dataKeys = [...observedKeys, ...fittedKeys];
                      }
                    }

                    // Fallback: only observed
                    if (chartData.length === 0 && observedPoints.length > 0) {
                      chartData = observedPoints;
                      dataKeys = observedKeys;
                    }

                    if (chartData.length === 0) {
                      return (
                        <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                          <div className="text-center space-y-2">
                            <LineChartIcon className="h-10 w-10 mx-auto opacity-30" />
                            <p>No data available yet.</p>
                            <p className="text-xs">Upload observed data in Fitting Setup, then click "Run Calibrated Simulation" to overlay model curves.</p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData} margin={{ top: 5, right: 30, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="t" label={{ value: "Time", position: "insideBottom", offset: -5 }} />
                            <YAxis />
                            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                            <Legend />
                            {dataKeys.map((key, i) => {
                              const isObserved = key.startsWith("Observed");
                              return (
                                <Line
                                  key={key}
                                  type="monotone"
                                  dataKey={key}
                                  stroke={COLORS[i % COLORS.length]}
                                  strokeWidth={isObserved ? 1 : 2.5}
                                  dot={isObserved ? { r: 3, fill: COLORS[i % COLORS.length] } : false}
                                  strokeDasharray={isObserved ? "5 3" : undefined}
                                  name={key}
                                  connectNulls
                                />
                              );
                            })}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Calibrated Reproducible Scripts */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="h-5 w-5 text-primary" />
                    Reproducible Scripts (Calibrated Parameters)
                  </CardTitle>
                  <CardDescription>R and Python scripts using the calibrated parameter values from fitting</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs value={fittingScriptTab} onValueChange={(v) => setFittingScriptTab(v as "r" | "python")}>
                    <div className="flex items-center justify-between mb-3">
                      <TabsList>
                        <TabsTrigger value="r">R Script</TabsTrigger>
                        <TabsTrigger value="python">Python Script</TabsTrigger>
                      </TabsList>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => copyScript(fittingScriptTab === "r" ? generateCalibratedRScript() : generateCalibratedPythonScript())}
                        >
                          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copied ? "Copied!" : "Copy"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => downloadScript(fittingScriptTab === "r" ? generateCalibratedRScript() : generateCalibratedPythonScript(), fittingScriptTab)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download {fittingScriptTab === "r" ? ".R" : ".py"}
                        </Button>
                      </div>
                    </div>
                    <TabsContent value="r">
                      <ScrollArea className="h-[400px] rounded-lg border bg-muted/30">
                        <pre className="p-4 text-xs font-mono text-foreground whitespace-pre overflow-x-auto">{generateCalibratedRScript()}</pre>
                      </ScrollArea>
                    </TabsContent>
                    <TabsContent value="python">
                      <ScrollArea className="h-[400px] rounded-lg border bg-muted/30">
                        <pre className="p-4 text-xs font-mono text-foreground whitespace-pre overflow-x-auto">{generateCalibratedPythonScript()}</pre>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="w-80">
            <CardContent className="pt-6 text-center space-y-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
              <p className="font-semibold text-foreground">Running {loadingAction.replace(/_/g, " ")}...</p>
              <p className="text-sm text-muted-foreground">
                {loadingAction === "sensitivity_analysis" && parameters.length > 15
                  ? "Analyzing multiple parameters — this may take a moment for complex models"
                  : loadingAction === "interpret_simulation"
                  ? "AI is analyzing your simulation dynamics"
                  : loadingAction === "generate_assumptions"
                  ? "AI is generating model assumptions"
                  : "AI is computing your results"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default MathModelingView;
