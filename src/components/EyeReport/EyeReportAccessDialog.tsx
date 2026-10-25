import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Search, ClipboardList, BarChart3, FolderPlus } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;
interface Props { open: boolean; onOpenChange: (o: boolean) => void; projects: { id: string; name: string }[]; projectId: string | null; userId?: string; onChanged?: () => void }

/** Admins add the Eye Health report to projects and grant report / dashboard access per user. */
export default function EyeReportAccessDialog({ open, onOpenChange, projects, projectId, userId, onChanged }: Props) {
  const [tab, setTab] = useState<"projects" | "users">("users");
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [pid, setPid] = useState<string | null>(projectId);
  const [members, setMembers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [grants, setGrants] = useState<Record<string, { can_report: boolean; can_view_dashboard: boolean }>>({});
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => { if (open) { setPid(projectId); void db.from("eye_report_projects").select("project_id").then(({ data }: any) => setEnabled(new Set((data ?? []).map((r: any) => r.project_id)))); } }, [open, projectId]);
  useEffect(() => {
    if (!open || !pid) return;
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: g }] = await Promise.all([
        db.from("user_project_assignments").select("user_id").eq("project_id", pid),
        db.from("eye_report_access").select("user_id, can_report, can_view_dashboard").eq("project_id", pid),
      ]);
      const ids = Array.from(new Set((a ?? []).map((r: any) => r.user_id)));
      const { data: p } = ids.length ? await db.from("profiles").select("user_id, first_name, last_name, email").in("user_id", ids) : { data: [] };
      setMembers((p ?? []).map((r: any) => ({ id: r.user_id, name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email, email: r.email ?? "" })).sort((x: any, y: any) => x.name.localeCompare(y.name)));
      setGrants(Object.fromEntries((g ?? []).map((r: any) => [r.user_id, r])));
      setLoading(false);
    })();
  }, [open, pid]);

  const toggleProject = async (id: string, on: boolean) => {
    const { error } = on ? await db.from("eye_report_projects").insert({ project_id: id, added_by: userId }) : await db.from("eye_report_projects").delete().eq("project_id", id);
    if (error) return toast.error(error.message);
    setEnabled((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; }); onChanged?.();
  };
  const setGrant = async (uid: string, key: "can_report" | "can_view_dashboard", v: boolean) => {
    const next = { can_report: false, can_view_dashboard: false, ...grants[uid], [key]: v };
    const { error } = await db.from("eye_report_access").upsert({ project_id: pid, user_id: uid, can_report: next.can_report, can_view_dashboard: next.can_view_dashboard, granted_by: userId, updated_at: new Date().toISOString() }, { onConflict: "project_id,user_id" });
    if (error) return toast.error(error.message);
    setGrants((g) => ({ ...g, [uid]: next }));
  };
  const shown = useMemo(() => members.filter((m) => `${m.name} ${m.email}`.toLowerCase().includes(q.toLowerCase())), [members, q]);
  const eyeProjects = projects.filter((p) => enabled.has(p.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Eye Health reporting access</DialogTitle><DialogDescription>Add the daily report and dashboard to projects, then choose who can report and who can view the dashboard. Admins always have both.</DialogDescription></DialogHeader>
        <div className="flex gap-2">
          <Button size="sm" variant={tab === "users" ? "default" : "outline"} onClick={() => setTab("users")}>User access</Button>
          <Button size="sm" variant={tab === "projects" ? "default" : "outline"} onClick={() => setTab("projects")}><FolderPlus className="mr-1 h-4 w-4" /> Projects</Button>
        </div>
        {tab === "projects" ? (
          <div className="divide-y rounded-md border">{projects.map((p) => (
            <label key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"><span className="truncate">{p.name}</span><Switch checked={enabled.has(p.id)} onCheckedChange={(v) => void toggleProject(p.id, v)} /></label>
          ))}</div>
        ) : (
          <div className="space-y-3">
            <select value={pid ?? ""} onChange={(e) => setPid(e.target.value || null)} className="h-10 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Select project…</option>{eyeProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {pid && !enabled.has(pid) && <p className="text-sm text-muted-foreground">This project does not have Eye Health reporting yet — add it under Projects.</p>}
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members" className="pl-9" /></div>
            {loading ? <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
              <div className="divide-y rounded-md border">
                <div className="grid grid-cols-[1fr_80px_80px] gap-2 bg-muted/50 px-3 py-2 text-xs font-semibold"><span>Member</span><span className="flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" />Report</span><span className="flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" />Dashboard</span></div>
                {shown.map((m) => (
                  <div key={m.id} className="grid grid-cols-[1fr_80px_80px] items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium">{m.name}</span><span className="block truncate text-xs text-muted-foreground">{m.email}</span></span>
                    <Switch checked={!!grants[m.id]?.can_report} onCheckedChange={(v) => void setGrant(m.id, "can_report", v)} aria-label={`Report access for ${m.name}`} />
                    <Switch checked={!!grants[m.id]?.can_view_dashboard} onCheckedChange={(v) => void setGrant(m.id, "can_view_dashboard", v)} aria-label={`Dashboard access for ${m.name}`} />
                  </div>
                ))}
                {shown.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No project members found.</p>}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
