// Administrator screen: who is the focal person for which health facility.
// Focal persons manage the beneficiaries, cases and referrals of their
// facility, and can see the complete record of any patient referred to them.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserPlus, UserMinus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  useFacilities, FACILITY_TYPE_LABEL, ACCESS_LEVELS, ACCESS_LEVEL_LABEL,
  type FacilityAccessLevel,
} from "@/lib/programmeModule/facilities";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  /** Pre-selects a facility when opened from the facility registry. */
  initialFacilityId?: string;
}

interface PersonRow {
  id: string; facility_id: string; user_id: string; role: string;
  access_level: FacilityAccessLevel; is_active: boolean;
}
interface ProfileRow { user_id: string; first_name: string; last_name: string; email: string }

const ROLES = [
  { value: "focal_person", label: "Facility focal person" },
  { value: "clinician", label: "Clinician" },
  { value: "pharmacist", label: "Pharmacist" },
  { value: "records_officer", label: "Records officer" },
];

const FacilityFocalPersons = ({ open, onOpenChange, projectId, initialFacilityId }: Props) => {
  const { toast } = useToast();
  const { facilities } = useFacilities(projectId);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [facilityId, setFacilityId] = useState(initialFacilityId || "");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("focal_person");
  const [accessLevel, setAccessLevel] = useState<FacilityAccessLevel>("manage");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, pr] = await Promise.all([
      supabase.from("facility_focal_persons").select("id,facility_id,user_id,role,access_level,is_active"),
      supabase.from("profiles").select("user_id,first_name,last_name,email").order("first_name").limit(1000),
    ]);
    setPeople((p.data as PersonRow[]) || []);
    setProfiles((pr.data as ProfileRow[]) || []);
  }, []);

  useEffect(() => { if (open) void load(); }, [open, load]);
  useEffect(() => { if (open && initialFacilityId) setFacilityId(initialFacilityId); }, [open, initialFacilityId]);

  const nameOf = useCallback(
    (uid: string) => {
      const p = profiles.find((x) => x.user_id === uid);
      return p ? `${p.first_name} ${p.last_name}`.trim() || p.email : uid.slice(0, 8);
    },
    [profiles],
  );

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles.slice(0, 50);
    return profiles
      .filter((p) => `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(q))
      .slice(0, 50);
  }, [profiles, search]);

  const assign = async () => {
    if (!facilityId || !userId) return;
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("facility_focal_persons")
        .upsert(
          {
            facility_id: facilityId, user_id: userId, role, access_level: accessLevel,
            is_active: true, created_by: auth.user?.id,
          } as never,
          { onConflict: "facility_id,user_id" },
        );
      if (error) throw error;
      toast({ title: "Team member assigned", description: ACCESS_LEVEL_LABEL[accessLevel] });
      setUserId("");
      await load();
    } catch (e) {
      toast({ title: "Could not assign", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row: PersonRow) => {
    const { error } = await supabase
      .from("facility_focal_persons")
      .update({ is_active: !row.is_active } as never)
      .eq("id", row.id);
    if (error) {
      toast({ title: "Could not update", description: error.message, variant: "destructive" });
      return;
    }
    await load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Facility focal persons
          </DialogTitle>
        </DialogHeader>

        <Card className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Facility</Label>
              <Select value={facilityId} onValueChange={setFacilityId}>
                <SelectTrigger><SelectValue placeholder="Select facility…" /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {facilities.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name} — {FACILITY_TYPE_LABEL[f.facility_type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Find user</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email…" />
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
              <SelectContent className="z-[1200] max-h-72 bg-popover">
                {filteredProfiles.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {`${p.first_name} ${p.last_name}`.trim() || p.email} — {p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="gap-1" disabled={busy || !facilityId || !userId} onClick={assign}>
            <UserPlus className="h-4 w-4" /> Assign focal person
          </Button>
        </Card>

        <div className="space-y-3">
          {facilities.map((f) => {
            const rows = people.filter((p) => p.facility_id === f.id);
            if (!rows.length) return null;
            return (
              <Card key={f.id} className="space-y-2 p-4">
                <h3 className="font-semibold text-foreground">{f.name}</h3>
                {rows.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">{nameOf(r.user_id)}</p>
                      <p className="text-xs text-muted-foreground">
                        {ROLES.find((x) => x.value === r.role)?.label || r.role}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={r.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}>
                        {r.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => void toggle(r)}>
                        <UserMinus className="h-4 w-4" /> {r.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </div>
                ))}
              </Card>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FacilityFocalPersons;
