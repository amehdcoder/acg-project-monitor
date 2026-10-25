import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTargetPopFields, defaultTargetPopFieldsFor } from "@/hooks/useTargetPopFields";
import { TARGET_POP_DISAGGREGATION_FIELDS, targetPopulation, validTargetSelection, type PopulationMode } from "@/lib/microplanning/targetPopulation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Target, Save, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function PopulationDisaggregationDialog({ open, onOpenChange, projectName, entries }: {
  open: boolean; onOpenChange: (open: boolean) => void; projectName: string | null | undefined; entries: Record<string, unknown>[];
}) {
  const { role } = useAuth();
  const { fields, setFields } = useTargetPopFields(projectName);
  const [draft, setDraft] = useState(fields);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setDraft(fields); }, [open, fields]);
  const mode = TARGET_POP_DISAGGREGATION_FIELDS.find(f => f.key === draft[0])?.mode ?? "standard";
  const options = TARGET_POP_DISAGGREGATION_FIELDS.filter(f => f.mode === mode);
  const total = entries.reduce((sum, e) => sum + targetPopulation(e, draft), 0);
  const missing = entries.filter(e => draft.some(key => {
    const def = TARGET_POP_DISAGGREGATION_FIELDS.find(f => f.key === key);
    return def && e[def.field] == null;
  })).length;
  if (role !== "super_admin") return null;
  const save = async () => {
    setSaving(true);
    try {
      await setFields(draft);
      toast({ title: "Population disaggregation saved", description: `Target Population updated for ${projectName}.` });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Settings not saved", description: error instanceof Error ? error.message : "Connect to the internet and try again.", variant: "destructive" });
    } finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={saving ? undefined : onOpenChange}>
    <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /> Population disaggregation</DialogTitle></DialogHeader>
      <div className="flex items-center justify-between gap-3"><p className="font-medium break-words">{projectName}</p><Badge variant="secondary" className="shrink-0 gap-1"><ShieldCheck className="h-3 w-3" /> Super Admin</Badge></div>
      <Tabs value={mode} onValueChange={value => {
        const next = value as PopulationMode;
        setDraft(TARGET_POP_DISAGGREGATION_FIELDS.filter(f => f.mode === next).map(f => f.key));
      }}>
        <TabsList className="grid grid-cols-3 w-full h-auto"><TabsTrigger value="standard" className="whitespace-normal min-h-12">Standard ages</TabsTrigger><TabsTrigger value="trachoma" className="whitespace-normal min-h-12">Trachoma ages</TabsTrigger><TabsTrigger value="total" className="whitespace-normal min-h-12">Whole community</TabsTrigger></TabsList>
      </Tabs>
      <div className="divide-y divide-border">
        {options.map(option => {
          const amount = entries.reduce((sum, entry) => sum + targetPopulation(entry, [option.key]), 0);
          return <label key={option.key} className="flex items-center gap-3 py-4 cursor-pointer min-h-14">
            <Checkbox disabled={saving} checked={draft.includes(option.key)} onCheckedChange={checked => setDraft(prev => checked ? [...prev, option.key] : prev.filter(key => key !== option.key))} />
            <span className="flex-1 text-sm font-medium">{option.label}</span><span className="text-sm tabular-nums text-muted-foreground">{amount.toLocaleString()}</span>
          </label>;
        })}
      </div>
      <div className="border-y border-border bg-primary/5 py-4 px-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Target Population · current filtered records</p>
        <p className="text-3xl font-bold tabular-nums text-primary">{total.toLocaleString()}</p>
        <p className="text-sm text-muted-foreground">{draft.map(key => TARGET_POP_DISAGGREGATION_FIELDS.find(f => f.key === key)?.label).join(" + ") || "No age groups selected"}</p>
        {missing > 0 && <p className="text-sm text-destructive">{missing.toLocaleString()} records have missing selected age counts; only recorded counts are included.</p>}
      </div>
      <div className="flex justify-between flex-wrap gap-2">
        <Button variant="ghost" disabled={saving} onClick={() => setDraft(defaultTargetPopFieldsFor(projectName))}><RotateCcw className="h-4 w-4 mr-2" /> Reset default</Button>
        <Button disabled={saving || !projectName || !validTargetSelection(draft)} onClick={save}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save configuration</Button>
      </div>
    </DialogContent>
  </Dialog>;
}