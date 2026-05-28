/**
 * Owner-only access manager.
 *
 * Lets the Owner (amehjoey1@gmail.com) grant ANY user — or a group of users
 * in a single action — time-bounded access to:
 *   - restricted pages          → user_page_access
 *   - forms                     → user_form_assignments
 *   - projects                  → user_project_assignments
 *
 * The same dialog supports both single-user editing (granular per-row windows)
 * and bulk apply (multi-select users + multi-select items + one shared window).
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { RESTRICTED_PAGES } from "@/hooks/usePageAccess";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ShieldCheck, Loader2, Clock, Users, FileText, FolderKanban, Trash2 } from "lucide-react";

interface UserRow { user_id: string; first_name: string; last_name: string; email: string; }
interface FormRow { id: string; title: string; }
interface ProjectRow { id: string; name: string; }
interface Grant { id?: string; starts_at: string | null; expires_at: string | null; }

const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);
const isExpired = (g: Grant) => !!g.expires_at && new Date(g.expires_at).getTime() <= Date.now();

export default function OwnerAccessManager() {
  const { user, isOwner } = useAuth();
  const [open, setOpen] = useState(false);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [allForms, setAllForms] = useState<FormRow[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectRow[]>([]);

  const [userSearch, setUserSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Per (userId → resourceKey) grants currently in DB for visible users.
  // Keys: page:<page_id>, form:<form_id>, project:<project_id>
  type PerUserGrants = Map<string, Grant>;
  const [grants, setGrants] = useState<Map<string, PerUserGrants>>(new Map());

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Bulk window inputs
  const [bulkStarts, setBulkStarts] = useState("");
  const [bulkExpires, setBulkExpires] = useState("");

  // Load reference data when dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: ud }, { data: fd }, { data: pd }] = await Promise.all([
        supabase.from("profiles").select("user_id, first_name, last_name, email")
          .eq("approval_status", "approved").order("first_name"),
        supabase.from("forms").select("id, title").order("title"),
        supabase.from("projects").select("id, name").order("name"),
      ]);
      if (cancelled) return;
      setUsers((ud ?? []) as UserRow[]);
      setAllForms((fd ?? []) as FormRow[]);
      setAllProjects(((pd ?? []) as any[]).map((p) => ({ id: p.id, name: p.name })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Load grants for currently selected users.
  useEffect(() => {
    if (!open) return;
    const ids = Array.from(selectedUserIds);
    if (ids.length === 0) { setGrants(new Map()); return; }
    let cancelled = false;
    (async () => {
      const [pg, fa, pa] = await Promise.all([
        supabase.from("user_page_access")
          .select("id, user_id, page_id, starts_at, expires_at").in("user_id", ids),
        supabase.from("user_form_assignments")
          .select("id, user_id, form_id, starts_at, expires_at").in("user_id", ids),
        supabase.from("user_project_assignments")
          .select("id, user_id, project_id, starts_at, expires_at").in("user_id", ids),
      ]);
      if (cancelled) return;
      const out = new Map<string, PerUserGrants>();
      const put = (uid: string, key: string, g: Grant) => {
        if (!out.has(uid)) out.set(uid, new Map());
        out.get(uid)!.set(key, g);
      };
      (pg.data ?? []).forEach((r: any) =>
        put(r.user_id, `page:${r.page_id}`, { id: r.id, starts_at: r.starts_at, expires_at: r.expires_at }));
      (fa.data ?? []).forEach((r: any) =>
        put(r.user_id, `form:${r.form_id}`, { id: r.id, starts_at: r.starts_at, expires_at: r.expires_at }));
      (pa.data ?? []).forEach((r: any) =>
        put(r.user_id, `project:${r.project_id}`, { id: r.id, starts_at: r.starts_at, expires_at: r.expires_at }));
      setGrants(out);
    })();
    return () => { cancelled = true; };
  }, [open, selectedUserIds]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(q));
  }, [users, userSearch]);

  if (!isOwner) return null;

  const toggleUser = (id: string, checked: boolean) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };
  const toggleAllVisible = (checked: boolean) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      filteredUsers.forEach((u) => { if (checked) next.add(u.user_id); else next.delete(u.user_id); });
      return next;
    });
  };

  // Visible state of a resource across selected users: "all" | "some" | "none"
  const resourceState = (key: string): "all" | "some" | "none" => {
    const ids = Array.from(selectedUserIds);
    if (ids.length === 0) return "none";
    let granted = 0;
    ids.forEach((uid) => { if (grants.get(uid)?.has(key)) granted++; });
    if (granted === 0) return "none";
    if (granted === ids.length) return "all";
    return "some";
  };

  /** Apply a grant action to all currently selected users. */
  const applyResource = async (
    kind: "page" | "form" | "project",
    resourceId: string,
    enable: boolean,
  ) => {
    if (!user) return;
    const ids = Array.from(selectedUserIds);
    if (ids.length === 0) {
      toast({ title: "Select users first", description: "Pick one or more users from the list on the left." });
      return;
    }
    setSaving(true);
    try {
      const starts = fromLocalInput(bulkStarts);
      const expires = fromLocalInput(bulkExpires);

      if (kind === "page") {
        if (enable) {
          const rows = ids.map((uid) => ({
            user_id: uid, page_id: resourceId, granted_by: user.id, starts_at: starts, expires_at: expires,
          }));
          const { error } = await supabase
            .from("user_page_access")
            .upsert(rows, { onConflict: "user_id,page_id" });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("user_page_access").delete()
            .in("user_id", ids).eq("page_id", resourceId);
          if (error) throw error;
        }
      } else if (kind === "form") {
        if (enable) {
          const rows = ids.map((uid) => ({
            user_id: uid, form_id: resourceId, assigned_by: user.id, starts_at: starts, expires_at: expires,
          }));
          const { error } = await supabase
            .from("user_form_assignments")
            .upsert(rows, { onConflict: "user_id,form_id" });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("user_form_assignments").delete()
            .in("user_id", ids).eq("form_id", resourceId);
          if (error) throw error;
        }
      } else {
        if (enable) {
          const rows = ids.map((uid) => ({
            user_id: uid, project_id: resourceId, assigned_by: user.id, starts_at: starts, expires_at: expires,
          }));
          const { error } = await supabase
            .from("user_project_assignments")
            .upsert(rows, { onConflict: "user_id,project_id" });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("user_project_assignments").delete()
            .in("user_id", ids).eq("project_id", resourceId);
          if (error) throw error;
        }
      }

      // Refresh grants snapshot.
      await refreshGrants();
      toast({
        title: enable ? "Access granted" : "Access revoked",
        description: `${ids.length} user${ids.length === 1 ? "" : "s"} updated.`,
      });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? "Could not update access.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const refreshGrants = async () => {
    const ids = Array.from(selectedUserIds);
    if (ids.length === 0) { setGrants(new Map()); return; }
    const [pg, fa, pa] = await Promise.all([
      supabase.from("user_page_access")
        .select("id, user_id, page_id, starts_at, expires_at").in("user_id", ids),
      supabase.from("user_form_assignments")
        .select("id, user_id, form_id, starts_at, expires_at").in("user_id", ids),
      supabase.from("user_project_assignments")
        .select("id, user_id, project_id, starts_at, expires_at").in("user_id", ids),
    ]);
    const out = new Map<string, PerUserGrants>();
    const put = (uid: string, key: string, g: Grant) => {
      if (!out.has(uid)) out.set(uid, new Map());
      out.get(uid)!.set(key, g);
    };
    (pg.data ?? []).forEach((r: any) =>
      put(r.user_id, `page:${r.page_id}`, { id: r.id, starts_at: r.starts_at, expires_at: r.expires_at }));
    (fa.data ?? []).forEach((r: any) =>
      put(r.user_id, `form:${r.form_id}`, { id: r.id, starts_at: r.starts_at, expires_at: r.expires_at }));
    (pa.data ?? []).forEach((r: any) =>
      put(r.user_id, `project:${r.project_id}`, { id: r.id, starts_at: r.starts_at, expires_at: r.expires_at }));
    setGrants(out);
  };

  /** Re-apply the bulk window to every grant currently held by selected users. */
  const applyBulkWindowToExisting = async () => {
    const ids = Array.from(selectedUserIds);
    if (ids.length === 0) {
      toast({ title: "Select users first" });
      return;
    }
    setSaving(true);
    try {
      const starts = fromLocalInput(bulkStarts);
      const expires = fromLocalInput(bulkExpires);
      await Promise.all([
        supabase.from("user_page_access").update({ starts_at: starts, expires_at: expires }).in("user_id", ids),
        supabase.from("user_form_assignments").update({ starts_at: starts, expires_at: expires }).in("user_id", ids),
        supabase.from("user_project_assignments").update({ starts_at: starts, expires_at: expires }).in("user_id", ids),
      ]);
      await refreshGrants();
      toast({ title: "Timeframe applied", description: `Updated all grants for ${ids.length} user${ids.length === 1 ? "" : "s"}.` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? "Could not apply timeframe.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const ResourceRow = ({
    icon: Icon, label, kind, id, sub,
  }: { icon: any; label: string; kind: "page" | "form" | "project"; id: string; sub?: string }) => {
    const state = resourceState(`${kind}:${id}`);
    const checked = state === "all" ? true : state === "some" ? "indeterminate" as const : false;

    // Show window summary for single-user selection.
    let summary: React.ReactNode = null;
    if (selectedUserIds.size === 1) {
      const uid = Array.from(selectedUserIds)[0];
      const g = grants.get(uid)?.get(`${kind}:${id}`);
      if (g) {
        const expired = isExpired(g);
        summary = (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {g.starts_at ? new Date(g.starts_at).toLocaleString() : "Now"}
            {" → "}
            {g.expires_at ? new Date(g.expires_at).toLocaleString() : "No expiry"}
            {expired && <Badge variant="destructive" className="ml-1 text-[10px] px-1 py-0">Expired</Badge>}
          </span>
        );
      }
    } else if (state === "some") {
      summary = <Badge variant="outline" className="text-[10px]">Partial</Badge>;
    }

    return (
      <div className="flex items-center justify-between border rounded-md px-3 py-2 hover:bg-muted/40">
        <div className="flex items-center gap-3 min-w-0">
          <Checkbox
            checked={checked}
            onCheckedChange={(c) => applyResource(kind, id, c === true)}
            disabled={saving || selectedUserIds.size === 0}
          />
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{label}</div>
            {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
            {summary}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ShieldCheck className="h-4 w-4" />
          Owner: Access Manager
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Owner Access Manager
          </DialogTitle>
          <DialogDescription>
            Pick one user, or many, then grant access to pages, forms or projects.
            The timeframe at the top applies to every change you make.
            Leave start/end blank for permanent access.
          </DialogDescription>
        </DialogHeader>

        {/* Bulk timeframe bar */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end border rounded-lg p-3 bg-muted/30">
          <div>
            <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Access starts</Label>
            <Input type="datetime-local" value={bulkStarts} onChange={(e) => setBulkStarts(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Access expires</Label>
            <Input type="datetime-local" value={bulkExpires} onChange={(e) => setBulkExpires(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={applyBulkWindowToExisting} disabled={saving || selectedUserIds.size === 0}>
            Apply timeframe to existing grants
          </Button>
        </div>

        <div className="grid grid-cols-12 gap-4 flex-1 min-h-0 mt-3">
          {/* User picker */}
          <div className="col-span-4 border rounded-lg flex flex-col min-h-0">
            <div className="p-2 border-b space-y-2">
              <Input placeholder="Search users…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={filteredUsers.length > 0 && filteredUsers.every((u) => selectedUserIds.has(u.user_id))}
                    onCheckedChange={(c) => toggleAllVisible(c === true)}
                  />
                  <span>Select all ({filteredUsers.length})</span>
                </label>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" /> {selectedUserIds.size} selected
                </span>
              </div>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-1">
                {filteredUsers.map((u) => (
                  <label
                    key={u.user_id}
                    className="flex items-start gap-2 w-full text-left p-2 rounded text-sm hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedUserIds.has(u.user_id)}
                      onCheckedChange={(c) => toggleUser(u.user_id, c === true)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{u.first_name} {u.last_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    </div>
                  </label>
                ))}
                {filteredUsers.length === 0 && <p className="text-xs text-muted-foreground p-3">No users.</p>}
              </div>
            </ScrollArea>
          </div>

          {/* Resource editor */}
          <div className="col-span-8 border rounded-lg flex flex-col min-h-0">
            {loading ? (
              <div className="flex-1 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <Tabs defaultValue="pages" className="flex-1 flex flex-col min-h-0">
                <TabsList className="m-2">
                  <TabsTrigger value="pages">Pages</TabsTrigger>
                  <TabsTrigger value="forms">Forms ({allForms.length})</TabsTrigger>
                  <TabsTrigger value="projects">Projects ({allProjects.length})</TabsTrigger>
                </TabsList>

                <ScrollArea className="flex-1 min-h-0">
                  <TabsContent value="pages" className="p-3 space-y-2">
                    {selectedUserIds.size === 0 && (
                      <p className="text-xs text-muted-foreground">Select one or more users to start granting page access.</p>
                    )}
                    {RESTRICTED_PAGES.map((p) => (
                      <ResourceRow key={p.id} icon={ShieldCheck} label={p.label} kind="page" id={p.id} sub={p.id} />
                    ))}
                  </TabsContent>

                  <TabsContent value="forms" className="p-3 space-y-2">
                    {allForms.length === 0 && <p className="text-xs text-muted-foreground">No forms exist yet.</p>}
                    {allForms.map((f) => (
                      <ResourceRow key={f.id} icon={FileText} label={f.title || "Untitled form"} kind="form" id={f.id} />
                    ))}
                  </TabsContent>

                  <TabsContent value="projects" className="p-3 space-y-2">
                    {allProjects.length === 0 && <p className="text-xs text-muted-foreground">No projects exist yet.</p>}
                    {allProjects.map((p) => (
                      <ResourceRow key={p.id} icon={FolderKanban} label={p.name || "Untitled project"} kind="project" id={p.id} />
                    ))}
                  </TabsContent>
                </ScrollArea>

                <div className="border-t p-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Changes save instantly. Unchecking a resource revokes it for all selected users.</span>
                  {saving && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>}
                </div>
              </Tabs>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
