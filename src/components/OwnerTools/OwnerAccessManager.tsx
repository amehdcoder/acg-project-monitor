/**
 * Owner-only access manager.
 *
 * Lets amehjoey1@gmail.com (and any other Owner) grant ANY user time-bounded
 * access to restricted pages, plus set start/expiry windows on existing
 * form and project assignments.
 *
 * Pages: writes to `user_page_access`.
 * Forms: updates `user_form_assignments.starts_at / expires_at`.
 * Projects: updates `user_project_assignments.starts_at / expires_at`.
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { RESTRICTED_PAGES } from "@/hooks/usePageAccess";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ShieldCheck, Loader2, Clock } from "lucide-react";

interface UserRow { user_id: string; first_name: string; last_name: string; email: string; }

interface PageGrant { page_id: string; starts_at: string | null; expires_at: string | null; }
interface AssignRow { id: string; name: string; starts_at: string | null; expires_at: string | null; }

const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);

export default function OwnerAccessManager() {
  const { user, isOwner } = useAuth();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [pageGrants, setPageGrants] = useState<Record<string, PageGrant>>({});
  const [forms, setForms] = useState<AssignRow[]>([]);
  const [projects, setProjects] = useState<AssignRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load all users on open
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .order("first_name");
      setUsers((data ?? []) as UserRow[]);
    })();
  }, [open]);

  // Load selected user's access
  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    (async () => {
      const [pg, fa, pa] = await Promise.all([
        supabase.from("user_page_access").select("page_id, starts_at, expires_at").eq("user_id", selected.user_id),
        supabase
          .from("user_form_assignments")
          .select("id, starts_at, expires_at, forms(id, title)")
          .eq("user_id", selected.user_id),
        supabase
          .from("user_project_assignments")
          .select("id, starts_at, expires_at, projects(id, name)")
          .eq("user_id", selected.user_id),
      ]);
      const map: Record<string, PageGrant> = {};
      (pg.data ?? []).forEach((g: any) => { map[g.page_id] = g; });
      setPageGrants(map);
      setForms(((fa.data ?? []) as any[]).map((r) => ({
        id: r.id, name: r.forms?.title ?? "Untitled form",
        starts_at: r.starts_at, expires_at: r.expires_at,
      })));
      setProjects(((pa.data ?? []) as any[]).map((r) => ({
        id: r.id, name: r.projects?.name ?? "Untitled project",
        starts_at: r.starts_at, expires_at: r.expires_at,
      })));
      setLoading(false);
    })();
  }, [selected]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(q),
    );
  }, [users, search]);

  if (!isOwner) return null;

  const togglePage = (pageId: string) => {
    setPageGrants((prev) => {
      const next = { ...prev };
      if (next[pageId]) delete next[pageId];
      else next[pageId] = { page_id: pageId, starts_at: null, expires_at: null };
      return next;
    });
  };

  const setPageWindow = (pageId: string, field: "starts_at" | "expires_at", v: string) => {
    setPageGrants((prev) => ({
      ...prev,
      [pageId]: { ...(prev[pageId] ?? { page_id: pageId, starts_at: null, expires_at: null }), [field]: fromLocalInput(v) },
    }));
  };

  const updateAssignRow = (
    setter: typeof setForms,
    id: string,
    field: "starts_at" | "expires_at",
    v: string,
  ) => {
    setter((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: fromLocalInput(v) } : r)));
  };

  const save = async () => {
    if (!selected || !user) return;
    setSaving(true);
    try {
      // Diff: delete all current grants for this user, then re-insert
      await supabase.from("user_page_access").delete().eq("user_id", selected.user_id);
      const inserts = Object.values(pageGrants).map((g) => ({
        user_id: selected.user_id,
        page_id: g.page_id,
        granted_by: user.id,
        starts_at: g.starts_at,
        expires_at: g.expires_at,
      }));
      if (inserts.length > 0) {
        const { error } = await supabase.from("user_page_access").insert(inserts);
        if (error) throw error;
      }

      // Save assignment windows
      await Promise.all([
        ...forms.map((f) =>
          supabase
            .from("user_form_assignments")
            .update({ starts_at: f.starts_at, expires_at: f.expires_at })
            .eq("id", f.id),
        ),
        ...projects.map((p) =>
          supabase
            .from("user_project_assignments")
            .update({ starts_at: p.starts_at, expires_at: p.expires_at })
            .eq("id", p.id),
        ),
      ]);

      toast({ title: "Access saved", description: `Updated access for ${selected.first_name} ${selected.last_name}.` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? "Could not save access.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ShieldCheck className="h-4 w-4" />
          Owner: Access Manager
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Owner Access Manager</DialogTitle>
          <DialogDescription>
            Define which pages, forms and projects each user can see — and for how long.
            Leave start / end empty for permanent access.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
          {/* User list */}
          <div className="col-span-4 border rounded-lg flex flex-col min-h-0">
            <div className="p-2 border-b">
              <Input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-1">
                {filteredUsers.map((u) => (
                  <button
                    key={u.user_id}
                    onClick={() => setSelected(u)}
                    className={`w-full text-left p-2 rounded text-sm hover:bg-muted ${selected?.user_id === u.user_id ? "bg-muted" : ""}`}
                  >
                    <div className="font-medium">{u.first_name} {u.last_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  </button>
                ))}
                {filteredUsers.length === 0 && <p className="text-xs text-muted-foreground p-3">No users.</p>}
              </div>
            </ScrollArea>
          </div>

          {/* Editor */}
          <div className="col-span-8 border rounded-lg flex flex-col min-h-0">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Select a user to manage their access.
              </div>
            ) : loading ? (
              <div className="flex-1 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <Tabs defaultValue="pages" className="flex-1 flex flex-col min-h-0">
                <TabsList className="m-2">
                  <TabsTrigger value="pages">Pages</TabsTrigger>
                  <TabsTrigger value="forms">Forms ({forms.length})</TabsTrigger>
                  <TabsTrigger value="projects">Projects ({projects.length})</TabsTrigger>
                </TabsList>

                <ScrollArea className="flex-1 min-h-0">
                  <TabsContent value="pages" className="p-3 space-y-2">
                    {RESTRICTED_PAGES.map((p) => {
                      const grant = pageGrants[p.id];
                      const checked = !!grant;
                      return (
                        <div key={p.id} className="border rounded p-3 space-y-2">
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox checked={checked} onCheckedChange={() => togglePage(p.id)} />
                            <span className="font-medium">{p.label}</span>
                          </label>
                          {checked && (
                            <div className="grid grid-cols-2 gap-2 pl-6">
                              <div>
                                <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Starts</Label>
                                <Input
                                  type="datetime-local"
                                  value={toLocalInput(grant.starts_at)}
                                  onChange={(e) => setPageWindow(p.id, "starts_at", e.target.value)}
                                />
                              </div>
                              <div>
                                <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Expires</Label>
                                <Input
                                  type="datetime-local"
                                  value={toLocalInput(grant.expires_at)}
                                  onChange={(e) => setPageWindow(p.id, "expires_at", e.target.value)}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </TabsContent>

                  <TabsContent value="forms" className="p-3 space-y-2">
                    {forms.length === 0 && <p className="text-xs text-muted-foreground">No form assignments. Assign forms first in Users → assignments.</p>}
                    {forms.map((f) => (
                      <div key={f.id} className="border rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{f.name}</span>
                          {f.expires_at && new Date(f.expires_at) < new Date() && <Badge variant="destructive">Expired</Badge>}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Starts</Label>
                            <Input type="datetime-local" value={toLocalInput(f.starts_at)} onChange={(e) => updateAssignRow(setForms, f.id, "starts_at", e.target.value)} />
                          </div>
                          <div>
                            <Label className="text-xs">Expires</Label>
                            <Input type="datetime-local" value={toLocalInput(f.expires_at)} onChange={(e) => updateAssignRow(setForms, f.id, "expires_at", e.target.value)} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="projects" className="p-3 space-y-2">
                    {projects.length === 0 && <p className="text-xs text-muted-foreground">No project assignments.</p>}
                    {projects.map((p) => (
                      <div key={p.id} className="border rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{p.name}</span>
                          {p.expires_at && new Date(p.expires_at) < new Date() && <Badge variant="destructive">Expired</Badge>}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Starts</Label>
                            <Input type="datetime-local" value={toLocalInput(p.starts_at)} onChange={(e) => updateAssignRow(setProjects, p.id, "starts_at", e.target.value)} />
                          </div>
                          <div>
                            <Label className="text-xs">Expires</Label>
                            <Input type="datetime-local" value={toLocalInput(p.expires_at)} onChange={(e) => updateAssignRow(setProjects, p.id, "expires_at", e.target.value)} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </TabsContent>
                </ScrollArea>

                <div className="border-t p-3 flex justify-end">
                  <Button onClick={save} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Save access for {selected.first_name}
                  </Button>
                </div>
              </Tabs>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
