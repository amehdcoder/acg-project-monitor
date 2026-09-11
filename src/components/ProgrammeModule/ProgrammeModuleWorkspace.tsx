import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Settings2, CloudOff, RefreshCw, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MODULE_TEMPLATES, normalizeConfig } from "@/lib/programmeModule/defaults";
import { bindQueueAutoFlush, flushQueue, queueCount } from "@/lib/programmeModule/offlineQueue";
import type { BeneficiaryRow, ProgrammeModuleRow } from "@/lib/programmeModule/types";
import { useBeneficiaries, useProgrammeModules } from "./useProgrammeModule";
import BeneficiaryList from "./BeneficiaryList";
import BeneficiaryRecord from "./BeneficiaryRecord";
import BeneficiaryFormDialog from "./BeneficiaryFormDialog";
import ModuleConfigurator from "./ModuleConfigurator";

interface Props {
  projectId?: string;
  /** Only administrators may add or configure modules. */
  canConfigure?: boolean;
}

/**
 * Longitudinal Beneficiary Record workspace.
 *
 * One reusable, fully configurable case/beneficiary management system that can
 * be added to any project with the "+" button. Everything on screen — the
 * programme components, sections, questions, workflow, layout, branding and
 * Case ID format — comes from `programme_modules.config`, never from this code.
 */
const ProgrammeModuleWorkspace = ({ projectId, canConfigure = false }: Props) => {
  const { toast } = useToast();
  const { modules, loading, reload } = useProgrammeModules(projectId);
  const [activeId, setActiveId] = useState<string>("");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selected, setSelected] = useState<BeneficiaryRow | null>(null);
  const [pending, setPending] = useState(queueCount());
  const [creating, setCreating] = useState(false);

  const active: ProgrammeModuleRow | undefined = useMemo(
    () => modules.find((m) => m.id === activeId) || modules[0],
    [modules, activeId],
  );

  const { beneficiaries, loading: loadingBeneficiaries, reload: reloadBeneficiaries } =
    useBeneficiaries(active?.id);

  useEffect(() => {
    bindQueueAutoFlush();
    const onQueue = () => setPending(queueCount());
    window.addEventListener("programme-module-queue", onQueue);
    return () => window.removeEventListener("programme-module-queue", onQueue);
  }, []);

  const createModule = async (templateKey: string) => {
    if (!projectId) return;
    const template = MODULE_TEMPLATES.find((t) => t.key === templateKey);
    if (!template) return;
    setCreating(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("programme_modules")
        .insert({
          project_id: projectId,
          name: template.name,
          description: template.description,
          config: template.config as unknown as Record<string, unknown>,
          created_by: auth.user?.id,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      toast({ title: "Programme module added", description: template.name });
      setGalleryOpen(false);
      await reload();
      setActiveId((data as { id: string }).id);
    } catch (e) {
      toast({ title: "Could not add module", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const sync = async () => {
    const { sent, failed } = await flushQueue();
    setPending(queueCount());
    void reloadBeneficiaries();
    toast({
      title: failed ? "Some records could not be sent" : "Sync complete",
      description: `${sent} sent${failed ? `, ${failed} still queued` : ""}`,
      variant: failed ? "destructive" : undefined,
    });
  };

  if (!projectId) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Select a project to open its longitudinal beneficiary records.
      </Card>
    );
  }

  if (selected && active) {
    return (
      <BeneficiaryRecord
        beneficiary={selected}
        config={normalizeConfig(active.config)}
        moduleId={active.id}
        projectId={projectId}
        onBack={() => setSelected(null)}
        onChanged={() => void reloadBeneficiaries()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Layers className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-semibold text-foreground">Longitudinal Beneficiary Records</h2>
        {modules.length > 0 && (
          <Select value={active?.id || ""} onValueChange={setActiveId}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select module" /></SelectTrigger>
            <SelectContent className="z-[1200] bg-popover">
              {modules.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="flex-1" />
        {pending > 0 && (
          <Button variant="outline" size="sm" className="gap-1" onClick={sync}>
            <CloudOff className="h-4 w-4" /> {pending} queued — sync now
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => void reload()} aria-label="Reload modules">
          <RefreshCw className="h-4 w-4" />
        </Button>
        {canConfigure && active && (
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setConfigOpen(true)}>
            <Settings2 className="h-4 w-4" /> Configure
          </Button>
        )}
        {canConfigure && (
          <Button size="sm" className="gap-1" onClick={() => setGalleryOpen(true)} aria-label="Add programme module">
            <Plus className="h-4 w-4" /> Add module
          </Button>
        )}
      </div>

      {!loading && modules.length === 0 && (
        <Card className="space-y-3 p-10 text-center">
          <p className="text-muted-foreground">
            No longitudinal record module on this project yet.
          </p>
          {canConfigure ? (
            <Button className="gap-1" onClick={() => setGalleryOpen(true)}>
              <Plus className="h-4 w-4" /> Add programme module
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Ask an administrator to add one.</p>
          )}
        </Card>
      )}

      {active && (
        <BeneficiaryList
          beneficiaries={beneficiaries}
          config={normalizeConfig(active.config)}
          loading={loadingBeneficiaries}
          onOpen={setSelected}
          onRegister={() => setRegisterOpen(true)}
          onRefresh={() => void reloadBeneficiaries()}
        />
      )}

      {/* Template gallery */}
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add a programme module</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {MODULE_TEMPLATES.map((t) => (
              <Card key={t.key} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground">{t.name}</h3>
                  <p className="text-sm text-muted-foreground">{t.description}</p>
                  <Badge variant="outline" className="mt-2">
                    {t.config.components.length} component{t.config.components.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <Button disabled={creating} onClick={() => createModule(t.key)}>Use template</Button>
              </Card>
            ))}
            <p className="text-xs text-muted-foreground">
              Every template is fully editable afterwards — components, sections, questions, validation,
              skip logic, workflow, Case ID format and branding.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {active && (
        <>
          <BeneficiaryFormDialog
            open={registerOpen} onOpenChange={setRegisterOpen}
            moduleId={active.id} projectId={projectId}
            config={normalizeConfig(active.config)}
            onSaved={() => void reloadBeneficiaries()}
          />
          <ModuleConfigurator
            open={configOpen} onOpenChange={setConfigOpen}
            moduleId={active.id} moduleName={active.name}
            config={normalizeConfig(active.config)}
            onSaved={() => void reload()}
          />
        </>
      )}
    </div>
  );
};

export default ProgrammeModuleWorkspace;
