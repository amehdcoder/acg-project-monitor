import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCanEditDashboards } from "@/hooks/useCanEditDashboards";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Plus, LayoutDashboard, Loader2, Sparkles, Search, ShieldAlert, Trash2, Copy,
} from "lucide-react";
import DashboardStudio from "./DashboardStudio";
import { BUILT_IN_PRESETS, cloneBuiltInDashboard, type BuiltInPreset } from "@/lib/dashboardStudio/cloneToStudio";

interface DashRow {
  id: string;
  name: string;
  description: string | null;
  is_published: boolean;
  updated_at: string;
}

interface Props { onBack?: () => void; }

export default function StudioLauncher({ onBack }: Props) {
  const { user } = useAuth();
  const { canEditDashboards } = useCanEditDashboards();
  const [dashboards, setDashboards] = useState<DashRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<DashRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [cloningKey, setCloningKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("custom_dashboards")
      .select("id, name, description, is_published, updated_at")
      .order("updated_at", { ascending: false });
    setDashboards((data as DashRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { if (canEditDashboards) load(); }, [canEditDashboards, load]);

  if (!canEditDashboards) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground/40" />
        <h3 className="font-semibold">Restricted</h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Only Owners, Co-owners, Super Admins and Systems Admins can use the Dashboard Studio.
        </p>
      </div>
    );
  }

  const createDashboard = async () => {
    if (!newName.trim() || !user) return;
    setCreating(true);
    const { data, error } = await supabase.from("custom_dashboards").insert([{
      name: newName.trim(), description: newDesc.trim() || null, created_by: user.id, layout: [] as any,
    }]).select().single();
    setCreating(false);
    if (error) { toast.error("Failed to create dashboard"); return; }
    setShowCreate(false); setNewName(""); setNewDesc("");
    await load();
    setOpen(data as DashRow);
  };

  const removeDashboard = async (id: string) => {
    await supabase.from("dashboard_widgets").delete().eq("dashboard_id", id);
    await supabase.from("custom_dashboards").delete().eq("id", id);
    toast.success("Dashboard deleted");
    load();
  };

  if (open) {
    return <DashboardStudio dashboardId={open.id} dashboardName={open.name} onBack={() => { setOpen(null); load(); }} />;
  }

  const filtered = dashboards.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {onBack && <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>}
          <div>
            <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
              <Sparkles className="h-5 w-5 text-primary" /> Dashboard Studio
            </h1>
            <p className="text-sm text-muted-foreground">Build fully configurable dashboards with any data source — Looker-style.</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="mr-2 h-4 w-4" /> New dashboard</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search dashboards..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <LayoutDashboard className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-4 font-semibold">No dashboards yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create your first fully custom dashboard.</p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}><Plus className="mr-2 h-4 w-4" /> New dashboard</Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d) => (
            <Card key={d.id} className="group cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md" onClick={() => setOpen(d)}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">{d.name}</CardTitle>
                  <Badge variant={d.is_published ? "default" : "secondary"} className="shrink-0">{d.is_published ? "Published" : "Draft"}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-2 text-sm text-muted-foreground">{d.description || "No description"}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-primary"><LayoutDashboard className="h-4 w-4" /> Open studio</span>
                  <button onClick={(e) => { e.stopPropagation(); removeDashboard(d.id); }} className="opacity-0 transition-opacity group-hover:opacity-100">
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New dashboard</DialogTitle>
            <DialogDescription>Give it a name, then connect data sources and add charts inside the studio.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><label className="text-sm font-medium">Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Campaign Overview" /></div>
            <div className="space-y-1.5"><label className="text-sm font-medium">Description (optional)</label>
              <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={createDashboard} disabled={creating || !newName.trim()}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
