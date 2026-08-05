/**
 * Medicine Accountability Dashboard — the Reconciliation tab of the
 * Integrated Supervisory Checklist page.
 *
 * Consumes a dedicated KoboToolbox logistics form (3-tier: State → LGA →
 * FLHF → CDD) plus manually entered State/LGA allocations, and renders the
 * full accountability indicator suite with live tiered balances.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Activity, AlertTriangle, BookOpen, Boxes, CalendarClock, CheckCircle2, ClipboardCheck, Download, FileSpreadsheet,
  FileText, Filter, Gauge, Loader2, Maximize2, PackageCheck, PackageX, PlugZap, RefreshCw, Route, Scale, ShieldAlert,
  Timer, TrendingDown, Truck, Warehouse,
} from "lucide-react";

import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "@/hooks/use-toast";
import {
  applyFilters, computeAccountability, computeSupplyIntegrity, loadAllocations, medicineLabel, parseLogistics,
  saveAllocations, type Allocation, type Filters,
} from "@/lib/isc/medicineAccountability";
import {
  buildDrilldown, evaluateAlerts, loadThresholds, type AlertThresholds, type DrillKey, type DrillReport,
} from "@/lib/isc/medicineDrilldown";
import { DOC_GROUPS, KPI_DOCS, kpiDoc } from "@/lib/isc/medicineKpiDocs";
import {
  assessDataQuality, dataQualityTable, flagSummary, flagTone, DQ_LABELS, type DqFlag,
} from "@/lib/isc/medicineDataQuality";
import { computeReconciliation } from "@/lib/isc/reconciliationReport";
import {
  exportAccountabilityCsv, exportAccountabilityPdf, exportReconciliationCsv, exportReconciliationPdf,
} from "@/lib/isc/medicineExport";
import { loadMedLogCache, loadMedLogConfig, syncMedLog } from "./medicineKoboClient";
import MedicineKoboConnectDialog from "./MedicineKoboConnectDialog";
import MedicineAllocationDialog from "./MedicineAllocationDialog";
import MedicineDrilldownDialog from "./MedicineDrilldownDialog";
import MedicineAlertsPanel from "./MedicineAlertsPanel";
import SupplyIntegrityPanel from "./SupplyIntegrityPanel";
import ChecklistReconciliation from "./ChecklistReconciliation";

import type { KoboCache } from "./koboClient";

const fmt = (n: number) => Math.round(n).toLocaleString();
const pctf = (n: number) => `${(n * 100).toFixed(1)}%`;

const STATUS_COLOR: Record<string, string> = {
  stockout: "hsl(0 72% 51%)", critical: "hsl(25 95% 53%)", low: "hsl(45 93% 47%)", healthy: "hsl(152 60% 40%)",
  expired: "hsl(0 72% 51%)", watch: "hsl(45 93% 47%)", ok: "hsl(152 60% 40%)", unknown: "hsl(215 16% 60%)",
};

function Kpi({
  icon: Icon, label, value, sub, tone = "primary", hint, docId, onClick, flags,
}: { icon: any; label: string; value: string; sub?: string; tone?: string; hint?: string; docId?: string; onClick?: () => void; flags?: DqFlag[] }) {
  const dqTone = flagTone(flags);
  if (dqTone === "danger") tone = "danger";
  const toneCls =
    tone === "danger" ? "border-destructive/40 bg-destructive/5" :
    tone === "warn" ? "border-amber-300 bg-amber-50" :
    tone === "success" ? "border-emerald-300 bg-emerald-50" : "border-primary/30 bg-primary/5";
  const doc = docId ? kpiDoc(docId) : undefined;
  const body = (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`rounded-xl border p-3 ${toneCls} ${onClick ? "cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40" : ""}`}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{label}</span>
        {dqTone && (
          <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${dqTone === "danger" ? "text-destructive" : "text-amber-500"}`} />
        )}
        {onClick && <Maximize2 className="h-3 w-3 ml-auto shrink-0 opacity-60" />}
      </div>
      <p className="font-display text-2xl font-bold leading-tight mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      {flags?.length ? (
        <p className={`mt-1 text-[10px] font-medium leading-snug ${dqTone === "danger" ? "text-destructive" : "text-amber-600"}`}>
          {flags.slice(0, 2).map((f) => (f.category === "zero_division"
            ? "Undefined — zero denominator"
            : `${DQ_LABELS[f.category]}: ${f.count.toLocaleString()}`)).join(" · ")}
          {flags.length > 2 ? ` · +${flags.length - 2} more` : ""}
        </p>
      ) : null}
      {onClick && <p className="text-[10px] text-primary mt-1 font-medium">Click to drill down</p>}
    </div>
  );
  const dqTip = flagSummary(flags);
  const tip = [
    doc ? `${doc.definition}\n\nFormula: ${doc.formula}${doc.quality.length ? `\n\nData quality: ${doc.quality.join(" ")}` : ""}` : hint,
    dqTip ? `Data-quality validation:\n${dqTip}` : "",
  ].filter(Boolean).join("\n\n");
  if (!tip) return body;
  return (
    <TooltipProvider>
      <UiTooltip>
        <TooltipTrigger asChild>{body}</TooltipTrigger>
        <TooltipContent className="max-w-sm text-xs whitespace-pre-line">{tip}</TooltipContent>
      </UiTooltip>
    </TooltipProvider>
  );
}

/** Documentation drawer listing every KPI definition, formula and caveat. */
function KpiDocsDrawer() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm"><BookOpen className="h-4 w-4 mr-1" /> KPI guide</Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Indicator definitions & data-quality notes</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Every indicator on this dashboard, with the exact formula used, how to interpret the value, and the data
            conditions that can distort it.
          </p>
        </SheetHeader>
        <div className="mt-4 space-y-5">
          {DOC_GROUPS.map((g) => (
            <section key={g.id}>
              <h3 className="text-xs font-bold uppercase tracking-wide text-primary">{g.label}</h3>
              <p className="text-[11px] text-muted-foreground mb-2">{g.blurb}</p>
              <div className="space-y-2">
                {KPI_DOCS.filter((d) => d.group === g.id).map((d) => (
                  <div key={d.id} className="rounded-lg border p-3">
                    <p className="text-xs font-semibold">{d.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{d.definition}</p>
                    <p className="mt-1.5 rounded bg-muted/50 px-2 py-1 font-mono text-[10px] leading-snug break-words">{d.formula}</p>
                    <p className="mt-1.5 text-[10px] text-foreground/80"><span className="font-semibold">How to read it: </span>{d.interpretation}</p>

                    {d.quality.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {d.quality.map((q, i) => (
                          <li key={i} className="text-[10px] text-muted-foreground flex gap-1">
                            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" />{q}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface Props { canExport?: boolean; checklistCache?: KoboCache | null }

export default function MedicineAccountabilityDashboard({ canExport = true, checklistCache = null }: Props) {
  const [cache, setCache] = useState<KoboCache | null>(() => loadMedLogCache());
  const [syncing, setSyncing] = useState(false);
  const [openConnect, setOpenConnect] = useState(false);
  const [openAlloc, setOpenAlloc] = useState(false);
  const [allocations, setAllocations] = useState<Allocation[]>(() => loadAllocations());
  const [filters, setFilters] = useState<Filters>({});
  const [targetWindow, setTargetWindow] = useState(7);
  const [expiryWindow, setExpiryWindow] = useState(60);
  const [kickoff, setKickoff] = useState("");


  const refresh = useCallback(async (silent = false) => {
    const cfg = loadMedLogConfig();
    if (!cfg?.formUid || !cfg?.apiToken) { if (!silent) setOpenConnect(true); return; }
    setSyncing(true);
    try {
      const c = await syncMedLog(cfg);
      setCache(c);
      if (!silent) toast({ title: "Logistics data refreshed", description: `${c.count} submissions synced.` });
    } catch (e: any) {
      if (!silent) toast({ title: "Sync failed", description: e?.hint || e?.message || "Unable to reach KoboToolbox.", variant: "destructive" });
    } finally { setSyncing(false); }
  }, []);

  useEffect(() => {
    const cfg = loadMedLogConfig();
    if (!cfg?.autoSync) return;
    const id = setInterval(() => refresh(true), Math.max(1, cfg.pollMinutes ?? 10) * 60_000);
    return () => clearInterval(id);
  }, [refresh, cache?.fetchedAt]);

  const dataset = useMemo(() => parseLogistics(cache?.results ?? []), [cache]);
  const filtered = useMemo(() => applyFilters(dataset, filters), [dataset, filters]);
  const scopedAllocations = useMemo(
    () => allocations.filter((a) =>
      (!filters.state || a.state === filters.state) &&
      (!filters.lga || !a.lga || a.lga === filters.lga) &&
      (!filters.medicine || a.medicine === filters.medicine)),
    [allocations, filters],
  );
  const summary = useMemo(
    () => computeAccountability(filtered, scopedAllocations, { targetWindowDays: targetWindow }),
    [filtered, scopedAllocations, targetWindow],
  );
  const integrity = useMemo(
    () => computeSupplyIntegrity(filtered, scopedAllocations, summary, {
      expiryWindowDays: expiryWindow,
      kickoffDate: kickoff || undefined,
    }),
    [filtered, scopedAllocations, summary, expiryWindow, kickoff],
  );

  /* ── data-quality validation ───────────────────────────────────────────── */
  const [dqOpen, setDqOpen] = useState(false);
  const dq = useMemo(
    () => assessDataQuality(filtered, scopedAllocations, summary, integrity),
    [filtered, scopedAllocations, summary, integrity],
  );
  const dqReport = useMemo<DrillReport>(() => ({
    key: "shrinkage",
    title: "Data-quality validation — records distorting the indicators",
    subtitle: `${dq.issues.length.toLocaleString()} issues across ${dq.affectedRecords.toLocaleString()} of ${dq.totalRecords.toLocaleString()} records`,
    formula: "Checks: batch/lot number present · quantity present and > 0 · no negative balances · no zero denominators",
    quality: [
      "“Unreliable” rows materially change the KPI they feed — correct them at source before quoting the figure.",
      "Zero-denominator entries mean the indicator is undefined, not zero; the card shows a placeholder value.",
      "Aggregate rows (negative LGA/facility balances) come from summed transactions, not a single submission.",
    ],
    tables: [dataQualityTable(dq)],
  }), [dq]);


  /* ── drill-downs, alerts & exports ─────────────────────────────────────── */
  const [thresholds, setThresholds] = useState<AlertThresholds>(() => loadThresholds());
  const [drillKey, setDrillKey] = useState<DrillKey | null>(null);

  const DRILL_DOC: Record<DrillKey, string> = {
    shrinkage: "shrinkage", expiry: "expiry-risk", buffer: "buffer", equity: "equity",
  };

  const reports = useMemo(() => {
    const keys: DrillKey[] = ["shrinkage", "expiry", "buffer", "equity"];
    const map = {} as Record<DrillKey, DrillReport>;
    for (const k of keys) {
      const report = buildDrilldown(k, filtered, scopedAllocations, summary, integrity);
      map[k] = { ...report, tables: [...report.tables, dataQualityTable(dq, DRILL_DOC[k])] };
    }
    return map;
  }, [filtered, scopedAllocations, summary, integrity, dq]);

  const scopeLabel = useMemo(() => {
    const bits = [
      filters.state ?? "All states",
      filters.lga ? `${filters.lga} LGA` : null,
      filters.medicine ? medicineLabel(filters.medicine) : "All medicines",
      filters.from || filters.to ? `${filters.from || "start"} → ${filters.to || "today"}` : null,
    ].filter(Boolean);
    return bits.join(" · ");
  }, [filters]);

  const alerts = useMemo(() => evaluateAlerts(integrity, {
    shrinkageLga: reports.shrinkage.tables.find((t) => t.id === "lga")?.rows,
    expiryLga: reports.expiry.tables.find((t) => t.id === "lga")?.rows,
    bufferLga: reports.buffer.tables.find((t) => t.id === "lga")?.rows,
  }, thresholds), [integrity, reports, thresholds]);

  const recon = useMemo(() => computeReconciliation(checklistCache ?? null), [checklistCache]);

  const exportBundle = () => ({
    summary, integrity, alerts, scope: scopeLabel,
    drilldowns: [reports.shrinkage, reports.expiry, reports.buffer, reports.equity],
  });

  const allRows = [...dataset.receipts, ...dataset.issues, ...dataset.cddIssues];
  const states = useMemo(() => Array.from(new Set(allRows.map((r) => r.state).filter(Boolean))).sort(), [dataset]);
  const lgas = useMemo(
    () => Array.from(new Set(allRows.filter((r) => !filters.state || r.state === filters.state).map((r) => r.lga).filter(Boolean))).sort(),
    [dataset, filters.state],
  );
  const medicines = useMemo(() => Array.from(new Set(allRows.map((r) => r.medicine).filter(Boolean))).sort(), [dataset]);

  const persistAllocations = (rows: Allocation[]) => { setAllocations(rows); saveAllocations(rows); };


  const connected = !!loadMedLogConfig()?.formUid;
  const medChart = summary.byMedicine.map((m) => ({
    name: medicineLabel(m.medicine).replace(/\s*\(.*\)$/, ""),
    Received: m.received, "To FLHF": m.issuedToFlhf, "To CDD": m.issuedToCdd, Damaged: m.damaged,
    Wastage: Number((m.wastageRate * 100).toFixed(1)),
  }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" /> Medicine Accountability & Cascade Tracking
            </h2>
            <p className="text-xs text-muted-foreground">
              State → LGA → Health Facility → CDD logistics ledger · {dataset.submissions.toLocaleString()} logistics submissions ·
              {" "}{dataset.receipts.length} receipts · {dataset.issues.length} facility issues · {dataset.cddIssues.length} CDD issues
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {cache && (
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                {cache.count.toLocaleString()} records · {new Date(cache.fetchedAt).toLocaleString()}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => setOpenAlloc(true)}>
              <Boxes className="h-4 w-4 mr-1" /> Allocations ({allocations.length})
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOpenConnect(true)}>
              <PlugZap className="h-4 w-4 mr-1" /> {connected ? "Integration" : "Link Kobo form"}
            </Button>
            <KpiDocsDrawer />
            {canExport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1" /> Export</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel className="text-[11px]">Medicine accountability dashboard</DropdownMenuLabel>
                  <DropdownMenuItem className="text-xs" disabled={!summary.byMedicine.length}
                    onClick={() => exportAccountabilityPdf(exportBundle())}>
                    <FileText className="h-3.5 w-3.5 mr-2" /> PDF — supervision pack (with definitions)
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" disabled={!summary.byMedicine.length}
                    onClick={() => exportAccountabilityCsv(exportBundle())}>
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> CSV — all indicator tables
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[11px]">Data integrity reconciliation</DropdownMenuLabel>
                  <DropdownMenuItem className="text-xs" disabled={!checklistCache}
                    onClick={() => exportReconciliationPdf({ ...recon, scope: scopeLabel })}>
                    <FileText className="h-3.5 w-3.5 mr-2" /> PDF — reconciliation report
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" disabled={!checklistCache}
                    onClick={() => exportReconciliationCsv({ ...recon, scope: scopeLabel })}>
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> CSV — reconciliation findings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button size="sm" onClick={() => refresh(false)} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />} Sync
            </Button>
          </div>
        </CardContent>
      </Card>

      {!connected && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center space-y-2">
            <PlugZap className="h-8 w-8 mx-auto text-primary" />
            <h3 className="font-semibold">Link the medicine logistics KoboToolbox form</h3>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              This dashboard reads the 3-tier accountability form (Level 1 receipt at LGA, Level 2 distribution to health
              facilities, Level 3 distribution to CDDs). Link the form, then enter State/LGA allocations to unlock balances.
            </p>
            <Button onClick={() => setOpenConnect(true)}><PlugZap className="h-4 w-4 mr-1" /> Link form</Button>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-2">
          <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground pr-2">
            <Filter className="h-3.5 w-3.5" /> Filters
          </div>
          <Select value={filters.state ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, state: v === "all" ? undefined : v, lga: undefined }))}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent><SelectItem value="all" className="text-xs">All states</SelectItem>
              {states.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filters.lga ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, lga: v === "all" ? undefined : v }))}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="LGA" /></SelectTrigger>
            <SelectContent><SelectItem value="all" className="text-xs">All LGAs</SelectItem>
              {lgas.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filters.medicine ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, medicine: v === "all" ? undefined : v }))}>
            <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue placeholder="Medicine" /></SelectTrigger>
            <SelectContent><SelectItem value="all" className="text-xs">All medicines</SelectItem>
              {medicines.map((s) => <SelectItem key={s} value={s} className="text-xs">{medicineLabel(s)}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" className="h-8 w-[150px] text-xs" value={filters.from ?? ""} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))} />
          <Input type="date" className="h-8 w-[150px] text-xs" value={filters.to ?? ""} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))} />
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">Push target</span>
            <Input type="number" min={1} className="h-8 w-16 text-xs" value={targetWindow}
              onChange={(e) => setTargetWindow(Math.max(1, Number(e.target.value) || 7))} />
            <span className="text-[11px] text-muted-foreground">days</span>
          </div>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilters({})}>Reset</Button>
        </CardContent>
      </Card>

      {/* Data-quality validation banner */}
      <Card className={dq.issues.length ? "border-amber-300 bg-amber-50/60" : "border-emerald-300 bg-emerald-50/60"}>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          {dq.issues.length ? (
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          )}
          <div className="min-w-[220px]">
            <p className="text-xs font-semibold">
              {dq.issues.length
                ? `${dq.issues.length.toLocaleString()} data-quality issue${dq.issues.length === 1 ? "" : "s"} detected`
                : "Data-quality checks passed"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {dq.affectedRecords.toLocaleString()} of {dq.totalRecords.toLocaleString()} records affected ·{" "}
              {pctf(dq.cleanRate)} clean
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(dq.counts) as (keyof typeof dq.counts)[]).filter((c) => dq.counts[c] > 0).map((c) => (
              <Badge key={c} variant="outline" className="text-[10px] border-amber-400 text-amber-700">
                {DQ_LABELS[c]}: {dq.counts[c].toLocaleString()}
              </Badge>
            ))}
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs ml-auto"
            disabled={!dq.issues.length} onClick={() => setDqOpen(true)}>
            <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Review records
          </Button>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={PackageCheck} label="Received vs distributed" docId="received-distributed" flags={dq.byKpi["received-distributed"]} value={`${fmt(summary.totals.received)} / ${fmt(summary.totals.issuedToFlhf)}`}
          sub={`Net usable ${fmt(summary.totals.netUsable)} · to CDDs ${fmt(summary.totals.issuedToCdd)}`}
          hint="Total units logged at LGA level (Level 1) versus total units dispatched down to health facilities (Level 2) and CDDs (Level 3)." />
        <Kpi icon={TrendingDown} label="Wastage / stock loss" docId="wastage" flags={dq.byKpi["wastage"]} value={pctf(summary.wastageRate)} tone={summary.wastageRate > 0.05 ? "danger" : "success"}
          sub={`${fmt(summary.totals.damaged)} units damaged / expired on arrival`}
          hint="Share of received stock recorded as damaged, expired or otherwise unusable on arrival at the LGA store." />
        <Kpi icon={Boxes} label="Tiered stock balance" docId="balances" flags={dq.byKpi["balances"]} value={fmt(summary.totals.lgaBalance + summary.totals.flhfBalance)}
          sub={`LGA warehouses ${fmt(summary.totals.lgaBalance)} · facility stores ${fmt(summary.totals.flhfBalance)}`}
          hint="Live remaining stock: LGA balance = net usable received − issued to facilities; facility balance = received − issued to CDDs." />
        <Kpi icon={ShieldAlert} label="Stockout vulnerability" docId="stockout" flags={dq.byKpi["stockout"]} value={`${summary.stockoutIndex.atRisk} (${pctf(summary.stockoutIndex.pct)})`}
          tone={summary.stockoutIndex.pct > 0.2 ? "danger" : "warn"}
          sub={`${summary.stockoutIndex.stockout} at zero stock of ${summary.stockoutIndex.facilities} facilities`}
          hint="Health facilities reporting zero or critically low inventory ahead of the MDA round (balance ≤ 0, or under 15% of what they received)." />
        <Kpi icon={Route} label="Downstream push rate" docId="push-rate" flags={dq.byKpi["push-rate"]} value={pctf(summary.pushRate)} tone={summary.pushRate < 0.6 ? "warn" : "success"}
          sub={`${pctf(summary.pushRateOnTime)} of batches pushed within ${summary.targetWindowDays} days`}
          hint="Proportion of usable LGA stock disbursed to frontline health facilities, plus the share of batches moved within the target timeframe." />
        <Kpi icon={Timer} label="Cascade lead time" docId="lead-time" flags={dq.byKpi["lead-time"]} value={summary.leadTimes[1].avgDays !== null ? `${summary.leadTimes[1].avgDays!.toFixed(1)} d` : "—"}
          sub={`State→LGA ${summary.leadTimes[0].avgDays?.toFixed(1) ?? "—"} d · FLHF→CDD ${summary.leadTimes[2].avgDays?.toFixed(1) ?? "—"} d`}
          hint="Average days a batch takes to move through each tier. State → LGA uses the dispatch date entered with allocations." />
        <Kpi icon={CalendarClock} label="Expiry exposure" docId="expiry-exposure" flags={dq.byKpi["expiry-exposure"]} value={`${summary.expiry.expired + summary.expiry.within90}`} tone={summary.expiry.expired ? "danger" : "warn"}
          sub={`${summary.expiry.expired} expired · ${summary.expiry.within90} within 90 days · ${fmt(summary.expiry.unitsAtRisk)} units at risk`}
          hint="Batches already expired or expiring within 90 days, with the units still un-dispatched in those batches." />
        <Kpi icon={ClipboardCheck} label="Proof-of-delivery compliance" docId="pod" flags={dq.byKpi["pod"]} value={pctf(summary.podCompliance.overall)}
          tone={summary.podCompliance.overall > 0.85 ? "success" : "warn"}
          sub={`L1 ${pctf(summary.podCompliance.l1)} · L2 ${pctf(summary.podCompliance.l2)} · L3 ${pctf(summary.podCompliance.l3)}`}
          hint="Share of transactions carrying a verified waybill photo, EDO acknowledgment signature, facility confirmation signature or CDD receipt photo." />
        <Kpi icon={ShieldAlert} label="Transit shrinkage rate" docId="shrinkage" flags={dq.byKpi["shrinkage"]} onClick={() => setDrillKey("shrinkage")} value={pctf(integrity.shrinkage.overall.rate)}
          tone={integrity.shrinkage.overall.rate > 0.05 ? "danger" : integrity.shrinkage.overall.rate > 0.02 ? "warn" : "success"}
          sub={`${fmt(integrity.shrinkage.overall.variance)} units unaccounted across ${integrity.shrinkage.legs.length} cascade legs`}
          hint="(Quantity issued upstream − quantity confirmed received downstream) ÷ quantity issued, aggregated over every cascade leg. Positive values flag stock lost, diverted or unrecorded in transit." />
        <Kpi icon={CalendarClock} label={`Expiry risk index (${expiryWindow}d)`} docId="expiry-risk" flags={dq.byKpi["expiry-risk"]} onClick={() => setDrillKey("expiry")} value={pctf(integrity.expiryRisk.index)}
          tone={integrity.expiryRisk.index > 0.15 ? "danger" : integrity.expiryRisk.index > 0.05 ? "warn" : "success"}
          sub={`${fmt(integrity.expiryRisk.stockAtRisk)} of ${fmt(integrity.expiryRisk.totalStock)} units on hand are short-dated`}
          hint={`Share of stock currently sitting at LGA or health facility stores that belongs to batches expiring within ${expiryWindow} days.`} />
        <Kpi icon={Warehouse} label="Buffer retention ratio" docId="buffer" flags={dq.byKpi["buffer"]} onClick={() => setDrillKey("buffer")}
          value={integrity.buffer.ratio === null ? "—" : `${integrity.buffer.ratio.toFixed(2)} : 1`}
          tone={integrity.buffer.band === "balanced" ? "success" : integrity.buffer.band === "under-deployed" ? "danger" : "warn"}
          sub={`${fmt(integrity.buffer.retained)} retained vs ${fmt(integrity.buffer.deployedCdd)} deployed to CDDs · ${integrity.buffer.band}`}
          hint="Stock still held in LGA and facility warehouses relative to stock already deployed to CDDs — measured up to the campaign kickoff date when one is set." />
        <Kpi icon={Scale} label="Facility equity index (CV)" docId="equity" flags={dq.byKpi["equity"]} onClick={() => setDrillKey("equity")}
          value={integrity.equity.rows.length ? integrity.equity.weightedCv.toFixed(2) : "—"}
          tone={integrity.equity.weightedCv <= 0.25 ? "success" : integrity.equity.weightedCv <= 0.5 ? "warn" : "danger"}
          sub={`${integrity.equity.facilities} facilities across ${integrity.equity.lgas} LGAs compared`}
          hint="Coefficient of variation of medicine quantities issued to facilities within the same LGA. Low values mean an even spread; high values expose over-served and under-served catchment areas." />
      </div>

      {/* Threshold-driven alerts */}
      <MedicineAlertsPanel
        alerts={alerts}
        thresholds={thresholds}
        onThresholds={setThresholds}
        scope={scopeLabel}
        onDrill={(k) => setDrillKey(k)}
      />

      <MedicineDrilldownDialog
        report={drillKey ? reports[drillKey] : null}
        onOpenChange={(o) => { if (!o) setDrillKey(null); }}
      />

      <MedicineDrilldownDialog
        report={dqOpen ? dqReport : null}
        onOpenChange={(o) => { if (!o) setDqOpen(false); }}
      />




      {/* Allocation fulfilment */}
      {summary.totals.allocated > 0 && (
        <Card>
          <CardHeader className="py-3 px-4 border-b bg-muted/40">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" /> Allocation vs receipt reconciliation
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Allocated (manual entry)</p>
              <p className="font-display text-xl font-bold">{fmt(summary.totals.allocated)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Confirmed received at LGA</p>
              <p className="font-display text-xl font-bold">{fmt(summary.totals.received)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Outstanding against allocation</p>
              <p className={`font-display text-xl font-bold ${summary.totals.allocated - summary.totals.received > 0 ? "text-destructive" : "text-emerald-600"}`}>
                {fmt(summary.totals.allocated - summary.totals.received)}
              </p>
            </div>
            <div className="sm:col-span-3">
              <Progress value={Math.min(100, (summary.totals.received / summary.totals.allocated) * 100)} className="h-2" />
              <p className="text-[11px] text-muted-foreground mt-1">
                {pctf(summary.totals.received / summary.totals.allocated)} of allocated units confirmed received at LGA level.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="flow">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="flow"><Activity className="h-4 w-4 mr-1" /> Flow & wastage</TabsTrigger>
          <TabsTrigger value="balances"><Boxes className="h-4 w-4 mr-1" /> Tiered balances</TabsTrigger>
          <TabsTrigger value="facilities"><PackageX className="h-4 w-4 mr-1" /> Stockout risk</TabsTrigger>
          <TabsTrigger value="batches"><CalendarClock className="h-4 w-4 mr-1" /> Batches & expiry</TabsTrigger>
          <TabsTrigger value="leadtime"><Timer className="h-4 w-4 mr-1" /> Lead time & POD</TabsTrigger>
          <TabsTrigger value="supply"><Scale className="h-4 w-4 mr-1" /> Integrity, loss & equity</TabsTrigger>

          <TabsTrigger value="integrity"><ShieldAlert className="h-4 w-4 mr-1" /> Data integrity</TabsTrigger>
        </TabsList>

        {/* Flow */}
        <TabsContent value="flow" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="py-3 px-4 border-b bg-muted/40">
              <CardTitle className="text-sm font-semibold">Received vs distributed by medicine (with wastage rate)</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={medChart} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                    <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="l" dataKey="Received" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="l" dataKey="To FLHF" fill="hsl(152 60% 40%)" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="l" dataKey="To CDD" fill="hsl(262 70% 58%)" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="l" dataKey="Damaged" fill="hsl(0 72% 51%)" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="r" type="monotone" dataKey="Wastage" stroke="hsl(25 95% 53%)" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4 border-b bg-muted/40">
              <CardTitle className="text-sm font-semibold">Daily cascade throughput</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={summary.timeline}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="received" name="Received at LGA" fill="hsl(217 91% 60%)" />
                    <Line type="monotone" dataKey="toFlhf" name="Issued to FLHF" stroke="hsl(152 60% 40%)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="toCdd" name="Issued to CDD" stroke="hsl(262 70% 58%)" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Balances */}
        <TabsContent value="balances" className="mt-4 space-y-4">
          {[
            { title: "State-level accountability ledger", rows: summary.byState.map((r) => ({ ...r, area: r.state, sub: "" })) },
            { title: "LGA-level accountability ledger", rows: summary.byLga.map((r) => ({ ...r, area: r.lga, sub: r.state })) },
            { title: "Medicine-level accountability ledger", rows: summary.byMedicine.map((r) => ({ ...r, area: medicineLabel(r.medicine), sub: "" })) },
          ].map((block) => (
            <Card key={block.title}>
              <CardHeader className="py-3 px-4 border-b bg-muted/40">
                <CardTitle className="text-sm font-semibold">{block.title}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[980px]">
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="whitespace-nowrap">Area</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Allocated</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Received</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Damaged</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Net usable</TableHead>
                        <TableHead className="whitespace-nowrap text-right">To FLHF</TableHead>
                        <TableHead className="whitespace-nowrap text-right">To CDD</TableHead>
                        <TableHead className="whitespace-nowrap text-right">LGA balance</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Facility balance</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Wastage</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Push rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {block.rows.length === 0 && (
                        <TableRow><TableCell colSpan={11} className="text-center text-xs text-muted-foreground py-6">No logistics data yet.</TableCell></TableRow>
                      )}
                      {block.rows.map((r, i) => (
                        <TableRow key={`${r.area}-${i}`}>
                          <TableCell className="text-xs font-medium align-top break-words">
                            {r.area}{r.sub && <div className="text-[11px] text-muted-foreground">{r.sub}</div>}
                          </TableCell>
                          <TableCell className="text-xs text-right">{r.allocated ? fmt(r.allocated) : "—"}</TableCell>
                          <TableCell className="text-xs text-right font-semibold">{fmt(r.received)}</TableCell>
                          <TableCell className="text-xs text-right text-destructive">{fmt(r.damaged)}</TableCell>
                          <TableCell className="text-xs text-right">{fmt(r.netUsable)}</TableCell>
                          <TableCell className="text-xs text-right">{fmt(r.issuedToFlhf)}</TableCell>
                          <TableCell className="text-xs text-right">{fmt(r.issuedToCdd)}</TableCell>
                          <TableCell className={`text-xs text-right font-semibold ${r.lgaBalance < 0 ? "text-destructive" : ""}`}>{fmt(r.lgaBalance)}</TableCell>
                          <TableCell className={`text-xs text-right font-semibold ${r.flhfBalance < 0 ? "text-destructive" : ""}`}>{fmt(r.flhfBalance)}</TableCell>
                          <TableCell className="text-xs text-right">
                            <Badge variant={r.wastageRate > 0.05 ? "destructive" : "secondary"} className="text-[10px]">{pctf(r.wastageRate)}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-right">{pctf(r.pushRate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Facilities */}
        <TabsContent value="facilities" className="mt-4">
          <Card>
            <CardHeader className="py-3 px-4 border-b bg-muted/40 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <PackageX className="h-4 w-4 text-destructive" /> Stockout vulnerability index — health facility stores
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {summary.stockoutIndex.atRisk} of {summary.stockoutIndex.facilities} facilities at risk
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="whitespace-nowrap">Health facility</TableHead>
                      <TableHead className="whitespace-nowrap">State</TableHead>
                      <TableHead className="whitespace-nowrap">LGA</TableHead>
                      <TableHead className="whitespace-nowrap">Ward</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Received</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Issued to CDDs</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Balance</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Cover</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap">Last activity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.facilities.length === 0 && (
                      <TableRow><TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-6">No facility distribution recorded yet.</TableCell></TableRow>
                    )}
                    {summary.facilities.slice(0, 300).map((f, i) => (
                      <TableRow key={`${f.facility}-${i}`}>
                        <TableCell className="text-xs font-medium align-top break-words max-w-[240px]">{f.facility}</TableCell>
                        <TableCell className="text-xs">{f.state || "—"}</TableCell>
                        <TableCell className="text-xs">{f.lga || "—"}</TableCell>
                        <TableCell className="text-xs">{f.ward || "—"}</TableCell>
                        <TableCell className="text-xs text-right">{fmt(f.received)}</TableCell>
                        <TableCell className="text-xs text-right">{fmt(f.issuedToCdd)}</TableCell>
                        <TableCell className={`text-xs text-right font-semibold ${f.balance <= 0 ? "text-destructive" : ""}`}>{fmt(f.balance)}</TableCell>
                        <TableCell className="text-xs text-right">{pctf(f.coverageRatio)}</TableCell>
                        <TableCell>
                          <Badge className="text-[10px] text-white" style={{ backgroundColor: STATUS_COLOR[f.status] }}>
                            {f.status === "stockout" ? <AlertTriangle className="h-3 w-3 mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                            {f.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">{f.lastActivity || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Batches */}
        <TabsContent value="batches" className="mt-4">
          <Card>
            <CardHeader className="py-3 px-4 border-b bg-muted/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" /> Batch traceability & expiry monitoring
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[1000px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="whitespace-nowrap">Batch / lot</TableHead>
                      <TableHead className="whitespace-nowrap">Medicine</TableHead>
                      <TableHead className="whitespace-nowrap">Held at</TableHead>
                      <TableHead className="whitespace-nowrap">Expiry</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Days left</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Received</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Damaged</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Dispatched</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Balance</TableHead>
                      <TableHead className="whitespace-nowrap">Facilities served</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.batches.length === 0 && (
                      <TableRow><TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-6">No batches logged yet.</TableCell></TableRow>
                    )}
                    {summary.batches.slice(0, 300).map((b, i) => (
                      <TableRow key={`${b.batch}-${i}`} className={b.status === "expired" ? "bg-destructive/5" : b.status === "critical" ? "bg-amber-50" : ""}>
                        <TableCell className="text-xs font-mono align-top break-words">{b.batch}</TableCell>
                        <TableCell className="text-xs align-top break-words">{medicineLabel(b.medicine)}</TableCell>
                        <TableCell className="text-xs align-top break-words">{[b.lga, b.state].filter(Boolean).join(", ") || "—"}</TableCell>
                        <TableCell className="text-xs">{b.expiry || "—"}</TableCell>
                        <TableCell className="text-xs text-right">
                          <Badge className="text-[10px] text-white" style={{ backgroundColor: STATUS_COLOR[b.status] }}>
                            {b.daysToExpiry === null ? "unknown" : b.daysToExpiry < 0 ? `${Math.abs(b.daysToExpiry)}d expired` : `${b.daysToExpiry}d`}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right">{fmt(b.received)}</TableCell>
                        <TableCell className="text-xs text-right text-destructive">{fmt(b.damaged)}</TableCell>
                        <TableCell className="text-xs text-right">{fmt(b.issued)}</TableCell>
                        <TableCell className="text-xs text-right font-semibold">{fmt(b.balance)}</TableCell>
                        <TableCell className="text-[11px] align-top break-words max-w-[220px]">
                          {b.facilities.length ? b.facilities.join(", ") : "Not yet dispatched"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lead time & POD */}
        <TabsContent value="leadtime" className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="py-3 px-4 border-b bg-muted/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Timer className="h-4 w-4 text-primary" /> Cascade lead time</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="whitespace-nowrap">Stage</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Avg days</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Median</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Slowest</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Observations</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.leadTimes.map((l) => (
                    <TableRow key={l.stage}>
                      <TableCell className="text-xs font-medium">{l.stage}</TableCell>
                      <TableCell className="text-xs text-right font-semibold">{l.avgDays !== null ? l.avgDays.toFixed(1) : "—"}</TableCell>
                      <TableCell className="text-xs text-right">{l.medianDays !== null ? l.medianDays.toFixed(1) : "—"}</TableCell>
                      <TableCell className="text-xs text-right">{l.slowest !== null ? l.slowest : "—"}</TableCell>
                      <TableCell className="text-xs text-right">{l.n}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="p-3 text-[11px] text-muted-foreground">
                State → LGA uses the dispatch date recorded with each allocation line; downstream stages track each batch
                from first receipt to first onward issue.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4 border-b bg-muted/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-primary" /> Proof-of-delivery compliance</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {[
                { label: "Level 1 — waybill photo / EDO signature", v: summary.podCompliance.l1, n: summary.podCompliance.l1n },
                { label: "Level 2 — facility in-charge signature", v: summary.podCompliance.l2, n: summary.podCompliance.l2n },
                { label: "Level 3 — CDD receipt photo", v: summary.podCompliance.l3, n: summary.podCompliance.l3n },
              ].map((r) => (
                <div key={r.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{r.label}</span>
                    <span className="text-muted-foreground">{pctf(r.v)} of {r.n} transactions</span>
                  </div>
                  <Progress value={r.v * 100} className="h-2" />
                </div>
              ))}
              <div className="rounded-md border bg-muted/30 p-3 text-[11px] text-muted-foreground">
                Compliance counts a transaction as verified when it carries at least one electronic proof — waybill image,
                acknowledgment signature or CDD receipt photo — attached to that specific tier of the cascade.
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="py-3 px-4 border-b bg-muted/40">
              <CardTitle className="text-sm font-semibold">Downstream push rate by LGA</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.byLga.slice(0, 20).map((r) => ({ name: r.lga, push: Number((r.pushRate * 100).toFixed(1)) }))}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                    <YAxis unit="%" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => `${v}%`} />
                    <Bar dataKey="push" name="Pushed to facilities" radius={[4, 4, 0, 0]}>
                      {summary.byLga.slice(0, 20).map((r, i) => (
                        <Cell key={i} fill={r.pushRate >= 0.8 ? STATUS_COLOR.healthy : r.pushRate >= 0.5 ? STATUS_COLOR.low : STATUS_COLOR.stockout} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="supply" className="mt-4">
          <SupplyIntegrityPanel
            integrity={integrity}
            expiryWindow={expiryWindow}
            onExpiryWindow={setExpiryWindow}
            kickoff={kickoff}
            onKickoff={setKickoff}
          />
        </TabsContent>

        <TabsContent value="integrity" className="mt-4">

          <ChecklistReconciliation cache={checklistCache} canExport={canExport} />
        </TabsContent>
      </Tabs>

      <MedicineKoboConnectDialog open={openConnect} onOpenChange={setOpenConnect} onSynced={() => setCache(loadMedLogCache())} />
      <MedicineAllocationDialog
        open={openAlloc} onOpenChange={setOpenAlloc}
        allocations={allocations} states={states} lgas={lgas} onSave={persistAllocations}
      />
    </div>
  );
}
