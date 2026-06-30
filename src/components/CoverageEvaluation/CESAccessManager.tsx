import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ShieldCheck, MapPin, ClipboardList, UserCheck, Wand2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const ROLE_DEFS = [
  { key: "community_locator", label: "Locator", icon: MapPin, hint: "Locate & fence communities (Step 1)" },
  { key: "household_surveyor", label: "Surveyor", icon: ClipboardList, hint: "Sample & visit households (Steps 2–3)" },
  { key: "peer_validator", label: "Validator", icon: ShieldCheck, hint: "Peer-validate surveys" },
] as const;

type RoleKey = typeof ROLE_DEFS[number]["key"];
const ALL_ROLES: RoleKey[] = ROLE_DEFS.map((r) => r.key);

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
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [assignments, setAssignments] = useState<Record<string, Set<RoleKey>>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  // Roles selected for bulk grant actions ("Grant to all" / per-row "Grant selected").
  const [bulkRoles, setBulkRoles] = useState<Set<RoleKey>>(new Set<RoleKey>(["community_locator", "household_surveyor"]));
  const [bulkBusy, setBulkBusy] = useState(false);

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
      setAllUsers((profs as any) ?? []);
      if (!projectId && proj && (proj as any[]).length) setProjectId((proj as any[])[0].id);
      setLoading(false);
    })();
  }, [open, allowed]);

  const loadAssignments = async () => {
    if (!projectId) return;
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
  };

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const { data: members } = await supabase
        .from("user_project_assignments")
        .select("user_id")
        .eq("project_id", projectId);
      setMemberIds(new Set(((members as any) ?? []).map((m: any) => m.user_id)));
      await loadAssignments();
    })();
  }, [projectId]);

  // Only members assigned to the selected project are shown (plus anyone who
  // already has a CES role on it). This keeps grants scoped to project members.
  const projectUsers = useMemo(() => {
    return allUsers.filter((u) => memberIds.has(u.user_id) || assignments[u.user_id]?.size);
  }, [allUsers, memberIds, assignments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projectUsers;
    return projectUsers.filter(u =>
      `${u.first_name} ${u.last_name} ${u.email} ${u.designation || ""}`.toLowerCase().includes(q),
    );
  }, [projectUsers, search]);

  const toggleRole = async (userId: string, role: RoleKey, granted: boolean) => {
    if (!projectId) return;
    setSavingId(userId);
    if (granted) {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("ces_role_assignments" as any).insert({
        user_id: userId, project_id: projectId, role, granted_by: u.user?.id,
      });
      if (error && !/duplicate|unique/i.test(error.message)) { toast({ title: "Grant failed", description: error.message, variant: "destructive" }); setSavingId(null); return; }
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

  const toggleBulkRole = (role: RoleKey) =>
    setBulkRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role); else next.add(role);
      return next;
    });

  // Grant the selected bulk roles to a set of users via the server-side RPC.
  const grantBulk = async (userIds: string[]) => {
    if (!projectId) return;
    const roles = Array.from(bulkRoles);
    if (roles.length === 0) { toast({ title: "Pick at least one role", variant: "destructive" }); return; }
    if (userIds.length === 0) { toast({ title: "No members to grant", variant: "destructive" }); return; }
    setBulkBusy(true);
    const { data, error } = await supabase.rpc("bulk_grant_ces_roles" as any, {
      _project_id: projectId, _user_ids: userIds, _roles: roles,
    });
    setBulkBusy(false);
    if (error) { toast({ title: "Bulk grant failed", description: error.message, variant: "destructive" }); return; }
    await loadAssignments();
    toast({
      title: "Roles granted",
      description: `${data ?? 0} new assignment(s) to ${userIds.length} member(s).`,
    });
  };

  if (!allowed) return null;

  const roleLabels = ROLE_DEFS.filter((r) => bulkRoles.has(r.key)).map((r) => r.label).join(", ") || "none";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" /> CES Access Manager
          </DialogTitle>
          <DialogDescription>
            Grant Locator, Surveyor, and Validator roles to members of the selected project — individually or to everyone at once.
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

        {/* Bulk grant toolbar */}
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Bulk grant — pick roles, then apply to all listed members
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ROLE_DEFS.map((r) => {
              const on = bulkRoles.has(r.key);
              const Icon = r.icon;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => toggleBulkRole(r.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                  title={r.hint}
                >
                  <Icon className="h-3.5 w-3.5" /> {r.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setBulkRoles(new Set(ALL_ROLES))}
              className="text-xs underline text-muted-foreground hover:text-foreground"
            >
              Select all roles
            </button>
            <div className="flex-1" />
            <Button
              size="sm"
              disabled={bulkBusy || filtered.length === 0}
              onClick={() => grantBulk(filtered.map((u) => u.user_id))}
            >
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Users className="h-4 w-4 mr-1" />}
              Grant to all ({filtered.length})
            </Button>
          </div>
          <div className="text-[11px] text-muted-foreground">Selected: <span className="font-medium">{roleLabels}</span></div>
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
                  <th className="px-2 py-2 text-center">Grant</th>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          disabled={bulkBusy || bulkRoles.size === 0}
                          onClick={() => grantBulk([u.user_id])}
                          title={`Grant selected roles (${roleLabels})`}
                        >
                          <Users className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => autoSuggest(u)} disabled={savingId === u.user_id}>
                          <Wand2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">No project members match.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
