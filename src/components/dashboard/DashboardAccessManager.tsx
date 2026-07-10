import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Search, ShieldCheck, Mail } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { DASHBOARDS } from "@/hooks/useDashboardAccess";

interface Member {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  designation: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dashboardId: string;
  projectId?: string | null;
}

function accessEmailHtml(name: string, dashboardName: string, blurb: string, url: string): string {
  return `
  <div style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;">
      <div style="background:linear-gradient(135deg,#0c2340,#1a4a6e);padding:28px 32px;">
        <p style="margin:0;color:#93c5fd;font-size:12px;letter-spacing:1px;text-transform:uppercase;">Amehnities · Program Intelligence</p>
        <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;line-height:1.3;">You've been granted dashboard access</h1>
      </div>
      <div style="padding:32px;">
        <p style="margin:0 0 16px;color:#0f172a;font-size:15px;">Dear ${name},</p>
        <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
          You have been granted access to the <strong style="color:#0c2340;">${dashboardName}</strong>.
        </p>
        <div style="border-left:4px solid #0891b2;background:#ecfeff;padding:14px 16px;border-radius:8px;margin:0 0 20px;">
          <p style="margin:0;color:#155e75;font-size:14px;line-height:1.6;">${blurb}</p>
        </div>
        <p style="margin:0 0 22px;color:#334155;font-size:15px;line-height:1.6;">
          Please log in to explore the live insights and translate them into
          <strong>data-driven decisions for programme improvement</strong> — tracking coverage,
          spotting gaps early, and directing resources where they matter most.
        </p>
        <div style="text-align:center;margin:0 0 26px;">
          <a href="${url}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 34px;border-radius:10px;">
            Open the dashboard
          </a>
        </div>
        <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">
          Your insights drive impact. Log in regularly to stay ahead and lead with evidence.
        </p>
      </div>
      <div style="background:#0c2340;padding:18px 32px;">
        <p style="margin:0;color:#93a4bd;font-size:12px;">Amehnities — HANDS Nigeria monitoring platform</p>
      </div>
    </div>
  </div>`;
}

export default function DashboardAccessManager({ open, onOpenChange, dashboardId, projectId }: Props) {
  const { user } = useAuth();
  const meta = DASHBOARDS[dashboardId];
  const [members, setMembers] = useState<Member[]>([]);
  const [granted, setGranted] = useState<Record<string, string>>({}); // user_id -> access row id
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [justGranted, setJustGranted] = useState<Set<string>>(new Set());

  const loadGrants = async () => {
    let q = supabase.from("dashboard_access").select("id, user_id, project_id").eq("dashboard_id", dashboardId);
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q;
    const map: Record<string, string> = {};
    (data || []).forEach((r: any) => { map[r.user_id] = r.id; });
    setGranted(map);
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      setLoadingMembers(true);
      try {
        let userIds: string[] | null = null;
        if (projectId) {
          const { data } = await supabase
            .from("user_project_assignments").select("user_id").eq("project_id", projectId);
          userIds = (data || []).map((r: any) => r.user_id);
        }
        let q = supabase.from("profiles")
          .select("user_id, first_name, last_name, email, designation")
          .eq("is_active", true).order("first_name");
        if (userIds) q = q.in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
        const { data } = await q.limit(1000);
        if (active) setMembers((data as any) || []);
        await loadGrants();
      } finally {
        if (active) setLoadingMembers(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, dashboardId]);

  const filteredMembers = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return members;
    return members.filter((m) =>
      `${m.first_name ?? ""} ${m.last_name ?? ""} ${m.email ?? ""}`.toLowerCase().includes(s));
  }, [members, search]);

  const sendAccessEmail = async (m: Member) => {
    if (!m.email) return;
    const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "Colleague";
    const url = `${window.location.origin}/`;
    try {
      await supabase.functions.invoke("send-email-smtp", {
        body: {
          to: m.email,
          subject: `Access granted: ${meta?.name || "Dashboard"}`,
          html: accessEmailHtml(name, meta?.name || "Dashboard", meta?.blurb || "", url),
        },
      });
      toast.success(`Notification email sent to ${name}.`);
    } catch {
      toast.warning("Access granted, but the notification email could not be sent.");
    }
  };

  const grant = async (m: Member) => {
    setBusy(m.user_id);
    try {
      const { error } = await supabase.from("dashboard_access").insert({
        dashboard_id: dashboardId,
        user_id: m.user_id,
        project_id: projectId ?? null,
        granted_by: user?.id ?? null,
      });
      if (error) throw error;
      // Optimistic confirmation: reflect the new member immediately, then
      // re-verify against the server so the grant is provably persisted.
      setGranted((g) => ({ ...g, [m.user_id]: "pending" }));
      await loadGrants();
      setJustGranted((s) => new Set(s).add(m.user_id));
      setTimeout(() => setJustGranted((s) => { const n = new Set(s); n.delete(m.user_id); return n; }), 4000);
      const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "Member";
      toast.success(`${name} now has access — showing in the list.`);
      void sendAccessEmail(m);
    } catch (e: any) {
      toast.error(e?.message || "Could not grant access.");
    } finally { setBusy(null); }
  };

  const revoke = async (m: Member) => {
    const id = granted[m.user_id];
    if (!id) return;
    setBusy(m.user_id);
    try {
      const { error } = await supabase.from("dashboard_access").delete().eq("id", id);
      if (error) throw error;
      await loadGrants();
      toast.success("Access removed.");
    } catch (e: any) {
      toast.error(e?.message || "Could not remove access.");
    } finally { setBusy(null); }
  };

  const grantAll = async () => {
    setBusy("__all");
    try {
      const toGrant = filteredMembers.filter((m) => !granted[m.user_id]);
      if (!toGrant.length) { toast.info("Everyone shown already has access."); return; }
      const { error } = await supabase.from("dashboard_access").insert(
        toGrant.map((m) => ({ dashboard_id: dashboardId, user_id: m.user_id, project_id: projectId ?? null, granted_by: user?.id ?? null })),
      );
      if (error) throw error;
      await loadGrants();
      toast.success(`Access granted to ${toGrant.length} member(s).`);
      toGrant.forEach((m) => void sendAccessEmail(m));
    } catch (e: any) {
      toast.error(e?.message || "Could not grant access to all.");
    } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[calc(100vw-1.5rem)] max-h-[90dvh] overflow-hidden flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg"><ShieldCheck className="h-5 w-5 text-primary" /> Grant dashboard access</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Grant project members access to the <strong>{meta?.name}</strong>. Each member is emailed a professional invitation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search members…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Button size="sm" variant="secondary" onClick={grantAll} disabled={busy === "__all"} className="shrink-0">
            {busy === "__all" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Grant all shown
          </Button>
        </div>


        <ScrollArea className="h-[50vh] min-h-[220px] flex-1 pr-3">
          {loadingMembers ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : filteredMembers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No members found.</p>
          ) : (
            <div className="space-y-1.5">
              {filteredMembers.map((m) => {
                const isGranted = !!granted[m.user_id];
                const isNew = justGranted.has(m.user_id);
                const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email || "Member";
                return (
                  <div key={m.user_id}
                    className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 transition-colors ${isNew ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" : ""}`}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{name}</p>
                      {isNew ? (
                        <p className="flex items-center gap-1 truncate text-xs font-medium text-emerald-600">
                          <ShieldCheck className="h-3 w-3" /> Access confirmed
                        </p>
                      ) : (
                        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><Mail className="h-3 w-3" />{m.email || "no email"}</p>
                      )}
                    </div>
                    {isGranted ? (
                      <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === m.user_id} onClick={() => revoke(m)}>
                        {busy === m.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => grant(m)}>
                        <Plus className="mr-1 h-4 w-4" /> Grant
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {Object.keys(granted).length} member(s) currently have access to this dashboard.
        </div>
      </DialogContent>
    </Dialog>
  );
}
