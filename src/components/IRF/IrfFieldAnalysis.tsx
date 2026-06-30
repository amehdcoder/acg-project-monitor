import { useMemo, useState } from "react";
import { BarChart3, PieChart as PieIcon, LayoutGrid, TrendingUp, AlertTriangle, Minus, Lightbulb, MapPin } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  Legend, LabelList,
} from "recharts";

import { Card } from "@/components/ui/card";
import {
  analyzeFields, categoricalInsight, numericInsight, cvLabel, CV_MEANING,
  type CategoricalFieldAnalysis, type NumericFieldAnalysis, type FieldInsight,
} from "@/lib/irf/fieldAnalysis";
import type { IrfReport } from "@/lib/irf/definition";


const chartText = "hsl(var(--foreground))";
const chartMuted = "hsl(var(--muted-foreground))";
const chartBorder = "hsl(var(--border))";
const tooltipStyle = { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: chartText, fontSize: 12 };
const fmt = (n: number) => new Intl.NumberFormat().format(Math.round(n || 0));

const toneIcon = { positive: TrendingUp, warning: AlertTriangle, neutral: Minus } as const;
const toneClasses = {
  positive: "border-l-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
  warning: "border-l-amber-500 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  neutral: "border-l-sky-500 bg-sky-500/5 text-sky-700 dark:text-sky-400",
} as const;

/** Acceptance fields read best with semantic colours (green→amber→red). */
function semanticColors(a: CategoricalFieldAnalysis) {
  const map: Record<string, string> = { high: "#16a34a", medium: "#d97706", low: "#dc2626", yes: "#16a34a", no: "#dc2626" };
  return a.data.map((d) => ({ ...d, color: map[d.name.toLowerCase()] ?? d.color }));
}

function InsightStrip({ insight }: { insight: FieldInsight }) {
  const Icon = toneIcon[insight.tone];
  return (
    <div className={`mt-auto flex items-start gap-2 border-l-4 px-3 py-2 text-[11px] leading-snug ${toneClasses[insight.tone]}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <span className="font-medium text-foreground">{insight.text}</span>
        {insight.recommendation && (
          <span className="mt-0.5 flex items-start gap-1 text-muted-foreground">
            <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
            {insight.recommendation}
          </span>
        )}
      </span>
    </div>
  );
}

function CategoricalCard({ a }: { a: CategoricalFieldAnalysis }) {
  const colors = useMemo(() => semanticColors(a), [a]);
  const insight = useMemo(() => categoricalInsight(a), [a]);
  // Category keys (ordered) and their colours for the stacked-by-LGA chart.
  const cats = useMemo(() => colors.map((c) => ({ name: c.name, color: c.color })), [colors]);
  const lgaData = useMemo(
    () =>
      a.byLga.slice(0, 10).map((row) => {
        const o: Record<string, any> = { lga: row.lga };
        for (const c of cats) o[c.name] = row.segments[c.name] || 0;
        return o;
      }),
    [a.byLga, cats],
  );
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="border-b bg-muted/30 px-3 py-2">
        <p className="truncate text-xs font-semibold text-foreground" title={a.label}>{a.label}</p>
        <p className="truncate text-[11px] text-muted-foreground">{a.activity} · {a.answered} responses · {a.byLga.length} LGA{a.byLga.length === 1 ? "" : "s"}</p>
      </div>
      <div className="flex items-center gap-1 px-3 pt-2 text-[10px] text-muted-foreground">
        <MapPin className="h-3 w-3 text-primary" /> Response mix by LGA
      </div>
      <div className="p-2">
        <ResponsiveContainer width="100%" height={Math.max(160, lgaData.length * 26 + 40)}>
          <BarChart data={lgaData} layout="vertical" margin={{ left: 4, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartBorder} opacity={0.5} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: chartMuted }} axisLine={{ stroke: chartBorder }} tickLine={{ stroke: chartBorder }} />
            <YAxis type="category" dataKey="lga" width={96} tick={{ fontSize: 10, fill: chartMuted }} axisLine={{ stroke: chartBorder }} tickLine={{ stroke: chartBorder }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [`${fmt(v)}`, n]} />
            <Legend wrapperStyle={{ fontSize: 10, color: chartText }} />
            {cats.map((c) => (
              <Bar key={c.name} dataKey={c.name} stackId="lga" fill={c.color} radius={[0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <InsightStrip insight={insight} />
    </Card>
  );
}

function NumericCard({ a }: { a: NumericFieldAnalysis }) {
  const insight = useMemo(() => numericInsight(a), [a]);
  const lgaData = useMemo(() => a.byLga.slice(0, 12), [a.byLga]);
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="border-b bg-muted/30 px-3 py-2">
        <p className="truncate text-xs font-semibold text-foreground" title={a.label}>{a.label}</p>
        <p className="truncate text-[11px] text-muted-foreground">{a.activity} · {a.answered} reports · {a.byLga.length} LGA{a.byLga.length === 1 ? "" : "s"}</p>
      </div>
      <div className="grid grid-cols-2 gap-1 px-3 py-2 text-center">
        <div><p className="text-sm font-bold text-foreground">{fmt(a.sum)}</p><p className="text-[10px] text-muted-foreground">Total reported</p></div>
        <div title={CV_MEANING}><p className="text-sm font-bold text-foreground">{a.cv}%</p><p className="text-[10px] text-muted-foreground">Variation (CV)</p></div>
      </div>
      <div className="flex items-center gap-1 px-3 text-[10px] text-muted-foreground">
        <MapPin className="h-3 w-3 text-primary" /> Total by LGA
      </div>
      <div className="px-2 pt-1">
        <ResponsiveContainer width="100%" height={Math.max(140, lgaData.length * 22 + 30)}>
          <BarChart data={lgaData} layout="vertical" margin={{ left: 4, right: 28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartBorder} opacity={0.5} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 9, fill: chartMuted }} axisLine={{ stroke: chartBorder }} tickLine={false} />
            <YAxis type="category" dataKey="lga" width={92} tick={{ fontSize: 9, fill: chartMuted }} axisLine={{ stroke: chartBorder }} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${fmt(v)}`, "Total"]} />
            <Bar dataKey="sum" fill="#0b5394" radius={[0, 3, 3, 0]}>
              <LabelList dataKey="sum" position="right" formatter={(v: any) => fmt(v)} style={{ fontSize: 9, fill: chartMuted }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="px-3 pb-1 pt-1 text-[10px] leading-snug text-muted-foreground">
        Spread: {cvLabel(a.cv)}.
      </div>
      <InsightStrip insight={insight} />
    </Card>
  );
}


export default function IrfFieldAnalysis({ rows }: { rows: IrfReport[] }) {
  const { categorical, numeric } = useMemo(() => analyzeFields(rows), [rows]);
  const [tab, setTab] = useState<"all" | "categorical" | "numeric">("all");

  // Roll the most actionable per-field insights up to the top of the panel.
  const keyInsights = useMemo(() => {
    const items: { label: string; insight: FieldInsight }[] = [
      ...numeric.map((a) => ({ label: a.label, insight: numericInsight(a) })),
      ...categorical.map((a) => ({ label: a.label, insight: categoricalInsight(a) })),
    ];
    const rank = { warning: 0, positive: 1, neutral: 2 } as const;
    return items
      .filter((x) => x.insight.tone !== "neutral" || x.insight.recommendation)
      .sort((a, b) => rank[a.insight.tone] - rank[b.insight.tone])
      .slice(0, 4);
  }, [categorical, numeric]);

  if (!categorical.length && !numeric.length) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        <LayoutGrid className="mx-auto mb-2 h-7 w-7 opacity-40" />
        No structured field responses captured yet.
      </Card>
    );
  }

  const showCat = tab === "all" || tab === "categorical";
  const showNum = tab === "all" || tab === "numeric";

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b bg-gradient-to-r from-[#0b5394]/10 to-[#1f9e89]/10 p-4">
        <BarChart3 className="h-4 w-4 text-primary" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Field-by-Field Response Analysis (LGA-wise)</h3>
          <p className="text-[11px] text-muted-foreground">{numeric.length} quantitative · {categorical.length} categorical indicators broken down by LGA with decision insights</p>
        </div>

        <div className="ml-auto flex items-center gap-1 rounded-lg bg-muted p-0.5 text-xs">
          {(["all", "categorical", "numeric"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-md px-2.5 py-1 capitalize transition-colors ${tab === t ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "categorical" ? "Distributions" : t === "numeric" ? "Quantitative" : "All"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-1.5 border-b bg-sky-500/5 px-4 py-2 text-[11px] leading-snug text-muted-foreground">
        <Minus className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" />
        <span>{CV_MEANING}</span>
      </div>





      {/* Top decision insights */}
      {keyInsights.length > 0 && (
        <div className="border-b bg-muted/20 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> What this means for the programme
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {keyInsights.map(({ label, insight }, i) => {
              const Icon = toneIcon[insight.tone];
              return (
                <div key={i} className={`flex items-start gap-2 rounded-lg border-l-4 px-3 py-2 text-xs ${toneClasses[insight.tone]}`}>
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="font-semibold text-foreground">{label}: </span>
                    <span className="text-foreground">{insight.text}</span>
                    {insight.recommendation && <span className="text-muted-foreground"> {insight.recommendation}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-5 p-4">
        {showNum && numeric.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><BarChart3 className="h-3.5 w-3.5" /> Quantitative indicators ({numeric.length})</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {numeric.map((a) => <NumericCard key={a.key} a={a} />)}
            </div>
          </div>
        )}
        {showCat && categorical.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><PieIcon className="h-3.5 w-3.5" /> Response distributions ({categorical.length})</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categorical.map((a) => <CategoricalCard key={a.key} a={a} />)}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
