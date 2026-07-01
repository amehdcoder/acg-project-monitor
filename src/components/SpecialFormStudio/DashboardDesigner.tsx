import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical, Plus, Trash2, Gauge, BarChart3, PieChart, Table2, Filter,
  LayoutDashboard, Hash, ListChecks, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { FormGroup } from "@/components/FormBuilder/types";
import {
  flatQuestions, isNumeric, isCategorical, isGeoLike,
  ensureWidgets, reconcileWidgets, newWidget,
} from "@/lib/specialStudio/dashboardSync";
import type { DashboardConfig, DashboardWidget, WidgetKind } from "@/lib/specialStudio/presets";

const KIND_META: Record<WidgetKind, { label: string; icon: typeof Gauge }> = {
  kpi: { label: "KPI card", icon: Gauge },
  bar: { label: "Bar chart", icon: BarChart3 },
  donut: { label: "Donut chart", icon: PieChart },
  table: { label: "Table", icon: Table2 },
  filter: { label: "Filter", icon: Filter },
};

function SortableWidget({
  w, label, onPatch, onDelete,
}: {
  w: DashboardWidget;
  label: string;
  onPatch: (patch: Partial<DashboardWidget>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id });
  const Icon = KIND_META[w.kind].icon;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="rounded-lg border border-border bg-card p-2.5 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground touch-none">
          <GripVertical className="h-4 w-4" />
        </button>
        <Icon className="h-4 w-4 shrink-0" style={{ color: w.color || "#6366f1" }} />
        <Input value={w.title} onChange={(e) => onPatch({ title: e.target.value })} className="h-7 flex-1 text-xs" />
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <select
          className="h-7 rounded-md border border-border bg-background px-1 text-[11px]"
          value={w.kind}
          onChange={(e) => onPatch({ kind: e.target.value as WidgetKind })}
        >
          {(Object.keys(KIND_META) as WidgetKind[]).map((k) => (
            <option key={k} value={k}>{KIND_META[k].label}</option>
          ))}
        </select>
        <select
          className="h-7 rounded-md border border-border bg-background px-1 text-[11px]"
          value={w.agg}
          onChange={(e) => onPatch({ agg: e.target.value as DashboardWidget["agg"] })}
        >
          <option value="count">Count</option>
          <option value="sum">Sum</option>
          <option value="avg">Average</option>
          <option value="distinct">Distinct</option>
        </select>
        <div className="col-span-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">Field: {w.field ? label : "— (all submissions)"}</span>
        </div>
        <label className="flex items-center gap-1 text-[11px]">
          <input
            type="checkbox"
            checked={w.span === 2}
            onChange={(e) => onPatch({ span: e.target.checked ? 2 : 1 })}
          />
          Full width
        </label>
        <input
          type="color"
          value={w.color || "#6366f1"}
          onChange={(e) => onPatch({ color: e.target.value })}
          className="h-7 w-full cursor-pointer rounded-md border border-border bg-background"
        />
      </div>
    </div>
  );
}

export default function DashboardDesigner({
  enabled, setEnabled, sections, config, onConfigChange,
}: {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  sections: FormGroup[];
  config: DashboardConfig | null;
  onConfigChange: (c: DashboardConfig | null) => void;
}) {
  const questions = flatQuestions(sections).filter((q) => q.name);
  const labelFor = (name?: string) => questions.find((q) => q.name === name)?.label || name || "—";
  const cfg: DashboardConfig = config || { enabled: true, kpiFields: [], accent: "#6366f1" };
  const accent = cfg.layout?.accent || cfg.accent || "#6366f1";
  const widgets = reconcileWidgets(sections, ensureWidgets(cfg));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [paletteKind, setPaletteKind] = useState<WidgetKind>("kpi");

  const setWidgets = (next: DashboardWidget[]) =>
    onConfigChange({ ...cfg, enabled: true, widgets: next, accent, layout: { ...(cfg.layout || {}), accent } });

  const addWidget = (field: string | undefined, defaultKind: WidgetKind) => {
    const kind = paletteKind || defaultKind;
    const title = field ? labelFor(field) : kind === "kpi" ? "Submissions" : KIND_META[kind].label;
    setWidgets([...widgets, newWidget(kind, field, title, accent)]);
  };

  const patchWidget = (id: string, patch: Partial<DashboardWidget>) =>
    setWidgets(widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  const dragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = widgets.map((w) => w.id);
    const oi = ids.indexOf(active.id as string);
    const ni = ids.indexOf(over.id as string);
    if (oi < 0 || ni < 0) return;
    setWidgets(arrayMove(widgets, oi, ni));
  };

  if (!enabled) {
    return (
      <div className="space-y-3 pt-6 text-center">
        <Gauge className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">The linked live dashboard is turned off for this form.</p>
        <Button size="sm" onClick={() => setEnabled(true)} className="gap-1">
          <LayoutDashboard className="h-4 w-4" /> Enable linked dashboard
        </Button>
      </div>
    );
  }

  const numeric = questions.filter(isNumeric);
  const categorical = questions.filter(isCategorical);
  const geoish = questions.filter(isGeoLike);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
        Drag to reorder. Pick a widget type, then click any field below to add a KPI card, chart, table or filter.
        Layout &amp; colors are saved with this template.
      </div>

      {/* Add-widget palette */}
      <div>
        <Label className="text-xs font-semibold">New widget type</Label>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {(Object.keys(KIND_META) as WidgetKind[]).map((k) => {
            const Icon = KIND_META[k].icon;
            return (
              <button
                key={k}
                onClick={() => setPaletteKind(k)}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
                  paletteKind === k ? "border-primary bg-accent" : "border-border bg-background"
                }`}
              >
                <Icon className="h-3 w-3" /> {KIND_META[k].label}
              </button>
            );
          })}
        </div>
        <div className="mt-2 space-y-2">
          <button
            onClick={() => addWidget(undefined, "kpi")}
            className="flex w-full items-center gap-1 rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] hover:bg-accent"
          >
            <Plus className="h-3 w-3" /> Submission count / all rows
          </button>
          <FieldGroup title="Number fields" icon={Hash} items={numeric} onAdd={(n) => addWidget(n, "kpi")} />
          <FieldGroup title="Choice / status fields" icon={ListChecks} items={categorical} onAdd={(n) => addWidget(n, "donut")} />
          <FieldGroup title="Location fields" icon={MapPin} items={geoish} onAdd={(n) => addWidget(n, "bar")} />
        </div>
      </div>

      {/* Current widgets */}
      <div>
        <Label className="text-xs font-semibold">Dashboard widgets ({widgets.length})</Label>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
          <SortableContext items={widgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            <div className="mt-1.5 space-y-1.5">
              {widgets.length === 0 && (
                <p className="rounded-lg border border-dashed border-border py-4 text-center text-[11px] text-muted-foreground">
                  Add widgets from the fields above.
                </p>
              )}
              {widgets.map((w) => (
                <SortableWidget
                  key={w.id}
                  w={w}
                  label={labelFor(w.field)}
                  onPatch={(p) => patchWidget(w.id, p)}
                  onDelete={() => setWidgets(widgets.filter((x) => x.id !== w.id))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Theming */}
      <div className="space-y-2 rounded-lg border border-border p-3">
        <Label className="text-xs font-semibold">Dashboard branding</Label>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Accent color</span>
          <input
            type="color"
            value={accent}
            onChange={(e) => onConfigChange({ ...cfg, enabled: true, accent: e.target.value, layout: { ...(cfg.layout || {}), accent: e.target.value } })}
            className="h-7 w-16 cursor-pointer rounded-md border border-border"
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
        <Label className="text-xs">Linked dashboard enabled</Label>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
    </div>
  );
}

function FieldGroup({
  title, icon: Icon, items, onAdd,
}: {
  title: string;
  icon: typeof Hash;
  items: { id: string; name?: string; label: string }[];
  onAdd: (name: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
        <Icon className="h-3 w-3" /> {title}
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((q) => (
          <button
            key={q.id}
            onClick={() => onAdd(q.name!)}
            className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-accent"
          >
            <Plus className="h-3 w-3" /> {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}
