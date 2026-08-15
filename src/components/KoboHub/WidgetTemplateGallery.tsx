/**
 * WHO widget template gallery — insert preconfigured KPIs, charts and tables
 * that bind themselves to the live Kobo schema.
 */
import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Sparkles, Lock } from "lucide-react";
import type { HubSchema } from "@/lib/koboHub/schema";
import type { HubWidget } from "@/lib/koboHub/dashboard";
import { TEMPLATE_CATEGORIES, WIDGET_TEMPLATES } from "@/lib/koboHub/templates";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  schema: HubSchema;
  onInsert: (widgets: HubWidget[], name: string) => void;
}

export default function WidgetTemplateGallery({ open, onOpenChange, schema, onInsert }: Props) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");

  const items = useMemo(
    () => WIDGET_TEMPLATES.map((t) => ({ t, built: t.build(schema) })),
    [schema],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter(({ t }) =>
      (cat === "all" || t.category === cat) &&
      (!s || t.name.toLowerCase().includes(s) || t.description.toLowerCase().includes(s)));
  }, [items, q, cat]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-hidden bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-cyan-400" /> WHO widget template gallery
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Preconfigured indicator patterns. Each template binds automatically to the matching
            questions in this form — insert it, then fine-tune in the widget editor.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates…"
              className="pl-8 bg-slate-950 border-slate-700" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={cat === "all" ? "default" : "outline"}
              className={cat === "all" ? "bg-cyan-600 hover:bg-cyan-500" : "border-slate-700 text-slate-300"}
              onClick={() => setCat("all")}>All</Button>
            {TEMPLATE_CATEGORIES.map((c) => (
              <Button key={c} size="sm" variant={cat === c ? "default" : "outline"}
                className={cat === c ? "bg-cyan-600 hover:bg-cyan-500" : "border-slate-700 text-slate-300"}
                onClick={() => setCat(c)}>{c}</Button>
            ))}
          </div>
        </div>

        <div className="grid max-h-[52vh] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
          {filtered.map(({ t, built }) => {
            const available = !!built?.length;
            return (
              <div key={t.id}
                className={`rounded-lg border p-3 ${available ? "border-slate-800 bg-slate-950/60" : "border-slate-800/60 bg-slate-950/30 opacity-70"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-slate-100">{t.name}</h4>
                    <Badge variant="outline" className="mt-1 border-slate-700 text-[10px] text-slate-400">{t.category}</Badge>
                  </div>
                  {available ? (
                    <Button size="sm" className="bg-cyan-600 hover:bg-cyan-500"
                      onClick={() => { onInsert(built!, t.name); onOpenChange(false); }}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Insert
                    </Button>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-300">
                      <Lock className="mr-1 h-3 w-3" /> Unavailable
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-400">{t.description}</p>
                {!available && <p className="mt-1 text-[11px] text-amber-400/80">{t.requirement}</p>}
                {available && built!.length > 1 && (
                  <p className="mt-1 text-[11px] text-slate-500">Inserts {built!.length} panels.</p>
                )}
              </div>
            );
          })}
          {!filtered.length && (
            <p className="md:col-span-2 py-10 text-center text-sm text-slate-500">No templates match this search.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
