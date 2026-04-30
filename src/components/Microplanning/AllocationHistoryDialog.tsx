import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  History, Plus, Pencil, Trash2, CheckCircle2, Download, Search,
  FileSpreadsheet, FileText, RotateCcw,
} from "lucide-react";
import * as XLSX from "xlsx";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

interface HistoryRow {
  id: string;
  state: string | null;
  lga: string;
  year: number | null;
  campaign_type: string | null;
  medicine_name: string | null;
  old_amount: number | null;
  new_amount: number | null;
  action: "create" | "update" | "delete" | string;
  changed_by: string;
  changed_at: string;
  reviewed?: boolean;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

const AllocationHistoryDialog = ({ open, onClose, projectId }: Props) => {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState("all");
  const [filterLga, setFilterLga] = useState("all");
  const [filterAction, setFilterAction] = useState("all");
  const [filterReviewed, setFilterReviewed] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState<HistoryRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("microplan_allocation_history")
      .select("*")
      .eq("project_id", projectId)
      .order("changed_at", { ascending: false })
      .limit(500);
    if (error) {
      toast({ title: "Failed to load history", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const list = (data as HistoryRow[]) || [];
    setRows(list);
    const ids = [...new Set(list.flatMap(r => [r.changed_by, r.reviewed_by].filter(Boolean) as string[]))];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", ids);
      const m = new Map<string, string>();
      (profs || []).forEach((p: any) =>
        m.set(p.user_id, `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email)
      );
      setUsers(m);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!open || !projectId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const states = useMemo(
    () => [...new Set(rows.map(r => r.state).filter(Boolean) as string[])].sort(),
    [rows]
  );
  const lgas = useMemo(() => {
    const base = filterState !== "all" ? rows.filter(r => r.state === filterState) : rows;
    return [...new Set(base.map(r => r.lga))].sort();
  }, [rows, filterState]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filterState !== "all" && r.state !== filterState) return false;
      if (filterLga !== "all" && r.lga !== filterLga) return false;
      if (filterAction !== "all" && r.action !== filterAction) return false;
      if (filterReviewed === "yes" && !r.reviewed) return false;
      if (filterReviewed === "no" && r.reviewed) return false;
      if (q) {
        const hay = `${r.lga} ${r.state || ""} ${r.medicine_name || ""} ${r.campaign_type || ""} ${users.get(r.changed_by) || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, filterState, filterLga, filterAction, filterReviewed, users]);

  const totals = useMemo(() => {
    const created = filtered.filter(r => r.action === "create").length;
    const updated = filtered.filter(r => r.action === "update").length;
    const deleted = filtered.filter(r => r.action === "delete").length;
    const reviewed = filtered.filter(r => r.reviewed).length;
    return { created, updated, deleted, reviewed, total: filtered.length };
  }, [filtered]);

  const actionMeta: Record<string, { icon: any; cls: string; label: string }> = {
    create: { icon: Plus, cls: "bg-emerald-100 text-emerald-700 border-emerald-300", label: "Created" },
    update: { icon: Pencil, cls: "bg-amber-100 text-amber-700 border-amber-300", label: "Updated" },
    delete: { icon: Trash2, cls: "bg-red-100 text-red-700 border-red-300", label: "Deleted" },
  };

  const toggleReviewed = async (r: HistoryRow) => {
    setBusyId(r.id);
    const next = !r.reviewed;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("microplan_allocation_history" as any)
      .update({
        reviewed: next,
        reviewed_by: next ? user?.id ?? null : null,
        reviewed_at: next ? new Date().toISOString() : null,
      })
      .eq("id", r.id);
    setBusyId(null);
    if (error) {
      toast({ title: "Failed to update review", description: error.message, variant: "destructive" });
      return;
    }
    setRows(prev => prev.map(x => x.id === r.id
      ? { ...x, reviewed: next, reviewed_by: next ? user?.id ?? null : null, reviewed_at: next ? new Date().toISOString() : null }
      : x));
    toast({ title: next ? "Marked as reviewed" : "Review removed" });
  };

  const deleteRow = async (r: HistoryRow) => {
    setBusyId(r.id);
    const { error } = await supabase
      .from("microplan_allocation_history")
      .delete()
      .eq("id", r.id);
    setBusyId(null);
    setConfirmDelete(null);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setRows(prev => prev.filter(x => x.id !== r.id));
    toast({ title: "🗑️ History entry deleted" });
  };

  const buildExportRows = () =>
    filtered.map(r => {
      const delta = r.old_amount != null && r.new_amount != null ? r.new_amount - r.old_amount : null;
      return {
        Date: new Date(r.changed_at).toLocaleString(),
        State: r.state || "",
        LGA: r.lga,
        Year: r.year ?? "",
        "Campaign Type": r.campaign_type || "",
        Medicine: r.medicine_name || "",
        Action: r.action,
        "Old Amount": r.old_amount ?? "",
        "New Amount": r.new_amount ?? "",
        Delta: delta ?? "",
        "Changed By": users.get(r.changed_by) || r.changed_by,
        Reviewed: r.reviewed ? "Yes" : "No",
        "Reviewed By": r.reviewed_by ? (users.get(r.reviewed_by) || r.reviewed_by) : "",
        "Reviewed At": r.reviewed_at ? new Date(r.reviewed_at).toLocaleString() : "",
      };
    });

  const exportExcel = () => {
    const data = buildExportRows();
    if (data.length === 0) {
      toast({ title: "Nothing to export", variant: "destructive" });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Allocation History");
    XLSX.writeFile(wb, `Medicine_Allocation_History_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast({ title: "Exported", description: `${data.length} rows downloaded.` });
  };

  const exportCSV = () => {
    const data = buildExportRows();
    if (data.length === 0) {
      toast({ title: "Nothing to export", variant: "destructive" });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Medicine_Allocation_History_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${data.length} rows downloaded.` });
  };

  const resetFilters = () => {
    setSearch(""); setFilterState("all"); setFilterLga("all");
    setFilterAction("all"); setFilterReviewed("all");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Medicine Allocation History — by LGA
            </DialogTitle>
          </DialogHeader>

          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div className="border border-border rounded-md p-2 bg-muted/20">
              <p className="text-[10px] text-muted-foreground">Total</p>
              <p className="text-lg font-bold tabular-nums">{totals.total}</p>
            </div>
            <div className="border border-border rounded-md p-2 bg-emerald-50 dark:bg-emerald-950/20">
              <p className="text-[10px] text-emerald-700 dark:text-emerald-400">Created</p>
              <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{totals.created}</p>
            </div>
            <div className="border border-border rounded-md p-2 bg-amber-50 dark:bg-amber-950/20">
              <p className="text-[10px] text-amber-700 dark:text-amber-400">Updated</p>
              <p className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">{totals.updated}</p>
            </div>
            <div className="border border-border rounded-md p-2 bg-red-50 dark:bg-red-950/20">
              <p className="text-[10px] text-red-700 dark:text-red-400">Deleted</p>
              <p className="text-lg font-bold tabular-nums text-red-700 dark:text-red-400">{totals.deleted}</p>
            </div>
            <div className="border border-border rounded-md p-2 bg-blue-50 dark:bg-blue-950/20">
              <p className="text-[10px] text-blue-700 dark:text-blue-400">Reviewed</p>
              <p className="text-lg font-bold tabular-nums text-blue-700 dark:text-blue-400">{totals.reviewed}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search LGA, medicine, user…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 text-xs pl-7 w-[220px]"
              />
            </div>
            <Select value={filterState} onValueChange={setFilterState}>
              <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {states.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterLga} onValueChange={setFilterLga}>
              <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="LGA" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All LGAs</SelectItem>
                {lgas.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterAction} onValueChange={setFilterAction}>
              <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="create">Created</SelectItem>
                <SelectItem value="update">Updated</SelectItem>
                <SelectItem value="delete">Deleted</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterReviewed} onValueChange={setFilterReviewed}>
              <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="Reviewed" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="yes">Reviewed</SelectItem>
                <SelectItem value="no">Not Reviewed</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={resetFilters}>
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
            <div className="ml-auto flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={exportCSV}>
                <FileText className="h-3.5 w-3.5" /> CSV
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={exportExcel}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
              </Button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 pr-1">
            {loading ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                {rows.length === 0 ? "No allocation changes yet." : "No history rows match the current filters."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {filtered.map(r => {
                  const meta = actionMeta[r.action] || actionMeta.update;
                  const Icon = meta.icon;
                  const delta =
                    r.old_amount != null && r.new_amount != null ? r.new_amount - r.old_amount : null;
                  return (
                    <div
                      key={r.id}
                      className={`border rounded-md p-2 text-xs transition-colors ${
                        r.reviewed
                          ? "bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900"
                          : "bg-muted/10 border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] gap-1 ${meta.cls}`}>
                            <Icon className="h-3 w-3" /> {meta.label}
                          </Badge>
                          <span className="font-semibold">{r.lga}</span>
                          {r.state && <span className="text-muted-foreground">· {r.state}</span>}
                          {r.year && <Badge variant="outline" className="text-[9px]">Year {r.year}</Badge>}
                          {r.campaign_type && <Badge variant="outline" className="text-[9px]">{r.campaign_type}</Badge>}
                          {r.medicine_name && <Badge variant="outline" className="text-[9px]">{r.medicine_name}</Badge>}
                          {r.reviewed && (
                            <Badge variant="outline" className="text-[9px] gap-1 bg-emerald-100 text-emerald-700 border-emerald-300">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Reviewed
                            </Badge>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(r.changed_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="text-muted-foreground">
                          by <strong className="text-foreground">{users.get(r.changed_by) || "user"}</strong>
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className="tabular-nums">
                          {r.old_amount != null ? r.old_amount.toLocaleString() : "—"} →{" "}
                          <strong>{r.new_amount != null ? r.new_amount.toLocaleString() : "—"}</strong>
                        </span>
                        {delta !== null && delta !== 0 && (
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${delta > 0 ? "text-emerald-700 border-emerald-300" : "text-red-700 border-red-300"}`}
                          >
                            {delta > 0 ? "+" : ""}{delta.toLocaleString()}
                          </Badge>
                        )}
                        {r.reviewed && r.reviewed_by && (
                          <span className="text-[10px] text-muted-foreground ml-2">
                            reviewed by <strong>{users.get(r.reviewed_by) || "user"}</strong>
                            {r.reviewed_at && ` · ${new Date(r.reviewed_at).toLocaleString()}`}
                          </span>
                        )}
                        <div className="ml-auto flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px] gap-1"
                            disabled={busyId === r.id}
                            onClick={() => toggleReviewed(r)}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            {r.reviewed ? "Unreview" : "Mark Reviewed"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px] gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                            disabled={busyId === r.id}
                            onClick={() => setConfirmDelete(r)}
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={v => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete history entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the audit record for{" "}
              <strong>{confirmDelete?.lga}</strong>
              {confirmDelete?.medicine_name ? ` (${confirmDelete.medicine_name})` : ""}.
              The current allocation is not affected. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmDelete && deleteRow(confirmDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AllocationHistoryDialog;
