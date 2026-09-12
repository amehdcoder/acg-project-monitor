import { useEffect, useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import {
  CLOSED_OUTCOMES, REFERRAL_OUTCOMES, saveReferralOutcome,
} from "@/lib/programmeModule/facilityOps";
import type { BeneficiaryReferralRow } from "@/lib/programmeModule/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  referral: BeneficiaryReferralRow | null;
  beneficiaryName?: string;
  onSaved: () => void;
}

/**
 * Referral outcome form — the receiving facility records what happened, the
 * next follow-up date, time and location, so progress is visible to everyone.
 */
const ReferralOutcomeDialog = ({ open, onOpenChange, referral, beneficiaryName, onSaved }: Props) => {
  const { toast } = useToast();
  const [outcome, setOutcome] = useState("pending");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !referral) return;
    setOutcome(referral.outcome || "pending");
    setNotes(referral.outcome_notes || "");
    setDate(referral.followup_date || "");
    setTime(referral.followup_time || "");
    setLocation(referral.followup_location || "");
  }, [open, referral]);

  const save = async () => {
    if (!referral) return;
    if (!CLOSED_OUTCOMES.includes(outcome) && !date) {
      toast({ title: "Add the next follow-up date", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveReferralOutcome(referral.id, {
        outcome,
        outcome_notes: notes,
        followup_date: date,
        followup_time: time,
        followup_location: location,
        status:
          outcome === "treated" ? "completed"
            : outcome === "pending" ? undefined
              : referral.status === "initiated" ? "accepted" : undefined,
      });
      toast({ title: "Referral outcome saved" });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Could not save outcome", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Referral outcome{beneficiaryName ? ` — ${beneficiaryName}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Outcome</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-[1200] bg-popover">
                {REFERRAL_OUTCOMES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Next follow-up date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Follow-up location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="Clinic, ward, community or home visit" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="What was done, medication given, what happens next…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save outcome"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReferralOutcomeDialog;
