import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  FileEdit,
  Send,
  Eye,
  Trash2,
  Loader2,
  CheckCircle2,
  Circle,
  CloudUpload,
  FileText,
  Clock,
  AlertTriangle,
  CheckSquare,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import FormFiller from "@/components/FormFiller/FormFiller";
import SentFormViewer from "@/components/FormFiller/SentFormViewer";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import {
  listSavedEntries,
  deleteSavedEntries,
  setSavedEntryStatus,
  type SavedFormEntry,
  type SavedFormStatus,
} from "@/lib/savedForms";

export type SavedFormsMode = "edit" | "send" | "view" | "delete";

interface SavedFormsManagerProps {
  mode: SavedFormsMode;
  userId: string;
  projectId?: string | null;
  onClose: () => void;
}

const MODE_CONFIG: Record<
  SavedFormsMode,
  { title: string; subtitle: string; status: SavedFormStatus; icon: any; accent: string }
> = {
  edit: {
    title: "Edit Saved Forms",
    subtitle: "Continue and finalize your saved drafts",
    status: "draft",
    icon: FileEdit,
    accent: "#22A55A",
  },
  send: {
    title: "Send Finalized",
    subtitle: "Select forms and sync them to the server",
    status: "finalized",
    icon: Send,
    accent: "#23B5AE",
  },
  view: {
    title: "View Sent Forms",
    subtitle: "Forms that have been synced to the server",
    status: "sent",
    icon: Eye,
    accent: "#7C5CFF",
  },
  delete: {
    title: "Delete Saved",
    subtitle: "Permanently remove saved drafts from this device",
    status: "draft",
    icon: Trash2,
    accent: "#E25555",
  },
};

const countResponses = (e: SavedFormEntry) =>
  Object.entries(e.responses || {}).filter(
    ([k, v]) =>
      !k.startsWith("_") &&
      v !== undefined &&
      v !== null &&
      v !== "" &&
      !(Array.isArray(v) && v.length === 0),
  ).length;

const SavedFormsManager = ({ mode, userId, projectId, onClose }: SavedFormsManagerProps) => {
  const cfg = MODE_CONFIG[mode];
  const [entries, setEntries] = useState<SavedFormEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<SavedFormEntry | null>(null);
  const [viewing, setViewing] = useState<SavedFormEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { saveSubmission } = useOfflineStorage();

  const selectable = mode === "send" || mode === "delete";

  const load = async () => {
    setLoading(true);
    try {
      let rows = await listSavedEntries(userId, cfg.status);
      if (projectId) rows = rows.filter((r) => r.projectId === projectId);
      setEntries(rows);
      setSelected(new Set());
    } catch {
      toast({ title: "Could not load forms", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, userId, projectId]);

  const allSelected = entries.length > 0 && selected.size === entries.length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(entries.map((e) => e.id)));
  };

  const handleSync = async () => {
    const targets = entries.filter((e) => selected.has(e.id));
    if (targets.length === 0) return;
    setSyncing(true);
    let synced = 0;
    let failed = 0;
    try {
      for (const entry of targets) {
        try {
          const result = await saveSubmission(
            entry.formId,
            userId,
            entry.submissionData || entry.responses,
            entry.submissionLocation || null,
            entry.withinGeofence ?? null,
            entry.submissionType || "regular",
          );
          if (result.success) {
            await setSavedEntryStatus(entry.id, "sent", {
              submissionId: result.id,
              sentAt: new Date().toISOString(),
              offline: result.offline,
            });
            synced++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }
      if (synced > 0) {
        toast({
          title: "Sync Complete",
          description: `${synced} form${synced > 1 ? "s" : ""} sent. Find them under “View Sent Forms”.`,
        });
      }
      if (failed > 0) {
        toast({
          title: "Some forms failed",
          description: `${failed} form${failed > 1 ? "s" : ""} could not be sent. Please try again.`,
          variant: "destructive",
        });
      }
      await load();
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      await deleteSavedEntries(ids);
      toast({
        title: "Deleted Permanently",
        description: `${ids.length} saved form${ids.length > 1 ? "s" : ""} removed from this device.`,
      });
      setConfirmDelete(false);
      await load();
    } catch {
      toast({ title: "Delete Failed", variant: "destructive" });
    }
  };

  // Editing a draft inline — opens FormFiller in local workflow mode.
  if (editing) {
    return (
      <FormFiller
        formId={editing.formId}
        formName={editing.formName}
        formDescription={editing.formDescription || ""}
        questions={editing.questions}
        groups={editing.groups}
        geofence={editing.geofence || undefined}
        userId={userId}
        projectId={editing.projectId}
        requireLocation={editing.settings?.requireLocation}
        settings={editing.settings}
        localWorkflow
        savedEntry={editing}
        onClose={() => setEditing(null)}
        onSavedLocally={() => {
          setEditing(null);
          load();
        }}
      />
    );
  }

  const Icon = cfg.icon;

  return (
    <div className="flex min-h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 sticky top-0 z-20">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl text-white shrink-0"
          style={{ backgroundColor: cfg.accent }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-lg font-bold text-foreground leading-tight truncate">
            {cfg.title}
          </h1>
          <p className="text-xs text-muted-foreground truncate">{cfg.subtitle}</p>
        </div>
      </div>

      {/* Select all bar */}
      {selectable && entries.length > 0 && (
        <div className="flex items-center justify-between bg-card px-4 py-2 border-b border-border/60">
          <button
            onClick={toggleAll}
            className="inline-flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            {allSelected ? (
              <CheckSquare className="h-4 w-4" style={{ color: cfg.accent }} />
            ) : (
              <Square className="h-4 w-4 text-muted-foreground" />
            )}
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          <Badge variant="outline" className="text-xs">
            {selected.size} selected
          </Badge>
        </div>
      )}

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2.5 pb-32">
          {loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-xl bg-card border border-border/60 animate-pulse" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center px-6">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl mb-3"
                style={{ backgroundColor: `${cfg.accent}1a` }}
              >
                <Icon className="h-7 w-7" style={{ color: cfg.accent }} />
              </div>
              <h3 className="font-display text-base font-semibold text-foreground">
                {mode === "view" ? "No sent forms yet" : "Nothing here yet"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-xs">
                {mode === "edit" && "Forms you save as drafts will appear here for editing."}
                {mode === "send" && "Finalize a form to make it ready to send."}
                {mode === "view" && "Forms you sync to the server will appear here."}
                {mode === "delete" && "You have no saved drafts to delete."}
              </p>
            </div>
          ) : (
            entries.map((entry, idx) => {
              const isSel = selected.has(entry.id);
              const answered = countResponses(entry);
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(idx * 0.03, 0.3) }}
                  onClick={() => {
                    if (selectable) toggle(entry.id);
                    else if (mode === "edit") setEditing(entry);
                  }}
                  className={`group flex items-center gap-3 rounded-xl border bg-card p-3.5 shadow-sm transition-all ${
                    selectable && isSel
                      ? "border-2 ring-1"
                      : "border-border/60 hover:shadow-md"
                  } ${mode !== "view" ? "cursor-pointer" : ""}`}
                  style={
                    selectable && isSel
                      ? ({ borderColor: cfg.accent, ["--tw-ring-color" as any]: cfg.accent } as any)
                      : undefined
                  }
                >
                  {selectable && (
                    <div className="shrink-0">
                      {isSel ? (
                        <CheckCircle2 className="h-6 w-6" style={{ color: cfg.accent }} />
                      ) : (
                        <Circle className="h-6 w-6 text-muted-foreground/40" />
                      )}
                    </div>
                  )}
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-lg shrink-0"
                    style={{ backgroundColor: `${cfg.accent}1a` }}
                  >
                    <FileText className="h-5 w-5" style={{ color: cfg.accent }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm text-foreground truncate">
                      {entry.formName}
                    </h3>
                    <div className="mt-0.5 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(
                          new Date(entry.sentAt || entry.finalizedAt || entry.updatedAt),
                          { addSuffix: true },
                        )}
                      </span>
                      <span>·</span>
                      <span>{answered} answered</span>
                      {mode === "view" && entry.offline && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-400 text-amber-600">
                          queued
                        </Badge>
                      )}
                    </div>
                  </div>
                  {mode === "edit" && (
                    <FileEdit className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                  )}
                  {mode === "view" && (
                    <CheckCircle2 className="h-5 w-5 text-[#7C5CFF] shrink-0" />
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Floating action bar (Android-friendly, thumb reach, safe-area aware) */}
      {selectable && selected.size > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur px-4 pt-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {mode === "send" ? (
            <Button
              variant="acg"
              size="lg"
              className="w-full min-h-[54px] text-base font-semibold shadow-lg"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <CloudUpload className="mr-2 h-5 w-5" />
              )}
              {syncing
                ? "Syncing..."
                : `Sync to Server (${selected.size})`}
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="lg"
              className="w-full min-h-[54px] text-base font-semibold shadow-lg"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-2 h-5 w-5" />
              Delete {selected.size} Form{selected.size > 1 ? "s" : ""}
            </Button>
          )}
        </motion.div>
      )}

      {/* Permanent delete warning */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-2">
              You are about to delete{" "}
              <strong>
                {selected.size} saved form{selected.size > 1 ? "s" : ""}
              </strong>{" "}
              from this device. This action is{" "}
              <strong className="text-destructive">permanent</strong> — the data will be
              removed from the app's memory and{" "}
              <strong>cannot be recovered again</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SavedFormsManager;
