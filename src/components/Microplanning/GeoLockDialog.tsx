import { useEffect, useState } from "react";
import { MapPinned } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useProjectUsers } from "@/lib/programmeModule/projectUsers";

interface Props {
  project: { id: string; name: string } | null;
  onClose: () => void;
}

/** Owner / Super Admin: lock a project or chosen users to the Geo Microplanning workspace. */
const GeoLockDialog = ({ project, onClose }: Props) => {
  const { users, loading } = useProjectUsers(project?.id);
  const [wholeProject, setWholeProject] = useState(false);
  const [lockedUsers, setLockedUsers] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const db = supabase as any;

  useEffect(() => {
    if (!project) return;
    void (async () => {
      const { data } = await db.from("microplan_workspace_locks").select("user_id").eq("project_id", project.id);
      const rows = (data as { user_id: string | null }[]) || [];
      setWholeProject(rows.some((r) => r.user_id === null));
      setLockedUsers(new Set(rows.filter((r) => r.user_id).map((r) => r.user_id as string)));
    })();
  }, [project?.id]);

  const toggle = async (userId: string | null, on: boolean) => {
    if (!project) return;
    setBusy(true);
    const q = on
      ? db.from("microplan_workspace_locks").insert({ project_id: project.id, user_id: userId })
      : userId
        ? db.from("microplan_workspace_locks").delete().eq("project_id", project.id).eq("user_id", userId)
        : db.from("microplan_workspace_locks").delete().eq("project_id", project.id).is("user_id", null);
    const { error } = await q;
    setBusy(false);
    if (error) { toast({ title: "Could not update", description: error.message, variant: "destructive" }); return; }
    if (userId === null) setWholeProject(on);
    else setLockedUsers((s) => { const n = new Set(s); on ? n.add(userId) : n.delete(userId); return n; });
    toast({ title: on ? "Locked to Geo Microplanning" : "Lock removed" });
  };

  const filtered = users.filter((u) => `${u.full_name} ${u.email ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-primary" /> Geo Microplanning workspace</DialogTitle>
          <DialogDescription>
            Locked people see only the Geo Microplanning workspace for "{project?.name}" — no side menu, not even the Geo Microplanning item. Owners and Super Admins are never locked.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between rounded-lg border border-primary/25 bg-primary/5 p-3">
          <div>
            <Label className="text-sm font-semibold">Lock the whole project</Label>
            <p className="text-xs text-muted-foreground">Everyone assigned to this project.</p>
          </div>
          <Switch checked={wholeProject} disabled={busy} onCheckedChange={(v) => void toggle(null, v)} />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Or lock chosen users</Label>
          <Input placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="max-h-72 divide-y overflow-auto rounded-md border">
            {loading && <p className="p-3 text-xs text-muted-foreground">Loading…</p>}
            {!loading && filtered.length === 0 && <p className="p-3 text-xs text-muted-foreground">No people on this project.</p>}
            {filtered.map((u) => (
              <div key={u.user_id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.full_name}</p>
                  {u.email && <p className="truncate text-xs text-muted-foreground">{u.email}</p>}
                </div>
                <Switch
                  checked={wholeProject || lockedUsers.has(u.user_id)}
                  disabled={busy || wholeProject}
                  onCheckedChange={(v) => void toggle(u.user_id, v)}
                />
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GeoLockDialog;
