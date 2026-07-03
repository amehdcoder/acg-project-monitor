import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  BarChart3, BarChartHorizontal, LineChart, AreaChart, PieChart, Activity,
  Table2, Hash, Type, ScatterChart, Layers, Gauge, TreePine, Grid3x3, Trash2,
} from "lucide-react";
import type { StudioChartType, StudioWidgetConfig, Aggregation } from "@/lib/dashboardStudio/aggregate";
import { DEFAULT_PALETTE } from "@/lib/dashboardStudio/aggregate";
import type { DashboardDataSource, SourceField } from "@/lib/dashboardStudio/types";

const CHART_TYPES: { type: StudioChartType; label: string; icon: any }[] = [
  { type: "column", label: "Column", icon: BarChart3 },
  { type: "bar", label: "Bar", icon: BarChartHorizontal },
  { type: "line", label: "Line", icon: LineChart },
  { type: "area", label: "Area", icon: AreaChart },
  { type: "combo", label: "Combo", icon: Layers },
  { type: "pie", label: "Pie", icon: PieChart },
  { type: "donut", label: "Donut", icon: PieChart },
  { type: "scorecard", label: "Scorecard", icon: Hash },
  { type: "gauge", label: "Gauge", icon: Gauge },
  { type: "scatter", label: "Scatter", icon: ScatterChart },
  { type: "radar", label: "Radar", icon: Activity },
  { type: "treemap", label: "Treemap", icon: TreePine },
  { type: "table", label: "Table", icon: Table2 },
  { type: "pivot", label: "Pivot", icon: Grid3x3 },
  { type: "text", label: "Text", icon: Type },
];

const AGGS: Aggregation[] = ["count", "sum", "avg", "min", "max", "count_distinct"];
const PALETTES: Record<string, string[]> = {
  Default: DEFAULT_PALETTE,
  Ocean: ["#0ea5e9", "#0284c7", "#0369a1", "#075985", "#38bdf8", "#7dd3fc"],
  Forest: ["#16a34a", "#15803d", "#22c55e", "#4ade80", "#065f46", "#84cc16"],
  Sunset: ["#f97316", "#ea580c", "#f59e0b", "#ef4444", "#ec4899", "#eab308"],
  Grape: ["#8b5cf6", "#7c3aed", "#a855f7", "#c084fc", "#6366f1", "#d946ef"],
};

interface Props {
  config: StudioWidgetConfig;
  title: string;
  sources: DashboardDataSource[];
  onChange: (patch: Partial<StudioWidgetConfig>) => void;
  onTitleChange: (t: string) => void;
  onDelete: () => void;
}

export default function WidgetPropertiesPanel({ config, title, sources, onChange, onTitleChange, onDelete }: Props) {
  const source = sources.find((s) => s.id === config.dataSourceId);
  const fields: SourceField[] = source?.schema ?? [];
  const numericFields = fields.filter((f) => f.type === "number");
  const style = config.style ?? {};
  const setStyle = (patch: Partial<typeof style>) => onChange({ style: { ...style, ...patch } });

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <Label className="text-xs">Chart title</Label>
        <Input value={title} onChange={(e) => onTitleChange(e.target.value)} className="h-8" />
      </div>

      <Tabs defaultValue="setup" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-3 mt-3 grid grid-cols-2">
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="style">Style</TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="flex-1 space-y-4 overflow-y-auto p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Chart type</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {CHART_TYPES.map(({ type, label, icon: Icon }) => (
                <button key={type} onClick={() => onChange({ chartType: type })}
                  className={`flex flex-col items-center gap-1 rounded-md border p-2 text-[10px] transition-colors ${
                    config.chartType === type ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                  }`}>
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          </div>

          {config.chartType === "text" ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Text content</Label>
              <Textarea value={config.textContent ?? ""} onChange={(e) => onChange({ textContent: e.target.value })} rows={5} />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Data source</Label>
                <Select value={config.dataSourceId ?? ""} onValueChange={(v) => onChange({ dataSourceId: v })}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Select data source" /></SelectTrigger>
                  <SelectContent>{sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {config.chartType !== "scorecard" && config.chartType !== "gauge" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Dimension (group by)</Label>
                  <Select value={config.dimension ?? ""} onValueChange={(v) => onChange({ dimension: v })}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Select field" /></SelectTrigger>
                    <SelectContent>{fields.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Metric</Label>
                  <Select value={config.metric ?? "__count"} onValueChange={(v) => onChange({ metric: v === "__count" ? undefined : v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__count">Record count</SelectItem>
                      {numericFields.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Aggregation</Label>
                  <Select value={config.aggregation ?? "count"} onValueChange={(v) => onChange({ aggregation: v as Aggregation })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{AGGS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              {config.chartType === "scatter" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Y axis field</Label>
                  <Select value={config.compareField ?? ""} onValueChange={(v) => onChange({ compareField: v })}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Select field" /></SelectTrigger>
                    <SelectContent>{numericFields.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              {(config.chartType === "combo" || config.chartType === "column" || config.chartType === "bar" || config.chartType === "line" || config.chartType === "table") && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">2nd metric</Label>
                    <Select value={config.secondaryMetric ?? "__none"} onValueChange={(v) => onChange({ secondaryMetric: v === "__none" ? undefined : v })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">None</SelectItem>
                        {numericFields.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">2nd agg</Label>
                    <Select value={config.secondaryAggregation ?? "sum"} onValueChange={(v) => onChange({ secondaryAggregation: v as Aggregation })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{AGGS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {(config.chartType === "scorecard" || config.chartType === "gauge") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Target (optional)</Label>
                  <Input type="number" value={config.kpiTarget ?? ""} onChange={(e) => onChange({ kpiTarget: e.target.value ? Number(e.target.value) : undefined })} className="h-8" />
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="style" className="flex-1 space-y-4 overflow-y-auto p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Color palette</Label>
            <div className="space-y-1.5">
              {Object.entries(PALETTES).map(([label, colors]) => (
                <button key={label} onClick={() => setStyle({ palette: colors })}
                  className={`flex w-full items-center gap-2 rounded-md border p-1.5 ${JSON.stringify(style.palette) === JSON.stringify(colors) ? "border-primary" : "border-border"}`}>
                  <div className="flex gap-0.5">{colors.slice(0, 6).map((c) => <span key={c} className="h-4 w-4 rounded-sm" style={{ background: c }} />)}</div>
                  <span className="text-[11px]">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between"><Label className="text-xs">Show legend</Label>
            <Switch checked={style.showLegend !== false} onCheckedChange={(v) => setStyle({ showLegend: v })} /></div>
          <div className="flex items-center justify-between"><Label className="text-xs">Show gridlines</Label>
            <Switch checked={style.showGrid !== false} onCheckedChange={(v) => setStyle({ showGrid: v })} /></div>
          <div className="flex items-center justify-between"><Label className="text-xs">Data labels</Label>
            <Switch checked={!!style.showDataLabels} onCheckedChange={(v) => setStyle({ showDataLabels: v })} /></div>
          <div className="flex items-center justify-between"><Label className="text-xs">Stacked</Label>
            <Switch checked={!!style.stacked} onCheckedChange={(v) => setStyle({ stacked: v })} /></div>
          <div className="flex items-center justify-between"><Label className="text-xs">Smooth lines</Label>
            <Switch checked={!!style.smooth} onCheckedChange={(v) => setStyle({ smooth: v })} /></div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Number format</Label>
              <Select value={style.numberFormat ?? "plain"} onValueChange={(v) => setStyle({ numberFormat: v as any })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="plain">Plain</SelectItem>
                  <SelectItem value="comma">Comma</SelectItem>
                  <SelectItem value="percent">Percent</SelectItem>
                  <SelectItem value="currency">Currency (₦)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sort</Label>
              <Select value={style.sortDir ?? "desc"} onValueChange={(v) => setStyle({ sortDir: v as any })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">High → Low</SelectItem>
                  <SelectItem value="asc">Low → High</SelectItem>
                  <SelectItem value="none">Unsorted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Limit rows (0 = all)</Label>
            <Input type="number" value={style.limit ?? 0} onChange={(e) => setStyle({ limit: Number(e.target.value) })} className="h-8" />
          </div>
        </TabsContent>
      </Tabs>

      <div className="border-t border-border p-3">
        <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" /> Delete chart
        </Button>
      </div>
    </div>
  );
}
