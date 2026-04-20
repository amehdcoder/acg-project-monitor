import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload, FlaskConical, Sigma, Play, Loader2, Info, FileSpreadsheet, Database,
  CheckCircle2, AlertTriangle, Download, FileDown, FileText, Image as ImageIcon, RotateCcw,
  ChevronRight, ChevronLeft,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend,
} from "recharts";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { runCalibration } from "@/lib/calibration/engine";

type DatasetShape = "single_timeseries" | "multi_timeseries" | "snapshot" | "form_submissions";
type Method = "lm_bounded" | "least_squares" | "weighted_lsq";

interface FitParam {
  name: string;
  lower: number;
  upper: number;
  initial: number;
  fixed?: boolean;
  description?: string;
  units?: string;
}

interface Mapping {
  observedColumn: string;
  modelOutput: string;
  weight?: number;
}

interface CalibrationWorkspaceProps {
  equations: string[];
  parameters: { name: string; value: number }[];
  initialValues: { name: string; value: number }[];
  compartments: string[];
  modelName?: string;
  onApplyCalibrated?: (calibrated: { name: string; value: number }[]) => void;
}

const STEPS = [
  { id: "model", label: "Model & Equations", icon: FlaskConical },
  { id: "data", label: "Dataset", icon: Database },
  { id: "mapping", label: "Variable Mapping", icon: Sigma },
  { id: "config", label: "Method & Bounds", icon: FileSpreadsheet },
  { id: "results", label: "Results & Diagnostics", icon: CheckCircle2 },
] as const;

export const CalibrationWorkspace = ({
  equations, parameters, initialValues, compartments, modelName,
  onApplyCalibrated,
}: CalibrationWorkspaceProps) => {
  const [step, setStep] = useState<number>(0);

  // ── Data state ──
  const [datasetShape, setDatasetShape] = useState<DatasetShape>("single_timeseries");
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [datasetName, setDatasetName] = useState<string>("");
  const [timeColumn, setTimeColumn] = useState<string>("");
  const [snapshotTime, setSnapshotTime] = useState<number>(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Form-submissions source
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [forms, setForms] = useState<{ id: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedForm, setSelectedForm] = useState<string>("");
  const [loadingForm, setLoadingForm] = useState(false);

  // ── Mapping ──
  const [mappings, setMappings] = useState<Mapping[]>([]);

  // ── Fit configuration ──
  const [method, setMethod] = useState<Method>("lm_bounded");
  const [multistarts, setMultistarts] = useState<number>(5);
  const [maxIter, setMaxIter] = useState<number>(80);
  const [maxStep, setMaxStep] = useState<number>(0.25);
  const [fitParams, setFitParams] = useState<FitParam[]>(
    parameters.map((p) => ({
      name: p.name,
      lower: Math.max(0, p.value * 0.1),
      upper: p.value * 5 || 1,
      initial: p.value,
      fixed: false,
    }))
  );

  // Sync fitParams when model changes
  useEffect(() => {
    setFitParams(parameters.map((p) => ({
      name: p.name,
      lower: Math.max(0, p.value * 0.1),
      upper: p.value > 0 ? p.value * 5 : 1,
      initial: p.value,
      fixed: false,
    })));
  }, [parameters]);

  // ── Run state ──
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  // Load projects on mount
  useEffect(() => {
    if (datasetShape !== "form_submissions") return;
    supabase.from("projects").select("id, name").order("name").then(({ data }) => {
      if (data) setProjects(data);
    });
  }, [datasetShape]);

  useEffect(() => {
    if (!selectedProject) return;
    supabase.from("forms").select("id, name").eq("project_id", selectedProject).then(({ data }) => {
      if (data) setForms(data);
    });
  }, [selectedProject]);

  // ── Validation ──
  const dataReady = rawRows.length > 0 && columns.length > 0;
  const timeReady = datasetShape === "snapshot" ? true : !!timeColumn;
  const mappingReady = mappings.length > 0 && mappings.every((m) => m.observedColumn && m.modelOutput);
  const freeParamsCount = fitParams.filter((p) => !p.fixed).length;
  const fitConfigReady = freeParamsCount > 0 && fitParams.every((p) => p.fixed || (p.lower < p.upper && p.initial >= p.lower && p.initial <= p.upper));

  // ── File upload ──
  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: null });
      if (rows.length === 0) {
        toast({ title: "Empty file", description: "No rows found in the first sheet.", variant: "destructive" });
        return;
      }
      const cols = Object.keys(rows[0]);
      setRawRows(rows);
      setColumns(cols);
      setDatasetName(file.name);
      // Auto-detect time column
      const timeCandidate = cols.find((c) => /time|day|week|month|year|t$|^t/i.test(c));
      if (timeCandidate) setTimeColumn(timeCandidate);
      toast({ title: "Dataset loaded", description: `${rows.length} rows, ${cols.length} columns.` });
    } catch (e: any) {
      toast({ title: "Failed to parse file", description: e.message, variant: "destructive" });
    }
  };

  const loadFormData = async () => {
    if (!selectedForm) return;
    setLoadingForm(true);
    try {
      const { data, error } = await supabase
        .from("form_submissions").select("data, submitted_at").eq("form_id", selectedForm)
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: "No submissions", variant: "destructive" });
        return;
      }
      const flat = data.map((s) => ({ submitted_at: s.submitted_at, ...(s.data as any) }));
      const cols = Array.from(new Set(flat.flatMap((r) => Object.keys(r))));
      setRawRows(flat);
      setColumns(cols);
      setDatasetName(`Form: ${forms.find((f) => f.id === selectedForm)?.name ?? selectedForm}`);
      setTimeColumn("submitted_at");
      toast({ title: "Form data loaded", description: `${flat.length} submissions.` });
    } catch (e: any) {
      toast({ title: "Load failed", description: e.message, variant: "destructive" });
    } finally {
      setLoadingForm(false);
    }
  };

  // ── Run calibration (CLIENT-SIDE — no edge function, no resource limits) ──
  const [progressMsg, setProgressMsg] = useState<string>("");
  const runCalibrationLocal = async () => {
    if (!fitConfigReady || !mappingReady) return;
    setRunning(true);
    setProgressMsg("Preparing dataset…");
    try {
      const cleanRows = rawRows.map((r) => {
        const out: Record<string, any> = { ...r };
        if (datasetShape !== "snapshot" && timeColumn) {
          const v = r[timeColumn];
          out[timeColumn] = isNaN(Number(v)) ? new Date(v).getTime() / (1000 * 60 * 60 * 24) : Number(v);
        }
        return out;
      });
      if (datasetShape !== "snapshot" && timeColumn) {
        const ts = cleanRows.map((r) => Number(r[timeColumn])).filter((v) => isFinite(v));
        const t0 = Math.min(...ts);
        for (const r of cleanRows) r[timeColumn] = Number(r[timeColumn]) - t0;
      }

      const fixedParams: Record<string, number> = {};
      for (const p of fitParams) if (p.fixed) fixedParams[p.name] = p.initial;
      const initialValuesObj: Record<string, number> = Object.fromEntries(initialValues.map((v) => [v.name, v.value]));

      // Run on the next tick so the spinner paints first.
      await new Promise<void>((resolve) => setTimeout(resolve, 30));

      const data = await runCalibration(
        {
          equations, fitParams, fixedParams, initialValues: initialValuesObj,
          dataset: { rows: cleanRows, timeColumn },
          mappings,
        },
        {
          method, multistarts, maxIter, maxStep, datasetShape, snapshotTime,
          onProgress: (msg) => setProgressMsg(msg),
        },
      );
      setResult(data);
      setStep(4);
      toast({
        title: "Calibration complete",
        description: `${data.diagnostics.fitQuality.toUpperCase()} fit · R² = ${data.diagnostics.r2.toFixed(3)} · RMSE = ${data.diagnostics.rmse.toFixed(4)}`,
      });
    } catch (e: any) {
      toast({ title: "Calibration failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
      setProgressMsg("");
    }
  };
  const runCalibration_ = runCalibrationLocal;

  // ── Build chart data: lines = observed, dots = predicted at observed times ──
  const chartData = useMemo(() => {
    if (!result) return [];
    const denseTimes: number[] = result.predicted.dense.times;
    const denseSeries: Record<string, number[]> = result.predicted.dense.series;
    const obsTimes: number[] = result.observed.times;
    const obsByCol: Record<string, number[]> = {};
    const predByOutput: Record<string, number[]> = {};
    for (const m of result.observed.mappings) obsByCol[m.observedColumn] = m.values;
    for (const m of result.predicted.atObservedTimes.mappings ?? result.observed.mappings) {
      predByOutput[m.modelOutput] = result.predicted.atObservedTimes.series[m.modelOutput] ?? [];
    }

    // Combine dense (lines) with observed (scatter)
    const all: any[] = [];
    for (let i = 0; i < denseTimes.length; i++) {
      const point: any = { t: denseTimes[i] };
      for (const m of result.observed.mappings) {
        point[`${m.modelOutput}_predLine`] = denseSeries[m.modelOutput]?.[i] ?? null;
      }
      all.push(point);
    }
    for (let i = 0; i < obsTimes.length; i++) {
      const point: any = { t: obsTimes[i] };
      for (const m of result.observed.mappings) {
        point[`${m.observedColumn}_obs`] = obsByCol[m.observedColumn]?.[i] ?? null;
        point[`${m.modelOutput}_predDot`] = predByOutput[m.modelOutput]?.[i] ?? null;
      }
      all.push(point);
    }
    return all.sort((a, b) => a.t - b.t);
  }, [result]);

  const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(200, 70%, 50%)", "hsl(340, 65%, 50%)", "hsl(270, 60%, 55%)"];

  // ── Exports ──
  const exportParametersCSV = () => {
    if (!result) return;
    const rows = result.calibratedParameters.map((p: any) => ({
      Parameter: p.name, Lower: p.lower, Upper: p.upper, Initial: p.initial,
      Calibrated: p.value, StandardError: p.standardError ?? "",
      "CI Lower (exploratory)": p.confidenceInterval?.lower ?? "",
      "CI Upper (exploratory)": p.confidenceInterval?.upper ?? "",
      Status: p.fixed ? "Fixed" : p.atBound ? "At bound" : "Free",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Calibrated Parameters");
    XLSX.writeFile(wb, "calibration_parameters.xlsx");
  };

  const exportPlotPNG = async () => {
    if (!plotRef.current) return;
    const canvas = await html2canvas(plotRef.current, { backgroundColor: "#ffffff", scale: 2 });
    const link = document.createElement("a");
    link.download = "calibration_fit.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const exportReportPDF = async () => {
    if (!result) return;
    const pdf = new jsPDF("p", "pt", "a4");
    const margin = 40;
    let y = margin;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(16);
    pdf.text(`Model Calibration Report — ${modelName ?? "Model"}`, margin, y); y += 22;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
    pdf.text(`Generated: ${new Date(result.reproducibility.timestamp).toLocaleString()}`, margin, y); y += 14;
    pdf.text(`Dataset: ${datasetName} (${result.diagnostics.nObservations} observations)`, margin, y); y += 14;
    pdf.text(`Method: ${result.method} · Multi-start: ${result.multistarts} · Iterations: ${result.iterations} · Converged: ${result.converged}`, margin, y); y += 18;

    pdf.setFont("helvetica", "bold"); pdf.setFontSize(13);
    pdf.text("Goodness of Fit", margin, y); y += 16;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
    const d = result.diagnostics;
    pdf.text(`SSE = ${d.sse.toFixed(4)}    RMSE = ${d.rmse.toFixed(4)}    MAE = ${d.mae.toFixed(4)}`, margin, y); y += 12;
    pdf.text(`R² = ${d.r2.toFixed(4)}    Adj R² = ${d.adjR2 != null ? d.adjR2.toFixed(4) : "n/a"}    AIC = ${d.aic.toFixed(2)}    BIC = ${d.bic.toFixed(2)}`, margin, y); y += 12;
    pdf.text(`Fit quality: ${d.fitQuality.toUpperCase()}    Free parameters: ${d.nFreeParams}`, margin, y); y += 18;

    pdf.setFont("helvetica", "bold"); pdf.setFontSize(13);
    pdf.text("Calibrated Parameters", margin, y); y += 16;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
    for (const p of result.calibratedParameters) {
      const ci = p.confidenceInterval ? ` [${p.confidenceInterval.lower.toPrecision(3)}, ${p.confidenceInterval.upper.toPrecision(3)}]` : "";
      pdf.text(`${p.name.padEnd(14)} = ${p.value.toPrecision(5)}${ci}    bounds [${p.lower}, ${p.upper}]    ${p.fixed ? "FIXED" : p.atBound ? "AT BOUND" : "free"}`, margin, y);
      y += 11;
      if (y > 780) { pdf.addPage(); y = margin; }
    }
    y += 8;

    if (result.warnings?.length || result.identifiabilityHints?.length) {
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(13);
      pdf.text("Diagnostics & Warnings", margin, y); y += 16;
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
      for (const w of [...(result.warnings || []), ...(result.identifiabilityHints || [])]) {
        const lines = pdf.splitTextToSize(`• ${w}`, 515);
        pdf.text(lines, margin, y); y += lines.length * 11;
        if (y > 780) { pdf.addPage(); y = margin; }
      }
      y += 8;
    }

    pdf.setFont("helvetica", "bold"); pdf.setFontSize(13);
    pdf.text("Reproducibility Summary", margin, y); y += 16;
    pdf.setFont("courier", "normal"); pdf.setFontSize(8);
    const repro = JSON.stringify(result.reproducibility, null, 2);
    const reproLines = pdf.splitTextToSize(repro, 515);
    for (const line of reproLines) {
      pdf.text(line, margin, y); y += 9;
      if (y > 780) { pdf.addPage(); y = margin; }
    }

    // Plot on second page
    if (plotRef.current) {
      pdf.addPage();
      const canvas = await html2canvas(plotRef.current, { backgroundColor: "#ffffff", scale: 2 });
      const img = canvas.toDataURL("image/png");
      const props = pdf.getImageProperties(img);
      const w = 515;
      const h = (props.height * w) / props.width;
      pdf.addImage(img, "PNG", margin, margin, w, Math.min(h, 720));
    }

    pdf.save("calibration_report.pdf");
  };

  const exportRawJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "calibration_raw.json"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render helpers ──
  const InfoTip = ({ children, label }: { children: React.ReactNode; label: string }) => (
    <TooltipProvider><Tooltip>
      <TooltipTrigger type="button" className="inline-flex items-center align-middle">
        <Info className="h-3.5 w-3.5 text-muted-foreground ml-1 cursor-help" aria-label={label} />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{children}</TooltipContent>
    </Tooltip></TooltipProvider>
  );

  const StepHeader = () => (
    <div className="flex items-center justify-between gap-2 flex-wrap mb-6">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const isActive = i === step;
        const isDone = i < step;
        return (
          <button
            key={s.id} onClick={() => setStep(i)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
              isActive ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : isDone ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/15"
              : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold ${
              isActive ? "bg-primary-foreground/20" : isDone ? "bg-primary/20" : "bg-muted"
            }`}>{isDone ? "✓" : i + 1}</span>
            <Icon className="h-4 w-4" />
            <span className="hidden md:inline font-medium">{s.label}</span>
          </button>
        );
      })}
    </div>
  );

  const NavButtons = ({ canNext, onNext, nextLabel = "Next" }: { canNext: boolean; onNext?: () => void; nextLabel?: string }) => (
    <div className="flex justify-between mt-6">
      <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
        <ChevronLeft className="h-4 w-4 mr-1" /> Back
      </Button>
      <Button onClick={onNext ?? (() => setStep((s) => Math.min(STEPS.length - 1, s + 1)))} disabled={!canNext}>
        {nextLabel} <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <FlaskConical className="h-5 w-5 text-primary" />
                Calibration Workspace
              </CardTitle>
              <CardDescription>
                Publication-grade model calibration · transparent methods · reproducible runs
              </CardDescription>
            </div>
            <Badge variant="secondary" className="font-mono">{modelName ?? "Custom Model"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0"><StepHeader /></CardContent>
      </Card>

      {/* STEP 0 — Model */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Governing Equations</CardTitle>
            <CardDescription>
              These ODEs and the parameter set below define the model that will be calibrated.
              All numerical work is performed server-side with RK4 integration.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 font-mono text-sm space-y-1.5 overflow-x-auto">
              {equations.map((eq, i) => (
                <div key={i} className="text-foreground whitespace-nowrap">{eq}</div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">State variables</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {compartments.map((c) => <Badge key={c} variant="outline" className="font-mono">{c}</Badge>)}
                </div>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Parameters ({parameters.length})</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {parameters.map((p) => <Badge key={p.name} variant="secondary" className="font-mono text-xs">{p.name} = {p.value}</Badge>)}
                </div>
              </div>
            </div>
            <NavButtons canNext={equations.length > 0} />
          </CardContent>
        </Card>
      )}

      {/* STEP 1 — Data */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observed Dataset</CardTitle>
            <CardDescription>Choose the shape of your data and provide it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label className="text-sm font-semibold mb-2 block">Dataset shape</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  { v: "single_timeseries", label: "Single time series", desc: "One observed variable measured across time" },
                  { v: "multi_timeseries", label: "Multi-variable time series", desc: "Several observed variables aligned on a shared time axis" },
                  { v: "snapshot", label: "Cross-sectional / equilibrium", desc: "A single snapshot to fit against the model at one time point" },
                  { v: "form_submissions", label: "Pull from form submissions", desc: "Build the time series from a project's submitted form data" },
                ] as { v: DatasetShape; label: string; desc: string }[]).map((opt) => (
                  <button
                    key={opt.v} onClick={() => setDatasetShape(opt.v)}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      datasetShape === opt.v ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {datasetShape !== "form_submissions" ? (
              <div>
                <Label className="text-sm font-semibold mb-2 block">Upload CSV / Excel</Label>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                <Button variant="outline" className="w-full gap-2" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" /> {datasetName || "Choose file"}
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Project</Label>
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Form</Label>
                  <Select value={selectedForm} onValueChange={setSelectedForm}>
                    <SelectTrigger><SelectValue placeholder="Select form" /></SelectTrigger>
                    <SelectContent>{forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Button onClick={loadFormData} disabled={!selectedForm || loadingForm} className="gap-2 w-full">
                    {loadingForm ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                    Load submissions
                  </Button>
                </div>
              </div>
            )}

            {dataReady && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  {rawRows.length} rows · {columns.length} columns
                </div>
                <div className="text-xs text-muted-foreground">{datasetName}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {datasetShape !== "snapshot" && (
                    <div>
                      <Label className="text-xs flex items-center">Time column<InfoTip label="Time column">The independent variable. Must be numeric or convertible from a timestamp.</InfoTip></Label>
                      <Select value={timeColumn} onValueChange={setTimeColumn}>
                        <SelectTrigger><SelectValue placeholder="Select time column" /></SelectTrigger>
                        <SelectContent>{columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  {datasetShape === "snapshot" && (
                    <div>
                      <Label className="text-xs">Snapshot time</Label>
                      <Input type="number" value={snapshotTime} onChange={(e) => setSnapshotTime(Number(e.target.value))} />
                    </div>
                  )}
                </div>
                <ScrollArea className="h-32 rounded border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>{columns.slice(0, 8).map((c) => <th key={c} className="text-left p-1.5 font-semibold">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {rawRows.slice(0, 5).map((r, i) => (
                        <tr key={i} className="border-t">{columns.slice(0, 8).map((c) => <td key={c} className="p-1.5 font-mono">{String(r[c] ?? "")}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            )}

            <NavButtons canNext={dataReady && timeReady} />
          </CardContent>
        </Card>
      )}

      {/* STEP 2 — Mapping */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Variable Mapping</CardTitle>
            <CardDescription>
              Map each observed column to the model output (compartment) it represents.
              Optionally weight observations to emphasise certain measurements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mappings.length === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No mappings yet. Add one to begin.
              </div>
            )}
            {mappings.map((m, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-12 items-end p-3 rounded-lg border bg-muted/30">
                <div className="sm:col-span-5">
                  <Label className="text-xs">Observed column</Label>
                  <Select value={m.observedColumn} onValueChange={(v) => setMappings((arr) => arr.map((x, j) => j === i ? { ...x, observedColumn: v } : x))}>
                    <SelectTrigger><SelectValue placeholder="Pick column" /></SelectTrigger>
                    <SelectContent>{columns.filter((c) => c !== timeColumn).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-4">
                  <Label className="text-xs">Model output (compartment)</Label>
                  <Select value={m.modelOutput} onValueChange={(v) => setMappings((arr) => arr.map((x, j) => j === i ? { ...x, modelOutput: v } : x))}>
                    <SelectTrigger><SelectValue placeholder="Pick compartment" /></SelectTrigger>
                    <SelectContent>{compartments.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs flex items-center">Weight<InfoTip label="Weight">Higher weight = this observation contributes more to the loss.</InfoTip></Label>
                  <Input type="number" min="0" step="0.1" value={m.weight ?? 1}
                    onChange={(e) => setMappings((arr) => arr.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x))} />
                </div>
                <div className="sm:col-span-1">
                  <Button variant="ghost" size="sm" onClick={() => setMappings((arr) => arr.filter((_, j) => j !== i))}>×</Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setMappings((arr) => [...arr, { observedColumn: "", modelOutput: compartments[0] ?? "", weight: 1 }])}>
              + Add mapping
            </Button>
            <NavButtons canNext={mappingReady} />
          </CardContent>
        </Card>
      )}

      {/* STEP 3 — Method & bounds */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calibration Method & Parameter Bounds</CardTitle>
            <CardDescription>
              Choose the optimization method and define box constraints. Parameters marked Fixed are held at their initial value.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label className="text-xs flex items-center">Method<InfoTip label="Method">Bounded Levenberg–Marquardt is recommended for nonlinear ODE fitting with parameter bounds.</InfoTip></Label>
                <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lm_bounded">Levenberg–Marquardt (bounded)</SelectItem>
                    <SelectItem value="weighted_lsq">Weighted least squares</SelectItem>
                    <SelectItem value="least_squares">Ordinary least squares</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs flex items-center">Multi-starts<InfoTip label="Multi-starts">Number of random initial guesses. Higher = more global, slower.</InfoTip></Label>
                <Input type="number" min="1" max="20" value={multistarts} onChange={(e) => setMultistarts(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Max iterations</Label>
                <Input type="number" min="20" max="200" value={maxIter} onChange={(e) => setMaxIter(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs flex items-center">Solver step<InfoTip label="Solver step">RK4 maximum step size between observed time points.</InfoTip></Label>
                <Input type="number" min="0.001" step="0.01" value={maxStep} onChange={(e) => setMaxStep(Number(e.target.value))} />
              </div>
            </div>

            <Separator />

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left p-2 font-semibold">Parameter</th>
                    <th className="text-right p-2 font-semibold">Lower</th>
                    <th className="text-right p-2 font-semibold">Initial</th>
                    <th className="text-right p-2 font-semibold">Upper</th>
                    <th className="text-center p-2 font-semibold">Fixed</th>
                  </tr>
                </thead>
                <tbody>
                  {fitParams.map((p, i) => {
                    const invalid = !p.fixed && (p.lower >= p.upper || p.initial < p.lower || p.initial > p.upper);
                    return (
                      <tr key={p.name} className={`border-b ${invalid ? "bg-destructive/5" : ""}`}>
                        <td className="p-2 font-mono font-semibold">{p.name}</td>
                        <td className="p-2"><Input type="number" step="any" value={p.lower}
                          onChange={(e) => setFitParams((arr) => arr.map((x, j) => j === i ? { ...x, lower: Number(e.target.value) } : x))}
                          className="h-8 text-right font-mono" /></td>
                        <td className="p-2"><Input type="number" step="any" value={p.initial}
                          onChange={(e) => setFitParams((arr) => arr.map((x, j) => j === i ? { ...x, initial: Number(e.target.value) } : x))}
                          className="h-8 text-right font-mono" /></td>
                        <td className="p-2"><Input type="number" step="any" value={p.upper}
                          onChange={(e) => setFitParams((arr) => arr.map((x, j) => j === i ? { ...x, upper: Number(e.target.value) } : x))}
                          className="h-8 text-right font-mono" /></td>
                        <td className="p-2 text-center">
                          <input type="checkbox" checked={!!p.fixed}
                            onChange={(e) => setFitParams((arr) => arr.map((x, j) => j === i ? { ...x, fixed: e.target.checked } : x))} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              {freeParamsCount} of {fitParams.length} parameters will be estimated. Fitting too many parameters with sparse data risks overfitting.
            </p>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={runCalibration} disabled={running || !fitConfigReady || !mappingReady} className="gap-2">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run calibration
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4 — Results */}
      {step === 4 && result && (
        <div className="space-y-6">
          {/* Headline */}
          <Card className="border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={result.diagnostics.fitQuality === "strong" ? "default" : result.diagnostics.fitQuality === "moderate" ? "secondary" : "destructive"}>
                      {result.diagnostics.fitQuality.toUpperCase()} FIT
                    </Badge>
                    <Badge variant="outline" className="font-mono">{result.method}</Badge>
                    <Badge variant="outline">{result.converged ? "Converged" : "Did not converge"}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{result.solverMessage} · {result.iterations} iterations · {result.multistarts} multi-starts</p>
                </div>
                {onApplyCalibrated && (
                  <Button variant="default" onClick={() => {
                    onApplyCalibrated(result.calibratedParameters.map((p: any) => ({ name: p.name, value: p.value })));
                    toast({ title: "Calibrated parameters applied to model setup" });
                  }}>
                    Apply to model
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Diagnostics grid */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { k: "SSE", v: result.diagnostics.sse, tip: "Sum of squared errors (weighted)." },
              { k: "RMSE", v: result.diagnostics.rmse, tip: "Root mean squared error — same units as observations." },
              { k: "MAE", v: result.diagnostics.mae, tip: "Mean absolute error." },
              { k: "R²", v: result.diagnostics.r2, tip: "Coefficient of determination." },
              { k: "Adj R²", v: result.diagnostics.adjR2, tip: "Adjusted for the number of free parameters." },
              { k: "AIC", v: result.diagnostics.aic, tip: "Akaike Information Criterion. Lower = better." },
              { k: "BIC", v: result.diagnostics.bic, tip: "Bayesian Information Criterion. Lower = better." },
            ].map((m) => (
              <Card key={m.k}>
                <CardContent className="pt-4 pb-4 text-center">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider flex items-center justify-center">
                    {m.k}<InfoTip label={m.k}>{m.tip}</InfoTip>
                  </div>
                  <div className="text-xl font-bold font-mono mt-1">{m.v == null ? "—" : (Math.abs(m.v) < 0.001 || Math.abs(m.v) > 9999 ? m.v.toExponential(3) : m.v.toFixed(4))}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Fit plot */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-base">Observed vs Predicted</CardTitle>
                  <CardDescription>Lines = model prediction · Dots = observed data points at measurement times</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={exportPlotPNG} className="gap-2"><ImageIcon className="h-4 w-4" /> PNG</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div ref={plotRef} className="bg-background p-4 rounded">
                <h3 className="text-center text-sm font-semibold mb-2">Calibration Fit — {modelName ?? "Model"}</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]}
                      label={{ value: "Time", position: "insideBottom", offset: -5 }} stroke="hsl(var(--foreground))" />
                    <YAxis label={{ value: "Value", angle: -90, position: "insideLeft" }} stroke="hsl(var(--foreground))" />
                    <RTooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {result.observed.mappings.map((m: any, i: number) => (
                      <Line key={`line-${m.modelOutput}`} dataKey={`${m.modelOutput}_predLine`} type="monotone"
                        stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false}
                        name={`${m.modelOutput} (predicted)`} connectNulls />
                    ))}
                    {result.observed.mappings.map((m: any, i: number) => (
                      <Scatter key={`obs-${m.observedColumn}`} dataKey={`${m.observedColumn}_obs`}
                        fill={COLORS[i % COLORS.length]} name={`${m.observedColumn} (observed)`}
                        shape="circle" />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Parameter table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base">Calibrated Parameters</CardTitle>
                <Button size="sm" variant="outline" onClick={exportParametersCSV} className="gap-2">
                  <FileDown className="h-4 w-4" /> Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left p-2 font-semibold">Parameter</th>
                    <th className="text-right p-2 font-semibold">Lower</th>
                    <th className="text-right p-2 font-semibold">Upper</th>
                    <th className="text-right p-2 font-semibold">Initial</th>
                    <th className="text-right p-2 font-semibold">Calibrated</th>
                    <th className="text-right p-2 font-semibold">SE</th>
                    <th className="text-right p-2 font-semibold">95% CI<InfoTip label="CI">Wald-type interval from local Hessian. Treat as exploratory.</InfoTip></th>
                    <th className="text-center p-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.calibratedParameters.map((p: any) => (
                    <tr key={p.name} className="border-b hover:bg-muted/30">
                      <td className="p-2 font-mono font-semibold">{p.name}</td>
                      <td className="p-2 text-right font-mono text-xs">{p.lower}</td>
                      <td className="p-2 text-right font-mono text-xs">{p.upper}</td>
                      <td className="p-2 text-right font-mono text-xs">{p.initial}</td>
                      <td className="p-2 text-right font-mono font-semibold">{Number(p.value).toPrecision(5)}</td>
                      <td className="p-2 text-right font-mono text-xs">{p.standardError != null ? Number(p.standardError).toPrecision(3) : "—"}</td>
                      <td className="p-2 text-right font-mono text-xs">
                        {p.confidenceInterval ? `[${p.confidenceInterval.lower.toPrecision(3)}, ${p.confidenceInterval.upper.toPrecision(3)}]` : "—"}
                      </td>
                      <td className="p-2 text-center">
                        {p.fixed ? <Badge variant="outline">Fixed</Badge>
                          : p.atBound ? <Badge variant="destructive">At bound</Badge>
                          : <Badge variant="default">Free</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Warnings */}
          {(result.warnings?.length || result.identifiabilityHints?.length) ? (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" /> Diagnostics & Warnings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1.5 text-foreground">
                  {[...(result.warnings || []), ...(result.identifiabilityHints || [])].map((w, i) => (
                    <li key={i} className="flex gap-2"><span className="text-destructive">•</span><span>{w}</span></li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {/* Reproducibility & exports */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reproducibility Summary</CardTitle>
                <CardDescription>Captured automatically — copy or include in your report.</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted/50 p-3 rounded overflow-x-auto max-h-72 font-mono">
{JSON.stringify(result.reproducibility, null, 2)}
                </pre>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Downloads</CardTitle>
                <CardDescription>Publication-ready outputs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start gap-2" onClick={exportParametersCSV}>
                  <FileSpreadsheet className="h-4 w-4" /> Calibrated parameter table (XLSX)
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2" onClick={exportPlotPNG}>
                  <ImageIcon className="h-4 w-4" /> Fit plot (PNG)
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2" onClick={exportReportPDF}>
                  <FileText className="h-4 w-4" /> Full calibration report (PDF)
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2" onClick={exportRawJSON}>
                  <Download className="h-4 w-4" /> Raw analysis output (JSON)
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(0)} className="gap-2">
              <RotateCcw className="h-4 w-4" /> Start over
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalibrationWorkspace;
