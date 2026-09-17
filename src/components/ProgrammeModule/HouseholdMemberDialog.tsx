// Add or edit somebody who lives in the household but is not a registered
// beneficiary — they still swallow the medicine, so they still need a record.

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import {
  MEMBER_RELATIONSHIPS, type HouseholdMemberRow,
} from "@/lib/programmeModule/householdMembers";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member?: HouseholdMemberRow | null;
  saving?: boolean;
  onSave: (draft: Partial<HouseholdMemberRow>) => Promise<void> | void;
}

const empty: Partial<HouseholdMemberRow> = {
  full_name: "", sex: "female", relationship: "child",
  is_pregnant: false, is_breastfeeding: false, is_alive: true,
};

const HouseholdMemberDialog = ({ open, onOpenChange, member, saving, onSave }: Props) => {
  const [draft, setDraft] = useState<Partial<HouseholdMemberRow>>(empty);

  useEffect(() => {
    if (open) setDraft(member ? { ...member } : { ...empty });
  }, [open, member]);

  const set = (patch: Partial<HouseholdMemberRow>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{member ? "Edit household member" : "Add a household member"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-sm">Full name</Label>
            <Input
              className="mt-1" value={draft.full_name || ""}
              onChange={(e) => set({ full_name: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-sm">Sex</Label>
            <Select value={draft.sex || "female"} onValueChange={(v) => set({ sex: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[1200] bg-popover">
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">Relationship to the head</Label>
            <Select
              value={draft.relationship || "other"}
              onValueChange={(v) => set({ relationship: v })}
            >
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[1200] bg-popover">
                {MEMBER_RELATIONSHIPS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">Age (years)</Label>
            <Input
              type="number" min={0} className="mt-1"
              value={draft.age_years ?? ""}
              onChange={(e) => set({ age_years: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>
          <div>
            <Label className="text-sm">Date of birth</Label>
            <Input
              type="date" className="mt-1" value={draft.date_of_birth || ""}
              onChange={(e) => set({ date_of_birth: e.target.value || null })}
            />
          </div>
          <div>
            <Label className="text-sm">Height (cm)</Label>
            <Input
              type="number" min={0} className="mt-1"
              value={draft.height_cm ?? ""}
              onChange={(e) => set({ height_cm: e.target.value === "" ? null : Number(e.target.value) })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Used for the height-pole dose and the 90 cm ivermectin cut-off.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <span className="text-sm font-medium text-foreground">Pregnant</span>
            <Switch
              checked={!!draft.is_pregnant}
              onCheckedChange={(v) => set({ is_pregnant: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <span className="text-sm font-medium text-foreground">Breastfeeding</span>
            <Switch
              checked={!!draft.is_breastfeeding}
              onCheckedChange={(v) => set({ is_breastfeeding: v })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-sm">Notes</Label>
            <Textarea
              className="mt-1" rows={2} value={draft.notes || ""}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={saving || !String(draft.full_name || "").trim()}
            onClick={() => void onSave(draft)}
          >
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HouseholdMemberDialog;
