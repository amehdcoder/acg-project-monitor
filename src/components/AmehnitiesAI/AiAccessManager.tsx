/**
 * Amehnities AI — Owner-only access manager.
 *
 * The Amehnities AI workspace is restricted to the Owner. From here the Owner
 * can hand the key to individual admins (Super Admins / Systems Admins); each
 * grant is a row in `admin_page_access` (page_id = "amehnities-ai") which the
 * grantee picks up in realtime via `usePageAccess`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  KeyRound, Loader2, Search, ShieldCheck, Sparkles, UserRoundCheck, Users2, Crown,
} from "lucide-react";

export const AMEHNITIES_AI_PAGE_ID = "amehnities-ai";

type AdminRole = "super_admin" | "systems_admin";

interface AdminRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  designation: string | null;
  is_owner: boolean | null;
  role: AdminRole;
}

const displayName = (a: AdminRow) =>
  [a.first_name, a.last_name].filter(Boolean).join(" ").trim() || a.email || "Unnamed admin";

const initials = (a: AdminRow) => {
  const n = displayName(a);
  return n.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "A";
};

const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  systems_admin: "Systems Admin",
};

export default function AiAccessManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user, isOwner } = useAuth();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["super_admin", "systems_admin"]);
      if (roleErr) throw roleErr;

      const roleById = new Map<string, AdminRole>();
      (roleRows ?? []).forEach((r: any) => {
        // Super Admin wins when a person holds both roles.
        if (r.role === "super_admin" || !roleById.has(r.user_id)) roleById.set(r.user_id, r.role);
      });
      const ids = Array.from(roleById.keys());

      if (ids.length === 0) {
        setAdmins([]);
        setGranted(new Set());
        return;
      }

      const [{ data: profileRows }, { data: grantRows }] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email, avatar_url, designation, is_owner")
          .in("user_id", ids),
        supabase
          .from("admin_page_access")
          .select("user_id")
          .eq("page_id", AMEHNITIES_AI_PAGE_ID),
      ]);

      const rows: AdminRow[] = (profileRows ?? []).map((p: any) => ({
        user_id: p.user_id,
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email,
        avatar_url: p.avatar_url,
        designation: p.designation,
        is_owner: p.is_owner,
        role: roleById.get(p.user_id) ?? "systems_admin",
      }));

      rows.sort((a, b) => {
        if (!!a.is_owner !== !!b.is_owner) return a.is_owner ? -1 : 1;
        return displayName(a).localeCompare(displayName(b));
      });

      setAdmins(rows);
      setGranted(new Set((grantRows ?? []).map((g: any) => g.user_id as string)));
    } catch (e: any) {
      toast.error("Could not load admins", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && isOwner) void load();
  }, [open, isOwner, load]);

  const toggleAccess = async (row: AdminRow, next: boolean) => {
    if (row.is_owner) return; // the Owner always has access
    setPending(row.user_id);
    try {
      if (next) {
        const { error } = await supabase.from("admin_page_access").insert({
          user_id: row.user_id,
          page_id: AMEHNITIES_AI_PAGE_ID,
          granted_by: user!.id,
        });
        if (error) throw error;
        setGranted((cur) => new Set(cur).add(row.user_id));
        toast.success(`${displayName(row)} can now open Amehnities AI`);
      } else {
        const { error } = await supabase
          .from("admin_page_access")
          .delete()
          .eq("user_id", row.user_id)
          .eq("page_id", AMEHNITIES_AI_PAGE_ID);
        if (error) throw error;
        setGranted((cur) => {
          const n = new Set(cur);
          n.delete(row.user_id);
          return n;
        });
        toast.success(`Access revoked for ${displayName(row)}`);
      }
    } catch (e: any) {
      toast.error("Could not update access", { description: e?.message });
    } finally {
      setPending(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter((a) =>
      `${displayName(a)} ${a.email ?? ""} ${a.designation ?? ""}`.toLowerCase().includes(q),
    );
  }, [admins, search]);

  const grantedCount = useMemo(
    () => admins.filter((a) => !a.is_owner && granted.has(a.user_id)).length,
    [admins, granted],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden p-0">
        {/* Gradient identity header */}
        <div className="relative overflow-hidden border-b border-border/60 px-6 py-5">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background:
                "radial-gradient(30rem 12rem at 10% -40%, hsl(var(--primary) / 0.22), transparent 60%), radial-gradient(24rem 12rem at 100% 0%, hsl(var(--primary) / 0.12), transparent 60%)",
            }}
          />
          <DialogHeader className="relative space-y-1.5 text-left">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10">
                <KeyRound className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg tracking-tight">Amehnities AI access</DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  Owner-only workspace. Hand the key to the admins you trust — changes apply instantly.
                </DialogDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Badge variant="outline" className="gap-1.5 border-primary/40 text-primary">
                <Crown className="h-3 w-3" /> Owner always has access
              </Badge>
              <Badge variant="secondary" className="gap-1.5">
                <UserRoundCheck className="h-3 w-3" /> {grantedCount} admin{grantedCount === 1 ? "" : "s"} granted
              </Badge>
              <Badge variant="outline" className="gap-1.5">
                <Users2 className="h-3 w-3" /> {admins.length} eligible
              </Badge>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search admins by name, email or designation…"
              className="pl-9"
            />
          </div>
        </div>

        <ScrollArea className="max-h-[46vh] px-6 py-4">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 p-8 text-center">
              <Sparkles className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-medium">No matching admins</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Only Super Admins and Systems Admins can be granted Amehnities AI.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((a) => {
                const has = a.is_owner || granted.has(a.user_id);
                const busy = pending === a.user_id;
                return (
                  <div
                    key={a.user_id}
                    className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                      has ? "border-primary/40 bg-primary/[0.06]" : "border-border/60 bg-card/50"
                    }`}
                  >
                    <Avatar className="h-10 w-10 border border-border/60">
                      {a.avatar_url && <AvatarImage src={a.avatar_url} alt={displayName(a)} />}
                      <AvatarFallback className="text-xs font-semibold">{initials(a)}</AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{displayName(a)}</span>
                        {a.is_owner && (
                          <Badge className="gap-1 bg-primary/15 text-[10px] text-primary hover:bg-primary/15">
                            <Crown className="h-2.5 w-2.5" /> Owner
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">{ROLE_LABEL[a.role]}</Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{a.email ?? "—"}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {has && (
                        <span className="hidden items-center gap-1 text-[11px] font-medium text-primary sm:flex">
                          <ShieldCheck className="h-3.5 w-3.5" /> Access
                        </span>
                      )}
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Switch
                          checked={has}
                          disabled={!!a.is_owner}
                          onCheckedChange={(v) => void toggleAccess(a, v)}
                          aria-label={`Toggle Amehnities AI access for ${displayName(a)}`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-6 py-3">
          <p className="text-[11px] text-muted-foreground">
            Grantees see the page appear in their sidebar immediately; revoking closes it just as fast.
          </p>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
