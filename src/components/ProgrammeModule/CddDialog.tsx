// Register a community-directed distributor (CDD) under a health facility.

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import GeoCascadeFields from "./GeoCascadeFields";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  SEX_OPTIONS, TRAINING_STATUSES, saveCdd, type CddRow,
} from "@/lib/programmeModule/cddCaseSearch";
import type { FacilityRow } from "@/lib/programmeModule/facilities";
import { facilityGeoLabel, facilityGeoPatch } from "@/lib/programmeModule/facilityGeo";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  moduleId?: string;
  facilities: FacilityRow[];
  defaultFacilityId?: string;
  cdd?: CddRow | null;
  onSaved: () => void;
}

const blank = {
  facility_id: "", full_name: "", cdd_code: "", sex: "", phone: "",
  state: "", lga: "", ward: "", community: "", trained_on: "",
  training_status: "trained", supervisor_name: "", notes: "", is_active: true,
};

const CddDialog = ({
  open, onOpenChange, projectId, moduleId, facilities, defaultFacilityId, cdd, onSaved,
}: Props) => {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...blank });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(cdd
      ? {
        facility_id: cdd.facility_id,
        full_name: cdd.full_name,
        cdd_code: cdd.cdd_code || "",
        sex: cdd.sex || "",
        phone: cdd.phone || "",
        state: cdd.state || "",
        lga: cdd.lga || "",
        ward: cdd.ward || "",
        community: cdd.community || "",
        trained_on: cdd.trained_on || "",
        training_status: cdd.training_status || "trained",
        supervisor_name: cdd.supervisor_name || "",
        notes: cdd.notes || "",
        is_active: cdd.is_active,
      }
      : { ...blank, facility_id: defaultFacilityId || "" });
  }, [open, cdd, defaultFacilityId]);

  const set = (k: keyof typeof blank, v: string | boolean) =>
    setForm((p) => ({ ...p, [k]: v }));

  // Picking a facility fills only the geography levels still left blank.
  const pickFacility = (id: string) =>
    setForm((p) => {
      const patch = facilityGeoPatch(facilities.find((f) => f.id === id), p);
      return {
        ...p,
        facility_id: id,
        state: patch.state ?? p.state,
        lga: patch.lga ?? p.lga,
        ward: patch.ward ?? p.ward,
      };
    });

  const submit = async () => {
    if (!form.full_name.trim() || !form.facility_id) {
      toast({ title: "Name and facility are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveCdd({
        ...(cdd ? { id: cdd.id } : {}),
        project_id: projectId,
        module_id: moduleId || null,
        facility_id: form.facility_id,
        full_name: form.full_name,
        cdd_code: form.cdd_code,
        sex: form.sex,
        phone: form.phone,
        state: form.state,
        lga: form.lga,
        ward: form.ward,
        community: form.community,
        trained_on: form.trained_on,
        training_status: form.training_status,
        supervisor_name: form.supervisor_name,
        notes: form.notes,
        is_active: form.is_active,
      });
      toast({ title: cdd ? "CDD updated" : "CDD registered" });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Could not save", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cdd ? "Edit CDD" : "Register a CDD for MMDP case search"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm">Health facility</Label>
              <Select value={form.facility_id} onValueChange={pickFacility}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select facility…" /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {facilities.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Full name</Label>
              <Input className="mt-1" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
            </div>
            <div>
              <Label className="text-sm">CDD code</Label>
              <Input
                className="mt-1" value={form.cdd_code} placeholder="e.g. CDD-014"
                onChange={(e) => set("cdd_code", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-sm">Sex</Label>
              <Select value={form.sex} onValueChange={(v) => set("sex", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {SEX_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Phone</Label>
              <Input className="mt-1" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div>
              <Label className="text-sm">Supervisor</Label>
              <Input
                className="mt-1" value={form.supervisor_name}
                onChange={(e) => set("supervisor_name", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <GeoCascadeFields
              value={{ state: form.state, lga: form.lga, ward: form.ward, community: form.community }}
              onChange={(p) => setForm((f) => ({
                ...f, state: p.state ?? "", lga: p.lga ?? "", ward: p.ward ?? "", community: p.community ?? "",
              }))}
            />
            {facilityGeoLabel(facilities.find((f) => f.id === form.facility_id)) && (
              <p className="text-xs text-muted-foreground">
                Filled from the facility ({facilityGeoLabel(facilities.find((f) => f.id === form.facility_id))}) —
                change any level if the CDD works elsewhere.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm">Training status</Label>
              <Select value={form.training_status} onValueChange={(v) => set("training_status", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {TRAINING_STATUSES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Date trained</Label>
              <Input
                type="date" className="mt-1" value={form.trained_on}
                onChange={(e) => set("trained_on", e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="text-sm">Notes</Label>
            <Textarea className="mt-1" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
            Active for case search
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save CDD"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CddDialog;
