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
  Variable, FlaskConical, LineChart as LineChartIcon, Sigma, Copy, Check, Code
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter
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

const MathModelingView = () => {
  const { user } = useAuth();
  const [equations, setEquations] = useState<string[]>(["dS/dt = -beta * S * I / N", "dI/dt = beta * S * I / N - gamma * I", "dR/dt = gamma * I"]);
  const [parameters, setParameters] = useState<{ name: string; value: number }[]>([
    { name: "beta", value: 0.3 }, { name: "gamma", value: 0.1 }, { name: "N", value: 1000 },
  ]);
  const [initialValues, setInitialValues] = useState<{ name: string; value: number }[]>([
    { name: "S", value: 999 }, { name: "I", value: 1 }, { name: "R", value: 0 },
  ]);
  const [compartments, setCompartments] = useState<string[]>(["S", "I", "R"]);
  const [timeConfig, setTimeConfig] = useState({ start: 0, end: 160, step: 0.1 });
  const [activeTab, setActiveTab] = useState("setup");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState("");

  // Results
  const [simulationData, setSimulationData] = useState<any>(null);
  const [expandedCompartment, setExpandedCompartment] = useState<{ key: string; index: number } | null>(null);
  const [overlayCompartments, setOverlayCompartments] = useState<string[]>([]);
  const [r0Results, setR0Results] = useState<any>(null);
  const [sensitivityResults, setSensitivityResults] = useState<any>(null);
  const [scenarioResults, setScenarioResults] = useState<any>(null);
  const [fittingResults, setFittingResults] = useState<any>(null);
  const [scriptTab, setScriptTab] = useState<"r" | "python">("r");
  const [copied, setCopied] = useState(false);

  // Fitting
  const [fittingData, setFittingData] = useState<any[]>([]);
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
    toast({ title: `${preset.name} loaded`, description: "Model equations and parameters have been set." });
  };

  const getPayload = () => ({
    equations,
    parameters: Object.fromEntries(parameters.map(p => [p.name, p.value])),
    initialValues: Object.fromEntries(initialValues.map(v => [v.name, v.value])),
    timeConfig,
    compartments,
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(ws);
        if (jsonData.length > 0) {
          setFittingData(jsonData as any[]);
          setFittingColumns(Object.keys(jsonData[0] as object));
          toast({ title: "Data imported", description: `${jsonData.length} rows loaded` });
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
      toast({ title: "Form data loaded", description: `${rows.length} submissions loaded` });
    }
  };

  // Generate R script for current model
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

# --- Simulation Settings ---
times <- seq(${timeConfig.start}, ${timeConfig.end}, by = ${timeConfig.step})
state <- c(${stateVec})
parms <- c(${parameters.map(p => `${p.name} = ${p.value}`).join(", ")})

# --- Solve ---
out <- ode(y = state, times = times, func = model, parms = parms, method = "rk4")
out <- as.data.frame(out)

# --- Plot: Combined ---
${plotLines}
legend("topright", legend = c(${legendNames}), col = c(${legendCols}), lwd = 2)

# --- Plot: Individual compartments ---
par(mfrow = c(${Math.ceil(compartments.length / 3)}, ${Math.min(compartments.length, 3)}))
${compartments.map((c, i) => {
  const col = ["blue", "red", "green", "purple", "orange", "brown", "cyan", "magenta"][i % 8];
  return `plot(out[,"time"], out[,"${c}"], type="l", col="${col}", lwd=2, xlab="Time", ylab="${c}", main="${c}")`;
}).join("\n")}
par(mfrow = c(1, 1))

# --- Export CSV ---
write.csv(out, "simulation_output.csv", row.names = FALSE)
cat("Simulation complete. Results saved to simulation_output.csv\\n")
`;
  };

  // Generate Python script for current model
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

# --- Solve ---
sol = solve_ivp(model, t_span, y0, t_eval=t_eval, method='RK45', max_step=${timeConfig.step})

# --- Create DataFrame ---
df = pd.DataFrame({'time': sol.t})
${compartments.map((c, i) => `df['${c}'] = sol.y[${i}]`).join("\n")}

# --- Plot: Combined ---
plt.figure(figsize=(12, 6))
${compartments.map(c => `plt.plot(df['time'], df['${c}'], linewidth=2, label='${c}')`).join("\n")}
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
axes[${i}].grid(True, alpha=0.3)`).join("\n")}
plt.tight_layout()
plt.savefig('simulation_individual.png', dpi=150)
plt.show()

# --- Export CSV ---
df.to_csv('simulation_output.csv', index=False)
print(f"Simulation complete. {len(df)} time points saved to simulation_output.csv")
`;
  };

  const copyScript = (script: string) => {
    navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Script copied to clipboard." });
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
                {parameters.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={p.name} onChange={e => { const next = [...parameters]; next[i].name = e.target.value; setParameters(next); }} placeholder="Name" className="w-24 font-mono text-sm" />
                    <Input type="number" value={p.value} onChange={e => { const next = [...parameters]; next[i].value = Number(e.target.value); setParameters(next); }} step="any" className="font-mono text-sm" />
                    <Button variant="ghost" size="icon" onClick={() => setParameters(parameters.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
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
                <CardHeader><CardTitle>Model Simulation</CardTitle><CardDescription>{simulationData.summary}</CardDescription></CardHeader>
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
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
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

                    // Build combined chart data for all selected compartments
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

                        {/* Stats row */}
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-1">
                          {selectedKeys.map((k, i) => {
                            const values = chartData.map(d => d[k]).filter((v): v is number => v != null);
                            const min = values.length ? Math.min(...values) : 0;
                            const max = values.length ? Math.max(...values) : 0;
                            const final = values.length ? values[values.length - 1] : 0;
                            return (
                              <div key={k} className="flex items-center gap-2 border rounded px-2 py-1">
                                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[allKeys.indexOf(k) % COLORS.length] }} />
                                <span className="font-medium text-foreground">{k}</span>
                                <span>Min: {min.toFixed(2)}</span>
                                <span>Max: {max.toFixed(2)}</span>
                                <span>Final: {final.toFixed(2)}</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Chart */}
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

                        {/* Compartment selector */}
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
                  <CardDescription>Copy-paste ready R and Python scripts that reproduce this simulation</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs value={scriptTab} onValueChange={(v) => setScriptTab(v as "r" | "python")}>
                    <div className="flex items-center justify-between mb-3">
                      <TabsList>
                        <TabsTrigger value="r">R Script</TabsTrigger>
                        <TabsTrigger value="python">Python Script</TabsTrigger>
                      </TabsList>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => copyScript(scriptTab === "r" ? generateRScript() : generatePythonScript())}
                      >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? "Copied!" : "Copy"}
                      </Button>
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
                          <Bar dataKey="sensitivity_to_r0" fill="hsl(var(--primary))" name="Sensitivity to R₀" radius={[0, 4, 4, 0]} />
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
                  {/* Show one chart per compartment with all scenarios */}
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
                      {s.r0 !== undefined && (
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
                  <div className="p-3 rounded-lg bg-muted/50 text-sm">
                    <span className="font-medium text-foreground">{fittingData.length} rows loaded</span>
                    <p className="text-xs text-muted-foreground mt-1">Columns: {fittingColumns.join(", ")}</p>
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

              {fittingResults.fitted_parameters && (
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

              {fittingResults.fitted_curves && (
                <Card>
                  <CardHeader><CardTitle>Fitted vs Observed</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={getSimChartData(fittingResults.fitted_curves)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="t" />
                          <YAxis />
                          <Tooltip contentStyle={{ borderRadius: 8 }} />
                          <Legend />
                          {Object.keys(fittingResults.fitted_curves).map((key, i) => (
                            <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
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
              <p className="text-sm text-muted-foreground">AI is computing your results</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default MathModelingView;
