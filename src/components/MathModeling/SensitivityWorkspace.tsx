/**
 * Sensitivity Workspace
 * ─────────────────────────────────────────────────────────────────────────
 * Full-featured local + global sensitivity analysis UI for the active
 * mathematical model. Pure in-browser, no backend round-trip.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, LineChart, Line, ScatterChart, Scatter, ZAxis,
  ReferenceLine, Cell,
} from "recharts";
import {
  Activity, AlertTriangle, BarChart3, Brain, ChevronRight, Download,
  FileImage, FileSpreadsheet, FileText, Filter, Gauge, Image as ImageIcon,
  Layers, Loader2, PlayCircle, Settings2, Sparkles, Sheet as SheetIcon,
  Target as TargetIcon, Timer, Zap,
} from "lucide-react";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import {
  estimateBudget, runSensitivity,
  type ModelSpec, type OutputMetric, type ParamRange,
  type SensitivityConfig, type SensitivityMethod, type SensitivityResult,
} from "@/lib/sensitivity/engine";

// Publication-grade colour palette (semantic-token compatible HSL)
const PALETTE = [
  "hsl(217 91% 55%)",   // royal blue
  "hsl(0 78% 55%)",     // crimson
  "hsl(140 65% 38%)",   // forest green
  "hsl(38 92% 52%)",    // amber
  "hsl(280 65% 55%)",   // violet
  "hsl(195 85% 45%)",   // teal
  "hsl(20 85% 55%)",    // burnt orange
  "hsl(330 70% 55%)",   // rose
  "hsl(160 60% 35%)",   // emerald
  "hsl(245 60% 60%)",   // indigo
];

// ───────────────────────  CONFIG → LABEL HELPERS  ────────────────────────

const METHOD_OPTIONS: { value: SensitivityMethod; label: string; family: "local" | "global"; help: string }[] = [
  { value: "oat",   label: "One-at-a-time (OAT)",         family: "local",  help: "Vary each parameter ±δ around its baseline." },
  { value: "nsi",   label: "Normalized Sensitivity Index", family: "local",  help: "Dimensionless local index + time-resolved profile." },
  { value: "lhs",   label: "Latin Hypercube + PRCC",       family: "global", help: "Global rank-based correlation across the joint range." },
  { value: "sobol", label: "Sobol (variance-based)",       family: "global", help: "First & total-order variance contribution (Saltelli)." },
];

const METRIC_OPTIONS: { value: OutputMetric; label: string; help: string }[] = [
  { value: "peak",          label: "Peak prevalence",            help: "Maximum value of the target compartment(s)." },
  { value: "peak_time",     label: "Time to peak",               help: "Time at which the peak is reached." },
  { value: "final",         label: "Final value (t = end)",      help: "Value at the end of the simulation window." },
  { value: "cumulative",    label: "Cumulative burden (∫ y dt)", help: "Trapezoidal integral over the time window." },
  { value: "incidence_at",  label: "Value at chosen time",       help: "Value at a specific time-point of interest." },
  { value: "endemic",       label: "Endemic equilibrium (tail)", help: "Mean over the last 10% of the time window." },
  { value: "r0_proxy",      label: "R₀ proxy (initial growth)",  help: "Initial exponential growth rate of the target." },
];

interface Props {
  modelName?: string;
  equations: string[];
  parameters: { name: string; value: number }[];
  initialValues: { name: string; value: number }[];
  compartments: string[];
  timeConfig: { start: number; end: number; step: number };
}

// ─────────────────────────────  COMPONENT  ──────────────────────────────

export function SensitivityWorkspace(props: Props) {
  const { equations, parameters, initialValues, compartments, timeConfig } = props;

  const [method, setMethod] = useState<SensitivityMethod>("nsi");
  const [metric, setMetric] = useState<OutputMetric>("peak");
  const [metricTime, setMetricTime] = useState<number>(
    Math.round(((timeConfig.end + timeConfig.start) / 2) * 10) / 10,
  );
  const [windowStart, setWindowStart] = useState<number>(timeConfig.start);
  const [windowEnd, setWindowEnd] = useState<number>(timeConfig.end);
  const [targets, setTargets] = useState<string[]>(() =>
    compartments.length ? [compartments[Math.min(1, compartments.length - 1)]] : [],
  );
  const [samples, setSamples] = useState<number>(200);
  const [perturbation, setPerturbation] = useState<number>(0.1);

  // Per-parameter selection + ranges (default ±50% around baseline for non-zero,
  // and [0, 1] for zero baselines so the user can immediately tune them).
  const [paramState, setParamState] = useState<Record<string, { selected: boolean; lower: number; upper: number }>>(
    () =>
      Object.fromEntries(
        parameters.map((p) => {
          const baseAbs = Math.abs(p.value);
          const span = baseAbs > 0 ? baseAbs * 0.5 : 1;
          return [p.name, { selected: false, lower: Math.max(0, p.value - span), upper: p.value + span }];
        }),
      ),
  );

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SensitivityResult | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  const selectedParams: ParamRange[] = useMemo(
    () =>
      parameters
        .filter((p) => paramState[p.name]?.selected)
        .map((p) => ({
          name: p.name,
          baseline: p.value,
          lower: paramState[p.name].lower,
          upper: paramState[p.name].upper,
        })),
    [parameters, paramState],
  );

  const cfg: SensitivityConfig = useMemo(
    () => ({
      method,
      targets,
      metric,
      metricTime,
      windowStart,
      windowEnd,
      params: selectedParams,
      samples,
      perturbation,
    }),
    [method, targets, metric, metricTime, windowStart, windowEnd, selectedParams, samples, perturbation],
  );

  const budget = useMemo(() => estimateBudget(cfg), [cfg]);

  // ─────────────────  RUN  ─────────────────
  const handleRun = async () => {
    if (selectedParams.length === 0) {
      toast({
        title: "No parameters selected",
        description: "Tick at least one parameter and confirm its variation range.",
        variant: "destructive",
      });
      return;
    }
    if (targets.length === 0) {
      toast({
        title: "No target output",
        description: "Select at least one target compartment.",
        variant: "destructive",
      });
      return;
    }
    setRunning(true);
    // Yield to the browser so the spinner paints before heavy work
    await new Promise((r) => setTimeout(r, 30));
    try {
      const model: ModelSpec = {
        equations,
        baseParameters: Object.fromEntries(parameters.map((p) => [p.name, p.value])),
        initialValues: Object.fromEntries(initialValues.map((iv) => [iv.name, iv.value])),
        compartments,
        timeConfig,
      };
      const t0 = performance.now();
      const res = runSensitivity(model, cfg);
      const ms = Math.round(performance.now() - t0);
      setResult(res);
      toast({
        title: "Sensitivity analysis complete",
        description: `${METHOD_OPTIONS.find((m) => m.value === res.method)?.label} • ${res.rows.length} parameters • ${ms} ms`,
      });
    } catch (err: any) {
      toast({ title: "Sensitivity failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  // ─────────────────  EXPORTS  ─────────────────
  const exportCSV = () => {
    if (!result) return;
    const header = ["Parameter", "Baseline", "Lower", "Upper", "Index", "Total Index", "Direction", "Rank", "p-value", "Output Δ%", "Method"];
    const rows = result.rows.map((r) => [
      r.parameter,
      r.baseline,
      r.range[0],
      r.range[1],
      r.index.toFixed(6),
      r.totalIndex !== undefined ? r.totalIndex.toFixed(6) : "",
      r.direction,
      r.rank,
      r.pValue !== undefined ? r.pValue.toExponential(2) : "",
      r.outputDelta !== undefined ? r.outputDelta.toFixed(3) : "",
      r.method.toUpperCase(),
    ]);
    const csv = [header, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    triggerDownload(new Blob([csv], { type: "text/csv" }), `sensitivity_${result.method}_${stamp()}.csv`);
  };

  const exportXLSX = () => {
    if (!result) return;
    const wb = XLSX.utils.book_new();
    const main = result.rows.map((r) => ({
      Parameter: r.parameter,
      Baseline: r.baseline,
      Lower: r.range[0],
      Upper: r.range[1],
      "Sensitivity Index": Number(r.index.toFixed(6)),
      "Total-Order (Sobol)": r.totalIndex !== undefined ? Number(r.totalIndex.toFixed(6)) : "",
      Direction: r.direction,
      Rank: r.rank,
      "p-value": r.pValue !== undefined ? Number(r.pValue.toExponential(3)) : "",
      "Output Δ%": r.outputDelta !== undefined ? Number(r.outputDelta.toFixed(3)) : "",
      Method: r.method.toUpperCase(),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(main), "Sensitivity");

    const meta = [
      ["Method", METHOD_OPTIONS.find((m) => m.value === result.method)?.label ?? result.method],
      ["Metric", METRIC_OPTIONS.find((m) => m.value === result.metric)?.label ?? result.metric],
      ["Targets", result.targets.join(", ")],
      ["Baseline output", result.baselineOutput],
      ["Computed at", new Date(result.computedAt).toISOString()],
      ["Sample count", result.sampleCount ?? ""],
      ["Warnings", result.warnings.join("; ")],
      ["Interpretation", result.interpretation],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), "Run Info");

    if (result.timeProfile?.length) {
      const tp = result.timeProfile.map((p) => ({ t: p.t, ...p.values }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tp), "Time Profile");
    }
    if (result.samples?.length) {
      const sm = result.samples.map((s) => ({ ...s.params, output: s.output }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sm), "Raw Samples");
    }
    XLSX.writeFile(wb, `sensitivity_${result.method}_${stamp()}.xlsx`);
  };

  const exportPNG = async () => {
    if (!plotRef.current || !result) return;
    const canvas = await html2canvas(plotRef.current, { backgroundColor: "#ffffff", scale: 2 });
    canvas.toBlob((blob) => {
      if (!blob) return;
      triggerDownload(blob, `sensitivity_plot_${result.method}_${stamp()}.png`);
    });
  };

  const exportPDF = async () => {
    if (!plotRef.current || !result) return;
    const canvas = await html2canvas(plotRef.current, { backgroundColor: "#ffffff", scale: 2 });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    pdf.setFontSize(18);
    pdf.text("Sensitivity Analysis Report", 40, 50);
    pdf.setFontSize(11);
    pdf.setTextColor(80);
    pdf.text(
      `${METHOD_OPTIONS.find((m) => m.value === result.method)?.label}  •  Metric: ${METRIC_OPTIONS.find((m) => m.value === result.metric)?.label}  •  Targets: ${result.targets.join(", ")}`,
      40, 70,
    );
    pdf.text(`Generated: ${new Date(result.computedAt).toLocaleString()}`, 40, 86);

    const ratio = canvas.width / canvas.height;
    const imgW = pageW - 80;
    const imgH = imgW / ratio;
    pdf.addImage(img, "PNG", 40, 100, imgW, Math.min(imgH, pageH - 220));

    pdf.addPage();
    pdf.setFontSize(14);
    pdf.text("Interpretation", 40, 50);
    pdf.setFontSize(10);
    pdf.setTextColor(40);
    const split = pdf.splitTextToSize(result.interpretation.replace(/\*\*/g, ""), pageW - 80);
    pdf.text(split, 40, 70);

    let y = 70 + split.length * 14 + 20;
    pdf.setFontSize(14);
    pdf.text("Ranked Parameters", 40, y);
    y += 10;
    pdf.setFontSize(9);
    const headers = ["Rank", "Parameter", "Baseline", "Range", "Index", result.method === "sobol" ? "Sᴛ" : "p-value", "Dir"];
    const widths = [40, 110, 70, 130, 80, 80, 40];
    let x = 40; y += 14;
    headers.forEach((h, i) => { pdf.text(h, x, y); x += widths[i]; });
    y += 4; pdf.line(40, y, pageW - 40, y); y += 12;
    for (const r of result.rows) {
      if (y > pageH - 40) { pdf.addPage(); y = 40; }
      x = 40;
      const cells = [
        String(r.rank),
        r.parameter,
        r.baseline.toPrecision(4),
        `${r.range[0].toPrecision(3)} – ${r.range[1].toPrecision(3)}`,
        r.index.toFixed(4),
        result.method === "sobol" ? (r.totalIndex ?? 0).toFixed(4) : r.pValue !== undefined ? r.pValue.toExponential(2) : "—",
        r.direction,
      ];
      cells.forEach((c, i) => { pdf.text(c, x, y); x += widths[i]; });
      y += 14;
    }
    pdf.save(`sensitivity_report_${result.method}_${stamp()}.pdf`);
  };

  const exportJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    triggerDownload(blob, `sensitivity_raw_${result.method}_${stamp()}.json`);
  };

  // ─────────────────  RENDER  ─────────────────

  return (
    <div className="space-y-6">
      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Sparkles className="h-5 w-5 text-primary" />
                Sensitivity Lab
              </CardTitle>
              <CardDescription>
                Local & global sensitivity analysis for the active model — runs entirely in-browser.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              {parameters.length} params • {compartments.length} compartments
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* CONFIGURATOR */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Method + Metric */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5" /> Analysis method
                </Label>
                <Select value={method} onValueChange={(v) => setMethod(v as SensitivityMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Local</div>
                    {METHOD_OPTIONS.filter((m) => m.family === "local").map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                    <Separator className="my-1" />
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Global</div>
                    {METHOD_OPTIONS.filter((m) => m.family === "global").map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{METHOD_OPTIONS.find((m) => m.value === method)?.help}</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Gauge className="h-3.5 w-3.5" /> Output metric
                </Label>
                <Select value={metric} onValueChange={(v) => setMetric(v as OutputMetric)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METRIC_OPTIONS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{METRIC_OPTIONS.find((m) => m.value === metric)?.help}</p>
              </div>
            </div>

            {/* Time window + metric time */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Timer className="h-3.5 w-3.5" /> Window start
                </Label>
                <Input type="number" value={windowStart} step={timeConfig.step}
                  onChange={(e) => setWindowStart(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Timer className="h-3.5 w-3.5" /> Window end
                </Label>
                <Input type="number" value={windowEnd} step={timeConfig.step}
                  onChange={(e) => setWindowEnd(Number(e.target.value))} />
              </div>
              {metric === "incidence_at" && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <TargetIcon className="h-3.5 w-3.5" /> Time-point
                  </Label>
                  <Input type="number" value={metricTime} step={timeConfig.step}
                    onChange={(e) => setMetricTime(Number(e.target.value))} />
                </div>
              )}
            </div>

            {/* Targets */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <TargetIcon className="h-3.5 w-3.5" /> Target output(s) — summed if multiple
              </Label>
              <div className="flex flex-wrap gap-2">
                {compartments.map((c) => {
                  const sel = targets.includes(c);
                  return (
                    <Button
                      key={c}
                      type="button"
                      size="sm"
                      variant={sel ? "default" : "outline"}
                      className="font-mono text-xs"
                      onClick={() =>
                        setTargets((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
                      }
                    >
                      {c}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Sampling controls (global methods) */}
            {(method === "lhs" || method === "sobol") && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Samples (N)</Label>
                  <Input type="number" min={16} max={600} value={samples}
                    onChange={(e) => setSamples(Math.max(16, Number(e.target.value)))} />
                  <p className="text-xs text-muted-foreground">
                    {method === "sobol" ? `Sobol uses N·(2+k) total simulations.` : `LHS uses exactly N simulations.`}
                  </p>
                </div>
              </div>
            )}
            {(method === "oat" || method === "nsi") && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Perturbation (± fraction of baseline)</Label>
                  <Input type="number" min={0.001} max={0.5} step={0.01} value={perturbation}
                    onChange={(e) => setPerturbation(Math.max(0.001, Number(e.target.value)))} />
                </div>
              </div>
            )}

            {/* Parameter table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5" /> Parameters & variation ranges
                </Label>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() =>
                    setParamState((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { ...v, selected: true }])))
                  }>Select all</Button>
                  <Button size="sm" variant="ghost" onClick={() =>
                    setParamState((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { ...v, selected: false }])))
                  }>Clear</Button>
                </div>
              </div>
              <ScrollArea className="h-[280px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">✓</TableHead>
                      <TableHead>Parameter</TableHead>
                      <TableHead className="text-right">Baseline</TableHead>
                      <TableHead>Lower</TableHead>
                      <TableHead>Upper</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parameters.map((p) => {
                      const ps = paramState[p.name];
                      const fixed = ps.upper - ps.lower <= 0;
                      return (
                        <TableRow key={p.name}>
                          <TableCell>
                            <Checkbox
                              checked={ps.selected}
                              onCheckedChange={(v) =>
                                setParamState((s) => ({ ...s, [p.name]: { ...s[p.name], selected: !!v } }))
                              }
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {p.name}
                            {fixed && ps.selected && (
                              <span className="ml-2 text-[10px] text-destructive">fixed — set a range</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {p.value}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="h-8 text-xs"
                              value={ps.lower}
                              onChange={(e) =>
                                setParamState((s) => ({ ...s, [p.name]: { ...s[p.name], lower: Number(e.target.value) } }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="h-8 text-xs"
                              value={ps.upper}
                              onChange={(e) =>
                                setParamState((s) => ({ ...s, [p.name]: { ...s[p.name], upper: Number(e.target.value) } }))
                              }
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        {/* RUN PANEL */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PlayCircle className="h-4 w-4" /> Run analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Family</span>
                <Badge variant={METHOD_OPTIONS.find((m) => m.value === method)?.family === "global" ? "default" : "secondary"}>
                  {METHOD_OPTIONS.find((m) => m.value === method)?.family}
                </Badge>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Parameters</span>
                <span className="font-mono">{selectedParams.length}</span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Targets</span>
                <span className="font-mono">{targets.length}</span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Simulations</span>
                <span className="font-mono">{budget.simulations}</span>
              </div>
            </div>
            {budget.warning && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">{budget.warning}</AlertDescription>
              </Alert>
            )}
            <Button onClick={handleRun} disabled={running} className="w-full" size="lg">
              {running ? (<><Loader2 className="h-4 w-4 animate-spin" /> Running…</>) : (<><Zap className="h-4 w-4" /> Run sensitivity</>)}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* RESULTS */}
      {result && (
        <ResultsPanel
          result={result}
          modelName={props.modelName}
          plotRef={plotRef}
          onCSV={exportCSV} onXLSX={exportXLSX} onPNG={exportPNG} onPDF={exportPDF} onJSON={exportJSON}
        />
      )}
    </div>
  );
}

// ──────────────────────────  RESULTS PANEL  ─────────────────────────────

function ResultsPanel({
  result, modelName, plotRef,
  onCSV, onXLSX, onPNG, onPDF, onJSON,
}: {
  result: SensitivityResult;
  modelName?: string;
  plotRef: React.RefObject<HTMLDivElement>;
  onCSV: () => void;
  onXLSX: () => void;
  onPNG: () => void;
  onPDF: () => void;
  onJSON: () => void;
}) {
  const isGlobal = result.method === "lhs" || result.method === "sobol";
  const isLHS = result.method === "lhs";

  // ───── Tornado filter state ─────
  const [topN, setTopN] = useState<number>(Math.min(10, result.rows.length));
  const [pMax, setPMax] = useState<number>(1);              // 1 = no filter
  const [onlySignificant, setOnlySignificant] = useState(false);

  // Reset filter state when a new result lands
  useEffect(() => {
    setTopN(Math.min(10, result.rows.length));
    setPMax(1);
    setOnlySignificant(false);
  }, [result]);

  // ───── Chart-only export refs ─────
  const tornadoChartRef = useRef<HTMLDivElement>(null);
  const [busyExport, setBusyExport] = useState<"png" | "svg" | null>(null);
  const [busySync, setBusySync] = useState(false);

  // ───── Sheets sync dialog state ─────
  const [sheetsOpen, setSheetsOpen] = useState(false);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [sheetTab, setSheetTab] = useState("Sensitivity_Data");

  // Filter the rows shown on the Tornado chart (does not mutate raw result)
  const filteredRows = useMemo(() => {
    let rows = [...result.rows];
    if (isLHS && onlySignificant) {
      rows = rows.filter((r) => r.pValue !== undefined && r.pValue < 0.05);
    }
    if (isLHS && pMax < 1) {
      rows = rows.filter((r) => r.pValue === undefined || r.pValue <= pMax);
    }
    rows.sort((a, b) => Math.abs(b.index) - Math.abs(a.index));
    return rows.slice(0, Math.max(1, topN));
  }, [result.rows, isLHS, onlySignificant, pMax, topN]);

  // ─────  Chart-only PNG export  ─────
  const exportTornadoPNG = async () => {
    if (!tornadoChartRef.current) return;
    setBusyExport("png");
    try {
      const canvas = await html2canvas(tornadoChartRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });
      canvas.toBlob((blob) => {
        if (blob) triggerDownload(blob, `tornado_${result.method}_${stamp()}.png`);
      });
    } catch (err: any) {
      toast({ title: "PNG export failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setBusyExport(null);
    }
  };

  // ─────  Chart-only SVG export (vector — perfect for reports)  ─────
  const exportTornadoSVG = () => {
    if (!tornadoChartRef.current) return;
    setBusyExport("svg");
    try {
      const svgEl = tornadoChartRef.current.querySelector("svg");
      if (!svgEl) throw new Error("Chart SVG not found");
      const cloned = svgEl.cloneNode(true) as SVGSVGElement;
      // Ensure standalone SVG (set explicit width/height + xmlns)
      const rect = svgEl.getBoundingClientRect();
      cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      cloned.setAttribute("width", String(rect.width));
      cloned.setAttribute("height", String(rect.height));
      // Resolve CSS variables to literal HSL values so SVG renders standalone
      inlineComputedStyles(svgEl, cloned);
      // Add a white background so it prints nicely
      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("width", "100%");
      bg.setAttribute("height", "100%");
      bg.setAttribute("fill", "#ffffff");
      cloned.insertBefore(bg, cloned.firstChild);

      const serialized = new XMLSerializer().serializeToString(cloned);
      const svgString = `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`;
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      triggerDownload(blob, `tornado_${result.method}_${stamp()}.svg`);
    } catch (err: any) {
      toast({ title: "SVG export failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setBusyExport(null);
    }
  };

  // ─────  One-click Google Sheets sync  ─────
  const handleSheetsSync = async () => {
    const id = extractSpreadsheetId(spreadsheetUrl);
    if (!id) {
      toast({
        title: "Invalid spreadsheet URL",
        description: "Paste the full Google Sheets URL or just the spreadsheet ID.",
        variant: "destructive",
      });
      return;
    }
    setBusySync(true);
    try {
      const payload = {
        modelName: modelName || "",
        method: result.method,
        metric: result.metric,
        targets: result.targets,
        baselineOutput: result.baselineOutput,
        sampleCount: result.sampleCount,
        warnings: result.warnings,
        interpretation: result.interpretation,
        // Send the FILTERED rows so Looker mirrors what the user sees on screen
        rows: filteredRows.map((r) => ({
          parameter: r.parameter,
          baseline: r.baseline,
          lowerRange: r.range[0],
          upperRange: r.range[1],
          index: r.index,
          totalIndex: r.totalIndex,
          direction: r.direction,
          rank: r.rank,
          pValue: r.pValue,
          outputDelta: r.outputDelta,
        })),
      };

      const { data, error } = await supabase.functions.invoke("sync-google-sheets", {
        body: {
          action: "sync_sensitivity",
          spreadsheetId: id,
          sheetName: sheetTab || "Sensitivity_Data",
          payload,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Synced to Google Sheets",
        description: `${data?.rows ?? filteredRows.length} rows pushed. Looker Studio dashboards will refresh on their next pull.`,
      });
      setSheetsOpen(false);
    } catch (err: any) {
      toast({
        title: "Sync failed",
        description: err?.message ?? "Unable to write to the spreadsheet. Check that your service account has Editor access.",
        variant: "destructive",
      });
    } finally {
      setBusySync(false);
    }
  };

  const sigCount = isLHS ? result.rows.filter((r) => r.pValue !== undefined && r.pValue < 0.05).length : 0;

  return (
    <div className="space-y-6">
      {/* Headline */}
      <Card className="border-primary/40 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="p-3 rounded-xl bg-primary/15">
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-[260px]">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <Badge variant="default">{isGlobal ? "Global analysis" : "Local analysis"}</Badge>
                <Badge variant="outline">{result.method.toUpperCase()}</Badge>
                <Badge variant="secondary">Metric: {result.metric}</Badge>
                <Badge variant="outline">Targets: {result.targets.join(", ")}</Badge>
                {result.sampleCount && <Badge variant="outline">N = {result.sampleCount}</Badge>}
              </div>
              <p className="text-sm leading-relaxed">{result.interpretation.replace(/\*\*/g, "")}</p>
              {result.warnings.length > 0 && (
                <div className="mt-3 space-y-1">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={onCSV}><FileSpreadsheet className="h-4 w-4" />CSV</Button>
              <Button size="sm" variant="outline" onClick={onXLSX}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
              <Button size="sm" variant="outline" onClick={onPNG}><FileImage className="h-4 w-4" />Report PNG</Button>
              <Button size="sm" variant="outline" onClick={onPDF}><FileText className="h-4 w-4" />PDF</Button>
              <Button size="sm" variant="outline" onClick={onJSON}><Download className="h-4 w-4" />JSON</Button>
              <Button size="sm" variant="default" onClick={() => setSheetsOpen(true)}>
                <SheetIcon className="h-4 w-4" /> Sync to Sheets
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PLOTS */}
      <div ref={plotRef} className="space-y-6 bg-background p-4 rounded-lg">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  {result.method === "sobol" ? "Sobol indices (first-order vs total-order)"
                    : isLHS ? "PRCC ranking — Tornado"
                    : "Tornado plot — normalized sensitivities"}
                </CardTitle>
                <CardDescription>
                  {isGlobal ? "Global ranking across the joint parameter range." : "Local sensitivity at the baseline."}
                  {" "}
                  Showing <span className="font-mono text-foreground">{filteredRows.length}</span> of{" "}
                  <span className="font-mono text-foreground">{result.rows.length}</span> parameters.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm" variant="outline"
                  onClick={exportTornadoPNG}
                  disabled={busyExport !== null}
                  aria-label="Download tornado chart as PNG image"
                >
                  {busyExport === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}
                  Chart PNG
                </Button>
                <Button
                  size="sm" variant="outline"
                  onClick={exportTornadoSVG}
                  disabled={busyExport !== null}
                  aria-label="Download tornado chart as scalable vector SVG"
                >
                  {busyExport === "svg" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                  Chart SVG
                </Button>
              </div>
            </div>

            {/* ───── FILTER CONTROLS ─────  */}
            {result.method !== "sobol" && (
              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_auto] items-end rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="topn-slider" className="flex items-center gap-2 text-xs font-medium">
                      <Filter className="h-3.5 w-3.5" /> Top N parameters
                    </Label>
                    <span className="text-xs font-mono text-muted-foreground">
                      {topN} / {result.rows.length}
                    </span>
                  </div>
                  <Slider
                    id="topn-slider"
                    min={1}
                    max={Math.max(1, result.rows.length)}
                    step={1}
                    value={[topN]}
                    onValueChange={(v) => setTopN(v[0])}
                    aria-label="Top N parameters to display"
                  />
                </div>

                <div className={`space-y-2 ${isLHS ? "" : "opacity-50 pointer-events-none"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="pmax-slider" className="flex items-center gap-2 text-xs font-medium">
                      <Activity className="h-3.5 w-3.5" /> Max p-value
                      {!isLHS && <span className="text-[10px] text-muted-foreground">(LHS only)</span>}
                    </Label>
                    <span className="text-xs font-mono text-muted-foreground">
                      ≤ {pMax.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    id="pmax-slider"
                    min={0.01}
                    max={1}
                    step={0.01}
                    value={[pMax]}
                    onValueChange={(v) => setPMax(v[0])}
                    aria-label="Maximum p-value threshold"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label className={`text-xs font-medium flex items-center gap-2 ${isLHS ? "" : "opacity-50"}`}>
                    Significant only
                    {isLHS && <Badge variant="outline" className="text-[10px] h-4">{sigCount} sig.</Badge>}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={onlySignificant}
                      onCheckedChange={setOnlySignificant}
                      disabled={!isLHS}
                      aria-label="Show only statistically significant parameters (p < 0.05)"
                    />
                    <span className="text-xs text-muted-foreground">p &lt; 0.05</span>
                  </div>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div ref={tornadoChartRef} className="bg-background">
              <SensitivityPlot result={result} filteredRows={filteredRows} />
            </div>
          </CardContent>
        </Card>

        {result.timeProfile && result.timeProfile.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" /> Normalized sensitivity through time
              </CardTitle>
              <CardDescription>How each parameter's local influence evolves over the simulation window.</CardDescription>
            </CardHeader>
            <CardContent>
              <TimeProfilePlot result={result} />
            </CardContent>
          </Card>
        )}

        {result.method === "lhs" && result.samples && result.samples.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ChevronRight className="h-4 w-4" /> Top driver — scatter vs output
              </CardTitle>
              <CardDescription>
                Each point is one Latin Hypercube sample; colour reflects the output metric.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LHSScatter result={result} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* TABLE */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sensitivity table</CardTitle>
          <CardDescription>
            {result.rows.length} parameter{result.rows.length === 1 ? "" : "s"} ranked by absolute index.
            {result.method === "sobol" && " Sobol Sᴛ − S₁ flags interaction effects."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[420px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Rank</TableHead>
                  <TableHead>Parameter</TableHead>
                  <TableHead className="text-right">Baseline</TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead className="text-right">{result.method === "sobol" ? "S₁" : "Index"}</TableHead>
                  {result.method === "sobol" && <TableHead className="text-right">Sᴛ</TableHead>}
                  {result.method === "lhs" && <TableHead className="text-right">p-value</TableHead>}
                  <TableHead>Direction</TableHead>
                  <TableHead>Method</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => (
                  <TableRow key={r.parameter}>
                    <TableCell className="font-mono text-xs">{r.rank}</TableCell>
                    <TableCell className="font-mono">{r.parameter}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.baseline.toPrecision(4)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.range[0].toPrecision(3)} – {r.range[1].toPrecision(3)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <Badge variant={Math.abs(r.index) > 0.5 ? "destructive" : Math.abs(r.index) > 0.2 ? "default" : "secondary"}>
                        {r.index.toFixed(4)}
                      </Badge>
                    </TableCell>
                    {result.method === "sobol" && (
                      <TableCell className="text-right font-mono">{(r.totalIndex ?? 0).toFixed(4)}</TableCell>
                    )}
                    {result.method === "lhs" && (
                      <TableCell className="text-right font-mono text-xs">
                        {r.pValue !== undefined ? r.pValue.toExponential(2) : "—"}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant="outline" className={r.direction === "+" ? "border-emerald-500 text-emerald-600" : r.direction === "−" ? "border-red-500 text-red-600" : ""}>
                        {r.direction === "+" ? "↑ increases" : r.direction === "−" ? "↓ decreases" : "≈ none"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.method.toUpperCase()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* GOOGLE SHEETS SYNC DIALOG */}
      <Dialog open={sheetsOpen} onOpenChange={setSheetsOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SheetIcon className="h-5 w-5 text-primary" />
              Sync to Google Sheets → Looker Studio
            </DialogTitle>
            <DialogDescription>
              Pushes the currently-filtered tornado data into your spreadsheet. Looker Studio dashboards
              connected to that sheet will refresh on their next pull.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sheet-url">Spreadsheet URL or ID</Label>
              <Input
                id="sheet-url"
                placeholder="https://docs.google.com/spreadsheets/d/…"
                value={spreadsheetUrl}
                onChange={(e) => setSpreadsheetUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Make sure the service account has <strong>Editor</strong> access to this sheet.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sheet-tab">Target tab name</Label>
              <Input
                id="sheet-tab"
                value={sheetTab}
                onChange={(e) => setSheetTab(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A second tab <code className="font-mono">Sensitivity_Run_Info</code> will also be written
                with run metadata.
              </p>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Rows to sync</span><span className="font-mono">{filteredRows.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span className="font-mono">{result.method.toUpperCase()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Metric</span><span className="font-mono">{result.metric}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSheetsOpen(false)} disabled={busySync}>Cancel</Button>
            <Button onClick={handleSheetsSync} disabled={busySync || !spreadsheetUrl.trim()}>
              {busySync ? <><Loader2 className="h-4 w-4 animate-spin" /> Syncing…</> : <><SheetIcon className="h-4 w-4" /> Sync now</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────  PLOTS  ──────────────────────────────────

function SensitivityPlot({
  result,
  filteredRows,
}: {
  result: SensitivityResult;
  filteredRows?: SensitivityResult["rows"];
}) {
  // Sobol gets its own grouped chart (always non-negative variance fractions)
  if (result.method === "sobol") {
    const sobolData = [...result.rows]
      .sort((a, b) => (b.totalIndex ?? b.index) - (a.totalIndex ?? a.index))
      .map((r) => ({
        parameter: r.parameter,
        first: Number(r.index.toFixed(4)),
        total: r.totalIndex !== undefined ? Number(r.totalIndex.toFixed(4)) : 0,
      }));
    const sobolHeight = Math.max(360, sobolData.length * 44 + 80);
    return (
      <div style={{ height: sobolHeight }}>
        <ResponsiveContainer>
          <BarChart
            data={sobolData}
            layout="vertical"
            margin={{ left: 110, right: 60, top: 16, bottom: 30 }}
            barGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 1]}
              tickFormatter={(v) => v.toFixed(2)}
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              label={{ value: "Variance contribution", position: "insideBottom", offset: -10, fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="parameter"
              tick={{ fontSize: 12, fill: "hsl(var(--foreground))", fontFamily: "monospace" }}
              width={100}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--background))",
                fontSize: 12,
              }}
              formatter={(v: number) => v.toFixed(4)}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="rect" />
            <Bar dataKey="first" name="First-order S₁" fill={PALETTE[0]} radius={[0, 4, 4, 0]} />
            <Bar dataKey="total" name="Total-order Sᴛ" fill={PALETTE[4]} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ─────────────  TORNADO (OAT / NSI / PRCC)  ─────────────
  // Sort by |index| descending so the widest bar sits on top, like a tornado.
  const sorted = [...result.rows].sort((a, b) => Math.abs(b.index) - Math.abs(a.index));
  const tornadoData = sorted.map((r) => ({
    parameter: r.parameter,
    index: Number(r.index.toFixed(4)),
    abs: Math.abs(r.index),
    baseline: r.baseline,
    range: r.range,
    pValue: r.pValue,
    direction: r.direction,
  }));

  // Symmetric x-domain so positive & negative sides mirror perfectly.
  const maxAbs = Math.max(0.001, ...tornadoData.map((d) => d.abs));
  const padded = maxAbs * 1.18;
  const domain: [number, number] = [-padded, padded];

  const POS = "hsl(217 91% 55%)"; // increases output
  const NEG = "hsl(0 78% 55%)";   // decreases output

  // Per-row height keeps thick, readable bars regardless of param count.
  const rowH = 36;
  const chartH = Math.max(360, tornadoData.length * rowH + 90);

  const isPRCC = result.method === "lhs";
  const xLabel = isPRCC ? "Partial Rank Correlation Coefficient (PRCC)" : "Normalized sensitivity index";

  // Custom in-bar value label
  const ValueLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    if (value === undefined || value === null) return null;
    const v = Number(value);
    const onRight = v >= 0;
    const tx = onRight ? x + width + 6 : x - 6;
    const anchor = onRight ? "start" : "end";
    return (
      <text
        x={tx}
        y={y + height / 2}
        dy={4}
        fontSize={11}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight={600}
        textAnchor={anchor}
        fill="hsl(var(--foreground))"
      >
        {v >= 0 ? "+" : ""}{v.toFixed(3)}
      </text>
    );
  };

  return (
    <div style={{ height: chartH }}>
      <ResponsiveContainer>
        <BarChart
          data={tornadoData}
          layout="vertical"
          margin={{ left: 130, right: 70, top: 16, bottom: 36 }}
          barCategoryGap={6}
        >
          <defs>
            <linearGradient id="tornado-pos" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={POS} stopOpacity={0.55} />
              <stop offset="100%" stopColor={POS} stopOpacity={1} />
            </linearGradient>
            <linearGradient id="tornado-neg" x1="1" y1="0" x2="0" y2="0">
              <stop offset="0%" stopColor={NEG} stopOpacity={0.55} />
              <stop offset="100%" stopColor={NEG} stopOpacity={1} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />

          <XAxis
            type="number"
            domain={domain}
            tickFormatter={(v) => Number(v).toFixed(2)}
            stroke="hsl(var(--muted-foreground))"
            tick={{ fontSize: 11 }}
            tickCount={9}
            label={{
              value: xLabel,
              position: "insideBottom",
              offset: -14,
              fill: "hsl(var(--muted-foreground))",
              fontSize: 12,
            }}
          />

          <YAxis
            type="category"
            dataKey="parameter"
            tick={{ fontSize: 12, fill: "hsl(var(--foreground))", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            width={120}
            interval={0}
          />

          <ReferenceLine x={0} stroke="hsl(var(--foreground))" strokeWidth={1.5} />

          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--background))",
              fontSize: 12,
              padding: "8px 10px",
              boxShadow: "0 6px 24px -8px hsl(var(--foreground) / 0.25)",
            }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as typeof tornadoData[number];
              const sign = d.index >= 0 ? "+" : "";
              return (
                <div className="space-y-1">
                  <div className="font-mono font-semibold text-foreground">{d.parameter}</div>
                  <div className="text-muted-foreground">
                    Baseline: <span className="font-mono text-foreground">{d.baseline.toPrecision(4)}</span>
                  </div>
                  <div className="text-muted-foreground">
                    Range: <span className="font-mono text-foreground">{d.range[0].toPrecision(3)} – {d.range[1].toPrecision(3)}</span>
                  </div>
                  <div className="pt-1 border-t border-border/50">
                    <span className="text-muted-foreground">{isPRCC ? "PRCC" : "Index"}: </span>
                    <span
                      className="font-mono font-semibold"
                      style={{ color: d.index >= 0 ? POS : NEG }}
                    >
                      {sign}{d.index.toFixed(4)}
                    </span>
                  </div>
                  {d.pValue !== undefined && (
                    <div className="text-xs text-muted-foreground">
                      p-value: <span className="font-mono">{d.pValue.toExponential(2)}</span>
                      {d.pValue < 0.05 && <span className="ml-1 text-emerald-600">significant</span>}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Effect on output: <span className="text-foreground">{d.direction === "+" ? "↑ increases" : d.direction === "−" ? "↓ decreases" : "≈ none"}</span>
                  </div>
                </div>
              );
            }}
          />

          <Bar
            dataKey="index"
            radius={[3, 3, 3, 3]}
            name={isPRCC ? "PRCC" : "Sensitivity index"}
            isAnimationActive
            animationDuration={650}
            label={<ValueLabel />}
          >
            {tornadoData.map((d, i) => (
              <Cell
                key={i}
                fill={d.index >= 0 ? "url(#tornado-pos)" : "url(#tornado-neg)"}
                stroke={d.index >= 0 ? POS : NEG}
                strokeWidth={1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Custom legend strip */}
      <div className="mt-2 flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: POS }} />
          Positive — increases output
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: NEG }} />
          Negative — decreases output
        </div>
        <div className="hidden sm:block">
          Sorted by |{isPRCC ? "PRCC" : "index"}| • larger bar = stronger driver
        </div>
      </div>
    </div>
  );
}

function TimeProfilePlot({ result }: { result: SensitivityResult }) {
  if (!result.timeProfile) return null;
  const params = result.rows.map((r) => r.parameter);
  const data = result.timeProfile.map((p) => {
    const row: Record<string, number> = { t: Number(p.t.toFixed(3)) };
    params.forEach((name) => { row[name] = Number((p.values[name] ?? 0).toFixed(4)); });
    return row;
  });
  return (
    <div className="h-[360px]">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="t" stroke="hsl(var(--foreground))" label={{ value: "time", position: "insideBottom", offset: -5 }} />
          <YAxis stroke="hsl(var(--foreground))" label={{ value: "NSI", angle: -90, position: "insideLeft" }} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
          <Legend />
          <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={1} />
          {params.slice(0, PALETTE.length).map((p, i) => (
            <Line key={p} type="monotone" dataKey={p} stroke={PALETTE[i % PALETTE.length]} dot={false} strokeWidth={2} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LHSScatter({ result }: { result: SensitivityResult }) {
  if (!result.samples || result.rows.length === 0) return null;
  const top = result.rows[0].parameter;
  const data = result.samples.map((s) => ({ x: s.params[top], y: s.output }));
  return (
    <div className="h-[340px]">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 30, bottom: 30, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" dataKey="x" name={top} stroke="hsl(var(--foreground))"
            label={{ value: top, position: "insideBottom", offset: -10 }} />
          <YAxis type="number" dataKey="y" name="Output" stroke="hsl(var(--foreground))"
            label={{ value: "metric", angle: -90, position: "insideLeft" }} />
          <ZAxis range={[40, 120]} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
          <Scatter data={data} fill={PALETTE[2]} fillOpacity={0.7} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ──────────────────────────────  UTILS  ─────────────────────────────────

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
