import { useState, useCallback } from "react";
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

const formatRowLabel = (row: Row, labelColumns?: string[]) => {
  if (labelColumns && labelColumns.length) {
    const parts = labelColumns
      .map((c) => row[c])
      .filter((v) => v !== null && v !== undefined && v !== "");
    if (parts.length) return parts.join(" • ");
  }
  return `Record ${String(row.id).slice(0, 8)}`;
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

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const cols = ["id", "created_at", ...(labelColumns || [])].join(", ");
      let q = supabase.from(table as any).select(cols).order("created_at", { ascending: false }).limit(200);
      if (filter?.column && filter?.value) q = q.eq(filter.column, filter.value);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data as unknown as Row[]) || []);
      setSelected({});
    } catch (e) {
      toast.error(`Could not load ${title}: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [table, labelColumns, filter, title]);

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

  const runDelete = async (ids: string[]) => {
    if (!ids.length) return;
    if (mode === "permanent" && confirmText.trim().toUpperCase() !== "DELETE") {
      toast.error('Type "DELETE" to confirm permanent removal');
      return;
    }
    if (
      !window.confirm(
        mode === "permanent"
          ? `Permanently delete ${ids.length} ${title}? This cannot be undone.`
          : `Archive ${ids.length} ${title}? You can restore them later.`,
      )
    )
      return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("owner_delete_records", {
        _table: table,
        _ids: ids,
        _archive: mode === "archive",
      });
      if (error) throw error;
      toast.success(mode === "archive" ? `Archived ${ids.length} ${title}` : `Deleted ${ids.length} ${title}`);
      setConfirmText("");
      await loadRows();
      await loadArchived();
      onChanged?.();
    } catch (e) {
      toast.error(`Action failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const runBulkDelete = async () => {
    if (mode === "permanent" && confirmText.trim().toUpperCase() !== "DELETE") {
      toast.error('Type "DELETE" to confirm permanent removal');
      return;
    }
    const fromIso = fromDate ? new Date(fromDate).toISOString() : null;
    const toIso = toDate ? new Date(`${toDate}T23:59:59`).toISOString() : null;
    if (
      !window.confirm(
        `${mode === "permanent" ? "Permanently delete" : "Archive"} all ${title}` +
          `${fromIso || toIso ? " in the selected date range" : " (ALL records)"}? ` +
          (mode === "permanent" ? "This cannot be undone." : "You can restore them later."),
      )
    )
      return;
    setBusy(true);
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
      toast.success(mode === "archive" ? `Archived ${n} ${title}` : `Deleted ${n} ${title}`);
      setConfirmText("");
      await loadRows();
      await loadArchived();
      onChanged?.();
    } catch (e) {
      toast.error(`Bulk action failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const runRestore = async (recordIds: string[]) => {
    if (!recordIds.length) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("owner_restore_records", {
        _record_ids: recordIds,
      });
      if (error) throw error;
      toast.success(`Restored ${recordIds.length} record(s)`);
      await loadRows();
      await loadArchived();
      onChanged?.();
    } catch (e) {
      toast.error(`Restore failed: ${(e as Error).message}`);
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
        className={className}
        title="Owner data management"
      >
        <ShieldAlert className="h-4 w-4 text-destructive" />
        {!compact && <span className="ml-2">Manage Data</span>}
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
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
            >
              <Archive className="h-4 w-4 mr-1" /> Archive
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "permanent" ? "destructive" : "outline"}
              onClick={() => setMode("permanent")}
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
                  onClick={() => runDelete(selectedIds)}
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
                          onClick={() => runDelete([r.id])}
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
                onClick={runBulkDelete}
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
    </>
  );
};

export default OwnerSubmissionManager;
