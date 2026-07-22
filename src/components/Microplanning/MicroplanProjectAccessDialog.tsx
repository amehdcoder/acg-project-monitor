/**
 * Super Admin dialog — grant an entire project's members access to the
 * Geo-enabled Microplanning Entry form, with optional per-member exclusion.
 *
 * Backed by:
 *   - microplan_project_grants   (per-project grant)
 *   - microplan_project_exclusions (individual opt-outs)
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, MapPin, Search, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";

interface Project { id: string; name: string; scope_states: string[] | null }
interface Member {
  user_id: string; first_name: string | null; last_name: string | null;
  email: string | null; designation: string | null;
}

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

export default function MicroplanProjectAccessDialog({ open, onOpenChange }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [grantedProjectIds, setGrantedProjectIds] = useState<Set<string>>(new Set());
  const [excludedUserIds, setExcludedUserIds] = useState<Set<string>>(new Set());
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Load projects + existing grants when opened
  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [projRes, grantRes] = await Promise.all([
          supabase.from("projects").select("id, name, scope_states").order("name"),
          supabase.from("microplan_project_grants" as any).select("project_id"),
        ]);
        if (!active) return;
        setProjects((projRes.data as any) || []);
        setGrantedProjectIds(new Set(((grantRes.data as any) || []).map((r: any) => r.project_id)));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open]);

  // Load members + exclusions when project changes
  useEffect(() => {
    if (!selectedProjectId) { setMembers([]); setExcludedUserIds(new Set()); return; }
    let active = true;
    (async () => {
      const [asgRes, exclRes] = await Promise.all([
        supabase.from("user_project_assignments").select("user_id").eq("project_id", selectedProjectId),
        supabase.from("microplan_project_exclusions" as any).select("user_id").eq("project_id", selectedProjectId),
      ]);
      if (!active) return;
      const userIds = ((asgRes.data as any) || []).map((r: any) => r.user_id);
      setExcludedUserIds(new Set(((exclRes.data as any) || []).map((r: any) => r.user_id)));
      if (userIds.length === 0) { setMembers([]); return; }
      const { data } = await supabase.from("profiles")
        .select("user_id, first_name, last_name, email, designation")
        .in("user_id", userIds).order("first_name");
      if (active) setMembers((data as any) || []);
    })();
    return () => { active = false; };
  }, [selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );
  const isGranted = selectedProjectId ? grantedProjectIds.has(selectedProjectId) : false;

  const filteredMembers = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return members;
    return members.filter((m) =>
      `${m.first_name ?? ""} ${m.last_name ?? ""} ${m.email ?? ""}`.toLowerCase().includes(s));
  }, [members, search]);

  const toggleGrant = async () => {
    if (!selectedProjectId) return;
    setBusy("grant");
    try {
      if (isGranted) {
        const { error } = await supabase.from("microplan_project_grants" as any)
          .delete().eq("project_id", selectedProjectId);
        if (error) throw error;
        setGrantedProjectIds((s) => { const n = new Set(s); n.delete(selectedProjectId); return n; });
        toast.success("Project access removed.");
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("microplan_project_grants" as any)
          .insert({ project_id: selectedProjectId, granted_by: u?.user?.id });
        if (error) throw error;
        setGrantedProjectIds((s) => new Set(s).add(selectedProjectId));
        toast.success("All members of this project now have access.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not update grant.");
    } finally { setBusy(null); }
  };

  const toggleExclusion = async (userId: string, exclude: boolean) => {
    if (!selectedProjectId) return;
    setBusy(userId);
    try {
      if (exclude) {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("microplan_project_exclusions" as any)
          .insert({ project_id: selectedProjectId, user_id: userId, excluded_by: u?.user?.id });
        if (error) throw error;
        setExcludedUserIds((s) => new Set(s).add(userId));
      } else {
        const { error } = await supabase.from("microplan_project_exclusions" as any)
          .delete().eq("project_id", selectedProjectId).eq("user_id", userId);
        if (error) throw error;
        setExcludedUserIds((s) => { const n = new Set(s); n.delete(userId); return n; });
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not update exclusion.");
    } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Microplanning form access
          </DialogTitle>
          <DialogDescription>
            Grant every member of a project access to the Geo-enabled Microplanning Entry form.
            Members can only submit data for the selected project and its locked state(s).
          </DialogDescription>
        </DialogHeader>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Project</label>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={selectedProjectId ?? ""}
            onChange={(e) => setSelectedProjectId(e.target.value || null)}
          >
            <option value="">Select a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {grantedProjectIds.has(p.id) ? "· ✓ granted" : ""}
              </option>
            ))}
          </select>
        </div>

        {selectedProject && (
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{selectedProject.name}</p>
              <p className="text-xs text-muted-foreground">
                Locked to state(s): {(selectedProject.scope_states || []).join(", ") || "— none —"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{isGranted ? "Granted" : "Not granted"}</span>
              <Switch checked={isGranted} onCheckedChange={toggleGrant} disabled={busy === "grant"} />
            </div>
          </div>
        )}

        {selectedProjectId && isGranted && (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search members…" value={search}
                onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <ScrollArea className="h-[46vh] pr-3">
              {loading ? (
                <div className="flex h-32 items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : filteredMembers.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No members in this project.</p>
              ) : (
                <div className="space-y-1.5">
                  {filteredMembers.map((m) => {
                    const excluded = excludedUserIds.has(m.user_id);
                    const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email || "Member";
                    return (
                      <div key={m.user_id}
                        className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 ${excluded ? "border-destructive/40 bg-destructive/5" : ""}`}>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {m.designation || "—"}{excluded ? " · Excluded" : ""}
                          </p>
                        </div>
                        <Button size="sm" variant={excluded ? "outline" : "ghost"}
                          disabled={busy === m.user_id}
                          className={excluded ? "" : "text-destructive"}
                          onClick={() => toggleExclusion(m.user_id, !excluded)}>
                          {busy === m.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> :
                            excluded ? (<><UserPlus className="mr-1 h-4 w-4" /> Re-include</>) :
                            (<><UserMinus className="mr-1 h-4 w-4" /> Exclude</>)}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </>
        )}

        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="gap-1">
            <MapPin className="h-3 w-3" /> Microplanning
          </Badge>
          {selectedProject
            ? (isGranted
              ? `${members.length - excludedUserIds.size} of ${members.length} members will see the form.`
              : "Grant this project to make the form appear under My Forms for its members.")
            : "Choose a project to manage."}
        </div>
      </DialogContent>
    </Dialog>
  );
}
