/**
 * Universal Kobo Hub — dynamically generated widgets, one per detected field.
 * Categorical → bar/donut with click-to-cross-filter.
 * Numeric     → KPI stats + histogram + trend line.
 * Text        → NLP topic clusters / word cloud.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line,
} from "recharts";
import { BarChart3, PieChart as PieIcon, Sigma, MessageSquareText } from "lucide-react";
import {
  categoryDistribution, numericSummary, textTopics,
  type HubFilters, type Row,
} from "@/lib/koboHub/analytics";
import type { HubField, HubSchema } from "@/lib/koboHub/schema";

const PALETTE = ["#10B981", "#06B6D4", "#F59E0B", "#EF4444", "#8B5CF6", "#3B82F6", "#14B8A6", "#F472B6"];

const chartTip = {
  contentStyle: {
    background: "#0F172A", border: "1px solid #334155", borderRadius: 8, color: "#E2E8F0", fontSize: 12,
  },
};

function Shell({ icon, title, badge, children }: {
  icon: React.ReactNode; title: string; badge?: string; children: React.ReactNode;
}) {
  return (
    <Card className="bg-slate-900/70 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm text-slate-100">
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-cyan-400 shrink-0">{icon}</span>
            <span className="truncate">{title}</span>
          </span>
          {badge && <Badge variant="outline" className="border-slate-700 text-slate-400 shrink-0">{badge}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------ categorical */

function CategoricalWidget({ rows, schema, field, filters, onSlice }: {
  rows: Row[]; schema: HubSchema; field: HubField;
  filters: HubFilters; onSlice: (name: string, value: string) => void;
}) {
  const [mode, setMode] = useState<"bar" | "donut">("bar");
  const data = useMemo(() => categoryDistribution(rows, schema, field), [rows, schema, field]);
  const selected = filters.slices[field.name];
  if (!data.length) return null;
  const top = data.slice(0, 12);

  return (
    <Shell
      icon={mode === "bar" ? <BarChart3 className="h-4 w-4" /> : <PieIcon className="h-4 w-4" />}
      title={field.label}
      badge={field.type === "select_multiple" ? "multi-select" : "single-select"}
    >
      <div className="flex justify-end mb-1">
        <Button size="sm" variant="ghost" className="h-6 text-[11px] text-slate-400 hover:text-cyan-300"
          onClick={() => setMode(mode === "bar" ? "donut" : "bar")}>
          {mode === "bar" ? "Donut" : "Bar"}
        </Button>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {mode === "bar" ? (
            <BarChart data={top} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 11 }} />
              <YAxis dataKey="name" type="category" width={110} tick={{ fill: "#CBD5E1", fontSize: 11 }} />
              <Tooltip {...chartTip} formatter={(v: any, _n, p: any) => [`${v} (${p.payload.pct.toFixed(1)}%)`, "Responses"]} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} cursor="pointer"
                onClick={(d: any) => onSlice(field.name, d?.name)}>
                {top.map((d, i) => (
                  <Cell key={d.name} fill={selected && selected !== d.name ? "#334155" : PALETTE[i % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <PieChart>
              <Tooltip {...chartTip} formatter={(v: any, n: any) => [`${v}`, n]} />
              <Pie data={top} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}
                onClick={(d: any) => onSlice(field.name, d?.name)} cursor="pointer">
                {top.map((d, i) => (
                  <Cell key={d.name} fill={selected && selected !== d.name ? "#334155" : PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        {data.length} distinct response{data.length === 1 ? "" : "s"} · click a {mode === "bar" ? "bar" : "slice"} to cross-filter the dashboard
      </p>
    </Shell>
  );
}

/* ---------------------------------------------------------------- numeric */

function NumericWidget({ rows, field }: { rows: Row[]; field: HubField }) {
  const stat = useMemo(() => numericSummary(rows, field), [rows, field]);
  if (!stat.count) return null;
  const cell = (label: string, value: number, tone = "text-slate-100") => (
    <div className="rounded-md bg-slate-800/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-sm font-semibold ${tone}`}>{Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</div>
    </div>
  );

  return (
    <Shell icon={<Sigma className="h-4 w-4" />} title={field.label} badge={field.type}>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {cell("Sum", stat.sum, "text-emerald-400")}
        {cell("Mean", stat.mean, "text-cyan-400")}
        {cell("Std dev", stat.sd, "text-amber-400")}
        {cell("Min", stat.min)}
        {cell("Max", stat.max)}
        {cell("Responses", stat.count)}
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stat.histogram}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
            <XAxis dataKey="bucket" tick={{ fill: "#94A3B8", fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={44} />
            <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} />
            <Tooltip {...chartTip} />
            <Bar dataKey="count" fill="#06B6D4" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {stat.trend.length > 1 && (
        <div className="h-32 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stat.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 9 }} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} />
              <Tooltip {...chartTip} />
              <Line type="monotone" dataKey="value" stroke="#10B981" strokeWidth={2} dot={false} name="Daily mean" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------- text */

function TextWidget({ rows, field }: { rows: Row[]; field: HubField }) {
  const { topics, responses } = useMemo(() => textTopics(rows, field), [rows, field]);
  if (!responses) return null;
  const max = topics[0]?.count ?? 1;

  return (
    <Shell icon={<MessageSquareText className="h-4 w-4" />} title={field.label} badge={`${responses} responses`}>
      <div className="flex flex-wrap gap-2 items-baseline">
        {topics.map((t, i) => (
          <span
            key={t.term}
            title={t.samples.join("\n\n")}
            className="cursor-help leading-none"
            style={{
              fontSize: `${11 + (t.count / max) * 16}px`,
              color: PALETTE[i % PALETTE.length],
              opacity: 0.6 + (t.count / max) * 0.4,
            }}
          >
            {t.term}
          </span>
        ))}
      </div>
      <div className="mt-3 space-y-1">
        {topics.slice(0, 4).map((t) => (
          <div key={t.term} className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-24 truncate text-slate-300">{t.term}</span>
            <div className="h-1.5 flex-1 rounded bg-slate-800">
              <div className="h-1.5 rounded bg-cyan-500" style={{ width: `${(t.count / max) * 100}%` }} />
            </div>
            <span>{t.count}</span>
          </div>
        ))}
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------- dispatcher */

export default function FieldWidgets({ rows, schema, filters, onSlice, fields }: {
  rows: Row[]; schema: HubSchema; filters: HubFilters;
  onSlice: (name: string, value: string) => void; fields: HubField[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {fields.map((f) => {
        if (f.type === "select_one" || f.type === "select_multiple" || f.type === "boolean") {
          return <CategoricalWidget key={f.name} rows={rows} schema={schema} field={f} filters={filters} onSlice={onSlice} />;
        }
        if (f.type === "integer" || f.type === "decimal") {
          return <NumericWidget key={f.name} rows={rows} field={f} />;
        }
        if (f.type === "text") {
          return <TextWidget key={f.name} rows={rows} field={f} />;
        }
        return null;
      })}
    </div>
  );
}
