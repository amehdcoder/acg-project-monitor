/**
 * Live comparison of planned vs. actually-allocated medicine quantities coming
 * from the linked KoboToolbox reconciliation form.
 *
 * Rows land in `public.microplan_reconciliation` through the `kobo-webhook`
 * edge function; this panel subscribes to that table so overrides appear the
 * instant an enumerator submits.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import useRealtimeReconciliationEntries from "@/hooks/useRealtimeReconciliationEntries";
import { ArrowLeftRight, MessageSquareWarning } from "lucide-react";

interface ReconRow {
  id: string;
  state: string | null;
  lga: string | null;
  ward: string | null;
  flhf_name: string | null;
  community_name: string | null;
  settlement_name: string | null;
  medicine_name: string | null;
  allocated_quantity: number | null;
  override_quantity: number | null;
  override_reason: string | null;
  submitted_at: string | null;
}

interface Props {
  projectId?: string | null;
  filterState?: string;
  filterLga?: string;
}

const num = (v: number | null | undefined) => (v == null ? null : Number(v));

export default function KoboAllocationOverridePanel({ projectId, filterState = "all", filterLga = "all" }: Props) {
  const [rows, setRows] = useState<ReconRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) { setRows([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("microplan_reconciliation")
      .select("id,state,lga,ward,flhf_name,community_name,settlement_name,medicine_name,allocated_quantity,override_quantity,override_reason,submitted_at")
      .eq("project_id", projectId)
      .order("submitted_at", { ascending: false })
      .limit(500);
    setRows((data as ReconRow[]) ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useRealtimeReconciliationEntries(projectId ?? null, load);

  const filtered = useMemo(() => {
    let r = rows;
    if (filterState !== "all") r = r.filter((x) => x.state === filterState);
    if (filterLga !== "all") r = r.filter((x) => x.lga === filterLga);
    return r;
  }, [rows, filterState, filterLga]);

  const totals = useMemo(() => {
    let planned = 0, actual = 0, overrides = 0;
    for (const r of filtered) {
      const p = num(r.allocated_quantity) ?? 0;
      const o = num(r.override_quantity);
      planned += p;
      actual += o ?? p;
      if (o != null) overrides += 1;
    }
    return { planned, actual, variance: actual - planned, overrides };
  }, [filtered]);

  if (!projectId) return null;

  return (
    <Card className="border-border/50">
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2.5 border-b border-border/40 bg-muted/30">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs font-semibold">Planned vs. Actual Allocation (Kobo submissions)</p>
              <p className="text-[10px] text-muted-foreground">
                Updates in real time as reconciliation submissions arrive from KoboToolbox.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px]">Planned {totals.planned.toLocaleString()}</Badge>
            <Badge variant="outline" className="text-[10px]">Actual {totals.actual.toLocaleString()}</Badge>
            <Badge
              variant={totals.variance === 0 ? "outline" : "destructive"}
              className="text-[10px]"
            >
              Variance {totals.variance > 0 ? "+" : ""}{totals.variance.toLocaleString()}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">{totals.overrides} override(s)</Badge>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/60">
                <th className="px-3 py-2 text-left font-semibold">State</th>
                <th className="px-3 py-2 text-left font-semibold">LGA</th>
                <th className="px-3 py-2 text-left font-semibold">Ward</th>
                <th className="px-3 py-2 text-left font-semibold">FLHF</th>
                <th className="px-3 py-2 text-left font-semibold">Community / Settlement</th>
                <th className="px-3 py-2 text-left font-semibold">Medicine</th>
                <th className="px-3 py-2 text-right font-semibold">Planned</th>
                <th className="px-3 py-2 text-right font-semibold">Actual</th>
                <th className="px-3 py-2 text-right font-semibold">Δ</th>
                <th className="px-3 py-2 text-left font-semibold w-[260px]">Reason for change</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const planned = num(r.allocated_quantity);
                const override = num(r.override_quantity);
                const actual = override ?? planned;
                const delta = planned != null && actual != null ? actual - planned : null;
                return (
                  <tr key={r.id} className={`border-b border-border/30 ${i % 2 ? "bg-muted/20" : "bg-background"}`}>
                    <td className="px-3 py-2">{r.state ?? "—"}</td>
                    <td className="px-3 py-2">{r.lga ?? "—"}</td>
                    <td className="px-3 py-2">{r.ward ?? "—"}</td>
                    <td className="px-3 py-2">{r.flhf_name ?? "—"}</td>
                    <td className="px-3 py-2 font-medium">
                      {r.community_name ?? "—"}
                      {r.settlement_name ? <span className="text-muted-foreground"> — {r.settlement_name}</span> : null}
                    </td>
                    <td className="px-3 py-2 capitalize">{r.medicine_name ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{planned?.toLocaleString() ?? "—"}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${override != null ? "text-amber-700 dark:text-amber-400" : ""}`}>
                      {actual?.toLocaleString() ?? "—"}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${delta && delta !== 0 ? (delta > 0 ? "text-red-600" : "text-blue-600") : "text-muted-foreground"}`}>
                      {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta.toLocaleString()}`}
                    </td>
                    <td className="px-3 py-2">
                      {r.override_reason ? (
                        <span className="flex items-start gap-1.5">
                          <MessageSquareWarning className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
                          <span className="text-[11px]">{r.override_reason}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-6 text-muted-foreground text-[11px]">
                    {loading ? "Loading Kobo reconciliation submissions…" : "No Kobo reconciliation submissions yet for this filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
