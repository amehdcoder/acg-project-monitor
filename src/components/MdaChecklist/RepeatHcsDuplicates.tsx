/**
 * Repeat Household Coverage Survey — Duplicate Submissions Manager
 * ────────────────────────────────────────────────────────────────────────
 * When the same community (State → LGA → Ward → FLHF → Community → Settlement)
 * has been captured more than once, this panel renders every duplicate
 * submission SIDE BY SIDE — showing who submitted it, when, and the number of
 * households recorded in each — so the Owner can compare and permanently
 * delete whichever duplicate should not be kept.
 *
 * Deletion is Owner / Co-owner only and routes through the audited
 * `owner_delete_records` RPC (permanent removal of the chosen survey row).
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CopyCheck, Home, Trash2, Loader2, MapPin, CalendarClock, User2, Layers, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface SurveyLike {
  id: string;
  state: string | null;
  lga: string | null;
  ward: string | null;
  flhf_name?: string | null;
  community_name: string | null;
  settlement_name?: string | null;
  user_id?: string | null;
  target_households: number | null;
  completed_households: number | null;
  households: any[] | null;
  created_at: string;
}

interface Props {
  surveys: SurveyLike[];
  /** called after a successful deletion so the parent can refresh */
  onDeleted?: () => void;
}

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const TINTS = ["#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#14b8a6"];

interface DupGroup {
  key: string;
  state: string;
  lga: string;
  ward: string;
  flhf: string;
  community: string;
  settlement: string;
  members: SurveyLike[];
}

export default function RepeatHcsDuplicates({ surveys, onDeleted }: Props) {
  const { isOwnerLevel } = useAuth();
  const [names, setNames] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<SurveyLike | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const groups = useMemo<DupGroup[]>(() => {
    const buckets = new Map<string, SurveyLike[]>();
    for (const s of surveys) {
      if (!norm(s.community_name)) continue;
      const key = [
        norm(s.state), norm(s.lga), norm(s.ward),
        norm(s.flhf_name), norm(s.community_name), norm(s.settlement_name),
      ].join("|");
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(s);
    }
    const out: DupGroup[] = [];
    for (const [key, members] of buckets) {
      if (members.length < 2) continue;
      const ordered = [...members].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const f = ordered[0];
      out.push({
        key,
        state: f.state || "—",
        lga: f.lga || "—",
        ward: f.ward || "—",
        flhf: f.flhf_name || "—",
        community: f.community_name || "—",
        settlement: f.settlement_name || "",
        members: ordered,
      });
    }
    // most households at stake / most duplicates first
    return out.sort((a, b) => b.members.length - a.members.length);
  }, [surveys]);

  // Resolve submitter display names for all involved users.
  useEffect(() => {
    const ids = Array.from(
      new Set(groups.flatMap((g) => g.members.map((m) => m.user_id).filter(Boolean) as string[])),
    );
    if (!ids.length) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      for (const p of data as any[]) map[p.id] = p.full_name || p.email || "Unknown";
      setNames(map);
    })();
    return () => { cancelled = true; };
  }, [groups]);

  const totalDupSurveys = groups.reduce((a, g) => a + g.members.length, 0);

  const confirmDelete = async () => {
    if (!pending) return;
    const target = pending;
    setBusyId(target.id);
    const toastId = toast.loading("Permanently deleting duplicate survey…");
    try {
      const { error } = await (supabase as any).rpc("owner_delete_records", {
        _table: "household_coverage_surveys",
        _ids: [target.id],
        _archive: false,
      });
      if (error) throw error;
      toast.success("Duplicate survey deleted", { id: toastId });
      setPending(null);
      onDeleted?.();
    } catch (e: any) {
      toast.error(`Delete failed: ${e?.message || "Unknown error"}`, { id: toastId });
    } finally {
      setBusyId(null);
    }
  };

  if (groups.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <CopyCheck className="h-4 w-4 text-primary" /> Duplicate Household Coverage Surveys
            <Badge variant="secondary" className="ml-auto">0 flagged</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">
            No duplicate surveys detected. Each community was captured once in the Repeat Household Coverage Survey.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-gradient-to-r from-rose-500/10 to-amber-500/10 pb-3">
          <CardTitle className="flex flex-wrap items-center gap-1.5 text-sm">
            <CopyCheck className="h-4 w-4 text-rose-500" /> Duplicate Household Coverage Surveys
            <Badge variant="destructive" className="ml-1">{groups.length} communit{groups.length === 1 ? "y" : "ies"}</Badge>
            <Badge variant="outline" className="border-rose-300 text-rose-600">{totalDupSurveys} submissions</Badge>
            {!isOwnerLevel && (
              <span className="ml-auto flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
                <Crown className="h-3 w-3" /> Owner-only deletion
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-3 sm:p-4">
          {groups.map((g, gi) => {
            const maxHh = Math.max(...g.members.map((m) => (m.households?.length || 0)), 1);
            return (
              <div key={g.key} className="rounded-xl border border-border/70 bg-muted/20 p-3">
                {/* Community breadcrumb header */}
                <div className="mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
                  <MapPin className="h-3.5 w-3.5 text-rose-500" />
                  {[g.state, g.lga, g.ward, g.flhf, g.community, g.settlement]
                    .filter((x) => x && x !== "—")
                    .map((part, i, arr) => (
                      <span key={i} className="flex items-center gap-1.5">
                        <span className={i === arr.length - 1 ? "font-bold text-foreground" : "text-muted-foreground"}>{part}</span>
                        {i < arr.length - 1 && <span className="text-muted-foreground/50">›</span>}
                      </span>
                    ))}
                  <Badge variant="secondary" className="ml-auto text-[10px]">{g.members.length} duplicates</Badge>
                </div>

                {/* Side-by-side duplicate cards */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.members.map((m, mi) => {
                    const tint = TINTS[mi % TINTS.length];
                    const hh = m.households?.length || 0;
                    const barPct = Math.round((hh / maxHh) * 100);
                    const submitter = m.user_id ? (names[m.user_id] || "Loading…") : "Unknown";
                    return (
                      <div
                        key={m.id}
                        className="relative flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm"
                        style={{ borderColor: `${tint}55` }}
                      >
                        <div className="flex items-center gap-2 px-3 py-2 text-white" style={{ background: tint }}>
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-[10px] font-bold">
                            {mi + 1}
                          </span>
                          <span className="text-[11px] font-semibold">Submission {mi + 1}</span>
                          <span className="ml-auto font-mono text-[10px] opacity-80">#{m.id.slice(0, 6)}</span>
                        </div>

                        <div className="flex flex-1 flex-col gap-2 p-3">
                          {/* Household count — the headline metric */}
                          <div className="flex items-end justify-between">
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Home className="h-3.5 w-3.5" /> Households recorded
                            </span>
                            <span className="text-2xl font-extrabold tabular-nums leading-none" style={{ color: tint }}>
                              {hh}
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: tint }} />
                          </div>

                          <div className="mt-1 space-y-1.5 text-[11px] text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <User2 className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate text-foreground">{submitter}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                              <span>{new Date(m.created_at).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Layers className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                Target {m.target_households ?? 0} · Completed {m.completed_households ?? 0}
                              </span>
                            </div>
                          </div>

                          {isOwnerLevel && (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="mt-auto h-8 w-full"
                              disabled={busyId === m.id}
                              onClick={() => setPending(m)}
                            >
                              {busyId === m.id ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              Delete this one
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <AlertDialog open={!!pending} onOpenChange={(v) => !v && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" /> Permanently delete this survey?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending && (
                <>
                  This will permanently remove the survey for{" "}
                  <span className="font-semibold text-foreground">{pending.community_name || "this community"}</span> with{" "}
                  <span className="font-semibold text-foreground">{pending.households?.length || 0} household(s)</span>{" "}
                  recorded. This action is audited and cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
