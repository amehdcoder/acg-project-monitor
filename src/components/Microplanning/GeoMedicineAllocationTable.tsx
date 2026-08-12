/**
 * Colourful State → LGA → Ward allocation matrix.
 *
 * Enter a total medicine quantity against an LGA (distributed exactly in
 * proportion to target population across every community/settlement in that
 * LGA) or against a single Ward (distributed across the communities of that
 * ward only). Community-level results export to a WHO-standard workbook.
 */
import { Fragment, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  buildGeoTree, computeAllocations, type GeoRow,
} from "@/lib/microplanning/geoAllocation";
import { NTD_MEDICINES, NTD_UNITS, findNtdMedicine } from "@/lib/microplanning/ntdMedicines";
import { exportCommunityAllocationWorkbook } from "@/lib/microplanning/communityAllocationExcel";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Download, Eraser, Info, MapPin, Pill, Search, Sparkles,
} from "lucide-react";

interface Props {
  rows: GeoRow[];
  getTargetPop: (r: GeoRow) => number;
  scopeLabel?: string;
  projectName?: string;
  targetPopBasis?: string;
  readOnly?: boolean;
}

const n0 = (v: number) => Math.round(v).toLocaleString();

type Issue = { level: "error" | "warn" | "info"; text: string };

export default function GeoMedicineAllocationTable({
  rows, getTargetPop, scopeLabel = "All selected geographies", projectName, targetPopBasis = "Microplan target population", readOnly,
}: Props) {
  const [medicine, setMedicine] = useState("Ivermectin + Albendazole (IA)");
  const [unit, setUnit] = useState(findNtdMedicine("Ivermectin + Albendazole (IA)")?.unit ?? "Doses");
  const [bufferPct, setBufferPct] = useState(10);
  const [search, setSearch] = useState("");
  const [lgaTotals, setLgaTotals] = useState<Record<string, number>>({});
  const [wardTotals, setWardTotals] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const program = findNtdMedicine(medicine)?.program ?? "—";

  const pickMedicine = (name: string) => {
    setMedicine(name);
    const m = findNtdMedicine(name);
    if (m) setUnit(m.unit);
  };

  const tree = useMemo(() => buildGeoTree(rows, getTargetPop), [rows, getTargetPop]);

  const result = useMemo(
    () => computeAllocations(tree, { lgaTotals, wardTotals, bufferPct: bufferPct / 100 }),
    [tree, lgaTotals, wardTotals, bufferPct],
  );

  /* ── Reconciliation validation ─────────────────────────────────────── */
  const issues = useMemo<Issue[]>(() => {
    const out: Issue[] = [];
    for (const L of tree) {
      const explicit = L.wards.filter((w) => Number(wardTotals[w.key]) > 0);
      const explicitSum = explicit.reduce((s, w) => s + Number(wardTotals[w.key] || 0), 0);
      const lgaTotal = Math.max(0, Math.round(Number(lgaTotals[L.key]) || 0));
      const rest = L.wards.filter((w) => !(Number(wardTotals[w.key]) > 0));

      if (lgaTotal > 0 && explicitSum > lgaTotal) {
        out.push({
          level: "error",
          text: `${L.lga}: ward entries total ${n0(explicitSum)} ${unit.toLowerCase()} but the LGA total is only ${n0(lgaTotal)}. Wards over-allocate the LGA by ${n0(explicitSum - lgaTotal)} — the remaining wards will receive nothing.`,
        });
      } else if (lgaTotal > 0 && explicit.length && rest.length === 0 && explicitSum < lgaTotal) {
        out.push({
          level: "warn",
          text: `${L.lga}: every ward has an explicit entry (${n0(explicitSum)}), so ${n0(lgaTotal - explicitSum)} ${unit.toLowerCase()} of the LGA total will not be distributed.`,
        });
      }
      if (lgaTotal > 0 && rest.length > 0 && L.targetPop <= 0) {
        out.push({ level: "error", text: `${L.lga}: no target population recorded — allocation cannot be apportioned proportionally.` });
      }
      const restPop = rest.reduce((s, w) => s + w.targetPop, 0);
      if (lgaTotal > 0 && rest.length > 0 && restPop <= 0) {
        out.push({ level: "warn", text: `${L.lga}: wards without an explicit entry have zero target population — the remainder is being split evenly instead of proportionally.` });
      }
      for (const w of explicit) {
        if (w.targetPop <= 0) out.push({ level: "warn", text: `${L.lga} → ${w.ward}: ward has zero target population; units will be split evenly across its communities.` });
        const per = w.targetPop > 0 ? Number(wardTotals[w.key]) / w.targetPop : 0;
        if (per > 5) out.push({ level: "warn", text: `${L.lga} → ${w.ward}: ${per.toFixed(1)} ${unit.toLowerCase()} per person is unusually high — verify the entry.` });
      }
      // reconciliation check: ward sum must equal the resolved LGA allocation
      const resolved = L.wards.reduce((s, w) => s + (result.wardAllocation[w.key] || 0), 0);
      if (resolved !== L.allocation) {
        out.push({ level: "error", text: `${L.lga}: ward allocations (${n0(resolved)}) do not reconcile with the LGA total (${n0(L.allocation)}).` });
      }
    }
    // community ↔ ward reconciliation
    if (result.totals.allocation !== tree.reduce((s, L) => s + L.allocation, 0)) {
      out.push({ level: "error", text: "Community allocations do not reconcile with ward/LGA totals. Clear entries and re-enter." });
    }
    return out;
  }, [tree, lgaTotals, wardTotals, result, unit]);

  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level !== "error");


  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tree;
    return tree
      .map((L) => {
        const hitLga = `${L.state} ${L.lga}`.toLowerCase().includes(q);
        const wards = hitLga ? L.wards : L.wards.filter((w) => w.ward.toLowerCase().includes(q));
        return wards.length ? { ...L, wards } : null;
      })
      .filter(Boolean) as typeof tree;
  }, [tree, search]);

  const download = async () => {
    if (result.totals.allocation <= 0) {
      toast({ title: "Nothing to export", description: "Enter a medicine quantity against at least one LGA or ward first.", variant: "destructive" });
      return;
    }
    if (errors.length) {
      toast({ title: "Allocation does not reconcile", description: errors[0].text, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await exportCommunityAllocationWorkbook(result, {
        scope: scopeLabel, project: projectName, medicine, program, unit,
        bufferPct: bufferPct / 100, targetPopBasis,
      });
      toast({ title: "✅ Community allocation exported", description: `${n0(result.totals.communities)} communities · ${n0(result.totals.dispatch)} ${unit.toLowerCase()} to dispatch.` });
    } catch (e) {
      toast({ title: "Export failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };


  const clearAll = () => { setLgaTotals({}); setWardTotals({}); };

  const setLga = (k: string, v: string) =>
    setLgaTotals((p) => ({ ...p, [k]: Math.max(0, Number(v) || 0) }));
  const setWard = (k: string, v: string) =>
    setWardTotals((p) => ({ ...p, [k]: Math.max(0, Number(v) || 0) }));

  return (
    <Card className="border-border/60 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-sky-700 via-cyan-600 to-emerald-600 px-4 py-3 text-white">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5">
            <div className="rounded-lg bg-white/20 p-2"><Pill className="h-5 w-5" /></div>
            <div>
              <h3 className="text-sm font-bold leading-tight">Population-Proportional Medicine Allocation</h3>
              <p className="text-[11px] text-white/85 max-w-2xl">
                Enter a total quantity for an <strong>LGA</strong> or a specific <strong>Ward</strong>. Units are apportioned exactly in
                proportion to target population across every community/settlement, per WHO PC-NTD and Nigeria NTD Programme practice.
              </p>
            </div>
          </div>
          <Button
            onClick={download}
            disabled={busy}
            className="h-10 gap-2 bg-white text-sky-800 hover:bg-white/90 font-bold shadow-lg shrink-0"
          >
            <Download className="h-4 w-4" />
            {busy ? "Building workbook…" : "Download community allocation"}
          </Button>
        </div>

        {/* Controls */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 rounded-md bg-white/15 px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide">Medicine</span>
            <Select value={medicine} onValueChange={pickMedicine} disabled={readOnly}>
              <SelectTrigger className="h-7 w-[320px] text-xs bg-white/95 text-foreground border-0">
                <SelectValue placeholder="Select NTD medicine" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {NTD_MEDICINES.map((m) => (
                  <SelectItem key={m.name} value={m.name} className="text-xs">
                    {m.name} <span className="text-muted-foreground">· {m.program}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-white/15 px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide">Unit</span>
            <Select value={unit} onValueChange={setUnit} disabled={readOnly}>
              <SelectTrigger className="h-7 w-28 text-xs bg-white/95 text-foreground border-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...NTD_UNITS, unit, "Tubes", "Capsules"])].map((u) => (
                  <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge className="bg-white/20 hover:bg-white/20 text-white text-[10px] border-0">Programme: {program}</Badge>
          <div className="flex items-center gap-1.5 rounded-md bg-white/15 px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide">Buffer %</span>
            <Input type="number" min={0} max={100} value={bufferPct}
              onChange={(e) => setBufferPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              className="h-7 w-16 text-xs text-center bg-white/90 text-foreground border-0" />
          </div>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-sky-900/60" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search LGA or ward…"
              className="h-8 w-52 pl-7 text-xs bg-white/90 text-foreground border-0" />
          </div>
          <Button variant="ghost" size="sm" onClick={clearAll} className="h-8 text-[11px] gap-1 text-white hover:bg-white/20">
            <Eraser className="h-3.5 w-3.5" /> Clear entries
          </Button>
        </div>


        {/* Totals */}
        <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
          {[
            { l: "LGAs", v: n0(result.totals.lgas) },
            { l: "Wards", v: n0(result.totals.wards) },
            { l: "Communities", v: n0(result.totals.communities) },
            { l: "Target population", v: n0(result.totals.targetPop) },
            { l: `${unit} to dispatch`, v: n0(result.totals.dispatch) },
          ].map((k) => (
            <div key={k.l} className="rounded-lg bg-white/15 px-2.5 py-1.5">
              <p className="text-[9px] uppercase tracking-wide text-white/80">{k.l}</p>
              <p className="text-sm font-bold tabular-nums">{k.v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Validation banner */}
      {result.totals.allocation > 0 && (
        <div className={`px-4 py-2.5 border-b ${errors.length ? "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900" : warns.length ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900" : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900"}`}>
          <div className="flex items-start gap-2">
            {errors.length ? <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
              : warns.length ? <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              : <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <p className={`text-[11px] font-bold ${errors.length ? "text-rose-800 dark:text-rose-300" : warns.length ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300"}`}>
                {errors.length
                  ? `${errors.length} allocation error${errors.length > 1 ? "s" : ""} — export blocked until totals reconcile`
                  : warns.length
                    ? `${warns.length} allocation warning${warns.length > 1 ? "s" : ""} — review before dispatch`
                    : `Reconciled — ${n0(result.totals.allocation)} ${unit.toLowerCase()} distributed exactly across ${n0(result.totals.communities)} communities`}
              </p>
              <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                {issues.slice(0, 12).map((i, idx) => (
                  <li key={idx} className={`text-[10.5px] leading-snug ${i.level === "error" ? "text-rose-700 dark:text-rose-300" : "text-amber-800 dark:text-amber-300"}`}>
                    • {i.text}
                  </li>
                ))}
                {issues.length > 12 && <li className="text-[10px] text-muted-foreground">…and {issues.length - 12} more</li>}
              </ul>
            </div>
          </div>
        </div>
      )}


      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-sky-900 text-white">
                <th className="px-3 py-2 text-left font-semibold w-[26%]">State / LGA / Ward</th>
                <th className="px-3 py-2 text-right font-semibold">Communities</th>
                <th className="px-3 py-2 text-right font-semibold">Target population</th>
                <th className="px-3 py-2 text-right font-semibold">% share</th>
                <th className="px-3 py-2 text-center font-semibold w-[150px]">Medicine allocation</th>
                <th className="px-3 py-2 text-right font-semibold">Allocated</th>
                <th className="px-3 py-2 text-right font-semibold">Buffer</th>
                <th className="px-3 py-2 text-right font-semibold">Dispatch</th>
                <th className="px-3 py-2 text-right font-semibold">Units / person</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((L) => {
                const isOpen = open[L.key] ?? true;
                const buffer = Math.round(L.allocation * (bufferPct / 100));
                return (
                  <Fragment key={L.key}>
                    <tr className="bg-gradient-to-r from-sky-100 to-emerald-50 dark:from-sky-950/50 dark:to-emerald-950/30 border-y border-sky-200 dark:border-sky-900">
                      <td className="px-3 py-2">
                        <button onClick={() => setOpen((p) => ({ ...p, [L.key]: !isOpen }))} className="flex items-center gap-1.5 font-bold text-sky-900 dark:text-sky-200">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                          <span>{L.lga}</span>
                          <span className="text-[10px] font-normal text-muted-foreground">{L.state}</span>
                          <Badge variant="outline" className="text-[9px] ml-1">{L.wards.length} wards</Badge>
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{n0(L.communities)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{n0(L.targetPop)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">100%</td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number" min={0} inputMode="numeric" disabled={readOnly}
                          value={lgaTotals[L.key] ?? ""}
                          onChange={(e) => setLga(L.key, e.target.value)}
                          placeholder="LGA total"
                          className="h-8 text-xs text-right font-bold border-sky-400/70 focus-visible:ring-sky-500 bg-white dark:bg-background"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-sky-800 dark:text-sky-300">{n0(L.allocation)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{n0(buffer)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">{n0(L.allocation + buffer)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{L.targetPop > 0 ? (L.allocation / L.targetPop).toFixed(2) : "—"}</td>
                    </tr>

                    {isOpen && L.wards.map((w, i) => {
                      const alloc = result.wardAllocation[w.key] || 0;
                      const wb = Math.round(alloc * (bufferPct / 100));
                      const src = result.wardSource[w.key] ?? "—";
                      return (
                        <tr key={w.key} className={`border-b border-border/40 ${i % 2 ? "bg-muted/25" : "bg-background"} hover:bg-cyan-50/60 dark:hover:bg-cyan-950/20`}>
                          <td className="px-3 py-1.5 pl-9">
                            <span className="font-medium">{w.ward}</span>
                            {src === "Ward" && <Badge className="ml-2 text-[9px] bg-violet-600 hover:bg-violet-600">Ward set</Badge>}
                            {src === "LGA" && <Badge variant="secondary" className="ml-2 text-[9px]">From LGA</Badge>}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{n0(w.communities)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{n0(w.targetPop)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{(w.sharePct * 100).toFixed(1)}%</td>
                          <td className="px-2 py-1">
                            <Input
                              type="number" min={0} inputMode="numeric" disabled={readOnly}
                              value={wardTotals[w.key] ?? ""}
                              onChange={(e) => setWard(w.key, e.target.value)}
                              placeholder="Ward total"
                              className="h-7 text-xs text-right border-violet-300/70 focus-visible:ring-violet-500"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{n0(alloc)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-amber-700 dark:text-amber-400">{n0(wb)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{n0(alloc + wb)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{w.targetPop > 0 ? (alloc / w.targetPop).toFixed(2) : "—"}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}

              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-muted-foreground text-[11px]">
                    No geography rows available for allocation.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 border-t border-border/50 bg-muted/30">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-emerald-600" />
            Ward entries take precedence; the remaining LGA total is shared across wards without an explicit figure. Largest-remainder rounding keeps community totals reconciled exactly.
          </p>
          <Button onClick={download} disabled={busy} size="sm" className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Download className="h-3.5 w-3.5" /> Download community allocation
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
