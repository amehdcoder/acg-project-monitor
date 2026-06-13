/**
 * Owner / Co-owner "Roles & Access" control center.
 *
 * One dedicated panel where the Owner (and Co-owners, with limits) can:
 *   - Co-owners      → grant/revoke Co-owner status (OWNER ONLY)
 *   - Standard Forms → restrict non-admin users from seeing the Standard
 *                      forms folder (Owner or Co-owner)
 *   - Systems Admin Pages → choose which restricted pages each Systems Admin
 *                      can see (persistent admin_page_access; Owner or Co-owner)
 *
 * Co-owners get almost the same rights as the Owner but no backend access.
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { RESTRICTED_PAGES } from "@/hooks/usePageAccess";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Crown, Loader2, ShieldCheck, FolderLock, LayoutGrid } from "lucide-react";

interface UserRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  designation: string | null;
  is_co_owner: boolean | null;
  is_owner: boolean | null;
  role?: string | null;
}

const displayName = (u: UserRow) =>
  [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || "Unknown user";

export default function OwnerRolesAccessManager() {
  const { user, isOwner, isCoOwner, isOwnerLevel } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [restricted, setRestricted] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Systems Admin Page access
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [adminPages, setAdminPages] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    const [{ data: profs }, { data: roles }, { data: restr }] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email, designation, is_co_owner, is_owner")
        .eq("approval_status", "approved")
        .order("first_name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("standard_form_user_restrictions" as any).select("user_id"),
    ]);
    const roleMap = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));
    setUsers(
      ((profs ?? []) as any[]).map((p) => ({ ...p, role: roleMap.get(p.user_id) ?? "user" })),
    );
    setRestricted(new Set(((restr ?? []) as any[]).map((r) => r.user_id)));
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => displayName(u).toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q));
  }, [users, search]);

  const systemsAdmins = useMemo(
    () => users.filter((u) => u.role === "systems_admin" && !u.is_owner),
    [users],
  );

  const toggleCoOwner = async (u: UserRow, next: boolean) => {
    if (!isOwner) {
      toast({ title: "Owner only", description: "Only the Owner can assign Co-owners.", variant: "destructive" });
      return;
    }
    setBusy(u.user_id);
    const { error } = await supabase.from("profiles").update({ is_co_owner: next } as any).eq("user_id", u.user_id);
    setBusy(null);
    if (error) {
      toast({ title: "Could not update", description: error.message, variant: "destructive" });
      return;
    }
    setUsers((prev) => prev.map((x) => (x.user_id === u.user_id ? { ...x, is_co_owner: next } : x)));
    toast({ title: next ? "Co-owner granted" : "Co-owner revoked", description: displayName(u) });
  };

  const toggleStandardRestriction = async (u: UserRow, next: boolean) => {
    setBusy(u.user_id);
    if (next) {
      const { error } = await supabase
        .from("standard_form_user_restrictions" as any)
        .insert({ user_id: u.user_id, restricted_by: user?.id } as any);
      setBusy(null);
      if (error) {
        toast({ title: "Could not restrict", description: error.message, variant: "destructive" });
        return;
      }
      setRestricted((s) => new Set(s).add(u.user_id));
    } else {
      const { error } = await supabase
        .from("standard_form_user_restrictions" as any)
        .delete()
        .eq("user_id", u.user_id);
      setBusy(null);
      if (error) {
        toast({ title: "Could not unrestrict", description: error.message, variant: "destructive" });
        return;
      }
      setRestricted((s) => { const n = new Set(s); n.delete(u.user_id); return n; });
    }
    toast({ title: next ? "Standard forms hidden" : "Standard forms restored", description: displayName(u) });
  };

  const selectAdmin = async (id: string) => {
    setSelectedAdminId(id);
    const { data } = await supabase.from("admin_page_access").select("page_id").eq("user_id", id);
    setAdminPages(new Set(((data ?? []) as any[]).map((r) => r.page_id)));
  };

  const toggleAdminPage = async (pageId: string, next: boolean) => {
    if (!selectedAdminId) return;
    setBusy(pageId);
    if (next) {
      const { error } = await supabase
        .from("admin_page_access")
        .insert({ user_id: selectedAdminId, page_id: pageId, granted_by: user?.id } as any);
      setBusy(null);
      if (error) { toast({ title: "Could not grant", description: error.message, variant: "destructive" }); return; }
      setAdminPages((s) => new Set(s).add(pageId));
    } else {
      const { error } = await supabase
        .from("admin_page_access")
        .delete()
        .eq("user_id", selectedAdminId)
        .eq("page_id", pageId);
      setBusy(null);
      if (error) { toast({ title: "Could not revoke", description: error.message, variant: "destructive" }); return; }
      setAdminPages((s) => { const n = new Set(s); n.delete(pageId); return n; });
    }
  };

  if (!isOwnerLevel) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Crown className="h-4 w-4 text-amber-500" />
          Roles &amp; Access Control
        </CardTitle>
        <CardDescription>
          Manage Co-owners, Standard-forms visibility, and which pages each Systems Admin can see.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <ShieldCheck className="h-4 w-4 mr-2" />
              Open Roles &amp; Access
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-500" /> Roles &amp; Access Control
              </DialogTitle>
              <DialogDescription>
                {isCoOwner
                  ? "You are a Co-owner. You can restrict Standard forms and manage Systems Admin pages."
                  : "Owner controls for Co-owners, Standard forms, and Systems Admin pages."}
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue={isOwner ? "coowners" : "standard"} className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="coowners" disabled={!isOwner}>
                  <Crown className="h-3.5 w-3.5 mr-1" /> Co-owners
                </TabsTrigger>
                <TabsTrigger value="standard">
                  <FolderLock className="h-3.5 w-3.5 mr-1" /> Standard Forms
                </TabsTrigger>
                <TabsTrigger value="pages">
                  <LayoutGrid className="h-3.5 w-3.5 mr-1" /> Systems Admin Pages
                </TabsTrigger>
              </TabsList>

              <div className="py-3">
                <Input
                  placeholder="Search users by name or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* CO-OWNERS */}
                  <TabsContent value="coowners" className="flex-1 overflow-hidden mt-0">
                    <ScrollArea className="h-[46vh] pr-3">
                      <div className="space-y-2">
                        {filtered.filter((u) => !u.is_owner).map((u) => (
                          <div key={u.user_id} className="flex items-center justify-between rounded-lg border p-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{displayName(u)}</p>
                              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {u.is_co_owner && <Badge className="bg-amber-500 hover:bg-amber-500">Co-owner</Badge>}
                              {busy === u.user_id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              ) : (
                                <Switch
                                  checked={!!u.is_co_owner}
                                  onCheckedChange={(v) => toggleCoOwner(u, v)}
                                />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  {/* STANDARD FORMS */}
                  <TabsContent value="standard" className="flex-1 overflow-hidden mt-0">
                    <p className="text-xs text-muted-foreground mb-2">
                      Restricted users (non-admins) will not see the Standard forms folder or the forms inside it.
                    </p>
                    <ScrollArea className="h-[42vh] pr-3">
                      <div className="space-y-2">
                        {filtered
                          .filter((u) => !u.is_owner && !u.is_co_owner && u.role !== "super_admin" && u.role !== "systems_admin")
                          .map((u) => (
                            <div key={u.user_id} className="flex items-center justify-between rounded-lg border p-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{displayName(u)}</p>
                                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                {restricted.has(u.user_id) && <Badge variant="destructive">Hidden</Badge>}
                                {busy === u.user_id ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : (
                                  <Switch
                                    checked={restricted.has(u.user_id)}
                                    onCheckedChange={(v) => toggleStandardRestriction(u, v)}
                                  />
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  {/* SYSTEMS ADMIN PAGES */}
                  <TabsContent value="pages" className="flex-1 overflow-hidden mt-0">
                    <div className="grid grid-cols-2 gap-3 h-[46vh]">
                      <ScrollArea className="border rounded-lg p-2">
                        <p className="text-xs font-medium text-muted-foreground px-1 pb-1">Systems Admins</p>
                        {systemsAdmins.length === 0 && (
                          <p className="text-xs text-muted-foreground p-2">No Systems Admins found.</p>
                        )}
                        {systemsAdmins
                          .filter((u) => !search.trim() || displayName(u).toLowerCase().includes(search.toLowerCase()))
                          .map((u) => (
                            <button
                              key={u.user_id}
                              onClick={() => selectAdmin(u.user_id)}
                              className={`w-full text-left rounded-md px-2 py-2 text-sm transition-colors ${
                                selectedAdminId === u.user_id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                              }`}
                            >
                              <span className="block truncate font-medium">{displayName(u)}</span>
                              <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                            </button>
                          ))}
                      </ScrollArea>

                      <ScrollArea className="border rounded-lg p-2">
                        <p className="text-xs font-medium text-muted-foreground px-1 pb-1">Pages</p>
                        {!selectedAdminId ? (
                          <p className="text-xs text-muted-foreground p-2">Select a Systems Admin to set their page access.</p>
                        ) : (
                          <div className="space-y-1">
                            {RESTRICTED_PAGES.map((pg) => (
                              <label
                                key={pg.id}
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer"
                              >
                                <Checkbox
                                  checked={adminPages.has(pg.id)}
                                  disabled={busy === pg.id}
                                  onCheckedChange={(v) => toggleAdminPage(pg.id, !!v)}
                                />
                                <span className="text-sm">{pg.label}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </TabsContent>
                </>
              )}
            </Tabs>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
