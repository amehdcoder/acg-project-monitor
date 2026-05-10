import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { localMathModelSimulation } from "@/lib/aiCreditFallback";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Calculator, Play, Loader2, Plus, Trash2, Upload, Sparkles,
  TrendingUp, BarChart3, Target, AlertTriangle, FileSpreadsheet,
  Variable, FlaskConical, LineChart as LineChartIcon, Sigma, Copy, Check, Code, Download,
  Zap, Clock, Brain, BookOpen, Lightbulb, Info, Eye, EyeOff, FileDown, RotateCcw,
  Palette, FileImage, FileText, Image
} from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter,
  ReferenceLine
} from "recharts";
import * as XLSX from "xlsx";
import { CalibrationWorkspace } from "@/components/MathModeling/CalibrationWorkspace";
import { SensitivityWorkspace } from "@/components/MathModeling/SensitivityWorkspace";

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
  const [compartmentColors, setCompartmentColors] = useState<Record<string, string>>({});
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [exportingPlot, setExportingPlot] = useState(false);
  const [simViewRange, setSimViewRange] = useState<{ start: number; end: number } | null>(null);
  const simulationChartRef = useRef<HTMLDivElement>(null);

  // ─── Chart customisation (titles + legend position + bulk export) ───
  const [showChartCustomiser, setShowChartCustomiser] = useState(false);
  const [mainChartTitle, setMainChartTitle] = useState("");
  const [individualTitles, setIndividualTitles] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("mm_individual_titles") || "{}"); } catch { return {}; }
  });
  // Per-compartment X-axis label (e.g., "Time (days)", "Weeks since baseline") — persisted.
  const [individualXLabels, setIndividualXLabels] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("mm_individual_xlabels") || "{}"); } catch { return {}; }
  });
  // Per-compartment Y-axis symbol override (e.g., "S_hcn", "Population", "I_a") — persisted.
  const [individualYSymbols, setIndividualYSymbols] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("mm_individual_ysymbols") || "{}"); } catch { return {}; }
  });
  const [legendPosition, setLegendPosition] = useState<"top" | "bottom" | "left" | "right">("bottom");
  const [selectedForBulkExport, setSelectedForBulkExport] = useState<string[]>([]);
  const [bulkExporting, setBulkExporting] = useState(false);
  const [singleExporting, setSingleExporting] = useState<string | null>(null);
  // Keyboard navigation focus index for the individual compartment chart grid.
  const [focusedCompartmentIdx, setFocusedCompartmentIdx] = useState<number>(-1);
  const [chartAnnouncement, setChartAnnouncement] = useState<string>("");
  // Rolling log of keyboard-navigated tooltip announcements for accessibility verification.
  const [announcementLog, setAnnouncementLog] = useState<{ ts: string; key: string; text: string }[]>([]);
  const ANNOUNCEMENT_LOG_MAX = 200;
  const individualChartRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Persist per-compartment chart customisation so labels survive refresh and exports.
  useEffect(() => {
    try { localStorage.setItem("mm_individual_titles", JSON.stringify(individualTitles)); } catch { /* noop */ }
  }, [individualTitles]);
  useEffect(() => {
    try { localStorage.setItem("mm_individual_xlabels", JSON.stringify(individualXLabels)); } catch { /* noop */ }
  }, [individualXLabels]);
  useEffect(() => {
    try { localStorage.setItem("mm_individual_ysymbols", JSON.stringify(individualYSymbols)); } catch { /* noop */ }
  }, [individualYSymbols]);

  // Append to verification log when announcements change.
  const logAnnouncement = useCallback((key: string, text: string) => {
    setChartAnnouncement(text);
    setAnnouncementLog(prev => {
      const next = [...prev, { ts: new Date().toISOString(), key, text }];
      return next.length > ANNOUNCEMENT_LOG_MAX ? next.slice(-ANNOUNCEMENT_LOG_MAX) : next;
    });
  }, []);

  const exportAnnouncementLog = (format: "csv" | "txt") => {
    if (announcementLog.length === 0) {
      toast({
        title: "No announcements yet",
        description: "Tab into a compartment chart and use arrow keys to navigate.",
        variant: "destructive",
      });
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    let blob: Blob;
    let filename: string;
    if (format === "csv") {
      const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
      const rows = ["timestamp,compartment,announcement"]
        .concat(announcementLog.map(a => [esc(a.ts), esc(a.key), esc(a.text)].join(",")));
      blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
      filename = `chart-announcements-${stamp}.csv`;
    } else {
      const lines = announcementLog.map(a => `[${a.ts}] (${a.key}) ${a.text}`);
      blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
      filename = `chart-announcements-${stamp}.txt`;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: `${format.toUpperCase()} exported`, description: `${announcementLog.length} announcement(s) saved.` });
  };

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

  const getColor = (key: string, index: number) => compartmentColors[key] || COLORS[index % COLORS.length];

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
  const fittedChartRef = useRef<HTMLDivElement>(null);
  const [fittedViewComp, setFittedViewComp] = useState<string | null>(null);

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
      // Auto-set duration when selecting a Xd_ frequency preset
      if (field === "frequency") {
        const durMap: Record<string, number> = {
          "10d_annually": 10, "12d_annually": 12, "14d_annually": 14,
          "10d_biannually": 10, "12d_biannually": 12, "14d_biannually": 14,
        };
        if (durMap[value]) next[index].duration = durMap[value];
      }
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
    pulseEvents: pulseEvents.length > 0 ? pulseEvents.map(pe => ({
      ...pe,
      targetCompartment: pe.targetCompartments[0] || "",
      targetCompartments: pe.targetCompartments,
    })) : undefined,
    assumptions: modelAssumptions || undefined,
  });

  const callMathModel = async (action: string, extraBody = {}) => {
    setIsLoading(true);
    setLoadingAction(action);
    try {
      const payload = getPayload();
      const fullBody = { action, ...payload, ...extraBody };

      // ALL actions go to the edge function first — it has the RK4 solver,
      // NGM R₀ computation, sensitivity analysis, scenario engine, and AI.
      try {
        const { data, error } = await supabase.functions.invoke("math-model", {
          body: fullBody,
        });
        if (!error && data && !data.error) {
          return data;
        }
        // If edge function returned an error object with fallback flag, try local
        if (data?.fallback) {
          console.warn("Edge function signalled fallback:", data.error);
        } else if (error) {
          console.warn("Edge function invocation error:", error);
        } else if (data?.error) {
          // Non-fallback error from edge function (e.g. "Unknown action")
          toast({ title: "Error", description: data.error, variant: "destructive" });
          return null;
        }
      } catch (edgeErr) {
        console.warn("math-model edge function unavailable, using local fallback:", edgeErr);
      }

      // Local fallback only for simulation (other actions need the server)
      if (action === "simulate") {
        const local = localMathModelSimulation(action, payload);
        if (local && !local.error) return local;
      }

      toast({ title: "Analysis unavailable", description: "The backend function could not be reached. Please try again.", variant: "destructive" });
      return null;
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
      const payload = {
        equations,
        parameters: Object.fromEntries(calibrated.map(p => [p.name, p.value])),
        initialValues: Object.fromEntries(initialValues.map(v => [v.name, v.value])),
        timeConfig,
        compartments,
        pulseEvents: pulseEvents.length > 0 ? pulseEvents : undefined,
        assumptions: modelAssumptions || undefined,
      };
      const data = localMathModelSimulation("simulate", payload);
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
      const freqMap: Record<string, number> = { yearly: 365, biannual: 182.5, biennial: 730, "10d_annually": 365, "12d_annually": 365, "14d_annually": 365, "10d_biannually": 182.5, "12d_biannually": 182.5, "14d_biannually": 182.5, custom: pe.customIntervalDays };
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
      const eventLines = pulseEvents.map(pe => {
        return pe.targetCompartments.map(tc => {
          const recv = compartments.find(c => c !== tc && /^[TR]/i.test(c));
          return `    transferred <- y["${tc}"] * ${pe.coverageFraction}
    y["${tc}"] <- y["${tc}"] - transferred${recv ? `\n    y["${recv}"] <- y["${recv}"] + transferred` : ""}`;
        }).join("\n");
      }).join("\n") + "\n    y[y < 0] <- 0";

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
        return pe.targetCompartments.map(tc => {
          const targetIdx = compartments.indexOf(tc);
          const receiverComp = compartments.find(c => c !== tc && /^[TR]/i.test(c));
          const receiverIdx = receiverComp ? compartments.indexOf(receiverComp) : -1;
          return `        transferred = current_y[${targetIdx}] * ${pe.coverageFraction}  # ${tc}
        current_y[${targetIdx}] -= transferred${receiverIdx >= 0 ? `\n        current_y[${receiverIdx}] += transferred  # -> ${receiverComp}` : ""}`;
        }).join("\n") + "\n        current_y = np.maximum(current_y, 0)";
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

  // === SIMULATION EXPORT FUNCTIONS ===
  const exportSimPlot = async (format: "png" | "jpeg" | "pdf") => {
    if (!simulationChartRef.current) return;
    setExportingPlot(true);
    try {
      const canvas = await html2canvas(simulationChartRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      if (format === "pdf") {
        const imgData = canvas.toDataURL("image/png");
        const w = canvas.width;
        const h = canvas.height;
        const pdf = new jsPDF({ orientation: w > h ? "landscape" : "portrait", unit: "px", format: [w, h] });
        pdf.addImage(imgData, "PNG", 0, 0, w, h);
        pdf.save(`simulation-plot-${Date.now()}.pdf`);
      } else {
        const link = document.createElement("a");
        link.download = `simulation-plot-${Date.now()}.${format}`;
        link.href = canvas.toDataURL(`image/${format}`, 0.95);
        link.click();
      }
      toast({ title: `Plot exported as ${format.toUpperCase()}` });
    } catch (err) {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExportingPlot(false);
    }
  };

  const exportSimValues = (format: "csv" | "xlsx" | "pdf") => {
    if (!simulationData?.time_series) return;
    const chartData = getSimChartData(simulationData.time_series);
    const keys = Object.keys(simulationData.time_series).filter(k => Array.isArray(simulationData.time_series[k]));

    if (format === "csv" || format === "xlsx") {
      // State values sheet
      const stateRows = chartData.map(row => {
        const out: Record<string, number> = { Time: row.t };
        keys.forEach(k => { out[k] = row[k] ?? 0; });
        return out;
      });
      const ws1 = XLSX.utils.json_to_sheet(stateRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws1, "State Values");

      // Parameter values sheet
      const paramRows = parameters.map(p => ({ Parameter: p.name, Value: p.value }));
      const ws2 = XLSX.utils.json_to_sheet(paramRows);
      XLSX.utils.book_append_sheet(wb, ws2, "Parameters");

      // Initial values sheet
      const ivRows = initialValues.map(iv => ({ Compartment: iv.name, "Initial Value": iv.value }));
      const ws3 = XLSX.utils.json_to_sheet(ivRows);
      XLSX.utils.book_append_sheet(wb, ws3, "Initial Values");

      XLSX.writeFile(wb, `simulation-data-${Date.now()}.${format}`, { bookType: format === "csv" ? "csv" : "xlsx" });
      toast({ title: `Data exported as ${format.toUpperCase()}` });
    } else if (format === "pdf") {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pw = doc.internal.pageSize.getWidth();
      doc.setFontSize(14);
      doc.text("Simulation Data Export", 14, 15);
      doc.setFontSize(8);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 21);

      // Parameters table
      let y = 30;
      doc.setFontSize(11);
      doc.text("Parameters", 14, y); y += 6;
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text("Parameter", 14, y); doc.text("Value", 60, y); y += 4;
      doc.setFont("helvetica", "normal");
      parameters.forEach(p => {
        if (y > 190) { doc.addPage(); y = 15; }
        doc.text(p.name, 14, y); doc.text(String(p.value), 60, y); y += 4;
      });

      // Initial Values table
      y += 4;
      doc.setFontSize(11);
      doc.text("Initial Values", 14, y); y += 6;
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text("Compartment", 14, y); doc.text("Value", 60, y); y += 4;
      doc.setFont("helvetica", "normal");
      initialValues.forEach(iv => {
        if (y > 190) { doc.addPage(); y = 15; }
        doc.text(iv.name, 14, y); doc.text(String(iv.value), 60, y); y += 4;
      });

      // State values (first/last few rows as summary)
      doc.addPage();
      y = 15;
      doc.setFontSize(11);
      doc.text("State Values (Summary — First & Last 20 time steps)", 14, y); y += 6;
      doc.setFontSize(6);
      const headerCols = ["Time", ...keys];
      doc.setFont("helvetica", "bold");
      headerCols.forEach((h, i) => doc.text(h.substring(0, 12), 14 + i * 25, y));
      y += 4;
      doc.setFont("helvetica", "normal");
      const summaryRows = [...chartData.slice(0, 20), ...chartData.slice(-20)];
      summaryRows.forEach(row => {
        if (y > 190) { doc.addPage(); y = 15; }
        headerCols.forEach((h, i) => {
          const val = h === "Time" ? row.t : (row[h] ?? 0);
          doc.text(typeof val === "number" ? val.toPrecision(5) : String(val), 14 + i * 25, y);
        });
        y += 3.5;
      });

      doc.save(`simulation-data-${Date.now()}.pdf`);
      toast({ title: "Data exported as PDF" });
    }
  };

  // ─── Subscript-aware label renderer ──────────────────────────
  // Convert "S_hcn" → S₍hcn₎ as JSX with <sub>; fully supports plain text too.
  // Also auto-detects compartment-style names like "Shcn" → "S<sub>hcn</sub>"
  // when the first char is uppercase letter and rest is lowercase.
  const renderWithSubscript = (text: string) => {
    if (!text) return null;
    // Explicit underscores: "Beta_sac" → Beta<sub>sac</sub>; "S_1" → S<sub>1</sub>
    if (text.includes("_")) {
      const parts = text.split(/(_[A-Za-z0-9]+)/g);
      return (
        <>
          {parts.map((p, i) => p.startsWith("_")
            ? <sub key={i} className="text-[0.7em]">{p.slice(1)}</sub>
            : <span key={i}>{p}</span>
          )}
        </>
      );
    }
    // Auto subscript for compartment-style (e.g., "Shcn", "Ihce"): one capital + lowercase tail
    const m = text.match(/^([A-Z])([a-z]{2,})$/);
    if (m) return <>{m[1]}<sub className="text-[0.7em]">{m[2]}</sub></>;
    return <>{text}</>;
  };

  // Plain string version for SVG/canvas chart titles (recharts label)
  const formatLabelForChart = (text: string) => {
    if (!text) return "";
    // Map common ASCII → unicode subscripts (digits 0-9 + a-z subset where available)
    const subMap: Record<string, string> = {
      "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉",
      "a":"ₐ","e":"ₑ","h":"ₕ","i":"ᵢ","j":"ⱼ","k":"ₖ","l":"ₗ","m":"ₘ","n":"ₙ","o":"ₒ",
      "p":"ₚ","r":"ᵣ","s":"ₛ","t":"ₜ","u":"ᵤ","v":"ᵥ","x":"ₓ",
    };
    const toUnicodeSub = (s: string) => s.split("").map(c => subMap[c.toLowerCase()] ?? c).join("");
    if (text.includes("_")) {
      return text.replace(/_([A-Za-z0-9]+)/g, (_, sub) => toUnicodeSub(sub));
    }
    const m = text.match(/^([A-Z])([a-z]{2,})$/);
    if (m) return m[1] + toUnicodeSub(m[2]);
    return text;
  };

  // ─── Single-compartment PNG / SVG export ────────────────────────
  // Inline computed styles so the standalone SVG renders without our app CSS variables.
  const inlineSvgStyles = (source: SVGSVGElement, target: SVGSVGElement) => {
    const STYLE_PROPS = [
      "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity",
      "fill-opacity", "opacity", "font-family", "font-size", "font-weight",
      "text-anchor", "dominant-baseline",
    ];
    const sNodes = source.querySelectorAll<Element>("*");
    const tNodes = target.querySelectorAll<Element>("*");
    for (let i = 0; i < sNodes.length && i < tNodes.length; i++) {
      const cs = window.getComputedStyle(sNodes[i]);
      const tEl = tNodes[i] as SVGElement;
      STYLE_PROPS.forEach((p) => {
        const v = cs.getPropertyValue(p);
        if (v) tEl.style.setProperty(p, v);
      });
    }
  };

  const exportSingleCompartmentChart = async (key: string, format: "png" | "svg") => {
    const node = individualChartRefs.current[key];
    if (!node) {
      toast({ title: "Chart not ready", variant: "destructive" });
      return;
    }
    setSingleExporting(`${key}:${format}`);
    try {
      const stamp = Date.now();
      const filenameBase = `compartment-${key}-${stamp}`;
      if (format === "png") {
        const canvas = await html2canvas(node, {
          backgroundColor: "#ffffff",
          scale: 2,
          useCORS: true,
          logging: false,
        });
        const link = document.createElement("a");
        link.download = `${filenameBase}.png`;
        link.href = canvas.toDataURL("image/png", 0.95);
        link.click();
        toast({ title: "PNG exported", description: `${key} chart saved.` });
      } else {
        // SVG export — clone the recharts SVG and inline computed styles.
        const sourceSvg = node.querySelector("svg") as SVGSVGElement | null;
        if (!sourceSvg) {
          toast({ title: "No SVG found in chart", variant: "destructive" });
          return;
        }
        const clone = sourceSvg.cloneNode(true) as SVGSVGElement;
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
        const bbox = sourceSvg.getBoundingClientRect();
        clone.setAttribute("width", String(Math.round(bbox.width)));
        clone.setAttribute("height", String(Math.round(bbox.height)));
        // White background rect for compatibility with report editors.
        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bg.setAttribute("width", "100%");
        bg.setAttribute("height", "100%");
        bg.setAttribute("fill", "#ffffff");
        clone.insertBefore(bg, clone.firstChild);
        inlineSvgStyles(sourceSvg, clone);
        const svgString = new XMLSerializer().serializeToString(clone);
        const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`], {
          type: "image/svg+xml;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `${filenameBase}.svg`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        toast({ title: "SVG exported", description: `${key} vector chart saved.` });
      }
    } catch (err) {
      console.error("Single export failed:", err);
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setSingleExporting(null);
    }
  };

  // ─── Bulk export of individual compartment charts ────────────
  const exportSelectedIndividualCharts = async (format: "png" | "zip" | "pdf") => {
    if (!simulationData?.time_series) return;
    const allKeys = Object.keys(simulationData.time_series).filter(
      k => Array.isArray(simulationData.time_series[k]) && simulationData.time_series[k].length > 0
    );
    const targets = selectedForBulkExport.length > 0 ? selectedForBulkExport : allKeys;
    if (targets.length === 0) {
      toast({ title: "Nothing to export", description: "Run a simulation first.", variant: "destructive" });
      return;
    }
    setBulkExporting(true);
    try {
      // Capture each chart node as canvas
      const captures: { key: string; canvas: HTMLCanvasElement }[] = [];
      for (const key of targets) {
        const node = individualChartRefs.current[key];
        if (!node) continue;
        const canvas = await html2canvas(node, { backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false });
        captures.push({ key, canvas });
      }
      if (captures.length === 0) {
        toast({ title: "No charts captured", variant: "destructive" });
        return;
      }

      const stamp = Date.now();
      if (format === "png") {
        // Single PNG: just download each separately (browser downloads sequentially)
        captures.forEach(({ key, canvas }) => {
          const link = document.createElement("a");
          link.download = `compartment-${key}-${stamp}.png`;
          link.href = canvas.toDataURL("image/png", 0.95);
          link.click();
        });
        toast({ title: `Exported ${captures.length} chart(s) as PNG` });
      } else if (format === "zip") {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        for (const { key, canvas } of captures) {
          const blob: Blob = await new Promise(resolve => canvas.toBlob(b => resolve(b!), "image/png", 0.95));
          zip.file(`compartment-${key}.png`, blob);
        }
        const out = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(out);
        const link = document.createElement("a");
        link.download = `compartment-charts-${stamp}.zip`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        toast({ title: `Exported ${captures.length} chart(s) as ZIP` });
      } else if (format === "pdf") {
        // Multi-page PDF — one chart per page
        const first = captures[0].canvas;
        const pdf = new jsPDF({
          orientation: first.width > first.height ? "landscape" : "portrait",
          unit: "px",
          format: [first.width, first.height],
        });
        captures.forEach(({ key, canvas }, i) => {
          const w = canvas.width, h = canvas.height;
          if (i > 0) pdf.addPage([w, h], w > h ? "landscape" : "portrait");
          pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);
          pdf.setFontSize(10);
          pdf.text(formatLabelForChart(individualTitles[key] || key), 14, 18);
        });
        pdf.save(`compartment-charts-${stamp}.pdf`);
        toast({ title: `Exported ${captures.length} chart(s) as PDF` });
      }
    } catch (err) {
      console.error("Bulk export failed:", err);
      toast({ title: "Bulk export failed", variant: "destructive" });
    } finally {
      setBulkExporting(false);
    }
  };

  const getSimChartData = (timeSeries: Record<string, any>, range?: { start: number; end: number } | null) => {
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
      // Apply time range filter
      if (range) {
        if (row.t < range.start || row.t > range.end) continue;
      }
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
          <TabsTrigger value="sensitivity-lab">
            <Sparkles className="h-3.5 w-3.5 mr-1" />Sensitivity Lab
          </TabsTrigger>
          <TabsTrigger value="scenarios" disabled={!scenarioResults}>Scenarios</TabsTrigger>
          <TabsTrigger value="calibration">
            <Sigma className="h-3.5 w-3.5 mr-1" />Calibration Lab
          </TabsTrigger>
          <TabsTrigger value="fitting-setup">Quick Fit</TabsTrigger>
          <TabsTrigger value="fitting" disabled={!fittingResults}>Fitting Results</TabsTrigger>
          <TabsTrigger value="docs" className="gap-2">
            <BookOpen className="h-3.5 w-3.5" />
            Model Guide
          </TabsTrigger>
        </TabsList>

        {/* CALIBRATION LAB TAB — full scientific workspace */}
        <TabsContent value="calibration">
          <CalibrationWorkspace
            equations={equations}
            parameters={parameters}
            initialValues={initialValues}
            compartments={compartments}
            modelName={PRESET_MODELS.find(m => JSON.stringify(m.compartments) === JSON.stringify(compartments))?.name}
            onApplyCalibrated={(calibrated) => {
              const updated = parameters.map(p => {
                const hit = calibrated.find(c => c.name === p.name);
                return hit ? { ...p, value: hit.value } : p;
              });
              setPreCalibrationParams(Object.fromEntries(parameters.map(p => [p.name, p.value])));
              setParameters(updated);
              toast({ title: "Calibrated parameters applied", description: `${calibrated.length} parameter(s) updated in the model.` });
              setActiveTab("setup");
            }}
          />
        </TabsContent>

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
                        <>
                          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0" title={`Original: ${origVal}`}>
                            was {origVal.toPrecision(4)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            title="Reset to original"
                            onClick={() => {
                              const next = [...parameters];
                              next[i].value = origVal;
                              setParameters(next);
                              toast({ title: "Parameter reset", description: `${p.name} reverted to ${origVal.toPrecision(4)}` });
                            }}
                          >
                            <RotateCcw className="h-3.5 w-3.5 text-primary" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => setParameters(parameters.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  );
                })}
                {preCalibrationParams && Object.keys(preCalibrationParams).length > 0 && parameters.some(p => {
                  const orig = preCalibrationParams[p.name];
                  return orig !== undefined && orig !== p.value;
                }) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-primary border-primary/30"
                    onClick={() => {
                      setParameters(parameters.map(p => ({
                        ...p,
                        value: preCalibrationParams[p.name] ?? p.value,
                      })));
                      toast({ title: "All parameters reset", description: "Reverted all calibrated parameters to original values." });
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />Reset All to Original
                  </Button>
                )}
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
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Target Compartment(s)</Label>
                        <div className="flex flex-wrap gap-1.5 mt-1 p-2 rounded-md border border-input bg-background min-h-[36px]">
                          {compartments.map(c => {
                            const isSelected = pe.targetCompartments.includes(c);
                            return (
                              <label
                                key={c}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer transition-all border ${
                                  isSelected ? "border-primary bg-primary/10 text-foreground font-medium" : "border-border text-muted-foreground hover:border-primary/40"
                                }`}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) => {
                                    const current = pe.targetCompartments;
                                    const updated = checked
                                      ? [...current, c]
                                      : current.filter(tc => tc !== c);
                                    if (updated.length > 0) updatePulseEvent(i, "targetCompartments", updated);
                                  }}
                                  className="h-3 w-3"
                                />
                                {c}
                              </label>
                            );
                          })}
                        </div>
                        {pe.targetCompartments.length > 1 && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {pe.targetCompartments.length} compartments selected — coverage applied to each
                          </p>
                        )}
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
                            <SelectItem value="10d_annually">10 days annually</SelectItem>
                            <SelectItem value="12d_annually">12 days annually</SelectItem>
                            <SelectItem value="14d_annually">14 days annually</SelectItem>
                            <SelectItem value="10d_biannually">10 days biannually</SelectItem>
                            <SelectItem value="12d_biannually">12 days biannually</SelectItem>
                            <SelectItem value="14d_biannually">14 days biannually</SelectItem>
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
                         pe.frequency === "10d_annually" ? `10d every 365d from day ${pe.startTime}` :
                         pe.frequency === "12d_annually" ? `12d every 365d from day ${pe.startTime}` :
                         pe.frequency === "14d_annually" ? `14d every 365d from day ${pe.startTime}` :
                         pe.frequency === "10d_biannually" ? `10d every 182d from day ${pe.startTime}` :
                         pe.frequency === "12d_biannually" ? `12d every 182d from day ${pe.startTime}` :
                         pe.frequency === "14d_biannually" ? `14d every 182d from day ${pe.startTime}` :
                         `Every ${pe.customIntervalDays}d from day ${pe.startTime}`}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">{pe.totalRounds} round{pe.totalRounds > 1 ? "s" : ""}</Badge>
                      <Badge variant="outline" className="text-[10px]">{(pe.coverageFraction * 100).toFixed(0)}% coverage → {pe.targetCompartments.join(", ")}</Badge>
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
                    <div className="flex flex-wrap items-center gap-2">
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
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowColorPicker(prev => !prev)}>
                        <Palette className="h-4 w-4" />
                        Colors
                      </Button>
                      {/* Plot Export */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2" disabled={exportingPlot}>
                            {exportingPlot ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}
                            Export Plot
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => exportSimPlot("png")}><Image className="h-4 w-4 mr-2" />PNG</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportSimPlot("jpeg")}><Image className="h-4 w-4 mr-2" />JPEG</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportSimPlot("pdf")}><FileText className="h-4 w-4 mr-2" />PDF</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {/* Data Export */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2">
                            <Download className="h-4 w-4" />
                            Export Data
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => exportSimValues("xlsx")}><FileSpreadsheet className="h-4 w-4 mr-2" />Excel (.xlsx)</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportSimValues("csv")}><FileSpreadsheet className="h-4 w-4 mr-2" />CSV</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportSimValues("pdf")}><FileText className="h-4 w-4 mr-2" />PDF</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
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
                  {/* Color Picker Panel */}
                  {showColorPicker && (
                    <div className="mt-3 p-3 rounded-lg border bg-muted/30">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Customise compartment colours:</p>
                      <div className="flex flex-wrap gap-3">
                        {Object.keys(simulationData.time_series).map((key, i) => (
                          <label key={key} className="flex items-center gap-1.5 text-xs">
                            <input
                              type="color"
                              value={getColor(key, i)}
                              onChange={(e) => setCompartmentColors(prev => ({ ...prev, [key]: e.target.value }))}
                              className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent"
                            />
                            <span className="font-mono text-foreground">{key}</span>
                          </label>
                        ))}
                        {Object.keys(compartmentColors).length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => setCompartmentColors({})}>
                            <RotateCcw className="h-3 w-3" /> Reset
                          </Button>
                        )}
                      </div>
                    </div>
                   )}
                </CardHeader>
                <CardContent>
                  {/* Time Period Control */}
                  <div className="flex flex-wrap items-center gap-3 mb-3 p-3 rounded-lg border bg-muted/30">
                    <Label className="text-xs font-medium text-muted-foreground">View Range:</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={simViewRange?.start ?? timeConfig.start}
                        onChange={e => setSimViewRange(prev => ({ start: Number(e.target.value), end: prev?.end ?? timeConfig.end }))}
                        className="w-20 h-7 text-xs"
                        step="any"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="number"
                        value={simViewRange?.end ?? timeConfig.end}
                        onChange={e => setSimViewRange(prev => ({ start: prev?.start ?? timeConfig.start, end: Number(e.target.value) }))}
                        className="w-20 h-7 text-xs"
                        step="any"
                      />
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setSimViewRange(prev => ({ start: prev?.start ?? timeConfig.start, end: Math.max((prev?.start ?? timeConfig.start) + 10, (prev?.end ?? timeConfig.end) - 50) }))}>−50</Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setSimViewRange(prev => ({ start: prev?.start ?? timeConfig.start, end: (prev?.end ?? timeConfig.end) + 50 }))}>+50</Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setSimViewRange(prev => ({ start: prev?.start ?? timeConfig.start, end: (prev?.end ?? timeConfig.end) * 2 }))}>×2</Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setSimViewRange(prev => ({ start: prev?.start ?? timeConfig.start, end: Math.max(10, (prev?.end ?? timeConfig.end) / 2) }))}>÷2</Button>
                      {simViewRange && <Button variant="ghost" size="sm" className="h-7 text-xs px-2 gap-1" onClick={() => setSimViewRange(null)}><RotateCcw className="h-3 w-3" />Reset</Button>}
                    </div>
                  </div>
                  <div ref={simulationChartRef} className="h-[450px] bg-background p-2 rounded">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getSimChartData(simulationData.time_series, simViewRange)} margin={{ top: 5, right: 110, bottom: 5, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="t" label={{ value: "Time", position: "insideBottom", offset: -5 }} />
                        <YAxis label={{ value: "Population", angle: -90, position: "insideLeft", offset: 10, style: { textAnchor: "middle", fontSize: 11 } }} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                        <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11, paddingLeft: 8 }} />
                        {Object.keys(simulationData.time_series).map((key, i) => (
                          <Line key={key} type="monotone" dataKey={key} stroke={getColor(key, i)} strokeWidth={2} dot={false} name={key} />
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
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle>Individual Compartment Time Series</CardTitle>
                      <CardDescription>Each compartment plotted separately. Select to bulk-download or customise titles & legends (use <code className="px-1 rounded bg-muted">_</code> to mark subscripts, e.g. <code className="px-1 rounded bg-muted">S_hcn</code> → S<sub>hcn</sub>).</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant={showChartCustomiser ? "default" : "outline"}
                        size="sm"
                        className="gap-2"
                        onClick={() => setShowChartCustomiser(prev => !prev)}
                      >
                        <Palette className="h-4 w-4" />
                        Titles & Legend
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2" disabled={bulkExporting}>
                            {bulkExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Bulk Download {selectedForBulkExport.length > 0 ? `(${selectedForBulkExport.length})` : "(All)"}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => exportSelectedIndividualCharts("zip")}>
                            <FileImage className="h-4 w-4 mr-2" /> ZIP of PNGs
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportSelectedIndividualCharts("pdf")}>
                            <FileText className="h-4 w-4 mr-2" /> Multi-page PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportSelectedIndividualCharts("png")}>
                            <Image className="h-4 w-4 mr-2" /> Separate PNGs
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Customiser panel */}
                  {showChartCustomiser && (
                    <div className="mt-3 space-y-3 p-3 rounded-lg border bg-muted/30">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Main chart title</Label>
                          <Input
                            value={mainChartTitle}
                            onChange={e => setMainChartTitle(e.target.value)}
                            placeholder="e.g. SEITF Dynamics – Plateau"
                            className="h-8 text-xs"
                          />
                          <p className="text-[10px] text-muted-foreground mt-1">Preview: <span className="font-medium text-foreground">{formatLabelForChart(mainChartTitle) || "—"}</span></p>
                        </div>
                        <div>
                          <Label className="text-xs">Legend position</Label>
                          <Select value={legendPosition} onValueChange={v => setLegendPosition(v as any)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="top">Top</SelectItem>
                              <SelectItem value="bottom">Bottom</SelectItem>
                              <SelectItem value="left">Left</SelectItem>
                              <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs mb-1.5 block">
                          Per-compartment axis customisation (use <code className="px-1 rounded bg-background">_</code> for subscripts, e.g. <code className="px-1 rounded bg-background">S_hcn</code>)
                        </Label>
                        <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2 max-h-56 overflow-y-auto pr-1 items-center">
                          <div className="contents text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                            <span>Key</span>
                            <span>Title</span>
                            <span>X-axis label</span>
                            <span>Y-axis symbol</span>
                          </div>
                          {Object.keys(simulationData.time_series)
                            .filter(k => Array.isArray(simulationData.time_series[k]) && simulationData.time_series[k].length > 0)
                            .map(key => (
                              <div key={key} className="contents">
                                <span className="text-[11px] font-mono text-muted-foreground w-12 shrink-0 truncate">{key}</span>
                                <Input
                                  value={individualTitles[key] ?? ""}
                                  onChange={e => setIndividualTitles(prev => ({ ...prev, [key]: e.target.value }))}
                                  placeholder={`Title (default: ${key})`}
                                  className="h-7 text-xs"
                                  aria-label={`Custom title for ${key}`}
                                />
                                <Input
                                  value={individualXLabels[key] ?? ""}
                                  onChange={e => setIndividualXLabels(prev => ({ ...prev, [key]: e.target.value }))}
                                  placeholder="Time"
                                  className="h-7 text-xs"
                                  aria-label={`X-axis label for ${key}`}
                                />
                                <Input
                                  value={individualYSymbols[key] ?? ""}
                                  onChange={e => setIndividualYSymbols(prev => ({ ...prev, [key]: e.target.value }))}
                                  placeholder={`e.g. ${key.charAt(0)}_${key.slice(1).toLowerCase()}`}
                                  className="h-7 text-xs"
                                  aria-label={`Y-axis symbol for ${key}`}
                                />
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {(() => {
                      const visibleKeys = Object.keys(simulationData.time_series)
                        .filter(key => Array.isArray(simulationData.time_series[key]) && simulationData.time_series[key].length > 0);
                      return visibleKeys.map((key, i) => {
                        const singleSeries: Record<string, any> = { [key]: simulationData.time_series[key] };
                        const chartData = getSimChartData(singleSeries);
                        const isSelected = selectedForBulkExport.includes(key);
                        const customTitle = individualTitles[key];
                        const xLabel = (individualXLabels[key] ?? "").trim() || "Time";
                        const ySymbol = (individualYSymbols[key] ?? "").trim() || customTitle || key;
                        const yLabelDisplay = formatLabelForChart(ySymbol);
                        const isFocused = focusedCompartmentIdx === i;

                        // Tooltip content with ARIA-friendly sentence (time range + value + compartment).
                        const a11yTooltip = ({ active, payload, label }: any) => {
                          if (!active || !payload?.length) return null;
                          const v = payload[0].value;
                          const valueStr = typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 6 }) : String(v);
                          // Locate the time range surrounding the focused point so SR users
                          // hear context (e.g. "between t=4 and t=6").
                          const tNum = typeof label === "number" ? label : Number(label);
                          let tIdx = -1;
                          if (Number.isFinite(tNum)) {
                            tIdx = chartData.findIndex((d: any) => Number(d.t) === tNum);
                          }
                          const prevT = tIdx > 0 ? chartData[tIdx - 1]?.t : null;
                          const nextT = tIdx >= 0 && tIdx < chartData.length - 1 ? chartData[tIdx + 1]?.t : null;
                          const rangePart =
                            prevT != null && nextT != null
                              ? `between ${xLabel} ${prevT} and ${xLabel} ${nextT}`
                              : prevT != null
                                ? `after ${xLabel} ${prevT}`
                                : nextT != null
                                  ? `before ${xLabel} ${nextT}`
                                  : `at ${xLabel} ${label}`;
                          const srSentence = `Compartment ${ySymbol}: value ${valueStr} at ${xLabel} ${label}, ${rangePart}.`;
                          return (
                            <div
                              role="tooltip"
                              aria-live="polite"
                              className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
                            >
                              <div className="font-medium">{yLabelDisplay}</div>
                              <div className="text-muted-foreground">{xLabel}: <span className="text-foreground">{label}</span></div>
                              <div className="text-muted-foreground">Value: <span className="text-foreground tabular-nums">{valueStr}</span></div>
                              {(prevT != null || nextT != null) && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  {prevT != null && <>prev {xLabel}: <span className="text-foreground tabular-nums">{prevT}</span></>}
                                  {prevT != null && nextT != null && <span className="mx-1">·</span>}
                                  {nextT != null && <>next {xLabel}: <span className="text-foreground tabular-nums">{nextT}</span></>}
                                </div>
                              )}
                              <span className="sr-only">{srSentence}</span>
                            </div>
                          );
                        };

                        const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
                          let next = i;
                          switch (e.key) {
                            case "ArrowRight":
                            case "ArrowDown":
                              next = Math.min(visibleKeys.length - 1, i + 1); break;
                            case "ArrowLeft":
                            case "ArrowUp":
                              next = Math.max(0, i - 1); break;
                            case "Home": next = 0; break;
                            case "End": next = visibleKeys.length - 1; break;
                            case "Enter":
                            case " ":
                              setExpandedCompartment({ key, index: i });
                              setOverlayCompartments([key]);
                              e.preventDefault();
                              return;
                            case "p":
                            case "P":
                              exportSingleCompartmentChart(key, "png");
                              return;
                            case "s":
                            case "S":
                              exportSingleCompartmentChart(key, "svg");
                              return;
                            default: return;
                          }
                          if (next !== i) {
                            e.preventDefault();
                            setFocusedCompartmentIdx(next);
                            const nk = visibleKeys[next];
                            const nxLabel = (individualXLabels[nk] ?? "").trim() || "Time";
                            const nySymbol = (individualYSymbols[nk] ?? "").trim() || individualTitles[nk] || nk;
                            const nData = getSimChartData({ [nk]: simulationData.time_series[nk] });
                            const tStart = nData[0]?.t;
                            const tEnd = nData[nData.length - 1]?.t;
                            const vStart = nData[0]?.[nk];
                            const vEnd = nData[nData.length - 1]?.[nk];
                            const fmt = (x: any) => typeof x === "number" ? x.toLocaleString(undefined, { maximumFractionDigits: 4 }) : x;
                            logAnnouncement(
                              nk,
                              `${nk} chart focused. ${nxLabel} on X-axis, ${formatLabelForChart(nySymbol)} on Y-axis. ${nData.length} data points from ${nxLabel} ${tStart} to ${nxLabel} ${tEnd}. Compartment ${nySymbol} starts at ${fmt(vStart)} and ends at ${fmt(vEnd)}.`
                            );
                            individualChartRefs.current[nk]?.focus();
                          }
                        };

                        const ariaDesc = `Time series chart for compartment ${key}. ${xLabel} on the horizontal axis, ${yLabelDisplay} on the vertical axis. ${chartData.length} time points. Press Enter to expand, P to export PNG, S to export SVG. Use arrow keys to navigate between compartments.`;

                        return (
                          <div
                            key={key}
                            ref={el => { individualChartRefs.current[key] = el; }}
                            tabIndex={0}
                            role="figure"
                            aria-label={`${customTitle || key} compartment time series`}
                            aria-describedby={`comp-desc-${key}`}
                            onFocus={() => setFocusedCompartmentIdx(i)}
                            onKeyDown={handleKeyDown}
                            className={`border rounded-lg p-3 bg-card hover:shadow-md transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${isSelected ? "border-primary ring-1 ring-primary/30" : "hover:border-primary/50"} ${isFocused ? "border-primary" : ""}`}
                          >
                            <span id={`comp-desc-${key}`} className="sr-only">{ariaDesc}</span>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => setSelectedForBulkExport(prev =>
                                    prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
                                  )}
                                  aria-label={`Select ${key} for bulk download`}
                                />
                                <p className="text-sm font-semibold text-foreground truncate">
                                  {customTitle ? renderWithSubscript(customTitle) : renderWithSubscript(key)}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  className="text-[10px] text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1"
                                  onClick={(e) => { e.stopPropagation(); exportSingleCompartmentChart(key, "png"); }}
                                  disabled={singleExporting === `${key}:png`}
                                  aria-label={`Export ${key} chart as PNG`}
                                  title="Export as PNG (shortcut: P)"
                                >
                                  {singleExporting === `${key}:png` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Image className="h-3 w-3" />}
                                  PNG
                                </button>
                                <button
                                  type="button"
                                  className="text-[10px] text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1"
                                  onClick={(e) => { e.stopPropagation(); exportSingleCompartmentChart(key, "svg"); }}
                                  disabled={singleExporting === `${key}:svg`}
                                  aria-label={`Export ${key} chart as SVG`}
                                  title="Export as SVG vector (shortcut: S)"
                                >
                                  {singleExporting === `${key}:svg` ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileImage className="h-3 w-3" />}
                                  SVG
                                </button>
                                <button
                                  type="button"
                                  className="text-[10px] text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded hover:bg-muted"
                                  onClick={() => { setExpandedCompartment({ key, index: i }); setOverlayCompartments([key]); }}
                                  aria-label={`Expand ${key} chart`}
                                  title="Expand (shortcut: Enter)"
                                >
                                  Expand
                                </button>
                              </div>
                            </div>
                            <div className="h-[180px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 5, right: 90, bottom: 25, left: 10 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                  <XAxis
                                    dataKey="t"
                                    tick={{ fontSize: 10 }}
                                    label={{ value: xLabel, position: "insideBottom", offset: -5, style: { fontSize: 11, fontWeight: 500, fill: "hsl(var(--foreground))" } }}
                                  />
                                  <YAxis
                                    tick={{ fontSize: 10 }}
                                    label={{
                                      value: yLabelDisplay,
                                      position: "insideLeft",
                                      angle: -90,
                                      offset: 10,
                                      style: { fontSize: 11, fontWeight: 500, fill: "hsl(var(--foreground))", textAnchor: "middle" },
                                    }}
                                  />
                                  <Tooltip content={a11yTooltip} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                                  {/* Legend on the right (default) — names the compartment line clearly. */}
                                  <Legend
                                    layout="vertical"
                                    verticalAlign="middle"
                                    align="right"
                                    wrapperStyle={{ fontSize: 11, paddingLeft: 8 }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey={key}
                                    name={yLabelDisplay}
                                    stroke={getColor(key, i)}
                                    strokeWidth={2}
                                    dot={false}
                                  />
                                  {showMdaMarkers && computePulseTimesForScripts().map((pt, pi) => (
                                    <ReferenceLine key={`pulse-sm-${pi}`} x={pt} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 3" strokeWidth={1} />
                                  ))}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  {/* ARIA live region for keyboard navigation announcements */}
                  <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{chartAnnouncement}</div>
                  {Object.keys(simulationData.time_series).filter(k => Array.isArray(simulationData.time_series[k]) && simulationData.time_series[k].length > 0).length > 0 && (
                    <div className="flex flex-wrap items-center justify-end gap-2 mt-3 pt-3 border-t">
                      <div className="mr-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground tabular-nums">{announcementLog.length}</span>
                        <span>keyboard announcement{announcementLog.length === 1 ? "" : "s"} logged</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => exportAnnouncementLog("csv")}
                        disabled={announcementLog.length === 0}
                        aria-label="Export accessibility announcement log as CSV"
                        title="Download the recent keyboard-navigated tooltip announcements as CSV for accessibility verification reports"
                      >
                        Export A11y log (CSV)
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => exportAnnouncementLog("txt")}
                        disabled={announcementLog.length === 0}
                        aria-label="Export accessibility announcement log as plain text"
                        title="Download the recent keyboard-navigated tooltip announcements as TXT"
                      >
                        TXT
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setAnnouncementLog([])}
                        disabled={announcementLog.length === 0}
                        aria-label="Clear announcement log"
                      >
                        Clear log
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedForBulkExport(
                        Object.keys(simulationData.time_series).filter(k => Array.isArray(simulationData.time_series[k]) && simulationData.time_series[k].length > 0)
                      )}>Select all</Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedForBulkExport([])}>Clear</Button>
                    </div>
                  )}
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
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <DialogTitle>
                              {selectedKeys.length === 1 ? `${selectedKeys[0]} — Time Series` : `Comparing ${selectedKeys.length} Compartments`}
                            </DialogTitle>
                            <div className="flex gap-2">
                              {/* Export comparison as PNG */}
                              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={async () => {
                                const container = document.getElementById('comparison-chart-container');
                                if (!container) return;
                                try {
                                  const canvas = await html2canvas(container, { backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false });
                                  const link = document.createElement("a");
                                  link.download = `comparison-${selectedKeys.join("-")}-${Date.now()}.png`;
                                  link.href = canvas.toDataURL("image/png", 0.95);
                                  link.click();
                                  toast({ title: "Exported comparison as PNG" });
                                } catch { toast({ title: "Export failed", variant: "destructive" }); }
                              }}>
                                <Image className="h-3.5 w-3.5" /> PNG
                              </Button>
                              {/* Export comparison data as Excel */}
                              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => {
                                const wb = XLSX.utils.book_new();
                                // State values sheet
                                const stateRows = chartData.map(row => {
                                  const out: Record<string, number> = { Time: row.t };
                                  selectedKeys.forEach(k => { out[k] = row[k] ?? 0; });
                                  return out;
                                });
                                const ws1 = XLSX.utils.json_to_sheet(stateRows);
                                XLSX.utils.book_append_sheet(wb, ws1, "State Values");
                                // Parameters sheet
                                const paramRows = parameters.map(p => ({ Parameter: p.name, Value: p.value }));
                                const ws2 = XLSX.utils.json_to_sheet(paramRows);
                                XLSX.utils.book_append_sheet(wb, ws2, "Parameters");
                                XLSX.writeFile(wb, `comparison-${selectedKeys.join("-")}-${Date.now()}.xlsx`);
                                toast({ title: "Exported comparison data as Excel" });
                              }}>
                                <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                              </Button>
                            </div>
                          </div>
                        </DialogHeader>

                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-1">
                          {selectedKeys.map((k, i) => {
                            const values = chartData.map(d => d[k]).filter((v): v is number => v != null);
                            const min = values.length ? Math.min(...values) : 0;
                            const max = values.length ? Math.max(...values) : 0;
                            const final2 = values.length ? values[values.length - 1] : 0;
                            return (
                              <div key={k} className="flex items-center gap-2 border rounded px-2 py-1">
                                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: getColor(k, allKeys.indexOf(k)) }} />
                                <span className="font-medium text-foreground">{k}</span>
                                <span>Min: {min.toFixed(2)}</span>
                                <span>Max: {max.toFixed(2)}</span>
                                <span>Final: {final2.toFixed(2)}</span>
                              </div>
                            );
                          })}
                        </div>

                        <div id="comparison-chart-container" className="h-[400px] bg-background p-2 rounded">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 5, right: 110, bottom: 25, left: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="t" label={{ value: "Time", position: "insideBottom", offset: -5 }} />
                              <YAxis label={{ value: "Population", angle: -90, position: "insideLeft", offset: 10, style: { textAnchor: "middle", fontSize: 11 } }} />
                              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                              <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11, paddingLeft: 8 }} />
                              {selectedKeys.map(k => (
                                <Line key={k} type="monotone" dataKey={k} stroke={getColor(k, allKeys.indexOf(k))} strokeWidth={2.5} dot={false} name={k} />
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
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(k, i) }} />
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

        <TabsContent value="r0">
          {r0Results && (
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="md:col-span-2 border-primary/20">
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row items-start gap-6">
                    <div className="p-6 rounded-2xl bg-primary/10 text-center min-w-[140px]">
                      <p className="text-sm text-muted-foreground mb-1">Basic Reproduction Number</p>
                      <p className="text-5xl font-bold text-primary">{typeof r0Results.r0_value === 'number' ? r0Results.r0_value.toFixed(4) : r0Results.r0_value}</p>
                      <Badge className="mt-2" variant={r0Results.r0_value > 1 ? "destructive" : "default"}>
                        {r0Results.r0_value > 1 ? "Epidemic Growth" : "Epidemic Decline"}
                      </Badge>
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <Label className="text-sm text-muted-foreground">Method</Label>
                        <p className="font-semibold text-foreground">Next Generation Matrix (van den Driessche & Watmough, 2002)</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Formula</Label>
                        <p className="font-mono text-sm text-foreground bg-muted/50 rounded-lg p-3 mt-1">{r0Results.r0_formula}</p>
                      </div>
                      <p className="text-sm text-foreground">{r0Results.interpretation}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Analytical Steps */}
              {r0Results.ngm_steps && r0Results.ngm_steps.length > 0 && (
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sigma className="h-5 w-5 text-primary" />
                      Analytical Steps (Next Generation Matrix)
                    </CardTitle>
                    <CardDescription>Deterministic computation — identical results across all runs</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {r0Results.ngm_steps.map((step: string, i: number) => (
                        <div key={i} className="p-4 rounded-lg border bg-muted/20">
                          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">{step}</pre>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {r0Results.threshold_analysis && (
                <Card>
                  <CardHeader><CardTitle>Threshold Analysis</CardTitle></CardHeader>
                  <CardContent><p className="text-sm text-foreground">{r0Results.threshold_analysis}</p></CardContent>
                </Card>
              )}
              {r0Results.parameter_thresholds && r0Results.parameter_thresholds.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Parameter Thresholds for R₀ = 1</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {r0Results.parameter_thresholds.map((pt: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                          <span className="font-mono font-medium">{pt.parameter}</span>
                          <span className="text-sm text-muted-foreground">{pt.condition}</span>
                          <Badge variant="outline">{typeof pt.threshold_value === 'number' ? pt.threshold_value.toFixed(6) : pt.threshold_value}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Infected Compartments */}
              {r0Results.infected_compartments && (
                <Card className="md:col-span-2">
                  <CardHeader><CardTitle>Infected Compartments Used</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {r0Results.infected_compartments.map((c: string) => (
                        <Badge key={c} variant="secondary" className="font-mono">{c}</Badge>
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
                        <BarChart data={sensitivityResults.sensitivity_indices} layout="vertical" margin={{ left: 80, right: 130, top: 5, bottom: 25 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis type="number" label={{ value: "Sensitivity Index", position: "insideBottom", offset: -5, style: { fontSize: 11 } }} />
                          <YAxis type="category" dataKey="parameter" tick={{ fontSize: 12 }} label={{ value: "Parameter", angle: -90, position: "insideLeft", offset: -10, style: { textAnchor: "middle", fontSize: 11 } }} />
                          <Tooltip contentStyle={{ borderRadius: 8 }} />
                          <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11, paddingLeft: 8 }} />
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

        {/* SENSITIVITY LAB TAB — full local + global analysis workspace */}
        <TabsContent value="sensitivity-lab">
          <SensitivityWorkspace
            equations={equations}
            parameters={parameters}
            initialValues={initialValues}
            compartments={compartments}
            timeConfig={timeConfig}
            modelName={PRESET_MODELS.find(m => JSON.stringify(m.compartments) === JSON.stringify(compartments))?.name}
          />
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
                            <LineChart data={chartData} margin={{ top: 5, right: 110, bottom: 25, left: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="t" label={{ value: "Time", position: "insideBottom", offset: -5 }} />
                              <YAxis label={{ value: comp, angle: -90, position: "insideLeft", offset: 10, style: { textAnchor: "middle", fontSize: 11 } }} />
                              <Tooltip contentStyle={{ borderRadius: 8 }} />
                              <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11, paddingLeft: 8 }} />
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
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle>Fitted vs Observed</CardTitle>
                        <CardDescription>
                          {calibratedSimData
                            ? "Calibrated simulation curves overlaid on observed data points"
                            : fittingResults.fitted_curves
                            ? "AI-generated fitted curves compared to observed data"
                            : "Select compartments and run a calibrated simulation to overlay model curves."}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="acg"
                          size="sm"
                          className="gap-2"
                          onClick={runCalibratedSimulation}
                          disabled={isLoading || calibSimCompartments.length === 0}
                        >
                          {isLoading && loadingAction === "calibrated_simulation" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          Run Calibrated Simulation
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={async () => {
                            if (!fittedChartRef.current) return;
                            try {
                              const html2canvas = (await import("html2canvas")).default;
                              const canvas = await html2canvas(fittedChartRef.current, { backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false });
                              const link = document.createElement("a");
                              link.download = `fitted-vs-observed-${Date.now()}.png`;
                              link.href = canvas.toDataURL("image/png", 0.9);
                              link.click();
                              toast({ title: "Exported as PNG" });
                            } catch { toast({ title: "Export failed", variant: "destructive" }); }
                          }}
                        >
                          <FileDown className="h-4 w-4" /> PNG
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={async () => {
                            if (!fittedChartRef.current) return;
                            try {
                              const html2canvas = (await import("html2canvas")).default;
                              const canvas = await html2canvas(fittedChartRef.current, { backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false });
                              const imgData = canvas.toDataURL("image/png");
                              const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? "landscape" : "portrait", unit: "px", format: [canvas.width, canvas.height] });
                              pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
                              pdf.save(`fitted-vs-observed-${Date.now()}.pdf`);
                              toast({ title: "Exported as PDF" });
                            } catch { toast({ title: "Export failed", variant: "destructive" }); }
                          }}
                        >
                          <FileDown className="h-4 w-4" /> PDF
                        </Button>
                      </div>
                    </div>
                    {/* Compartment picker */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Select compartments to simulate & compare:</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {compartments.map((c, ci) => {
                          const isSelected = calibSimCompartments.includes(c);
                          return (
                            <label
                              key={c}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs cursor-pointer transition-all ${
                                isSelected ? "border-primary bg-primary/10 text-foreground font-medium" : "border-border text-muted-foreground hover:border-primary/40"
                              }`}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  setCalibSimCompartments(prev =>
                                    checked ? [...prev, c] : prev.filter(k => k !== c)
                                  );
                                }}
                                className="h-3 w-3"
                              />
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[ci % COLORS.length] }} />
                              {c}
                            </label>
                          );
                        })}
                        {compartments.length > 5 && (
                          <div className="flex gap-1 ml-2">
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setCalibSimCompartments([...compartments])}>All</Button>
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setCalibSimCompartments([])}>None</Button>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Individual compartment view selector */}
                    {calibSimCompartments.length > 1 && (
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">View individual compartment:</Label>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            className={`px-2.5 py-1 rounded-full border text-xs cursor-pointer transition-all ${
                              !fittedViewComp ? "border-primary bg-primary/10 text-foreground font-medium" : "border-border text-muted-foreground hover:border-primary/40"
                            }`}
                            onClick={() => setFittedViewComp(null)}
                          >
                            All Selected
                          </button>
                          {calibSimCompartments.map((c, ci) => (
                            <button
                              key={c}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs cursor-pointer transition-all ${
                                fittedViewComp === c ? "border-primary bg-primary/10 text-foreground font-medium" : "border-border text-muted-foreground hover:border-primary/40"
                              }`}
                              onClick={() => setFittedViewComp(c)}
                            >
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[compartments.indexOf(c) % COLORS.length] }} />
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div ref={fittedChartRef}>
                  {(() => {
                    let chartData: Record<string, number>[] = [];
                    let dataKeys: string[] = [];
                    const observedKeys: string[] = [];
                    const fittedKeys: string[] = [];

                    // Filter to individual compartment if selected
                    const viewComps = fittedViewComp ? [fittedViewComp] : (calibSimCompartments.length > 0 ? calibSimCompartments : compartments);
                    const selectedComps = calibSimCompartments.length > 0 ? calibSimCompartments : compartments;
                    const mappedComps = Object.entries(columnMapping).filter(([comp, col]) => col && viewComps.includes(comp));
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
                        k => Array.isArray(calibratedSimData.time_series[k]) && calibratedSimData.time_series[k].length > 0 && viewComps.includes(k)
                      );
                      const maxLen = Math.max(observedPoints.length, simChart.length);
                      for (let i = 0; i < maxLen; i++) {
                        const row: Record<string, number> = { t: simChart[i]?.t ?? observedPoints[i]?.t ?? i };
                        if (i < simChart.length) {
                          simKeys.forEach(k => { if (simChart[i][k] !== undefined) row[`Fitted ${k}`] = simChart[i][k]; });
                        }
                        if (i < observedPoints.length) {
                          observedKeys.forEach(k => { if (observedPoints[i][k] !== undefined) row[k] = observedPoints[i][k]; });
                        }
                        chartData.push(row);
                      }
                      simKeys.forEach(k => fittedKeys.push(`Fitted ${k}`));
                      dataKeys = [...observedKeys, ...fittedKeys];
                    } else if (fittingResults.fitted_curves && typeof fittingResults.fitted_curves === 'object') {
                      const keys = Object.keys(fittingResults.fitted_curves).filter(
                        k => Array.isArray(fittingResults.fitted_curves[k]) && fittingResults.fitted_curves[k].length > 0 && viewComps.includes(k)
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

                    const chartTitle = fittedViewComp ? `${fittedViewComp} — Fitted vs Observed` : undefined;

                    // Build residual data & goodness-of-fit stats
                    const residualData: Record<string, number>[] = [];
                    const gofStats: Record<string, { r2: number; rmse: number; mae: number; n: number }> = {};
                    const paired: Record<string, { obs: number[]; fit: number[] }> = {};
                    if (fittedKeys.length > 0 && observedKeys.length > 0) {
                      chartData.forEach((row) => {
                        const rRow: Record<string, number> = { t: row.t };
                        let hasResidual = false;
                        observedKeys.forEach(obsKey => {
                          const compName = obsKey.replace("Observed ", "");
                          const fitKey = `Fitted ${compName}`;
                          if (row[obsKey] !== undefined && row[fitKey] !== undefined) {
                            rRow[`Residual ${compName}`] = row[fitKey] - row[obsKey];
                            hasResidual = true;
                            if (!paired[compName]) paired[compName] = { obs: [], fit: [] };
                            paired[compName].obs.push(row[obsKey]);
                            paired[compName].fit.push(row[fitKey]);
                          }
                        });
                        if (hasResidual) residualData.push(rRow);
                      });
                      Object.entries(paired).forEach(([comp, { obs, fit }]) => {
                        const n = obs.length;
                        if (n < 2) return;
                        const meanObs = obs.reduce((a, b) => a + b, 0) / n;
                        let ssTot = 0, ssRes = 0, sumAbsErr = 0;
                        for (let i = 0; i < n; i++) {
                          const diff = fit[i] - obs[i];
                          ssRes += diff * diff;
                          ssTot += (obs[i] - meanObs) ** 2;
                          sumAbsErr += Math.abs(diff);
                        }
                        gofStats[comp] = {
                          r2: ssTot > 0 ? 1 - ssRes / ssTot : 0,
                          rmse: Math.sqrt(ssRes / n),
                          mae: sumAbsErr / n,
                          n,
                        };
                      });
                    }
                    const residualKeys = [...new Set(observedKeys.map(k => `Residual ${k.replace("Observed ", "")}`))]
                      .filter(k => residualData.some(r => r[k] !== undefined));

                    return (
                      <div>
                        {chartTitle && <p className="text-sm font-semibold text-foreground mb-2">{chartTitle}</p>}
                        {/* Main Fitted vs Observed chart */}
                        <div className="h-[400px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 5, right: 130, bottom: 25, left: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="t" label={{ value: "Time", position: "insideBottom", offset: -5 }} />
                              <YAxis label={{ value: "Value", angle: -90, position: "insideLeft", offset: 10, style: { textAnchor: "middle", fontSize: 11 } }} />
                              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                              <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11, paddingLeft: 8 }} />
                              {dataKeys.map((key, i) => {
                                const isObserved = key.startsWith("Observed");
                                const compName = key.replace(/^(Observed |Fitted )/, "");
                                const compIdx = compartments.indexOf(compName);
                                const colorIdx = compIdx >= 0 ? compIdx : i;
                                if (isObserved) {
                                  // Observed = smooth trend line (solid, thicker)
                                  return (
                                    <Line
                                      key={key}
                                      type="monotone"
                                      dataKey={key}
                                      stroke={COLORS[colorIdx % COLORS.length]}
                                      strokeWidth={2.5}
                                      dot={false}
                                      name={key}
                                      connectNulls
                                    />
                                  );
                                } else {
                                  // Fitted = scatter points (dots only, no connecting line)
                                  return (
                                    <Line
                                      key={key}
                                      type="monotone"
                                      dataKey={key}
                                      stroke="none"
                                      strokeWidth={0}
                                      dot={{ r: 3.5, fill: COLORS[colorIdx % COLORS.length], stroke: COLORS[colorIdx % COLORS.length], strokeWidth: 1 }}
                                      activeDot={{ r: 5, fill: COLORS[colorIdx % COLORS.length] }}
                                      legendType="circle"
                                      name={key}
                                      connectNulls
                                    />
                                  );
                                }
                              })}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Goodness-of-Fit Statistics */}
                        {Object.keys(gofStats).length > 0 && (
                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {Object.entries(gofStats).map(([comp, stats]) => {
                              const compIdx = compartments.indexOf(comp);
                              const color = COLORS[(compIdx >= 0 ? compIdx : 0) % COLORS.length];
                              return (
                                <div key={comp} className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                    <span className="text-sm font-semibold text-foreground">{comp}</span>
                                    <span className="text-xs text-muted-foreground ml-auto">n = {stats.n}</span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2 text-center">
                                    <div>
                                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">R²</p>
                                      <p className={`text-sm font-mono font-bold ${stats.r2 >= 0.9 ? 'text-green-600 dark:text-green-400' : stats.r2 >= 0.7 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {stats.r2.toFixed(4)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">RMSE</p>
                                      <p className="text-sm font-mono font-bold text-foreground">{stats.rmse.toPrecision(4)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">MAE</p>
                                      <p className="text-sm font-mono font-bold text-foreground">{stats.mae.toPrecision(4)}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {residualData.length > 0 && residualKeys.length > 0 && (
                          <div className="mt-6">
                            <p className="text-sm font-semibold text-foreground mb-2">Residuals (Fitted − Observed)</p>
                            <div className="h-[250px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={residualData} margin={{ top: 5, right: 130, bottom: 25, left: 20 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                  <XAxis dataKey="t" label={{ value: "Time", position: "insideBottom", offset: -5 }} />
                                  <YAxis label={{ value: "Residual", angle: -90, position: "insideLeft", offset: 10, style: { textAnchor: "middle", fontSize: 11 } }} />
                                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                                  <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11, paddingLeft: 8 }} />
                                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 2" />
                                  {residualKeys.map((key, i) => {
                                    const compName = key.replace("Residual ", "");
                                    const compIdx = compartments.indexOf(compName);
                                    const colorIdx = compIdx >= 0 ? compIdx : i;
                                    return (
                                      <Bar
                                        key={key}
                                        dataKey={key}
                                        fill={COLORS[colorIdx % COLORS.length]}
                                        opacity={0.7}
                                        name={key}
                                      />
                                    );
                                  })}
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}

                        {/* Q-Q Normality Plot for Residuals */}
                        {(() => {
                          // Collect all residuals per compartment and compute Shapiro-Wilk test
                          const qqDataByComp: Record<string, { theoretical: number; sample: number }[]> = {};
                          const swStats: Record<string, { W: number; pValue: number; n: number }> = {};
                          const normInv = (p: number): number => {
                            // Rational approximation of the inverse normal CDF (Abramowitz & Stegun)
                            if (p <= 0) return -4;
                            if (p >= 1) return 4;
                            const a = [
                              -3.969683028665376e1, 2.209460984245205e2,
                              -2.759285104469687e2, 1.383577518672690e2,
                              -3.066479806614716e1, 2.506628277459239e0
                            ];
                            const b = [
                              -5.447609879822406e1, 1.615858368580409e2,
                              -1.556989798598866e2, 6.680131188771972e1,
                              -1.328068155288572e1
                            ];
                            const c = [
                              -7.784894002430293e-3, -3.223964580411365e-1,
                              -2.400758277161838e0, -2.549732539343734e0,
                              4.374664141464968e0, 2.938163982698783e0
                            ];
                            const d = [
                              7.784695709041462e-3, 3.224671290700398e-1,
                              2.445134137142996e0, 3.754408661907416e0
                            ];
                            const pLow = 0.02425;
                            const pHigh = 1 - pLow;
                            let q: number, r: number;
                            if (p < pLow) {
                              q = Math.sqrt(-2 * Math.log(p));
                              return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
                                     ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
                            } else if (p <= pHigh) {
                              q = p - 0.5;
                              r = q * q;
                              return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
                                     (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
                            } else {
                              q = Math.sqrt(-2 * Math.log(1 - p));
                              return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
                                      ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
                            }
                          };

                          // Shapiro-Wilk test implementation
                          const shapiroWilk = (data: number[]): { W: number; pValue: number } => {
                            const n = data.length;
                            const sorted = [...data].sort((a, b) => a - b);
                            const mean2 = sorted.reduce((s, v) => s + v, 0) / n;
                            const ss = sorted.reduce((s, v) => s + (v - mean2) ** 2, 0);
                            if (ss === 0) return { W: 1, pValue: 1 };
                            const m: number[] = [];
                            for (let i = 0; i < n; i++) m.push(normInv((i + 1 - 0.375) / (n + 0.25)));
                            const mSS = m.reduce((s, v) => s + v * v, 0);
                            const aCoeff = m.map(v => v / Math.sqrt(mSS));
                            let numerator = 0;
                            for (let i = 0; i < n; i++) numerator += aCoeff[i] * sorted[i];
                            const W = (numerator * numerator) / ss;
                            const logN = Math.log(n);
                            const mu = -1.2725 + 1.0521 * logN;
                            const sigma = 1.0308 - 0.26758 * logN;
                            const z = (Math.log(1 - Math.min(W, 0.9999)) - mu) / sigma;
                            const t2 = 1 / (1 + 0.2316419 * Math.abs(z));
                            const d2 = 0.3989422804014327;
                            const poly = t2 * (0.319381530 + t2 * (-0.356563782 + t2 * (1.781477937 + t2 * (-1.821255978 + t2 * 1.330274429))));
                            const cdf = 1 - d2 * Math.exp(-0.5 * z * z) * poly;
                            const pVal = 1 - (z >= 0 ? cdf : 1 - cdf);
                            return { W: Math.min(W, 1), pValue: Math.max(0, Math.min(1, pVal)) };
                          };

                          residualKeys.forEach(key => {
                            const compName = key.replace("Residual ", "");
                            const vals = residualData
                              .map(r => r[key])
                              .filter((v): v is number => v !== undefined && !isNaN(v));
                            if (vals.length < 3) return;
                            const sorted = [...vals].sort((a, b) => a - b);
                            const n = sorted.length;
                            const mean = sorted.reduce((s, v) => s + v, 0) / n;
                            const sd = Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
                            if (sd === 0) return;
                            const standardized = sorted.map(v => (v - mean) / sd);
                            qqDataByComp[compName] = standardized.map((v, i) => ({
                              theoretical: normInv((i + 0.5) / n),
                              sample: v,
                            }));
                            // Compute Shapiro-Wilk
                            if (vals.length >= 3 && vals.length <= 5000) {
                              const result = shapiroWilk(vals);
                              swStats[compName] = { W: result.W, pValue: result.pValue, n: vals.length };
                            }
                          });

                          const qqComps = Object.keys(qqDataByComp);
                          if (qqComps.length === 0) return null;

                          // Compute axis range
                          let allTheo: number[] = [];
                          let allSamp: number[] = [];
                          qqComps.forEach(c => {
                            qqDataByComp[c].forEach(d => {
                              allTheo.push(d.theoretical);
                              allSamp.push(d.sample);
                            });
                          });
                          const minVal = Math.min(Math.min(...allTheo), Math.min(...allSamp)) - 0.3;
                          const maxVal = Math.max(Math.max(...allTheo), Math.max(...allSamp)) + 0.3;

                          return (
                            <div className="mt-6">
                              <p className="text-sm font-semibold text-foreground mb-1">Q-Q Normality Plot</p>
                              <p className="text-xs text-muted-foreground mb-3">
                                Standardised residuals vs. theoretical normal quantiles. Points close to the diagonal indicate normally distributed errors.
                              </p>
                              <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                  <ScatterChart margin={{ top: 10, right: 130, bottom: 30, left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis
                                      dataKey="theoretical"
                                      type="number"
                                      domain={[minVal, maxVal]}
                                      name="Theoretical"
                                      label={{ value: "Theoretical Quantiles", position: "insideBottom", offset: -10, style: { fontSize: 12 } }}
                                      tick={{ fontSize: 11 }}
                                    />
                                    <YAxis
                                      dataKey="sample"
                                      type="number"
                                      domain={[minVal, maxVal]}
                                      name="Sample"
                                      label={{ value: "Sample Quantiles", angle: -90, position: "insideLeft", offset: 5, style: { fontSize: 12, textAnchor: "middle" } }}
                                      tick={{ fontSize: 11 }}
                                    />
                                    <Tooltip
                                      contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                                      formatter={(value: number) => value.toFixed(3)}
                                    />
                                    <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11, paddingLeft: 8 }} />
                                    {/* Reference diagonal y=x */}
                                    <ReferenceLine
                                      segment={[{ x: minVal, y: minVal }, { x: maxVal, y: maxVal }]}
                                      stroke="hsl(var(--muted-foreground))"
                                      strokeDasharray="6 3"
                                      strokeWidth={1.5}
                                      label={{ value: "y = x", position: "end", style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" } }}
                                    />
                                    {qqComps.map((comp) => {
                                      const compIdx = compartments.indexOf(comp);
                                      const color = COLORS[(compIdx >= 0 ? compIdx : 0) % COLORS.length];
                                      return (
                                        <Scatter
                                          key={comp}
                                          name={comp}
                                          data={qqDataByComp[comp]}
                                          fill={color}
                                          r={4}
                                        />
                                      );
                                    })}
                                  </ScatterChart>
                                </ResponsiveContainer>
                              </div>

                              {/* Shapiro-Wilk Normality Test Results */}
                              {Object.keys(swStats).length > 0 && (
                                <div className="mt-4">
                                  <p className="text-sm font-semibold text-foreground mb-2">Shapiro-Wilk Normality Test</p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {Object.entries(swStats).map(([comp, stats]) => {
                                      const compIdx = compartments.indexOf(comp);
                                      const color = COLORS[(compIdx >= 0 ? compIdx : 0) % COLORS.length];
                                      const isNormal = stats.pValue >= 0.05;
                                      return (
                                        <div key={comp} className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                                          <div className="flex items-center gap-2">
                                            <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                            <span className="text-sm font-semibold text-foreground">{comp}</span>
                                            <span className="text-xs text-muted-foreground ml-auto">n = {stats.n}</span>
                                          </div>
                                          <div className="grid grid-cols-2 gap-2 text-center">
                                            <div>
                                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">W statistic</p>
                                              <p className="text-sm font-mono font-bold text-foreground">{stats.W.toFixed(4)}</p>
                                            </div>
                                            <div>
                                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">p-value</p>
                                              <p className={`text-sm font-mono font-bold ${isNormal ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                {stats.pValue < 0.001 ? stats.pValue.toExponential(2) : stats.pValue.toFixed(4)}
                                              </p>
                                            </div>
                                          </div>
                                          <p className={`text-[10px] text-center ${isNormal ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                            {isNormal ? "✓ Cannot reject normality (p ≥ 0.05)" : "✗ Residuals deviate from normality (p < 0.05)"}
                                          </p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                  </div>
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

        <TabsContent value="docs" className="space-y-6 mt-6">
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold">Mathematical Model Guide</CardTitle>
                  <CardDescription>Technical specifications, assumptions, and equations for epidemiological models</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Model Specific Documentation */}
          {(() => { const presetName = PRESET_MODELS.find(m => JSON.stringify(m.compartments) === JSON.stringify(compartments))?.name; return (
          <>
          {PRESET_MODELS.find(p => p.name === presetName) ? (
            <div className="space-y-8">
              {presetName === "SEITF Model (NTD)" && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-primary" />
                        SEITF Model (NTD) Specifications
                      </CardTitle>
                      <CardDescription>Structured epidemiological model for Neglected Tropical Diseases (NTDs) with MDA interventions</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">
                      {/* State Variables Table */}
                      <section>
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-primary" />
                          Model State Variables
                        </h3>
                        <div className="overflow-x-auto border rounded-xl">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left p-4 font-semibold w-[150px]">Variable</th>
                                <th className="text-left p-4 font-semibold">Description</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {[
                                ["S_hcn", "Susceptible never-treated school-aged children"],
                                ["E_hcn", "Exposed never-treated school-aged children"],
                                ["I_hcn", "Infectious never-treated school-aged children"],
                                ["S_hce", "Susceptible ever-treated school-aged children"],
                                ["E_hce", "Exposed ever-treated school-aged children"],
                                ["I_hce", "Infectious ever-treated school-aged children"],
                                ["T_hce", "Treated/protected ever-treated school-aged children"],
                                ["R_hce", "Recovered ever-treated school-aged children"],
                                ["S_han", "Susceptible never-treated adults"],
                                ["E_han", "Exposed never-treated adults"],
                                ["I_han", "Infectious never-treated adults"],
                                ["S_hae", "Susceptible ever-treated adults"],
                                ["E_hae", "Exposed ever-treated adults"],
                                ["I_hae", "Infectious ever-treated adults"],
                                ["T_hae", "Treated/protected ever-treated adults"],
                                ["R_hae", "Recovered ever-treated adults"],
                              ].map(([v, d]) => (
                                <tr key={v} className="hover:bg-muted/30 transition-colors">
                                  <td className="p-4 font-mono font-bold text-primary">{renderWithSubscript(v)}</td>
                                  <td className="p-4 text-muted-foreground">{d}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      {/* Parameters Table */}
                      <section>
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-primary" />
                          Model Parameters
                        </h3>
                        <div className="overflow-x-auto border rounded-xl">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left p-4 font-semibold w-[150px]">Parameter</th>
                                <th className="text-left p-4 font-semibold">Description</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {[
                                ["μ_h", "Natural mortality rate of humans"],
                                ["λ_hc", "Force of infection for school-aged children"],
                                ["λ_ha", "Force of infection for adults"],
                                ["σ_h", "Rate of progression from exposed to infectious"],
                                ["γ_h", "Natural recovery rate"],
                                ["ω_h", "Rate of loss of immunity"],
                                ["δ_h", "Disease-induced mortality rate"],
                                ["ε_h", "Efficacy of MDA treatment"],
                                ["ρ_h", "Rate of treatment"],
                                ["p_c", "Proportion of children treated in MDA"],
                                ["p_a", "Proportion of adults treated in MDA"],
                                ["β_h", "Transmission probability per contact"],
                                ["θ", "Relative exposure of adults compared to children"],
                              ].map(([v, d]) => (
                                <tr key={v} className="hover:bg-muted/30 transition-colors">
                                  <td className="p-4 font-mono font-bold text-primary">{renderWithSubscript(v)}</td>
                                  <td className="p-4 text-muted-foreground">{d}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      {/* Initial Conditions */}
                      <section className="p-6 rounded-xl border bg-muted/20">
                        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                          <Info className="h-5 w-5 text-primary" />
                          Initial Conditions
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 font-mono text-sm">
                          <div>{renderWithSubscript("S_hcn")}(0) = 0.49 × N_c</div>
                          <div>{renderWithSubscript("E_hcn")}(0) = 0.01 × N_c</div>
                          <div>{renderWithSubscript("S_han")}(0) = 0.49 × N_a</div>
                          <div>{renderWithSubscript("E_han")}(0) = 0.01 × N_a</div>
                          <div className="text-muted-foreground italic">All other compartments initialize at 0.</div>
                        </div>
                      </section>

                      {/* Forces of Infection */}
                      <section className="p-6 rounded-xl border bg-primary/5">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                          <Zap className="h-5 w-5 text-primary" />
                          Force of Infection (FoI)
                        </h3>
                        <div className="space-y-4 font-mono text-sm">
                          <div className="p-3 bg-card rounded-lg border flex flex-col gap-2">
                            <span className="text-xs text-muted-foreground">FoI for Children:</span>
                            <div className="text-base">
                              {renderWithSubscript("λ_hc")} = β<sub>h</sub> × (
                              {renderWithSubscript("I_hcn")} + {renderWithSubscript("I_hce")} + 
                              {renderWithSubscript("I_han")} + {renderWithSubscript("I_hae")}
                              ) / N
                            </div>
                          </div>
                          <div className="p-3 bg-card rounded-lg border flex flex-col gap-2">
                            <span className="text-xs text-muted-foreground">FoI for Adults:</span>
                            <div className="text-base">
                              {renderWithSubscript("λ_ha")} = θ × {renderWithSubscript("λ_hc")}
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Model Assumptions */}
                      <section>
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                          <Lightbulb className="h-5 w-5 text-primary" />
                          Biological & Epidemiological Assumptions
                        </h3>
                        <ul className="space-y-3">
                          {[
                            "The total population (N) is partitioned into children (Nc) and adults (Na).",
                            "MDA treatment is administered as pulse events at specified intervals.",
                            "Treated individuals move to the Protected (T) compartment with efficacy ε_h.",
                            "Natural mortality affects all compartments equally.",
                            "Infection dynamics differ between treated (ever-treated) and never-treated groups.",
                            "Adults and children have different exposure probabilities (θ).",
                          ].map((a, i) => (
                            <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                              <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                              {a}
                            </li>
                          ))}
                        </ul>
                      </section>

                      {/* ODEs */}
                      <section>
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                          <Sigma className="h-5 w-5 text-primary" />
                          System of Ordinary Differential Equations (ODEs)
                        </h3>
                        <div className="grid gap-3 font-mono text-xs">
                          <div className="p-4 bg-muted/30 rounded-lg border">
                            <p className="text-blue-600 font-bold mb-2">Never-Treated Children:</p>
                            <div className="space-y-1">
                              <p>d{renderWithSubscript("S_hcn")}/dt = - {renderWithSubscript("λ_hc")} {renderWithSubscript("S_hcn")} - μ<sub>h</sub> {renderWithSubscript("S_hcn")}</p>
                              <p>d{renderWithSubscript("E_hcn")}/dt = {renderWithSubscript("λ_hc")} {renderWithSubscript("S_hcn")} - (σ<sub>h</sub> + μ<sub>h</sub>) {renderWithSubscript("E_hcn")}</p>
                              <p>d{renderWithSubscript("I_hcn")}/dt = σ<sub>h</sub> {renderWithSubscript("E_hcn")} - (γ<sub>h</sub> + μ<sub>h</sub> + δ<sub>h</sub>) {renderWithSubscript("I_hcn")}</p>
                            </div>
                          </div>
                          <div className="p-4 bg-muted/30 rounded-lg border">
                            <p className="text-emerald-600 font-bold mb-2">Ever-Treated Children:</p>
                            <div className="space-y-1">
                              <p>d{renderWithSubscript("S_hce")}/dt = - {renderWithSubscript("λ_hc")} {renderWithSubscript("S_hce")} - μ<sub>h</sub> {renderWithSubscript("S_hce")} + ω<sub>h</sub> {renderWithSubscript("R_hce")}</p>
                              <p>d{renderWithSubscript("E_hce")}/dt = {renderWithSubscript("λ_hc")} {renderWithSubscript("S_hce")} - (σ<sub>h</sub> + μ<sub>h</sub>) {renderWithSubscript("E_hce")}</p>
                              <p>d{renderWithSubscript("I_hce")}/dt = σ<sub>h</sub> {renderWithSubscript("E_hce")} - (γ<sub>h</sub> + μ<sub>h</sub> + δ<sub>h</sub>) {renderWithSubscript("I_hce")}</p>
                              <p>d{renderWithSubscript("T_hce")}/dt = - μ<sub>h</sub> {renderWithSubscript("T_hce")}</p>
                              <p>d{renderWithSubscript("R_hce")}/dt = γ<sub>h</sub> ({renderWithSubscript("I_hce")} + {renderWithSubscript("I_hcn")}) - (ω<sub>h</sub> + μ<sub>h</sub>) {renderWithSubscript("R_hce")}</p>
                            </div>
                          </div>
                          <div className="text-muted-foreground text-[10px] italic">Note: Adult equations follow a symmetrical structure with adult-specific FoI (λ_ha).</div>
                        </div>
                      </section>

                      {/* Research Objectives */}
                      <section className="p-6 rounded-xl border bg-gradient-to-br from-gold/10 to-transparent">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gold-700">
                          <Target className="h-5 w-5" />
                          Research Questions & Program Aims
                        </h3>
                        <div className="space-y-4">
                          <div className="p-4 rounded-lg bg-white/50 dark:bg-black/20 border border-gold/20">
                            <p className="font-semibold text-sm mb-2 text-gold-800 dark:text-gold-400">Primary Objective:</p>
                            <p className="text-sm text-muted-foreground">To analyze the epidemiological impact of multi-year MDA strategies on NTD prevalence across different demographic segments (Children vs Adults).</p>
                          </div>
                          <div className="grid sm:grid-cols-2 gap-3">
                            {[
                              "Evaluate long-term prevalence reduction under pulse MDA rounds.",
                              "Assess the impact of varying treatment efficacy (ε_h).",
                              "Determine threshold for elimination (R₀ < 1) in localized settings.",
                              "Quantify the contribution of 'Never-Treated' reservoirs to reinfection.",
                            ].map((aim, i) => (
                              <div key={i} className="flex items-start gap-2 p-3 rounded-lg border bg-card/30">
                                <ArrowRight className="h-3 w-3 text-gold-500 mt-1 shrink-0" />
                                <span className="text-xs text-muted-foreground">{aim}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </section>
                    </CardContent>
                  </Card>
                </>
              )}

              {/* Generic placeholder for other models */}
              {presetName !== "SEITF Model (NTD)" && (
                <Card>
                  <CardHeader>
                    <CardTitle>{presetName} Documentation</CardTitle>
                    <CardDescription>Detailed technical guide for the {presetName} configuration</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Technical documentation for this model is currently being migrated. Please refer to the SEITF (NTD) guide for a reference on scientific model documentation structure.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Select a model from the Quick Start to view its technical documentation.</p>
              </CardContent>
            </Card>
          )}
          </>
          ); })()}
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
