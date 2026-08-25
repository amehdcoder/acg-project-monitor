/**
 * Amehnities AI — access audit trail.
 *
 * Every grant, permission change and revoke is written by a database trigger
 * into `admin_access_audit`, so the ledger cannot be bypassed from the client.
 * Only the Owner can read it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AI_CAPABILITIES, normalizeAiPermissions } from "@/lib/amehnitiesAi/aiPermissions";
import { History, ShieldCheck, ShieldOff, SlidersHorizontal, RefreshCw, Crown } from "lucide-react";

interface AuditRow {
  id: string;
  action: "grant" | "revoke" | "permissions_changed";
  target_user_id: string;
  actor_user_id: string | null;
  old_permissions: any;
  new_permissions: any;
  created_at: string;
}

const ACTION_META = {
  grant: { label: "Access granted", icon: ShieldCheck, cls: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" },
  revoke: { label: "Access revoked", icon: ShieldOff, cls: "border-destructive/40 text-destructive" },
  permissions_changed: { label: "Permissions changed", icon: SlidersHorizontal, cls: "border-primary/40 text-primary" },
} as const;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });

function diffLabels(oldP: any, newP: any): { added: string[]; removed: string[] } {
  const a = normalizeAiPermissions(oldP);
  const b = normalizeAiPermissions(newP);
  const added: string[] = [];
  const removed: string[] = [];
  for (const cap of AI_CAPABILITIES) {
    if (!a[cap.key] && b[cap.key]) added.push(cap.label);
    if (a[cap.key] && !b[cap.key]) removed.push(cap.label);
  }
  return { added, removed };
}

export default function AiAccessAuditLog({
  pageId,
  names,
}: {
  pageId: string;
  /** user_id → display name, supplied by the access manager. */
  names: Map<string, { name: string; isOwner?: boolean }>;
}) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [extraNames, setExtraNames] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("admin_access_audit")
        .select("id, action, target_user_id, actor_user_id, old_permissions, new_permissions, created_at")
        .eq("page_id", pageId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const list = (data ?? []) as AuditRow[];
      setRows(list);

      // Resolve any actor/target we don't already have a name for.
      const missing = Array.from(
        new Set(
          list
            .flatMap((r) => [r.actor_user_id, r.target_user_id])
            .filter((id): id is string => !!id && !names.has(id)),
        ),
      );
      if (missing.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email")
          .in("user_id", missing);
        const m = new Map<string, string>();
        (profs ?? []).forEach((p: any) =>
          m.set(
            p.user_id,
            [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "Unknown user",
          ),
        );
        setExtraNames(m);
      }
    } catch (e: any) {
      toast.error("Could not load the audit log", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, [pageId, names]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = useMemo(
    () => (id: string | null) =>
      !id ? "System" : names.get(id)?.name ?? extraNames.get(id) ?? "Unknown user",
    [names, extraNames],
  );

  if (loading) {
    return (
      <div className="space-y-2 px-6 py-4">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <History className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-medium">No access changes yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Every grant, permission change and revoke will be recorded here with the exact time and the Owner who made it.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 pt-3">
        <p className="text-[11px] text-muted-foreground">
          Showing the most recent {rows.length} change{rows.length === 1 ? "" : "s"} — recorded server-side, tamper-proof.
        </p>
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>
      <ScrollArea className="max-h-[46vh] px-6 py-3">
        <ol className="relative space-y-2 border-l border-border/60 pl-4">
          {rows.map((r) => {
            const meta = ACTION_META[r.action] ?? ACTION_META.permissions_changed;
            const Icon = meta.icon;
            const { added, removed } = diffLabels(r.old_permissions, r.new_permissions);
            const target = names.get(r.target_user_id);
            return (
              <li key={r.id} className="relative rounded-xl border border-border/60 bg-card/50 p-3">
                <span className="absolute -left-[21px] top-4 grid h-3 w-3 place-items-center rounded-full border border-border bg-background" />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={`gap-1 text-[10px] ${meta.cls}`}>
                    <Icon className="h-3 w-3" /> {meta.label}
                  </Badge>
                  <span className="text-sm font-semibold">{nameOf(r.target_user_id)}</span>
                  {target?.isOwner && (
                    <Badge className="gap-1 bg-primary/15 text-[10px] text-primary hover:bg-primary/15">
                      <Crown className="h-2.5 w-2.5" /> Owner
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  by <span className="font-medium text-foreground">{nameOf(r.actor_user_id)}</span> · {fmt(r.created_at)}
                </p>
                {(added.length > 0 || removed.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {added.map((l) => (
                      <Badge key={`a-${l}`} variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-600 dark:text-emerald-400">
                        + {l}
                      </Badge>
                    ))}
                    {removed.map((l) => (
                      <Badge key={`r-${l}`} variant="outline" className="border-destructive/40 text-[10px] text-destructive">
                        − {l}
                      </Badge>
                    ))}
                  </div>
                )}
                {r.action === "grant" && added.length === 0 && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">Granted as view-only.</p>
                )}
              </li>
            );
          })}
        </ol>
      </ScrollArea>
    </div>
  );
}
