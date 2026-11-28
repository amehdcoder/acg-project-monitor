import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, FileText, Loader2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { deleteDownloadedForms } from "@/lib/offlineFormCache";
import { listDeletableSavedForms, deleteSelectedSavedForms, type DeletableSavedForm } from "@/lib/localFormDeletion";
import type { OfflineForm } from "@/hooks/useOfflineForms";

interface Props {
  userId: string;
  offlineForms: OfflineForm[];
  projects: { id: string; name: string }[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}
const statusLabel = { draft: "Draft", finalized: "Ready to send", sent: "Sent" };

export default function FormDeletionScreen({ userId, offlineForms, projects, onClose, onRefresh }: Props) {
  const [tab, setTab] = useState("saved");
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState<DeletableSavedForm[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const names = Object.fromEntries(offlineForms.map(form => [form.id, form.name]));
      const rows = await listDeletableSavedForms(userId, names);
      if (active.current) setSaved(rows);
    } catch { if (active.current) setError("Saved forms could not be loaded. Please try again."); }
    finally { if (active.current) setLoading(false); }
  }, [userId, offlineForms]);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => tab === "blank" ? offlineForms.map(form => ({ id: form.id, name: form.name, formName: form.name, date: form.downloaded_at, projectId: form.project_id, status: "blank", busy: false })) : saved, [tab, offlineForms, saved]);
  const filtered = rows.filter(row => !search.trim() || `${row.name} ${row.formName} ${projects.find(project => project.id === row.projectId)?.name || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const selectable = filtered.filter(row => !row.busy);
  const allSelected = selectable.length > 0 && selectable.every(row => selected.has(row.id));
  const chosen = rows.filter(row => selected.has(row.id));
  const unsent = chosen.filter(row => row.status === "draft" || row.status === "finalized").length;
  const toggle = (id: string, checked: boolean) => setSelected(previous => { const next = new Set(previous); checked ? next.add(id) : next.delete(id); return next; });
  const remove = async () => {
    if (deleting || !chosen.length || !active.current) return;
    setDeleting(true);
    try {
      const result = tab === "blank"
        ? { deleted: await deleteDownloadedForms(userId, chosen.map(row => row.id), () => active.current), failed: 0 }
        : await deleteSelectedSavedForms(userId, chosen.map(row => row.id), () => active.current);
      if (!active.current) return;
      setSelected(new Set()); setConfirm(false);
      toast({ title: result.failed ? "Some forms could not be deleted" : "Forms deleted", description: `${result.deleted} form${result.deleted === 1 ? "" : "s"} removed from this device.${result.failed ? ` ${result.failed} retained; wait for sending to finish and try again.` : ""}`, variant: result.failed ? "destructive" : "default" });
      await onRefresh(); await load();
    } catch (cause) {
      if (active.current) toast({ title: "Delete failed", description: cause instanceof Error ? cause.message : "Your forms have been kept. Please try again.", variant: "destructive" });
    } finally { if (active.current) setDeleting(false); }
  };

  return createPortal(
    <section aria-label="Delete form" className="fixed inset-0 z-[1100] flex h-[100dvh] min-h-0 flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" className="h-12 w-12 shrink-0" onClick={onClose} disabled={deleting} aria-label="Back to Forms"><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-semibold">Delete form</h1>
        <Trash2 className="ml-auto h-5 w-5 text-muted-foreground" />
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
        <Tabs value={tab} onValueChange={value => { setTab(value); setSelected(new Set()); setSearch(""); }} className="shrink-0">
          <TabsList className="grid h-14 w-full grid-cols-2 !rounded-none border-b !bg-background !p-0">
            <TabsTrigger value="saved" disabled={deleting} className="h-full gap-2 !rounded-none border-b-2 border-transparent !shadow-none data-[state=inactive]:border-transparent data-[state=active]:border-primary">Saved Forms <span className="text-xs">({saved.length})</span></TabsTrigger>
            <TabsTrigger value="blank" disabled={deleting} className="h-full gap-2 !rounded-none border-b-2 border-transparent !shadow-none data-[state=inactive]:border-transparent data-[state=active]:border-primary">Blank Forms <span className="text-xs">({offlineForms.length})</span></TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="shrink-0 border-b px-4 py-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search forms to delete" placeholder="Search forms" value={search} disabled={deleting} onChange={event => setSearch(event.target.value)} className="h-12 pl-9" /></div>
        </div>
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
          <label className="flex min-h-[52px] cursor-pointer items-center gap-3 text-sm font-medium"><Checkbox aria-label="Select all forms" checked={allSelected} disabled={deleting || loading || !selectable.length} className="!h-5 !min-h-5 !w-5 !basis-5" onCheckedChange={() => setSelected(previous => { const next = new Set(previous); selectable.forEach(row => allSelected ? next.delete(row.id) : next.add(row.id)); return next; })} />Select All</label>
          <span className="text-sm text-muted-foreground">{chosen.length} selected</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-busy={loading}>
          {loading ? <div className="flex justify-center p-12"><Loader2 aria-label="Loading forms" className="h-6 w-6 animate-spin text-muted-foreground" /></div> : error ? <div className="p-8 text-center"><p className="text-sm text-destructive">{error}</p><Button variant="outline" className="mt-4" onClick={() => void load()}>Try again</Button></div> : filtered.length === 0 ? <div className="flex flex-col items-center gap-3 px-6 py-16 text-center"><FileText className="h-10 w-10 text-muted-foreground" /><h2 className="font-semibold">{search ? "No matching forms" : tab === "blank" ? "No downloaded blank forms" : "No saved forms"}</h2></div> : filtered.map(row => {
            const project = projects.find(item => item.id === row.projectId)?.name;
            const date = new Date(row.date);
            return <label key={row.id} className={`flex min-h-[84px] cursor-pointer items-center gap-4 border-b px-4 py-4 ${selected.has(row.id) ? "bg-primary/5" : "hover:bg-muted/40"} ${row.busy ? "opacity-60" : ""}`}>
              <Checkbox aria-label={`Select ${row.name}`} checked={selected.has(row.id)} disabled={deleting || row.busy} onCheckedChange={checked => toggle(row.id, checked === true)} className="!h-5 !min-h-5 !w-5 !basis-5 shrink-0" />
              <div className="min-w-0 flex-1"><p className="break-words text-base font-medium">{row.name}</p>{row.formName !== row.name && <p className="mt-1 break-words text-sm text-muted-foreground">{row.formName}</p>}<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">{project && <span className="break-words">{project}</span>}{!Number.isNaN(date.getTime()) && <time dateTime={row.date}>{date.toLocaleString()}</time>}</div><Badge variant="outline" className="mt-2">{row.busy ? "Sending…" : row.status === "blank" ? "Downloaded" : statusLabel[row.status as keyof typeof statusLabel]}</Badge></div>
            </label>;
          })}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          <span className="text-sm text-muted-foreground">{rows.length} {tab === "blank" ? "blank" : "saved"} form{rows.length === 1 ? "" : "s"}</span>
          <Button variant="destructive" className="h-12 max-w-full gap-2" disabled={loading || deleting || !chosen.length} onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" />Delete Selected ({chosen.length})</Button>
        </footer>
      </div>
      <AlertDialog open={confirm} onOpenChange={open => { if (!deleting) setConfirm(open); }}>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader><AlertDialogTitle>Delete {chosen.length} {tab === "blank" ? "blank" : "saved"} form{chosen.length === 1 ? "" : "s"}?</AlertDialogTitle><AlertDialogDescription>{tab === "blank" ? "Only the downloaded blank forms will be removed from this device. Saved submissions will be kept. You can download the blank forms again when online." : `The selected saved forms will be permanently removed from this device.${unsent ? ` ${unsent} ${unsent === 1 ? "form has" : "forms have"} not been sent; those answers will be lost and will not be sent later.` : ""} Forms already received by the server will not be deleted.`}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel><Button variant="destructive" disabled={deleting} onClick={() => void remove()}>{deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Delete Forms</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>, document.body,
  );
}