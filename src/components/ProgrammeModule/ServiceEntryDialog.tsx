import { useEffect, useMemo, useState } from "react";
import { outcomesForComponent, servicesForComponent } from "@/lib/programmeModule/componentOutcomes";
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
import ServiceExperienceSections from "./ServiceExperienceSections";
import { recordAudit } from "./useProgrammeModule";
import MentalHealthServiceForm, { mhFormForService } from "./MentalHealthServiceForm";
import MhgapSupportEngine, { isMentalHealthComponent, type MhgapValue } from "./MhgapSupportEngine";
import MmdpServiceForm, { isMmdpService } from "./MmdpServiceForm";
import DocumentsServiceForm, { isDocumentsComponent } from "./DocumentsServiceForm";
import ServicePicker from "./ServicePicker";
import FollowUpFields, { emptyFollowUp } from "./FollowUpFields";
import type { FollowUpValue } from "./FollowUpFields";
import type { BeneficiaryRow, BeneficiaryServiceRow } from "@/lib/programmeModule/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config: ProgrammeModuleConfig;
  beneficiary: BeneficiaryRow;
  moduleId: string;
  projectId: string;
  defaultComponent?: string;
  /** Existing services — used by MMDP visits to compare with previous visits. */
  priorServices?: BeneficiaryServiceRow[];
  componentFilter?: (c: { key: string; label?: string }) => boolean;
  onSaved: () => void;
}

const ServiceEntryDialog = ({
  open, onOpenChange, config, beneficiary, moduleId, projectId, defaultComponent,
  priorServices = [], onSaved, componentFilter,
}: Props) => {
  const beneficiaryId = beneficiary.id;
  const { toast } = useToast();
  const allowed = useMemo(() => visibleComponents(config).filter((c) => !componentFilter || componentFilter(c)), [config, componentFilter]);
  // Opened from a component tab: only that component is offered.
  const components = useMemo(
    () => (defaultComponent && allowed.some((c) => c.key === defaultComponent)
      ? allowed.filter((c) => c.key === defaultComponent) : allowed),
    [allowed, defaultComponent],
  );
  const [componentKey, setComponentKey] = useState(defaultComponent || components[0]?.key || "");
  const [serviceName, setServiceName] = useState("");
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState("");
  const [status, setStatus] = useState(config.workflow.serviceStatuses[0]?.value || "on_track");
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [experience, setExperience] = useState<AnswerMap>({});
  const [followUp, setFollowUp] = useState<FollowUpValue>(emptyFollowUp);
  const [saving, setSaving] = useState(false);
  const [mhgap, setMhgap] = useState<MhgapValue>({});

  useEffect(() => {
    if (!open) return;
    setComponentKey(defaultComponent || components[0]?.key || "");
    setServiceName(""); setResult(""); setResultOther(false);
  }, [open, defaultComponent]); // eslint-disable-line react-hooks/exhaustive-deps

  const [resultOther, setResultOther] = useState(false);
  const component = components.find((c) => c.key === componentKey);
  const serviceOptions = component ? servicesForComponent(component) : [];
  const outcomeOptions = component ? outcomesForComponent(component) : [];

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

  // Documents are records rather than clinical episodes: no result/outcome and
  // no follow-up — attachments plus a signed informed-consent acknowledgement.
  if (open && component && isDocumentsComponent(component)) {
    return (
      <DocumentsServiceForm
        open={open}
        onOpenChange={(v) => { if (!v) setServiceName(""); onOpenChange(v); }}
        component={component}
        serviceName={serviceName}
        onServiceNameChange={setServiceName}
        beneficiary={beneficiary}
        moduleId={moduleId}
        projectId={projectId}
        onSaved={onSaved}
      />
    );
  }

  // Limb care, lymphoedema and hydrocoele visits open the MMDP visit form with
  // pictures, measurements and the on-device progress comparison.
  if (open && isMmdpService(componentKey, serviceName)) {
    return (
      <MmdpServiceForm
        open={open}
        onOpenChange={(v) => { if (!v) setServiceName(""); onOpenChange(v); }}
        serviceName={serviceName}
        componentKey={componentKey}
        beneficiary={beneficiary}
        moduleId={moduleId}
        projectId={projectId}
        priorServices={priorServices}
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
        service_name: serviceName || serviceOptions[0] || component?.label || null,
        service_date: serviceDate,
        result: result || null,
        status,
        data: {
          ...(answers as Record<string, unknown>),
          ...(experience as Record<string, unknown>),
          ...(isMentalHealthComponent(componentKey, component?.label) ? (mhgap as Record<string, unknown>) : {}),
          follow_up_date: followUp.date || undefined,
          follow_up_time: followUp.time || undefined,
          follow_up_location: followUp.location || undefined,
        } as Record<string, unknown>,
        submission_uuid: newUuid(),
        recorded_by: auth.user?.id,
      };
      if (navigator.onLine) {
        const { error } = await supabase.from("beneficiary_services").insert(payload as never);
        if (error) throw error;
        if (followUp.date) {
          await supabase.from("beneficiaries")
            .update({ next_follow_up_date: followUp.date } as never)
            .eq("id", beneficiaryId);
        }
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
            <Select value={componentKey} onValueChange={(v) => { setComponentKey(v); setServiceName(""); setResult(""); setResultOther(false); }} disabled={components.length === 1}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-[1200] bg-popover">
                {components.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {component && (
            <div className="space-y-1.5">
              <Label>Service</Label>
              <ServicePicker
                key={componentKey}
                componentKey={componentKey}
                options={serviceOptions}
                recent={priorServices.filter((p) => (p as { component_key?: string }).component_key === componentKey).map((p) => (p as { service_name?: string | null }).service_name || "").filter(Boolean)}
                value={serviceName}
                onChange={setServiceName}
              />
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
            <Label>{component ? `${component.label} result / outcome` : "Result / outcome"}</Label>
            <Select
              value={resultOther ? "__other" : result}
              onValueChange={(v) => { if (v === "__other") { setResultOther(true); setResult(""); } else { setResultOther(false); setResult(v); } }}
            >
              <SelectTrigger><SelectValue placeholder="Select result / outcome…" /></SelectTrigger>
              <SelectContent className="z-[1200] bg-popover">
                {outcomeOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                <SelectItem value="__other">Other (type it)…</SelectItem>
              </SelectContent>
            </Select>
            {resultOther && (
              <Input value={result} onChange={(e) => setResult(e.target.value)} placeholder="Describe the result / outcome" />
            )}
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

          {isMentalHealthComponent(componentKey, component?.label) && (
            <MhgapSupportEngine projectId={projectId} priorServices={priorServices} beneficiary={beneficiary} value={mhgap} onChange={setMhgap} />
          )}

          <ServiceExperienceSections
            answers={experience}
            onChange={(name, value) => setExperience((p) => ({ ...p, [name]: value }))}
          />

          <FollowUpFields
            value={followUp}
            onChange={setFollowUp}
            locationSuggestion={beneficiary.village || beneficiary.lga || ""}
          />
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
