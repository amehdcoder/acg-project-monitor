import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, ReferenceLine, LabelList,
} from "recharts";
import { Loader2, Table2, Maximize2, FileText, AlertCircle } from "lucide-react";
import { Analytics, DHIS2_COLORS, dataDims, fmt, nameOf, pivot } from "./dhis2Pivot";
import { dhis2Call } from "./dhis2Api";
import Dhis2NigeriaMap from "./Dhis2NigeriaMap";

export type DashItem = { id: string; type: string; x: number; y: number; w: number; h: number; text: string | null; ref: { id: string; name: string; vizType: string | null } | null };
export type VizResult = {
  viz: { id: string; name: string; type: string; showData?: boolean; hideLegend?: boolean; targetLine?: number | null; baseLine?: number | null };
  layout: { columns: { dimension: string }[]; rows: { dimension: string }[]; filters: { dimension: string; items: string[] }[] };
  analytics: Analytics | null; note?: string;
};

const cache = new Map<string, Promise<VizResult>>();
export function loadViz(connId: string, item: DashItem) {
  const key = `${connId}:${item.ref!.id}`;
  if (!cache.has(key)) {
    const p = dhis2Call<VizResult>({ action: "dash_viz", connection_id: connId, viz_id: item.ref!.id, kind: item.type });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key)!;
}
export const clearVizCache = () => cache.clear();

const wrapCategory = (value: string, maxChars = 18) => {
  const words = String(value).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  for (const word of words) {
    const current = lines[lines.length - 1];
    if (!current || (current.length + word.length + 1 > maxChars && lines.length < 2)) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  if (lines.length > 2) lines.splice(1, lines.length - 1, lines.slice(1).join(" "));
  if ((lines[1]?.length ?? 0) > maxChars + 5) lines[1] = `${lines[1].slice(0, maxChars + 4)}…`;
  return lines.slice(0, 2);
};

function CategoryTick({ x, y, payload, width = 100, horizontal = false }: any) {
  const maxChars = horizontal ? Math.max(12, Math.floor(width / 6.3)) : 16;
  const lines = wrapCategory(String(payload?.value ?? ""), maxChars);
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={horizontal ? -8 : 0} y={horizontal ? 0 : 9} textAnchor={horizontal ? "end" : "middle"} dominantBaseline={horizontal ? "central" : undefined}
        className="fill-muted-foreground" fontSize={10} fontWeight={500}>
        {lines.map((line, i) => <tspan key={i} x={horizontal ? -8 : 0} dy={i ? 12 : 0}>{line}</tspan>)}
      </text>
    </g>
  );
}

function ValueLabel({ x, y, width, height, value, horizontal = false }: any) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const nx = Number(x); const ny = Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  const nw = Number(width); const nh = Number(height);
  const tx = horizontal ? nx + (Number.isFinite(nw) ? nw : 0) + 7 : nx + (Number.isFinite(nw) ? nw : 0) / 2;
  const ty = horizontal ? ny + (Number.isFinite(nh) ? nh : 0) / 2 : Math.max(10, ny - 7);
  return (
    <text x={tx} y={ty} textAnchor={horizontal ? "start" : "middle"} dominantBaseline={horizontal ? "central" : undefined}
      className="fill-foreground" fontSize={9.5} fontWeight={700}
      style={{ paintOrder: "stroke", stroke: "hsl(var(--card))", strokeWidth: 3, strokeLinejoin: "round" }}>
      {fmt(Number(value))}
    </text>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[160px] max-w-[280px] rounded-md border border-border bg-card px-3 py-2.5 shadow-lg">
      <p className="mb-2 border-b border-border/60 pb-1.5 text-[11px] font-semibold text-foreground">{label || payload[0]?.name}</p>
      <div className="space-y-1.5">
        {payload.filter((entry: any) => entry.value != null).map((entry: any, i: number) => (
          <div key={`${entry.dataKey ?? entry.name}-${i}`} className="flex items-start justify-between gap-4 text-[11px]">
            <span className="flex min-w-0 items-start gap-1.5 text-muted-foreground">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: entry.color ?? entry.fill }} />
              <span className="break-words">{entry.name}</span>
            </span>
            <span className="shrink-0 font-mono font-semibold tabular-nums text-foreground">{fmt(Number(entry.value))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PivotTable({ a, rowDims, colDims, compact }: { a: Analytics; rowDims: string[]; colDims: string[]; compact?: boolean }) {
  const p = useMemo(() => pivot(a, rowDims, colDims), [a, rowDims, colDims]);
  const cell = compact ? "px-2 py-1" : "px-3 py-1.5";
  return (
    <div className="overflow-auto h-full">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10">
          {(colDims.length ? colDims : ["_"]).map((_, level) => (
            <tr key={level}>
              {level === 0 && rowDims.map((d) => <th key={d} rowSpan={Math.max(1, colDims.length)} className={`${cell} border border-border bg-muted text-left font-semibold text-foreground`}>{nameOf(a, d) === d ? { dx: "Data", pe: "Period", ou: "Org unit" }[d] ?? d : nameOf(a, d)}</th>)}
              {p.colKeys.map((k, i) => <th key={i} className={`${cell} border border-border bg-muted text-center font-semibold text-foreground whitespace-nowrap`}>{colDims.length ? nameOf(a, k[level]) : "Value"}</th>)}
              {level === 0 && colDims.length > 0 && <th rowSpan={colDims.length} className={`${cell} border border-border bg-accent text-center font-semibold`}>Total</th>}
            </tr>
          ))}
        </thead>
        <tbody>
          {p.rowKeys.map((r, i) => (
            <tr key={i} className="hover:bg-primary/5">
              {r.map((id, j) => <td key={j} className={`${cell} border border-border bg-muted/40 font-medium text-foreground`}>{nameOf(a, id)}</td>)}
              {p.colKeys.map((c, j) => <td key={j} className={`${cell} border border-border text-right font-mono tabular-nums`}>{fmt(p.cell(r, c))}</td>)}
              {colDims.length > 0 && <td className={`${cell} border border-border bg-accent/40 text-right font-mono font-semibold`}>{fmt(p.rowTotal(r))}</td>}
            </tr>
          ))}
          {rowDims.length > 0 && (
            <tr className="font-semibold">
              <td colSpan={rowDims.length} className={`${cell} border border-border bg-accent`}>Total</td>
              {p.colKeys.map((c, j) => <td key={j} className={`${cell} border border-border bg-accent/40 text-right font-mono`}>{fmt(p.colTotal(c))}</td>)}
              {colDims.length > 0 && <td className={`${cell} border border-border bg-accent text-right font-mono`}>{fmt(p.grand)}</td>}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ChartBody({ r }: { r: VizResult }) {
  const a = r.analytics!;
  const dims = dataDims(a);
  const seriesDim = r.layout.columns[0]?.dimension ?? dims[0];
  const catDim = r.layout.rows[0]?.dimension ?? dims.find((d) => d !== seriesDim) ?? seriesDim;
  const type = (r.viz.type || "COLUMN").toUpperCase();

  if (type === "PIVOT_TABLE" || type === "REPORT_TABLE") {
    return <PivotTable compact a={a} rowDims={r.layout.rows.map((d) => d.dimension).filter((d) => dims.includes(d))} colDims={r.layout.columns.map((d) => d.dimension).filter((d) => dims.includes(d))} />;
  }
  if (type === "MAP") return <Dhis2NigeriaMap analytics={a} />;
  const p = pivot(a, catDim === seriesDim ? [] : [catDim], [seriesDim]);
  const series = p.colKeys.map((k) => ({ key: k[0], name: nameOf(a, k[0]) }));
  const data = (p.rowKeys.length ? p.rowKeys : [[]]).map((rk) => {
    const o: Record<string, any> = { name: rk.length ? nameOf(a, rk[0]) : "Total" };
    for (const s of series) o[s.key] = p.cell(rk, [s.key]);
    return o;
  });
  const tip = <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.45)" }} />;
  const legend = !r.viz.hideLegend && series.length > 1 ? <Legend wrapperStyle={{ fontSize: 11, lineHeight: "20px", paddingTop: 8 }} iconType="square" iconSize={8} /> : null;
  const refs = <>{r.viz.targetLine != null && <ReferenceLine y={r.viz.targetLine} stroke="hsl(var(--destructive))" strokeDasharray="4 3" />}{r.viz.baseLine != null && <ReferenceLine y={r.viz.baseLine} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 3" />}</>;
  const longestCategory = data.reduce((max, d) => Math.max(max, String(d.name).length), 0);
  const categoryAxisWidth = Math.min(190, Math.max(92, longestCategory * 6.2));
  const chartMargins = { top: r.viz.showData ? 34 : 18, right: r.viz.showData ? 48 : 26, bottom: 14, left: 10 };
  const axes = (horizontal = false) => horizontal
    ? <><XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => fmt(v)} tickLine={false} axisLine={false} tickMargin={8} /><YAxis type="category" dataKey="name" width={categoryAxisWidth} tick={<CategoryTick width={categoryAxisWidth} horizontal />} tickLine={false} axisLine={false} interval={0} /></>
    : <><XAxis dataKey="name" tick={<CategoryTick />} interval={0} height={56} tickLine={false} axisLine={false} tickMargin={7} /><YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => fmt(v)} width={56} tickLine={false} axisLine={false} tickMargin={7} /></>;
  const grid = <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="hsl(var(--border))" strokeOpacity={0.55} />;
  const stacked = type.startsWith("STACKED");

  if (type === "SINGLE_VALUE" || type === "GAUGE") {
    const total = p.grand;
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1">
        <span className="text-5xl font-light tabular-nums" style={{ color: DHIS2_COLORS[1] }}>{fmt(total)}</span>
        <span className="text-xs text-muted-foreground text-center">{series.map((s) => s.name).join(", ")}</span>
      </div>
    );
  }
  if (type === "PIE") {
    const pieData = p.colKeys.map((k) => ({ name: nameOf(a, k[0]), value: p.colTotal(k) }));
    return <ResponsiveContainer><PieChart margin={{ top: 10, right: 18, bottom: 12, left: 18 }}><Pie data={pieData} dataKey="value" nameKey="name" innerRadius="36%" outerRadius="68%" paddingAngle={2} cornerRadius={3} label={({ percent }) => `${Math.round(percent * 100)}%`} labelLine={{ stroke: "hsl(var(--border))" }}>{pieData.map((_, i) => <Cell key={i} fill={DHIS2_COLORS[i % DHIS2_COLORS.length]} stroke="hsl(var(--card))" strokeWidth={2} />)}</Pie>{tip}<Legend wrapperStyle={{ fontSize: 11, lineHeight: "20px" }} iconSize={8} /></PieChart></ResponsiveContainer>;
  }
  if (type === "RADAR") {
    return <ResponsiveContainer><RadarChart data={data}><PolarGrid /><PolarAngleAxis dataKey="name" tick={{ fontSize: 10 }} />{series.map((s, i) => <Radar key={s.key} name={s.name} dataKey={s.key} stroke={DHIS2_COLORS[i % 12]} fill={DHIS2_COLORS[i % 12]} fillOpacity={0.3} />)}{tip}{legend}</RadarChart></ResponsiveContainer>;
  }
  if (type.includes("LINE")) {
    return <ResponsiveContainer><LineChart data={data} margin={chartMargins}>{grid}{axes()}{tip}{legend}{refs}{series.map((s, i) => <Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={DHIS2_COLORS[i % 12]} strokeWidth={2.25} dot={{ r: 3.5, strokeWidth: 2, fill: "hsl(var(--card))" }} activeDot={{ r: 5 }} connectNulls>{r.viz.showData && <LabelList dataKey={s.key} content={<ValueLabel />} />}</Line>)}</LineChart></ResponsiveContainer>;
  }
  if (type.includes("AREA")) {
    return <ResponsiveContainer><AreaChart data={data} margin={chartMargins}>{grid}{axes()}{tip}{legend}{refs}{series.map((s, i) => <Area key={s.key} dataKey={s.key} name={s.name} stackId={stacked ? "s" : undefined} stroke={DHIS2_COLORS[i % 12]} strokeWidth={2} fill={DHIS2_COLORS[i % 12]} fillOpacity={0.28} />)}</AreaChart></ResponsiveContainer>;
  }
  const horizontal = type.includes("BAR");
  return (
    <ResponsiveContainer>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={chartMargins}
        barCategoryGap={data.length > 12 ? "32%" : data.length > 6 ? "45%" : "55%"} barGap={stacked ? 0 : 6}>
        {grid}{axes(horizontal)}{tip}{legend}{refs}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId={stacked ? "s" : undefined} fill={DHIS2_COLORS[i % 12]} maxBarSize={38} minPointSize={2}
            radius={stacked ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
            {r.viz.showData && <LabelList dataKey={s.key} content={<ValueLabel horizontal={horizontal} />} />}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function Dhis2DashboardItem({ connId, item, onExpand }: { connId: string; item: DashItem; onPivot?: (r: VizResult) => void; onExpand: (r: VizResult) => void }) {
  const [r, setR] = useState<VizResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!item.ref) return;
    let live = true;
    loadViz(connId, item).then((x) => live && setR(x)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [connId, item]);

  const title = item.ref?.name ?? (item.type === "TEXT" ? "" : item.type.replace(/_/g, " ").toLowerCase());
  return (
    <div className="group h-full flex flex-col rounded-md border border-border bg-card shadow-sm overflow-hidden">
      {item.type !== "TEXT" && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60">
          <h4 className="text-[13px] font-semibold text-foreground truncate" title={title}>{title}</h4>
          {r?.analytics && (
            <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
              <button type="button" aria-label="View full screen" title="View full screen" onClick={() => onExpand(r)} className="p-1 rounded hover:bg-muted"><Maximize2 className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0 p-2">
        {item.type === "TEXT" ? <div className="h-full overflow-auto p-2 text-sm whitespace-pre-wrap text-foreground"><FileText className="h-3.5 w-3.5 inline mr-1 text-muted-foreground" />{item.text}</div>
          : !item.ref ? <p className="text-xs text-muted-foreground p-2">This item type ({item.type.toLowerCase().replace(/_/g, " ")}) has no data to show.</p>
          : err ? <p className="text-xs text-destructive flex gap-1 p-2"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{err}</p>
          : !r ? <div className="h-full flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          : !r.analytics ? <p className="text-xs text-muted-foreground p-2">{r.note ?? "No data."}</p>
          : !r.analytics.rows.length ? <p className="h-full flex items-center justify-center text-xs text-muted-foreground">No data for the selected period</p>
          : <ChartBody r={r} />}
      </div>
    </div>
  );
}

export { ChartBody };
