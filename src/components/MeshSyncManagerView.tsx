import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Bluetooth, Wifi, Plus, Trash2, Loader2, Search, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface RelayRow {
  id: string;
  user_id: string;
  enabled: boolean;
  notes: string | null;
  granted_by: string;
  created_at: string;
  profile?: { first_name: string; last_name: string; email: string } | null;
}

interface ProfileLite {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
}

const MeshSyncManagerView = () => {
  const { isAdmin } = useAuth();
  const [relays, setRelays] = useState<RelayRow[]>([]);
  const [allUsers, setAllUsers] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [{ data: relayData }, { data: userData }] = await Promise.all([
        supabase.from("mesh_sync_relays" as any).select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("user_id, first_name, last_name, email").eq("is_active", true).order("first_name"),
      ]);

      const relayRows = (relayData || []) as unknown as RelayRow[];
      const profileMap = new Map<string, ProfileLite>();
      (userData || []).forEach((p: any) => profileMap.set(p.user_id, p));

      setRelays(
        relayRows.map((r) => ({
          ...r,
          profile: profileMap.get(r.user_id) ?? null,
        }))
      );
      setAllUsers((userData || []) as ProfileLite[]);
    } catch (e: any) {
      toast({ title: "Failed to load mesh sync config", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) loadData();
  }, [isAdmin]);

  const addRelay = async (userId: string) => {
    setAdding(userId);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("mesh_sync_relays" as any).insert({
        user_id: userId,
        enabled: true,
        granted_by: auth.user?.id,
      });
      if (error) throw error;
      toast({ title: "Relay user added", description: "They can now forward submissions for offline peers." });
      await loadData();
    } catch (e: any) {
      toast({ title: "Failed to add relay", description: e.message, variant: "destructive" });
    } finally {
      setAdding(null);
    }
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    try {
      const { error } = await supabase.from("mesh_sync_relays" as any).update({ enabled }).eq("id", id);
      if (error) throw error;
      setRelays((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
  };

  const removeRelay = async (id: string) => {
    if (!confirm("Remove this relay user? They will no longer be able to forward peer submissions.")) return;
    try {
      const { error } = await supabase.from("mesh_sync_relays" as any).delete().eq("id", id);
      if (error) throw error;
      setRelays((prev) => prev.filter((r) => r.id !== id));
      toast({ title: "Relay removed" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Only Super Admins and Systems Admins can configure mesh sync.
          </CardContent>
        </Card>
      </div>
    );
  }

  const relayUserIds = new Set(relays.map((r) => r.user_id));
  const candidates = allUsers
    .filter((u) => !relayUserIds.has(u.user_id))
    .filter((u) =>
      search.trim()
        ? `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
        : true
    )
    .slice(0, 20);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2.5">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold">Mesh Sync Configuration</h1>
          <p className="text-sm text-muted-foreground">
            Designate trusted users with reliable internet to forward offline form data from
            peers via Bluetooth or Wi-Fi Direct. When a relay user reaches connectivity (e.g.,
            climbs a hill), all received submissions auto-upload.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bluetooth className="h-4 w-4" aria-hidden="true" />
            Active Relay Users
            <Badge variant="secondary">{relays.length}</Badge>
          </CardTitle>
          <CardDescription>
            These users appear as available "sync targets" inside the offline app on peer devices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          ) : relays.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No relay users configured yet. Add one below to enable peer-to-peer sync.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Granted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relays.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">
                          {r.profile?.first_name} {r.profile?.last_name}
                        </div>
                        <div className="text-xs text-muted-foreground">{r.profile?.email ?? r.user_id.slice(0, 8)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch checked={r.enabled} onCheckedChange={(v) => toggleEnabled(r.id, v)} />
                          <span className="text-xs text-muted-foreground">
                            {r.enabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => removeRelay(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Relay User
          </CardTitle>
          <CardDescription>Choose a user with consistent internet access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users by name or email…"
              className="pl-8"
            />
          </div>
          <div className="space-y-2">
            {candidates.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">
                {search ? "No matching users." : "Start typing to search users."}
              </p>
            ) : (
              candidates.map((u) => (
                <div key={u.user_id} className="flex items-center justify-between rounded-md border p-2.5">
                  <div>
                    <div className="text-sm font-medium">{u.first_name} {u.last_name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => addRelay(u.user_id)}
                    disabled={adding === u.user_id}
                  >
                    {adding === u.user_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <>
                        <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Add
                      </>
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wifi className="h-4 w-4" aria-hidden="true" />
            How it works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong>1. Field user without internet</strong> fills forms; submissions queue locally
            (IndexedDB).
          </p>
          <p>
            <strong>2. They share with a designated relay user</strong> nearby via Bluetooth or
            Wi-Fi Direct. The peer-to-peer transfer happens via the device's native sharing layer.
          </p>
          <p>
            <strong>3. Relay user reaches connectivity</strong> (e.g., reaches a hill, town, or
            Wi-Fi). All queued submissions auto-upload to the server with an audit trail noting the
            origin user.
          </p>
          <p className="rounded-md bg-muted p-2 text-xs">
            <strong>Note:</strong> True P2P transport (BLE / Wi-Fi Direct) is delivered through the
            installed mobile app (Capacitor). When opened in a browser, the relay user can still
            import a peer's exported sync bundle manually.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default MeshSyncManagerView;
