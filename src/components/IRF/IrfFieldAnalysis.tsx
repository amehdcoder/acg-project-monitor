import { useMemo, useState } from "react";
import { BarChart3, PieChart as PieIcon, LayoutGrid } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { analyzeFields, type CategoricalFieldAnalysis, type NumericFieldAnalysis } from "@/lib/irf/fieldAnalysis";
import type { IrfReport } from "@/lib/irf/definition";

const chartText = "hsl(var(--foreground))";
const chartMuted = "hsl(var(--muted-foreground))";
const chartBorder = "hsl(var(--border))";
const tooltipStyle = { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: chartText, fontSize: 12 };
const fmt = (n: number) => new Intl.NumberFormat().format(Math.round(n || 0));

function CategoricalCard({ a }: { a: CategoricalFieldAnalysis }) {
  const usePie = a.unique <= 5;
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="border-b bg-muted/30 px-3 py-2">
        <p className="truncate text-xs font-semibold text-foreground" title={a.label}>{a.label}</p>
        <p className="truncate text-[11px] text-muted-foreground">{a.activity} · {a.answered} responses · {a.responseRate}% answered</p>
      </div>
      <div className="p-2">
        <ResponsiveContainer width="100%" height={200}>
          {usePie ? (
            <PieChart>
              <Pie data={a.data} dataKey="value" nameKey="name" innerRadius={38} outerRadius={68} paddingAngle={2}>
                {a.data.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [`${fmt(v)}`, n]} />
              <Legend wrapperStyle={{ fontSize: 11, color: chartText }} />
            </PieChart>
          ) : (
            <BarChart data={a.data} layout="vertical" margin={{ left: 4, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartBorder} opacity={0.6} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: chartMuted }} axisLine={{ stroke: chartBorder }} tickLine={{ stroke: chartBorder }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: chartMuted }} axisLine={{ stroke: chartBorder }} tickLine={{ stroke: chartBorder }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${fmt(v)} response(s)`, ""]} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {a.data.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <p className="mt-auto border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        Top: <span className="font-medium text-foreground">{a.top.name}</span> ({a.top.pct}%)
      </p>
    </Card>
  );
}

function NumericCard({ a }: { a: NumericFieldAnalysis }) {
  const consistency = a.cv <= 50 ? "Consistent" : a.cv <= 100 ? "Moderate spread" : "High spread";
  const cColor = a.cv <= 50 ? "#16a34a" : a.cv <= 100 ? "#d97706" : "#dc2626";
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="border-b bg-muted/30 px-3 py-2">
        <p className="truncate text-xs font-semibold text-foreground" title={a.label}>{a.label}</p>
        <p className="truncate text-[11px] text-muted-foreground">{a.activity} · {a.answered} reports · {a.responseRate}% answered</p>
      </div>
      <div className="grid grid-cols-3 gap-1 px-3 py-2 text-center">
        <div><p className="text-sm font-bold text-foreground">{fmt(a.sum)}</p><p className="text-[10px] text-muted-foreground">Total</p></div>
        <div><p className="text-sm font-bold text-foreground">{fmt(a.mean)}</p><p className="text-[10px] text-muted-foreground">Mean</p></div>
        <div><p className="text-sm font-bold text-foreground">{fmt(a.median)}</p><p className="text-[10px] text-muted-foreground">Median</p></div>
      </div>
      <div className="px-2">
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={a.histogram} margin={{ left: -18, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartBorder} opacity={0.5} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: chartMuted }} axisLine={{ stroke: chartBorder }} tickLine={false} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: chartMuted }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${fmt(v)} report(s)`, ""]} />
            <Bar dataKey="value" fill="#0b5394" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-auto border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        Range {fmt(a.min)}–{fmt(a.max)} · <span style={{ color: cColor }} className="font-medium">{consistency}</span> (CV {a.cv}%)
      </p>
    </Card>
  );
}

export default function IrfFieldAnalysis({ rows }: { rows: IrfReport[] }) {
  const { categorical, numeric } = useMemo(() => analyzeFields(rows), [rows]);
  const [tab, setTab] = useState<"all" | "categorical" | "numeric">("all");

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
        <h3 className="text-sm font-semibold text-foreground">Field-by-Field Response Analysis</h3>
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-muted p-0.5 text-xs">
          {(["all", "categorical", "numeric"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-md px-2.5 py-1 capitalize transition-colors ${tab === t ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "categorical" ? "Distributions" : t === "numeric" ? "Quantitative" : "All"}
            </button>
          ))}
        </div>
      </div>

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
