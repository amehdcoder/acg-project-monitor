import { useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, ComposedChart, Treemap, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, LabelList,
} from "recharts";
import {
  aggregateChart, scorecardValue, scatterPoints, formatNumber,
  DEFAULT_PALETTE, type StudioWidgetConfig, type AggPoint,
} from "@/lib/dashboardStudio/aggregate";
import { TrendingUp } from "lucide-react";

interface Props {
  config: StudioWidgetConfig;
  title: string;
  rows: Record<string, unknown>[];
}

const emptyState = (msg: string) => (
  <div className="flex h-full min-h-[140px] items-center justify-center text-center text-sm text-muted-foreground">
    {msg}
  </div>
);

export default function StudioWidgetRenderer({ config, title, rows }: Props) {
  const palette = config.style?.palette?.length ? config.style.palette : DEFAULT_PALETTE;
  const style = config.style ?? {};
  const type = config.chartType ?? "bar";

  const data = useMemo<AggPoint[]>(() => {
    if (["bar", "column", "line", "area", "pie", "donut", "radar", "combo", "treemap", "table", "pivot"].includes(type)) {
      return aggregateChart(rows, config);
    }
    return [];
  }, [rows, config, type]);

  if (type === "text") {
    return (
      <div className="prose prose-sm max-w-none whitespace-pre-wrap p-2 text-foreground">
        {config.textContent || "Add text in the properties panel."}
      </div>
    );
  }

  if (type === "scorecard" || type === "gauge") {
    const val = scorecardValue(rows, config);
    const target = config.kpiTarget;
    const pct = target ? Math.min(100, (val / target) * 100) : null;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-3">
        <div className="text-3xl font-bold tracking-tight" style={{ color: palette[0] }}>
          {formatNumber(val, style)}
        </div>
        <div className="text-xs text-muted-foreground">{title}</div>
        {pct !== null && (
          <div className="mt-2 w-full max-w-[200px]">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: palette[0] }} />
            </div>
            <div className="mt-1 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <TrendingUp className="h-3 w-3" /> {pct.toFixed(0)}% of target ({formatNumber(target!, style)})
            </div>
          </div>
        )}
      </div>
    );
  }

  if (data.length === 0 && type !== "scatter") {
    return emptyState("No data — pick a data source and fields in the properties panel.");
  }

  const tip = (
    <Tooltip
      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
      formatter={(v: number) => formatNumber(Number(v), style)}
    />
  );
  const legend = style.showLegend !== false ? <Legend verticalAlign={style.legendPosition === "top" ? "top" : "bottom"} wrapperStyle={{ fontSize: 11 }} /> : null;
  const grid = style.showGrid !== false ? <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /> : null;

  if (type === "table" || type === "pivot") {
    return (
      <div className="max-h-full overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">{config.dimension || "Group"}</th>
              <th className="px-3 py-2 text-right font-semibold">{config.aggregation || "count"}{config.metric ? ` · ${config.metric}` : ""}</th>
              {config.secondaryMetric && <th className="px-3 py-2 text-right font-semibold">{config.secondaryMetric}</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i} className="border-b border-border/60 hover:bg-muted/30">
                <td className="px-3 py-1.5">{d.name}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(d.value, style)}</td>
                {config.secondaryMetric && <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(d.value2 ?? 0, style)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={160}>
      {type === "bar" || type === "column" ? (
        <BarChart data={data} layout={type === "bar" ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
          {grid}
          {type === "bar" ? <><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} /></>
            : <><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /></>}
          {tip}{legend}
          <Bar dataKey="value" radius={[4, 4, 0, 0]} stackId={style.stacked ? "a" : undefined}>
            {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
            {style.showDataLabels && <LabelList dataKey="value" position="top" style={{ fontSize: 10 }} />}
          </Bar>
          {config.secondaryMetric && <Bar dataKey="value2" fill={palette[1]} radius={[4, 4, 0, 0]} stackId={style.stacked ? "a" : undefined} />}
        </BarChart>
      ) : type === "line" ? (
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
          {grid}<XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />{tip}{legend}
          <Line type={style.smooth ? "monotone" : "linear"} dataKey="value" stroke={palette[0]} strokeWidth={2} dot={false} />
          {config.secondaryMetric && <Line type={style.smooth ? "monotone" : "linear"} dataKey="value2" stroke={palette[1]} strokeWidth={2} dot={false} />}
        </LineChart>
      ) : type === "area" ? (
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
          {grid}<XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />{tip}{legend}
          <Area type={style.smooth ? "monotone" : "linear"} dataKey="value" stroke={palette[0]} fill={palette[0]} fillOpacity={0.25} />
        </AreaChart>
      ) : type === "pie" || type === "donut" ? (
        <PieChart>
          {tip}{legend}
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
            innerRadius={type === "donut" || style.donut ? "55%" : 0} outerRadius="80%"
            label={style.showDataLabels ? (e: any) => e.name : undefined}>
            {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
          </Pie>
        </PieChart>
      ) : type === "radar" ? (
        <RadarChart data={data}>
          <PolarGrid /><PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} /><PolarRadiusAxis />{tip}{legend}
          <Radar dataKey="value" stroke={palette[0]} fill={palette[0]} fillOpacity={0.4} />
        </RadarChart>
      ) : type === "combo" ? (
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
          {grid}<XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />{tip}{legend}
          <Bar dataKey="value" fill={palette[0]} radius={[4, 4, 0, 0]} />
          <Line type="monotone" dataKey={config.secondaryMetric ? "value2" : "value"} stroke={palette[1]} strokeWidth={2} dot={false} />
        </ComposedChart>
      ) : type === "scatter" ? (
        <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
          {grid}
          <XAxis type="number" dataKey="x" name={config.metric} tick={{ fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name={config.compareField} tick={{ fontSize: 11 }} />
          {tip}{legend}
          <Scatter data={scatterPoints(rows, config)} fill={palette[0]} />
        </ScatterChart>
      ) : type === "treemap" ? (
        <Treemap data={data.map((d, i) => ({ name: d.name, size: d.value, fill: palette[i % palette.length] }))}
          dataKey="size" nameKey="name" stroke="#fff">
          {tip}
        </Treemap>
      ) : (
        <div />
      )}
    </ResponsiveContainer>
  );
}
