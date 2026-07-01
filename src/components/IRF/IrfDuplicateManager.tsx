import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Trash2, Archive, RotateCcw, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  projectId?: string | null;
  duplicateIds: Set<string>;
  onChanged: () => void | Promise<void>;
}

/** Owner-only removal of duplicate SARMAAN ACSM reports from the data source. */
export default function IrfDuplicateManager({ projectId, duplicateIds, onChanged }: Props) {
  const ids = Array.from(duplicateIds);
  const [busy, setBusy] = useState<string | null>(null);
  const [archived, setArchived] = useState<any[]>([]);
  const [showArchive, setShowArchive] = useState(false);

  const loadArchive = async () => {
    let q = supabase.from("irf_archived_reports").select("id, report_id, payload, reason, created_at").order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q.limit(500);
    setArchived(data || []);
  };

  useEffect(() => { if (showArchive) void loadArchive(); }, [showArchive]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={!ids.length || !!busy}>
                {busy === "archive" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Archive className="mr-1 h-4 w-4" />}
                Archive duplicates
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
                Delete permanently
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
