import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Household3D } from "./Village3DMap";

interface HouseholdInspectorProps {
  household: Household3D | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

const STATUS_OPTIONS: Array<{ value: Household3D["coverageStatus"]; label: string; icon: any; color: string }> = [
  { value: "unassessed", label: "Not Yet Assessed", icon: AlertTriangle, color: "bg-slate-500" },
  { value: "covered", label: "✓ Covered (Treated)", icon: CheckCircle2, color: "bg-green-600" },
  { value: "missed", label: "✗ Missed Household", icon: XCircle, color: "bg-red-600" },
  { value: "refused", label: "Refused Intervention", icon: AlertTriangle, color: "bg-yellow-600" },
  { value: "revisit", label: "Schedule Revisit", icon: RefreshCw, color: "bg-orange-600" },
];

const HouseholdInspector = ({ household, open, onOpenChange, onUpdated }: HouseholdInspectorProps) => {
  const [label, setLabel] = useState(household?.label ?? "");
  const [status, setStatus] = useState<Household3D["coverageStatus"]>(household?.coverageStatus ?? "unassessed");
  const [notes, setNotes] = useState("");
  const [intervention, setIntervention] = useState(household?.intervention_status ?? "");
  const [eligiblePersons, setEligiblePersons] = useState<number | string>(household?.eligible_persons ?? 0);
  const [treatedPersons, setTreatedPersons] = useState<number | string>(household?.treated_persons ?? 0);
  const [saving, setSaving] = useState(false);


  // Reset whenever a different household is opened (or the same one re-opened).
  useEffect(() => {
    if (!household) return;
    setLabel(household.label ?? "");
    setStatus(household.coverageStatus);
    setNotes("");
    setIntervention(household.intervention_status ?? "");
    setEligiblePersons(household.eligible_persons ?? 0);
    setTreatedPersons(household.treated_persons ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.id, open]);


  const handleSave = async () => {
    if (!household) return;
    
    if (Number(treatedPersons) > Number(eligiblePersons)) {
      toast({ 
        title: "Validation Error", 
        description: "Treated persons cannot exceed eligible persons.", 
        variant: "destructive" 
      });
      return;
    }
    
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();
    // Concurrency: optimistic-locking update so two devices editing the same household
    // never silently overwrite each other. `safeUpdate` retries once on conflict.
    const { safeUpdate } = await import("@/lib/optimisticUpdate");
    const { conflict, error } = await safeUpdate("ces_households", household.id, {
      label,
      coverage_status: status,
      intervention_status: intervention || null,
      eligible_persons: Number(eligiblePersons) || 0,
      treated_persons: Number(treatedPersons) || 0,
      notes: notes || null,
      visited_at: new Date().toISOString(),
      visited_by: userData.user?.id,
    });
    setSaving(false);
    if (conflict) {
      toast({ title: "Update conflict", description: "This household was just updated elsewhere. Please reopen it to see the latest values.", variant: "destructive" });
      return;
    }
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "✓ Household updated" });
    onUpdated();
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!household) return;
    const { error } = await supabase.from("ces_households" as any).delete().eq("id", household.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Household removed" });
    onUpdated();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* z-[1100] keeps the visit checklist above Leaflet panes/controls (which sit at z 400-1000) */}
      <SheetContent className="overflow-y-auto z-[1100] sm:max-w-md w-full">
        <SheetHeader>
          <SheetTitle>Household Inspector</SheetTitle>
          <SheetDescription>
            Assign sampling status, log intervention coverage, or schedule a revisit.
          </SheetDescription>
        </SheetHeader>

        {household && (
          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-2">
              <Badge>{household.id.slice(0, 8)}</Badge>
              <span className="text-xs text-muted-foreground">
                {household.lat.toFixed(5)}, {household.lng.toFixed(5)}
              </span>
            </div>

            <div>
              <Label>Household Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. House #3 — Mallam Sani"
              />
            </div>

            <div>
              <Label>Coverage Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Household3D["coverageStatus"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Intervention Commodity</Label>
              <Input
                value={intervention}
                onChange={(e) => setIntervention(e.target.value)}
                placeholder="e.g. Ivermectin given, ITN distributed"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-indigo-700 font-bold">Eligible Persons</Label>
                <Input
                  type="number"
                  value={eligiblePersons}
                  onChange={(e) => setEligiblePersons(e.target.value)}
                  className="border-indigo-200 focus:border-indigo-500"
                />
              </div>
              <div>
                <Label className="text-emerald-700 font-bold">Treated Persons</Label>
                <Input
                  type="number"
                  value={treatedPersons}
                  onChange={(e) => setTreatedPersons(e.target.value)}
                  className="border-emerald-200 focus:border-emerald-500"
                />
              </div>
            </div>


            <div>
              <Label>Visit Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why was it missed? Refusal reason? Planned revisit?"
                rows={3}
              />
            </div>

            <SheetFooter className="gap-2">
              <Button variant="destructive" onClick={handleDelete} disabled={saving}>
                <Trash2 className="h-4 w-4 mr-2" />
                Remove
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save Update"}
              </Button>
            </SheetFooter>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default HouseholdInspector;
