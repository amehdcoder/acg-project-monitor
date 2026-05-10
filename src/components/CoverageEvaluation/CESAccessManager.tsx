import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ShieldCheck, MapPin, ClipboardList, UserCheck, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const ROLE_DEFS = [
  { key: "community_locator", label: "Locator", icon: MapPin, hint: "Locate & fence communities (Step 1)" },
  { key: "household_surveyor", label: "Surveyor", icon: ClipboardList, hint: "Sample & visit households (Steps 2–3)" },
  { key: "peer_validator", label: "Validator", icon: ShieldCheck, hint: "Peer-validate surveys" },
] as const;

type RoleKey = typeof ROLE_DEFS[number]["key"];

interface Project { id: string; name: string }
interface UserRow {
  user_id: string; email: string; first_name: string; last_name: string;
  designation: string | null;
}

function suggestRoles(designation: string | null): RoleKey[] {
  const d = (designation || "").toLowerCase();
  if (!d) return [];
  if (/(super|owner)/.test(d)) return ["community_locator", "household_surveyor", "peer_validator"];
  if (/(supervisor|coordinator|lead|focal)/.test(d)) return ["community_locator", "peer_validator"];
  if (/(m&e|monitoring|evaluation|officer|qc|quality)/.test(d)) return ["peer_validator"];
  if (/(enumerator|cdd|drug distributor|surveyor|interviewer|community drug)/.test(d)) return ["household_surveyor"];
  return [];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultProjectId?: string;
}

export default function CESAccessManager({ open, onOpenChange, defaultProjectId }: Props) {
  const { isAdmin, isOwner } = useAuth();
  const allowed = isAdmin || isOwner;
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? "");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Set<RoleKey>>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !allowed) return;
    (async () => {
      setLoading(true);
      const [{ data: proj }, { data: profs }] = await Promise.all([
        supabase.from("projects").select("id, name").order("name"),
        supabase.from("profiles")
          .select("user_id, email, first_name, last_name, designation")
          .eq("approval_status", "approved")
          .order("first_name"),
      ]);
      setProjects((proj as any) ?? []);
      setUsers((profs as any) ?? []);
      if (!projectId && proj && (proj as any[]).length) setProjectId((proj as any[])[0].id);
      setLoading(false);
    })();
  }, [open, allowed]);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const { data } = await supabase
        .from("ces_role_assignments" as any)
        .select("user_id, role")
        .eq("project_id", projectId);
      const map: Record<string, Set<RoleKey>> = {};
      ((data as any) ?? []).forEach((r: any) => {
        if (!map[r.user_id]) map[r.user_id] = new Set();
        map[r.user_id].add(r.role);
      });
      setAssignments(map);
    })();
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      `${u.first_name} ${u.last_name} ${u.email} ${u.designation || ""}`.toLowerCase().includes(q),
    );
  }, [users, search]);

  const toggleRole = async (userId: string, role: RoleKey, granted: boolean) => {
    if (!projectId) return;
    setSavingId(userId);
    if (granted) {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("ces_role_assignments" as any).insert({
        user_id: userId, project_id: projectId, role, granted_by: u.user?.id,
      });
      if (error) { toast({ title: "Grant failed", description: error.message, variant: "destructive" }); setSavingId(null); return; }
    } else {
      const { error } = await supabase.from("ces_role_assignments" as any)
        .delete().eq("user_id", userId).eq("project_id", projectId).eq("role", role);
      if (error) { toast({ title: "Revoke failed", description: error.message, variant: "destructive" }); setSavingId(null); return; }
    }
    setAssignments(prev => {
      const next = { ...prev };
      const set = new Set(next[userId] ?? []);
      if (granted) set.add(role); else set.delete(role);
      next[userId] = set;
      return next;
    });
    setSavingId(null);
  };

  const autoSuggest = async (u: UserRow) => {
    const suggested = suggestRoles(u.designation);
    if (suggested.length === 0) {
      toast({ title: "No suggestion", description: "Designation does not map to a CES role." });
      return;
    }
    for (const role of suggested) {
      if (!assignments[u.user_id]?.has(role)) await toggleRole(u.user_id, role, true);
    }
  };

  if (!allowed) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" /> CES Access Manager
          </DialogTitle>
          <DialogDescription>
            Grant per-project Locator, Surveyor, and Validator roles. Designation captured at signup is shown as a hint only.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 items-center">
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, designation" className="pl-8 h-9" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto rounded-md border border-border">
          {loading ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur z-10">
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Designation</th>
                  {ROLE_DEFS.map(r => <th key={r.key} className="px-2 py-2 text-center">{r.label}</th>)}
                  <th className="px-2 py-2 text-center">Auto</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const set = assignments[u.user_id] ?? new Set<RoleKey>();
                  return (
                    <tr key={u.user_id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="font-medium">{u.first_name} {u.last_name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="px-3 py-2">
                        {u.designation ? <Badge variant="outline" className="text-[10px]">{u.designation}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      {ROLE_DEFS.map(r => {
                        const checked = set.has(r.key);
                        return (
                          <td key={r.key} className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={savingId === u.user_id}
                              onChange={(e) => toggleRole(u.user_id, r.key, e.target.checked)}
                              className="h-4 w-4 cursor-pointer"
                              title={r.hint}
                            />
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center">
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => autoSuggest(u)} disabled={savingId === u.user_id}>
                          <Wand2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">No users match.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
