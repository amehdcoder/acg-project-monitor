// A potential MMDP case found by a CDD during community case search.

import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MapPin } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import GeoCascadeFields from "./GeoCascadeFields";
import PhotoCaptureField from "./PhotoCaptureField";
import {
  AFFECTED_SIDES, MMDP_CONDITIONS, SEX_OPTIONS, savePotentialCase,
  type CddRow, type PotentialCaseRow,
} from "@/lib/programmeModule/cddCaseSearch";
import type { FacilityRow } from "@/lib/programmeModule/facilities";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  moduleId?: string;
  facilities: FacilityRow[];
  cdds: CddRow[];
  defaultFacilityId?: string;
  caseRow?: PotentialCaseRow | null;
  onSaved: () => void;
}

const blank = {
  facility_id: "", cdd_id: "", full_name: "", sex: "", age: "", phone: "",
  state: "", lga: "", ward: "", community: "", address: "",
  condition: "lymphoedema", affected_side: "", duration_years: "",
  acute_attacks_last_year: "", search_date: new Date().toISOString().slice(0, 10),
  notes: "",
};

const PotentialCaseDialog = ({
  open, onOpenChange, projectId, moduleId, facilities, cdds,
  defaultFacilityId, caseRow, onSaved,
}: Props) => {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...blank });
  const [photos, setPhotos] = useState<string[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  // Pictures are stored under the case's own folder in the private media store.
  const [mediaKey] = useState(() => `case-search-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    if (!open) return;
    if (caseRow) {
      setForm({
        facility_id: caseRow.facility_id,
        cdd_id: caseRow.cdd_id || "",
        full_name: caseRow.full_name,
        sex: caseRow.sex || "",
        age: caseRow.age != null ? String(caseRow.age) : "",
        phone: caseRow.phone || "",
        state: caseRow.state || "",
        lga: caseRow.lga || "",
        ward: caseRow.ward || "",
        community: caseRow.community || "",
        address: caseRow.address || "",
        condition: caseRow.condition,
        affected_side: caseRow.affected_side || "",
        duration_years: caseRow.duration_years != null ? String(caseRow.duration_years) : "",
        acute_attacks_last_year: caseRow.acute_attacks_last_year != null
          ? String(caseRow.acute_attacks_last_year) : "",
        search_date: caseRow.search_date,
        notes: caseRow.notes || "",
      });
      setPhotos(caseRow.photos || []);
      setCoords(caseRow.latitude != null && caseRow.longitude != null
        ? { lat: caseRow.latitude, lng: caseRow.longitude } : null);
    } else {
      setForm({ ...blank, facility_id: defaultFacilityId || "" });
      setPhotos([]);
      setCoords(null);
    }
  }, [open, caseRow, defaultFacilityId]);

  const set = (k: keyof typeof blank, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const facilityCdds = useMemo(
    () => cdds.filter((c) => !form.facility_id || c.facility_id === form.facility_id),
    [cdds, form.facility_id],
  );

  const takeLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => toast({ title: "Location unavailable", description: "You can save the case without it." }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };

  const setPhoto = (index: number, value: string | null) => {
    setPhotos((prev) => {
      const next = [...prev];
      if (value) next[index] = value;
      else next.splice(index, 1);
      return next.filter(Boolean);
    });
  };

  const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

  const submit = async () => {
    if (!form.full_name.trim() || !form.facility_id) {
      toast({ title: "Name and facility are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await savePotentialCase({
        ...(caseRow ? { id: caseRow.id } : {}),
        project_id: projectId,
        module_id: moduleId || null,
        facility_id: form.facility_id,
        cdd_id: form.cdd_id || null,
        full_name: form.full_name,
        sex: form.sex,
        age: num(form.age),
        phone: form.phone,
        state: form.state,
        lga: form.lga,
        ward: form.ward,
        community: form.community,
        address: form.address,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        condition: form.condition,
        affected_side: form.affected_side,
        duration_years: num(form.duration_years),
        acute_attacks_last_year: num(form.acute_attacks_last_year),
        photos,
        search_date: form.search_date,
        notes: form.notes,
      });
      toast({
        title: caseRow ? "Potential case updated" : "Potential case recorded",
        description: "A clinician at the facility will confirm it.",
      });
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
          <DialogTitle>
            {caseRow ? "Edit potential case" : "Record a potential MMDP case"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm">Facility</Label>
              <Select value={form.facility_id} onValueChange={(v) => { set("facility_id", v); set("cdd_id", ""); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select facility…" /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {facilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Identified by (CDD)</Label>
              <Select value={form.cdd_id} onValueChange={(v) => set("cdd_id", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select CDD…" /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {facilityCdds.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}{c.cdd_code ? ` (${c.cdd_code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Label className="text-sm">Name of person found</Label>
              <Input className="mt-1" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
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
              <Label className="text-sm">Age</Label>
              <Input
                type="number" inputMode="numeric" className="mt-1"
                value={form.age} onChange={(e) => set("age", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm">Phone</Label>
              <Input className="mt-1" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div>
              <Label className="text-sm">House address / landmark</Label>
              <Input className="mt-1" value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
          </div>

          <GeoCascadeFields
            value={{ state: form.state, lga: form.lga, ward: form.ward, community: form.community }}
            onChange={(p) => setForm((f) => ({
              ...f, state: p.state ?? "", lga: p.lga ?? "", ward: p.ward ?? "", community: p.community ?? "",
            }))}
          />

          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label className="text-sm">Condition seen</Label>
              <Select value={form.condition} onValueChange={(v) => set("condition", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {MMDP_CONDITIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Affected side</Label>
              <Select value={form.affected_side} onValueChange={(v) => set("affected_side", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {AFFECTED_SIDES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Swelling for (years)</Label>
              <Input
                type="number" inputMode="decimal" className="mt-1"
                value={form.duration_years} onChange={(e) => set("duration_years", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-sm">Acute attacks (last year)</Label>
              <Input
                type="number" inputMode="numeric" className="mt-1"
                value={form.acute_attacks_last_year}
                onChange={(e) => set("acute_attacks_last_year", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <PhotoCaptureField
              label="Picture of the affected area"
              hint="Whole affected limb or swelling, plain background, ruler beside it if possible."
              value={photos[0] || null}
              projectId={projectId}
              beneficiaryId={caseRow?.id || mediaKey}
              onChange={(path) => setPhoto(0, path)}
            />
            <PhotoCaptureField
              label="Second picture (optional)"
              hint="Other side, or a closer view of the skin changes."
              value={photos[1] || null}
              projectId={projectId}
              beneficiaryId={caseRow?.id || mediaKey}
              onChange={(path) => setPhoto(1, path)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm">Date of case search</Label>
              <Input
                type="date" className="mt-1" value={form.search_date}
                onChange={(e) => set("search_date", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-sm">Location of the household</Label>
              <div className="mt-1 flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={takeLocation}>
                  <MapPin className="h-4 w-4" /> Capture GPS
                </Button>
                <span className="text-xs text-muted-foreground">
                  {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : "Not captured"}
                </span>
              </div>
            </div>
          </div>

          <div>
            <Label className="text-sm">Notes from the CDD</Label>
            <Textarea className="mt-1" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save potential case"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PotentialCaseDialog;
