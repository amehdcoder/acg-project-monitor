import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { dimensionFor } from "@/lib/programmeModule/disaggregationCatalog";
import type { LogframeDisaggregation } from "@/lib/programmeModule/logframe";

export default function LogframeDisaggregationBuilder({ labels, config, onChange }: {
  labels: string[]; config?: LogframeDisaggregation[];
  onChange: (labels: string[], config: LogframeDisaggregation[]) => void;
}) {
  const dimensions = labels.map(label => config?.find(d => d.label === label) ?? (() => {
    const d = dimensionFor(label);
    return { label, kind: d.kind, level: d.level, options: d.groups?.flatMap(g => g.options), allowOther: d.allowOther };
  })());
  const update = (index: number, patch: Partial<LogframeDisaggregation>) => {
    const next = dimensions.map((d, i) => i === index ? { ...d, ...patch } : d);
    onChange(next.map(d => d.label), next);
  };
  return <div className="space-y-3">
    <Label className="font-semibold">Disaggregation dimensions & options</Label>
    {dimensions.map((d, i) => <section key={i} className="space-y-3 border-l-2 border-health-teal pl-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_180px_40px]">
        <Input aria-label={`Dimension ${i + 1} name`} value={d.label} placeholder="Dimension name" onChange={e => update(i, { label: e.target.value })} />
        <Select value={d.kind} onValueChange={v => update(i, { kind: v === "location" ? "location" : "options", level: v === "location" ? "state" : undefined })}><SelectTrigger aria-label={`Dimension ${i + 1} type`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="options">Defined options</SelectItem><SelectItem value="location">Geographic areas</SelectItem></SelectContent></Select>
        <Button variant="ghost" size="icon" aria-label={`Remove dimension ${i + 1}`} onClick={() => { const next = dimensions.filter((_, n) => n !== i); onChange(next.map(x => x.label), next); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>
      {d.kind === "options" ? <Textarea aria-label={`Dimension ${i + 1} options`} rows={3} placeholder="One option per line" value={(d.options ?? []).join("\n")} onChange={e => update(i, { options: e.target.value.split("\n") })} /> : <Select value={d.level ?? "state"} onValueChange={v => update(i, { level: v as "state" | "lga" | "ward" })}><SelectTrigger aria-label={`Dimension ${i + 1} geographic level`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="state">State</SelectItem><SelectItem value="lga">State → LGA</SelectItem><SelectItem value="ward">State → LGA → Ward</SelectItem></SelectContent></Select>}
      {d.kind === "options" && <div className="flex items-center gap-2"><Switch aria-label={`Allow other options for dimension ${i + 1}`} checked={!!d.allowOther} onCheckedChange={v => update(i, { allowOther: v })} /><Label>Allow additional options</Label></div>}
    </section>)}
    <Button variant="outline" size="sm" onClick={() => { const next: LogframeDisaggregation[] = [...dimensions, { label: `Dimension ${dimensions.length + 1}`, kind: "options", options: [] }]; onChange(next.map(d => d.label), next); }}><Plus className="mr-2 h-4 w-4" /> Add dimension</Button>
  </div>;
}