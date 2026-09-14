// Administrator screen: who may open the restricted safeguarding module.
// Administrators appoint officers but cannot read safeguarding records
// themselves, and cannot appoint themselves.

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
import { ShieldCheck, UserPlus, UserMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  isOwner?: boolean;
  onChanged?: () => void;
}

interface OfficerRow {
  id: string; project_id: string; user_id: string; role: string; is_active: boolean;
}
interface ProfileRow { user_id: string; first_name: string; last_name: string; email: string }

const ROLES = [
  { value: "safeguarding_officer", label: "Safeguarding officer" },
  { value: "safeguarding_lead", label: "Safeguarding lead" },
];

const SafeguardingOfficers = ({ open, onOpenChange, projectId, isOwner = false, onChanged }: Props) => {
  const { toast } = useToast();
  const [officers, setOfficers] = useState<OfficerRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("safeguarding_officer");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [o, pr] = await Promise.all([
      supabase.from("safeguarding_officers" as never).select("*").eq("project_id", projectId),
      supabase.from("profiles").select("user_id,first_name,last_name,email").order("first_name").limit(1000),
    ]);
    setOfficers((o.data as unknown as OfficerRow[]) || []);
    setProfiles((pr.data as ProfileRow[]) || []);
  }, [projectId]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const nameOf = (uid: string) => {
    const p = profiles.find((x) => x.user_id === uid);
    return p ? `${p.first_name} ${p.last_name}`.trim() || p.email : uid.slice(0, 8);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles.slice(0, 50);
    return profiles
      .filter((p) => `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(q))
      .slice(0, 50);
  }, [profiles, search]);

  const appoint = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user?.id === userId && !isOwner) {
        throw new Error("You cannot appoint yourself as a safeguarding officer.");
      }
      const { error } = await supabase
        .from("safeguarding_officers" as never)
        .upsert({
          project_id: projectId, user_id: userId, role, is_active: true,
          created_by: auth.user?.id,
        } as never, { onConflict: "project_id,user_id" });
      if (error) throw error;
      toast({ title: "Safeguarding officer appointed" });
      setUserId("");
      await load();
      onChanged?.();
    } catch (e) {
      toast({ title: "Could not appoint", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row: OfficerRow) => {
    const { error } = await supabase
      .from("safeguarding_officers" as never)
      .update({ is_active: !row.is_active } as never)
      .eq("id", row.id);
    if (error) {
      toast({ title: "Could not update", description: error.message, variant: "destructive" });
      return;
    }
    await load();
    onChanged?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Safeguarding officers
          </DialogTitle>
        </DialogHeader>

        <Card className="space-y-3 p-4">
          <p className="text-xs text-muted-foreground">
            Only the people listed here can open safeguarding narratives, concerns and actions.
            {isOwner
              ? "Owners may appoint themselves or another trusted user. Access is restricted to this project."
              : "Appointing someone does not give you access yourself."}
          </p>
          <div className="space-y-1.5">
            <Label>Find user</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email…" />
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
              <SelectContent className="z-[1200] max-h-72 bg-popover">
                {filtered.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {`${p.first_name} ${p.last_name}`.trim() || p.email} — {p.email}
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
          <Button className="gap-1" disabled={busy || !userId} onClick={appoint}>
            <UserPlus className="h-4 w-4" /> Appoint officer
          </Button>
        </Card>

        <div className="space-y-2">
          {officers.length === 0 && (
            <p className="text-sm text-muted-foreground">No safeguarding officer appointed yet.</p>
          )}
          {officers.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{nameOf(o.user_id)}</p>
                <p className="text-xs text-muted-foreground">
                  {ROLES.find((r) => r.value === o.role)?.label || o.role}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={o.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}>
                  {o.is_active ? "Active" : "Revoked"}
                </Badge>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => void toggle(o)}>
                  <UserMinus className="h-4 w-4" /> {o.is_active ? "Revoke" : "Restore"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SafeguardingOfficers;
