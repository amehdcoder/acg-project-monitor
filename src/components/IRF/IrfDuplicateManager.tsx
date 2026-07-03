import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Copy, Trash2, Archive, RotateCcw, Loader2, ShieldAlert, GitCompare,
  Check, Star, ArrowRightLeft, MapPin, Calendar, User, CheckCheck, ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { flagDuplicates, irfSignature, irfOrder } from "@/lib/acsm/irfBridge";
import { IRF_METRIC_FIELDS, type IrfReport } from "@/lib/irf/definition";
import { normalizeIrfRows } from "@/lib/irf/normalize";
import { useAcsmDuplicateOverrides } from "@/hooks/useAcsmDuplicateOverrides";

interface Props {
  projectId?: string | null;
  duplicateIds: Set<string>;
  onChanged: () => void | Promise<void>;
}

const fmtWhen = (s?: string | null) => (s ? new Date(s).toLocaleString() : "—");
const period = (r: any) => String(r?.reporting_month || r?.reporting_period || "").slice(0, 7) || "—";
const who = (r: any) => r?.focal_person_name || r?.created_by_name || r?.created_by || "—";

/** Compare fields shown in the side-by-side preview (geography + key metrics). */
const COMPARE_FIELDS: { key: string; label: string }[] = [
  { key: "state", label: "State" },
  { key: "lga", label: "LGA" },
  { key: "ward", label: "Ward" },
  ...IRF_METRIC_FIELDS.slice(0, 14).map((f) => ({ key: f.key, label: f.label })),
];

/** Owner-only removal + professional compare/review of duplicate SARMAAN ACSM reports. */
export default function IrfDuplicateManager({ projectId, duplicateIds, onChanged }: Props) {
  const ids = Array.from(duplicateIds);
  const [busy, setBusy] = useState<string | null>(null);
  const [archived, setArchived] = useState<any[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [rows, setRows] = useState<IrfReport[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { irfMap, setOverride, clearOverride } = useAcsmDuplicateOverrides(projectId);

  const loadArchive = async () => {
    let q = supabase.from("irf_archived_reports").select("id, report_id, payload, reason, created_at").order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q.limit(500);
    setArchived(data || []);
  };

  const loadRows = async () => {
    setLoadingRows(true);
    try {
      let q = supabase.from("irf_reports" as any).select("*");
      if (projectId) q = q.eq("project_id", projectId);
      const { data } = await q.limit(4000);
      setRows(normalizeIrfRows((data as any) || []));
    } finally { setLoadingRows(false); }
  };

  useEffect(() => { if (showArchive) void loadArchive(); }, [showArchive]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (showReview) void loadRows(); }, [showReview]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group duplicate sets (one authoritative original + its duplicates).
  const groups = useMemo(() => {
    const res = flagDuplicates(rows, irfSignature, (r) => r.id, irfOrder);
    const out: { key: string; items: (IrfReport & { __isOriginal: boolean; __isDup: boolean })[] }[] = [];
    res.groups.forEach((groupRows, sig) => {
      if (groupRows.length < 2) return;
      out.push({
        key: sig,
        items: groupRows.map((r, i) => ({
          ...r,
          __isOriginal: i === 0,
          __isDup: res.duplicateIds.has(r.id),
        })),
      });
    });
    return out.sort((a, b) => (a.items[0]?.lga || "").localeCompare(b.items[0]?.lga || ""));
  }, [rows]);

  // Every flagged-duplicate row (the actionable candidates, excluding originals).
  const dupItems = useMemo(
    () => groups.flatMap((g) => g.items.filter((it) => it.__isDup)),
    [groups],
  );
  const dupItemIds = useMemo(() => dupItems.map((it) => it.id), [dupItems]);

  // Keep the selection valid whenever the underlying duplicate set changes.
  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set(dupItemIds);
      const next = new Set<string>();
      prev.forEach((id) => { if (valid.has(id)) next.add(id); });
      return next;
    });
  }, [dupItemIds]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleGroup = (groupDupIds: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      groupDupIds.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const allSelected = dupItemIds.length > 0 && dupItemIds.every((id) => selected.has(id));
  const selectAll = () => setSelected(allSelected ? new Set() : new Set(dupItemIds));

  const acceptSelected = async () => {
    const items = dupItems.filter((it) => selected.has(it.id) && irfMap.get(it.id) !== "unique");
    if (!items.length) { toast.info("Nothing new to accept in the selection."); return; }
    setBusy("batch-accept");
    try {
      for (const it of items) {
        await setOverride({ sourceTable: "irf_reports", submissionId: it.id, decision: "unique", signature: irfSignature(it) });
      }
      toast.success(`${items.length} submission(s) accepted as unique — counts recomputed everywhere.`);
      setSelected(new Set());
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Could not accept selected submissions.");
    } finally { setBusy(null); }
  };

  const removeSelected = async () => {
    const idsToRemove = dupItemIds.filter((id) => selected.has(id));
    if (!idsToRemove.length) return;
    if (!window.confirm(`Permanently remove ${idsToRemove.length} selected duplicate submission(s) from the database and every dashboard computation? This cannot be undone.`)) return;
    setBusy("batch-delete");
    try {
      const { error } = await supabase.rpc("owner_delete_irf_duplicates" as any, { _ids: idsToRemove });
      if (error) throw error;
      toast.success(`${idsToRemove.length} duplicate(s) permanently removed.`);
      setRows((prev) => prev.filter((r) => !idsToRemove.includes(r.id)));
      setSelected(new Set());
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Could not remove selected submissions.");
    } finally { setBusy(null); }
  };


  const run = async (mode: "archive" | "delete") => {
    if (!ids.length) return;
    setBusy(mode);
    try {
      const rpc = mode === "archive" ? "owner_archive_irf_duplicates" : "owner_delete_irf_duplicates";
      const args: any = mode === "archive" ? { _ids: ids, _reason: "duplicate" } : { _ids: ids };
      const { data, error } = await supabase.rpc(rpc as any, args);
      if (error) throw error;
      toast.success(`${data ?? ids.length} duplicate report(s) ${mode === "archive" ? "archived" : "permanently deleted"}.`);
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message || `Could not ${mode} duplicates.`);
    } finally { setBusy(null); }
  };

  const deleteOne = async (id: string) => {
    if (!window.confirm("Permanently remove this duplicate submission from the database and every dashboard computation? This cannot be undone.")) return;
    setBusy(id);
    try {
      const { error } = await supabase.rpc("owner_delete_irf_duplicates" as any, { _ids: [id] });
      if (error) throw error;
      toast.success("Duplicate permanently removed.");
      setRows((prev) => prev.filter((r) => r.id !== id));
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Could not remove submission.");
    } finally { setBusy(null); }
  };

  const acceptUnique = async (r: IrfReport & { __isDup: boolean }) => {
    setBusy(r.id);
    try {
      await setOverride({ sourceTable: "irf_reports", submissionId: r.id, decision: "unique", signature: irfSignature(r) });
      toast.success("Accepted as unique — counts recomputed across all dashboards.");
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Could not accept submission.");
    } finally { setBusy(null); }
  };

  const resetDecision = async (id: string) => {
    setBusy(id);
    try {
      await clearOverride("irf_reports", id);
      toast.success("Reverted to automatic detection.");
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Could not reset decision.");
    } finally { setBusy(null); }
  };

  const restore = async (archiveId: string) => {
    setBusy(archiveId);
    try {
      const { error } = await supabase.rpc("owner_restore_irf_report" as any, { _archive_id: archiveId });
      if (error) throw error;
      toast.success("Report restored.");
      await loadArchive();
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Could not restore report.");
    } finally { setBusy(null); }
  };

  return (
    <Card className="border-amber-300 bg-amber-50/60 p-4 dark:border-amber-500/40 dark:bg-amber-500/5">
      <div className="flex flex-wrap items-center gap-2">
        <Copy className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Owner duplicate control
        </span>
        <span className="text-xs text-muted-foreground">
          {ids.length} duplicate report(s) currently flagged
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {/* Preview & compare individual duplicates */}
          <Dialog open={showReview} onOpenChange={setShowReview}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-amber-600 text-white hover:bg-amber-700" disabled={!ids.length}>
                <GitCompare className="mr-1 h-4 w-4" /> Review & compare
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-amber-600" /> Duplicate review & comparison
                </DialogTitle>
                <DialogDescription>
                  Preview each duplicate set side-by-side. The <Star className="inline h-3 w-3 text-amber-500" /> row is the
                  authoritative original. Accept a flagged record as unique, or permanently remove it from the database
                  and every dashboard computation.
                </DialogDescription>
              </DialogHeader>

              {/* Status summary + batch action bar */}
              {!loadingRows && groups.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2">
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Copy className="h-3 w-3" /> {groups.length} set{groups.length === 1 ? "" : "s"}
                  </Badge>
                  <Badge variant="outline" className="gap-1 text-xs text-amber-600">
                    {dupItemIds.filter((id) => irfMap.get(id) !== "unique").length} pending
                  </Badge>
                  <Badge variant="outline" className="gap-1 text-xs text-emerald-600">
                    <Check className="h-3 w-3" /> {dupItemIds.filter((id) => irfMap.get(id) === "unique").length} accepted
                  </Badge>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={selectAll} disabled={!dupItemIds.length}>
                    <ListChecks className="h-3.5 w-3.5" /> {allSelected ? "Clear all" : "Select all"}
                  </Button>
                  <span className="text-xs font-medium text-muted-foreground">{selected.size} selected</span>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-emerald-700"
                      disabled={!selected.size || !!busy} onClick={acceptSelected}>
                      {busy === "batch-accept" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                      Accept selected
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 gap-1 text-xs"
                      disabled={!selected.size || !!busy} onClick={removeSelected}>
                      {busy === "batch-delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Remove selected
                    </Button>
                  </div>
                </div>
              )}

              <ScrollArea className="max-h-[62vh] pr-3">

                {loadingRows ? (
                  <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading submissions…
                  </div>
                ) : groups.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    <Copy className="mx-auto mb-2 h-6 w-6 opacity-50" />
                    No duplicate sets to compare. Unique counts are clean.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {groups.map((g) => {
                      const original = g.items[0];
                      const groupDupIds = g.items.filter((it) => it.__isDup).map((it) => it.id);
                      const groupAllSel = groupDupIds.length > 0 && groupDupIds.every((id) => selected.has(id));
                      return (
                        <div key={g.key} className="overflow-hidden rounded-xl border">
                          <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">
                            <Checkbox checked={groupAllSel}
                              onCheckedChange={(v) => toggleGroup(groupDupIds, !!v)}
                              aria-label="Select all duplicates in this set" />
                            <Badge variant="outline" className="gap-1">
                              <Copy className="h-3 w-3" /> {g.items.length} in set
                            </Badge>
                            <span className="truncate text-sm font-semibold">
                              {original.lga || "Unspecified LGA"}{original.ward ? ` — ${original.ward}` : ""}
                            </span>
                            <span className="ml-auto text-xs text-muted-foreground">{period(original)}</span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[560px] text-xs">
                              <thead>
                                <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                                  <th className="px-3 py-2 font-semibold">Field</th>
                                  {g.items.map((it) => {
                                    const decision = irfMap.get(it.id);
                                    return (
                                      <th key={it.id} className="px-3 py-2 font-semibold align-top">
                                        <span className="flex items-center gap-1.5">
                                          {it.__isDup && (
                                            <Checkbox checked={selected.has(it.id)}
                                              onCheckedChange={() => toggle(it.id)}
                                              aria-label="Select this duplicate" />
                                          )}
                                          {it.__isOriginal && <Star className="h-3 w-3 text-amber-500" />}
                                          {it.__isOriginal ? "Original" : "Duplicate"}
                                        </span>
                                        <span className="mt-1 block">
                                          {it.__isOriginal ? (
                                            <Badge variant="outline" className="text-[9px] text-emerald-600">Kept</Badge>
                                          ) : decision === "unique" ? (
                                            <Badge className="bg-emerald-600 text-[9px] hover:bg-emerald-600">Accepted unique</Badge>
                                          ) : (
                                            <Badge variant="outline" className="text-[9px] text-amber-600">Pending review</Badge>
                                          )}
                                        </span>
                                      </th>
                                    );
                                  })}
                                </tr>

                              </thead>
                              <tbody>
                                <tr className="border-b">
                                  <td className="px-3 py-1.5 font-medium text-muted-foreground"><User className="mr-1 inline h-3 w-3" />Submitter</td>
                                  {g.items.map((it) => <td key={it.id} className="px-3 py-1.5">{who(it)}</td>)}
                                </tr>
                                <tr className="border-b">
                                  <td className="px-3 py-1.5 font-medium text-muted-foreground"><Calendar className="mr-1 inline h-3 w-3" />Submitted</td>
                                  {g.items.map((it) => <td key={it.id} className="px-3 py-1.5">{fmtWhen(it.created_at)}</td>)}
                                </tr>
                                {COMPARE_FIELDS.map((f) => {
                                  const vals = g.items.map((it) => (it as any)[f.key]);
                                  const differs = vals.some((v) => String(v ?? "") !== String(vals[0] ?? ""));
                                  if (vals.every((v) => v == null || v === "" || v === 0)) return null;
                                  return (
                                    <tr key={f.key} className={`border-b ${differs ? "bg-amber-50 dark:bg-amber-500/10" : ""}`}>
                                      <td className="px-3 py-1.5 font-medium text-muted-foreground">
                                        {f.key === "state" || f.key === "lga" || f.key === "ward" ? <MapPin className="mr-1 inline h-3 w-3" /> : null}
                                        {f.label}{differs && <span title="Values differ" className="ml-1 text-amber-600">•</span>}
                                      </td>
                                      {g.items.map((it) => (
                                        <td key={it.id} className={`px-3 py-1.5 ${differs ? "font-semibold" : ""}`}>
                                          {String((it as any)[f.key] ?? "—")}
                                        </td>
                                      ))}
                                    </tr>
                                  );
                                })}
                                <tr>
                                  <td className="px-3 py-2 font-medium text-muted-foreground">Actions</td>
                                  {g.items.map((it) => {
                                    const decision = irfMap.get(it.id);
                                    return (
                                      <td key={it.id} className="px-3 py-2">
                                        {it.__isOriginal && !decision ? (
                                          <Badge variant="outline" className="text-emerald-600">Kept</Badge>
                                        ) : (
                                          <div className="flex flex-wrap items-center gap-1">
                                            {decision === "unique" && <Badge className="bg-emerald-600 hover:bg-emerald-600">Unique</Badge>}
                                            {decision !== "unique" && (
                                              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                                                disabled={busy === it.id} onClick={() => acceptUnique(it)}>
                                                {busy === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Accept
                                              </Button>
                                            )}
                                            {decision && (
                                              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                                                disabled={busy === it.id} onClick={() => resetDecision(it.id)}>
                                                <RotateCcw className="h-3 w-3" /> Reset
                                              </Button>
                                            )}
                                            <Button size="sm" variant="destructive" className="h-7 gap-1 text-xs"
                                              disabled={busy === it.id} onClick={() => deleteOne(it.id)}>
                                              <Trash2 className="h-3 w-3" /> Remove
                                            </Button>
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={!ids.length || !!busy}>
                {busy === "archive" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Archive className="mr-1 h-4 w-4" />}
                Archive all
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive {ids.length} duplicate report(s)?</AlertDialogTitle>
                <AlertDialogDescription>
                  Flagged duplicates are moved to an archive and removed from the dashboard.
                  You can restore them at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => run("archive")}>Archive</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={!ids.length || !!busy}>
                {busy === "delete" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                Delete all
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                  <ShieldAlert className="h-5 w-5" /> Permanently delete {ids.length} report(s)?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the flagged duplicate reports from the database.
                  This action cannot be undone. Consider archiving instead.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => run("delete")}>
                  Delete permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Dialog open={showArchive} onOpenChange={setShowArchive}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost"><RotateCcw className="mr-1 h-4 w-4" /> Archive</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Archived duplicate reports</DialogTitle></DialogHeader>
              <ScrollArea className="max-h-[60vh] pr-3">
                {archived.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No archived reports.</p>
                ) : (
                  <div className="space-y-1.5">
                    {archived.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                        <div className="min-w-0 text-xs">
                          <p className="truncate font-medium">
                            {a.payload?.lga || "—"} · {a.payload?.form_category || "report"}
                          </p>
                          <p className="text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                        </div>
                        <Button size="sm" variant="outline" disabled={busy === a.id} onClick={() => restore(a.id)}>
                          {busy === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1 h-4 w-4" />} Restore
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </Card>
  );
}
