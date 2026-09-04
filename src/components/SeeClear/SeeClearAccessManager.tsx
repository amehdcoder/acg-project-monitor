/**
 * Access granting panel for the See Clear (Plateau Comprehensive & Inclusive
 * Eye Health) project.
 *
 * Grants or revokes two independent capabilities per user, backed by
 * `user_standard_form_assignments`:
 *
 *   • `seeclear_form` → Facility Monitoring Checklist (data entry)
 *   • `seeclear_dash` → Monitoring Dashboard (analytics, exports, map)
 *
 * Both toggles are independent, so a user can have the checklist only, the
 * dashboard only, or both. Changes are live for every open session.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BarChart3, ClipboardCheck, Loader2, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";

export const SEECLEAR_FORM_CODE = "seeclear_form";
export const SEECLEAR_DASH_CODE = "seeclear_dash";

const MODULES = [
  {
    code: SEECLEAR_FORM_CODE,
    label: "Checklist",
    blurb: "Facility profile, readiness, equipment, evidence and sign-off.",
    icon: ClipboardCheck,
    tint: "#14b8a6",
  },
  {
    code: SEECLEAR_DASH_CODE,
    label: "Dashboard",
    blurb: "Readiness analytics, equipment status, referrals, map and exports.",
    icon: BarChart3,
    tint: "#0f766e",
  },
] as const;

interface UserRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  designation: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const nameOf = (u: UserRow) =>
  `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || "Unnamed user";

export default function SeeClearAccessManager({ open, onClose }: Props) {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [grants, setGrants] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: profiles, error: pErr }, { data: assigns }] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id,first_name,last_name,email,designation")
        .order("first_name", { ascending: true })
        .limit(1000),
      (supabase as any)
        .from("user_standard_form_assignments")
        .select("user_id,form_code")
        .in("form_code", [SEECLEAR_FORM_CODE, SEECLEAR_DASH_CODE]),
    ]);
    if (pErr) toast.error("Could not load users");
    setUsers((profiles as UserRow[]) ?? []);
    const map: Record<string, Set<string>> = {};
    ((assigns as any[]) ?? []).forEach((r) => {
      (map[r.user_id] ||= new Set<string>()).add(r.form_code);
    });
    setGrants(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const channel = supabase
      .channel(`seeclear-access-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "user_standard_form_assignments" },
        () => void load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, load]);

  const toggle = async (u: UserRow, code: string, next: boolean) => {
    const key = `${u.user_id}:${code}`;
    setBusy(key);
    // Optimistic update — reconciled by the realtime reload below.
    setGrants((prev) => {
      const copy = { ...prev };
      const set = new Set(copy[u.user_id] ?? []);
      next ? set.add(code) : set.delete(code);
      copy[u.user_id] = set;
      return copy;
    });
    try {
      if (next) {
        const { error } = await (supabase as any)
          .from("user_standard_form_assignments")
          .insert({ user_id: u.user_id, form_code: code, assigned_by: user?.id });
        if (error && !/duplicate key/i.test(error.message)) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("user_standard_form_assignments")
          .delete()
          .eq("user_id", u.user_id)
          .eq("form_code", code);
        if (error) throw error;
      }
      toast.success(
        `${next ? "Granted" : "Revoked"} ${code === SEECLEAR_FORM_CODE ? "Checklist" : "Dashboard"} access for ${nameOf(u)}`,
      );
    } catch (e) {
      toast.error((e as Error).message || "Could not update access");
      await load();
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return users;
    return users.filter((u) => `${nameOf(u)} ${u.email ?? ""} ${u.designation ?? ""}`.toLowerCase().includes(t));
  }, [users, q]);

  const granted = useMemo(
    () => Object.values(grants).filter((s) => s.size > 0).length,
    [grants],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> See Clear access management
          </DialogTitle>
          <DialogDescription>
            Grant project members the Facility Monitoring Checklist, the Monitoring Dashboard, or both.
            Changes apply instantly across every device.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 pb-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or designation…" className="pl-8" />
          </div>
          <Badge variant="outline" className="text-[11px]"><Users className="mr-1 h-3 w-3" />{granted} with access</Badge>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        <div className="grid gap-2 pb-2 sm:grid-cols-2">
          {MODULES.map((m) => (
            <div key={m.code} className="flex items-start gap-2 rounded-lg border p-2.5" style={{ borderColor: `${m.tint}55`, background: `${m.tint}0d` }}>
              <m.icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: m.tint }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: m.tint }}>{m.label}</p>
                <p className="text-[11px] text-muted-foreground">{m.blurb}</p>
              </div>
            </div>
          ))}
        </div>

        <ScrollArea className="max-h-[46vh] rounded-lg border">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              {loading ? "Loading users…" : "No users match your search."}
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map((u) => {
                const set = grants[u.user_id] ?? new Set<string>();
                return (
                  <div key={u.user_id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{nameOf(u)}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {u.email}{u.designation ? ` • ${u.designation.replace(/_/g, " ")}` : ""}
                      </p>
                    </div>
                    {MODULES.map((m) => {
                      const key = `${u.user_id}:${m.code}`;
                      return (
                        <label key={m.code} className="flex items-center gap-1.5 text-[11px] font-medium">
                          <Switch
                            checked={set.has(m.code)}
                            disabled={busy === key}
                            onCheckedChange={(v) => toggle(u, m.code, v)}
                          />
                          <span style={{ color: m.tint }}>{m.label}</span>
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
