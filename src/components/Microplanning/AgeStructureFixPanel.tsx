import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Users, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Nigeria NTD programme standard age structure. */
export const AGE_SPLIT = { c04: 0.2, c514: 0.28, a15: 0.52 };

interface Props {
  entries: any[];
  readOnly?: boolean;
  onRefresh?: () => void;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

interface WardIssue {
  key: string;
  state: string;
  lga: string;
  ward: string;
  records: any[];
  pop: number;
  c514: number;
  a15: number;
}

/**
 * Wards whose 5–14 year population exceeds the 15+ population are demographically
 * impossible; the standard 20 / 28 / 52 split is re-applied to every community or
 * settlement in the ward, based on its own estimated total population.
 */
const AgeStructureFixPanel = ({ entries, readOnly = false, onRefresh }: Props) => {
  const [saving, setSaving] = useState(false);

  const issues = useMemo<WardIssue[]>(() => {
    const map = new Map<string, WardIssue>();
    for (const e of entries || []) {
      const state = String(e?.state ?? "").trim();
      const lga = String(e?.lga ?? "").trim();
      const ward = String(e?.ward ?? "").trim();
      if (!state || !lga || !ward) continue;
      const key = `${state}||${lga}||${ward}`;
      if (!map.has(key)) map.set(key, { key, state, lga, ward, records: [], pop: 0, c514: 0, a15: 0 });
      const w = map.get(key)!;
      w.records.push(e);
      w.pop += n(e.estimated_total_population);
      w.c514 += n(e.estimated_children_5_14);
      w.a15 += n(e.estimated_adults_15_plus);
    }
    return Array.from(map.values())
      .filter((w) => w.c514 > w.a15 && w.pop > 0)
      .sort((a, b) => a.lga.localeCompare(b.lga) || a.ward.localeCompare(b.ward));
  }, [entries]);

  const affectedRecords = useMemo(() => issues.reduce((s, w) => s + w.records.length, 0), [issues]);

  const apply = async () => {
    if (!issues.length) return;
    setSaving(true);
    let ok = 0;
    try {
      for (const w of issues) {
        for (const r of w.records) {
          const pop = n(r.estimated_total_population);
          if (!pop || !r.id) continue;
          const c04 = Math.round(pop * AGE_SPLIT.c04);
          const c514 = Math.round(pop * AGE_SPLIT.c514);
          const a15 = pop - c04 - c514;
          const { error } = await supabase
            .from("microplan_entries")
            .update({
              estimated_children_0_4: c04,
              estimated_children_5_14: c514,
              estimated_adults_15_plus: a15,
            } as any)
            .eq("id", r.id);
          if (!error) ok++;
        }
      }
      toast.success(`Age structure standardised on ${ok} record${ok === 1 ? "" : "s"}`);
      onRefresh?.();
    } catch (err) {
      toast.error("Update failed: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!issues.length) return null;

  return (
    <Card className="border-amber-500/40">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-foreground">Implausible Age Structure — 5–14 yrs exceeds 15+ yrs</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {issues.length} ward{issues.length === 1 ? "" : "s"} · {affectedRecords} record{affectedRecords === 1 ? "" : "s"}
            </Badge>
            {!readOnly && (
              <Button size="sm" className="h-8 text-xs gap-1" disabled={saving} onClick={apply}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Apply 20 / 28 / 52 split
              </Button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          In these wards the reported 5–14 year population is larger than the 15+ population, which cannot occur in
          Nigeria's demographic profile. Applying the fix re-derives every community or settlement in the ward from its
          own estimated total population using the NTD programme standard: 20% aged 0–4, 28% aged 5–14, 52% aged 15+.
        </p>
        <div className="max-h-[300px] overflow-auto rounded-md border border-border/50">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-muted/70 backdrop-blur">
              <tr className="text-left">
                {["LGA", "Ward", "Records", "Total pop.", "5–14 yrs", "15+ yrs", "Status"].map((h, i) => (
                  <th key={i} className="px-2 py-1.5 font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {issues.map((w) => (
                <tr key={w.key} className="border-t border-border/40">
                  <td className="px-2 py-1">{w.lga}</td>
                  <td className="px-2 py-1">{w.ward}</td>
                  <td className="px-2 py-1 tabular-nums">{w.records.length}</td>
                  <td className="px-2 py-1 tabular-nums">{w.pop.toLocaleString()}</td>
                  <td className="px-2 py-1 tabular-nums font-semibold text-amber-600">{w.c514.toLocaleString()}</td>
                  <td className="px-2 py-1 tabular-nums">{w.a15.toLocaleString()}</td>
                  <td className="px-2 py-1">
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-3 w-3" /> Needs standard split
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

export default AgeStructureFixPanel;
