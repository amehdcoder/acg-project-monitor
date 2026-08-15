/**
 * Universal Kobo Analytics — WHO-standard, 100% editable dashboard canvas.
 *
 * Renders widgets bound to the live (drift-adapted) Kobo schema. In edit mode
 * every panel can be retitled, rebound, resized, recoloured, reordered,
 * duplicated or deleted, and new panels added. Layout persists per connection.
 */
import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Area, AreaChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, Treemap, XAxis, YAxis, LabelList,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Copy, Download, LayoutDashboard,
  Pencil, Plus, RotateCcw, Save, Trash2, X,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { HubSchema } from "@/lib/koboHub/schema";
import {
  WHO_PALETTE, autoDashboard, blankWidget, clearDashboard, computeWidget,
  loadDashboard, newWidgetId, saveDashboard,
  type HubDashboard, type HubWidget, type Row,
} from "@/lib/koboHub/dashboard";
import WidgetEditorDialog from "./WidgetEditorDialog";

interface Props {
  connectionId: string;
  schema: HubSchema;
  rows: Row[];
  formTitle: string;
}

const fmt = (n: number) =>
  Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) : String(Math.round(n * 100) / 100);

const spanClass: Record<number, string> = {
  3: "lg:col-span-3", 4: "lg:col-span-4", 5: "lg:col-span-5", 6: "lg:col-span-6",
  7: "lg:col-span-7", 8: "lg:col-span-8", 9: "lg:col-span-9", 10: "lg:col-span-10",
  11: "lg:col-span-11", 12: "lg:col-span-12",
};

function WidgetChart({ w, schema, rows }: { w: HubWidget; schema: HubSchema; rows: Row[] }) {
  const res = useMemo(() => computeWidget(rows, schema, w), [rows, schema, w]);
  const color = WHO_PALETTE[w.colorIndex % WHO_PALETTE.length];

  if (w.kind === "text") {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{w.body || "Add narrative text in the widget editor."}</p>;
  }

  if (res.unbound) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-amber-400">
        <AlertTriangle className="h-4 w-4" /> Field no longer in the Kobo schema — rebind this widget.
      </div>
    );
  }

  if (w.kind === "kpi") {
    return (
      <div className="flex h-full flex-col justify-center">
        <div className="text-3xl font-bold tracking-tight" style={{ color }}>{fmt(res.kpi)}</div>
        <div className="mt-1 text-[11px] uppercase tracking-wider text-slate-500">{res.n.toLocaleString()} records</div>
      </div>
    );
  }

  if (!res.data.length) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-500">No data for this selection.</div>;
  }

  const tooltip = (
    <Tooltip
      contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, color: "#e2e8f0", fontSize: 12 }}
      cursor={{ fill: "rgba(148,163,184,0.08)" }}
    />
  );
  const grid = <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />;
  const axisProps = { tick: { fill: "#94a3b8", fontSize: 11 }, stroke: "#334155" } as const;

  if (w.kind === "table") {
    return (
      <div className="h-full overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900 text-slate-400">
            <tr><th className="p-2 text-left">Category</th><th className="p-2 text-right">Value</th><th className="p-2 text-right">%</th></tr>
          </thead>
          <tbody>
            {res.data.map((d) => (
              <tr key={d.name} className="border-t border-slate-800 text-slate-200">
                <td className="p-2">{d.name}</td>
                <td className="p-2 text-right font-medium">{fmt(d.value)}</td>
                <td className="p-2 text-right text-slate-400">{d.pct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (w.kind === "pie" || w.kind === "donut") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={res.data} dataKey="value" nameKey="name" innerRadius={w.kind === "donut" ? "52%" : 0}
            outerRadius="80%" paddingAngle={1}
            label={w.showValues ? (d: any) => `${d.name}: ${fmt(d.value)}` : false} labelLine={false}>
            {res.data.map((_, i) => <Cell key={i} fill={WHO_PALETTE[(i + w.colorIndex) % WHO_PALETTE.length]} />)}
          </Pie>
          {tooltip}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (w.kind === "treemap") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <Treemap data={res.data} dataKey="value" nameKey="name" stroke="#0f172a"
          content={undefined as any} fill={color}>
          {tooltip}
        </Treemap>
      </ResponsiveContainer>
    );
  }

  if (w.kind === "line" || w.kind === "area") {
    const Chart = w.kind === "line" ? LineChart : AreaChart;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={res.data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          {grid}
          <XAxis dataKey="name" {...axisProps} minTickGap={20} />
          <YAxis {...axisProps} />
          {tooltip}
          {w.kind === "line"
            ? <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
            : <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.25} strokeWidth={2} />}
        </Chart>
      </ResponsiveContainer>
    );
  }

  if (w.kind === "stacked" && res.seriesKeys.length) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={res.stacked} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          {grid}
          <XAxis dataKey="name" {...axisProps} interval={0} angle={-20} textAnchor="end" height={62} />
          <YAxis {...axisProps} />
          {tooltip}
          <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
          {res.seriesKeys.map((k, i) => (
            <Bar key={k} dataKey={k} stackId="a" fill={WHO_PALETTE[(i + w.colorIndex) % WHO_PALETTE.length]} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  const horizontal = w.kind === "bar";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={res.data} layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 24, left: horizontal ? 8 : 0, bottom: 4 }}>
        {grid}
        {horizontal ? <XAxis type="number" {...axisProps} /> : <XAxis dataKey="name" {...axisProps} interval={0} angle={-20} textAnchor="end" height={62} />}
        {horizontal ? <YAxis type="category" dataKey="name" width={130} {...axisProps} /> : <YAxis {...axisProps} />}
        {tooltip}
        <Bar dataKey="value" fill={color} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
          {w.showValues && <LabelList dataKey="value" position={horizontal ? "right" : "top"} fill="#cbd5e1" fontSize={10} formatter={(v: any) => fmt(Number(v))} />}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function WhoDashboard({ connectionId, schema, rows, formTitle }: Props) {
  const [dash, setDash] = useState<HubDashboard>(() =>
    loadDashboard(connectionId) ?? autoDashboard(schema, connectionId, rows));
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState<HubWidget | null>(null);
  const [open, setOpen] = useState(false);

  const persist = (next: HubDashboard) => { setDash(next); saveDashboard(next); };
  const patch = (widgets: HubWidget[]) => persist({ ...dash, widgets });

  const upsert = (w: HubWidget) => {
    const i = dash.widgets.findIndex((x) => x.id === w.id);
    const next = [...dash.widgets];
    if (i >= 0) next[i] = w; else next.push(w);
    patch(next);
    toast({ title: "Widget saved" });
  };

  const move = (id: string, dir: -1 | 1) => {
    const i = dash.widgets.findIndex((w) => w.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= dash.widgets.length) return;
    const next = [...dash.widgets];
    [next[i], next[j]] = [next[j], next[i]];
    patch(next);
  };

  const exportCsv = () => {
    const lines: string[] = [`"${dash.name}"`, ""];
    for (const w of dash.widgets) {
      if (w.kind === "text") continue;
      const r = computeWidget(rows, schema, w);
      lines.push(`"${w.title.replace(/"/g, '""')}"`);
      lines.push("Category,Value,Percent");
      r.data.forEach((d) => lines.push(`"${String(d.name).replace(/"/g, '""')}",${d.value},${d.pct.toFixed(2)}`));
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(formTitle || "kobo-dashboard").replace(/[^\w.-]+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <div className="min-w-[220px] flex-1">
          {editing ? (
            <div className="space-y-1.5">
              <Input value={dash.name} onChange={(e) => persist({ ...dash, name: e.target.value })}
                className="h-8 bg-slate-950 border-slate-700 font-semibold" />
              <Input value={dash.subtitle} onChange={(e) => persist({ ...dash, subtitle: e.target.value })}
                className="h-7 bg-slate-950 border-slate-700 text-xs" />
            </div>
          ) : (
            <>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
                <LayoutDashboard className="h-4 w-4 text-cyan-400" /> {dash.name}
              </h2>
              <p className="text-xs text-slate-400">{dash.subtitle}</p>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-slate-700 text-slate-300">{rows.length.toLocaleString()} submissions</Badge>
          <Badge variant="outline" className="border-slate-700 text-slate-300">{dash.widgets.length} widgets</Badge>
          <Button size="sm" variant="outline" className="border-slate-700 text-slate-200" onClick={exportCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>
          {editing && (
            <>
              <Button size="sm" variant="outline" className="border-slate-700 text-slate-200"
                onClick={() => { setTarget({ ...blankWidget(), id: newWidgetId() }); setOpen(true); }}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add widget
              </Button>
              <Button size="sm" variant="outline" className="border-slate-700 text-slate-200"
                onClick={() => { clearDashboard(connectionId); const d = autoDashboard(schema, connectionId, rows); persist(d); toast({ title: "Dashboard rebuilt from the current schema" }); }}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Rebuild
              </Button>
            </>
          )}
          <Button size="sm" className={editing ? "bg-emerald-600 hover:bg-emerald-500" : "bg-cyan-600 hover:bg-cyan-500"}
            onClick={() => setEditing((v) => !v)}>
            {editing ? <><Save className="mr-1.5 h-3.5 w-3.5" /> Done</> : <><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit dashboard</>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {dash.widgets.map((w) => (
          <div key={w.id} className={`${spanClass[Math.min(12, Math.max(3, w.span))] ?? "lg:col-span-4"} rounded-lg border border-slate-800 bg-slate-900/60 p-3`}>
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-slate-100">{w.title}</h3>
                {w.subtitle && <p className="truncate text-[11px] text-slate-500">{w.subtitle}</p>}
              </div>
              {editing && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400" onClick={() => move(w.id, -1)} aria-label="Move left"><ArrowLeft className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400" onClick={() => move(w.id, 1)} aria-label="Move right"><ArrowRight className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400" onClick={() => patch([...dash.widgets, { ...w, id: newWidgetId(), title: `${w.title} (copy)` }])} aria-label="Duplicate"><Copy className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-cyan-400" onClick={() => { setTarget(w); setOpen(true); }} aria-label="Edit widget"><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-rose-400" onClick={() => patch(dash.widgets.filter((x) => x.id !== w.id))} aria-label="Delete widget"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
            <div style={{ height: w.height }}>
              <WidgetChart w={w} schema={schema} rows={rows} />
            </div>
          </div>
        ))}
        {!dash.widgets.length && (
          <div className="lg:col-span-12 rounded-lg border border-dashed border-slate-800 p-10 text-center text-sm text-slate-500">
            No widgets yet — switch to edit mode and add your first panel.
          </div>
        )}
      </div>

      <WidgetEditorDialog open={open} onOpenChange={setOpen} schema={schema} widget={target} onSave={upsert} />
    </div>
  );
}
