/**
 * Access & permission granting UI for the Integrated Supervisory Checklist.
 *
 * Grants (or revokes) two independent capabilities per user, backed by
 * `user_page_access` rows (owner / co-owner managed, optionally time-bounded):
 *
 *   • `integrated-supervisory`      → Checklist Dashboard (analytics + exports)
 *   • `integrated-supervisory-raw`  → Raw Kobo Data (record-level table + export)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  BarChart3, Check, Clock, Database, Loader2, Search, ShieldCheck, Sparkles, UserPlus, Users, X,
} from "lucide-react";

export const CHECKLIST_PAGE_ID = "integrated-supervisory";
export const CHECKLIST_RAW_PAGE_ID = "integrated-supervisory-raw";

const MODULES = [
  {
    id: CHECKLIST_PAGE_ID,
    label: "Checklist Dashboard",
    blurb: "KPIs, coverage analytics, maps, predictive models and the ML Intelligence Hub.",
    icon: BarChart3,
    gradient: "from-[hsl(214,80%,42%)] to-[hsl(190,70%,40%)]",
    ring: "ring-sky-400/40",
  },
  {
    id: CHECKLIST_RAW_PAGE_ID,
    label: "Raw Kobo Data",
    blurb: "Record-level flattened + raw submissions, column control and Excel / CSV export.",
    icon: Database,
    gradient: "from-[hsl(265,55%,48%)] to-[hsl(320,55%,48%)]",
    ring: "ring-fuchsia-400/40",
  },
] as const;

interface UserRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  designation: string | null;
}

interface GrantRow {
  id: string;
  user_id: string;
  page_id: string;
  expires_at: string | null;
}

const displayName = (u: UserRow) =>
  [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || "Unknown user";

const initials = (u: UserRow) =>
  displayName(u).split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "?";

const prettyDesignation = (d: string | null) =>
  (d ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "No designation";

export default function ChecklistAccessManager({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user, isOwner, isCoOwner } = useAuth();
  const canManage = !!isOwner || !!isCoOwner;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [onlyWithAccess, setOnlyWithAccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: ud }, { data: gd }] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email, designation")
        .eq("approval_status", "approved")
        .order("first_name", { nullsFirst: false }),
      supabase
        .from("user_page_access")
        .select("id, user_id, page_id, expires_at")
        .in("page_id", [CHECKLIST_PAGE_ID, CHECKLIST_RAW_PAGE_ID]),
    ]);
    setUsers((ud ?? []) as UserRow[]);
    setGrants((gd ?? []) as GrantRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const grantMap = useMemo(() => {
    const m = new Map<string, GrantRow>();
    for (const g of grants) m.set(`${g.user_id}:${g.page_id}`, g);
    return m;
  }, [grants]);

  const counts = useMemo(() => ({
    [CHECKLIST_PAGE_ID]: grants.filter((g) => g.page_id === CHECKLIST_PAGE_ID).length,
    [CHECKLIST_RAW_PAGE_ID]: grants.filter((g) => g.page_id === CHECKLIST_RAW_PAGE_ID).length,
  }), [grants]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (onlyWithAccess &&
        !grantMap.has(`${u.user_id}:${CHECKLIST_PAGE_ID}`) &&
        !grantMap.has(`${u.user_id}:${CHECKLIST_RAW_PAGE_ID}`)) return false;
      if (!q) return true;
      return `${displayName(u)} ${u.email ?? ""} ${u.designation ?? ""}`.toLowerCase().includes(q);
    });
  }, [users, search, onlyWithAccess, grantMap]);

  const toggle = async (target: UserRow, pageId: string, next: boolean) => {
    if (!canManage || !user) return;
    const key = `${target.user_id}:${pageId}`;
    setBusyKey(key);
    try {
      if (next) {
        const { data, error } = await supabase
          .from("user_page_access")
          .insert({
            user_id: target.user_id,
            page_id: pageId,
            granted_by: user.id,
            expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          })
          .select("id, user_id, page_id, expires_at")
          .single();
        if (error) throw error;
        setGrants((g) => [...g.filter((x) => `${x.user_id}:${x.page_id}` !== key), data as GrantRow]);
        toast({
          title: "Access granted",
          description: `${displayName(target)} can now open ${MODULES.find((m) => m.id === pageId)?.label}.`,
        });
      } else {
        const existing = grantMap.get(key);
        if (existing) {
          const { error } = await supabase.from("user_page_access").delete().eq("id", existing.id);
          if (error) throw error;
        }
        setGrants((g) => g.filter((x) => `${x.user_id}:${x.page_id}` !== key));
        toast({ title: "Access revoked", description: displayName(target) });
      }
    } catch (e: any) {
      toast({ title: "Could not update access", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden gap-0">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-[hsl(214,70%,20%)] via-[hsl(224,65%,28%)] to-[hsl(265,55%,38%)] px-6 py-5 text-white">
          <div className="absolute inset-0 opacity-25 [background:radial-gradient(600px_circle_at_10%_-20%,#38bdf8,transparent_60%),radial-gradient(500px_circle_at_90%_120%,#e879f9,transparent_55%)]" />
          <DialogHeader className="relative space-y-1">
            <DialogTitle className="flex items-center gap-2 text-white text-lg">
              <ShieldCheck className="h-5 w-5" />
              Access &amp; Permissions — Integrated Supervisory Checklist
            </DialogTitle>
            <DialogDescription className="text-white/80 text-xs">
              Grant precise, optionally time-bounded access to the Checklist Dashboard and the Raw Kobo Data table.
              Owners, co-owners and administrators always have full access.
            </DialogDescription>
          </DialogHeader>
          <div className="relative mt-4 grid gap-3 sm:grid-cols-2">
            {MODULES.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl bg-gradient-to-br ${m.gradient} p-3 shadow-lg ring-1 ${m.ring}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <m.icon className="h-4 w-4" /> {m.label}
                  </span>
                  <Badge className="bg-white/20 text-white hover:bg-white/25 border-0">
                    <Users className="h-3 w-3 mr-1" />{counts[m.id]}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-white/85">{m.blurb}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3 border-b bg-muted/40 px-6 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Label className="text-[11px] font-semibold text-muted-foreground">Find a user</Label>
            <Search className="pointer-events-none absolute left-2.5 top-[30px] h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email or designation…"
              className="mt-1 h-9 pl-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Access expires (optional)
            </Label>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="mt-1 h-9 w-[210px] text-xs"
            />
          </div>
          <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs font-medium">
            <Switch checked={onlyWithAccess} onCheckedChange={setOnlyWithAccess} />
            Only users with access
          </label>
        </div>

        {!canManage && (
          <div className="border-b bg-amber-50 px-6 py-2 text-xs text-amber-800">
            You can review who has access, but only the platform owner or a co-owner can change grants.
          </div>
        )}

        {/* Roster */}
        <ScrollArea className="h-[46vh]">
          <div className="divide-y">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="py-16 text-center text-sm text-muted-foreground">
                <UserPlus className="mx-auto mb-2 h-6 w-6 opacity-50" />
                No users match this search.
              </div>
            )}
            {!loading && filtered.map((u) => (
              <div key={u.user_id} className="flex flex-wrap items-center gap-3 px-6 py-3 hover:bg-muted/40">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-[11px] font-bold text-primary-foreground">
                  {initials(u)}
                </div>
                <div className="min-w-[180px] flex-1">
                  <p className="text-sm font-semibold leading-tight break-words">{displayName(u)}</p>
                  <p className="text-[11px] text-muted-foreground break-all">
                    {u.email ?? "—"} · {prettyDesignation(u.designation)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {MODULES.map((m) => {
                    const key = `${u.user_id}:${m.id}`;
                    const g = grantMap.get(key);
                    const on = !!g;
                    const busy = busyKey === key;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={!canManage || busy}
                        onClick={() => toggle(u, m.id, !on)}
                        title={
                          g?.expires_at
                            ? `Expires ${new Date(g.expires_at).toLocaleString()}`
                            : on ? "Permanent access — click to revoke" : `Grant ${m.label}`
                        }
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-all disabled:opacity-60 ${
                          on
                            ? `border-transparent bg-gradient-to-r ${m.gradient} text-white shadow-sm hover:brightness-110`
                            : "border-dashed bg-background text-muted-foreground hover:border-primary hover:text-primary"
                        }`}
                      >
                        {busy
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : on ? <Check className="h-3.5 w-3.5" /> : <m.icon className="h-3.5 w-3.5" />}
                        {m.label}
                        {on && g?.expires_at && <Clock className="h-3 w-3 opacity-80" />}
                        {on && canManage && <X className="h-3 w-3 opacity-70" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-6 py-3">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Grants apply instantly — users see the change without signing out.
          </p>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
