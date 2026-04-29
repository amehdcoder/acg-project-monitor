import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Save, PackageCheck, AlertTriangle, RotateCcw, Pill } from "lucide-react";
import * as XLSX from "xlsx";

export interface AllocationRow {
  entryId: string;
  state: string;
  lga: string;
  ward: string;
  flhf: string;
  community: string;
  settlement: string;
  medicineRequired: number;
  medicineUsed: number;
}

export interface MicroplanEntry {
  id: string;
  state: string;
  lga: string;
  ward: string;
  flhf_name: string;
  community_name: string;
  settlement_name: string | null;
  medicine_used?: number | null;
  medicine_reversed_to?: string | null;
  medicine_reversed_other?: string | null;
}

interface ReconciliationViewProps {
  entries: MicroplanEntry[];
  allocationRows: AllocationRow[];
  onRefresh: () => void;
}

const REVERSAL_OPTIONS = [
  { value: "FLHF", label: "FLHF" },
  { value: "LGA", label: "LGA" },
  { value: "State", label: "State" },
  { value: "Federal", label: "Federal" },
  { value: "Partner", label: "Partner" },
  { value: "Other", label: "Other" },
];

const ReconciliationView = ({ entries, allocationRows, onRefresh }: ReconciliationViewProps) => {
  // local edits
  const [editedUsed, setEditedUsed] = useState<Record<string, string>>({});
  const [editedReversed, setEditedReversed] = useState<Record<string, string>>({});
  const [editedOther, setEditedOther] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<string>("all");
  const [filterLga, setFilterLga] = useState<string>("all");

  // Build a lookup of entry data by id (need medicine_used + reversal info)
  const entryById = useMemo(() => {
    const m = new Map<string, MicroplanEntry>();
    entries.forEach(e => m.set(e.id, e));
    return m;
  }, [entries]);

  const states = useMemo(
    () => [...new Set(allocationRows.map(r => r.state))].sort(),
    [allocationRows]
  );
  const lgas = useMemo(
    () => {
      const base = filterState !== "all" ? allocationRows.filter(r => r.state === filterState) : allocationRows;
      return [...new Set(base.map(r => r.lga))].sort();
    },
    [allocationRows, filterState]
  );

  useEffect(() => { setFilterLga("all"); }, [filterState]);

  const filtered = useMemo(() => {
    let r = allocationRows;
    if (filterState !== "all") r = r.filter(x => x.state === filterState);
    if (filterLga !== "all") r = r.filter(x => x.lga === filterLga);
    return r;
  }, [allocationRows, filterState, filterLga]);

  const getUsedFor = (row: AllocationRow) => {
    if (editedUsed[row.entryId] !== undefined) {
      const n = Number(editedUsed[row.entryId]);
      return Number.isFinite(n) ? n : 0;
    }
    const live = entryById.get(row.entryId)?.medicine_used;
    return live != null ? Number(live) : row.medicineUsed;
  };

  const getReversedFor = (row: AllocationRow) =>
    editedReversed[row.entryId] ?? entryById.get(row.entryId)?.medicine_reversed_to ?? "";

  const getOtherFor = (row: AllocationRow) =>
    editedOther[row.entryId] ?? entryById.get(row.entryId)?.medicine_reversed_other ?? "";

  const totals = useMemo(() => {
    const allocated = filtered.reduce((s, r) => s + r.medicineRequired, 0);
    const used = filtered.reduce((s, r) => s + getUsedFor(r), 0);
    const balance = allocated - used;
    return { allocated, used, balance };
  }, [filtered, editedUsed, entryById]);

  const isDirty = (id: string) =>
    editedUsed[id] !== undefined ||
    editedReversed[id] !== undefined ||
    editedOther[id] !== undefined;

  const handleSave = async (row: AllocationRow) => {
    setSavingId(row.entryId);
    const patch: Record<string, any> = {};
    if (editedUsed[row.entryId] !== undefined) {
      const v = editedUsed[row.entryId];
      patch.medicine_used = v === "" ? null : Number(v);
    }
    if (editedReversed[row.entryId] !== undefined) {
      patch.medicine_reversed_to = editedReversed[row.entryId] || null;
    }
    if (editedOther[row.entryId] !== undefined) {
      patch.medicine_reversed_other = editedOther[row.entryId] || null;
    }
    const { error } = await supabase
      .from("microplan_entries")
      .update(patch as any)
      .eq("id", row.entryId);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Reconciliation saved" });
      setEditedUsed(prev => { const n = { ...prev }; delete n[row.entryId]; return n; });
      setEditedReversed(prev => { const n = { ...prev }; delete n[row.entryId]; return n; });
      setEditedOther(prev => { const n = { ...prev }; delete n[row.entryId]; return n; });
      onRefresh();
    }
    setSavingId(null);
  };

  const exportExcel = () => {
    if (filtered.length === 0) return;
    const data = filtered.map(r => {
      const used = getUsedFor(r);
      const balance = r.medicineRequired - used;
      const reversed = getReversedFor(r);
      const other = getOtherFor(r);
      return {
        State: r.state, LGA: r.lga, Ward: r.ward, FLHF: r.flhf,
        Community: r.community, Settlement: r.settlement,
        "Allocated": r.medicineRequired,
        "Quantity Used": used,
        "Balance of Medicine": balance,
        "Reversed To": reversed === "Other" && other ? `Other: ${other}` : reversed,
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reconciliation");
    XLSX.writeFile(wb, "Medicine_Reconciliation.xlsx");
    toast({ title: "Exported", description: `${data.length} rows exported.` });
  };

  // No allocation entered yet
  if (allocationRows.length === 0) {
    return (
      <Card className="border-dashed border-border">
        <CardContent className="py-10 text-center text-muted-foreground">
          <Pill className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium">No medicine allocation yet.</p>
          <p className="text-xs mt-1">
            Go to the <strong>Medicine</strong> tab and enter the medicine quantities allocated per LGA.
            The reconciliation table will populate automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="border-border/50 bg-gradient-to-br from-blue-50 to-background dark:from-blue-950/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <PackageCheck className="h-4 w-4 text-blue-600" />
              <p className="text-[10px] text-muted-foreground font-medium">Total Allocated</p>
            </div>
            <p className="text-2xl font-black tabular-nums text-blue-700 dark:text-blue-400">
              {totals.allocated.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-emerald-50 to-background dark:from-emerald-950/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Pill className="h-4 w-4 text-emerald-600" />
              <p className="text-[10px] text-muted-foreground font-medium">Total Used</p>
            </div>
            <p className="text-2xl font-black tabular-nums text-emerald-700 dark:text-emerald-400">
              {totals.used.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className={`border-border/50 bg-gradient-to-br ${totals.balance < 0 ? "from-red-50 dark:from-red-950/20" : "from-amber-50 dark:from-amber-950/20"} to-background`}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              {totals.balance < 0
                ? <AlertTriangle className="h-4 w-4 text-red-600" />
                : <RotateCcw className="h-4 w-4 text-amber-600" />}
              <p className="text-[10px] text-muted-foreground font-medium">Balance to Reverse</p>
            </div>
            <p className={`text-2xl font-black tabular-nums ${totals.balance < 0 ? "text-red-600" : "text-amber-700 dark:text-amber-400"}`}>
              {totals.balance.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Export */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterState} onValueChange={setFilterState}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="All States" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {states.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterLga} onValueChange={setFilterLga}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="All LGAs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All LGAs</SelectItem>
            {lgas.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportExcel}>
          Export Excel
        </Button>
      </div>

      {/* Reconciliation table */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70">State</th>
                  <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70">LGA</th>
                  <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70">Ward</th>
                  <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70">FLHF</th>
                  <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70">Community</th>
                  <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70">Settlement</th>
                  <th className="px-3 py-2.5 text-right font-semibold border-r border-primary/70">Allocated</th>
                  <th className="px-3 py-2.5 text-right font-semibold border-r border-primary/70 w-[120px]">Quantity Used</th>
                  <th className="px-3 py-2.5 text-right font-semibold border-r border-primary/70 w-[130px]">Balance</th>
                  <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70 w-[160px]">Reversed To</th>
                  <th className="px-3 py-2.5 text-center font-semibold w-[60px]">Save</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const used = getUsedFor(row);
                  const balance = row.medicineRequired - used;
                  const reversed = getReversedFor(row);
                  const balanceColor =
                    balance < 0 ? "text-red-600 dark:text-red-400"
                    : balance === 0 ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-700 dark:text-amber-400";
                  return (
                    <tr
                      key={row.entryId}
                      className={`border-b border-border/30 ${i % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-muted/40`}
                    >
                      <td className="px-3 py-2 border-r border-border/20">{row.state}</td>
                      <td className="px-3 py-2 border-r border-border/20">{row.lga}</td>
                      <td className="px-3 py-2 border-r border-border/20">{row.ward}</td>
                      <td className="px-3 py-2 border-r border-border/20">{row.flhf}</td>
                      <td className="px-3 py-2 border-r border-border/20 font-medium">{row.community}</td>
                      <td className="px-3 py-2 border-r border-border/20 text-muted-foreground">{row.settlement}</td>
                      <td className="px-3 py-2 border-r border-border/20 text-right tabular-nums">
                        {row.medicineRequired.toLocaleString()}
                      </td>
                      <td className="px-2 py-1 border-r border-border/20">
                        <Input
                          type="number"
                          min={0}
                          value={editedUsed[row.entryId] !== undefined ? editedUsed[row.entryId] : (entryById.get(row.entryId)?.medicine_used ?? "")}
                          onChange={(ev) => setEditedUsed(prev => ({ ...prev, [row.entryId]: ev.target.value }))}
                          className="h-7 text-xs text-right tabular-nums w-full"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2 border-r border-border/20 text-right">
                        <span className={`font-bold tabular-nums ${balanceColor}`}>
                          {balance.toLocaleString()}
                        </span>
                        {balance < 0 && (
                          <Badge variant="outline" className="ml-1 text-[8px] border-red-300 text-red-600 px-1">OVER</Badge>
                        )}
                      </td>
                      <td className="px-2 py-1 border-r border-border/20">
                        <Select
                          value={reversed || undefined}
                          onValueChange={(v) => setEditedReversed(prev => ({ ...prev, [row.entryId]: v }))}
                        >
                          <SelectTrigger className="h-7 text-xs w-full">
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            {REVERSAL_OPTIONS.map(o => (
                              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {reversed === "Other" && (
                          <Input
                            value={getOtherFor(row)}
                            onChange={(ev) => setEditedOther(prev => ({ ...prev, [row.entryId]: ev.target.value }))}
                            placeholder="Specify…"
                            className="h-6 text-[11px] mt-1"
                          />
                        )}
                      </td>
                      <td className="px-2 py-1 text-center">
                        {isDirty(row.entryId) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => handleSave(row)}
                            disabled={savingId === row.entryId}
                          >
                            <Save className="h-3 w-3 text-primary" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-center py-8 text-muted-foreground">
                      No rows match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-primary text-primary-foreground font-bold">
                    <td colSpan={6} className="px-3 py-2.5 border-r border-primary/70">TOTAL</td>
                    <td className="px-3 py-2.5 text-right tabular-nums border-r border-primary/70">
                      {totals.allocated.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums border-r border-primary/70">
                      {totals.used.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums border-r border-primary/70 ${totals.balance < 0 ? "text-red-200" : ""}`}>
                      {totals.balance.toLocaleString()}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReconciliationView;
