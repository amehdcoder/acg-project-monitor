import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Wand2, Loader2, CheckCircle2, ArrowRight, Building2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  harmonizeFacilityNames,
  type HarmonizeResult,
  type FacilityRename,
  type UnmatchedFacility,
} from "@/lib/microplanning/facilityHarmonizer";

interface Props {
  entries: any[];
  readOnly?: boolean;
  onRefresh?: () => void;
}

const SOURCE_LABEL: Record<FacilityRename["source"], string> = {
  grid3_ward: "GRID3 (in ward)",
  grid3_lga: "GRID3 (in LGA)",
  local_consensus: "Local consensus",
};

/**
 * Standardises health-facility spellings across the whole Geo Microplanning
 * dataset by fuzzy-matching each ward's captured names against GRID3.
 */
const FacilityHarmonizerPanel = ({ entries, readOnly = false, onRefresh }: Props) => {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<HarmonizeResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [fixes, setFixes] = useState<Record<string, string>>({});
  const [fixing, setFixing] = useState<string | null>(null);

  /** Manually map a facility GRID3 does not know onto an official name. */
  const applyFix = async (u: UnmatchedFacility, to: string, key: string) => {
    if (!to || !u.ids.length) return;
    setFixing(key);
    try {
      const { error } = await supabase
        .from("microplan_entries")
        .update({ flhf_name: to } as any)
        .in("id", u.ids);
      if (error) throw error;
      setResult((prev) =>
        prev ? { ...prev, unmatched: prev.unmatched.filter((x) => x !== u) } : prev,
      );
      setFixes((f) => {
        const next = { ...f };
        delete next[key];
        return next;
      });
      toast.success(`"${u.name}" renamed to "${to}" on ${u.ids.length} record${u.ids.length === 1 ? "" : "s"}`);
      onRefresh?.();
    } catch (err) {
      toast.error("Update failed: " + (err as Error).message);
    } finally {
      setFixing(null);
    }
  };

  const distinctFacilities = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries || []) {
      const n = String(e?.flhf_name ?? "").trim();
      if (n) s.add(`${e?.state}||${e?.lga}||${e?.ward}||${n.toLowerCase()}`);
    }
    return s.size;
  }, [entries]);

  const run = async () => {
    setRunning(true);
    setProgress(0);
    setResult(null);
    try {
      const res = await harmonizeFacilityNames(entries as any[], (d, t) =>
        setProgress(t ? Math.round((d / t) * 100) : 100),
      );
      setResult(res);
      toast.success(
        res.renames.length
          ? `${res.renames.length} facility spelling${res.renames.length === 1 ? "" : "s"} can be standardised`
          : "All health-facility names are already standard",
      );
    } catch (err) {
      toast.error("Harmonisation failed: " + (err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const apply = async () => {
    if (!result?.renames.length) return;
    setSaving(true);
    let ok = 0;
    try {
      for (const r of result.renames) {
        if (!r.ids.length) continue;
        const { error } = await supabase
          .from("microplan_entries")
          .update({ flhf_name: r.to } as any)
          .in("id", r.ids);
        if (!error) ok += r.ids.length;
      }
      toast.success(`Standardised ${ok} record${ok === 1 ? "" : "s"}`);
      setResult(null);
      onRefresh?.();
    } catch (err) {
      toast.error("Save failed: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-indigo-500/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-foreground">Health Facility Name Harmonisation — GRID3</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {distinctFacilities} ward-scoped spelling{distinctFacilities === 1 ? "" : "s"}
            </Badge>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={running} onClick={run}>
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {running ? `Matching ${progress}%` : "Harmonise names"}
            </Button>
            {!!result?.renames.length && !readOnly && (
              <Button size="sm" className="h-8 text-xs gap-1" disabled={saving} onClick={apply}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Apply {result.renames.length}
              </Button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Each captured facility spelling is fuzzy-matched against the GRID3 health-facility registry
          strictly inside its own State → LGA → Ward. Names GRID3 does not know collapse onto the most
          frequently captured local variant, so the facility list is identical everywhere on this page.
        </p>
        {running && <Progress value={progress} className="h-1.5" />}

        {result && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Spellings inspected", value: result.inspected },
              { label: "Already standard", value: result.alreadyStandard },
              { label: "To standardise", value: result.renames.length },
              { label: "Records affected", value: result.recordsAffected },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-border/50 bg-background/60 p-2">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                <p className="text-base font-bold tabular-nums text-foreground">{k.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}

        {!!result?.renames.length && (
          <div className="max-h-[300px] overflow-auto rounded-md border border-border/50">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                <tr className="text-left">
                  {["LGA", "Ward", "Captured name", "", "Standard name", "Source", "Match", "Records"].map((h, i) => (
                    <th key={i} className="px-2 py-1.5 font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.renames.map((r, i) => (
                  <tr key={`${r.lga}-${r.ward}-${r.from}-${i}`} className="border-t border-border/40">
                    <td className="px-2 py-1">{r.lga}</td>
                    <td className="px-2 py-1">{r.ward}</td>
                    <td className="px-2 py-1 text-muted-foreground line-through">{r.from}</td>
                    <td className="px-1 py-1"><ArrowRight className="h-3 w-3 text-indigo-500" /></td>
                    <td className="px-2 py-1 font-semibold text-foreground">{r.to}</td>
                    <td className="px-2 py-1 text-muted-foreground">{SOURCE_LABEL[r.source]}</td>
                    <td className="px-2 py-1">
                      <span className={r.confidence >= 0.9 ? "text-emerald-600 font-semibold" : "text-amber-600"}>
                        {Math.round(r.confidence * 100)}%
                      </span>
                    </td>
                    <td className="px-2 py-1 tabular-nums">{r.recordCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!!result?.unmatched.length && (
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <p className="text-xs font-bold text-foreground">
                {result.unmatched.length} facility name{result.unmatched.length === 1 ? "" : "s"} not found in the GRID3 ward registry
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              These were left exactly as captured. Pick the correct GRID3 facility for the ward (or type the
              official name) and save — the change is applied to every affected record immediately.
            </p>
            <div className="max-h-[320px] overflow-auto rounded-md border border-border/50 bg-background/70">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                  <tr className="text-left">
                    {["LGA", "Ward", "Captured name", "Closest GRID3", "Correct to", "Records", ""].map((h, i) => (
                      <th key={i} className="px-2 py-1.5 font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.unmatched.map((u) => {
                    const key = `${u.lga}||${u.ward}||${u.name}`;
                    return (
                      <tr key={key} className="border-t border-border/40 align-middle">
                        <td className="px-2 py-1">{u.lga}</td>
                        <td className="px-2 py-1">{u.ward}</td>
                        <td className="px-2 py-1 font-medium text-foreground">{u.name}</td>
                        <td className="px-2 py-1 text-muted-foreground">
                          {u.nearest ? `${u.nearest} (${Math.round(u.nearestScore * 100)}%)` : "—"}
                        </td>
                        <td className="px-2 py-1">
                          <div className="flex flex-col gap-1 min-w-[190px]">
                            {!!u.grid3Options.length && (
                              <select
                                className="h-7 rounded-md border border-border bg-background px-1.5 text-[11px]"
                                value={u.grid3Options.includes(fixes[key] ?? "") ? fixes[key] : ""}
                                onChange={(e) => setFixes((f) => ({ ...f, [key]: e.target.value }))}
                              >
                                <option value="">Select GRID3 facility…</option>
                                {u.grid3Options.map((o) => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            )}
                            <Input
                              className="h-7 text-[11px]"
                              placeholder="or type official name"
                              value={fixes[key] ?? ""}
                              onChange={(e) => setFixes((f) => ({ ...f, [key]: e.target.value }))}
                            />
                          </div>
                        </td>
                        <td className="px-2 py-1 tabular-nums">{u.recordCount}</td>
                        <td className="px-2 py-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            disabled={
                              fixing === key ||
                              readOnly ||
                              !(fixes[key] || "").trim() ||
                              (fixes[key] || "").trim() === u.name
                            }
                            onClick={() => applyFix(u, (fixes[key] || "").trim(), key)}
                          >
                            {fixing === key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
};

export default FacilityHarmonizerPanel;
