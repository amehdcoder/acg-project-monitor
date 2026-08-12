/**
 * Colourful State → LGA → Ward allocation matrix.
 *
 * Enter a total medicine quantity against an LGA (distributed exactly in
 * proportion to target population across every community/settlement in that
 * LGA) or against a single Ward (distributed across the communities of that
 * ward only). Community-level results export to a WHO-standard workbook.
 */
import { Fragment, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import {
  buildGeoTree, computeAllocations, type GeoRow,
} from "@/lib/microplanning/geoAllocation";
import { NTD_MEDICINES, NTD_UNITS, findNtdMedicine } from "@/lib/microplanning/ntdMedicines";
import { exportCommunityAllocationWorkbook } from "@/lib/microplanning/communityAllocationExcel";
import {
  DEFAULT_ROUNDING, ROUNDING_LABELS, describeRounding, explainResidual,
  type RoundingMode, type RoundingRule,
} from "@/lib/microplanning/allocationRounding";
import { parseAllocationCsv, downloadAllocationCsvTemplate } from "@/lib/microplanning/allocationCsv";
import GeoExclusionPanel from "@/components/Microplanning/GeoExclusionPanel";
import { useGeoExclusions } from "@/lib/microplanning/geoExclusions";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Download, Eraser, FileUp, Gauge, Info,
  MapPin, Pill, Search, Sliders, Sparkles, Upload,
} from "lucide-react";

interface Props {
  rows: GeoRow[];
  getTargetPop: (r: GeoRow) => number;
  scopeLabel?: string;
  projectName?: string;
  targetPopBasis?: string;
  readOnly?: boolean;
  /** stable id used to persist the allocation exclusion archive */
  scopeId?: string;
}

const n0 = (v: number) => Math.round(v).toLocaleString();

type Issue = { level: "error" | "warn" | "info"; text: string };

export default function GeoMedicineAllocationTable({
  rows, getTargetPop, scopeLabel = "All selected geographies", projectName, targetPopBasis = "Microplan target population", readOnly,
  scopeId = "medicine-allocation",
}: Props) {
  const [medicine, setMedicine] = useState("Ivermectin + Albendazole (IA)");
  const [unit, setUnit] = useState(findNtdMedicine("Ivermectin + Albendazole (IA)")?.unit ?? "Doses");
  const [bufferPct, setBufferPct] = useState(10);
  const [search, setSearch] = useState("");
  const [lgaTotals, setLgaTotals] = useState<Record<string, number>>({});
  const [wardTotals, setWardTotals] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [rounding, setRounding] = useState<RoundingRule>(DEFAULT_ROUNDING);
  const csvRef = useRef<HTMLInputElement>(null);

  const excl = useGeoExclusions(`medicine.${scopeId}`);

  const program = findNtdMedicine(medicine)?.program ?? "—";

  const pickMedicine = (name: string) => {
    setMedicine(name);
    const m = findNtdMedicine(name);
    if (m) setUnit(m.unit);
  };

  const tree = useMemo(() => buildGeoTree(rows, getTargetPop), [rows, getTargetPop]);

  const result = useMemo(
    () => computeAllocations(tree, { lgaTotals, wardTotals, bufferPct: bufferPct / 100, rounding, excluded: excl.keys }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, lgaTotals, wardTotals, bufferPct, rounding, excl.archived],
  );


  /* ── Reconciliation validation ─────────────────────────────────────── */
  const issues = useMemo<Issue[]>(() => {
    const out: Issue[] = [];
    for (const L of tree) {
      if (excl.keys.has(L.key)) continue;
      const active = L.wards.filter((w) => !excl.keys.has(w.key));
      const explicit = active.filter((w) => Number(wardTotals[w.key]) > 0);
      const explicitSum = explicit.reduce((s, w) => s + Number(wardTotals[w.key] || 0), 0);
      const lgaTotal = Math.max(0, Math.round(Number(lgaTotals[L.key]) || 0));
      const rest = active.filter((w) => !(Number(wardTotals[w.key]) > 0));

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
      if (lgaTotal > 0 && excl.keys.size > 0) {
        const droppedWards = L.wards.filter((w) => excl.keys.has(w.key));
        if (droppedWards.length) {
          out.push({ level: "info", text: `${L.lga}: ${droppedWards.length} archived ward(s) excluded — the LGA total is shared across the remaining ${active.length} ward(s) only.` });
        }
      }
      // reconciliation check: ward sum must equal the resolved LGA allocation
      const resolved = L.wards.reduce((s, w) => s + (result.wardAllocation[w.key] || 0), 0);
      if (resolved !== L.allocation) {
        out.push({ level: "error", text: `${L.lga}: ward allocations (${n0(resolved)}) do not reconcile with the LGA total (${n0(L.allocation)}).` });
      }
    }
    // rounding residuals — explained, never blocking
    for (const r of result.residuals) out.push({ level: "warn", text: explainResidual(r, unit) });

    // community ↔ ward reconciliation (exact mode only — pack rounding is expected to differ)
    const entered = tree.reduce((s, L) => s + L.allocation, 0);
    if (rounding.mode === "exact" && result.totals.allocation !== entered) {
      out.push({ level: "error", text: "Community allocations do not reconcile with ward/LGA totals. Clear entries and re-enter." });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, lgaTotals, wardTotals, result, unit, rounding, excl.archived]);

  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level !== "error");

  /* ── Live preview totals (recomputed on every keystroke) ───────────── */
  const preview = useMemo(() => {
    const entered =
      Object.entries(lgaTotals).reduce((s, [k, v]) => s + (excl.keys.has(k) ? 0 : Math.max(0, Math.round(Number(v) || 0))), 0);
    const distributed = result.totals.allocation;
    const wardEntered = Object.entries(wardTotals)
      .reduce((s, [k, v]) => s + (excl.keys.has(k) ? 0 : Math.max(0, Math.round(Number(v) || 0))), 0);
    const touchedLgas = result.tree.filter((L) => L.allocation > 0).length;
    const touchedWards = Object.values(result.wardAllocation).filter((v) => v > 0).length;
    const touchedCommunities = result.communities.filter((c) => c.allocation > 0).length;
    return {
      entered, wardEntered, distributed,
      variance: distributed - Math.max(entered, wardEntered, entered + 0),
      residualTotal: result.residuals.reduce((s, r) => s + r.diff, 0),
      touchedLgas, touchedWards, touchedCommunities,
      perPerson: result.totals.targetPop > 0 ? distributed / result.totals.targetPop : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lgaTotals, wardTotals, result, excl.archived]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = tree.filter((L) => !excl.keys.has(L.key));
    if (!q) return base;
    return base
      .map((L) => {
        const hitLga = `${L.state} ${L.lga}`.toLowerCase().includes(q);
        const wards = hitLga ? L.wards : L.wards.filter((w) => w.ward.toLowerCase().includes(q));
        return wards.length ? { ...L, wards } : null;
      })
      .filter(Boolean) as typeof tree;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, search, excl.archived]);

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
        roundingRule: describeRounding(rounding),
        validation: issues,
        exclusions: excl.archived.map((a) => ({ level: a.level, state: a.state, lga: a.lga, ward: a.ward })),
      });
      toast({ title: "✅ Community allocation exported", description: `${n0(result.totals.communities)} communities · ${n0(result.totals.dispatch)} ${unit.toLowerCase()} to dispatch.` });
    } catch (e) {
      toast({ title: "Export failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const importCsv = async (file: File) => {
    try {
      const parsed = parseAllocationCsv(await file.text(), tree);
      if (parsed.medicine && findNtdMedicine(parsed.medicine)) pickMedicine(parsed.medicine);
      if (parsed.unit) setUnit(parsed.unit);
      if (Object.keys(parsed.lgaTotals).length) setLgaTotals((p) => ({ ...p, ...parsed.lgaTotals }));
      if (Object.keys(parsed.wardTotals).length) setWardTotals((p) => ({ ...p, ...parsed.wardTotals }));
      toast({
        title: parsed.matched ? `✅ ${parsed.matched} allocation row(s) loaded` : "No rows matched",
        description: parsed.errors.length ? `${parsed.errors.length} row(s) skipped — ${parsed.errors[0]}` : "Totals recalculated in the live preview.",
        variant: parsed.matched ? "default" : "destructive",
      });
    } catch (e) {
      toast({ title: "Import failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      if (csvRef.current) csvRef.current.value = "";
    }
  };

  const clearAll = () => { setLgaTotals({}); setWardTotals({}); };

  const setLga = (k: string, v: string) =>
    setLgaTotals((p) => ({ ...p, [k]: Math.max(0, Number(v) || 0) }));
  const setWard = (k: string, v: string) =>
    setWardTotals((p) => ({ ...p, [k]: Math.max(0, Number(v) || 0) }));


  return (
    <div className="space-y-3">
    <GeoExclusionPanel
      rows={rows as any[]}
      getPop={(r) => Number(getTargetPop(r as GeoRow)) || 0}
      archived={excl.archived}
      keys={excl.keys}
      exclude={excl.exclude}
      restore={excl.restore}
      restoreAll={excl.restoreAll}
      disabled={readOnly}
      accent="violet"
      title="Allocation coverage — exclude LGAs or wards"
      subtitle="Archive geographies that should receive no medicine this round. Excluded areas are removed from every allocation, KPI and export until restored."
    />
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
            disabled={busy || errors.length > 0}
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
          {/* Rounding rules */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 text-[11px] gap-1 text-white hover:bg-white/20">
                <Sliders className="h-3.5 w-3.5" /> Rounding: {rounding.mode === "exact" ? "Exact" : `${ROUNDING_LABELS[rounding.mode].replace("Round ", "")} ×${rounding.step}`}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3">
              <div>
                <p className="text-xs font-bold flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5 text-sky-600" /> Rounding rule</p>
                <p className="text-[10.5px] text-muted-foreground mt-0.5">{describeRounding(rounding)}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mode</label>
                <Select value={rounding.mode} onValueChange={(v) => setRounding((p) => ({ ...p, mode: v as RoundingMode }))} disabled={readOnly}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROUNDING_LABELS) as RoundingMode[]).map((m) => (
                      <SelectItem key={m} value={m} className="text-xs">{ROUNDING_LABELS[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pack size ({unit.toLowerCase()} per pack)</label>
                <Input type="number" min={1} value={rounding.step} disabled={readOnly || rounding.mode === "exact"}
                  onChange={(e) => setRounding((p) => ({ ...p, step: Math.max(1, Math.round(Number(e.target.value) || 1)) }))}
                  className="h-8 text-xs" />
              </div>
              <Button size="sm" variant="outline" className="w-full h-8 text-[11px]" onClick={() => setRounding(DEFAULT_ROUNDING)}>
                Reset to exact apportionment
              </Button>
            </PopoverContent>
          </Popover>

          {/* Bulk CSV */}
          <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); }} />
          <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => csvRef.current?.click()}
            className="h-8 text-[11px] gap-1 text-white hover:bg-white/20">
            <Upload className="h-3.5 w-3.5" /> Import CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={() => downloadAllocationCsvTemplate(tree, medicine, unit)}
            className="h-8 text-[11px] gap-1 text-white hover:bg-white/20">
            <FileUp className="h-3.5 w-3.5" /> CSV template
          </Button>
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

      {/* Live reconciliation preview — recalculates on every keystroke */}
      <div className="px-4 py-3 border-b border-border/50 bg-gradient-to-r from-slate-50 via-sky-50 to-emerald-50 dark:from-slate-950/40 dark:via-sky-950/25 dark:to-emerald-950/20">
        <div className="flex items-center gap-2 mb-2">
          <Gauge className="h-4 w-4 text-sky-600" />
          <p className="text-[11px] font-bold text-sky-900 dark:text-sky-200">Live reconciliation preview</p>
          <Badge variant="outline" className="text-[9px]">updates as you type</Badge>
          {preview.residualTotal === 0
            ? <Badge className="text-[9px] bg-emerald-600 hover:bg-emerald-600">Balanced</Badge>
            : <Badge className="text-[9px] bg-amber-600 hover:bg-amber-600">Residual {preview.residualTotal > 0 ? "+" : ""}{n0(preview.residualTotal)}</Badge>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {[
            { l: "LGA totals entered", v: n0(preview.entered), c: "text-sky-700 dark:text-sky-300" },
            { l: "Ward totals entered", v: n0(preview.wardEntered), c: "text-violet-700 dark:text-violet-300" },
            { l: `Distributed (${unit.toLowerCase()})`, v: n0(preview.distributed), c: "text-emerald-700 dark:text-emerald-300" },
            { l: "Rounding residual", v: `${preview.residualTotal > 0 ? "+" : ""}${n0(preview.residualTotal)}`, c: preview.residualTotal === 0 ? "text-muted-foreground" : "text-rose-600 dark:text-rose-400" },
            { l: "LGAs / wards touched", v: `${n0(preview.touchedLgas)} / ${n0(preview.touchedWards)}`, c: "text-foreground" },
            { l: `${unit} per person`, v: preview.perPerson > 0 ? preview.perPerson.toFixed(2) : "—", c: "text-foreground" },
          ].map((k) => (
            <div key={k.l} className="rounded-lg bg-background/80 border border-border/50 px-2.5 py-1.5">
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{k.l}</p>
              <p className={`text-sm font-bold tabular-nums ${k.c}`}>{k.v}</p>
            </div>
          ))}
        </div>
        {result.residuals.length > 0 && (
          <div className="mt-2 rounded-lg border border-amber-300 dark:border-amber-900 bg-amber-50/80 dark:bg-amber-950/25 px-2.5 py-2">
            <p className="text-[10.5px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" /> Error summary — {result.residuals.length} geograph{result.residuals.length === 1 ? "y differs" : "ies differ"} from the entered total
            </p>
            <ul className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
              {result.residuals.slice(0, 8).map((r, i) => (
                <li key={i} className="text-[10px] leading-snug text-amber-800 dark:text-amber-300">• {explainResidual(r, unit)}</li>
              ))}
              {result.residuals.length > 8 && <li className="text-[10px] text-muted-foreground">…and {result.residuals.length - 8} more (all listed in the Validation Report sheet)</li>}
            </ul>
          </div>
        )}
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Every figure above and in the exported workbook excludes the {excl.archived.length} archived geograph{excl.archived.length === 1 ? "y" : "ies"}.
        </p>
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
            {describeRounding(rounding)} Ward entries take precedence; the remaining LGA total is shared across wards without an explicit figure.
          </p>
          <Button onClick={download} disabled={busy || errors.length > 0} size="sm" className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Download className="h-3.5 w-3.5" /> Download community allocation
          </Button>
        </div>
      </CardContent>
    </Card>
    </div>
  );

}
