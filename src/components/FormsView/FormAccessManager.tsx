/**
 * Per-form access manager.
 *
 * Launched from a form's action menu in the "Open your form" explorer.
 *
 * Permissions (enforced here in UI; the user_form_assignments RLS policy already
 * restricts writes to admins via is_admin()):
 *   - canRemove (Systems Admin, Super Admin, Owner, Co-owner):
 *       revoke a form for one user, several users, or everyone.
 *   - canGrant (Owner, Co-owner only):
 *       grant a form to one user, several users, all users, or every member of a
 *       chosen project — with an optional time window.
 *
 * Access is stored in user_form_assignments (direct per-user grants). Removing a
 * direct grant hides the form from that user in FormsView (regular/systems-admin
 * users only see forms they are directly assigned to, except the auto-granted MDA
 * checklist surfaced via project membership).
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  ShieldCheck, Loader2, Clock, Users, UserMinus, UserPlus, FolderKanban,
} from "lucide-react";

interface UserRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}
interface ProjectRow { id: string; name: string | null }

interface Props {
  form: { id: string; name?: string | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Owner & Co-owner — may grant access. */
  canGrant: boolean;
  /** Systems Admin, Super Admin, Owner, Co-owner — may remove access. */
  canRemove: boolean;
  /** Current user's id (assigned_by stamp). */
  currentUserId?: string | null;
}

const safeText = (value: unknown, fallback = "—") => {
  if (typeof value === "string") return value.trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
};
const displayName = (u: Partial<UserRow>) =>
  [u.first_name, u.last_name].map((p) => safeText(p, "")).filter(Boolean).join(" ").trim() ||
  safeText(u.email, "Unknown user");
const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);

export default function FormAccessManager({
  form, open, onOpenChange, canGrant, canRemove, currentUserId,
}: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [starts, setStarts] = useState("");
  const [expires, setExpires] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const formId = form?.id ?? null;

  useEffect(() => {
    if (!open || !formId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setSelected(new Set());
      const [{ data: ud }, { data: pd }, { data: fa }] = await Promise.all([
        supabase.from("profiles")
          .select("user_id, first_name, last_name, email")
          .eq("approval_status", "approved")
          .order("first_name"),
        supabase.from("projects").select("id, name").order("name"),
        supabase.from("user_form_assignments").select("user_id").eq("form_id", formId),
      ]);
      if (cancelled) return;
      setUsers((ud ?? []) as UserRow[]);
      setProjects((pd ?? []) as ProjectRow[]);
      setAssigned(new Set(((fa ?? []) as any[]).map((r) => r.user_id)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, formId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      `${displayName(u)} ${safeText(u.email, "")}`.toLowerCase().includes(q));
  }, [users, search]);

  const assignedCount = assigned.size;

  const refreshAssigned = async () => {
    if (!formId) return;
    const { data } = await supabase
      .from("user_form_assignments").select("user_id").eq("form_id", formId);
    setAssigned(new Set(((data ?? []) as any[]).map((r) => r.user_id)));
  };

  const grant = async (ids: string[]) => {
    if (!formId || !canGrant || ids.length === 0) return;
    setSaving(true);
    try {
      const rows = ids.map((uid) => ({
        user_id: uid,
        form_id: formId,
        assigned_by: currentUserId ?? uid,
        starts_at: fromLocalInput(starts),
        expires_at: fromLocalInput(expires),
      }));
      const { error } = await supabase
        .from("user_form_assignments")
        .upsert(rows, { onConflict: "user_id,form_id" });
      if (error) throw error;
      await refreshAssigned();
      toast({ title: "Access granted", description: `${ids.length} user${ids.length === 1 ? "" : "s"} can now open this form.` });
    } catch (e: any) {
      toast({ title: "Grant failed", description: e?.message ?? "Could not grant access.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (ids: string[]) => {
    if (!formId || !canRemove || ids.length === 0) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_form_assignments")
        .delete()
        .eq("form_id", formId)
        .in("user_id", ids);
      if (error) throw error;
      await refreshAssigned();
      toast({ title: "Access removed", description: `${ids.length} user${ids.length === 1 ? "" : "s"} can no longer open this form.` });
    } catch (e: any) {
      toast({ title: "Remove failed", description: e?.message ?? "Could not remove access.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const grantToProjectMembers = async () => {
    if (!projectId || !canGrant) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("user_project_assignments")
        .select("user_id")
        .eq("project_id", projectId);
      if (error) throw error;
      const ids = [...new Set(((data ?? []) as any[]).map((r) => r.user_id))];
      if (ids.length === 0) {
        toast({ title: "No members", description: "This project has no assigned members." });
        return;
      }
      await grant(ids);
    } catch (e: any) {
      toast({ title: "Grant failed", description: e?.message ?? "Could not grant access.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleUser = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const selectedIds = Array.from(selected);
  const selectedAssigned = selectedIds.filter((id) => assigned.has(id));
  const selectedUnassigned = selectedIds.filter((id) => !assigned.has(id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Manage form access
          </DialogTitle>
          <DialogDescription className="truncate">
            {form?.name ? <span className="font-medium">{form.name}</span> : "Form"}
            {" — "}
            {canGrant
              ? "Grant or remove access for a user, several users, all users, or every member of a project."
              : "Remove access for a user, several users, or all users."}
          </DialogDescription>
        </DialogHeader>

        {canGrant && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Access starts (optional)</Label>
                <Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Access expires (optional)</Label>
                <Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
              <div>
                <Label className="text-xs flex items-center gap-1"><FolderKanban className="h-3 w-3" /> Grant to all members of a project</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">Select a project…</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{safeText(p.name)}</option>)}
                </select>
              </div>
              <Button onClick={grantToProjectMembers} disabled={saving || !projectId} className="gap-1">
                <UserPlus className="h-4 w-4" /> Grant to project
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm" variant="secondary" className="gap-1"
                disabled={saving || filtered.length === 0}
                onClick={() => grant(filtered.map((u) => u.user_id))}
              >
                <UserPlus className="h-4 w-4" /> Grant to all visible ({filtered.length})
              </Button>
              <Button
                size="sm" variant="secondary" className="gap-1"
                disabled={saving || selectedUnassigned.length === 0}
                onClick={() => grant(selectedUnassigned)}
              >
                <UserPlus className="h-4 w-4" /> Grant to selected ({selectedUnassigned.length})
              </Button>
            </div>
          </div>
        )}

        {canRemove && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm" variant="outline" className="gap-1 text-destructive"
              disabled={saving || selectedAssigned.length === 0}
              onClick={() => revoke(selectedAssigned)}
            >
              <UserMinus className="h-4 w-4" /> Remove selected ({selectedAssigned.length})
            </Button>
            <Button
              size="sm" variant="outline" className="gap-1 text-destructive"
              disabled={saving || assignedCount === 0}
              onClick={() => revoke(Array.from(assigned))}
            >
              <UserMinus className="h-4 w-4" /> Remove all access ({assignedCount})
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <Input
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
            <Users className="h-3 w-3" /> {assignedCount} with access
          </span>
        </div>

        <div className="flex-1 min-h-0 border rounded-lg">
          {loading ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <ScrollArea className="h-[40vh]">
              <div className="p-1">
                {filtered.map((u) => {
                  const hasAccess = assigned.has(u.user_id);
                  return (
                    <div
                      key={u.user_id}
                      className="flex items-center gap-3 p-2 rounded hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selected.has(u.user_id)}
                        onCheckedChange={(c) => toggleUser(u.user_id, c === true)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{displayName(u)}</div>
                        <div className="text-xs text-muted-foreground truncate">{safeText(u.email)}</div>
                      </div>
                      {hasAccess ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px] shrink-0">Has access</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] shrink-0">No access</Badge>
                      )}
                      {hasAccess && canRemove && (
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2 text-destructive"
                          disabled={saving}
                          onClick={() => revoke([u.user_id])}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {!hasAccess && canGrant && (
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2 text-primary"
                          disabled={saving}
                          onClick={() => grant([u.user_id])}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">No users match.</div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
