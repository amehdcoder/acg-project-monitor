/**
 * Scenario Builder — compare projected MDA completion timelines under
 * different medicine-offer rates and hypothetical status distributions,
 * with side-by-side 95% confidence bands.
 *
 * Every scenario re-runs the same weighted least-squares velocity model used
 * for the live forecast, so the comparison is methodologically identical:
 * only the behavioural inputs (offered rate, halted/not-started share,
 * completed share) change.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import {
  Bar, BarChart, CartesianGrid, ErrorBar, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { FlaskConical, Plus, RotateCcw, Trash2, TrendingUp } from "lucide-react";
import { forecastCompletion, pct, type CoveragePoint } from "@/lib/isc/predictiveModels";

interface Scenario {
  id: string;
  name: string;
  color: string;
  offeredRate: number;
  haltedShare: number;
  completedShare: number;
}

const PALETTE = [
  "hsl(215,60%,45%)",
  "hsl(160,55%,35%)",
  "hsl(265,50%,48%)",
  "hsl(28,80%,48%)",
  "hsl(340,55%,48%)",
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

interface Props {
  points: CoveragePoint[];
  target: number | null;
  baseline: { offeredRate: number; haltedShare: number; completedShare: number };
}

export default function ChecklistScenarioBuilder({ points, target, baseline }: Props) {
  const makeDefault = (): Scenario[] => [
    {
      id: "optimistic",
      name: "Improved offer coverage",
      color: PALETTE[1],
      offeredRate: clamp01(baseline.offeredRate + 0.15),
      haltedShare: clamp01(baseline.haltedShare - 0.1),
      completedShare: clamp01(baseline.completedShare + 0.1),
    },
    {
      id: "pessimistic",
      name: "Stock-out / stalled teams",
      color: PALETTE[3],
      offeredRate: clamp01(baseline.offeredRate - 0.2),
      haltedShare: clamp01(baseline.haltedShare + 0.2),
      completedShare: clamp01(baseline.completedShare - 0.1),
    },
  ];

  const [scenarios, setScenarios] = useState<Scenario[]>(makeDefault);

  const update = (id: string, patch: Partial<Scenario>) =>
    setScenarios((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const addScenario = () =>
    setScenarios((s) => [
      ...s,
      {
        id: `sc-${Date.now().toString(36)}`,
        name: `Scenario ${s.length + 1}`,
        color: PALETTE[(s.length + 1) % PALETTE.length],
        offeredRate: baseline.offeredRate,
        haltedShare: baseline.haltedShare,
        completedShare: baseline.completedShare,
      },
    ]);

  const results = useMemo(() => {
    const all: { scenario: Scenario; forecast: ReturnType<typeof forecastCompletion> }[] = [];
    const base: Scenario = {
      id: "baseline", name: "Baseline (observed)", color: PALETTE[0], ...baseline,
    };
    for (const sc of [base, ...scenarios]) {
      all.push({
        scenario: sc,
        forecast: forecastCompletion({
          points,
          target,
          offeredRate: sc.offeredRate,
          haltedShare: sc.haltedShare,
          completedShare: sc.completedShare,
        }),
      });
    }
    return all;
  }, [scenarios, baseline, points, target]);

  const chartData = useMemo(
    () =>
      results
        .filter((r) => r.forecast)
        .map(({ scenario, forecast }) => ({
          name: scenario.name,
          days: forecast!.days,
          // ErrorBar takes [below, above] offsets from the value.
          err: [
            Math.max(0, forecast!.days - forecast!.daysLow),
            Math.max(0, forecast!.daysHigh - forecast!.days),
          ] as [number, number],
          fill: scenario.color,
          date: forecast!.date,
        })),
    [results],
  );

  const baselineDays = results[0]?.forecast?.days ?? null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3 px-4 border-b bg-muted/40 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" /> Scenario Builder — Completion Timeline
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setScenarios(makeDefault())}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={addScenario}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Scenario
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {chartData.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
            Not enough coverage history (or no community target set) to run scenario forecasts.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 52)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} unit="d" />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number) => [`${Number(v).toLocaleString()} days`, "Projected completion"]}
                labelFormatter={(l: string) => {
                  const row = chartData.find((c) => c.name === l);
                  return row ? `${l} — ${row.date}` : l;
                }}
              />
              <Bar dataKey="days" radius={[0, 4, 4, 0]} maxBarSize={26}
                   fill="hsl(215,60%,45%)"
                   // per-row colour
                   shape={(props: any) => (
                     <rect x={props.x} y={props.y} width={props.width} height={props.height}
                           rx={4} fill={props.payload.fill} />
                   )}>
                <ErrorBar dataKey="err" width={5} strokeWidth={1.5} stroke="hsl(215,25%,35%)" direction="x" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Controls */}
        <div className="grid gap-3 lg:grid-cols-2">
          {scenarios.map((sc) => {
            const res = results.find((r) => r.scenario.id === sc.id)?.forecast;
            const delta = res && baselineDays != null ? res.days - baselineDays : null;
            return (
              <div key={sc.id} className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ background: sc.color }} />
                  <Input
                    value={sc.name}
                    onChange={(e) => update(sc.id, { name: e.target.value })}
                    className="h-7 text-xs font-medium"
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                          onClick={() => setScenarios((s) => s.filter((x) => x.id !== sc.id))}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>

                {([
                  ["Medicines offered", "offeredRate"],
                  ["Halted / not started", "haltedShare"],
                  ["Completed", "completedShare"],
                ] as const).map(([label, key]) => (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-semibold tabular-nums">{pct(sc[key])}</span>
                    </div>
                    <Slider
                      value={[Math.round(sc[key] * 100)]}
                      onValueChange={([v]) => update(sc.id, { [key]: clamp01(v / 100) } as Partial<Scenario>)}
                      min={0} max={100} step={1}
                    />
                  </div>
                ))}

                <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-[11px]">
                  {res ? (
                    <>
                      <Badge variant="secondary" className="text-[10px]">
                        {res.days.toLocaleString()} days · {res.date}
                      </Badge>
                      <span className="text-muted-foreground">
                        95% CI {res.daysLow}–{res.daysHigh} d
                      </span>
                      {delta != null && (
                        <span className={`inline-flex items-center gap-1 font-semibold ${delta <= 0 ? "text-emerald-600" : "text-destructive"}`}>
                          <TrendingUp className="h-3 w-3" />
                          {delta <= 0 ? `${Math.abs(delta)} d faster` : `${delta} d slower`}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Insufficient data for this scenario.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Each scenario re-estimates velocity from the observed cumulative coverage curve and
          re-applies the performance adjustment
          <span className="font-mono"> (0.55 + 0.45 × offered) × (1 − 0.35 × halted)</span>,
          so differences between bars are attributable solely to the behavioural assumptions above.
        </p>
      </CardContent>
    </Card>
  );
}
