/**
 * Infographic "petal" donut chart — solid colour core, exploded outlined
 * segments with bold coloured percentages, outside category labels and a
 * detailed hover tooltip (category, exact count n, percentage, denominator).
 */
import {
  Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip,
} from "recharts";
import { BRIGHT_CHART_PALETTE } from "@/lib/charts/brightPalette";

export const PETAL_PALETTE = BRIGHT_CHART_PALETTE;


const petalLabel = (props: any) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent, value, name, fill } = props;
  if (!percent || percent < 0.02) return null;
  const RAD = Math.PI / 180;
  const cos = Math.cos(-midAngle * RAD);
  const sin = Math.sin(-midAngle * RAD);
  const mid = (Number(innerRadius) + Number(outerRadius)) / 2;
  const px = cx + mid * cos;
  const py = cy + mid * sin;
  const r = Number(outerRadius) + 14;
  const rawX = cx + r * cos;
  const y = cy + r * sin;
  const right = rawX > cx;
  const maxX = cx * 2;
  const x = Math.max(6, Math.min(maxX - 6, rawX));
  const anchor = right ? "start" : "end";
  const room = right ? maxX - x : x;
  const chars = Math.max(6, Math.floor(room / 5.4));
  const label = String(name ?? "");
  const short = label.length > chars ? `${label.slice(0, chars - 1)}…` : label;
  return (
    <g>
      <text
        x={px} y={py} textAnchor="middle" dominantBaseline="central"
        fontSize={15} fontWeight={800} fill={fill}
        style={{ paintOrder: "stroke", stroke: "hsl(var(--card))", strokeWidth: 3, strokeLinejoin: "round" }}
      >
        {(percent * 100).toFixed(0)}%
      </text>
      <text x={x} y={y} textAnchor={anchor} dominantBaseline="central" className="fill-foreground" fontSize={10} fontWeight={700}>
        <tspan>{short}</tspan>
        <tspan x={x} dy={11} className="fill-muted-foreground" fontWeight={500}>
          {Number(value).toLocaleString()}
        </tspan>
      </text>
    </g>
  );
};

export interface PetalDatum { name: string; value: number; color?: string }

export default function PetalDonutChart({
  data,
  height = 300,
  unitLabel = "records",
}: {
  data: PetalDatum[];
  height?: number;
  /** Noun used in the tooltip, e.g. "submissions". */
  unitLabel?: string;
}) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        No data yet
      </div>
    );
  }
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const colorAt = (i: number) => data[i]?.color ?? PETAL_PALETTE[i % PETAL_PALETTE.length];

  const TooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0];
    const value = Number(p.value) || 0;
    const pct = total ? (value / total) * 100 : 0;
    const color = p.payload?.color ?? p.payload?.fill ?? "hsl(var(--primary))";
    return (
      <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lg">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {p.name}
        </div>
        <div className="mt-1 tabular-nums text-foreground">
          n = {value.toLocaleString()} {unitLabel}
        </div>
        <div className="tabular-nums text-muted-foreground">
          {pct.toFixed(1)}% of {total.toLocaleString()}
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-full min-w-0" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 12, right: 10, bottom: 4, left: 10 }}>
          <defs>
            {PETAL_PALETTE.map((c, i) => (
              <linearGradient key={i} id={`qpetalGrad${i}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={0.16} />
                <stop offset="100%" stopColor={c} stopOpacity={0.04} />
              </linearGradient>
            ))}
            {PETAL_PALETTE.map((c, i) => (
              <linearGradient key={`core${i}`} id={`qcoreGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={1} />
                <stop offset="100%" stopColor={c} stopOpacity={0.78} />
              </linearGradient>
            ))}
          </defs>

          <Pie
            data={data} dataKey="value" nameKey="name" cx="50%" cy="46%"
            innerRadius="12%" outerRadius="26%" paddingAngle={1}
            stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false}
          >
            {data.map((_, i) => <Cell key={i} fill={`url(#qcoreGrad${i % PETAL_PALETTE.length})`} />)}
          </Pie>

          <Pie
            data={data} dataKey="value" nameKey="name" cx="50%" cy="46%"
            innerRadius="38%" outerRadius="62%" paddingAngle={5} cornerRadius={8}
            strokeWidth={2.5}
            labelLine={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
            label={petalLabel}
            isAnimationActive animationDuration={700}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={`url(#qpetalGrad${i % PETAL_PALETTE.length})`} stroke={colorAt(i)} />
            ))}
          </Pie>

          <Tooltip content={<TooltipContent />} />
          <Legend
            verticalAlign="bottom" height={34}
            wrapperStyle={{ fontSize: 11, lineHeight: "16px" }}
            iconType="circle" iconSize={8}
            formatter={(v: string) => <span className="text-muted-foreground">{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute right-1 top-0 rounded-full border bg-card/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground tabular-nums backdrop-blur-sm">
        n = {total.toLocaleString()}
      </div>
    </div>
  );
}
