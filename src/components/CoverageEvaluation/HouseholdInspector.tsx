import { useState } from "react";
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
  const [saving, setSaving] = useState(false);

  // Reset on household change
  if (household && household.id && status !== household.coverageStatus && label === "") {
    setLabel(household.label ?? "");
    setStatus(household.coverageStatus);
    setIntervention(household.intervention_status ?? "");
  }

  const handleSave = async () => {
    if (!household) return;
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("ces_households" as any)
      .update({
        label,
        coverage_status: status,
        intervention_status: intervention || null,
        notes: notes || null,
        visited_at: new Date().toISOString(),
        visited_by: userData.user?.id,
      })
      .eq("id", household.id);
    setSaving(false);
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
      <SheetContent className="overflow-y-auto">
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
