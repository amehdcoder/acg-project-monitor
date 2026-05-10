import { useMemo, useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, BarChart, Bar,
} from "recharts";
import {
  FlaskConical, Play, Sparkles, Target, Users, Snowflake, Calendar, Lightbulb,
} from "lucide-react";
import {
  isSEITFLoaded,
  isSEITRFLoaded,
  runNeverTreatedSweep,
  runAdherenceCoverageGrid,
  runExposureHeterogeneitySweep,
  runOptimalCombinationGrid,
  runSnailDynamicsComparison,
  type MDAProgram,
  type NeverTreatedRun,
  type AdherenceCell,
  type ExposureRun,
  type OptimalCombo,
  type SnailRun,
  type SEITFPreset,
} from "@/lib/mathModeling/researchInsights";
import { useEffect } from "react";

interface Props {
  compartments: string[];
  parameters: { name: string; value: number }[];
  initialValues: { name: string; value: number }[];
  /** Optional AI-interpretation hook: callMathModel("interpret_simulation", payload) */
  callMathModel?: (action: string, payload?: any) => Promise<any>;
  /** SEITF/SEITRF preset definition (equations + defaults) */
  preset: SEITFPreset;
  /** When this nonce changes, the tab automatically runs all 5 analyses. */
  autoRunNonce?: number;
}

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#9333ea", "#dc2626", "#0891b2", "#ca8a04"];

const yieldToBrowser = () => new Promise<void>((r) => setTimeout(r, 0));

const fmtYears = (y: number) => (isFinite(y) ? `${y.toFixed(1)} y` : "Not reached");

const ResearchInsightsTab = ({
  compartments, parameters, initialValues, callMathModel, preset, autoRunNonce,
}: Props) => {
  const seitfLoaded = useMemo(
    () => isSEITFLoaded(compartments) || isSEITRFLoaded(compartments),
    [compartments],
  );

  const [horizonYears, setHorizonYears] = useState(6);
  const [coverage, setCoverage] = useState(0.8);
  const [roundsPerYear, setRoundsPerYear] = useState(1);
  const [adherence, setAdherence] = useState(0.1);
  const [progress, setProgress] = useState<{ active: boolean; pct: number; label: string }>({
    active: false, pct: 0, label: "",
  });

  const [neverRuns, setNeverRuns] = useState<NeverTreatedRun[] | null>(null);
  const [grid, setGrid] = useState<AdherenceCell[] | null>(null);
  const [exposure, setExposure] = useState<ExposureRun[] | null>(null);
  const [optimal, setOptimal] = useState<OptimalCombo[] | null>(null);
  const [snail, setSnail] = useState<SnailRun[] | null>(null);
  const [aiInsights, setAiInsights] = useState<Record<string, string>>({});

  // Build a live preset from the user's current parameter overrides
  const livePreset: SEITFPreset = useMemo(() => ({
    equations: preset.equations,
    parameters: { ...preset.parameters, ...Object.fromEntries(parameters.map(p => [p.name, p.value])) },
    initialValues: { ...preset.initialValues, ...Object.fromEntries(initialValues.map(v => [v.name, v.value])) },
    compartments: preset.compartments,
  }), [preset, parameters, initialValues]);

  const baseProgram: MDAProgram = {
    startYear: 0,
    coverage,
    roundsPerYear,
    totalRounds: Math.ceil(horizonYears * roundsPerYear),
    systematicNonAdherence: adherence,
    target: "sac-only",
  };

  // ───────── Runners ─────────
  const wrap = async <T,>(label: string, fn: () => T): Promise<T> => {
    setProgress({ active: true, pct: 5, label });
    await yieldToBrowser();
    try {
      const out = fn();
      setProgress({ active: true, pct: 100, label });
      await yieldToBrowser();
      return out;
    } finally {
      setTimeout(() => setProgress({ active: false, pct: 0, label: "" }), 200);
    }
  };

  const runQ1 = async () => {
    const r = await wrap("Q1 — Never-treated sub-population", () =>
      runNeverTreatedSweep(livePreset, baseProgram, { horizonYears, stepDays: 1 }),
    );
    setNeverRuns(r);
  };

  const runQ2 = async () => {
    const r = await wrap("Q2 — Adherence × Coverage × Frequency grid", () =>
      runAdherenceCoverageGrid(livePreset, { horizonYears, stepDays: 2 }),
    );
    setGrid(r);
  };

  const runQ3 = async () => {
    const r = await wrap("Q3 — Exposure heterogeneity (children vs adults)", () =>
      runExposureHeterogeneitySweep(livePreset, baseProgram, { horizonYears, stepDays: 1 }),
    );
    setExposure(r);
  };

  const runQ4 = async () => {
    const r = await wrap("Q4 — Optimal combination heatmap", () =>
      runOptimalCombinationGrid(livePreset, { horizonYears, stepDays: 2 }),
    );
    setOptimal(r);
  };

  const runQ5 = async () => {
    const r = await wrap("Q5 — Snail / environmental dynamics", () =>
      runSnailDynamicsComparison(livePreset, baseProgram, { horizonYears, stepDays: 1 }),
    );
    setSnail(r);
  };

  const runAll = async () => {
    await runQ1(); await runQ3(); await runQ5(); await runQ2(); await runQ4();
    toast({ title: "All research analyses complete." });
  };

  const explainWithAI = async (key: string, summary: any) => {
    if (!callMathModel) return;
    try {
      setAiInsights((p) => ({ ...p, [key]: "…" }));
      const res = await callMathModel("interpret_simulation", { simulationSummary: summary });
      const text = res?.insights || res?.interpretation || res?.summary || JSON.stringify(res).slice(0, 500);
      setAiInsights((p) => ({ ...p, [key]: typeof text === "string" ? text : JSON.stringify(text) }));
    } catch (e: any) {
      setAiInsights((p) => ({ ...p, [key]: `AI interpretation unavailable: ${e?.message ?? "error"}` }));
    }
  };

  // ───────── Empty state ─────────
  if (!seitfLoaded) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" /> Research Insights
          </CardTitle>
          <CardDescription>
            Targeted simulations that answer the five schistosomiasis research questions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Load the <strong>SEITF Model (NTD)</strong> preset from <em>Quick Start</em> to unlock
            never-treated, adherence, exposure-heterogeneity, optimal-combination, and snail/environment analyses.
          </div>
        </CardContent>
      </Card>
    );
  }

  // ───────── Q4 heatmap renderer ─────────
  const renderHeatmap = (cells: OptimalCombo[]) => {
    const adherenceLevels = Array.from(new Set(cells.map((c) => c.systematicNonAdherence))).sort();
    const coverages = Array.from(new Set(cells.map((c) => c.coverage))).sort();
    const freqs = Array.from(new Set(cells.map((c) => c.roundsPerYear))).sort();
    return (
      <div className="space-y-4">
        {adherenceLevels.map((adh) => (
          <div key={adh}>
            <div className="text-xs font-semibold text-muted-foreground mb-1">
              Systematic non-adherence: {(adh * 100).toFixed(0)}%
            </div>
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left">Coverage \\ Freq</th>
                    {freqs.map((f) => <th key={f} className="px-2 py-1">{f}/yr</th>)}
                  </tr>
                </thead>
                <tbody>
                  {coverages.map((cov) => (
                    <tr key={cov}>
                      <td className="px-2 py-1 font-medium">{(cov * 100).toFixed(0)}%</td>
                      {freqs.map((f) => {
                        const cell = cells.find((c) =>
                          c.coverage === cov && c.roundsPerYear === f && c.systematicNonAdherence === adh);
                        if (!cell) return <td key={f} className="px-2 py-1 text-muted-foreground">—</td>;
                        const bg = cell.passes
                          ? `hsl(142 76% ${Math.min(85, 60 + (horizonYears - cell.yearsToTarget) * 4)}%)`
                          : "hsl(0 84% 92%)";
                        return (
                          <td key={f} className="px-2 py-1 text-center font-mono"
                              style={{ background: bg, minWidth: 64 }}>
                            {cell.passes ? `${cell.yearsToTarget.toFixed(1)}y` : "✗"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <p className="text-[10px] text-muted-foreground">
          Green cells reach SAC prevalence &lt;1% within the horizon (lighter = sooner). Red = does not reach target.
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* ───────── Toolbar ───────── */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-5 w-5 text-primary" /> Research Insights · SEITF Schistosomiasis
          </CardTitle>
          <CardDescription>
            Targeted simulation sweeps that answer the five research questions. All runs are local
            (no AI credits used) unless you click "Generate AI interpretation".
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Horizon (years)</Label>
              <Input type="number" min={1} max={30} value={horizonYears}
                     onChange={(e) => setHorizonYears(Math.max(1, Math.min(30, +e.target.value || 6)))} />
            </div>
            <div>
              <Label className="text-xs">Coverage</Label>
              <Input type="number" step="0.05" min={0} max={1} value={coverage}
                     onChange={(e) => setCoverage(Math.max(0, Math.min(1, +e.target.value || 0)))} />
            </div>
            <div>
              <Label className="text-xs">Rounds / yr</Label>
              <Input type="number" min={1} max={4} value={roundsPerYear}
                     onChange={(e) => setRoundsPerYear(Math.max(1, Math.min(4, +e.target.value || 1)))} />
            </div>
            <div>
              <Label className="text-xs">Systematic non-adherence</Label>
              <Input type="number" step="0.05" min={0} max={1} value={adherence}
                     onChange={(e) => setAdherence(Math.max(0, Math.min(1, +e.target.value || 0)))} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={runAll} disabled={progress.active} className="gap-2">
              <Play className="h-4 w-4" /> Run all analyses
            </Button>
            <Button variant="outline" size="sm" onClick={runQ1} disabled={progress.active}>Q1</Button>
            <Button variant="outline" size="sm" onClick={runQ2} disabled={progress.active}>Q2</Button>
            <Button variant="outline" size="sm" onClick={runQ3} disabled={progress.active}>Q3</Button>
            <Button variant="outline" size="sm" onClick={runQ4} disabled={progress.active}>Q4</Button>
            <Button variant="outline" size="sm" onClick={runQ5} disabled={progress.active}>Q5</Button>
          </div>
          {progress.active && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">{progress.label}</div>
              <Progress value={progress.pct} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ───────── Q1 ───────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Q1 · Never-treated sub-population
          </CardTitle>
          <CardDescription>
            How does a permanently untreated reservoir affect long-term SAC prevalence and time to elimination?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!neverRuns ? (
            <p className="text-xs text-muted-foreground">Click Q1 or "Run all analyses".</p>
          ) : (
            <>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart margin={{ top: 5, right: 90, bottom: 25, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="t" type="number" domain={[0, horizonYears]}
                           label={{ value: "Years", position: "insideBottom", offset: -5 }}
                           allowDuplicatedCategory={false} />
                    <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`}
                           label={{ value: "SAC prevalence", angle: -90, position: "insideLeft" }} />
                    <Tooltip formatter={(v: any) => `${(+v).toFixed(2)}%`} />
                    <Legend />
                    {neverRuns.map((run, i) => (
                      <Line key={run.fractionPct} data={run.series} dataKey="sacPrev"
                            name={`Never-treated ${run.fractionPct}%`} type="monotone"
                            stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {neverRuns.map((r, i) => (
                  <div key={r.fractionPct} className="rounded-md border p-2 text-xs"
                       style={{ borderLeft: `3px solid ${COLORS[i % COLORS.length]}` }}>
                    <div className="font-semibold">{r.fractionPct}% never-treated</div>
                    <div className="text-muted-foreground">Final: {r.finalSacPrev.toFixed(2)}%</div>
                    <div className="text-muted-foreground">To &lt;1%: {fmtYears(r.yearsToTarget)}</div>
                  </div>
                ))}
              </div>
              {callMathModel && (
                <Button variant="ghost" size="sm" className="gap-2"
                        onClick={() => explainWithAI("q1", neverRuns.map(r => ({
                          fraction: r.fractionPct, final: r.finalSacPrev, yearsToTarget: r.yearsToTarget,
                        })))}>
                  <Sparkles className="h-3 w-3" /> Generate AI interpretation
                </Button>
              )}
              {aiInsights.q1 && <p className="text-xs italic text-muted-foreground border-l-2 border-primary/40 pl-3">{aiInsights.q1}</p>}
            </>
          )}
        </CardContent>
      </Card>

      {/* ───────── Q2 ───────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-primary" />
            Q2 · Systematic non-adherence × coverage × frequency
          </CardTitle>
          <CardDescription>Years required for SAC prevalence to fall below 1%.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!grid ? (
            <p className="text-xs text-muted-foreground">Click Q2 or "Run all analyses".</p>
          ) : (
            <>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={grid.map((c) => ({
                    label: `${(c.coverage * 100).toFixed(0)}%·${c.roundsPerYear}/y·adh${(c.systematicNonAdherence * 100).toFixed(0)}`,
                    years: isFinite(c.yearsToTarget) ? +c.yearsToTarget.toFixed(2) : horizonYears + 1,
                    capped: !isFinite(c.yearsToTarget),
                  }))} margin={{ top: 5, right: 10, bottom: 80, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" angle={-45} textAnchor="end" interval={0} height={90} fontSize={9} />
                    <YAxis label={{ value: "Years to <1%", angle: -90, position: "insideLeft" }} />
                    <Tooltip />
                    <Bar dataKey="years" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {callMathModel && (
                <Button variant="ghost" size="sm" className="gap-2"
                        onClick={() => explainWithAI("q2", grid.slice(0, 20))}>
                  <Sparkles className="h-3 w-3" /> Generate AI interpretation
                </Button>
              )}
              {aiInsights.q2 && <p className="text-xs italic text-muted-foreground border-l-2 border-primary/40 pl-3">{aiInsights.q2}</p>}
            </>
          )}
        </CardContent>
      </Card>

      {/* ───────── Q3 ───────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Q3 · Exposure heterogeneity (children vs adults)
          </CardTitle>
          <CardDescription>
            β<sub>SAC</sub> : β<sub>adult</sub> contact ratios under SAC-only vs community-wide MDA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!exposure ? (
            <p className="text-xs text-muted-foreground">Click Q3 or "Run all analyses".</p>
          ) : (
            <>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart margin={{ top: 5, right: 90, bottom: 25, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="t" type="number" domain={[0, horizonYears]}
                           label={{ value: "Years", position: "insideBottom", offset: -5 }} />
                    <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`}
                           label={{ value: "SAC prevalence", angle: -90, position: "insideLeft" }} />
                    <Tooltip formatter={(v: any) => `${(+v).toFixed(2)}%`} />
                    <Legend />
                    {exposure.map((run, i) => (
                      <Line key={`${run.ratio}-${run.target}`} data={run.series} dataKey="sacPrev"
                            name={`β-ratio ${run.ratio} · ${run.target}`} type="monotone"
                            stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false}
                            strokeDasharray={run.target === "community" ? "4 2" : undefined} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {exposure.map((r, i) => (
                  <div key={`${r.ratio}-${r.target}`} className="rounded-md border p-2 text-xs"
                       style={{ borderLeft: `3px solid ${COLORS[i % COLORS.length]}` }}>
                    <div className="font-semibold">β-ratio {r.ratio} · {r.target}</div>
                    <div className="text-muted-foreground">Final SAC: {r.finalSacPrev.toFixed(2)}%</div>
                    <div className="text-muted-foreground">Adult inf: {r.finalAdultInf.toFixed(0)}</div>
                  </div>
                ))}
              </div>
              {callMathModel && (
                <Button variant="ghost" size="sm" className="gap-2"
                        onClick={() => explainWithAI("q3", exposure.map(r => ({
                          ratio: r.ratio, target: r.target, finalSAC: r.finalSacPrev, finalAdult: r.finalAdultInf,
                        })))}>
                  <Sparkles className="h-3 w-3" /> Generate AI interpretation
                </Button>
              )}
              {aiInsights.q3 && <p className="text-xs italic text-muted-foreground border-l-2 border-primary/40 pl-3">{aiInsights.q3}</p>}
            </>
          )}
        </CardContent>
      </Card>

      {/* ───────── Q4 ───────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" />
            Q4 · Optimal combination to reach &lt;1% SAC by horizon
          </CardTitle>
          <CardDescription>Coverage × frequency heatmap stratified by systematic non-adherence.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!optimal ? (
            <p className="text-xs text-muted-foreground">Click Q4 or "Run all analyses".</p>
          ) : (
            <>
              {renderHeatmap(optimal)}
              <Separator />
              <div className="text-xs">
                <div className="font-semibold mb-1">Cheapest passing programs (fewest total rounds):</div>
                <ul className="space-y-1">
                  {optimal
                    .filter((c) => c.passes)
                    .sort((a, b) => a.totalRoundsNeeded - b.totalRoundsNeeded)
                    .slice(0, 5)
                    .map((c, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Badge variant="secondary">{c.totalRoundsNeeded} rounds</Badge>
                        <span>
                          {(c.coverage * 100).toFixed(0)}% coverage · {c.roundsPerYear}/yr · adherence loss{" "}
                          {(c.systematicNonAdherence * 100).toFixed(0)}% → reaches &lt;1% in{" "}
                          {c.yearsToTarget.toFixed(1)} y
                        </span>
                      </li>
                    ))}
                  {optimal.every((c) => !c.passes) && (
                    <li className="text-muted-foreground">No tested combination reaches &lt;1% within {horizonYears} years.</li>
                  )}
                </ul>
              </div>
              {callMathModel && (
                <Button variant="ghost" size="sm" className="gap-2"
                        onClick={() => explainWithAI("q4", optimal)}>
                  <Sparkles className="h-3 w-3" /> Generate AI interpretation
                </Button>
              )}
              {aiInsights.q4 && <p className="text-xs italic text-muted-foreground border-l-2 border-primary/40 pl-3">{aiInsights.q4}</p>}
            </>
          )}
        </CardContent>
      </Card>

      {/* ───────── Q5 ───────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Snowflake className="h-4 w-4 text-primary" />
            Q5 · Snail dynamics & seasonality
          </CardTitle>
          <CardDescription>
            Does explicitly modelling snail (S/E/I<sub>s</sub>) and environment (F<sub>m</sub>, F<sub>c</sub>)
            stages — plus seasonal transmission — change predicted programmatic success?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!snail ? (
            <p className="text-xs text-muted-foreground">Click Q5 or "Run all analyses".</p>
          ) : (
            <>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart margin={{ top: 5, right: 90, bottom: 25, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="t" type="number" domain={[0, horizonYears]}
                           label={{ value: "Years", position: "insideBottom", offset: -5 }} />
                    <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`}
                           label={{ value: "SAC prevalence", angle: -90, position: "insideLeft" }} />
                    <Tooltip formatter={(v: any) => `${(+v).toFixed(2)}%`} />
                    <Legend />
                    {snail.map((run, i) => (
                      <Line key={run.label} data={run.series} dataKey="sacPrev"
                            name={run.label} type="monotone"
                            stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false}
                            strokeDasharray={run.snailDynamics ? undefined : "4 2"} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {snail.map((r, i) => (
                  <div key={r.label} className="rounded-md border p-2 text-xs"
                       style={{ borderLeft: `3px solid ${COLORS[i % COLORS.length]}` }}>
                    <div className="font-semibold">{r.label}</div>
                    <div className="text-muted-foreground">Final SAC: {r.finalSacPrev.toFixed(2)}%</div>
                  </div>
                ))}
              </div>
              {callMathModel && (
                <Button variant="ghost" size="sm" className="gap-2"
                        onClick={() => explainWithAI("q5", snail.map(r => ({
                          label: r.label, snail: r.snailDynamics, seasonality: r.seasonalAmp, final: r.finalSacPrev,
                        })))}>
                  <Sparkles className="h-3 w-3" /> Generate AI interpretation
                </Button>
              )}
              {aiInsights.q5 && <p className="text-xs italic text-muted-foreground border-l-2 border-primary/40 pl-3">{aiInsights.q5}</p>}
            </>
          )}
        </CardContent>
      </Card>

      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
        <Lightbulb className="h-3 w-3" />
        These analyses scale SEITF treatment-rate parameters as a continuous-time MDA proxy
        (rate ≈ baseline × (1 + coverage·adherence·rounds·gain)). Use Setup → Pulse Events for
        explicit pulsed MDA simulations.
      </div>
    </div>
  );
};

export default ResearchInsightsTab;
