import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { enqueue, flushQueue, newUuid } from "@/lib/programmeModule/offlineQueue";
import { visibleComponents } from "@/lib/programmeModule/defaults";
import type { ProgrammeModuleConfig } from "@/lib/programmeModule/types";
import ConfigFieldRenderer, { AnswerMap, isRelevant } from "./ConfigFieldRenderer";
import { recordAudit } from "./useProgrammeModule";
import MentalHealthServiceForm, { mhFormForService } from "./MentalHealthServiceForm";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config: ProgrammeModuleConfig;
  beneficiary: BeneficiaryRow;
  moduleId: string;
  projectId: string;
  defaultComponent?: string;
  onSaved: () => void;
}

const ServiceEntryDialog = ({
  open, onOpenChange, config, beneficiary, moduleId, projectId, defaultComponent, onSaved,
}: Props) => {
  const beneficiaryId = beneficiary.id;
  const { toast } = useToast();
  const components = useMemo(() => visibleComponents(config), [config]);
  const [componentKey, setComponentKey] = useState(defaultComponent || components[0]?.key || "");
  const [serviceName, setServiceName] = useState("");
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState("");
  const [status, setStatus] = useState(config.workflow.serviceStatuses[0]?.value || "on_track");
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [saving, setSaving] = useState(false);

  const component = components.find((c) => c.key === componentKey);

  // GAD-7 / PHQ-9 open the full standard screening instrument instead of the
  // generic service form, so clinicians use the identical validated tool.
  const mhForm = mhFormForService(serviceName);
  if (open && mhForm) {
    return (
      <MentalHealthServiceForm
        open={open}
        onOpenChange={(v) => { if (!v) setServiceName(""); onOpenChange(v); }}
        formKey={mhForm}
        serviceName={serviceName}
        componentKey={componentKey}
        beneficiary={beneficiary}
        moduleId={moduleId}
        projectId={projectId}
        onSaved={onSaved}
      />
    );
  }

  const save = async () => {
    if (!componentKey) return;
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        beneficiary_id: beneficiaryId,
        module_id: moduleId,
        project_id: projectId,
        component_key: componentKey,
        service_name: serviceName || component?.services?.[0] || component?.label || null,
        service_date: serviceDate,
        result: result || null,
        status,
        data: answers as Record<string, unknown>,
        submission_uuid: newUuid(),
        recorded_by: auth.user?.id,
      };
      if (navigator.onLine) {
        const { error } = await supabase.from("beneficiary_services").insert(payload as never);
        if (error) throw error;
        await recordAudit({
          beneficiary_id: beneficiaryId, project_id: projectId,
          action: "service_recorded", field_name: componentKey, new_value: payload.service_name || "",
        });
        toast({ title: "Service recorded" });
      } else {
        enqueue("service", payload as unknown as Record<string, unknown>);
        toast({ title: "Saved offline", description: "It will sync when you are back online." });
      }
      void flushQueue();
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Could not record service", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Record a service</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Programme component</Label>
            <Select value={componentKey} onValueChange={setComponentKey}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-[1200] bg-popover">
                {components.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!!component?.services?.length && (
            <div className="space-y-1.5">
              <Label>Service</Label>
              <Select value={serviceName} onValueChange={setServiceName}>
                <SelectTrigger><SelectValue placeholder="Select service…" /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {component.services.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Service date</Label>
              <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {config.workflow.serviceStatuses.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Result / outcome</Label>
            <Input value={result} onChange={(e) => setResult(e.target.value)} placeholder="e.g. 6/6 (improved)" />
          </div>

          {(component?.questions || [])
            .filter((q) => isRelevant(q.relevant, answers))
            .map((q) => (
              <ConfigFieldRenderer
                key={q.id}
                question={q}
                value={q.name ? answers[q.name] : ""}
                onChange={(v) => q.name && setAnswers((p) => ({ ...p, [q.name as string]: v }))}
              />
            ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !componentKey}>{saving ? "Saving…" : "Save service"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ServiceEntryDialog;
