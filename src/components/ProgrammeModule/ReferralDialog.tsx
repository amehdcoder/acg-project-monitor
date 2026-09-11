import { useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { enqueue, flushQueue, newUuid } from "@/lib/programmeModule/offlineQueue";
import { visibleComponents } from "@/lib/programmeModule/defaults";
import type { ProgrammeModuleConfig } from "@/lib/programmeModule/types";
import { recordAudit } from "./useProgrammeModule";
import { useFacilities, FACILITY_TYPE_LABEL, URGENCY_OPTIONS } from "@/lib/programmeModule/facilities";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config: ProgrammeModuleConfig;
  beneficiaryId: string;
  projectId: string;
  /** Facility the beneficiary currently belongs to, if any. */
  fromFacilityId?: string | null;
  onSaved: () => void;
}

const ReferralDialog = ({
  open, onOpenChange, config, beneficiaryId, projectId, fromFacilityId, onSaved,
}: Props) => {
  const { toast } = useToast();
  const { facilities } = useFacilities(projectId);
  const [toFacilityId, setToFacilityId] = useState("");
  const [urgency, setUrgency] = useState("routine");
  const [clinicalSummary, setClinicalSummary] = useState("");
  const [reason, setReason] = useState(config.workflow.referralReasons[0] || "");
  const [componentKey, setComponentKey] = useState<string>("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState(config.workflow.referralStatuses[0]?.value || "initiated");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const toFacility = facilities.find((f) => f.id === toFacilityId);
    if (!toFacility) {
      toast({ title: "Select the facility the person is referred to", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        beneficiary_id: beneficiaryId,
        project_id: projectId,
        component_key: componentKey || null,
        referred_to: toFacility.name,
        to_facility_id: toFacility.id,
        from_facility_id: fromFacilityId || null,
        urgency,
        clinical_summary: clinicalSummary || null,
        reason: reason || null,
        referral_date: date,
        status,
        notes: notes || null,
        submission_uuid: newUuid(),
        created_by: auth.user?.id,
      };
      if (navigator.onLine) {
        const { error } = await supabase.from("beneficiary_referrals").insert(payload as never);
        if (error) throw error;
        await recordAudit({
          beneficiary_id: beneficiaryId, project_id: projectId,
          action: "referral_created", new_value: payload.referred_to,
        });
        toast({ title: "Referral created" });
      } else {
        enqueue("referral", payload as unknown as Record<string, unknown>);
        toast({ title: "Saved offline", description: "It will sync when you are back online." });
      }
      void flushQueue();
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Could not create referral", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Create referral</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Referred to (registered facility)</Label>
            <Select value={toFacilityId} onValueChange={setToFacilityId}>
              <SelectTrigger><SelectValue placeholder="Select facility…" /></SelectTrigger>
              <SelectContent className="z-[1200] max-h-72 bg-popover">
                {facilities.filter((f) => f.id !== fromFacilityId).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name} — {FACILITY_TYPE_LABEL[f.facility_type]}
                    {f.lga ? ` · ${f.lga}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Focal persons at the receiving facility will see this patient's complete record and history.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Urgency</Label>
            <Select value={urgency} onValueChange={setUrgency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-[1200] bg-popover">
                {URGENCY_OPTIONS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Clinical summary</Label>
            <Textarea rows={3} value={clinicalSummary} onChange={(e) => setClinicalSummary(e.target.value)}
              placeholder="Presenting problem, latest scores, medication, what the receiving facility should do…" />
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Select reason…" /></SelectTrigger>
              <SelectContent className="z-[1200] bg-popover">
                {config.workflow.referralReasons.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Programme component (optional)</Label>
            <Select value={componentKey} onValueChange={setComponentKey}>
              <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
              <SelectContent className="z-[1200] bg-popover">
                {visibleComponents(config).map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {config.workflow.referralStatuses.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Create referral"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReferralDialog;
