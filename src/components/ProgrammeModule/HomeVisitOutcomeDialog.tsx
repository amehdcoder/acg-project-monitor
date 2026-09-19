// Report the outcome of a dispatched home visit.
//
// Field teams (CDDs, facility focal persons, health workers) close the loop on
// the follow-up risk prediction here: what they found at the house, the action
// taken and the newly agreed appointment date, which is written straight onto
// the beneficiary's record.

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, HomeIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { useCdds } from "@/lib/programmeModule/cddCaseSearch";
import {
  VISITOR_ROLES, VISIT_OUTCOMES, outcomeDef, reportVisitOutcome,
  type HomeVisitRow,
} from "@/lib/programmeModule/homeVisits";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  visit: Pick<HomeVisitRow, "id" | "beneficiary_id" | "due_date" | "risk_score" | "risk_band"> | null;
  beneficiaryName?: string;
  /** Facility the beneficiary is registered under — used to sort the CDD list. */
  facilityId?: string | null;
  onReported?: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

const HomeVisitOutcomeDialog = ({
  open, onOpenChange, projectId, visit, beneficiaryName, facilityId, onReported,
}: Props) => {
  const { toast } = useToast();
  const { locked, run } = useSubmitLock();
  const { cdds } = useCdds(projectId);

  const [visitorRole, setVisitorRole] = useState("cdd");
  const [cddId, setCddId] = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [visitedOn, setVisitedOn] = useState(today);
  const [foundAtHome, setFoundAtHome] = useState("yes");
  const [outcome, setOutcome] = useState("seen_rebooked");
  const [nextDate, setNextDate] = useState("");
  const [action, setAction] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setVisitorRole("cdd"); setCddId(""); setVisitorName("");
    setVisitedOn(today()); setFoundAtHome("yes"); setOutcome("seen_rebooked");
    const d = new Date(); d.setDate(d.getDate() + 14);
    setNextDate(d.toISOString().slice(0, 10));
    setAction(""); setNotes("");
  }, [open]);

  const sortedCdds = useMemo(() => {
    const active = cdds.filter((c) => c.is_active !== false);
    if (!facilityId) return active;
    return [
      ...active.filter((c) => c.facility_id === facilityId),
      ...active.filter((c) => c.facility_id !== facilityId),
    ];
  }, [cdds, facilityId]);

  const def = outcomeDef(outcome);

  const submit = () =>
    void run(async () => {
      if (!visit) return;
      const name = visitorRole === "cdd" && cddId
        ? sortedCdds.find((c) => c.id === cddId)?.full_name || visitorName
        : visitorName;
      if (!name.trim()) {
        toast({ title: "Who carried out the visit?", description: "Add the name of the person who visited.", variant: "destructive" });
        return;
      }
      try {
        await reportVisitOutcome({
          visitId: visit.id,
          beneficiaryId: visit.beneficiary_id,
          projectId,
          visitorRole,
          visitorName: name.trim(),
          cddId: visitorRole === "cdd" ? cddId || null : null,
          visitedOn,
          foundAtHome: foundAtHome === "yes",
          outcome,
          nextAppointmentDate: def?.needsAppointment ? nextDate || null : null,
          actionTaken: action || null,
          notes: notes || null,
        });
        toast({
          title: "Visit outcome recorded",
          description: def?.needsAppointment && nextDate
            ? `Next follow-up set for ${new Date(nextDate).toLocaleDateString()}.`
            : "The beneficiary record has been updated.",
        });
        onOpenChange(false);
        onReported?.();
      } catch (e) {
        toast({ title: "Could not save the outcome", description: (e as Error).message, variant: "destructive" });
      }
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HomeIcon className="h-4 w-4" /> Report the home visit
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
            <span className="font-semibold text-foreground">{beneficiaryName || "Beneficiary"}</span>
            {visit?.risk_score != null && <Badge variant="outline">Risk {visit.risk_score}</Badge>}
            {visit?.due_date && (
              <span className="text-xs text-muted-foreground">
                Due {new Date(visit.due_date).toLocaleDateString()}
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm">Who visited</Label>
              <Select value={visitorRole} onValueChange={setVisitorRole}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {VISITOR_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Date of visit</Label>
              <Input type="date" className="mt-1" value={visitedOn} onChange={(e) => setVisitedOn(e.target.value)} />
            </div>
          </div>

          {visitorRole === "cdd" && sortedCdds.length > 0 && (
            <div>
              <Label className="text-sm">Distributor (CDD)</Label>
              <Select value={cddId} onValueChange={setCddId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a registered distributor" /></SelectTrigger>
                <SelectContent className="z-[1200] max-h-72 bg-popover">
                  {sortedCdds.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}{c.cdd_code ? ` · ${c.cdd_code}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-sm">Name of the person who visited</Label>
            <Input
              className="mt-1"
              value={visitorRole === "cdd" && cddId
                ? sortedCdds.find((c) => c.id === cddId)?.full_name || visitorName
                : visitorName}
              onChange={(e) => { setCddId(""); setVisitorName(e.target.value); }}
              placeholder="Full name"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm">Found at home?</Label>
              <Select value={foundAtHome} onValueChange={setFoundAtHome}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">What happened</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] max-h-72 bg-popover">
                  {VISIT_OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {def?.needsAppointment && (
            <div>
              <Label className="text-sm">Next appointment date</Label>
              <Input type="date" className="mt-1" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                This becomes the person's next follow-up date on their record.
              </p>
            </div>
          )}

          <div>
            <Label className="text-sm">Action taken</Label>
            <Input
              className="mt-1" value={action} onChange={(e) => setAction(e.target.value)}
              placeholder="Counselled on limb care, gave medicine, arranged transport…"
            />
          </div>

          <div>
            <Label className="text-sm">Notes</Label>
            <Textarea className="mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={locked} onClick={submit}>
            {locked && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save outcome
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HomeVisitOutcomeDialog;
