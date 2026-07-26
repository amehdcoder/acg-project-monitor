/**
 * Looker Studio–style report builder for KoboToolbox submissions.
 * Everything drives off the flat schema in koboSchema.ts so the dashboard sees
 * 100% of the Kobo fields (no truncation).
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter, DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import {
  BarChart3, Circle, Grid3x3, Palette, PieChart as PieIcon, Plus, Search,
  Settings2, Sliders, Table as TableIcon, Trash2, GripVertical, Eye, Pencil,
  RefreshCw, Undo2, Redo2, Download, LayoutGrid, LineChart as LineIcon, Type,
  MapPin, Loader2, X,
} from "lucide-react";
import type { KoboCache } from "./koboClient";
import { loadLayout, saveLayout } from "./koboClient";
import {
  buildDataDictionary, coerceNumber, partitionDimensionsMetrics, typeIcon,
  type KoboColumn,
} from "./koboSchema";

// ── Looker palette ────────────────────────────────────────────────────────
const GOOGLE_PALETTE = ["#4285F4", "#34A853", "#FBBC04", "#EA4335", "#AB47BC", "#00ACC1", "#FF7043", "#9CCC65"];

// ── Widget model ──────────────────────────────────────────────────────────
type WidgetType = "scorecard" | "bar" | "column" | "line" | "area" | "pie" | "donut" | "table" | "geo";

interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  dimension?: string;   // field key
  metric?: string;      // field key (numeric) — undefined ⇒ count of rows
  agg?: "sum" | "avg" | "count" | "min" | "max";
  colspan: 3 | 4 | 6 | 8 | 12;
  rowspan: 1 | 2 | 3;
  colorFrom?: number;   // palette offset
  bg?: string;
  showLegend?: boolean;
}

const DEFAULT_LAYOUT = (cols: KoboColumn[]): Widget[] => {
  const stateCol = cols.find((c) => /state/i.test(c.label));
  const lgaCol   = cols.find((c) => /^lga/i.test(c.label) || /local government/i.test(c.label));
  const wardCol  = cols.find((c) => /ward/i.test(c.label));
  const dateCol  = cols.find((c) => c.key === "_submission_time") ?? cols.find((c) => c.type === "date");
  return [
    { id: "w-total", type: "scorecard", title: "Total Submissions", agg: "count", colspan: 3, rowspan: 1, colorFrom: 0 },
    { id: "w-lga",   type: "scorecard", title: "LGAs Covered",     dimension: lgaCol?.key, agg: "count", colspan: 3, rowspan: 1, colorFrom: 1 },
    { id: "w-ward",  type: "scorecard", title: "Wards Reached",    dimension: wardCol?.key, agg: "count", colspan: 3, rowspan: 1, colorFrom: 2 },
    { id: "w-flhf",  type: "scorecard", title: "Enumerators",      dimension: "_submitted_by", agg: "count", colspan: 3, rowspan: 1, colorFrom: 3 },
    { id: "w-trend", type: "area", title: "Submission Velocity", dimension: dateCol?.key, agg: "count", colspan: 8, rowspan: 2, colorFrom: 0, showLegend: true },
    { id: "w-pie",   type: "donut", title: "Verification Status", dimension: "_validation_status", agg: "count", colspan: 4, rowspan: 2, colorFrom: 0, showLegend: true },
    { id: "w-bar",   type: "bar",  title: "Submissions by LGA", dimension: lgaCol?.key, agg: "count", colspan: 6, rowspan: 2, colorFrom: 0 },
    { id: "w-state", type: "column", title: "By State",        dimension: stateCol?.key, agg: "count", colspan: 6, rowspan: 2, colorFrom: 2 },
    { id: "w-table", type: "table", title: "Full Submissions", colspan: 12, rowspan: 3, colorFrom: 0 },
  ];
};

// ── Aggregation helpers ────────────────────────────────────────────────────
function aggregate(rows: Record<string, unknown>[], w: Widget): { name: string; value: number }[] {
  if (!w.dimension) {
    return [{ name: w.title, value: rows.length }];
  }
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    const raw = r[w.dimension];
    const key = raw == null || raw === ""
      ? "—"
      : typeof raw === "object"
        ? (raw as any)?.label ?? (raw as any)?.uid ?? JSON.stringify(raw)
        : Array.isArray(raw) ? raw.join(", ") : String(raw);
    const metricVal = w.metric ? coerceNumber(r[w.metric]) : 1;
    const arr = groups.get(key) ?? [];
    arr.push(metricVal);
    groups.set(key, arr);
  }
  const reducer = (arr: number[]) => {
    switch (w.agg ?? "count") {
      case "sum": return arr.reduce((a, b) => a + b, 0);
      case "avg": return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      case "min": return Math.min(...arr);
      case "max": return Math.max(...arr);
      case "count":
      default:    return arr.length;
    }
  };
  return [...groups.entries()]
    .map(([name, arr]) => ({ name, value: reducer(arr) }))
    .sort((a, b) => b.value - a.value);
}

// ── Chart body ────────────────────────────────────────────────────────────
function ChartBody({ widget, data, columns }: { widget: Widget; data: Record<string, unknown>[]; columns: KoboColumn[] }) {
  const series = useMemo(() => aggregate(data, widget), [data, widget]);
  const colors = GOOGLE_PALETTE.slice(widget.colorFrom ?? 0).concat(GOOGLE_PALETTE);

  if (widget.type === "scorecard") {
    const value = widget.agg === "count" && widget.dimension
      ? new Set(data.map((r) => String(r[widget.dimension!] ?? ""))).size - (data.some((r) => !r[widget.dimension!]) ? 1 : 0)
      : series[0]?.value ?? 0;
    return (
      <div className="h-full w-full flex flex-col justify-center px-4">
        <div className="text-[11px] uppercase tracking-wide text-[#5F6368] font-medium">{widget.title}</div>
        <div className="text-4xl font-semibold" style={{ color: colors[0] }}>{Number(value).toLocaleString()}</div>
        <div className="text-[11px] text-[#5F6368] mt-1">{widget.dimension ? `Distinct ${widget.dimension}` : "Rows"}</div>
      </div>
    );
  }

  if (series.length === 0) {
    return <div className="h-full flex items-center justify-center text-xs text-[#80868B]">No data for the selected filters</div>;
  }

  const top = series.slice(0, 15);
  const commonAxis = { tick: { fontSize: 11, fill: "#5F6368" }, axisLine: { stroke: "#DADCE0" } } as const;

  if (widget.type === "bar") return (
    <ResponsiveContainer>
      <BarChart data={top} layout="vertical" margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8EAED" horizontal={false} />
        <XAxis type="number" {...commonAxis} />
        <YAxis type="category" dataKey="name" width={110} {...commonAxis} />
        <Tooltip cursor={{ fill: "#F1F3F4" }} />
        <Bar dataKey="value" fill={colors[0]} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
  if (widget.type === "column") return (
    <ResponsiveContainer>
      <BarChart data={top}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8EAED" vertical={false} />
        <XAxis dataKey="name" {...commonAxis} interval={0} angle={-25} height={60} textAnchor="end" />
        <YAxis {...commonAxis} />
        <Tooltip cursor={{ fill: "#F1F3F4" }} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {top.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
  if (widget.type === "line" || widget.type === "area") {
    const sorted = [...series].sort((a, b) => a.name.localeCompare(b.name));
    const Comp = widget.type === "area" ? AreaChart : LineChart;
    return (
      <ResponsiveContainer>
        <Comp data={sorted}>
          <defs>
            <linearGradient id={`grad-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors[0]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={colors[0]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E8EAED" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#5F6368" }} tickFormatter={(v) => String(v).slice(0, 10)} />
          <YAxis {...commonAxis} />
          <Tooltip />
          {widget.showLegend && <Legend />}
          {widget.type === "area"
            ? <Area type="monotone" dataKey="value" stroke={colors[0]} fill={`url(#grad-${widget.id})`} strokeWidth={2} />
            : <Line type="monotone" dataKey="value" stroke={colors[0]} strokeWidth={2} dot={false} />}
        </Comp>
      </ResponsiveContainer>
    );
  }
  if (widget.type === "pie" || widget.type === "donut") return (
    <ResponsiveContainer>
      <PieChart>
        <Pie data={top} dataKey="value" nameKey="name" innerRadius={widget.type === "donut" ? 55 : 0} outerRadius={90} paddingAngle={2}>
          {top.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Pie>
        <Tooltip />
        {widget.showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
      </PieChart>
    </ResponsiveContainer>
  );
  if (widget.type === "geo") {
    const points = data
      .map((r) => (r._geolocation ?? (r as any).geolocation) as any)
      .filter((g) => Array.isArray(g) && g[0] != null);
    return (
      <div className="relative h-full w-full rounded bg-gradient-to-br from-[#E8F0FE] via-[#E6F4EA] to-[#FEF7E0] overflow-hidden">
        {points.map((g, i) => {
          const x = ((Number(g[1]) - 2) / 15) * 100;
          const y = 100 - ((Number(g[0]) - 4) / 10) * 100;
          return <div key={i} className="absolute w-2 h-2 rounded-full bg-[#4285F4] border border-white shadow" style={{ left: `${Math.min(98, Math.max(2, x))}%`, top: `${Math.min(98, Math.max(2, y))}%` }} />;
        })}
        <div className="absolute bottom-2 left-2 text-[10px] text-[#5F6368] bg-white/80 rounded px-2 py-1">
          <MapPin className="h-3 w-3 inline mr-1" />{points.length} georeferenced
        </div>
      </div>
    );
  }
  if (widget.type === "table") {
    // Show the first ~12 columns to keep the widget usable; the Raw Data tab has full width.
    const cols = columns.filter((c) => !c.system).slice(0, 8);
    return (
      <div className="h-full overflow-auto text-xs">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-[#F8F9FA] border-b border-[#DADCE0]">
            <tr>{cols.map((c) => <th key={c.key} className="text-left px-2 py-1.5 font-medium text-[#3C4043] whitespace-nowrap">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {data.slice(0, 200).map((r, i) => (
              <tr key={i} className="border-b border-[#F1F3F4] hover:bg-[#F8F9FA]">
                {cols.map((c) => {
                  const v = r[c.key];
                  const display = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
                  return <td key={c.key} className="px-2 py-1.5 max-w-[220px] truncate" title={display}>{display}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return null;
}

// ── Sortable widget card ───────────────────────────────────────────────────
function WidgetCard({ widget, data, columns, editMode, selected, onSelect, onDelete }:
  { widget: Widget; data: Record<string, unknown>[]; columns: KoboColumn[]; editMode: boolean; selected: boolean; onSelect: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id, disabled: !editMode });
  const rowH = 140;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, gridColumn: `span ${widget.colspan} / span ${widget.colspan}` }}
    >
      <div
        onClick={editMode ? onSelect : undefined}
        className={`bg-white rounded-lg border ${selected && editMode ? "border-[#4285F4] ring-2 ring-[#4285F4]/30" : "border-[#DADCE0]"} shadow-sm transition-all ${editMode ? "cursor-pointer hover:shadow-md" : ""} overflow-hidden`}
        style={{ height: rowH * widget.rowspan }}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#F1F3F4] bg-[#FAFBFC]">
          <div className="text-[13px] font-medium text-[#202124] truncate">{widget.title}</div>
          {editMode && (
            <div className="flex items-center gap-1">
              <button {...attributes} {...listeners} className="p-1 text-[#5F6368] hover:text-[#202124] cursor-grab active:cursor-grabbing"><GripVertical className="h-3.5 w-3.5" /></button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1 text-[#5F6368] hover:text-[#EA4335]"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
        <div className="w-full" style={{ height: rowH * widget.rowspan - 40 }}>
          <ChartBody widget={widget} data={data} columns={columns} />
        </div>
      </div>
    </div>
  );
}

// ── Field chip in the right panel ─────────────────────────────────────────
function FieldChip({ col, kind }: { col: KoboColumn; kind: "dimension" | "metric" }) {
  const isDim = kind === "dimension";
  const badge = isDim ? "bg-[#E8F0FE] text-[#1967D2] border-[#4285F4]/30" : "bg-[#E6F4EA] text-[#137333] border-[#34A853]/30";
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/kobo-field", JSON.stringify({ key: col.key, kind }))}
      className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs cursor-grab hover:shadow-sm ${badge}`}
    >
      <span className="font-mono text-[10px] font-bold">{typeIcon(col.type)}</span>
      <span className="truncate flex-1" title={col.path}>{col.label}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function SupervisoryDashboardView({ cache, onRefresh, syncing }:
  { cache: KoboCache | null; onRefresh: () => void; syncing: boolean }) {
  const rows = cache?.flatResults ?? [];
  const columns = useMemo<KoboColumn[]>(() => cache?.columns ?? (rows.length ? buildDataDictionary(rows) : []), [cache, rows]);
  const { dimensions, metrics } = partitionDimensionsMetrics(columns);

  const [widgets, setWidgets] = useState<Widget[]>(() => loadLayout<Widget[]>() ?? []);
  const [history, setHistory] = useState<Widget[][]>([]);
  const [redo, setRedo] = useState<Widget[][]>([]);
  const [editMode, setEditMode] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"data" | "setup" | "style">("data");
  const [fieldSearch, setFieldSearch] = useState("");
  const [docTitle, setDocTitle] = useState("Supervisory Microplanning Master Dashboard");

  // Filters
  const [f, setF] = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");

  // Initialize default layout once data is available
  useEffect(() => {
    if (widgets.length === 0 && columns.length > 0) {
      const initial = DEFAULT_LAYOUT(columns);
      setWidgets(initial);
      saveLayout(initial);
    }
  }, [columns, widgets.length]);

  const commit = (next: Widget[]) => {
    setHistory((h) => [...h.slice(-19), widgets]);
    setRedo([]);
    setWidgets(next);
    saveLayout(next);
  };
  const undo = () => setHistory((h) => {
    if (h.length === 0) return h;
    const prev = h[h.length - 1];
    setRedo((r) => [...r, widgets]);
    setWidgets(prev); saveLayout(prev);
    return h.slice(0, -1);
  });
  const redoAction = () => setRedo((r) => {
    if (r.length === 0) return r;
    const next = r[r.length - 1];
    setHistory((h) => [...h, widgets]);
    setWidgets(next); saveLayout(next);
    return r.slice(0, -1);
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      for (const [k, v] of Object.entries(f)) {
        if (!v) continue;
        const val = r[k];
        const s = val == null ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
        if (s !== v) return false;
      }
      if (dateFrom || dateTo) {
        const t = r._submission_time ? new Date(String(r._submission_time)).getTime() : 0;
        if (dateFrom && t < new Date(dateFrom).getTime()) return false;
        if (dateTo   && t > new Date(dateTo).getTime() + 86400000) return false;
      }
      if (globalSearch.trim()) {
        const q = globalSearch.toLowerCase();
        if (!JSON.stringify(r).toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, f, dateFrom, dateTo, globalSearch]);

  const selected = widgets.find((w) => w.id === selectedId) ?? null;
  const patch = (p: Partial<Widget>) => {
    if (!selected) return;
    commit(widgets.map((w) => (w.id === selected.id ? { ...w, ...p } : w)));
  };

  const addWidget = (type: WidgetType) => {
    const id = `w-${Date.now().toString(36)}`;
    const dim = dimensions[0]?.key;
    const w: Widget = {
      id, type,
      title: type === "scorecard" ? "New metric" : `New ${type}`,
      dimension: type === "scorecard" ? undefined : dim,
      agg: "count",
      colspan: type === "scorecard" ? 3 : type === "table" ? 12 : 6,
      rowspan: type === "scorecard" ? 1 : type === "table" ? 3 : 2,
      colorFrom: widgets.length % GOOGLE_PALETTE.length,
      showLegend: type === "pie" || type === "donut",
    };
    commit([...widgets, w]);
    setSelectedId(id);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = widgets.findIndex((w) => w.id === active.id);
    const newI = widgets.findIndex((w) => w.id === over.id);
    commit(arrayMove(widgets, oldI, newI));
  };

  // Drag a field from the right panel onto the selected widget
  const onCanvasDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData("text/kobo-field");
    if (!raw || !selected) return;
    try {
      const { key, kind } = JSON.parse(raw) as { key: string; kind: "dimension" | "metric" };
      if (kind === "dimension") patch({ dimension: key });
      else patch({ metric: key, agg: selected.agg ?? "sum" });
    } catch { /* ignore */ }
  };

  const exportCSV = () => {
    const headers = columns.map((c) => c.key);
    const csv = [headers.join(","), ...filteredRows.map((r) =>
      headers.map((h) => {
        const v = r[h];
        const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(","),
    )].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${docTitle.replace(/\s+/g, "_").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Filter control candidates (categorical dims with reasonable cardinality)
  const filterableDims = useMemo(() => {
    return dimensions
      .filter((c) => !c.system || c.key === "_submitted_by")
      .filter((c) => /state|lga|ward|flhf|facility|enumerator|supervisor|community/i.test(c.label) || c.key === "_submitted_by")
      .slice(0, 6);
  }, [dimensions]);
  const filterOptions = (key: string): string[] => {
    const s = new Set<string>();
    for (const r of rows) {
      const v = r[key];
      if (v == null || v === "") continue;
      s.add(typeof v === "object" ? JSON.stringify(v) : String(v));
      if (s.size > 300) break;
    }
    return [...s].sort();
  };

  const shownFields = useMemo(() => {
    const q = fieldSearch.toLowerCase();
    if (!q) return columns;
    return columns.filter((c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q));
  }, [columns, fieldSearch]);

  return (
    <div className="min-h-[calc(100vh-14rem)] bg-[#F8F9FA] -m-4 rounded-lg border border-[#DADCE0]">
      {/* Google-style top bar */}
      <div className="bg-white border-b border-[#DADCE0] px-4 py-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <LayoutGrid className="h-5 w-5 text-[#4285F4]" />
          <input
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            className="text-[15px] font-medium text-[#202124] bg-transparent border-b border-transparent hover:border-[#DADCE0] focus:border-[#4285F4] outline-none px-1"
          />
          <Badge variant="outline" className="border-[#DADCE0] text-[#5F6368]">Page 1 of 1</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={history.length === 0}><Undo2 className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redoAction} disabled={redo.length === 0}><Redo2 className="h-4 w-4" /></Button>
          <div className="w-px h-6 bg-[#DADCE0] mx-1" />
          <Button variant="ghost" size="sm" className="h-8" onClick={onRefresh} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />} Refresh Data
          </Button>
          {editMode && (
            <>
              <div className="w-px h-6 bg-[#DADCE0] mx-1" />
              <Select onValueChange={(v) => addWidget(v as WidgetType)}>
                <SelectTrigger className="h-8 w-[140px] bg-[#4285F4] text-white border-[#4285F4] hover:bg-[#3367D6]">
                  <div className="flex items-center gap-1 text-xs"><Plus className="h-3.5 w-3.5" /> Add a chart</div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scorecard"><Circle className="inline h-3 w-3 mr-2" />Scorecard</SelectItem>
                  <SelectItem value="column"><BarChart3 className="inline h-3 w-3 mr-2" />Column chart</SelectItem>
                  <SelectItem value="bar"><BarChart3 className="inline h-3 w-3 mr-2 rotate-90" />Bar chart</SelectItem>
                  <SelectItem value="line"><LineIcon className="inline h-3 w-3 mr-2" />Line chart</SelectItem>
                  <SelectItem value="area"><LineIcon className="inline h-3 w-3 mr-2" />Time series</SelectItem>
                  <SelectItem value="pie"><PieIcon className="inline h-3 w-3 mr-2" />Pie chart</SelectItem>
                  <SelectItem value="donut"><PieIcon className="inline h-3 w-3 mr-2" />Donut chart</SelectItem>
                  <SelectItem value="table"><TableIcon className="inline h-3 w-3 mr-2" />Data table</SelectItem>
                  <SelectItem value="geo"><MapPin className="inline h-3 w-3 mr-2" />Geo map</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          <Button variant="ghost" size="sm" className="h-8" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> Export</Button>
          <div className="w-px h-6 bg-[#DADCE0] mx-1" />
          <Button
            variant={editMode ? "secondary" : "outline"} size="sm" className="h-8"
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? <><Eye className="h-4 w-4 mr-1" /> View</> : <><Pencil className="h-4 w-4 mr-1" /> Edit</>}
          </Button>
        </div>
      </div>

      {/* Filter control strip */}
      <div className="bg-white border-b border-[#DADCE0] px-4 py-2 flex flex-wrap items-center gap-2">
        {filterableDims.map((c) => (
          <Select key={c.key} value={f[c.key] ?? "__all"} onValueChange={(v) => setF((prev) => ({ ...prev, [c.key]: v === "__all" ? "" : v }))}>
            <SelectTrigger className="h-8 w-[150px] text-xs border-[#DADCE0] bg-white"><SelectValue placeholder={c.label} /></SelectTrigger>
            <SelectContent><SelectItem value="__all">All {c.label}</SelectItem>{filterOptions(c.key).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        ))}
        <div className="flex items-center gap-1 text-xs text-[#5F6368]">
          <span>Date</span>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-[140px] text-xs" />
          <span>→</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-[140px] text-xs" />
        </div>
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-2 h-4 w-4 text-[#5F6368]" />
          <Input placeholder="Search all fields…" value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} className="h-8 pl-8 w-64 text-xs" />
        </div>
        <Badge variant="outline" className="border-[#DADCE0] text-[#5F6368]">{filteredRows.length.toLocaleString()} / {rows.length.toLocaleString()} rows</Badge>
      </div>

      {/* Canvas + right panel */}
      <div className="flex" style={{ minHeight: 600 }}>
        <div
          className="flex-1 p-6"
          style={editMode ? { backgroundImage: "radial-gradient(#E8EAED 1px, transparent 1px)", backgroundSize: "16px 16px" } : undefined}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onCanvasDrop}
        >
          {rows.length === 0 ? (
            <Card className="p-10 text-center text-sm text-[#5F6368] border-[#DADCE0]">
              No submissions yet. Open <b>Kobo Sync</b> to link a form and run <b>Sync Now</b>.
            </Card>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-12 gap-4">
                  {widgets.map((w) => (
                    <WidgetCard
                      key={w.id} widget={w} data={filteredRows} columns={columns}
                      editMode={editMode} selected={selectedId === w.id}
                      onSelect={() => setSelectedId(w.id)}
                      onDelete={() => commit(widgets.filter((x) => x.id !== w.id))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {editMode && (
          <aside className="w-[300px] shrink-0 bg-white border-l border-[#DADCE0]">
            <Tabs value={panelTab} onValueChange={(v) => setPanelTab(v as any)} className="h-full flex flex-col">
              <TabsList className="w-full justify-start rounded-none border-b border-[#DADCE0] bg-transparent p-0 h-auto">
                <TabsTrigger value="data"  className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#4285F4] data-[state=active]:text-[#1967D2] data-[state=active]:bg-transparent"><Sliders className="h-3.5 w-3.5 mr-1" /> Data</TabsTrigger>
                <TabsTrigger value="setup" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#4285F4] data-[state=active]:text-[#1967D2] data-[state=active]:bg-transparent"><Settings2 className="h-3.5 w-3.5 mr-1" /> Setup</TabsTrigger>
                <TabsTrigger value="style" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#4285F4] data-[state=active]:text-[#1967D2] data-[state=active]:bg-transparent"><Palette className="h-3.5 w-3.5 mr-1" /> Style</TabsTrigger>
              </TabsList>

              <TabsContent value="data" className="flex-1 overflow-y-auto p-3 space-y-3 m-0">
                <div className="text-[11px] uppercase font-medium text-[#5F6368]">Data source</div>
                <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-[#DADCE0] bg-[#F8F9FA] text-xs">
                  <Grid3x3 className="h-4 w-4 text-[#4285F4]" />
                  <div className="truncate flex-1">
                    <div className="font-medium">{cache?.formTitle ?? "KoboToolbox"}</div>
                    <div className="text-[10px] text-[#5F6368]">{columns.length} fields · {rows.length.toLocaleString()} rows</div>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-[#5F6368]" />
                  <Input value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)} placeholder="Search fields" className="h-8 pl-7 text-xs" />
                </div>

                <details open>
                  <summary className="text-[11px] font-semibold text-[#1967D2] uppercase cursor-pointer">Dimensions ({shownFields.filter((c) => c.type !== "number").length})</summary>
                  <div className="mt-2 space-y-1">
                    {shownFields.filter((c) => c.type !== "number").slice(0, 200).map((c) => <FieldChip key={c.key} col={c} kind="dimension" />)}
                  </div>
                </details>
                <details open>
                  <summary className="text-[11px] font-semibold text-[#137333] uppercase cursor-pointer">Metrics ({shownFields.filter((c) => c.type === "number").length})</summary>
                  <div className="mt-2 space-y-1">
                    {shownFields.filter((c) => c.type === "number").slice(0, 200).map((c) => <FieldChip key={c.key} col={c} kind="metric" />)}
                    {shownFields.filter((c) => c.type === "number").length === 0 && <div className="text-[11px] text-[#5F6368] italic">No numeric fields detected — use count aggregations.</div>}
                  </div>
                </details>
              </TabsContent>

              <TabsContent value="setup" className="flex-1 overflow-y-auto p-3 space-y-4 m-0">
                {!selected ? (
                  <div className="text-xs text-[#5F6368]">Select a chart on the canvas to edit its setup.</div>
                ) : (
                  <>
                    <div>
                      <div className="text-[11px] uppercase font-medium text-[#5F6368] mb-1">Chart title</div>
                      <Input value={selected.title} onChange={(e) => patch({ title: e.target.value })} className="h-8 text-xs" />
                    </div>
                    <div>
                      <div className="text-[11px] uppercase font-medium text-[#5F6368] mb-1">Chart type</div>
                      <Select value={selected.type} onValueChange={(v) => patch({ type: v as WidgetType })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["scorecard","column","bar","line","area","pie","donut","table","geo"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase font-medium text-[#5F6368] mb-1">Dimension</div>
                      <Select value={selected.dimension ?? "__none"} onValueChange={(v) => patch({ dimension: v === "__none" ? undefined : v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose a dimension" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">— None (row count) —</SelectItem>
                          {dimensions.map((c) => <SelectItem key={c.key} value={c.key}>{typeIcon(c.type)}  {c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase font-medium text-[#5F6368] mb-1">Metric</div>
                      <Select value={selected.metric ?? "__count"} onValueChange={(v) => patch({ metric: v === "__count" ? undefined : v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__count">Record count</SelectItem>
                          {metrics.map((c) => <SelectItem key={c.key} value={c.key}>Σ {c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase font-medium text-[#5F6368] mb-1">Aggregation</div>
                      <Select value={selected.agg ?? "count"} onValueChange={(v) => patch({ agg: v as any })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["count","sum","avg","min","max"].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="style" className="flex-1 overflow-y-auto p-3 space-y-4 m-0">
                {!selected ? (
                  <div className="text-xs text-[#5F6368]">Select a chart to style it.</div>
                ) : (
                  <>
                    <div>
                      <div className="text-[11px] uppercase font-medium text-[#5F6368] mb-1">Width</div>
                      <div className="flex gap-1">
                        {[3, 4, 6, 8, 12].map((n) => (
                          <button key={n} onClick={() => patch({ colspan: n as Widget["colspan"] })}
                            className={`flex-1 h-8 rounded text-xs ${selected.colspan === n ? "bg-[#4285F4] text-white" : "bg-[#F1F3F4] text-[#3C4043] hover:bg-[#E8EAED]"}`}>
                            {n === 3 ? "¼" : n === 4 ? "⅓" : n === 6 ? "½" : n === 8 ? "⅔" : "Full"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase font-medium text-[#5F6368] mb-1">Height</div>
                      <div className="flex gap-1">
                        {[1, 2, 3].map((n) => (
                          <button key={n} onClick={() => patch({ rowspan: n as Widget["rowspan"] })}
                            className={`flex-1 h-8 rounded text-xs ${selected.rowspan === n ? "bg-[#4285F4] text-white" : "bg-[#F1F3F4] text-[#3C4043] hover:bg-[#E8EAED]"}`}>
                            {n === 1 ? "Short" : n === 2 ? "Medium" : "Tall"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase font-medium text-[#5F6368] mb-1">Palette</div>
                      <div className="flex flex-wrap gap-1">
                        {GOOGLE_PALETTE.map((c, i) => (
                          <button key={c} onClick={() => patch({ colorFrom: i })}
                            className={`h-6 w-6 rounded-full border-2 ${selected.colorFrom === i ? "border-[#202124]" : "border-white"}`}
                            style={{ backgroundColor: c }} />
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-[#3C4043]">
                      <input type="checkbox" checked={!!selected.showLegend} onChange={(e) => patch({ showLegend: e.target.checked })} />
                      Show legend
                    </label>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </aside>
        )}
      </div>
    </div>
  );
}
