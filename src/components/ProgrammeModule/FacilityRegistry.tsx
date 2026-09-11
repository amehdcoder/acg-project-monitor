// Health Facility Registration.
//
// Registered facilities are the backbone of the beneficiary register: every
// beneficiary belongs to a facility, and facility teams (with graded access)
// manage the records and referrals of the people attached to their facility.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2, Plus, Pencil, Users, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  FACILITY_TYPE_LABEL, useFacilities, type FacilityRow,
} from "@/lib/programmeModule/facilities";
import {
  getAllStates, getLGAsForState, getWardsForLGA,
} from "@/lib/nigeriaAdminData";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  /** Only administrators may register or edit facilities. */
  canManage?: boolean;
  /** Opens the focal-person manager for a facility. */
  onManageTeam?: (facilityId: string) => void;
}

interface CountRow { facility_id: string | null }

const emptyDraft = {
  id: "",
  name: "",
  facility_type: "phc" as FacilityRow["facility_type"],
  state: "",
  lga: "",
  ward: "",
  address: "",
  contact_person: "",
  contact_phone: "",
};

const FacilityRegistry = ({
  open, onOpenChange, projectId, canManage = false, onManageTeam,
}: Props) => {
  const { toast } = useToast();
  const { facilities, reload } = useFacilities(projectId);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [teamCounts, setTeamCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadCounts = useCallback(async () => {
    const [b, t] = await Promise.all([
      supabase.from("beneficiaries").select("facility_id").eq("project_id", projectId).limit(5000),
      supabase.from("facility_focal_persons").select("facility_id").eq("is_active", true).limit(5000),
    ]);
    const tally = (rows: CountRow[] | null) => {
      const m: Record<string, number> = {};
      for (const r of rows || []) if (r.facility_id) m[r.facility_id] = (m[r.facility_id] || 0) + 1;
      return m;
    };
    setCounts(tally(b.data as CountRow[]));
    setTeamCounts(tally(t.data as CountRow[]));
  }, [projectId]);

  useEffect(() => { if (open) void loadCounts(); }, [open, loadCounts]);

  const states = useMemo(() => getAllStates(), []);
  const lgas = useMemo(() => (draft.state ? getLGAsForState(draft.state) : []), [draft.state]);
  const wards = useMemo(
    () => (draft.state && draft.lga ? getWardsForLGA(draft.state, draft.lga) : []),
    [draft.state, draft.lga],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return facilities;
    return facilities.filter((f) =>
      `${f.name} ${f.state || ""} ${f.lga || ""} ${f.ward || ""}`.toLowerCase().includes(q));
  }, [facilities, search]);

  const openNew = () => { setDraft(emptyDraft); setFormOpen(true); };
  const openEdit = (f: FacilityRow) => {
    setDraft({
      id: f.id,
      name: f.name,
      facility_type: f.facility_type,
      state: f.state || "",
      lga: f.lga || "",
      ward: f.ward || "",
      address: "",
      contact_person: f.contact_person || "",
      contact_phone: f.contact_phone || "",
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) {
      toast({ title: "Give the facility a name", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        project_id: projectId,
        name: draft.name.trim(),
        facility_type: draft.facility_type,
        state: draft.state || null,
        lga: draft.lga || null,
        ward: draft.ward || null,
        address: draft.address || null,
        contact_person: draft.contact_person || null,
        contact_phone: draft.contact_phone || null,
        is_active: true,
      };
      if (draft.id) {
        const { error } = await supabase.from("health_facilities")
          .update(payload as never).eq("id", draft.id);
        if (error) throw error;
        toast({ title: "Facility updated" });
      } else {
        const { error } = await supabase.from("health_facilities")
          .insert({ ...payload, created_by: auth.user?.id } as never);
        if (error) throw error;
        toast({ title: "Facility registered", description: draft.name });
      }
      setFormOpen(false);
      await reload();
      await loadCounts();
    } catch (e) {
      toast({ title: "Could not save facility", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Health facility registration
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search facilities, ward or LGA…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {canManage && (
            <Button className="gap-1" onClick={openNew}>
              <Plus className="h-4 w-4" /> Register facility
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {filtered.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No facility registered yet for this project.
            </Card>
          )}
          {filtered.map((f) => (
            <Card key={f.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{f.name}</p>
                <p className="text-xs text-muted-foreground">
                  {FACILITY_TYPE_LABEL[f.facility_type]}
                  {f.ward ? ` · ${f.ward} ward` : ""}
                  {f.lga ? ` · ${f.lga}` : ""}
                  {f.state ? ` · ${f.state}` : ""}
                </p>
                {f.contact_person && (
                  <p className="text-xs text-muted-foreground">
                    Contact: {f.contact_person}{f.contact_phone ? ` · ${f.contact_phone}` : ""}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{counts[f.id] || 0} beneficiaries</Badge>
                <Badge variant="outline">{teamCounts[f.id] || 0} team members</Badge>
                {onManageTeam && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => onManageTeam(f.id)}>
                    <Users className="h-4 w-4" /> Team
                  </Button>
                )}
                {canManage && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => openEdit(f)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>

        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{draft.id ? "Edit facility" : "Register health facility"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Facility name</Label>
                <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Facility type</Label>
                <Select
                  value={draft.facility_type}
                  onValueChange={(v) => setDraft((d) => ({ ...d, facility_type: v as FacilityRow["facility_type"] }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[1200] bg-popover">
                    {(Object.keys(FACILITY_TYPE_LABEL) as FacilityRow["facility_type"][]).map((t) => (
                      <SelectItem key={t} value={t}>{FACILITY_TYPE_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>State</Label>
                  <Select
                    value={draft.state}
                    onValueChange={(v) => setDraft((d) => ({ ...d, state: v, lga: "", ward: "" }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent className="z-[1200] max-h-72 bg-popover">
                      {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>LGA</Label>
                  <Select
                    value={draft.lga}
                    onValueChange={(v) => setDraft((d) => ({ ...d, lga: v, ward: "" }))}
                    disabled={!draft.state}
                  >
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent className="z-[1200] max-h-72 bg-popover">
                      {lgas.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ward</Label>
                  <Select
                    value={draft.ward}
                    onValueChange={(v) => setDraft((d) => ({ ...d, ward: v }))}
                    disabled={!draft.lga}
                  >
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent className="z-[1200] max-h-72 bg-popover">
                      {wards.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Address / landmark</Label>
                <Textarea
                  rows={2}
                  value={draft.address}
                  onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Contact person</Label>
                  <Input
                    value={draft.contact_person}
                    onChange={(e) => setDraft((d) => ({ ...d, contact_person: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Contact phone</Label>
                  <Input
                    value={draft.contact_phone}
                    onChange={(e) => setDraft((d) => ({ ...d, contact_phone: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save facility"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

export default FacilityRegistry;
