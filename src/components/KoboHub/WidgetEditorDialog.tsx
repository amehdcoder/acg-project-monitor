/**
 * Universal Kobo Analytics — widget editor.
 * Every property of every widget is editable here: chart type, data source
 * (parent form or any flattened repeat block), dimension, series split,
 * measure, aggregation, sort, limit, size and WHO palette colour.
 */
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { HubSchema } from "@/lib/koboHub/schema";
import {
  WHO_PALETTE, dimensionOptions, measureOptions,
  type Agg, type HubWidget, type WidgetKind,
} from "@/lib/koboHub/dashboard";

const KINDS: { v: WidgetKind; label: string }[] = [
  { v: "kpi", label: "KPI tile" },
  { v: "bar", label: "Bar (horizontal)" },
  { v: "column", label: "Column (vertical)" },
  { v: "stacked", label: "Stacked column" },
  { v: "line", label: "Line" },
  { v: "area", label: "Area" },
  { v: "pie", label: "Pie" },
  { v: "donut", label: "Donut" },
  { v: "treemap", label: "Treemap" },
  { v: "table", label: "Table" },
  { v: "text", label: "Narrative text" },
];

const AGGS: { v: Agg; label: string }[] = [
  { v: "count", label: "Count of records" },
  { v: "sum", label: "Sum of measure" },
  { v: "avg", label: "Average of measure" },
  { v: "min", label: "Minimum" },
  { v: "max", label: "Maximum" },
  { v: "distinct", label: "Distinct values" },
];

const NONE = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  schema: HubSchema;
  widget: HubWidget | null;
  onSave: (w: HubWidget) => void;
}

export default function WidgetEditorDialog({ open, onOpenChange, schema, widget, onSave }: Props) {
  const [w, setW] = useState<HubWidget | null>(widget);
  useEffect(() => { setW(widget); }, [widget, open]);
  if (!w) return null;

  const set = <K extends keyof HubWidget>(k: K, v: HubWidget[K]) => setW((p) => (p ? { ...p, [k]: v } : p));
  const dims = dimensionOptions(schema, w.source);
  const measures = measureOptions(schema, w.source);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle>Edit widget</DialogTitle>
          <DialogDescription className="text-slate-400">
            Bind this panel to any question in the live Kobo schema — including flattened repeat groups.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label className="text-slate-300">Title</Label>
            <Input value={w.title} onChange={(e) => set("title", e.target.value)} className="bg-slate-950 border-slate-700" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-slate-300">Subtitle</Label>
            <Input value={w.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)}
              placeholder="Optional caption shown under the title" className="bg-slate-950 border-slate-700" />
          </div>

          <div>
            <Label className="text-slate-300">Visualisation</Label>
            <Select value={w.kind} onValueChange={(v) => set("kind", v as WidgetKind)}>
              <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map((k) => <SelectItem key={k.v} value={k.v}>{k.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-slate-300">Data source</Label>
            <Select value={w.source} onValueChange={(v) => setW((p) => (p ? { ...p, source: v, dimension: undefined, series: undefined, measure: undefined } : p))}>
              <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="parent">Parent submissions</SelectItem>
                {schema.repeats.map((r) => (
                  <SelectItem key={r.name} value={r.name}>{r.label || r.leaf} (repeat)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {w.kind === "text" ? (
            <div className="md:col-span-2">
              <Label className="text-slate-300">Narrative</Label>
              <Textarea rows={6} value={w.body ?? ""} onChange={(e) => set("body", e.target.value)}
                className="bg-slate-950 border-slate-700" placeholder="Interpretation, methods note or WHO indicator definition…" />
            </div>
          ) : (
            <>
              <div>
                <Label className="text-slate-300">Dimension</Label>
                <Select value={w.dimension ?? NONE} onValueChange={(v) => set("dimension", v === NONE ? undefined : v)}>
                  <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={NONE}>None (whole dataset)</SelectItem>
                    {dims.map((d) => <SelectItem key={d.name} value={d.name}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-slate-300">Series split (stacked)</Label>
                <Select value={w.series ?? NONE} onValueChange={(v) => set("series", v === NONE ? undefined : v)}>
                  <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={NONE}>None</SelectItem>
                    {dims.map((d) => <SelectItem key={d.name} value={d.name}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-slate-300">Aggregation</Label>
                <Select value={w.agg} onValueChange={(v) => set("agg", v as Agg)}>
                  <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent>{AGGS.map((a) => <SelectItem key={a.v} value={a.v}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-slate-300">Measure (numeric)</Label>
                <Select value={w.measure ?? NONE} onValueChange={(v) => set("measure", v === NONE ? undefined : v)}>
                  <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={NONE}>None</SelectItem>
                    {measures.map((m) => <SelectItem key={m.name} value={m.name}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-slate-300">Sort</Label>
                <Select value={w.sort} onValueChange={(v) => set("sort", v as HubWidget["sort"])}>
                  <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Highest first</SelectItem>
                    <SelectItem value="asc">Lowest first</SelectItem>
                    <SelectItem value="alpha">Alphabetical / chronological</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-slate-300">Max categories: {w.limit}</Label>
                <Slider value={[w.limit]} min={3} max={50} step={1} onValueChange={([v]) => set("limit", v)} className="mt-3" />
              </div>
            </>
          )}

          <div>
            <Label className="text-slate-300">Width: {w.span}/12</Label>
            <Slider value={[w.span]} min={3} max={12} step={1} onValueChange={([v]) => set("span", v)} className="mt-3" />
          </div>
          <div>
            <Label className="text-slate-300">Height: {w.height}px</Label>
            <Slider value={[w.height]} min={120} max={560} step={20} onValueChange={([v]) => set("height", v)} className="mt-3" />
          </div>

          <div className="md:col-span-2">
            <Label className="text-slate-300">Colour</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {WHO_PALETTE.map((c, i) => (
                <button key={c} type="button" onClick={() => set("colorIndex", i)} aria-label={`Colour ${i + 1}`}
                  className={`h-7 w-7 rounded-md border-2 ${w.colorIndex === i ? "border-white" : "border-transparent"}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>

          <div className="md:col-span-2 flex items-center gap-2">
            <Switch checked={w.showValues} onCheckedChange={(v) => set("showValues", v)} id="showvals" />
            <Label htmlFor="showvals" className="text-slate-300">Show data labels</Label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" className="border-slate-700 text-slate-200" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-cyan-600 hover:bg-cyan-500" onClick={() => { onSave(w); onOpenChange(false); }}>Save widget</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
