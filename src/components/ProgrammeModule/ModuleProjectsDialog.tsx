import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Search, Trash2, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MODULE_TEMPLATES } from "@/lib/programmeModule/defaults";

interface ProjectRow { id: string; name: string }
interface ModuleRow { id: string; project_id: string; name: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Only the Super Admin may add or remove records on a project. */
  allowed: boolean;
  onChanged?: () => void;
}

/**
 * Super Admin control room: add the Longitudinal Beneficiary Records to any
 * project, or take it off a project again. Removing also removes everything
 * recorded under it, so it asks for the project name to be typed first.
 */
const ModuleProjectsDialog = ({ open, onOpenChange, allowed, onChanged }: Props) => {
  const { toast } = useToast();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [template, setTemplate] = useState(MODULE_TEMPLATES[0]?.key || "");
  const [removing, setRemoving] = useState<{ module: ModuleRow; project: ProjectRow } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [p, m] = await Promise.all([
      supabase.from("projects").select("id, name").order("name").limit(1000),
      supabase.from("programme_modules").select("id, project_id, name").limit(2000),
    ]);
    const mods = ((m.data as unknown as ModuleRow[]) || []);
    setProjects((p.data as unknown as ProjectRow[]) || []);
    setModules(mods);
    setLoading(false);

    // How many people are already on each module — shown before removal.
    const next: Record<string, number> = {};
    await Promise.all(mods.map(async (mod) => {
      const { count } = await supabase
        .from("beneficiaries")
        .select("id", { count: "exact", head: true })
        .eq("module_id", mod.id);
      next[mod.id] = count || 0;
    }));
    setCounts(next);
  }, []);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects
      .map((p) => ({ project: p, module: modules.find((m) => m.project_id === p.id) || null }))
      .filter((r) => !q || r.project.name.toLowerCase().includes(q));
  }, [projects, modules, search]);

  const add = async (project: ProjectRow) => {
    const tpl = MODULE_TEMPLATES.find((t) => t.key === template) || MODULE_TEMPLATES[0];
    if (!tpl) return;
    setBusy(project.id);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("programme_modules").insert({
        project_id: project.id,
        name: tpl.name,
        description: tpl.description,
        config: tpl.config as unknown as Record<string, unknown>,
        created_by: auth.user?.id,
      } as never);
      if (error) throw error;
      toast({ title: "Records added", description: `${tpl.name} is now on ${project.name}` });
      await load();
      onChanged?.();
    } catch (e) {
      toast({ title: "Could not add", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(removing.project.id);
    try {
      const { error } = await supabase
        .from("programme_modules").delete().eq("id", removing.module.id);
      if (error) throw error;
      toast({
        title: "Records removed",
        description: `Taken off ${removing.project.name}`,
      });
      setRemoving(null);
      setConfirmText("");
      await load();
      onChanged?.();
    } catch (e) {
      toast({ title: "Could not remove", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Beneficiary records across projects
            </DialogTitle>
          </DialogHeader>

          {!allowed ? (
            <p className="text-sm text-muted-foreground">
              Only the Super Admin can add or remove beneficiary records on a project.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1">
                  <Label className="text-xs">Find a project</Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8" value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Project name"
                    />
                  </div>
                </div>
                <div className="min-w-[220px]">
                  <Label className="text-xs">Start from</Label>
                  <Select value={template} onValueChange={setTemplate}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[1300] bg-popover">
                      {MODULE_TEMPLATES.map((t) => (
                        <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {loading && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading projects…
                </p>
              )}

              <div className="space-y-2">
                {rows.map(({ project, module }) => (
                  <Card key={project.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{project.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {module
                          ? `${module.name} · ${counts[module.id] ?? 0} people registered`
                          : "No beneficiary records on this project"}
                      </p>
                    </div>
                    {module ? (
                      <>
                        <Badge variant="outline">Active</Badge>
                        <Button
                          size="sm" variant="destructive" className="gap-1"
                          disabled={busy === project.id}
                          onClick={() => { setRemoving({ module, project }); setConfirmText(""); }}
                        >
                          <Trash2 className="h-4 w-4" /> Remove
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm" className="gap-1" disabled={busy === project.id}
                        onClick={() => void add(project)}
                      >
                        <Plus className="h-4 w-4" /> Add records
                      </Button>
                    )}
                  </Card>
                ))}
                {!loading && rows.length === 0 && (
                  <p className="text-sm text-muted-foreground">No project matches that name.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!removing} onOpenChange={(v) => { if (!v) { setRemoving(null); setConfirmText(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Remove beneficiary records?</DialogTitle></DialogHeader>
          {removing && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This takes the records off <strong>{removing.project.name}</strong> and permanently
                deletes the {counts[removing.module.id] ?? 0} people registered under it, together with
                their services, follow-ups, referrals and history. This cannot be undone.
              </p>
              <div>
                <Label className="text-xs">Type the project name to confirm</Label>
                <Input
                  className="mt-1" value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={removing.project.name}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setRemoving(null); setConfirmText(""); }}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={confirmText.trim() !== removing.project.name || busy === removing.project.id}
                  onClick={() => void remove()}
                >
                  Remove permanently
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ModuleProjectsDialog;
