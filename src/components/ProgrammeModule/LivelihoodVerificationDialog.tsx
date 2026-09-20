// Ground verification of a shortlisted person: what the verifier actually saw
// at the house, scored live against what the system predicted.

import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, MapPin, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { toneClasses } from "@/lib/programmeModule/defaults";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";
import {
  FINDINGS, OBSERVATION_FIELDS, RECOMMENDATIONS, VERIFIER_ROLES,
  saveVerification, scoreObservation,
  type LivelihoodVerificationRow,
} from "@/lib/programmeModule/livelihoodVerification";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  moduleId?: string;
  opportunityId?: string | null;
  beneficiary: BeneficiaryRow | null;
  /** The score the system produced before the visit. */
  predicted: number;
  assessmentId?: string | null;
  existing?: LivelihoodVerificationRow | null;
  onSaved?: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

const LivelihoodVerificationDialog = ({
  open, onOpenChange, projectId, moduleId, opportunityId, beneficiary,
  predicted, assessmentId, existing, onSaved,
}: Props) => {
  const { toast } = useToast();
  const [observed, setObserved] = useState<Record<string, unknown>>({});
  const [visitDate, setVisitDate] = useState(today());
  const [verifierName, setVerifierName] = useState("");
  const [verifierRole, setVerifierRole] = useState("livelihood_officer");
  const [finding, setFinding] = useState("confirmed");
  const [recommendation, setRecommendation] = useState("enrol");
  const [notes, setNotes] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [touchedFinding, setTouchedFinding] = useState(false);

  useEffect(() => {
    if (!open) return;
    setObserved((existing?.observed as Record<string, unknown>) || {});
    setVisitDate(existing?.visit_date || today());
    setVerifierName(existing?.verifier_name || "");
    setVerifierRole(existing?.verifier_role || "livelihood_officer");
    setFinding(existing?.finding || "confirmed");
    setRecommendation(existing?.recommendation || "enrol");
    setNotes(existing?.notes || "");
    setCoords(existing?.latitude != null && existing?.longitude != null
      ? { lat: existing.latitude, lng: existing.longitude } : null);
    setTouchedFinding(Boolean(existing));
    if (!existing && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 120_000 },
      );
    }
  }, [open, existing]);

  const seen = useMemo(() => scoreObservation(observed), [observed]);
  const gap = seen.answered ? seen.score - predicted : 0;
  const homeVisitFinding = ["confirmed", "worse", "better"].includes(finding);

  // The system suggests what the visit means, the verifier can overrule it.
  useEffect(() => {
    if (touchedFinding || !seen.answered) return;
    setFinding(gap >= 10 ? "worse" : gap <= -10 ? "better" : "confirmed");
  }, [gap, seen.answered, touchedFinding]);

  const save = async () => {
    if (!beneficiary) return;
    if (homeVisitFinding && seen.answered < 5) {
      toast({
        title: "Record what you saw",
        description: "At least five observations are needed before the visit can be used.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await saveVerification({
        id: existing?.id,
        project_id: projectId,
        module_id: moduleId || null,
        opportunity_id: opportunityId || null,
        beneficiary_id: beneficiary.id,
        assessment_id: assessmentId || null,
        visit_date: visitDate,
        verifier_name: verifierName || null,
        verifier_role: verifierRole,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        finding,
        observed,
        observed_vulnerability: homeVisitFinding && seen.answered ? seen.score : null,
        predicted_vulnerability: predicted,
        recommendation,
        notes: notes || null,
      });
      toast({ title: "Verification recorded", description: "The ranking has been updated with what you found." });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Verify on the ground — {beneficiary?.full_name}
          </DialogTitle>
        </DialogHeader>

        <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div>
            <p className="text-xs text-muted-foreground">System score before the visit</p>
            <p className="text-2xl font-semibold tabular-nums">{predicted}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">What you are seeing</p>
            <p className="text-2xl font-semibold tabular-nums">{seen.answered ? seen.score : "—"}</p>
          </div>
          <div className="max-w-xs text-xs text-muted-foreground">
            {seen.answered === 0
              ? "Answer what you can see; the visit score builds as you go."
              : Math.abs(gap) < 10
                ? "The home matches the record so far."
                : gap > 0
                  ? `The home looks ${gap} points worse than the record says.`
                  : `The home looks ${-gap} points better off than the record says.`}
          </div>
          <Badge variant="outline" className="gap-1 text-[11px]">
            <MapPin className="h-3 w-3" />
            {coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : "No GPS yet"}
          </Badge>
        </Card>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Visit date</Label>
            <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Verified by</Label>
            <Input value={verifierName} onChange={(e) => setVerifierName(e.target.value)} placeholder="Name" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <Select value={verifierRole} onValueChange={setVerifierRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-[140]">
                {VERIFIER_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />
        <p className="text-sm font-semibold">What did you see?</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {OBSERVATION_FIELDS.map((f) => (
            <div key={f.name} className="space-y-1">
              <Label className="text-xs">{f.label}</Label>
              <Select
                value={String(observed[f.name] ?? "")}
                onValueChange={(v) => setObserved((p) => ({ ...p, [f.name]: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent className="z-[140]">
                  {f.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
            </div>
          ))}
        </div>

        <Separator />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Outcome of the visit</Label>
            <Select value={finding} onValueChange={(v) => { setTouchedFinding(true); setFinding(v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-[140]">
                {FINDINGS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!touchedFinding && seen.answered > 0 && (
              <p className="text-[11px] text-muted-foreground">Suggested from what you recorded — change it if you disagree.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Recommendation</Label>
            <Select value={recommendation} onValueChange={setRecommendation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-[140]">
                {RECOMMENDATIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Notes from the visit</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {homeVisitFinding && seen.answered > 0 && (
          <Card className={cn("border p-3 text-xs", toneClasses[Math.abs(gap) < 10 ? "success" : "warning"])}>
            Once saved, this person's score becomes{" "}
            <strong>{Math.round(seen.score * 0.7 + predicted * 0.3)}</strong> — mostly what you saw, with the
            record still counting for what a visit cannot see. The system also learns from the difference and
            adjusts everyone who has not been verified yet.
          </Card>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save verification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LivelihoodVerificationDialog;
