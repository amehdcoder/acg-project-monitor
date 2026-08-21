/**
 * Infographic-grade chart primitives for the Integrated MDA Supervisory
 * Checklist dashboard.
 *
 * Styled after the printed MDA implementation overview posters: bold value
 * labels on every bar, a large percentage in the middle of every donut,
 * leader-line category callouts and a legend that carries exact counts.
 */
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { BRIGHT_CHART_PALETTE } from "@/lib/charts/brightPalette";

export interface Datum { name: string; value: number }

/* --------------------------------------------------------------- palette */

/** Semantic colours so Yes/No/Completed/Halted always read the same way. */
const SEMANTIC: { match: RegExp; color: string }[] = [
  { match: /^yes\b|^offered|^swallowed|^complete/i, color: "#128B5B" },
  { match: /^no\b|^not offered|^not swallowed|^not\s*start|refus/i, color: "#DC2626" },
  { match: /unavailable|not available|vetting|halt|pending/i, color: "#F59E0B" },
  { match: /ongoing|in progress|partly|partial/i, color: "#1668DC" },
  { match: /^n\/?a$|^other$|unknown|—/i, color: "#94A3B8" },
];

export const semanticColor = (name: string, i = 0): string =>
  SEMANTIC.find((s) => s.match.test(String(name).trim()))?.color ??
  BRIGHT_CHART_PALETTE[i % BRIGHT_CHART_PALETTE.length];

const nf = (n: number) => Number(n || 0).toLocaleString();

const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  fontSize: 11,
  boxShadow: "0 8px 24px -12px rgba(0,0,0,.35)",
} as const;

export const ChartEmpty = ({ height = 220 }: { height?: number }) => (
  <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
    No data yet
  </div>
);

/* ------------------------------------------------------------ InfoDonut */

/**
 * Poster-style donut: thick coloured ring, dominant share printed in the
 * middle, in-slice percentages (never overlapping) and a counted legend that
 * sits in its own row below the ring.
 */
export function InfoDonut({
  data, height = 300, centerLabel,
}: { data: Datum[]; height?: number; centerLabel?: string }) {
  if (!data.length) return <ChartEmpty height={height} />;
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  if (total <= 0) return <ChartEmpty height={height} />;

  const ordered = [...data].sort((a, b) => Number(b.value) - Number(a.value));
  const top = ordered[0];
  const topPct = Math.round((top.value / total) * 100);
  const colors = ordered.map((d, i) => semanticColor(d.name, i));

  // Legend is laid out in normal flow so it can never collide with the ring.
  const legendRows = Math.ceil(ordered.length / 2);
  const legendHeight = Math.min(96, 22 + legendRows * 16);
  const ringHeight = Math.max(150, height - legendHeight);

  /** Percentage printed inside the slice — only when the slice is wide enough. */
  const inSliceLabel = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
    if (!percent || percent < 0.06) return null;
    const RAD = Math.PI / 180;
    const r = Number(innerRadius) + (Number(outerRadius) - Number(innerRadius)) * 0.55;
    const x = cx + r * Math.cos(-midAngle * RAD);
    const y = cy + r * Math.sin(-midAngle * RAD);
    return (
      <text
        x={x} y={y} textAnchor="middle" dominantBaseline="central"
        fontSize={11} fontWeight={800} fill="#FFFFFF"
      >
        {Math.round(percent * 100)}%
      </text>
    );
  };

  return (
    <div className="w-full min-w-0">
      <div className="relative w-full min-w-0" style={{ height: ringHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
            <Pie
              data={ordered}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="52%"
              outerRadius="82%"
              paddingAngle={1.5}
              cornerRadius={3}
              stroke="hsl(var(--card))"
              strokeWidth={2}
              labelLine={false}
              label={inSliceLabel}
              isAnimationActive
              animationDuration={650}
            >
              {ordered.map((d, i) => <Cell key={d.name} fill={colors[i]} />)}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: any, n: any) => [`${nf(Number(v))} (${((Number(v) / total) * 100).toFixed(1)}%)`, n]}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Dominant share, printed in the hole of the donut */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-extrabold leading-none" style={{ color: colors[0] }}>
            {topPct}%
          </span>
          <span className="mt-0.5 max-w-[40%] truncate text-[10px] font-semibold text-muted-foreground">
            {centerLabel ?? top.name}
          </span>
          <span className="text-[10px] font-bold tabular-nums text-muted-foreground">n = {nf(total)}</span>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {ordered.map((d, i) => (
          <span key={d.name} className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[i] }} />
            <span className="min-w-0 flex-1 truncate text-foreground" title={d.name}>{d.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {nf(d.value)} · {((Number(d.value) / total) * 100).toFixed(1)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------- InfoBarH */

/** Horizontal ranked bars with the exact count printed at the end of each bar. */
export function InfoBarH({
  data, color, axisLabel = "Number of responses", colorByName = false, maxBars,
}: {
  data: Datum[];
  color?: string;
  axisLabel?: string;
  colorByName?: boolean;
  maxBars?: number;
}) {
  if (!data.length) return <ChartEmpty />;
  const rows = maxBars ? data.slice(0, maxBars) : data;
  const max = Math.max(...rows.map((d) => Number(d.value) || 0), 1);
  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 38 + 46)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 46, top: 6, bottom: 22 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis
            type="number"
            domain={[0, Math.ceil(max * 1.12)]}
            allowDecimals={false}
            tick={{ fontSize: 10 }}
            label={{ value: axisLabel, position: "insideBottom", offset: -14, fontSize: 10, fontWeight: 700 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tick={{ fontSize: 10, fontWeight: 600 }}
            tickFormatter={(v: string) => (String(v).length > 26 ? `${String(v).slice(0, 25)}…` : String(v))}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(var(--muted)/.4)" }} formatter={(v: any) => [nf(Number(v)), "Responses"]} />
          <Bar dataKey="value" radius={[0, 5, 5, 0]} maxBarSize={22}>
            {rows.map((d, i) => (
              <Cell key={d.name} fill={colorByName ? semanticColor(d.name, i) : (color ?? BRIGHT_CHART_PALETTE[0])} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v: any) => nf(Number(v))}
              style={{ fontSize: 11, fontWeight: 800, fill: "hsl(var(--foreground))" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------- InfoBarV */

/** Vertical bars with counts printed above each column. */
export function InfoBarV({
  data, height = 280, colorOf, yLabel = "Number of activities", xLabel, onSelect,
}: {
  data: Datum[];
  height?: number;
  colorOf?: (name: string, i: number) => string;
  yLabel?: string;
  xLabel?: string;
  onSelect?: (name: string) => void;
}) {
  if (!data.length) return <ChartEmpty height={height} />;
  const max = Math.max(...data.map((d) => Number(d.value) || 0), 1);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 6, right: 12, top: 22, bottom: xLabel ? 34 : 16 }}>
        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fontWeight: 600 }}
          interval={0}
          height={xLabel ? 52 : 40}
          angle={data.length > 5 ? -14 : 0}
          textAnchor={data.length > 5 ? "end" : "middle"}
          label={xLabel ? { value: xLabel, position: "insideBottom", offset: -4, fontSize: 10, fontWeight: 700 } : undefined}
        />
        <YAxis
          allowDecimals={false}
          domain={[0, Math.ceil(max * 1.15)]}
          tick={{ fontSize: 10 }}
          width={54}
          label={{ value: yLabel, angle: -90, position: "insideLeft", fontSize: 10, fontWeight: 700 }}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "hsl(var(--muted)/.4)" }}
          formatter={(v: any) => [nf(Number(v)), "Count"]}
        />
        <Bar
          dataKey="value"
          radius={[6, 6, 0, 0]}
          maxBarSize={70}
          cursor={onSelect ? "pointer" : undefined}
          onClick={(d: any) => onSelect?.(String(d?.name ?? d?.payload?.name ?? ""))}
        >
          {data.map((d, i) => (
            <Cell key={d.name} fill={colorOf ? colorOf(d.name, i) : semanticColor(d.name, i)} />
          ))}
          <LabelList
            dataKey="value"
            position="top"
            formatter={(v: any) => nf(Number(v))}
            style={{ fontSize: 11, fontWeight: 800, fill: "hsl(var(--foreground))" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default InfoDonut;
