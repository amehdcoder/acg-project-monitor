import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MHGAP_DRUGS, MHGAP_DRUG_CLASSES } from "@/lib/programmeModule/mhgapDrugs";

export function useProjectMhgapDrugs(projectId: string) {
  const [drugs, setDrugs] = useState<{ id: string; drug_name: string; drug_class: string }[]>([]);
  const reload = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase.from("project_mhgap_drugs")
      .select("id, drug_name, drug_class").eq("project_id", projectId).order("drug_name");
    setDrugs(data || []);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  return { drugs, reload };
}

interface Props { open: boolean; onOpenChange: (v: boolean) => void; projectId: string }

export default function MhgapDrugsManager({ open, onOpenChange, projectId }: Props) {
  const { toast } = useToast();
  const { drugs, reload } = useProjectMhgapDrugs(projectId);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (name: string, drugClass: string, on: boolean) => {
    setBusy(name);
    const existing = drugs.find((d) => d.drug_name === name);
    const { data: u } = await supabase.auth.getUser();
    const { error } = on
      ? await supabase.from("project_mhgap_drugs").insert({ project_id: projectId, drug_name: name, drug_class: drugClass, registered_by: u.user?.id ?? null })
      : await supabase.from("project_mhgap_drugs").delete().eq("id", existing!.id);
    setBusy(null);
    if (error) toast({ title: "Could not update medicines", description: error.message, variant: "destructive" });
    void reload();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>mhGAP medicines for this project</DialogTitle>
          <DialogDescription>Tick the WHO mhGAP medicines available in this project. Only ticked medicines appear in the register form.</DialogDescription>
        </DialogHeader>
        {MHGAP_DRUG_CLASSES.map((cls) => (
          <div key={cls} className="space-y-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{cls}s</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {MHGAP_DRUGS.filter((d) => d.drugClass === cls).map((d) => {
                const on = drugs.some((x) => x.drug_name === d.name);
                return (
                  <label key={d.name} className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3">
                    <Checkbox checked={on} disabled={busy === d.name} onCheckedChange={(v) => toggle(d.name, cls, !!v)} />
                    <span className="text-sm">
                      <span className="font-medium">{d.name}</span>
                      <span className="text-muted-foreground"> · {d.group}</span>
                      <span className="block text-xs text-muted-foreground">{d.note}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
