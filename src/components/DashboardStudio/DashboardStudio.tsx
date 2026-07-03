import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, Plus, Database, Eye, Pencil, Save, Loader2, Trash2, GripVertical,
  FileText, Sheet, Upload, Globe, Sparkles,
} from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, useSortable, rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDashboardSources, resolveSourceRows } from "@/hooks/useDashboardSources";
import AddDataSourceDialog from "./AddDataSourceDialog";
import StudioWidgetRenderer from "./StudioWidgetRenderer";
import WidgetPropertiesPanel from "./WidgetPropertiesPanel";
import type { StudioWidgetConfig } from "@/lib/dashboardStudio/aggregate";
import type { DashboardDataSource } from "@/lib/dashboardStudio/types";

const SOURCE_ICON: Record<string, any> = {
  form: FileText, table: Database, google_sheet: Sheet, csv_upload: Upload, rest_api: Globe,
};

interface StudioWidget {
  id: string;
  dashboard_id: string;
  title: string;
  widget_type: string;
  config: StudioWidgetConfig;
  position: { order: number; w: number };
}

interface Props {
  dashboardId: string;
  dashboardName: string;
  onBack: () => void;
}

function SortableCard({
  widget, rows, editMode, selected, onSelect,
}: {
  widget: StudioWidget; rows: Record<string, unknown>[]; editMode: boolean;
  selected: boolean; onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id, disabled: !editMode });
  const span = widget.position?.w ?? 6;
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, gridColumn: `span ${span} / span ${span}`, opacity: isDragging ? 0.5 : 1 }}
      className={`${span >= 12 ? "col-span-full" : ""}`}>
      <Card onClick={editMode ? onSelect : undefined}
        className={`flex h-[300px] flex-col overflow-hidden transition-all ${editMode ? "cursor-pointer hover:shadow-md" : ""} ${selected ? "ring-2 ring-primary" : ""}`}>
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <div className="truncate text-sm font-semibold">{widget.title}</div>
          {editMode && <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground"><GripVertical className="h-4 w-4" /></span>}
        </div>
        <div className="flex-1 overflow-hidden p-2">
          <StudioWidgetRenderer config={widget.config} title={widget.title} rows={rows} />
        </div>
      </Card>
    </div>
  );
}

export default function DashboardStudio({ dashboardId, dashboardName, onBack }: Props) {
  const { user } = useAuth();
  const { sources, deleteSource, fetchSources } = useDashboardSources();
  const [widgets, setWidgets] = useState<StudioWidget[]>([]);
  const [rowsBySource, setRowsBySource] = useState<Record<string, Record<string, unknown>[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(true);
  const [showAddSource, setShowAddSource] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const loadWidgets = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("dashboard_widgets").select("*").eq("dashboard_id", dashboardId);
    const parsed: StudioWidget[] = (data ?? []).map((w: any) => ({
      id: w.id, dashboard_id: w.dashboard_id, title: w.title, widget_type: w.widget_type,
      config: (typeof w.config === "string" ? JSON.parse(w.config) : w.config) ?? {},
      position: (typeof w.position === "string" ? JSON.parse(w.position) : w.position) ?? { order: 0, w: 6 },
    }));
    parsed.sort((a, b) => (a.position.order ?? 0) - (b.position.order ?? 0));
    setWidgets(parsed);
    setLoading(false);
  }, [dashboardId]);

  useEffect(() => { loadWidgets(); }, [loadWidgets]);

  // Resolve rows for every source referenced by a widget.
  useEffect(() => {
    const needed = new Set(widgets.map((w) => w.config.dataSourceId).filter(Boolean) as string[]);
    needed.forEach(async (sid) => {
      if (rowsBySource[sid]) return;
      const src = sources.find((s) => s.id === sid);
      if (!src) return;
      const rows = await resolveSourceRows(src);
      setRowsBySource((prev) => ({ ...prev, [sid]: rows }));
    });
  }, [widgets, sources, rowsBySource]);

  const selected = widgets.find((w) => w.id === selectedId) ?? null;

  const addWidget = async () => {
    const order = widgets.length;
    const config: StudioWidgetConfig = { chartType: "column", aggregation: "count", dataSourceId: sources[0]?.id };
    const { data, error } = await supabase.from("dashboard_widgets").insert([{
      dashboard_id: dashboardId, title: "New chart", widget_type: "column",
      config: config as any, position: { order, w: 6 } as any,
    }]).select().single();
    if (error) { toast.error("Failed to add chart"); return; }
    await loadWidgets();
    setSelectedId((data as any).id);
    setEditMode(true);
  };

  const patchWidget = (id: string, patch: Partial<StudioWidget>) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  };

  const updateConfig = (patch: Partial<StudioWidgetConfig>) => {
    if (!selected) return;
    patchWidget(selected.id, { config: { ...selected.config, ...patch }, widget_type: patch.chartType ?? selected.widget_type });
  };

  const saveWidget = async (w: StudioWidget) => {
    await supabase.from("dashboard_widgets").update({
      title: w.title, widget_type: w.config.chartType ?? w.widget_type,
      config: w.config as any, position: w.position as any,
    }).eq("id", w.id);
  };

  const saveAll = async () => {
    setSaving(true);
    await Promise.all(widgets.map((w, i) => saveWidget({ ...w, position: { ...w.position, order: i } })));
    setSaving(false);
    toast.success("Dashboard saved");
  };

  const deleteWidget = async (id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    setSelectedId(null);
    await supabase.from("dashboard_widgets").delete().eq("id", id);
    toast.success("Chart deleted");
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setWidgets((prev) => {
      const oldI = prev.findIndex((w) => w.id === active.id);
      const newI = prev.findIndex((w) => w.id === over.id);
      return arrayMove(prev, oldI, newI);
    });
  };

  const setWidgetWidth = (id: string, w: number) => {
    const wid = widgets.find((x) => x.id === id);
    if (wid) patchWidget(id, { position: { ...wid.position, w } });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <div className="flex items-center gap-2 font-display text-lg font-bold">
              <Sparkles className="h-4 w-4 text-primary" /> {dashboardName}
            </div>
            <div className="text-xs text-muted-foreground">Dashboard Studio · Looker-style editor</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={editMode ? "secondary" : "outline"} size="sm" onClick={() => setEditMode((v) => !v)}>
            {editMode ? <><Eye className="mr-2 h-4 w-4" /> View</> : <><Pencil className="mr-2 h-4 w-4" /> Edit</>}
          </Button>
          <Button size="sm" onClick={saveAll} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left rail: data sources */}
        {editMode && (
          <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-muted/20">
            <div className="flex items-center justify-between border-b border-border p-3">
              <span className="text-sm font-semibold">Data sources</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowAddSource(true)}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
              {sources.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">No data sources yet. Click + to connect app forms, tables, Google Sheets, files or APIs.</p>
              )}
              {sources.map((s) => {
                const Icon = SOURCE_ICON[s.source_kind] ?? Database;
                return (
                  <div key={s.id} className="group flex items-center gap-2 rounded-md border border-border bg-background p-2">
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{s.name}</div>
                      <div className="text-[10px] text-muted-foreground">{s.schema?.length ?? 0} fields</div>
                    </div>
                    <button onClick={() => deleteSource(s.id)} className="opacity-0 transition-opacity group-hover:opacity-100">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border p-2">
              <Button variant="secondary" size="sm" className="w-full" onClick={addWidget} disabled={sources.length === 0}>
                <Plus className="mr-2 h-4 w-4" /> Add a chart
              </Button>
            </div>
          </aside>
        )}

        {/* Center canvas */}
        <main className="flex-1 overflow-y-auto bg-muted/10 p-4">
          {loading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : widgets.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Database className="h-12 w-12 text-muted-foreground/40" />
              <div className="text-sm text-muted-foreground">This dashboard is empty.</div>
              <Button onClick={addWidget} disabled={sources.length === 0}><Plus className="mr-2 h-4 w-4" /> Add your first chart</Button>
              {sources.length === 0 && <Button variant="outline" onClick={() => setShowAddSource(true)}><Database className="mr-2 h-4 w-4" /> Connect a data source</Button>}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-12 gap-4">
                  {widgets.map((w) => (
                    <SortableCard key={w.id} widget={w} rows={w.config.dataSourceId ? rowsBySource[w.config.dataSourceId] ?? [] : []}
                      editMode={editMode} selected={selectedId === w.id} onSelect={() => setSelectedId(w.id)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </main>

        {/* Right rail: properties */}
        {editMode && selected && (
          <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-background">
            <div className="flex items-center gap-1 border-b border-border p-2">
              <span className="px-1 text-xs font-semibold uppercase text-muted-foreground">Properties</span>
              <div className="ml-auto flex items-center gap-1">
                {[4, 6, 12].map((w) => (
                  <button key={w} onClick={() => setWidgetWidth(selected.id, w)}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${selected.position.w === w ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {w === 4 ? "⅓" : w === 6 ? "½" : "Full"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <WidgetPropertiesPanel
                config={selected.config} title={selected.title} sources={sources}
                onChange={updateConfig}
                onTitleChange={(t) => patchWidget(selected.id, { title: t })}
                onDelete={() => deleteWidget(selected.id)}
              />
            </div>
          </aside>
        )}
      </div>

      <AddDataSourceDialog open={showAddSource} onClose={() => setShowAddSource(false)} />
    </div>
  );
}
