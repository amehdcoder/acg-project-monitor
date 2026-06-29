import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ShieldAlert,
  Trash2,
  Archive,
  RotateCcw,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * Owner-only submission deletion manager — drops onto any dashboard.
 * Supports per-row + bulk (date-range) actions, with Archive (restore later)
 * or Permanent delete. Visible only to the Owner / Co-owner.
 */
export interface OwnerSubmissionManagerProps {
  /** Underlying data source (must be whitelisted in owner_delete_records). */
  table: string;
  /** Friendly label for the dashboard / dataset. */
  title?: string;
  /** Columns used to render a readable row label. */
  labelColumns?: string[];
  /** Optional scoping filter applied to listing + bulk delete. */
  filter?: { column: string; value: string } | null;
  /** Optional callback after any successful mutation. */
  onChanged?: () => void;
  /** Compact trigger (icon only) for tight dashboard headers. */
  compact?: boolean;
  className?: string;
}

interface Row {
  id: string;
  created_at: string;
  [key: string]: any;
}

interface ArchivedRow {
  id: string;
  record_id: string;
  source_table: string;
  deleted_at: string;
  snapshot: Record<string, any>;
}

const getPathValue = (row: Record<string, any>, path: string) =>
  path.split(".").reduce<any>((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), row);

const formatRowLabel = (row: Row, labelColumns?: string[]) => {
  if (labelColumns && labelColumns.length) {
    const parts = labelColumns
      .map((c) => getPathValue(row, c))
      .filter((v) => v !== null && v !== undefined && v !== "");
    if (parts.length) return parts.join(" • ");
  }
  return `Record ${String(row.id).slice(0, 8)}`;
};

const readableError = (e: unknown) => {
  const message = (e as Error)?.message || "Unknown error";
  if (message.includes("does not exist")) return "The dashboard data fields changed. Refresh and try again.";
  return message;
};

const OwnerSubmissionManager = ({
  table,
  title = "submissions",
  labelColumns,
  filter,
  onChanged,
  compact,
  className,
}: OwnerSubmissionManagerProps) => {
  const { isOwnerLevel } = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [archived, setArchived] = useState<ArchivedRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"archive" | "permanent">("archive");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [pendingAction, setPendingAction] = useState<{ type: "ids"; ids: string[] } | { type: "bulk" } | null>(null);

  const selectColumns = useMemo(() => {
    const cols = new Set(["id", "created_at"]);
    for (const column of labelColumns || []) {
      const topLevel = column.split(".")[0];
      if (/^[a-z_][a-z0-9_]*$/.test(topLevel)) cols.add(topLevel);
    }
    return Array.from(cols).join(", ");
  }, [labelColumns]);

  const requestLabel = mode === "archive" ? "archive" : "delete";

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from(table as any).select(selectColumns).order("created_at", { ascending: false }).limit(200);
      if (filter?.column && filter?.value) q = q.eq(filter.column, filter.value);
      let { data, error } = await q;
      if (error && /column .* does not exist/i.test(error.message)) {
        let fallback = supabase.from(table as any).select("id, created_at").order("created_at", { ascending: false }).limit(200);
        if (filter?.column && filter?.value) fallback = fallback.eq(filter.column, filter.value);
        const retry = await fallback;
        data = retry.data;
        error = retry.error;
      }
      if (error) throw error;
      setRows((data as unknown as Row[]) || []);
      setSelected({});
    } catch (e) {
      toast.error(`Could not load ${title}: ${readableError(e)}`);
    } finally {
      setLoading(false);
    }
  }, [table, selectColumns, filter, title]);

  const loadArchived = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("owner_deleted_records" as any)
        .select("id, record_id, source_table, deleted_at, snapshot")
        .eq("source_table", table)
        .is("restored_at", null)
        .order("deleted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setArchived((data as unknown as ArchivedRow[]) || []);
    } catch {
      /* archive view is best-effort */
    }
  }, [table]);

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) {
      setConfirmText("");
      loadRows();
      loadArchived();
    }
  };

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  const requestDelete = (ids: string[]) => {
    if (!ids.length) return;
    if (mode === "permanent" && confirmText.trim().toUpperCase() !== "DELETE") {
      toast.error('Type "DELETE" to confirm permanent removal');
      return;
    }
    setPendingAction({ type: "ids", ids });
  };

  const runDelete = async (ids: string[]) => {
    setBusy(true);
    const toastId = toast.loading(`${mode === "archive" ? "Archiving" : "Deleting"} ${ids.length} ${title}…`);
    try {
      const { error } = await (supabase as any).rpc("owner_delete_records", {
        _table: table,
        _ids: ids,
        _archive: mode === "archive",
      });
      if (error) throw error;
      toast.success(mode === "archive" ? `Archived ${ids.length} ${title}` : `Deleted ${ids.length} ${title}`, { id: toastId });
      setConfirmText("");
      await loadRows();
      await loadArchived();
      onChanged?.();
    } catch (e) {
      toast.error(`Action failed: ${readableError(e)}`, { id: toastId });
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  };

  const requestBulkDelete = () => {
    if (mode === "permanent" && confirmText.trim().toUpperCase() !== "DELETE") {
      toast.error('Type "DELETE" to confirm permanent removal');
      return;
    }
    setPendingAction({ type: "bulk" });
  };

  const runBulkDelete = async () => {
    const fromIso = fromDate ? new Date(fromDate).toISOString() : null;
    const toIso = toDate ? new Date(`${toDate}T23:59:59`).toISOString() : null;
    setBusy(true);
    const toastId = toast.loading(
      `${mode === "archive" ? "Archiving" : "Deleting"} ${fromIso || toIso ? "matching" : "all"} ${title}…`,
    );
    try {
      const { data, error } = await (supabase as any).rpc("owner_bulk_delete_records", {
        _table: table,
        _from: fromIso,
        _to: toIso,
        _archive: mode === "archive",
        _filter_column: filter?.column ?? null,
        _filter_value: filter?.value ?? null,
      });
      if (error) throw error;
      const n = (data as any)?.deleted ?? 0;
      toast.success(mode === "archive" ? `Archived ${n} ${title}` : `Deleted ${n} ${title}`, { id: toastId });
      setConfirmText("");
      await loadRows();
      await loadArchived();
      onChanged?.();
    } catch (e) {
      toast.error(`Bulk action failed: ${readableError(e)}`, { id: toastId });
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  };

  const runRestore = async (recordIds: string[]) => {
    if (!recordIds.length) return;
    setBusy(true);
    const toastId = toast.loading(`Restoring ${recordIds.length} record(s)…`);
    try {
      const { error } = await (supabase as any).rpc("owner_restore_records", {
        _record_ids: recordIds,
      });
      if (error) throw error;
      toast.success(`Restored ${recordIds.length} record(s)`, { id: toastId });
      await loadRows();
      await loadArchived();
      onChanged?.();
    } catch (e) {
      toast.error(`Restore failed: ${readableError(e)}`, { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  if (!isOwnerLevel) return null;

  return (
    <>
      <Button
        variant="outline"
        size={compact ? "icon" : "sm"}
        onClick={() => handleOpen(true)}
        disabled={busy || loading}
        className={className}
        title="Owner data management"
      >
        {busy || loading ? <Loader2 className="h-4 w-4 animate-spin text-destructive" /> : <ShieldAlert className="h-4 w-4 text-destructive" />}
        {!compact && <span className="ml-2">{busy ? "Working…" : loading ? "Loading…" : "Manage Data"}</span>}
      </Button>

      <Dialog open={open} onOpenChange={(next) => !busy && handleOpen(next)}>
        <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Owner Data Management
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Archive or permanently delete {title}. Owner / Co-owner only.
            </DialogDescription>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "archive" ? "default" : "outline"}
              onClick={() => setMode("archive")}
              disabled={busy}
            >
              <Archive className="h-4 w-4 mr-1" /> Archive
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "permanent" ? "destructive" : "outline"}
              onClick={() => setMode("permanent")}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Permanent
            </Button>
            {filter?.value && (
              <Badge variant="secondary" className="ml-auto text-[10px]">
                scoped: {filter.column}
              </Badge>
            )}
          </div>

          {mode === "permanent" && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 space-y-2">
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> Permanent delete cannot be undone.
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder='Type "DELETE" to enable'
                className="h-8 text-sm"
              />
            </div>
          )}

          <Tabs defaultValue="records" className="mt-1">
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="records" className="text-xs">Records</TabsTrigger>
              <TabsTrigger value="bulk" className="text-xs">Bulk / Date</TabsTrigger>
              <TabsTrigger value="archived" className="text-xs">
                Archived{archived.length ? ` (${archived.length})` : ""}
              </TabsTrigger>
            </TabsList>

            {/* Per-row */}
            <TabsContent value="records" className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {selectedIds.length} selected · {rows.length} shown
                </span>
                <Button
                  size="sm"
                  variant={mode === "permanent" ? "destructive" : "default"}
                  disabled={busy || !selectedIds.length}
                  onClick={() => requestDelete(selectedIds)}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "archive" ? <Archive className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                  <span className="ml-1">{mode === "archive" ? "Archive selected" : "Delete selected"}</span>
                </Button>
              </div>
              <ScrollArea className="h-[40vh] rounded-md border">
                {loading ? (
                  <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : rows.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">No records found.</p>
                ) : (
                  <ul className="divide-y">
                    {rows.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 p-2.5">
                        <Checkbox
                          checked={!!selected[r.id]}
                          onCheckedChange={(c) =>
                            setSelected((s) => ({ ...s, [r.id]: !!c }))
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{formatRowLabel(r, labelColumns)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(r.created_at).toLocaleString()}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-destructive"
                          disabled={busy}
                          onClick={() => requestDelete([r.id])}
                          title={mode === "archive" ? "Archive" : "Delete"}
                        >
                          {mode === "archive" ? <Archive className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Bulk / date range */}
            <TabsContent value="bulk" className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">From date</Label>
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To date</Label>
                  <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave both blank to {mode === "archive" ? "archive" : "delete"} <strong>all</strong> {title}
                {filter?.value ? " in this scope" : ""}.
              </p>
              <Button
                className="w-full"
                variant={mode === "permanent" ? "destructive" : "default"}
                disabled={busy}
                onClick={requestBulkDelete}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : mode === "archive" ? <Archive className="h-4 w-4 mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                {mode === "archive" ? "Archive matching records" : "Permanently delete matching records"}
              </Button>
            </TabsContent>

            {/* Archived / restore */}
            <TabsContent value="archived" className="space-y-2">
              <ScrollArea className="h-[40vh] rounded-md border">
                {archived.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">No archived records.</p>
                ) : (
                  <ul className="divide-y">
                    {archived.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 p-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {formatRowLabel(a.snapshot as Row, labelColumns)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Archived {new Date(a.deleted_at).toLocaleString()}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          disabled={busy}
                          onClick={() => runRestore([a.id])}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
              {archived.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => runRestore(archived.map((a) => a.id))}
                >
                  <RotateCcw className="h-4 w-4 mr-1" /> Restore all
                </Button>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingAction} onOpenChange={(next) => !next && !busy && setPendingAction(null)}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{mode === "archive" ? "Archive submissions?" : "Permanently delete submissions?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === "ids"
                ? `${mode === "archive" ? "Archive" : "Delete"} ${pendingAction.ids.length} selected ${title}.`
                : `${mode === "archive" ? "Archive" : "Delete"} ${fromDate || toDate ? "matching" : "all"} ${title}${filter?.value ? " in this dashboard scope" : ""}.`}
              {mode === "archive" ? " Archived records can be restored from the Archived tab." : " This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className={mode === "permanent" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              onClick={(event) => {
                event.preventDefault();
                if (pendingAction?.type === "ids") void runDelete(pendingAction.ids);
                if (pendingAction?.type === "bulk") void runBulkDelete();
              }}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === "archive" ? <Archive className="mr-2 h-4 w-4" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {mode === "archive" ? "Archive" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default OwnerSubmissionManager;
