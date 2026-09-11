// MMDP / NTD limb-care and hydrocoele visit.
//
// Captures the clinical photograph and the measurements needed for outcome
// tracking, then compares them with the previous visits using the on-device
// model in `limbProgress.ts` — no network required.

import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Activity, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { enqueue, flushQueue, newUuid } from "@/lib/programmeModule/offlineQueue";
import { analyseClinicalImage, assessLimbProgress } from "@/lib/programmeModule/limbProgress";
import type { ImageSignal, LimbMeasurement } from "@/lib/programmeModule/limbProgress";
import {
  AFFECTED_SIDES, LIMB_SITES, SCROTUM_SITES, mmdpVisits,
} from "@/lib/programmeModule/mmdp";
import type { MmdpSite, MmdpVisitData } from "@/lib/programmeModule/mmdp";
import type { BeneficiaryRow, BeneficiaryServiceRow } from "@/lib/programmeModule/types";
import PhotoCaptureField from "./PhotoCaptureField";
import FollowUpFields, { emptyFollowUp } from "./FollowUpFields";
import type { FollowUpValue } from "./FollowUpFields";
import { recordAudit } from "./useProgrammeModule";

/** Services that open the MMDP visit form instead of the generic one. */
export const isMmdpService = (componentKey: string, serviceName?: string | null) => {
  const s = (serviceName || "").toLowerCase();
  if (!componentKey.toLowerCase().includes("mmdp") && !componentKey.toLowerCase().includes("ntd")) return false;
  return /limb|lymphoedema|lymphedema|hydrocoele|hydrocele|surgery|outcome/.test(s);
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  serviceName: string;
  componentKey: string;
  beneficiary: BeneficiaryRow;
  moduleId: string;
  projectId: string;
  priorServices: BeneficiaryServiceRow[];
  onSaved: () => void;
}

const MmdpServiceForm = ({
  open, onOpenChange, serviceName, componentKey, beneficiary,
  moduleId, projectId, priorServices, onSaved,
}: Props) => {
  const { toast } = useToast();
  const history = useMemo(() => mmdpVisits(priorServices), [priorServices]);

  const suggestedType: MmdpVisitData["visit_type"] = history.length ? "outcome" : "baseline";
  const suggestedSite: MmdpSite = /hydro|scrot/.test(serviceName.toLowerCase()) ? "scrotum" : "limb";

  const [visitType, setVisitType] = useState<MmdpVisitData["visit_type"]>(suggestedType);
  const [site, setSite] = useState<MmdpSite>(suggestedSite);
  const [side, setSide] = useState(history[history.length - 1]?.measurements ? "" : "");
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [values, setValues] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [signal, setSignal] = useState<ImageSignal | null>(null);
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState<FollowUpValue>(emptyFollowUp);
  const [saving, setSaving] = useState(false);

  const siteFields = site === "scrotum" ? SCROTUM_SITES : LIMB_SITES;

  // Analyse each newly captured photograph on the device.
  useEffect(() => {
    let cancelled = false;
    if (!photoData) { setSignal(null); return; }
    void (async () => {
      try {
        const s = await analyseClinicalImage(photoData);
        if (!cancelled) setSignal(s);
      } catch {
        if (!cancelled) setSignal(null);
      }
    })();
    return () => { cancelled = true; };
  }, [photoData]);

  const measurements: LimbMeasurement[] = siteFields
    .map((f) => ({ date: serviceDate, site: f.key, cm: parseFloat(values[f.key] || "") }))
    .filter((m) => Number.isFinite(m.cm) && m.cm > 0);

  // Live comparison against the recorded history, including this visit.
  const assessment = useMemo(() => {
    const visits = [
      ...history.map((v) => ({ date: v.date, measurements: v.measurements })),
      { date: serviceDate, measurements },
    ];
    const images = [...history.map((v) => v.imageSignal), signal];
    return assessLimbProgress(visits, images);
  }, [history, serviceDate, measurements, signal]);

  const VerdictIcon =
    assessment.verdict === "reduction" ? TrendingDown
      : assessment.verdict === "increase" ? TrendingUp : Minus;
  const verdictTone =
    assessment.verdict === "reduction" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
      : assessment.verdict === "increase" ? "border-red-500/30 bg-red-500/10 text-red-700"
        : "border-slate-400/30 bg-muted text-muted-foreground";

  const save = async () => {
    if (!measurements.length) {
      toast({ title: "Record at least one measurement", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const data: MmdpVisitData = {
        mmdp: true,
        visit_type: visitType,
        site,
        affected_side: side || undefined,
        measurements,
        photo: photo || photoData,
        image_signal: signal,
        clinical_note: note,
        follow_up_date: followUp.date || undefined,
        follow_up_time: followUp.time || undefined,
        follow_up_location: followUp.location || undefined,
      };
      const payload = {
        beneficiary_id: beneficiary.id,
        module_id: moduleId,
        project_id: projectId,
        component_key: componentKey,
        service_name: serviceName,
        service_date: serviceDate,
        result:
          assessment.verdict === "insufficient"
            ? `Baseline recorded (${measurements.length} measurement${measurements.length === 1 ? "" : "s"})`
            : assessment.headline,
        status: assessment.verdict === "increase" ? "overdue" : "on_track",
        data: data as unknown as Record<string, unknown>,
        submission_uuid: newUuid(),
        recorded_by: auth.user?.id,
      };

      if (navigator.onLine) {
        const { error } = await supabase.from("beneficiary_services").insert(payload as never);
        if (error) throw error;
        if (followUp.date) {
          await supabase.from("beneficiaries")
            .update({ next_follow_up_date: followUp.date } as never)
            .eq("id", beneficiary.id);
        }
        await recordAudit({
          beneficiary_id: beneficiary.id, project_id: projectId,
          action: "mmdp_visit_recorded", field_name: site, new_value: payload.result,
        });
        toast({ title: "Visit recorded", description: payload.result });
      } else {
        enqueue("service", payload as unknown as Record<string, unknown>);
        toast({ title: "Saved offline", description: "It will sync when you are back online." });
      }
      void flushQueue();
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Could not save the visit", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-700" /> {serviceName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Visit type</Label>
              <Select value={visitType} onValueChange={(v) => setVisitType(v as MmdpVisitData["visit_type"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  <SelectItem value="baseline">Baseline assessment</SelectItem>
                  <SelectItem value="outcome">Outcome tracking visit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Affected area</Label>
              <Select value={site} onValueChange={(v) => setSite(v as MmdpSite)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  <SelectItem value="limb">Limb (lymphoedema)</SelectItem>
                  <SelectItem value="scrotum">Scrotum (hydrocoele)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Visit date</Label>
              <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Side / limb</Label>
            <Select value={side} onValueChange={setSide}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent className="z-[1200] bg-popover">
                {AFFECTED_SIDES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <PhotoCaptureField
            label={visitType === "baseline" ? "Baseline picture" : "Outcome picture"}
            hint="Photograph the affected area from the same distance and angle at every visit."
            value={photo}
            projectId={projectId}
            beneficiaryId={beneficiary.id}
            onChange={(v, d) => { setPhoto(v); setPhotoData(d); }}
          />

          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Measurements (cm)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {siteFields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-xs">{f.label}</Label>
                  <Input
                    type="number" inputMode="decimal" min={0} step="0.1"
                    value={values[f.key] || ""}
                    onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className={cn("rounded-lg border p-3", verdictTone)}>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <VerdictIcon className="h-4 w-4" /> {assessment.headline}
            </p>
            <p className="mt-1 text-xs opacity-90">{assessment.detail}</p>
            {assessment.verdict !== "insufficient" && (
              <Badge variant="outline" className="mt-2 border-current bg-background/60 text-xs">
                Model confidence {Math.round(assessment.confidence * 100)}% — clinical judgement decides
              </Badge>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Clinical note</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Skin condition, entry lesions, self-care adherence, surgery outcome…" />
          </div>

          <FollowUpFields
            value={followUp} onChange={setFollowUp}
            locationSuggestion={beneficiary.village || beneficiary.lga || ""}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save visit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MmdpServiceForm;
