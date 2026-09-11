import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { enqueue, newUuid, flushQueue } from "@/lib/programmeModule/offlineQueue";
import type { BeneficiaryRow, ProgrammeModuleConfig } from "@/lib/programmeModule/types";
import ConfigFieldRenderer, {
  AnswerMap, applyCalculations, isRelevant, validateQuestion,
} from "./ConfigFieldRenderer";
import { recordAudit } from "./useProgrammeModule";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useFacilities, FACILITY_TYPE_LABEL } from "@/lib/programmeModule/facilities";
import PhotoCaptureField from "./PhotoCaptureField";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  moduleId: string;
  projectId: string;
  config: ProgrammeModuleConfig;
  existing?: BeneficiaryRow | null;
  onSaved: () => void;
}

const BeneficiaryFormDialog = ({
  open, onOpenChange, moduleId, projectId, config, existing, onSaved,
}: Props) => {
  const { toast } = useToast();
  const [answers, setAnswers] = useState<AnswerMap>(() => ({ ...(existing?.profile || {}) }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { facilities } = useFacilities(projectId);
  const [facilityId, setFacilityId] = useState<string>(
    ((existing as unknown as { facility_id?: string | null })?.facility_id) || "",
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(existing?.photo_url || null);


  const sections = useMemo(
    () => (config.sections || []).filter((s) => !s.hidden && s.placement !== "hidden")
      .sort((a, b) => a.order - b.order),
    [config.sections],
  );

  const allQuestions = useMemo(() => sections.flatMap((s) => s.questions || []), [sections]);

  const setValue = (name: string, value: unknown) => {
    setAnswers((prev) => applyCalculations(allQuestions, { ...prev, [name]: value }));
  };

  const save = async () => {
    const nextErrors: Record<string, string> = {};
    for (const q of allQuestions) {
      if (!q.name || !isRelevant(q.relevant, answers)) continue;
      const err = validateQuestion(q, answers[q.name]);
      if (err) nextErrors[q.name] = err;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast({ title: "Please complete the highlighted fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const gps = String(answers.gps || "");
      const [lat, lng] = gps.split(",").map((n) => parseFloat(n.trim()));
      const base = {
        module_id: moduleId,
        project_id: projectId,
        full_name: String(answers.full_name || "Unnamed beneficiary"),
        profile: answers as Record<string, unknown>,
        status: existing?.status || (config.workflow.statuses[0]?.value ?? "active"),
        latitude: Number.isFinite(lat) ? lat : null,
        longitude: Number.isFinite(lng) ? lng : null,
        state: (answers.state as string) || null,
        lga: (answers.lga as string) || null,
        ward: (answers.ward as string) || null,
        village: (answers.village as string) || null,
        facility_id: facilityId || null,
        photo_url: photoUrl,
      };

      if (existing) {
        const { error } = await supabase.from("beneficiaries").update(base as never).eq("id", existing.id);
        if (error) throw error;
        await recordAudit({
          beneficiary_id: existing.id, project_id: projectId, action: "profile_updated",
        });
        toast({ title: "Record updated" });
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const submission_uuid = newUuid();
        let caseId: string | null = null;
        if (navigator.onLine) {
          const { data } = await supabase.rpc("next_beneficiary_case_id", { _module_id: moduleId });
          caseId = (data as unknown as string) || null;
        }
        const payload = {
          ...base,
          case_id: caseId || `PENDING-${submission_uuid.slice(0, 8).toUpperCase()}`,
          submission_uuid,
          created_by: auth.user?.id,
        };
        if (navigator.onLine) {
          const { error } = await supabase.from("beneficiaries").insert(payload as never);
          if (error) throw error;
          toast({ title: "Beneficiary registered", description: payload.case_id });
        } else {
          enqueue("beneficiary", payload as unknown as Record<string, unknown>);
          toast({ title: "Saved offline", description: "It will sync automatically when you are back online." });
        }
      }
      void flushQueue();
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{existing ? "Edit beneficiary" : "Register beneficiary"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70dvh] px-5 py-4">
          <div className="space-y-6">
            <PhotoCaptureField
              label="Patient photograph"
              hint="Helps field teams recognise the beneficiary at follow-up visits."
              value={photoUrl}
              projectId={projectId}
              beneficiaryId={existing?.id || "new"}
              onChange={(v) => setPhotoUrl(v)}
            />
            <div className="space-y-1.5">
              <Label>Health facility (care home base)</Label>
              <Select value={facilityId} onValueChange={setFacilityId}>
                <SelectTrigger><SelectValue placeholder="Select registered facility…" /></SelectTrigger>
                <SelectContent className="z-[1200] max-h-72 bg-popover">
                  {facilities.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name} — {FACILITY_TYPE_LABEL[f.facility_type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Focal persons of this facility manage the case and see its full history.
              </p>
            </div>
            {sections.map((section) => (
              <div key={section.id} className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.label}
                  </h4>
                  <Separator className="mt-2" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(section.questions || [])
                    .filter((q) => isRelevant(q.relevant, answers))
                    .map((q) => (
                      <div key={q.id} className={q.type === "select_multiple" ? "sm:col-span-2" : ""}>
                        <ConfigFieldRenderer
                          question={q}
                          value={q.name ? answers[q.name] : ""}
                          error={q.name ? errors[q.name] : null}
                          answers={answers}
                          onPatch={(vals) =>
                            setAnswers((prev) => applyCalculations(allQuestions, { ...prev, ...vals }))
                          }
                          onChange={(v) => q.name && setValue(q.name, v)}
                        />
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save record"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BeneficiaryFormDialog;
