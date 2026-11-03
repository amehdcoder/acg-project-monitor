import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { MILESTONES } from "@/lib/eyeReport/milestones";
import { deleteSurveys } from "@/lib/eyeReport/surveyStore";
import type { SavedSurvey } from "@/lib/eyeReport/surveyEvidence";

export default function SurveyEvidenceManager({ rows, projectId, userId, onDeleted }: { rows: SavedSurvey[]; projectId: string; userId: string; onDeleted: (ids: string[]) => void }) {
  const [confirm, setConfirm] = useState<{ ids: string[] | null; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const remove = async () => {
    if (!confirm || busy) return;
    setBusy(true); setError("");
    try {
      const ids = await deleteSurveys(projectId, userId, confirm.ids);
      onDeleted(ids); setConfirm(null); toast.success(`${ids.length} survey ${ids.length === 1 ? "entry deleted" : "entries deleted"}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Survey deletion failed. Try again."); }
    finally { setBusy(false); }
  };
  return <>
    <Dialog><DialogTrigger asChild><Button variant="outline"><Trash2 className="mr-2 h-4 w-4" />Manage survey entries</Button></DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Saved WHO survey entries</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{rows.length} entries · All States and LGAs in this project</p><Button variant="destructive" disabled={!rows.length} onClick={() => { setError(""); setConfirm({ ids: null, label: "all saved survey entries in this project" }); }}><Trash2 className="mr-2 h-4 w-4" />Clear all saved evidence</Button></div>
        <div className="divide-y">{[...rows].sort((a,b) => b.date.localeCompare(a.date)).map(row => <div key={row.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="text-sm font-semibold">{MILESTONES.find(m => m.key === row.indicator)?.title}</p><p className="text-xs text-muted-foreground">{row.state} · {row.lga} · {row.date} · {Number(row.value).toFixed(2)}{row.indicator === "backlog" ? " people" : "%"}</p><p className="break-words text-xs text-muted-foreground">{row.source}</p></div><Button size="icon" variant="outline" aria-label={`Delete survey ${row.indicator} ${row.state} ${row.lga} ${row.date}`} title="Delete survey entry" onClick={() => { setError(""); setConfirm({ ids: [row.id], label: `${row.state} · ${row.lga} · ${row.date}` }); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>)}</div>
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!confirm} onOpenChange={open => { if (!open && !busy) setConfirm(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirm?.ids === null ? "Clear project survey evidence?" : "Delete survey entry?"}</AlertDialogTitle><AlertDialogDescription>This permanently deletes {confirm?.label} and recalculates scorecard progress. Daily Facility Reports and WG-SS screenings are not deleted.</AlertDialogDescription></AlertDialogHeader>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><Button variant="destructive" disabled={busy} onClick={() => void remove()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{busy ? "Deleting…" : "Confirm deletion"}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}